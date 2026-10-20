// What counts as an event, who has asked to hear about it, and how loud it is.
//
// Split out of app/api/dash/push/tick so the three decisions that actually
// matter -- "is this a thing worth waking someone for", "did this person ask
// for it" and "does it outrank what else happened this minute" -- are pure
// functions over data, testable without a database, a cron secret, or a live
// league feed. The route keeps the I/O and nothing else.
//
// An EVENT is:
//   key        what makes it the same event across cron runs. MUST carry the
//              count where there is one: a second homer by the same man
//              tonight is a different event, and `hr:2` says so where `hr`
//              alone would swallow it.
//   category   a key in lib/dash/alerts.js CATEGORIES -- the switch the user
//              actually sees.
//   sport      namespaces the follow-list lookup, so an MLB id and an NFL id
//              that happen to look alike can never cross.
//   priority   0 is the thing the person followed that player FOR and is never
//              held, bundled behind anything, or dropped. See the sender.
//   title/body what lands. Title carries the news; the OS already printed the
//              app name above it, so DASH does not appear there again.
//   short/group how it reads inside a bundle: the name alone, and the verb the
//              count attaches to ("5 went deep").
//   brand      the wordmark a bundle falls back to when it collapses many.
// NOT HERE YET: "he is not in tonight's lineup". The posted lineups say who
// IS playing; proving a followed man is ABSENT means knowing which game to
// expect him in, and that mapping lives on the published board, which this
// sender does not read. The confirmation half ships now; the scratch half
// waits for the board join rather than guessing from a team abbreviation.
//
//   playerId / playerName
//              how it ties to a followed player. MLB has real ids; the ESPN
//              box score has no gsis id, so football matches on name.
//
// AUDIENCE. Every per-player producer takes the set of players SOMEBODY with a
// live subscription actually follows, and produces nothing for anyone else.
// Without it a fifteen-game slate manufactures several hundred lineup events a
// minute that are then thrown away one row at a time in the dedupe table. The
// only producer that ignores it is the slate homer, which is by definition not
// about your names.

import { SPORT_KEYS, playerHref, watchHash, appHref, binderHref } from '../routes'
import { momentsForEvent } from '../cards/momentEvents'
import { pushText as goalPushText, periodWord, scoreAfter } from '../nhl/goalFeed'
import { normName } from '../nfl/oddsMatch'
import { callStatus, STATUS_WORD, isCalledRole } from '../callStatus'
import { foldsOn } from './pushFolds'
import { TEAM_ABBR } from './homerFeed'
import { indexEntries, injuryVerdict } from '../injuries/lookup'
import { mlb as mlbCopy, nfl as nflCopy, nhl as nhlCopy, nba as nbaCopy, cards as cardCopy, timeET, categoryAllowed } from '../copy/notifications'
import { categoryOn, topBar } from './pushBrake'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

const txt = (v) => String(v == null ? '' : v).trim()

// ── A FOLLOWED NAME, NORMALISED (2026-09-27, NOTIF-6) ─────────────────────
// Football follows match on NAME -- the ESPN box score carries ESPN ids, the
// site's are nflverse gsis, and there is no crosswalk in the payload
// (lib/nfl/liveSlate.js). The match was lower-cased equality, so "D.J. Moore"
// followed from the board and "DJ Moore" in the box score (or a "Jr.", an
// accent, "St." vs "St") silently meant no touchdown alert. This key is
// normName() -- the NFL normaliser, kept identical to the bot's norm_name(),
// so it is not edited here -- plus one step: a run of single letters is one
// token ("d j moore" -> "dj moore"). Lower-cased equality implies equal keys,
// so this only ever adds matches.
export function followNameKey(s) {
  const out = []
  let initials = ''
  for (const p of normName(s).split(' ').filter(Boolean)) {
    if (p.length === 1) { initials += p; continue }
    if (initials) { out.push(initials); initials = '' }
    out.push(p)
  }
  if (initials) out.push(initials)
  return out.join(' ')
}

// ── THE GAME'S OWN DAY IS THE KEY (2026-09-24 audit, TZ-1) ────────────────
// Every dedupe key below used to carry the wall-clock Eastern day the sweep
// ran on. A 7:10pm PT game is still Live when ET midnight passes, and the
// next sweep re-keyed every homer / hit / clutch spot already sent under
// D+1 -- a second P0 push for the same swing. homers/tick fixed exactly this
// for the feed (slateDayOf; its comment names the CJ Abrams 09-06/07
// double-tweet); the push sweep never got it. So: an in-game event is keyed
// on the game's own date (MLB: the schedule's gameDate; NFL: the kickoff's
// Eastern calendar day), and `day` is only the fallback when a game has no
// date at all. Pregame board / last-call keys stay on `day` on purpose --
// they are about the slate, not a game.
function ET_DAY(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ms))
  } catch {
    return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10)
  }
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const mlbDayOf = (g, day) => (ISO_DAY.test(String(g?.gameDate || '')) ? String(g.gameDate) : day)
const nflDayOf = (g, day) => {
  const t = Date.parse(String(g?.kickoff || ''))
  return Number.isFinite(t) ? ET_DAY(t) : day
}

/** Last name, for a title with about thirty characters to spend. */
export function lastName(full) {
  const parts = txt(full).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Your guy'
  if (parts.length === 1) return parts[0]
  const tail = parts.slice(1).filter((p) => !/^(jr\.?|sr\.?|i{2,3}|iv|v)$/i.test(p))
  return (tail.length ? tail : parts.slice(1)).join(' ')
}

export const priorityOf = (e) => (Number.isFinite(e?.priority) ? e.priority : 3)

/**
 * Which throttle lane an event rides (2026-09-14, notification audit).
 *   'urgent'     priority 0 -- never held, never bundled behind anything
 *   'actionable' priority 1 -- the board, a lineup change, the spot to walk
 *                to a television for: one bundle per 10 minutes per device
 *   'scoreboard' priority 2+ -- what already happened: one per 30 minutes
 * One shared quiet slot used to let a multihit take the window from a
 * dropout. Two lanes means the scoreboard can never crowd out the news.
 */
// ONCE-A-NIGHT NEWS IS NEVER DROPPED (2026-09-24 audit, NOTIF-1). The
// actionable lane is one bundle per ten minutes per device, and an event that
// loses the slot is already claimed in dash_push_seen -- it is logged
// `dropped` and never retried. For an on-deck or clutch spot that is the right
// trade: the moment passes. For the board going up, last call, or your man
// dropped from the card, it is not: those fire once, they are the whole point
// of the pregame channel, and an on-deck spot three minutes earlier was
// silencing them for good. They ride urgent -- still bundled with anything
// else urgent in the same sweep, never held behind the window.
// 2026-10-13: the bar-cleared push, the nightly recap, the receipts, lineups-are-in, puck drop and the injury change are one-a-night or one-a-game news; the lane
// windows must not eat them (barcleared lost 52 of 69 to the 30-minute window before). The BRAKE on volume is the daily cap (lib/dash/pushBrake.js), not the window.
// The old keys (hrr, multihit, bigbases, finalline) stay listed: a saved switch still resolves, and no producer sends them any more.
const NEVER_DROP = new Set(['boardup', 'lastcall', 'dropout', 'finalline', 'hrr', 'bigbases', 'multihit', 'starter', 'cardearned',
  'barcleared', 'recap', 'callsgraded', 'weekly', 'lineupin', 'puckdrop', 'nflinj',
  // 2026-10-13 (push parity): one note per man per game, or per game: claimed once in dash_push_seen and never retried, so the lane windows must not eat them. Volume is the
  // daily soft cap's job (lib/dash/pushBrake.js: none of these is in URGENT_CATEGORIES, so each counts against the 8).
  'nflmulti', 'nflfinal', 'nhlmulti', 'nhlfinal', 'nhlinj', 'nbafinal', 'nbainj'])

export const laneOf = (e) => {
  const p = priorityOf(e)
  if (p === 0 || NEVER_DROP.has(String(e?.category || ''))) return 'urgent'
  return p === 1 ? 'actionable' : 'scoreboard'
}

const MLB_URL = '/app#sport=mlb&tab=home'
const NFL_URL = '/app#sport=nfl&tab=watchlist'

// ── A NOTIFICATION ABOUT A MAN OPENS THAT MAN (2026-09-03) ─────────────────
//
// Donovan, on tapping a Jordan Walker homer from the iPhone lock screen: "it
// just took me to the moonshot homepage instead of either the live plate
// appearance so we can see the spray chart of the home run, or just the
// player card."
//
// He was right and the cause was one line: every MLB event carried the same
// board URL, so fourteen different alerts about eleven different players all
// landed on Home and left you to find him yourself. The board is the WORST
// possible destination for a message that already named somebody.
//
// `#p=<id>` has been a real address since 2026-08-08 -- Dashboard opens the
// player card off it. What was missing was anything putting the id in the
// URL. Now every per-player event does.
//
// `&view=spray` on the two events whose news IS the batted ball. A homer
// notification that opens the 3D spray with tonight's ball on it is the thing
// he actually wanted to see; an on-deck notification that did the same would
// be showing him history when he asked about the next thirty seconds. So:
// spray for the homer and the extra-base hit, the card's own default tab for
// everything else.
const mlbPlayerUrl = (id, view) => {
  const pid = String(id == null ? '' : id).trim()
  if (!pid) return MLB_URL
  return `/app#sport=mlb&p=${encodeURIComponent(pid)}${view ? `&view=${view}` : ''}`
}

/**
 * Which of the watchlist's own bars this line has cleared.
 *
 * These are the bars lib/watchLedger.js grades a night on, and they are
 * objective -- they need no pick, no role and no published board, which is
 * exactly why they can be computed here and the bot's own category bars
 * cannot. "Cashed" in a notification means one of these, and nothing else.
 *
 * Capped at three and de-overlapped on the way out: a home run implies the
 * XBH, two hits imply the hit, and a body that reads
 * "HR - hit - XBH - multi-hit - HRR - 2TB" is a wall, not news.
 */
export function barsCleared(line) {
  const h = num(line?.h)
  const out = []
  if (num(line?.hr) >= 1) out.push('HR')
  else if (num(line?.d2) + num(line?.d3) >= 1) out.push('XBH')
  if (h >= 2) out.push('multi-hit')
  if (h + num(line?.r) + num(line?.rbi) >= 2) out.push('HRR')
  if (!out.length && h >= 1) out.push('hit')
  if (!out.length && num(line?.tb) >= 2) out.push('2TB')
  return out.slice(0, 3)
}

