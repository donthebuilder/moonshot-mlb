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

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const txt = (v) => String(v == null ? '' : v).trim()

/** Last name, for a title with about thirty characters to spend. */
export function lastName(full) {
  const parts = txt(full).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Your guy'
  if (parts.length === 1) return parts[0]
  const tail = parts.slice(1).filter((p) => !/^(jr\.?|sr\.?|i{2,3}|iv|v)$/i.test(p))
  return (tail.length ? tail : parts.slice(1)).join(' ')
}

export const priorityOf = (e) => (Number.isFinite(e?.priority) ? e.priority : 3)

const MLB_BRAND = '\u{1F4A5} DASH'
const NFL_BRAND = '\u{1F3C8} DASH'
const MLB_URL = '/app#sport=mlb&tab=home'
const NFL_URL = '/app#sport=nfl&tab=watchlist'

/** Half-inning as a person says it: "bot 7th". */
function inningWord(g) {
  const n = num(g?.inning)
  if (!n) return ''
  const half = /^top|^middle/i.test(txt(g?.half)) ? 'top' : 'bot'
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${half} ${n}${s}`
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

/** "2-4, 5 TB" — the line so far, in the fewest characters that still say it. */
const lineWord = (l) => `${num(l?.h)}-${num(l?.ab)}${num(l?.tb) ? `, ${num(l.tb)} TB` : ''}`

const mlbEvent = (e) => ({ brand: MLB_BRAND, sport: 'mlb', url: MLB_URL, ...e })
const nflEvent = (e) => ({ brand: NFL_BRAND, sport: 'nfl', url: NFL_URL, ...e })

const follows = (audience, id) => !audience || !audience.mlb || audience.mlb.has(String(id))
const followsNfl = (audience, name) => !audience || !audience.nfl || audience.nfl.has(txt(name).toLowerCase())

// ── MOONSHOT ───────────────────────────────────────────────────────────────

/**
 * Everything worth saying about tonight's baseball, from one snapshot.
 *
 * Stateless by construction: every event key carries the counter that produced
 * it, so "he now has two hits" is a different key from "he now has three" and
 * neither needs a memory of the last tick. The sender's dedupe table does the
 * remembering, and it is the only thing that does.
 */
export function mlbEventsFrom(snap, day, audience) {
  if (!snap) return []
  const out = []
  const games = Array.isArray(snap.games) ? snap.games : []
  const lines = snap.lines && typeof snap.lines === 'object' ? snap.lines : {}
  const gameOf = new Map(games.map((g) => [Number(g.pk), g]))

  // ── BEFORE FIRST PITCH: the only alerts you can still act on ─────────────
  for (const g of games) {
    if (!g?.lineupPosted) continue
    for (const side of ['home', 'away']) {
      for (const row of (g.lineup?.[side] || [])) {
        const id = txt(row?.id)
        if (!id || !follows(audience, id)) continue
        const name = txt(row?.name)
        out.push(mlbEvent({
          key: `mlb:${day}:${id}:lineup:${num(row?.slot) || 0}`,
          category: 'lineup', priority: 1,
          title: `\u{1F4CB} ${lastName(name)} is in`,
          body: `Batting ${num(row?.slot) || '?'} tonight`,
          short: `${lastName(name)} ${num(row?.slot) || ''}`.trim(), group: 'in the lineup',
          playerId: id,
        }))
      }
    }
  }

  // ── FIRST PITCH ──────────────────────────────────────────────────────────
  for (const g of games) {
    if (g?.state !== 'Live') continue
    const mine = ['home', 'away']
      .flatMap((s) => (g.lineup?.[s] || []))
      .filter((r) => follows(audience, txt(r?.id)))
    if (!mine.length) continue
    const who = mine.map((r) => lastName(r?.name))
    out.push(mlbEvent({
      key: `mlb:${day}:${g.pk}:firstpitch`,
      category: 'firstpitch', priority: 3,
      playerIds: mine.map((r) => txt(r?.id)),
      title: `\u{25B6}\u{FE0F} ${who.slice(0, 2).join(' and ')} underway`,
      body: who.length > 2 ? `${who.length} of your names in this one` : 'First pitch',
      short: who.join(', '), group: 'games started',
    }))
  }

  // ── IN GAME ──────────────────────────────────────────────────────────────
  for (const [id, line] of Object.entries(lines)) {
    if (!follows(audience, id)) continue
    const g = gameOf.get(Number(line?.pk))
    const name = lastName(line?.name)
    const inn = inningWord(g)
    const hr = num(line?.hr)
    const h = num(line?.h)
    const ab = num(line?.ab)
    const tb = num(line?.tb)
    const xbh = num(line?.d2) + num(line?.d3)
    const k = num(line?.k)
    const hrr = h + num(line?.r) + num(line?.rbi)
    const bars = barsCleared(line)
    const cashed = bars.length ? ` · ${bars.join(' · ')}` : ''

    if (hr >= 1) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:hr:${hr}`,
        category: 'homer', priority: 0,
        title: `\u{1F4A5} ${name} goes yard${hr > 1 ? ` — ${hr}` : ''}`,
        body: `${lineWord(line)}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name}${hr > 1 ? ` (${hr})` : ''}`, group: 'went deep',
        playerId: id,
      }))
    }
    if (h >= 2) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:hit:${h}`,
        category: 'multihit', priority: 2,
        title: `\u{1F3AF} ${name} is ${h}-for-${ab}`,
        body: `${h === 2 ? 'Multi-hit night' : `${h} hits`}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name} ${h}-${ab}`, group: 'have multi-hit nights',
        playerId: id,
      }))
    }
    if (xbh >= 1 && hr < 1) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:xbh:${xbh}`,
        category: 'xbh', priority: 2,
        title: `\u{26A1} ${name} ${num(line?.d3) ? 'triples' : 'doubles'}`,
        body: `${lineWord(line)}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: name, group: 'got extra bases',
        playerId: id,
      }))
    }
    if (hrr >= 2) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:hrr`,
        category: 'hrr', priority: 2,
        title: `\u{2705} ${name} clears HRR`,
        body: `${h} H, ${num(line?.r)} R, ${num(line?.rbi)} RBI${inn ? ` · ${inn}` : ''}`,
        short: name, group: 'cleared HRR',
        playerId: id,
      }))
    }
    if (tb >= 4) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:tb:${tb}`,
        category: 'bigbases', priority: 2,
        title: `\u{1F9E8} ${name} has ${tb} bases`,
        body: `${lineWord(line)}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name} (${tb})`, group: 'are piling bases',
        playerId: id,
      }))
    }
    if (k >= 2 && h === 0 && ab >= 2) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:cold`,
        category: 'cold', priority: 3,
        title: `\u{26A0}\u{FE0F} ${name} is 0-for-${ab}, ${k} K`,
        body: `The strikeout script${inn ? ` · ${inn}` : ''}`,
        short: `${name} 0-${ab}`, group: 'are going cold',
        playerId: id,
      }))
    }
    if (line?.settled && ab >= 1) {
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:final`,
        category: 'finalline', priority: 3,
        title: `\u{1F3C1} ${name} finished ${h}-for-${ab}`,
        body: bars.length ? `Cleared ${bars.join(', ')}` : 'Nothing cleared tonight',
        short: `${name} ${h}-${ab}`, group: 'are done for the night',
        playerId: id,
      }))
    }
  }

  // ── COMING UP, AND THE SPOT ──────────────────────────────────────────────
  //
  // "He is batting RIGHT NOW" was never honest on a cron -- ten minutes late it
  // is simply false, and a channel that is routinely wrong about the present
  // tense teaches you to ignore it. ON DECK and IN THE HOLE are the same idea
  // with lead time built in: they stay true for minutes by construction, which
  // is what makes them survivable at any cadence, and they are more useful
  // anyway. One tells you to go and watch. The other tells you that you missed
  // it.
  for (const g of games) {
    if (g?.state !== 'Live') continue
    const outs = num(g?.outs)
    const on = [g?.on1, g?.on2, g?.on3].filter(Boolean).length
    const margin = Math.abs(num(g?.homeScore) - num(g?.awayScore))
    const late = num(g?.inning) >= 7
    const inn = inningWord(g)

    for (const [slot, id, nm] of [['on deck', g?.onDeck, g?.onDeckName], ['in the hole', g?.inHole, g?.inHoleName]]) {
      if (!id || !follows(audience, txt(id))) continue
      const name = lastName(nm)
      out.push(mlbEvent({
        key: `mlb:${day}:${id}:${slot === 'on deck' ? 'deck' : 'hole'}:${g.pk}:${num(g?.inning)}:${outs}`,
        category: 'ondeck', priority: 1,
        title: `\u{1F3A4} ${name} ${slot}`,
        body: `${outs} out${outs === 1 ? '' : 's'}${on ? `, ${on} on` : ''}${inn ? ` · ${inn}` : ''}`,
        short: `${name} ${slot}`, group: 'are coming up',
        playerId: txt(id),
      }))
    }

    // The spot worth stopping what you are doing for: your man at the plate,
    // late, with the game still in the balance and men to drive in.
    const upId = txt(g?.upBatter)
    if (upId && follows(audience, upId) && late && margin <= 3 && on >= 1) {
      const name = lastName(g?.upBatterName)
      out.push(mlbEvent({
        key: `mlb:${day}:${upId}:clutch:${g.pk}:${num(g?.inning)}:${outs}:${on}`,
        category: 'clutch', priority: 1,
        title: `\u{1F525} ${name} up, ${on} on, ${inn}`,
        body: `${outs} out${outs === 1 ? '' : 's'} · ${num(g?.awayScore)}-${num(g?.homeScore)}, ${margin === 0 ? 'tied' : `${margin} run${margin === 1 ? '' : 's'}`}`,
        short: `${name} (${on} on)`, group: 'are in a spot',
        playerId: upId,
      }))
    }
  }

  // ── ANYONE, NOT JUST YOURS ───────────────────────────────────────────────
  // The one producer the audience filter does not apply to, because the whole
  // point of it is the names you did not pick. Off by default, and priority 4
  // so it can never crowd out a followed player's homer.
  for (const [id, line] of Object.entries(lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    if (audience?.mlb?.has(String(id))) continue   // he already got his own, louder
    out.push(mlbEvent({
      key: `mlb:${day}:${id}:anyhr:${hr}`,
      category: 'slate', priority: 4,
      title: `\u{1F4A5} ${lastName(line?.name)} goes yard`,
      body: 'Not one of yours',
      short: lastName(line?.name), group: 'went deep on the slate',
      playerId: id, everyone: true,
    }))
  }

  return out
}

// ── TUDDY ──────────────────────────────────────────────────────────────────

/** Touchdowns, big days, kickoffs and finals in the live box scores. */
export function nflEventsFrom(snap, day, audience) {
  const out = []
  const games = Array.isArray(snap?.games) ? snap.games : []
  const lines = snap?.lines?.values ? [...snap.lines.values()] : []

  for (const g of games) {
    if (g?.state !== 'in') continue
    const mine = lines.filter((l) => l?.game_id === g.game_id && followsNfl(audience, l?.name))
    if (!mine.length) continue
    out.push(nflEvent({
      key: `nfl:${day}:${g.game_id}:kick`,
      category: 'nflkick', priority: 3,
      playerNames: mine.map((l) => txt(l?.name)),
      title: `\u{1F3C8} ${txt(g.away)} at ${txt(g.home)} is on`,
      body: `${mine.length} of your names in this one`,
      short: `${txt(g.away)}@${txt(g.home)}`, group: 'games kicked off',
    }))
    const margin = Math.abs(num(g.home_score) - num(g.away_score))
    if (num(g.period) >= 4 && margin <= 8) {
      out.push(nflEvent({
        key: `nfl:${day}:${g.game_id}:close:${g.period}`,
        category: 'nflclose', priority: 2,
        playerNames: mine.map((l) => txt(l?.name)),
        title: `\u{1F525} One score in ${txt(g.away)}-${txt(g.home)}`,
        body: `${num(g.away_score)}-${num(g.home_score)} · ${txt(g.clock) || '4th'}`,
        short: `${txt(g.away)}-${txt(g.home)}`, group: 'games are close',
      }))
    }
  }

  for (const line of lines) {
    const name = txt(line?.name)
    if (!followsNfl(audience, name)) continue
    const last = lastName(name)
    const tds = num(line?.receiving_tds) + num(line?.rushing_tds)
    const rec = num(line?.receiving_yards)
    const rush = num(line?.rushing_yards)
    const pass = num(line?.passing_yards)

    if (tds >= 1) {
      out.push(nflEvent({
        key: `nfl:${day}:${name}:td:${tds}`,
        category: 'nfltd', priority: 0,
        title: `\u{1F3C8} ${last} scores${tds > 1 ? ` — ${tds}` : ''}`,
        body: `${num(line?.receptions)} rec, ${rec} yds${rush ? ` · ${rush} rush` : ''}`,
        short: `${last}${tds > 1 ? ` (${tds})` : ''}`, group: 'scored',
        playerName: name,
      }))
    }
    const big = rec >= 100 ? ['rec', rec] : rush >= 100 ? ['rush', rush] : pass >= 300 ? ['pass', pass] : null
    if (big) {
      out.push(nflEvent({
        key: `nfl:${day}:${name}:big:${big[0]}:${Math.floor(big[1] / 50) * 50}`,
        category: 'nflbig', priority: 2,
        title: `\u{1F4C8} ${last}: ${big[1]} ${big[0]} yds`,
        body: `${num(line?.receptions)} rec · ${tds} TD`,
        short: `${last} ${big[1]}`, group: 'are having big days',
        playerName: name,
      }))
    }
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

const ET_DAY = (ms) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ms))
  } catch {
    return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10)
  }
}

const LAST_CALL_MINUTES = 35

/**
 * @param rows      the trimmed published board (lib/dash/board.js)
 * @param snap      the live slate, for game state the board cannot know
 * @param day       the Eastern calendar day this run belongs to
 * @param audience  whose names matter
 */
export function pregameEventsFrom(rows, snap, day, audience) {
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

  // ── 1. THE BOARD IS UP ───────────────────────────────────────────────────
  // Once a day, and the only notification in the whole product that brings
  // somebody TO the site rather than telling them what they missed.
  if (mine.length) {
    const best = [...mine].sort((a, b) => num(b?.hr_score) - num(a?.hr_score))[0]
    out.push(mlbEvent({
      key: `mlb:${day}:board`,
      category: 'boardup', priority: 1,
      title: `\u{1F4CB} Tonight's board is up`,
      body: `${mine.length} of your name${mine.length === 1 ? '' : 's'} on it \u{00B7} best is ${lastName(best?.name)} at ${Math.round(num(best?.hr_score))}`,
      short: `${mine.length} names`, group: 'boards published',
      playerIds: mine.map((r) => txt(r?.player_id)),
    }))
  }

  // ── 2. LAST CALL ─────────────────────────────────────────────────────────
  // ONE event for the whole slate, not one per game. Twelve games with your
  // names in them is one message that counts them, or it is twelve messages
  // and a muted app.
  const now = Date.now()
  const soon = mine.filter((r) => {
    const g = gameOf.get(Number(r?.game_pk))
    if (g && g.state !== 'Preview') return false
    const t = Date.parse(r?.game_time || '')
    if (!Number.isFinite(t)) return false
    const mins = (t - now) / 60000
    return mins > 0 && mins <= LAST_CALL_MINUTES
  })
  if (soon.length) {
    const who = [...new Set(soon.map((r) => lastName(r?.name)))]
    out.push(mlbEvent({
      key: `mlb:${day}:lastcall`,
      category: 'lastcall', priority: 1,
      title: `\u{23F0} ${who.length} of yours start soon`,
      body: who.slice(0, 4).join(', ') + (who.length > 4 ? ` +${who.length - 4}` : ''),
      short: `${who.length} starting`, group: 'are about to start',
      playerIds: soon.map((r) => txt(r?.player_id)),
    }))
  }

  // ── 3. HIS GAME IS OFF ───────────────────────────────────────────────────
  // Rare, and the one nobody forgives you for missing. The live feed has
  // carried postponed / suspended / delayed on every game object since
  // 2026-08-09; it just had no way to know whose game it was until the board
  // supplied game_pk.
  const seenGame = new Set()
  for (const r of mine) {
    const pk = Number(r?.game_pk)
    const g = gameOf.get(pk)
    if (!g || seenGame.has(pk)) continue
    const why = g.postponed ? 'postponed' : g.suspended ? 'suspended' : g.delayed ? 'delayed' : ''
    if (!why) continue
    seenGame.add(pk)
    const who = mine.filter((x) => Number(x?.game_pk) === pk).map((x) => lastName(x?.name))
    out.push(mlbEvent({
      key: `mlb:${day}:${pk}:off:${why}`,
      category: 'gameoff', priority: 0,
      title: `\u{26A0}\u{FE0F} ${who.slice(0, 2).join(' and ')} \u{2014} game ${why}`,
      body: txt(g.detail) || `${txt(r?.team)} at ${txt(r?.opponent)}`,
      short: `${who.join(', ')} (${why})`, group: 'games are off',
      playerIds: mine.filter((x) => Number(x?.game_pk) === pk).map((x) => txt(x?.player_id)),
    }))
  }

  // ── 4. HE IS NOT IN IT ───────────────────────────────────────────────────
  // The card is posted for his game and he is not on it. This is the alert
  // that could not ship in pass 34: proving ABSENCE needs to know which game
  // to expect him in, and only the board says that.
  for (const r of mine) {
    const g = gameOf.get(Number(r?.game_pk))
    if (!g?.lineupPosted) continue
    const listed = new Set(
      ['home', 'away'].flatMap((s) => (g.lineup?.[s] || []).map((x) => txt(x?.id))),
    )
    if (!listed.size || listed.has(txt(r?.player_id))) continue
    out.push(mlbEvent({
      key: `mlb:${day}:${r.player_id}:scratched:${r.game_pk}`,
      category: 'scratched', priority: 0,
      title: `\u{26A0}\u{FE0F} ${lastName(r?.name)} is NOT in tonight`,
      body: `${txt(r?.team)} card is posted and he is not on it`,
      short: lastName(r?.name), group: 'were left out',
      playerId: txt(r?.player_id),
    }))
  }

  return out
}