const mlbEvent = (e) => ({ sport: 'mlb', url: MLB_URL, ...e })
const nflEvent = (e) => ({ sport: 'nfl', url: NFL_URL, ...e })

/** A live game as the copy wants it: club abbreviations (the snapshot carries ids), score, half and inning. */
const gameView = (g) => (g ? {
  away: TEAM_ABBR[g.awayId] || '', home: TEAM_ABBR[g.homeId] || '',
  awayScore: g.awayScore, homeScore: g.homeScore, half: g.half, inning: g.inning,
} : null)
/** Everyone on a posted card, as a Set of player ids. */
const lineupIds = (g) => new Set(['home', 'away'].flatMap((s) => (g?.lineup?.[s] || []).map((x) => txt(x?.id))))

const follows = (audience, id) => !audience || !audience.mlb || audience.mlb.has(String(id))
const followsNfl = (audience, name) => !audience || !audience.nfl || audience.nfl.has(followNameKey(name))

// ── MOONSHOT ───────────────────────────────────────────────────────────────

/**
 * Everything worth saying about tonight's baseball, from one snapshot.
 *
 * Stateless by construction: every event key carries the counter that produced
 * it, so "he now has two hits" is a different key from "he now has three" and
 * neither needs a memory of the last tick. The sender's dedupe table does the
 * remembering, and it is the only thing that does.
 */
/**
 * @param lineupState  optional: { [playerId]: { teamId, name, lastSeenDay } },
 *                     the one piece of cross-night memory this function
 *                     needs but cannot keep itself -- see the DROP-OUT
 *                     section below and lineupUpdatesFrom(), which produces
 *                     the rows the route writes back after each tick.
 *                     Omit it (or pass {}) and everything else here is
 *                     unaffected -- only drop-out detection goes quiet.
 */
/**
 * @param board  optional: boardInfoFrom(rows) for TONIGHT's published board --
 *               { ids: Set<player_id>, of: Map<player_id, {rank, score, role}> }.
 *               Two uses, both additive: dropout stays quiet for a man the
 *               board already covers (scratched owns him), and the slate homer
 *               can say whether the man who went deep was ON the board and
 *               where. Omit it and both fall back to what they did before.
 */
export function mlbEventsFrom(snap, day, audience, lineupState, board) {
  if (!snap) return []
  const out = []
  const games = Array.isArray(snap.games) ? snap.games : []
  const lines = snap.lines && typeof snap.lines === 'object' ? snap.lines : {}
  const gameOf = new Map(games.map((g) => [Number(g.pk), g]))
  // CALLED / ON THE BOARD / NOT ON THE BOARD for a man on tonight's board:
  // lib/callStatus.js decides, never this file.
  const statusOf = (id) => {
    const hit = board?.of?.get(String(id))
    if (!hit) return null
    return callStatus({ role: hit.role, board_rank: hit.rank, board_of: board.ids.size })
  }

  // The status word a homer carries, the way NHL goals do (lib/callStatus.js decides, never this file): CALLED, or ON THE BOARD (with his place), or
  // NOT ON THE BOARD once tonight's board is known. No board yet = no word (never a guess).
  const homerStatus = (id) => {
    const hit = board?.of?.get(String(id))
    if (hit) { const st = statusOf(id); return st === 'called' ? { called: true } : { status: st, rank: hit.rank } }
    return board?.ids?.size ? { status: 'off' } : {}
  }

  // ── BEFORE FIRST PITCH: the only alerts you can still act on ─────────────
  for (const g of games) {
    if (!g?.lineupPosted) continue
    for (const side of ['home', 'away']) {
      for (const row of (g.lineup?.[side] || [])) {
        const id = txt(row?.id)
        if (!id || !follows(audience, id)) continue
        const name = txt(row?.name)
        out.push(mlbEvent({
          key: `mlb:${mlbDayOf(g, day)}:${id}:lineup:${num(row?.slot) || 0}`,
          category: 'lineup', priority: 1, url: mlbPlayerUrl(id),
          ...mlbCopy.lineup({ name, slot: num(row?.slot) }),
          playerId: id,
        }))

        // LINEUPS ARE IN (2026-10-13): a followed man who is NOT on tonight's board is in a posted lineup, before the game starts. The board men have their own
        // push (boardup counts them), so the board must be known and he must not be on it. One per man per game: the key carries the game.
        if (g.state === 'Preview' && board?.ids?.size && !board.ids.has(id)) {
          out.push(mlbEvent({
            key: `mlb:${mlbDayOf(g, day)}:${id}:lineupin:${g.pk}`,
            category: 'lineupin', priority: 1, url: mlbPlayerUrl(id),
            ...mlbCopy.lineupIn({ name, slot: num(row?.slot), away: TEAM_ABBR[g.awayId] || '', home: TEAM_ABBR[g.homeId] || '' }),
            playerId: id,
          }))
        }

        // CALL-UP / FIRST LINEUP EVER: a man with no dash_lineup_state row has
        // never been seen in a posted lineup (the row is never pruned; the
        // seen-table is, every two days). Needs lineupState to fire at all.
        if (lineupState && !lineupState[id]) {
          out.push(mlbEvent({
            key: `mlb:everlineup:${id}`,
            category: 'callup', priority: 1, url: mlbPlayerUrl(id),
            ...mlbCopy.callup({ name, slot: num(row?.slot) }),
            playerId: id,
          }))
        }
      }
    }
  }

  // ── DROPPED FROM THE LINEUP (a followed man, board or no board) ──────────
  // Fires only when his team is ACTUALLY PLAYING tonight with a POSTED lineup
  // and he is not on it. A man on tonight's board is `scratched`'s business.
  if (lineupState) {
    for (const [id, seen] of Object.entries(lineupState)) {
      if (!follows(audience, id) || seen?.teamId == null) continue
      const g = games.find((x) => Number(x?.homeId) === Number(seen.teamId) || Number(x?.awayId) === Number(seen.teamId))
      if (!g?.lineupPosted) continue
      const listed = new Set(['home', 'away'].flatMap((s) => (g.lineup?.[s] || []).map((x) => txt(x?.id))))
      if (listed.has(id)) continue
      if (board?.ids?.has(id)) continue
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:dropout`,
        category: 'dropout', priority: 1, url: mlbPlayerUrl(id),
        ...mlbCopy.lineupChange({ name: txt(seen.name) }),
        playerId: id,
      }))
    }
  }

  // ── FIRST PITCH (cut; kept behind PUSH_CUT_CATEGORIES) ───────────────────
  for (const g of games) {
    if (g?.state !== 'Live') continue
    const mine = ['home', 'away']
      .flatMap((s) => (g.lineup?.[s] || []))
      .filter((r) => follows(audience, txt(r?.id)))
    if (!mine.length) continue
    out.push(mlbEvent({
      key: `mlb:${mlbDayOf(g, day)}:${g.pk}:firstpitch`,
      category: 'firstpitch', priority: 3,
      url: mine.length === 1 ? mlbPlayerUrl(txt(mine[0]?.id)) : MLB_URL,
      playerIds: mine.map((r) => txt(r?.id)),
      ...mlbCopy.underway({ names: mine.map((r) => txt(r?.name)) }),
    }))
  }

  // ── IN GAME ──────────────────────────────────────────────────────────────
  for (const [id, line] of Object.entries(lines)) {
    if (!follows(audience, id)) continue
    const g = gameOf.get(Number(line?.pk))
    const gv = gameView(g)
    const name = txt(line?.name) || 'Your player'
    const hr = num(line?.hr)
    const h = num(line?.h)
    const ab = num(line?.ab)
    const xbh = num(line?.d2) + num(line?.d3)
    const k = num(line?.k)

    if (hr >= 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:hr:${hr}`,
        category: 'homer', priority: 0, url: mlbPlayerUrl(id, 'spray'),
        ...mlbCopy.homer({ name, n: hr, line, game: gv, ...homerStatus(id) }),
        playerId: id,
      }))
    }
    // ONE BAR-CLEARED PUSH PER HITTER PER NIGHT (2026-10-13, the brake): hrr + multihit + bigbases were three pushes (and a fourth, finalline) about the same
    // man's night. Now the highest bar he has cleared, said once; the key is the night, so a later, higher bar adds nothing the box score will not show.
    const bar = topBar(line)
    if (bar) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:bar`,
        category: 'barcleared', priority: 2, url: mlbPlayerUrl(id),
        ...mlbCopy.barCleared({ name, bar, line, game: gv }),
        playerId: id,
      }))
    }
    if (xbh >= 1 && hr < 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:xbh:${xbh}`,
        category: 'xbh', priority: 2, url: mlbPlayerUrl(id, 'spray'),
        ...mlbCopy.extraBases({ name, triple: Boolean(num(line?.d3)), line, game: gv }),
        playerId: id,
      }))
    }
    if (k >= 2 && h === 0 && ab >= 2) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:cold`,
        category: 'cold', priority: 3, url: mlbPlayerUrl(id),
        ...mlbCopy.coldStart({ name, ab, k, game: gv }),
        playerId: id,
      }))
    }
  }

  // ── THE SPOT: BASES LOADED AND HE IS UP (replaced ON DECK, 2026-10-09) ───
  // ON DECK fired twice per plate appearance and was cut; this one fires once
  // per at-bat, priority 0. ON DECK is still built (category `ondeck`) behind
  // PUSH_CUT_CATEGORIES=on.
  for (const g of games) {
    if (g?.state !== 'Live') continue
    const outs = num(g?.outs)
    const on = [g?.on1, g?.on2, g?.on3].filter(Boolean).length
    const margin = Math.abs(num(g?.homeScore) - num(g?.awayScore))
    const late = num(g?.inning) >= 7
    const gv = gameView(g)
    // `outs` is the gate that says linescore detail is flowing (lib/liveSlate.js).
    const loaded = g?.outs != null && !!g?.on1 && !!g?.on2 && !!g?.on3

    const deckId = txt(g?.onDeck)
    if (deckId && follows(audience, deckId)) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${deckId}:deck:${g.pk}:${num(g?.inning)}`,
        category: 'ondeck', priority: 1, url: mlbPlayerUrl(deckId),
        ...mlbCopy.onDeck({ name: txt(g?.onDeckName) || 'Your player', outs, on, loaded, game: gv }),
        playerId: deckId,
      }))
    }

    const upId = txt(g?.upBatter)
    if (upId && follows(audience, upId) && late && margin <= 3 && on >= 1 && !loaded) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${upId}:clutch:${g.pk}:${num(g?.inning)}:${outs}:${on}`,
        category: 'clutch', priority: 1, url: mlbPlayerUrl(upId),
        ...mlbCopy.clutch({ name: txt(g?.upBatterName) || 'Your player', on, outs, game: gv }),
        playerId: upId,
      }))
    }

    // One per at-bat: he stays at the plate across several ticks with the same inning and out count.
    if (loaded && upId && follows(audience, upId)) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${upId}:slam:${g.pk}:${num(g?.inning)}:${outs}`,
        category: 'slam', priority: 0, url: mlbPlayerUrl(upId),
        ...mlbCopy.basesLoaded({ name: txt(g?.upBatterName) || 'Your player', outs, game: gv }),
        playerId: upId,
      }))
    }
  }

  // ── THE SCORE, IN A GAME YOU HAVE SOMEBODY IN (cut; behind the flag) ─────
  for (const g of games) {
    if (g?.state !== 'Live' && g?.state !== 'Final') continue
    const mineHome = (g.lineup?.home || []).filter((r) => follows(audience, txt(r?.id)))
    const mineAway = (g.lineup?.away || []).filter((r) => follows(audience, txt(r?.id)))
    const rows = [...mineHome, ...mineAway]
    if (!rows.length) continue
    const who = rows.map((r) => lastName(r?.name))
    const whose = who.length === 1 ? who[0] : `${who.slice(0, 2).join(' and ')}`
    const ids = rows.map((r) => txt(r?.id))
    const gv = gameView(g)

    if (g.state === 'Live' && num(g?.inning) >= 7 && Math.abs(num(g?.homeScore) - num(g?.awayScore)) <= 3) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${g.pk}:score:${num(g?.homeScore)}-${num(g?.awayScore)}`,
        category: 'leadchg', priority: 2, playerIds: ids,
        ...mlbCopy.scoreSwing({ whose, game: { ...gv, half: g.half, inning: g.inning }, outs: g?.outs != null ? num(g.outs) : null }),
      }))
    }
    // `settled` excludes postponed and suspended: a game that STOPPED did not finish.
    if (g.settled) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${g.pk}:final`,
        category: 'gamefinal', priority: 3, playerIds: ids,
        ...mlbCopy.gameFinal({ whose, game: gv, names: rows.map((r) => lastName(r?.name)) }),
      }))
    }
  }

  // ── ANYONE, NOT JUST YOURS (cut; behind the flag) ────────────────────────
  for (const [id, line] of Object.entries(lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    if (audience?.mlb?.has(String(id))) continue
    const g = gameOf.get(Number(line?.pk))
    const hit = board?.of?.get(String(id))
    const known = Boolean(board?.ids?.size)
    const st = hit ? statusOf(id) : known ? 'off' : null
    out.push(mlbEvent({
      key: `mlb:${mlbDayOf(g, day)}:${id}:anyhr:${hr}`,
      category: 'slate', priority: 4, url: mlbPlayerUrl(id, 'spray'),
      ...mlbCopy.slateHomer({ name: txt(line?.name) || 'A hitter', n: hr, status: st ? STATUS_WORD[st] : '', rank: hit?.rank, line }),
      playerId: id, everyone: true, boardHit: Boolean(hit),
    }))
  }

  return out
}

/**
 * Tonight's board, reduced to what the sender needs to say "he was on it,
 * at #N". Rank is by hr_score, descending, over the rows given; pass the
 * trimmed rows from lib/dash/board.js (or the day snapshot the route keeps
 * of them) and get back { ids, of }. Empty/null rows give an empty board,
 * which every consumer treats as "unknown", never as "nobody was on it".
 */
export function boardInfoFrom(rows) {
  const ids = new Set()
  const of = new Map()
  if (!Array.isArray(rows) || !rows.length) return { ids, of }
  const sorted = rows
    .filter((r) => txt(r?.player_id))
    .sort((a, b) => num(b?.hr_score) - num(a?.hr_score))
  sorted.forEach((r, i) => {
    const id = txt(r.player_id)
    if (ids.has(id)) return
    ids.add(id)
    const role = txt(r?.game_pick_role).toUpperCase()
    of.set(id, { rank: i + 1, score: Math.round(num(r?.hr_score)), role: role && role !== 'NONE' ? role : '' })
  })
  return { ids, of }
}

/**
 * The rows to upsert into dash_lineup_state after this tick, one per
 * followed player who is in tonight's POSTED lineup: "the last team we saw
 * you start for, and when." Kept out of mlbEventsFrom on purpose -- that
 * function stays pure and testable without a database, and this is the one
 * write DASH's push side needs to make, so it gets its own small, obviously
 * side-effect-only function instead of smuggling I/O into the event rules.
 *
 * The route calls this once per tick, right alongside mlbEventsFrom, and
 * upserts what comes back; next tick's (or next night's) mlbEventsFrom call
 * reads it back in as `lineupState` to check for drop-outs.
 */
export function lineupUpdatesFrom(snap, day, audience) {
  if (!snap) return []
  const games = Array.isArray(snap.games) ? snap.games : []
  const out = []
  for (const g of games) {
    if (!g?.lineupPosted) continue
    for (const side of ['home', 'away']) {
      const teamId = side === 'home' ? g.homeId : g.awayId
      if (teamId == null) continue
      for (const row of (g.lineup?.[side] || [])) {
        const id = txt(row?.id)
        if (!id || !follows(audience, id)) continue
        out.push({ player_id: id, team_id: Number(teamId), name: txt(row?.name), last_seen_day: day })
      }
    }
  }
  return out
}

// ── TUDDY ──────────────────────────────────────────────────────────────────

/** Touchdowns, big days, kickoffs and finals in the live box scores. */
export function nflEventsFrom(snap, day, audience, board = null, ids = null) {
  const out = []
  // A player's own alert opens his TUDDY card when the slate knows his id
  // (push tick tuddyIdsFor); otherwise the Watchlist, as before.
  const urlFor = (name) => { const id = ids?.get?.(followNameKey(name)); return id ? playerHref('nfl', id) : NFL_URL }
  const games = Array.isArray(snap?.games) ? snap.games : []
  const lines = snap?.lines?.values ? [...snap.lines.values()] : []

  for (const g of games) {
    if (g?.state !== 'in') continue
    // THE ROOM'S RED ZONE: THE TUDDY BOARD, NOT A FOLLOW LIST (cut for phones).
    if (board?.size && g.redZone === true && g.possession) {
      const onBoard = lines
        .filter((l) => l?.game_id === g.game_id && txt(l?.team).toUpperCase() === txt(g.possession).toUpperCase() && board.has(followNameKey(l?.name)))
        .map((l) => ({ l, b: board.get(followNameKey(l?.name)) }))
        .sort((a, b) => a.b.rank - b.b.rank)
      if (onBoard.length) {
        const top = onBoard.slice(0, 2)
        out.push(nflEvent({
          key: `nfl:${nflDayOf(g, day)}:${g.game_id}:redboard:${txt(g.possession)}:${num(g.period)}`,
          category: 'nflboardred', priority: 4, everyone: true, boardHit: true,
          ...nflCopy.boardRedZone({ team: txt(g.possession), men: top.map(({ l, b }) => ({ name: txt(l?.name), rank: b.rank, called: b.status === 'called' })), down: txt(g.downDistance), clock: txt(g.clock), game: g }),
        }))
      }
    }
    const mine = lines.filter((l) => l?.game_id === g.game_id && followsNfl(audience, l?.name))
    if (!mine.length) continue
    out.push(nflEvent({
      key: `nfl:${nflDayOf(g, day)}:${g.game_id}:kick`,
      category: 'nflkick', priority: 0,
      playerNames: mine.map((l) => txt(l?.name)),
      ...nflCopy.kickoff({ away: txt(g.away), home: txt(g.home), count: mine.length }),
    }))
    // ONE RED-ZONE ALERT PER TEAM PER QUARTER, not per play (cut for phones).
    if (g.redZone === true && g.possession) {
      const threatening = mine.filter((l) => txt(l?.team).toUpperCase() === txt(g.possession).toUpperCase())
      if (threatening.length) {
        out.push(nflEvent({
          key: `nfl:${nflDayOf(g, day)}:${g.game_id}:red:${txt(g.possession)}:${num(g.period)}`,
          category: 'nflred', priority: 0,
          playerNames: threatening.map((l) => txt(l?.name)),
          ...nflCopy.redZone({ team: txt(g.possession), names: threatening.map((l) => txt(l?.name)), down: txt(g.downDistance), clock: txt(g.clock), game: g }),
        }))
      }
    }

    const margin = Math.abs(num(g.home_score) - num(g.away_score))
    if (num(g.period) >= 4 && margin <= 8) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${g.game_id}:close:${g.period}`,
        category: 'nflclose', priority: 2,
        playerNames: mine.map((l) => txt(l?.name)),
        ...nflCopy.oneScore({ away: txt(g.away), home: txt(g.home), game: g, clock: txt(g.clock) }),
      }))
    }
  }

  for (const line of lines) {
    const name = txt(line?.name)
    // ANY CALLED TOUCHDOWN (2026-10-13, TUDDY twin of nhlcalled): a player the TUDDY board CALLED scores, followed or not. `board` is the same map lib/callStatus words
    // (status 'called'), handed in only when someone has the switch on. Its own key (`:called`) so it can never swallow the follower's P0; everyone: true, off by default.
    const gc = games.find((x) => x?.game_id === line?.game_id)
    const scored = num(line?.receiving_tds) + num(line?.rushing_tds)
    if (scored >= 1 && board?.get?.(followNameKey(name))?.status === 'called') {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(gc, day)}:${name}:td:${scored}:called`,
        category: 'nflcalled', priority: 4, everyone: true, url: urlFor(name),
        ...nflCopy.touchdown({ name, tds: scored, line, game: gc, called: true }),
        group: 'CALLED players scored',
        playerName: name,
      }))
    }
    if (!followsNfl(audience, name)) continue
    const g = gc
    // Scoring touchdowns are rushing + receiving (what the anytime-TD market asks);
    // a passing touchdown is counted from passing_tds and said as a throw.
    const tds = scored
    const ptds = num(line?.passing_tds)
    const rec = num(line?.receiving_yards)
    const rush = num(line?.rushing_yards)
    const pass = num(line?.passing_yards)

    if (tds >= 1) {
      const st = board?.get?.(followNameKey(name))?.status
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:td:${tds}`,
        category: 'nfltd', priority: 0, url: urlFor(name),
        ...nflCopy.touchdown({ name, tds, line, game: g, called: st === 'called' }),
        playerName: name,
      }))
    }
    if (ptds >= 1) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:ptd:${ptds}`,
        category: 'nfltd', priority: 0, url: urlFor(name),
        ...nflCopy.passingTouchdown({ name, tds: ptds, line, game: g }),
        playerName: name,
      }))
    }
    // A MULTI-TD GAME (2026-10-13): two scoring touchdowns, or three thrown, ONE note per man per game (no count in the key on purpose: the third is not a second note).
    if (tds >= 2 || ptds >= 3) {
      const passing = !(tds >= 2)
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:multitd`,
        category: 'nflmulti', priority: 2, url: urlFor(name),
        ...nflCopy.multiTouchdown({ name, tds: passing ? ptds : tds, passing, game: g }),
        playerName: name,
      }))
    }
    const big = rec >= 100 ? ['rec', rec] : rush >= 100 ? ['rush', rush] : pass >= 300 ? ['pass', pass] : null
    if (big) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:big:${big[0]}:${Math.floor(big[1] / 50) * 50}`,
        category: 'nflbig', priority: 2, url: urlFor(name),
        ...nflCopy.bigDay({ name, yds: big[1], kind: big[0], line, game: g }),
        playerName: name,
      }))
    }
  }

  return out
}