// ── WHO GETS IT ────────────────────────────────────────────────────────────

// Only the categories the sender can actually produce. A category the user has
// never touched falls back to its default here -- anything not in this map is
// off, which is the safe direction for a message that arrives with no tab open.
const DEFAULTS = {
  homer: true, nfltd: true,
  // Pregame. Two on a normal night (the board goes up, last call) and two that
  // are rare by nature, so these are on out of the box: they are the only
  // alerts that reach you while you can still act on them.
  boardup: true, lastcall: true, gameoff: true, scratched: true,
  // The draft happens once. An alert nobody switched on beforehand is an alert
  // nobody gets, so these ship on -- and all three stop existing the moment the
  // draft is over, which is the only reason that is defensible.
  frdraft: true, frclock: true, frauto: true,
  lineup: false, ondeck: false, clutch: false, multihit: false, xbh: false,
  hrr: false, bigbases: false, cold: false, firstpitch: false, finalline: false,
  slate: false, nflbig: false, nflkick: false, nflclose: false,
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
export function wants(state, event) {
  const prefs = state?.dash_alerts_v1?.events
  const on = prefs && typeof prefs === 'object' && event.category in prefs
    ? prefs[event.category]
    : DEFAULTS[event.category]
  if (!on) return false
  if (event.everyone) return true
  // An OWNED event -- a draft pick, a trade offer -- is addressed to one
  // person, and the sender checks that it is reaching them. Following has
  // nothing to do with whose turn it is, so the follow gate below does not
  // apply and must not silently drop it.
  if (event.owner) return true

  const list = state?.dash_follow_v1
  if (!list || typeof list !== 'object') return false

  for (const [key, row] of Object.entries(list)) {
    if (!row || row.removed) continue          // a tombstone is not a follow
    if (!key.startsWith(`${event.sport}:`)) continue
    const rowId = String(row.id)
    const rowName = String(row.name || '').toLowerCase()
    if (event.playerId && rowId === event.playerId) return true
    if (event.playerName && rowName === String(event.playerName).toLowerCase()) return true
    // A GAME-level event -- first pitch, kickoff, a one-score fourth quarter --
    // belongs to whoever follows anyone in it, so it carries the whole list
    // rather than picking one man to hang itself on.
    if (Array.isArray(event.playerIds) && event.playerIds.includes(rowId)) return true
    if (Array.isArray(event.playerNames) && event.playerNames.some((n) => String(n).toLowerCase() === rowName)) return true
  }
  return false
}

/**
 * The union of everyone's follow lists, so the producers can skip the rest of
 * the league. Without this a fifteen-game slate manufactures several hundred
 * lineup events a minute and throws them away one dedupe row at a time.
 */
export function audienceFrom(stateByUser) {
  const mlb = new Set()
  const nfl = new Set()
  const nameOf = new Map()
  for (const state of Object.values(stateByUser || {})) {
    const list = state?.dash_follow_v1
    if (!list || typeof list !== 'object') continue
    for (const [key, row] of Object.entries(list)) {
      if (!row || row.removed) continue
      if (key.startsWith('mlb:')) { mlb.add(String(row.id)); nameOf.set(String(row.id), txt(row.name)) }
      else if (key.startsWith('nfl:')) nfl.add(txt(row.name).toLowerCase())
    }
  }
  return { mlb, nfl, nameOf }
}