// ── LAMP ───────────────────────────────────────────────────────────────────

/**
 * A goal, from the confirmed rows of lamp_goal_feed (app/api/lamp/goals/tick
 * writes them; the route here reads confirmed, standing, push_sent=false
 * rows). The row is frozen, so the words are too: status is the lock's
 * (lamp_goal_log), day is the game's own date.
 *
 *   nhlgoal    a followed skater scores. P0, on by default.
 *   nhlcalled  any CALLED skater scores -- hockey's `slate`: everyone, off by
 *              default, priority 4, its own key (`:called`) so the claim
 *              table can't let it swallow the follower's P0.
 * Preseason, unconfirmed and overturned rows never make an event.
 *
 * @param rows      lamp_goal_feed rows not yet swept
 * @param audience  audienceFrom(): audience.nhl is the followed ids
 * @param context   the standing rows of those games, for "2nd tonight"
 */
export function nhlEventsFrom(rows, audience, context = rows) {
  const out = []
  const list = Array.isArray(rows) ? rows : []
  const multi = new Set()   // one multi-goal note per man per game, even when his 2nd and 3rd arrive in the same sweep
  for (const r of list) {
    if (!r?.confirmed_at || r.overturned_at || r.push_sent || Number(r.game_type) === 1) continue
    const id = txt(r.player_id)
    const words = goalPushText(r, context)
    const base = { sport: 'nhl', url: playerHref('nhl', id), playerId: id, ...words }
    if (!audience || !audience.nhl || audience.nhl.has(id)) {
      out.push({ ...base, key: `nhl:${r.day}:${id}:goal:${r.goal_n}`, category: 'nhlgoal', priority: 0 })
      // nhlmulti (2026-10-13): his second goal tonight. The key has no count, so the third goal (the hat trick is the card push) is not a second note.
      const mk = `nhl:${r.day}:${id}:multigoal:${r.game_id}`
      if (Number(r.goal_n) >= 2 && !multi.has(mk)) {
        multi.add(mk)
        out.push({
          sport: 'nhl', url: playerHref('nhl', id), playerId: id, key: mk, category: 'nhlmulti', priority: 2,
          ...nhlCopy.multiGoal({ name: txt(r.name), goals: Number(r.goal_n), period: periodWord(r), score: scoreAfter(r) }),
        })
      }
    }
    if (r.status === 'called') {
      out.push({ ...base, key: `nhl:${r.day}:${id}:goal:${r.goal_n}:called`, category: 'nhlcalled', priority: 4, everyone: true, group: 'CALLED skaters scored' })
    }
  }
  return out
}

// ── A CARD A FOLLOWED PLAYER EARNED (the Binder, 2026-10-12) ────────────────
/**
 * cardearned: a followed player earned a STAR / ELITE / LEGEND special card (lib/cards/moments.js, decided by the ONE shared rule
 * lib/cards/momentEvents.js momentsForEvent). Never a BASE card. One event per card, keyed `card:<moment>:<id>` so a sweep that sees the
 * same rows again claims nothing new. P1 and never dropped (laneOf: NEVER_DROP); quiet hours, caps, the sport list and the opt-out are the
 * sender's, exactly as for every other follow push.
 *   MIN_TIER: the NHL starts at STAR (an overtime goal, a 3-point night, a 20-goal season). MLB and NFL start at ELITE (3+ homers / 3+
 *   touchdowns): a two-homer or two-touchdown game (STAR) is already told by the homer / touchdown push for the second one, so a card push
 *   on top would be the same news twice.
 * `rows` = the stored feed rows of that sport (lamp_goal_feed | homer_feed | nfl_td_feed). Pure.
 */
/**
 * THE CARD ON THE NOTIFICATION (2026-10-13): the baseball-card picture (the server card, /api/card/special, 4:5) rides a card-earned push as its `image`, where the
 * platform shows one (Android Chrome does; iOS drops it and shows the text). The only image a push carries; the service worker accepts nothing else (public/sw.js).
 * A relative path on purpose: it is resolved against the site that registered the worker, never a third-party host.
 */
export const cardImagePath = (m, sport) => `/api/card/special?moment=${encodeURIComponent(m.moment)}&id=${encodeURIComponent(m.id)}&sport=${encodeURIComponent(sport)}&w=540`
const CARD_FOLLOW_KEY = { nfl: (m) => followNameKey(m.name) }
export const CARD_PUSH_MIN_TIER = { nhl: 'star', mlb: 'elite', nfl: 'elite' }
export function cardEarnedEventsFrom(sport, rows, audience) {
  const min = CARD_PUSH_MIN_TIER[sport]
  if (!min || !Array.isArray(rows) || !rows.length) return []
  const list = rows.filter((r) => Number(r.game_type) !== 1)   // (only goal-feed rows carry game_type) preseason games earn no push
  const out = []
  for (const m of momentsForEvent({ sport, rows: list, minTier: min })) {
    if (audience) {
      const set = audience[sport]
      const heard = set?.has((CARD_FOLLOW_KEY[sport] || ((x) => String(x.playerId)))(m))   // football follows match on name (FOLLOW_MATCH)
      if (!heard) continue
    }
    const words = cardCopy.earned({ name: m.name, tierWord: m.tierWord, kicker: m.kicker, line: m.line, team: m.team, opp: m.opp })
    out.push({ key: `card:${m.moment}:${m.id}`, category: 'cardearned', sport, priority: 1, playerId: String(m.playerId), playerName: m.name, url: binderHref(sport, m.playerId), image: cardImagePath(m, sport), ...words })
  }
  return out
}

// ── BUCKETS ────────────────────────────────────────────────────────────────

/**
 * A 30 piece, from buckets_feed (app/api/buckets/moments writes it once, with
 * the status his points row locked with). Same split as LAMP's goals:
 *   nba30      a followed player drops 30. P0, on by default.
 *   nbacalled  any CALLED player drops 30 -- everyone, off by default, P4,
 *              its own key so it can't swallow the follower's P0.
 * Preseason never makes an event.
 */
export function nbaEventsFrom(rows, audience) {
  const out = []
  for (const r of Array.isArray(rows) ? rows : []) {
    // 30 pieces only: buckets_feed also keeps each game's first basket (lib/nba/firstFeed), never a push
    if (r?.push_sent || Number(r.season_type) === 1 || (r?.kind && r.kind !== '30_piece')) continue
    const id = txt(r.player_id)
    const base = { sport: 'nba', url: playerHref('nba', id), playerId: id,
      ...nbaCopy.thirty({ name: txt(r.name), points: r.points, team: txt(r.team), opp: txt(r.opp), status: r.status }) }
    if (!audience || !audience.nba || audience.nba.has(id)) out.push({ ...base, key: `nba:${r.game_date}:${id}:30`, category: 'nba30', priority: 0 })
    if (r.status === 'called') out.push({ ...base, key: `nba:${r.game_date}:${id}:30:called`, category: 'nbacalled', priority: 4, everyone: true, group: 'CALLED players dropped 30' })
  }
  return out
}

// ── BEFORE FIRST PITCH ─────────────────────────────────────────────────────
//
// Four alerts, deliberately. Everything else in this file is a scoreboard --
// it tells you what already happened. These arrive while you can still do
// something, and between them they are about two messages on a normal night:
// the board goes up, and last call. The other two are rare by nature.
//
// Kept small on purpose. A pregame channel that fires twelve times before
// first pitch is a pregame channel nobody leaves switched on.

const LAST_CALL_MINUTES = 30

/**
 * @param rows      the trimmed published board (lib/dash/board.js)
 * @param snap      the live slate, for game state the board cannot know
 * @param day       the Eastern calendar day this run belongs to
 * @param audience  whose names matter
 */
export function pregameEventsFrom(rows, snap, day, audience, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return []
  const out = []
  const games = Array.isArray(snap?.games) ? snap.games : []
  const gameOf = new Map(games.map((g) => [Number(g.pk), g]))

  // Only tonight's board. A stale file left over from yesterday must not
  // announce itself as tonight's, and the check is free.
  const tonight = rows.filter((r) => {
    const t = Date.parse(r?.game_time || '')
    return Number.isFinite(t) && ET_DAY(t) === day
  })
  if (!tonight.length) return []

  const mine = tonight.filter((r) => follows(audience, txt(r?.player_id)))

  // LINEUP GATE (2026-10-09). A pick is "in" only when his game's lineup is
  // posted, the game has not started and his id is on the card. Nothing below
  // counts or names anyone else, so "your board is set" can never include a
  // man who is not playing and "first pitch soon" never fires with no card up.
  const inLineup = mine.filter((r) => {
    const g = gameOf.get(Number(r?.game_pk))
    return g && g.state === 'Preview' && g.lineupPosted && lineupIds(g).has(txt(r?.player_id))
  })
  const startMs = (r) => Date.parse(r?.game_time || '')

  // ── 1. THE BOARD IS SET ──────────────────────────────────────────────────
  // Once a day, the first time a lineup with one of your picks in it is posted.
  // The count is the picks in the lineups posted AT THAT MOMENT; first pitch is
  // the earliest of those games.
  if (inLineup.length) {
    const first = Math.min(...inLineup.map(startMs).filter(Number.isFinite))
    out.push(mlbEvent({
      key: `mlb:${day}:board`,
      category: 'boardup', priority: 1,
      ...mlbCopy.boardSet({ count: inLineup.length, time: timeET(first) }),
      playerIds: inLineup.map((r) => txt(r?.player_id)),
    }))
  }

  // ── 2. FIRST PITCH SOON: one per start time, picks in the lineup only ────
  const byStart = new Map()
  for (const r of inLineup) {
    const t = startMs(r)
    if (!Number.isFinite(t)) continue
    const mins = (t - now) / 60000
    if (!(mins > 0 && mins <= LAST_CALL_MINUTES)) continue
    const k = Math.floor(t / 60000)
    if (!byStart.has(k)) byStart.set(k, { t, rows: [] })
    byStart.get(k).rows.push(r)
  }
  for (const [k, { t, rows: rs }] of byStart) {
    const picks = [...new Set(rs.map((r) => txt(r?.player_id)))]
    out.push(mlbEvent({
      key: `mlb:${day}:lastcall:${k}`,
      category: 'lastcall', priority: 1,
      ...mlbCopy.firstPitchSoon({ mins: Math.max(1, Math.round((t - now) / 60000)), count: picks.length }),
      playerIds: picks,
    }))
  }

  // ── 3. HIS GAME IS OFF ───────────────────────────────────────────────────
  // Names no one and counts only picks in the posted lineup. Before a lineup
  // exists it says so. A postponed game counts the board's picks (no lineup
  // will ever be posted).
  const seenGame = new Set()
  for (const r of mine) {
    const pk = Number(r?.game_pk)
    const g = gameOf.get(pk)
    if (!g || seenGame.has(pk)) continue
    const why = g.postponed ? 'postponed' : g.suspended ? 'suspended' : g.delayed ? 'delayed' : ''
    if (!why) continue
    seenGame.add(pk)
    const here = mine.filter((x) => Number(x?.game_pk) === pk)
    const played = g.lineupPosted ? here.filter((x) => lineupIds(g).has(txt(x?.player_id))) : []
    const counted = why === 'postponed' ? here : played
    if (why !== 'postponed' && g.lineupPosted && !counted.length) continue   // every pick of yours is out of it
    out.push(mlbEvent({
      key: `mlb:${day}:${pk}:off:${why}`,
      category: 'gameoff', priority: 0,
      ...mlbCopy.gameOff({
        kind: why, reason: txt(g.detail),
        away: TEAM_ABBR[g.awayId] || txt(r?.team), home: TEAM_ABBR[g.homeId] || txt(r?.opponent),
        count: counted.length, lineupPosted: Boolean(g.lineupPosted),
      }),
      playerIds: (g.lineupPosted && why !== 'postponed' ? counted : here).map((x) => txt(x?.player_id)),
    }))
  }

  // ── 4. HE IS NOT IN IT ───────────────────────────────────────────────────
  for (const r of mine) {
    const g = gameOf.get(Number(r?.game_pk))
    if (!g?.lineupPosted) continue
    const listed = lineupIds(g)
    if (!listed.size || listed.has(txt(r?.player_id))) continue
    out.push(mlbEvent({
      key: `mlb:${day}:${r.player_id}:scratched:${r.game_pk}`,
      category: 'scratched', priority: 0,
      ...mlbCopy.scratch({ name: txt(r?.name) }),
      playerId: txt(r?.player_id),
      // PUSH_FOLDS_ON: a scratch push goes only for a CALLED pick (lib/dash/pushFolds.js foldGlobal). Off = the event is byte-for-byte what it was.
      ...(foldsOn() ? { called: isCalledRole(r?.game_pick_role) } : {}),
    }))
  }

  return out
}

// ── PREGAME NEWS: NHL, NFL, NBA (2026-10-09) ───────────────────────────────
//
// The MLB set (a man is out, a game is off, the lineup is set) for the other three sports, built from
// each sport's own source and gated the same way. Pure: the route (app/api/dash/push/tick) fetches
// through lib/dash/pregameSources.js and passes a SNAPSHOT here.
//
//   scratched  a followed man is out: a followed goalie who was confirmed and then replaced (NHL), a
//              followed player ESPN's injury report lists Out (NFL, NBA).
//   gameoff    postponed / suspended / delayed / moved, only from the source's own flags or the league's
//              own game state (never from a guess at the clock alone), for games with a followed man in.
//   starter    a followed goalie is the CONFIRMED starter (NHL; a "probable" never counts), a followed
//              player is in ESPN's posted starting five (NBA).
//
// WHO: only men somebody follows (the MLB rule: the board's men, who must be followed to be pushed to
// anyone). wants() then checks each device's own follow list and category switch.
// NEVER STALE, NEVER UNCONFIRMED: a snapshot older than 10 minutes, or one the source did not answer
// for (`ok` false), makes nothing. DEDUPE: every key is one fact (game, man, state), so a sweep that
// produces the same fact again is swallowed by the claim table.
// BUCKETS (NBA) stays hidden: nothing is produced, and nothing links to a BUCKETS page, until
// BUCKETS_PUBLIC is on (`opts.public`).

export const PREGAME_STALE_MS = 10 * 60 * 1000
export const LATE_START_MS = 20 * 60 * 1000          // still not started this long after the scheduled start (NHL)
const LATE_START_GIVE_UP_MS = 3 * 3600 * 1000
const PUCK_DROP_MINUTES = 30                         // the heads-up window before puck drop
const MOVED_MS = 10 * 60 * 1000                       // a kickoff must differ from the published one by this much
const OUT_REPORT_MAX_AGE_MS = 5 * 24 * 3600 * 1000    // an injury-report line older than this is not news
const FINAL_FRESH_MS = 9 * 3600 * 1000                // a final is news for this long after the start (never a backfill of last week's scores)
const NFL_DELAY_NAMES = new Set(['STATUS_DELAYED', 'STATUS_RAIN_DELAY', 'STATUS_SUSPENDED', 'STATUS_POSTPONED'])

const snapFresh = (snap, now) => Boolean(snap) && snap.ok === true && Number.isFinite(snap.asOf) && now - snap.asOf <= PREGAME_STALE_MS && snap.asOf - now <= 60000

/** NHL: goalies confirmed / replaced, and games that are off, for followed goalies and followed clubs' men.
 *  snap = { ok, asOf, games: reduceGame[], starters: { [gameId]: { home, away } } }   (lib/dash/pregameSources.js)
 *  prior = { [`${gameId}:${side}`]: [{ id, name }] } the goalies already pushed confirmed for that side (the claim table's memory). */
export function nhlPregameEventsFrom(snap, day, audience, now = Date.now(), prior = {}, opts = {}) {
  if (!audience?.nhl?.size || !snapFresh(snap, now)) return []
  const out = []
  const clubOf = (id) => audience.teamOfId?.get(`nhl:${id}`) || ''
  const followedIn = (g) => [...audience.nhl].filter((id) => [txt(g?.away?.abbrev), txt(g?.home?.abbrev)].includes(clubOf(id)))
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.id || Number(g.gameType) === 1) continue                               // preseason: nothing
    const away = txt(g.away?.abbrev); const home = txt(g.home?.abbrev)
    const start = Date.parse(g.startUtc || '')
    const gday = ISO_DAY.test(String(g.date || '')) ? String(g.date) : day
    const url = `/app${watchHash('nhl')}`

    // ── a game that is off ──
    const why = g.scheduleState === 'PPD' ? 'postponed' : g.scheduleState === 'SUSP' ? 'suspended'
      : (g.state === 'pre' && Number.isFinite(start) && now - start >= LATE_START_MS && now - start < LATE_START_GIVE_UP_MS && ['FUT', 'PRE'].includes(String(g.rawState || '').toUpperCase())) ? 'late' : ''
    if (why) {
      const mine = followedIn(g)
      if (mine.length) {
        out.push({
          sport: 'nhl', url, key: `nhl:${gday}:${g.id}:off:${why}`, category: 'gameoff', priority: 0,
          ...nhlCopy.gameOff({ kind: why, away, home, count: mine.length, whenMs: start, now }),
          playerIds: mine,
        })
      }
    }
    // ── the final score (nhlfinal, 2026-10-13): once per game, for a game with a followed man's club, the league's own final state, within FINAL_FRESH_MS of the start.
    if (g.state === 'final' && Number.isFinite(start) && start <= now && now - start <= FINAL_FRESH_MS && Number.isFinite(g.away?.score) && Number.isFinite(g.home?.score)) {
      const mine = followedIn(g)
      if (mine.length) {
        out.push({
          sport: 'nhl', url, key: `nhl:${gday}:${g.id}:final`, category: 'nhlfinal', priority: 3,
          ...nhlCopy.finalScore({ away, home, awayScore: g.away.score, homeScore: g.home.score, outcome: g.outcome, count: mine.length }),
          playerIds: mine,
        })
      }
      continue
    }
    if (g.state !== 'pre' || why === 'postponed') continue                           // a game under way has a goalie already

    // ── PUCK DROP SOON (2026-10-13): one per game, 30 minutes out, for a game with a followed man in it. NHL publishes no skater lineup ahead of time, so "in the
    // confirmed lineup" is held to what the league does confirm: BOTH starting goalies are confirmed, a followed goalie is the confirmed one (a goalie ESPN replaced
    // is dropped), and nobody the injury layer lists Out is counted. The event names no one; the audience check (playerIds) is each device's own follow list.
    const minsOut = Number.isFinite(start) ? (start - now) / 60000 : NaN
    if (minsOut > 0 && minsOut <= PUCK_DROP_MINUTES && !why) {
      const pairNow = snap.starters?.[g.id]
      if (pairNow?.home?.confirmed === true && pairNow?.away?.confirmed === true) {
        const replaced = new Set(['away', 'home'].flatMap((side) => (prior[`${g.id}:${side}`] || []).map((x) => String(x.id)).filter((id) => id !== String(pairNow[side].id))))
        const playing = followedIn(g).filter((id) => !replaced.has(id) && !(opts.outIds instanceof Set && opts.outIds.has(id)))
        if (playing.length) {
          out.push({
            sport: 'nhl', url, key: `nhl:${gday}:${g.id}:puckdrop`, category: 'puckdrop', priority: 1,
            ...nhlCopy.puckDrop({ mins: Math.max(1, Math.round(minsOut)), away, home, whenMs: start, now }),
            playerIds: playing,
          })
        }
      }
    }

    // ── the goalies ──
    const pair = snap.starters?.[g.id]
    if (!pair) continue
    for (const side of ['away', 'home']) {
      const s = pair[side]
      if (!s || s.confirmed !== true || !s.id) continue                           // never a probable, never a name with no league id
      const id = String(s.id)
      const was = (prior[`${g.id}:${side}`] || []).filter((x) => String(x.id) !== id)
      if (audience.nhl.has(id)) {
        out.push({
          sport: 'nhl', url: playerHref('nhl', id), playerId: id,
          key: `nhl:${gday}:${g.id}:starter:${side}:${id}`, category: 'starter', priority: 1,
          ...nhlCopy.goalieStarts({ name: txt(s.name), away, home, whenMs: start, now, changed: was.length > 0 }),
        })
      }
      // the man who was confirmed first and is no longer the starter
      for (const w of was) {
        const wid = String(w.id)
        if (!audience.nhl.has(wid)) continue
        out.push({
          sport: 'nhl', url: playerHref('nhl', wid), playerId: wid,
          key: `nhl:${gday}:${g.id}:starter:${side}:${wid}:out:${id}`, category: 'scratched', priority: 0,
          ...nhlCopy.goalieOut({ name: txt(w.name), away, home, whenMs: start, now }),
        })
      }
    }
  }
  return out
}

/** NFL: a followed player ruled Out, a game delayed / suspended / postponed, a kickoff moved.
 *  snap = { ok, asOf, games: [{ game_id, away, home, kickoff, plannedKickoff, state, status_name, detail, period, away_score, home_score }],
 *           outs: [{ name, team, gameId, reportedAt }] }   (lib/dash/pregameSources.js; `outs` are ESPN's "Out" lines only)
 *  ids = Map<followNameKey, player_id> (so an alert opens his TUDDY card) */
export function nflPregameEventsFrom(snap, day, audience, now = Date.now(), ids = null) {
  if (!audience?.nfl?.size || !snapFresh(snap, now)) return []
  const out = []
  const clubOf = (key) => audience.teamOf?.get(key) || ''
  const mineIn = (g) => [...audience.nfl].filter((k) => [txt(g.away).toUpperCase(), txt(g.home).toUpperCase()].includes(clubOf(k)))
  const gameById = new Map((snap.games || []).map((g) => [String(g.game_id), g]))
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.game_id) continue
    const kick = Date.parse(g.kickoff || '')
    const gday = nflDayOf(g, day)
    const mine = mineIn(g)
    if (!mine.length) continue
    // ── the final score (nflfinal, 2026-10-13): once per game, for a game with a followed man's club, within FINAL_FRESH_MS of kickoff.
    if (g.state === 'post' && !NFL_DELAY_NAMES.has(String(g.status_name || ''))) {   // (ESPN files a postponed game as 'post' too: that is the game-off push below, never a final)
      if (Number.isFinite(kick) && kick <= now && now - kick <= FINAL_FRESH_MS && g.away_score != null && g.home_score != null && Number.isFinite(Number(g.away_score)) && Number.isFinite(Number(g.home_score))) {
        out.push({
          sport: 'nfl', url: NFL_URL, key: `nfl:${gday}:${g.game_id}:final`, category: 'nflfinal', priority: 3,
          ...nflCopy.finalScore({ away: txt(g.away), home: txt(g.home), awayScore: g.away_score, homeScore: g.home_score, count: mine.length }),
          playerNames: mine,
        })
      }
      continue
    }
    const flagged = NFL_DELAY_NAMES.has(String(g.status_name || ''))
    const planned = Date.parse(g.plannedKickoff || '')
    const moved = g.state === 'pre' && !flagged && Number.isFinite(kick) && Number.isFinite(planned) && Math.abs(kick - planned) >= MOVED_MS && kick > now
    if (!flagged && !moved) continue
    const kind = moved ? 'moved' : /postpon/i.test(g.status_name) ? 'postponed' : /suspend/i.test(g.status_name) ? 'suspended' : 'delayed'
    out.push({
      sport: 'nfl', url: NFL_URL, category: 'gameoff', priority: 0,
      key: `nfl:${gday}:${g.game_id}:off:${kind}${moved ? `:${Math.floor(kick / 60000)}` : ''}`,
      ...nflCopy.gameOff({
        kind, detail: txt(g.detail), away: txt(g.away), home: txt(g.home), count: mine.length, whenMs: kick, now,
        game: g.state === 'in' ? g : null,
      }),
      playerNames: mine,
    })
  }
  for (const o of Array.isArray(snap.outs) ? snap.outs : []) {
    const g = gameById.get(String(o?.gameId))
    const name = txt(o?.name)
    if (!g || g.state !== 'pre' || !name || !followsNfl(audience, name)) continue
    const kick = Date.parse(g.kickoff || '')
    const at = Date.parse(o.reportedAt || '')
    if (!Number.isFinite(kick) || kick <= now) continue                           // the game is on or over
    if (Number.isFinite(at) && now - at > OUT_REPORT_MAX_AGE_MS) continue         // an old line is not news
    const id = ids?.get?.(followNameKey(name))
    out.push({
      sport: 'nfl', url: id ? playerHref('nfl', id) : NFL_URL, playerName: name,
      key: `nfl:${nflDayOf(g, day)}:${followNameKey(name)}:out:${g.game_id}`, category: 'scratched', priority: 0,
      ...nflCopy.playerOut({ name, away: txt(g.away), home: txt(g.home), whenMs: kick, now }),
    })
  }
  return out
}

/**
 * NFL: a followed player the injury report (lib/injuries) lists QUESTIONABLE or DOUBTFUL for a game that has not started. (OUT is the scratch push above.)
 * One event per (game, man, status): the key is the claim key, so a Q that becomes a D is a second push and the same word seen again is swallowed. The report's own
 * stamp must be fresh (48 hours): an old line is not news. An outage or stale snapshot makes nothing.
 * snap = nflPregameSnap(); inj = readInjuries('nfl'); ids = Map<followNameKey, player_id> so the alert opens his card.
 */
const INJURY_STATUS_FRESH_MS = 48 * 3600 * 1000
export function nflInjuryStatusEventsFrom(snap, inj, day, audience, now = Date.now(), ids = null) {
  if (!audience?.nfl?.size || !snapFresh(snap, now) || !injuryFresh(inj, now)) return []
  const out = []
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.game_id || g.state !== 'pre') continue
    const kick = Date.parse(g.kickoff || '')
    if (!Number.isFinite(kick) || kick <= now || kick - now > 6 * 24 * 3600 * 1000) continue
    const clubs = [txt(g.away).toUpperCase(), txt(g.home).toUpperCase()]
    for (const e of inj.entries || []) {
      if (e.status !== 'QUESTIONABLE' && e.status !== 'DOUBTFUL') continue
      if (!clubs.includes(txt(e.team).toUpperCase())) continue
      const name = txt(e.name)
      if (!name || !followsNfl(audience, name)) continue
      const at = Date.parse(e.updatedAt || '')
      if (!Number.isFinite(at) || now - at > INJURY_STATUS_FRESH_MS || at > now + 60000) continue
      const id = ids?.get?.(followNameKey(name))
      out.push({
        sport: 'nfl', url: id ? playerHref('nfl', id) : NFL_URL, playerName: name,
        key: `nfl:${nflDayOf(g, day)}:${followNameKey(name)}:inj:${e.status}:${g.game_id}`, category: 'nflinj', priority: 1,
        ...nflCopy.injuryStatus({ name, status: e.status, away: txt(g.away), home: txt(g.home), whenMs: kick, now }),
      })
    }
  }
  return out
}

/** NBA (BUCKETS): a followed player Out, in the starting five, a game delayed or postponed. Nothing at all
 *  unless `opts.public` (BUCKETS_PUBLIC): no event, so no link to a BUCKETS page, while the product is hidden.
 *  snap = { ok, asOf, games: reduceScoreboard[], outs: [{ id, name, team }], starters: { [gameId]: string[] } } */
export function nbaPregameEventsFrom(snap, day, audience, now = Date.now(), opts = {}) {
  if (opts.public !== true || !audience?.nba?.size || !snapFresh(snap, now)) return []
  const out = []
  const clubOf = (id) => audience.teamOfId?.get(`nba:${id}`) || ''
  const gday = (g) => (Number.isFinite(Date.parse(g.start || '')) ? ET_DAY(Date.parse(g.start)) : day)
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.id || Number(g.seasonType) === 1) continue                             // preseason: nothing
    const away = txt(g.away?.abbrev); const home = txt(g.home?.abbrev)
    const start = Date.parse(g.start || '')
    const flagged = g.state === 'postponed' || /^STATUS_(DELAYED|SUSPENDED)$/.test(String(g.statusName || ''))
    const mine = [...audience.nba].filter((id) => [away, home].includes(clubOf(id)))
    if (flagged && mine.length) {
      const kind = g.state === 'postponed' ? 'postponed' : /SUSPENDED/.test(g.statusName) ? 'suspended' : 'delayed'
      out.push({
        sport: 'nba', url: appHref('nba', 'home'), category: 'gameoff', priority: 0,
        key: `nba:${gday(g)}:${g.id}:off:${kind}`,
        ...nbaCopy.gameOff({ kind, detail: txt(g.detail), away, home, count: mine.length, whenMs: start, now }),
        playerIds: mine,
      })
    }
    // ── the final score (nbafinal, 2026-10-20): once per game, for a game with a followed man's club, ESPN's own final state, within FINAL_FRESH_MS of the tip
    if (g.state === 'final' && Number.isFinite(start) && start <= now && now - start <= FINAL_FRESH_MS && Number.isFinite(g.away?.score) && Number.isFinite(g.home?.score)) {
      if (mine.length) {
        out.push({
          sport: 'nba', url: appHref('nba', 'home'), key: `nba:${gday(g)}:${g.id}:final`, category: 'nbafinal', priority: 3,
          ...nbaCopy.finalScore({ away, home, awayScore: g.away.score, homeScore: g.home.score, ot: /OT/.test(String(g.detail || '')), count: mine.length }),
          playerIds: mine,
        })
      }
      continue
    }
    if (g.state !== 'pre' || flagged) continue
    const five = snap.starters?.[g.id]
    for (const id of mine) {
      const club = clubOf(id)
      const name = txt(audience.nameOf?.get(id))
      if (!name) continue
      if (Array.isArray(five) && five.length && five.includes(id)) {
        out.push({
          sport: 'nba', url: playerHref('nba', id), playerId: id,
          key: `nba:${gday(g)}:${id}:starter:${g.id}`, category: 'starter', priority: 1,
          ...nbaCopy.starts({ name, away, home, whenMs: start, now }),
        })
      }
      const isOut = (snap.outs || []).some((o) => String(o.id) === id && txt(o.team).toUpperCase() === club)
      if (isOut) {
        out.push({
          sport: 'nba', url: playerHref('nba', id), playerId: id,
          key: `nba:${gday(g)}:${id}:out:${g.id}`, category: 'scratched', priority: 0,
          ...nbaCopy.playerOut({ name, away, home, whenMs: start, now }),
        })
      }
    }
  }
  return out
}

// ── WHO GETS IT ────────────────────────────────────────────────────────────

// Only the categories the sender can actually produce. A category the user has
// never touched falls back to its default here -- anything not in this map is
// off, which is the safe direction for a message that arrives with no tab open.
const DEFAULTS = {
  homer: true, nfltd: true,
  // LAMP (2026-09-28): a followed skater's goal ships on, like homer and
  // nfltd. nhlcalled (any CALLED skater, everyone) ships off, like slate --
  // Donovan's call to flip.
  nhlgoal: true, nhlcalled: false,
  // The Binder (2026-10-12): a followed player earns a STAR+ card. Rare (a hat trick, an OT goal, 3 homers / touchdowns), so it ships on.
  cardearned: true,
  // BUCKETS (2026-10-03, live once BUCKETS opens): a followed player's 30 piece
  // on; any CALLED player's 30 off, like nhlcalled.
  // 2026-10-13 (the PUSH_CUT_CATEGORIES footgun): nba30 was TRUE here. Both are cut categories, so wants() refuses them today -- but the day the flag is turned on, every
  // account with no saved settings would have started getting red-zone and 30-point alerts. A cut category must default OFF.
  nba30: false, nbacalled: false,
  // Pregame. Two on a normal night (the board goes up, last call) and two that
  // are rare by nature, so these are on out of the box: they are the only
  // alerts that reach you while you can still act on them.
  boardup: true, lastcall: true, gameoff: true, scratched: true,
  // The starting goalie confirmed or replaced, the NBA five: once per man per game, phone only.
  starter: true,
  // The draft happens once. An alert nobody switched on beforehand is an alert
  // nobody gets, so these ship on -- and the draft three stop existing the
  // moment the draft is over, which is the only reason that is defensible.
  // frlineup ships on for the same reason: the week it would have saved you is
  // over before you would have thought to go and switch it on.
  frdraft: true, frclock: true, frauto: true, frlineup: true,
  // Same argument as frlineup, and the commoner mistake of the two from week
  // five on: an empty slot at least looks wrong on the page, and a man on bye
  // looks completely normal right up until he scores nothing.
  frbye: true,
  // A starter's touchdown, on by default for the same reason nfltd is: the
  // whole point of following your own roster. frbig (100/300 yard day) stays
  // off by default like its TUDDY twin nflbig -- it is the one most able to
  // turn into noise on a good week.
  frtd: true, frbig: false,
  // ON DECK ships ON and slam OFF (2026-09-27, Donovan: "on deck is the best
  // alert"). The on-deck message says "bases loaded" when they are, with an
  // at-bat of lead time; slam (at the plate) stays one switch away. Only the
  // defaults changed: a saved setting still wins in wants() below.
  // ON DECK is CUT (2026-10-09, Donovan): two per plate appearance. BASES LOADED
  // (slam) took its job and ships ON.
  ondeck: false,
  slam: true,
  // Football's version of the same argument, and on by default for the same
  // reason: a touchdown site that stays quiet while your man's offence is
  // inside the twenty is not doing its job.
  nflred: false,
  // The room's red zone (TUDDY board men). Off for phones, like slate: it is a
  // channel story, not a personal alert.
  nflboardred: false,
  // Ships ON as of 2026-09-06 (Alert Box Score) -- Donovan wants kickoff
  // itself, priority 0.
  nflkick: true,
  // Call-up's mirror -- needs lineupState to fire at all (see the DROPPED
  // FROM THE LINEUP section above). ON: scratched only knows about the ~60
  // men on tonight's board; this is the only lineup alert for the rest of a
  // follow list, and it no longer doubles a scratch (2026-09-14).
  dropout: true,
  // OFF as of 2026-09-14 (notification audit). multihit was ~36 events a
  // night by itself on a channel already at its throttle ceiling; callup
  // was firing for regulars (fixed above) and stays off until a night of
  // ledger proves the fix. Both are one switch away for anyone who wants them.
  callup: false,
  lineup: false, clutch: false, xbh: false,
  cold: false, firstpitch: false,
  // CASH EVENTS, kept and ON (Donovan 2026-10-09): a bar the man cleared, with the stat line and score.
  // The final recap too. All ride the urgent lane (NEVER_DROP) and bundle per man.
  // 2026-10-13 (the brake): those four are ONE bar-cleared push per hitter per night now (`barcleared`, on); the nightly recap (`recap`) replaced finalline and is OFF
  // unless chosen ("Following closely"). The old four stay listed so a saved switch for any of them still resolves (lib/dash/pushBrake.js categoryOn).
  barcleared: true, recap: false,
  multihit: true, hrr: true, bigbases: true, finalline: false,
  // The missing moments (2026-10-13): all off by default, on in "Following closely" (weekly: only "Everything"). Each is one note per night / game / week.
  callsgraded: false, lineupin: false, puckdrop: false, nflinj: false, weekly: false,
  // Push parity outside MLB (2026-10-13): every one OFF until chosen. nflcalled is about names you did not follow (like nhlcalled).
  nflcalled: false, nflmulti: false, nflfinal: false, nhlmulti: false, nhlfinal: false, nhlinj: false, nbafinal: false, nbainj: false,
  slate: false, nflbig: false, nflclose: false,
  leadchg: false, gamefinal: false,
}

/**
 * Did this person ask for this event?
 *
 * Two independent gates, both required: the CATEGORY has to be on in their
 * alert settings, and the PLAYER has to be on their follow list. No follows
 * means no push, ever -- there is deliberately no "everyone gets the big ones"
 * path, because a message that arrives on a locked phone should only ever be
 * about something the person named themselves.
 *
 * The single exception is an event marked `everyone` -- today only the slate
 * homer, which is by definition about the names you did NOT pick. It still
 * needs its category switched on, and that category is off by default.
 */
export function wants(state, event, now = Date.now()) {
  // The cut (lib/copy/notifications.js PUSH_PLAN): a cut category reaches no phone unless PUSH_CUT_CATEGORIES=on.
  if (!categoryAllowed(event.category)) return false
  const prefs = state?.dash_alerts_v1?.events
  const on = categoryOn(prefs, event.category, DEFAULTS)
  if (!on) return false
  if (event.everyone) return true
  // An OWNED event -- a draft pick, a trade offer, a nightly recap -- is addressed to one
  // person, and the sender checks that it is reaching them. Following has
  // nothing to do with whose turn it is, so the follow gate below does not
  // apply and must not silently drop it.
  if (event.owner) return true

  const list = state?.dash_follow_v1
  if (!list || typeof list !== 'object') return false

  for (const [key, row] of Object.entries(list)) {
    if (!row || row.removed) continue          // a tombstone is not a follow
    if (row.mute) continue                      // a bell-off: he is followed, and silent (2026-10-13)
    if (!key.startsWith(`${event.sport}:`)) continue
    const rowId = String(row.id)
    const rowName = followNameKey(row.name)
    if (event.playerId && rowId === event.playerId) return true
    if (event.playerName && rowName && rowName === followNameKey(event.playerName)) return true
    // A GAME-level event -- first pitch, kickoff, a one-score fourth quarter --
    // belongs to whoever follows anyone in it, so it carries the whole list
    // rather than picking one man to hang itself on.
    if (Array.isArray(event.playerIds) && event.playerIds.includes(rowId)) return true
    if (Array.isArray(event.playerNames) && rowName && event.playerNames.some((n) => followNameKey(n) === rowName)) return true
  }
  return false
}

/**
 * Does this DEVICE want events of this sport? `sports` is the device's chosen
 * list (dash_push_subscriptions.sports); null/undefined/empty = every sport,
 * which is what a device that never chose gets. Pure.
 */
export function deviceWantsSport(sports, sport) {
  if (!Array.isArray(sports) || !sports.length) return true
  // Only the three picker sports can be switched off on a device; FRANCHISE ('fantasy') and BUCKETS (not in the picker) always pass.
  if (!['mlb', 'nfl', 'nhl'].includes(sport)) return true
  return sports.includes(sport)
}

/**
 * The union of everyone's follow lists, so the producers can skip the rest of
 * the league. Without this a fifteen-game slate manufactures several hundred
 * lineup events a minute and throws them away one dedupe row at a time.
 */
//
// One Set per sport in the registry (lib/routes.js SPORT_KEYS), so a sport
// added there is heard here with no third hand-written branch (2026-09-28,
// LAMP goals: `nhl:` rows had been filed by follow.js since Batch 1 and
// silently ignored here). MLB and NHL follows carry real league ids; the
// ESPN box score has no gsis id, so football matches on name.
const FOLLOW_MATCH = { nfl: 'name' }
export function audienceFrom(stateByUser) {
  const out = Object.fromEntries(SPORT_KEYS.map((s) => [s, new Set()]))
  const nameOf = new Map()
  // name key -> team, for the name-matched sports: nflFollowMisses() below
  // needs to know which game a follow should have shown up in.
  const teamOf = new Map()
  // `nhl:8478402` -> 'EDM': the club a followed man was followed on, for the id-matched sports (a game-level
  // event -- a delay -- needs to know which games a follow is in; the id alone cannot say).
  const teamOfId = new Map()
  for (const state of Object.values(stateByUser || {})) {
    const list = state?.dash_follow_v1
    if (!list || typeof list !== 'object') continue
    for (const [key, row] of Object.entries(list)) {
      if (!row || row.removed || row.mute) continue   // a muted man adds nothing to the audience (if someone else follows him un-muted, their row adds him)
      const sport = key.slice(0, key.indexOf(':'))
      if (!out[sport]) continue
      if (FOLLOW_MATCH[sport] === 'name') { const k = followNameKey(row.name); if (k) { out[sport].add(k); if (row.team) teamOf.set(k, txt(row.team).toUpperCase()) } }
      else { out[sport].add(String(row.id)); nameOf.set(String(row.id), txt(row.name)); if (row.team) teamOfId.set(`${sport}:${row.id}`, txt(row.team).toUpperCase()) }
    }
  }
  return { ...out, nameOf, teamOf, teamOfId }
}

/**
 * Followed football players whose team's game is in the 4th quarter or later
 * and who have no line in that box score: inactive, or a name the key above
 * still cannot join. Either way a touchdown would not alert, so the push tick
 * logs them (NOTIF-6). Pure; the caller dedupes the log.
 */
export function nflFollowMisses(snap, audience) {
  const games = (Array.isArray(snap?.games) ? snap.games : []).filter((g) => g?.state === 'in' && num(g.period) >= 4)
  if (!games.length || !audience?.teamOf?.size) return []
  const lines = snap?.lines?.values ? [...snap.lines.values()] : []
  const out = []
  for (const key of audience.nfl || []) {
    const team = audience.teamOf.get(key)
    const g = team && games.find((x) => txt(x.away).toUpperCase() === team || txt(x.home).toUpperCase() === team)
    if (!g) continue
    if (!lines.some((l) => l?.game_id === g.game_id && followNameKey(l?.name) === key)) out.push({ key, team, game_id: g.game_id })
  }
  return out
}

// ── INJURY-LAYER SCRATCHES: NHL and MLB (2026-10-10, lib/injuries) ──────────────────────────────────────────
// A followed man the injury report lists OUT for tonight is the SAME 'scratched' category the NFL / NBA pushes use
// (no new category). Only men somebody follows; one event per (game, man) -- the key is the claim key, so a sweep
// that sees him again is swallowed by the claim table. Never stale and never unconfirmed: an injury snapshot that
// is unavailable, stale or older than 30 minutes makes nothing (an outage is not "nobody is out"), and a line the
// report last touched more than five days ago is not news.
const INJURY_PUSH_STALE_MS = 30 * 60 * 1000
const injuryFresh = (inj, now) => Boolean(inj) && inj.ok === true && inj.unavailable !== true && inj.stale !== true && Number.isFinite(inj.asOf) && now - inj.asOf <= INJURY_PUSH_STALE_MS
const injuryNews = (v, now) => {
  if (!v || v.status !== 'OUT') return false
  const at = Date.parse(v.entry?.updatedAt || '')
  return !Number.isFinite(at) || now - at <= OUT_REPORT_MAX_AGE_MS
}

/** NHL: snap = nhlPregameSnap(); inj = readInjuries('nhl'). */
export function nhlInjuryOutEventsFrom(snap, inj, day, audience, now = Date.now()) {
  if (!audience?.nhl?.size || !snapFresh(snap, now) || !injuryFresh(inj, now)) return []
  const index = indexEntries('nhl', inj.entries)
  const out = []
  const clubOf = (id) => audience.teamOfId?.get(`nhl:${id}`) || ''
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.id || Number(g.gameType) === 1 || g.state !== 'pre') continue
    const start = Date.parse(g.startUtc || '')
    if (!Number.isFinite(start) || start <= now) continue
    const away = txt(g.away?.abbrev); const home = txt(g.home?.abbrev)
    const gday = ISO_DAY.test(String(g.date || '')) ? String(g.date) : day
    for (const id of audience.nhl) {
      const club = clubOf(id)
      if (!club || ![away, home].includes(club)) continue
      const name = txt(audience.nameOf?.get(id))
      const v = injuryVerdict(index, { player_id: id, name, team: club })
      if (!name || !injuryNews(v, now)) continue
      out.push({
        sport: 'nhl', url: playerHref('nhl', id), playerId: id,
        key: `nhl:${gday}:${g.id}:${id}:out`, category: 'scratched', priority: 0,
        ...nhlCopy.playerOut({ name, away, home, whenMs: start, now }),
      })
    }
  }
  return out
}

/**
 * NHL (nhlinj, 2026-10-13): a followed skater the injury report lists DAY-TO-DAY (or questionable / doubtful) for a game that has not started. OUT is the scratch push above.
 * One event per (game, man, status): the key is the claim key, so a word seen again is swallowed and a change of word is a second note. The line's own stamp must be fresh
 * (48 hours) and present; an outage or stale snapshot makes nothing. snap = nhlPregameSnap(); inj = readInjuries('nhl').
 */
const NHL_INJ_STATUSES = new Set(['DAY_TO_DAY', 'QUESTIONABLE', 'DOUBTFUL'])
export function nhlInjuryStatusEventsFrom(snap, inj, day, audience, now = Date.now()) {
  if (!audience?.nhl?.size || !snapFresh(snap, now) || !injuryFresh(inj, now)) return []
  const index = indexEntries('nhl', inj.entries)
  const out = []
  const clubOf = (id) => audience.teamOfId?.get(`nhl:${id}`) || ''
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.id || Number(g.gameType) === 1 || g.state !== 'pre') continue
    const start = Date.parse(g.startUtc || '')
    if (!Number.isFinite(start) || start <= now) continue
    const away = txt(g.away?.abbrev); const home = txt(g.home?.abbrev)
    const gday = ISO_DAY.test(String(g.date || '')) ? String(g.date) : day
    for (const id of audience.nhl) {
      const club = clubOf(id)
      if (!club || ![away, home].includes(club)) continue
      const name = txt(audience.nameOf?.get(id))
      const v = injuryVerdict(index, { player_id: id, name, team: club })
      if (!name || !v || !NHL_INJ_STATUSES.has(v.status)) continue
      const at = Date.parse(v.entry?.updatedAt || '')
      if (!Number.isFinite(at) || now - at > INJURY_STATUS_FRESH_MS || at > now + 60000) continue
      out.push({
        sport: 'nhl', url: playerHref('nhl', id), playerId: id,
        key: `nhl:${gday}:${g.id}:${id}:inj:${v.status}`, category: 'nhlinj', priority: 1,
        ...nhlCopy.injuryStatus({ name, status: v.status, away, home, whenMs: start, now }),
      })
    }
  }
  return out
}

/**
 * NBA (nbainj, 2026-10-20, BUCKETS public): a followed player the injury report lists QUESTIONABLE, DOUBTFUL or DAY-TO-DAY for a game that has not tipped. OUT is
 * the scratch push (nbaPregameEventsFrom). One event per (game, man, status): the key is the claim key, so a word seen again is swallowed and a change of word is a
 * second note. The line's own stamp must be fresh and present; an outage or stale snapshot makes nothing. snap = nbaPregameSnap(); inj = readInjuries('nba').
 */
const NBA_INJ_STATUSES = new Set(['DAY_TO_DAY', 'QUESTIONABLE', 'DOUBTFUL'])
export function nbaInjuryStatusEventsFrom(snap, inj, day, audience, now = Date.now()) {
  if (!audience?.nba?.size || !snapFresh(snap, now) || !injuryFresh(inj, now)) return []
  const index = indexEntries('nba', inj.entries)
  const out = []
  const clubOf = (id) => audience.teamOfId?.get(`nba:${id}`) || ''
  for (const g of Array.isArray(snap.games) ? snap.games : []) {
    if (!g?.id || Number(g.seasonType) === 1 || g.state !== 'pre') continue
    const start = Date.parse(g.start || '')
    if (!Number.isFinite(start) || start <= now) continue
    const away = txt(g.away?.abbrev); const home = txt(g.home?.abbrev)
    const gday = ET_DAY(start) || day
    for (const id of audience.nba) {
      const club = clubOf(id)
      if (!club || ![away, home].includes(club)) continue
      const name = txt(audience.nameOf?.get(id))
      const v = injuryVerdict(index, { player_id: id, name, team: club })
      if (!name || !v || !NBA_INJ_STATUSES.has(v.status)) continue
      const at = Date.parse(v.entry?.updatedAt || '')
      if (!Number.isFinite(at) || now - at > INJURY_STATUS_FRESH_MS || at > now + 60000) continue
      out.push({
        sport: 'nba', url: playerHref('nba', id), playerId: id,
        key: `nba:${gday}:${g.id}:${id}:inj:${v.status}`, category: 'nbainj', priority: 1,
        ...nbaCopy.injuryStatus({ name, status: v.status, away, home, whenMs: start, now }),
      })
    }
  }
  return out
}

/** MLB: rows = tonight's board, snap = the live slate, inj = readInjuries('mlb'). Only before his lineup is posted (after that the lineup
 *  scratch above says it, and a man in a posted lineup is playing whatever the report says). */
export function mlbInjuryOutEventsFrom(rows, snap, inj, day, audience, now = Date.now()) {
  if (!audience?.mlb?.size || !Array.isArray(rows) || !injuryFresh(inj, now)) return []
  const index = indexEntries('mlb', inj.entries)
  const gameOf = new Map((Array.isArray(snap?.games) ? snap.games : []).map((g) => [Number(g.pk), g]))
  const out = []
  const seen = new Set()
  for (const r of rows) {
    const id = txt(r?.player_id)
    if (!id || seen.has(id) || !follows(audience, id)) continue
    const t = Date.parse(r?.game_time || '')
    if (!Number.isFinite(t) || t <= now || ET_DAY(t) !== day) continue
    const g = gameOf.get(Number(r?.game_pk))
    if (!g || g.state !== 'Preview' || g.lineupPosted) continue
    const v = injuryVerdict(index, { player_id: id, name: r?.name, team: r?.team })
    if (!injuryNews(v, now)) continue
    seen.add(id)
    out.push(mlbEvent({
      key: `mlb:${day}:${id}:injury-out:${r.game_pk}`, category: 'scratched', priority: 0, playerId: id,
      ...mlbCopy.injuryOut({ name: txt(r?.name), away: TEAM_ABBR[g.awayId] || txt(r?.team), home: TEAM_ABBR[g.homeId] || txt(r?.opponent), whenMs: t, now }),
      ...(foldsOn() ? { called: isCalledRole(r?.game_pick_role) } : {}),
    }))
  }
  return out
}
