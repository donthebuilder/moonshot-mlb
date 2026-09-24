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

// "2-4, 2HR, 3RBI" -- same shape as lib/headlines.js's mlbLine(), kept as its
// own copy rather than an import: that file is 'use client' (the header
// ticker + Home's headline strip), this one runs server-side in the push
// cron, and the two have no reason to share a module boundary for four lines
// of formatting. AB/H always shows (did he even play tonight); a multi-homer
// game says so instead of just "HR" once; RBI only when he drove somebody in.
const hrStatLine = (l) => {
  const bits = [`${num(l?.h)}-${num(l?.ab)}`]
  const hr = num(l?.hr)
  if (hr > 1) bits.push(`${hr}HR`)
  else if (hr === 1) bits.push('HR')
  if (num(l?.rbi)) bits.push(`${num(l.rbi)}RBI`)
  return bits.join(' \u{00B7} ')
}
const txt = (v) => String(v == null ? '' : v).trim()

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
const NEVER_DROP = new Set(['boardup', 'lastcall', 'dropout'])

export const laneOf = (e) => {
  const p = priorityOf(e)
  if (p === 0 || NEVER_DROP.has(String(e?.category || ''))) return 'urgent'
  return p === 1 ? 'actionable' : 'scoreboard'
}

const MLB_BRAND = '\u{1F4A5} DASH'
const NFL_BRAND = '\u{1F3C8} DASH'
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
          title: `\u{1F4CB} LINEUP`,
          body: `${lastName(name)} is in \u{00B7} batting ${num(row?.slot) || '?'} tonight`,
          short: `${lastName(name)} ${num(row?.slot) || ''}`.trim(), group: 'are in the lineup',
          playerId: id,
        }))

        // ── CALL-UP / FIRST LINEUP EVER ──────────────────────────────────
        //
        // Donovan (2026-09-06, Alert Box Score): "lineup" pings every night a
        // followed man starts, which is most nights for a regular -- he wants
        // it reserved for someone NEW showing up instead. There is no roster
        // feed here to read "call-up" off directly, so this reads it off the
        // one thing pushRules already has: whether we have EVER put this id
        // in a posted lineup before.
        //
        // The key below carries NO day -- it is the dedupe table's own
        // "have we ever told you about this" ledger, repurposed. The first
        // posted lineup a followed man ever appears in claims it, and it can
        // never claim it again, which is exactly a call-up's shape: a thing
        // that happens once.
        //
        // THE BUG THIS USED TO HAVE (fixed 2026-09-14). The paragraph above
        // was true and the implementation was not: dash_push_seen_prune()
        // deletes every row older than two days, so the "forever" ledger
        // forgot every man every third start. The 09-12/09-13 ledger showed
        // 82 "just made a posted lineup" alerts for regulars in two nights.
        //
        // The memory that actually persists is dash_lineup_state -- one row
        // per followed player, written every night he starts, never pruned.
        // A man with NO row there has never been seen in a posted lineup by
        // this sender, and THAT is a call-up. The everlineup key stays as the
        // in-night dedupe only. Like dropout, this needs lineupState to fire
        // at all: no state, no claim about "first time".
        //
        // Remaining honest limit: a regular you follow for the FIRST time
        // has no row yet and reads as new on his first start after you
        // followed him. Once, per player, per account-lifetime -- not every
        // third night.
        if (lineupState && !lineupState[id]) {
          out.push(mlbEvent({
            key: `mlb:everlineup:${id}`,
            category: 'callup', priority: 1, url: mlbPlayerUrl(id),
            title: `\u{1F195} NEW LINEUP APPEARANCE`,
            body: `${lastName(name)} is in for the first time we've seen \u{00B7} batting ${num(row?.slot) || '?'}`,
            short: `${lastName(name)} (new)`, group: 'are new to the lineup',
            playerId: id,
          }))
        }
      }
    }
  }

  // ── DROPPED FROM THE LINEUP ────────────────────────────────────────────
  //
  // Call-up's mirror. Donovan (2026-09-06): a ping when a followed man who
  // would normally be starting is not. Unlike `scratched` above (which only
  // knows to look because a player has a prop on tonight's board), this has
  // to work for every follow, board or no board -- so it needs its own
  // memory of "which team did we last see him start for", which the route
  // keeps in dash_lineup_state and hands in here as `lineupState`. See
  // lineupUpdatesFrom() below for the other half: the rows that keep that
  // memory current.
  //
  // Fires only when there is real news: his team has to be ACTUALLY PLAYING
  // tonight, with a POSTED lineup, and he has to not be on it. No game for
  // that team tonight is an off day, not a benching, and stays silent.
  if (lineupState) {
    for (const [id, seen] of Object.entries(lineupState)) {
      if (!follows(audience, id) || seen?.teamId == null) continue
      const g = games.find((x) => Number(x?.homeId) === Number(seen.teamId) || Number(x?.awayId) === Number(seen.teamId))
      if (!g?.lineupPosted) continue
      const listed = new Set(['home', 'away'].flatMap((s) => (g.lineup?.[s] || []).map((x) => txt(x?.id))))
      if (listed.has(id)) continue
      // A man on tonight's board is `scratched`'s business (P0, from the
      // board join). Saying it again here was the scratch + dropout double
      // the 09-14 audit found. Without a board in hand the route's own
      // post-filter catches the same overlap inside one sweep.
      if (board?.ids?.has(id)) continue
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:dropout`,
        category: 'dropout', priority: 1, url: mlbPlayerUrl(id),
        title: `\u{1F4E4} LINEUP CHANGE`,
        body: `${lastName(seen.name)} is out \u{00B7} his team's card is up without him`,
        short: `${lastName(seen.name)} (out)`, group: 'dropped from the lineup',
        playerId: id,
      }))
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
      key: `mlb:${mlbDayOf(g, day)}:${g.pk}:firstpitch`,
      category: 'firstpitch', priority: 3,
      // One name in this game, so the message is about him; open his card.
      // Two or more and there is no single right destination -- the board is.
      url: mine.length === 1 ? mlbPlayerUrl(txt(mine[0]?.id)) : MLB_URL,
      playerIds: mine.map((r) => txt(r?.id)),
      title: `\u{25B6}\u{FE0F} UNDERWAY`,
      body: who.length > 2
        ? `${who.slice(0, 2).join(' and ')} \u{00B7} ${who.length} of your names in this one`
        : `${who.join(' and ')} \u{00B7} first pitch`,
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
        key: `mlb:${mlbDayOf(g, day)}:${id}:hr:${hr}`,
        category: 'homer', priority: 0, url: mlbPlayerUrl(id, 'spray'),
        title: hr > 1 ? `\u{1F4A5} ${name} GOES DEEP AGAIN \u{00B7} ${hr} TONIGHT` : `\u{1F4A5} ${name} GOES DEEP`,
        body: `${lineWord(line)}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name}${hr > 1 ? ` (${hr})` : ''}`, group: 'went deep',
        playerId: id,
      }))
    }
    if (h >= 2) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:hit:${h}`,
        category: 'multihit', priority: 2, url: mlbPlayerUrl(id),
        title: `\u{1F3AF} MULTI-HIT`,
        body: `${h === 2 ? `${name} is ${h}-for-${ab}` : `${name} has ${h} hits`}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name} ${h}-${ab}`, group: 'have multi-hit nights',
        playerId: id,
      }))
    }
    if (xbh >= 1 && hr < 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:xbh:${xbh}`,
        category: 'xbh', priority: 2, url: mlbPlayerUrl(id, 'spray'),
        title: `\u{26A1} EXTRA BASES`,
        body: `${name} ${num(line?.d3) ? 'triples' : 'doubles'} \u{00B7} ${lineWord(line)}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: name, group: 'got extra bases',
        playerId: id,
      }))
    }
    // hr < 1 guard added 2026-09-06, mirroring xbh above: a solo homer alone
    // clears both bars below (tb hits 4 exactly, hrr clears on the free hit +
    // run + RBI a homer always carries) and the homer event's own body already
    // says so via `cashed`. Without the guard, turning either category on
    // meant every single home run rang the phone two or three times over for
    // the same swing.
    if (hrr >= 2 && hr < 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:hrr`,
        category: 'hrr', priority: 2, url: mlbPlayerUrl(id),
        title: `\u{2705} HRR CLEARED`,
        body: `${name} \u{00B7} ${h} H \u{00B7} ${num(line?.r)} R \u{00B7} ${num(line?.rbi)} RBI${inn ? ` · ${inn}` : ''}`,
        short: name, group: 'cleared HRR',
        playerId: id,
      }))
    }
    if (tb >= 4 && hr < 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:tb:${tb}`,
        category: 'bigbases', priority: 2, url: mlbPlayerUrl(id),
        title: `\u{1F9E8} BIG BASES`,
        body: `${name} has ${tb} total bases \u{00B7} ${num(line?.h)}-${ab}${inn ? ` · ${inn}` : ''}${cashed}`,
        short: `${name} (${tb})`, group: 'are piling bases',
        playerId: id,
      }))
    }
    if (k >= 2 && h === 0 && ab >= 2) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:cold`,
        category: 'cold', priority: 3, url: mlbPlayerUrl(id),
        title: `\u{26A0}\u{FE0F} COLD START`,
        body: `${name} is 0-for-${ab} \u{00B7} ${k} K${inn ? ` · ${inn}` : ''}`,
        short: `${name} 0-${ab}`, group: 'are going cold',
        playerId: id,
      }))
    }
    if (line?.settled && ab >= 1) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${id}:final`,
        category: 'finalline', priority: 3, url: mlbPlayerUrl(id),
        title: `\u{1F3C1} FINAL LINE`,
        body: `${name} finished ${h}-for-${ab} \u{00B7} ${bars.length ? `Cleared ${bars.join(', ')}` : 'Nothing cleared tonight'}`,
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

    // ── TRIMMED, 2026-08-31 (Donovan: "the next up thing can be annoying") ──
    //
    // This used to send IN THE HOLE as well as ON DECK, and to carry the out
    // count in the key. Both were wrong in the same direction.
    //
    // In the hole is the same at-bat announced twice. A hitter comes up four
    // or five times a night, so following three men bought you twenty-odd
    // "coming up" messages before anybody had actually done anything -- and
    // the second one told you nothing the first had not.
    //
    // The out count in the key was worse, because it looked harmless. A
    // batting order that turns over inside one inning put the same man on deck
    // at nought outs and again at two, and those were different keys, so the
    // dedupe table let both through.
    //
    // One message, per man, per half-inning, for the spot that is actually
    // worth walking to a television for. The body still says the out count; it
    // is just no longer allowed to mint a second notification.
    const deckId = txt(g?.onDeck)
    if (deckId && follows(audience, deckId)) {
      const name = lastName(g?.onDeckName)
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${deckId}:deck:${g.pk}:${num(g?.inning)}`,
        category: 'ondeck', priority: 1, url: mlbPlayerUrl(deckId),
        // \u{1F3A4} retired 2026-09-03 (Donovan: "I don't like the microphone
        // for up-now"). A bat says baseball at a glance; a microphone said
        // podcast.
        title: `\u{26BE} ON DECK`,
        body: `${name} \u{00B7} ${outs} out${outs === 1 ? '' : 's'}${on ? ` \u{00B7} ${on} on` : ''}${inn ? ` · ${inn}` : ''}`,
        short: `${name} on deck`, group: 'are coming up',
        playerId: deckId,
      }))
    }

    // on1/on2/on3 carry a runner's NAME, or the placeholder the slate uses
    // when the linescore reports a runner without one -- either way, truthy
    // means occupied. `outs` is the gate that says linescore detail is
    // actually flowing (see lib/liveSlate.js); without it, bases-empty and
    // fields-stripped look identical and every game would read as loaded.
    // Computed here, ahead of `clutch`, so that block can exclude the one
    // situation `slam` already owns (see its own comment below).
    const loaded = g?.outs != null && !!g?.on1 && !!g?.on2 && !!g?.on3

    // The spot worth stopping what you are doing for: your man at the plate,
    // late, with the game still in the balance and men to drive in.
    //
    // `!loaded` added 2026-09-06: bases loaded, late, close is ALSO exactly
    // `slam`'s condition below, and until this guard a followed batter up in
    // that spot got both -- the bases-loaded alert and this one, back to
    // back, about the same at-bat. Loaded-and-clutch keeps its notification;
    // it is just the louder, priority-0 one.
    const upId = txt(g?.upBatter)
    if (upId && follows(audience, upId) && late && margin <= 3 && on >= 1 && !loaded) {
      const name = lastName(g?.upBatterName)
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${upId}:clutch:${g.pk}:${num(g?.inning)}:${outs}:${on}`,
        category: 'clutch', priority: 1, url: mlbPlayerUrl(upId),
        title: `\u{1F525} CLUTCH SPOT`,
        body: `${name} up \u{00B7} ${on} on \u{00B7} ${inn} \u{00B7} ${outs} out${outs === 1 ? '' : 's'} \u{00B7} ${num(g?.awayScore)}-${num(g?.homeScore)}, ${margin === 0 ? 'tied' : `${margin} run${margin === 1 ? '' : 's'}`}`,
        short: `${name} (${on} on)`, group: 'are in a spot',
        playerId: upId,
      }))
    }

    // ── THE BASES ARE LOADED AND HE IS UP ──────────────────────────────────
    //
    // On a site whose whole subject is the home run, this is the single
    // biggest thing that can be about to happen, and it has a shelf life of
    // one at-bat. Priority 0 alongside the homer itself: never held, never
    // throttled -- a slam chance you hear about eleven minutes late is a slam
    // chance you were not told about.
    //
    // AT THE PLATE ONLY, deliberately. The on-deck version has more lead time
    // and is mostly wrong by the time he bats: bases rarely stay loaded
    // through an at-bat, so it would spend most of its messages on chances
    // that never existed. This one is true when it is sent.
    const slamId = txt(g?.upBatter)
    if (loaded && slamId && follows(audience, slamId)) {
      const slamName = lastName(g?.upBatterName)
      out.push(mlbEvent({
        // One per at-bat: he stays at the plate across several ticks with the
        // same inning and out count, and this must not fire on each of them.
        key: `mlb:${mlbDayOf(g, day)}:${slamId}:slam:${g.pk}:${num(g?.inning)}:${outs}`,
        category: 'slam', priority: 0, url: mlbPlayerUrl(slamId),
        title: `\u{1F9E8} BASES LOADED`,
        body: `${slamName} is up \u{00B7} ${outs} out${outs === 1 ? '' : 's'}${inn ? ` \u{00B7} ${inn}` : ''} \u{00B7} ${num(g?.awayScore)}-${num(g?.homeScore)}`,
        short: `${slamName} (loaded)`, group: 'are up with the bases loaded',
        playerId: slamId,
      }))
    }
  }

  // ── THE SCORE, IN A GAME YOU HAVE SOMEBODY IN ────────────────────────────
  //
  // WHOSE SIDE, NOT WHICH CLUB. The snapshot carries team IDs and scores but
  // no team names -- lib/mlbTeams.js is keyed by abbreviation and the schedule
  // pull does not ask for one. Rather than add a field to a request the whole
  // site depends on, these read the side your man is ON, out of the lineup
  // that is already there. "Judge's side goes ahead" beats "NYY 5, BOS 4"
  // anyway: it is the sentence you were going to translate it into.
  //
  // LATE AND CLOSE ONLY, and that is a deliberate narrowing of what was asked
  // for. A true lead-CHANGE cannot be detected here: this producer is
  // stateless by design and sees one snapshot, never the one before it. What
  // it can do is fire on each new scoreline from the seventh on while the
  // margin is three or less -- which is where a score update is news, and
  // which bounds it to a handful a game instead of one per run all night. A
  // 10-2 game in the eighth says nothing at all.
  for (const g of games) {
    if (g?.state !== 'Live' && g?.state !== 'Final') continue
    const mineHome = (g.lineup?.home || []).filter((r) => follows(audience, txt(r?.id)))
    const mineAway = (g.lineup?.away || []).filter((r) => follows(audience, txt(r?.id)))
    const rows = [...mineHome, ...mineAway]
    if (!rows.length) continue
    const side = mineHome.length >= mineAway.length ? 'home' : 'away'
    const hs = num(g?.homeScore)
    const as = num(g?.awayScore)
    const ours = side === 'home' ? hs : as
    const theirs = side === 'home' ? as : hs
    const who = rows.map((r) => lastName(r?.name))
    const whose = who.length === 1 ? `${who[0]}'s side` : `${who.slice(0, 2).join(' and ')}'s side`
    const line = `${ours}-${theirs}`
    const ids = rows.map((r) => txt(r?.id))

    if (g.state === 'Live' && num(g?.inning) >= 7 && Math.abs(hs - as) <= 3) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${g.pk}:score:${hs}-${as}`,
        category: 'leadchg', priority: 2, playerIds: ids,
        title: ours > theirs
          ? `\u{1F53C} ${whose} leads ${line}`
          : ours < theirs ? `\u{1F53D} ${whose} trails ${line}` : `\u{2696}\u{FE0F} Tied ${line}`,
        body: `${inningWord(g) || 'Late'}${g?.outs != null ? ` \u{00B7} ${num(g.outs)} out${num(g.outs) === 1 ? '' : 's'}` : ''}`,
        short: `${who[0]} ${line}`, group: 'are in a close one',
      }))
    }

    // `settled` excludes postponed and suspended: a game that STOPPED is not a
    // game that finished, and a final score for one would be a lie.
    if (g.settled) {
      out.push(mlbEvent({
        key: `mlb:${mlbDayOf(g, day)}:${g.pk}:final`,
        category: 'gamefinal', priority: 3, playerIds: ids,
        title: `\u{1F3C1} FINAL`,
        body: `${ours > theirs ? `${whose} win ${line}` : ours < theirs ? `${whose} lose ${line}` : `Tied ${line}`} \u{00B7} ${who.length > 2 ? `${who.length} of your names in this one` : who.join(', ')}`,
        short: `${who[0]} ${line}`, group: 'games finished',
      }))
    }
  }

  // ── ANYONE, NOT JUST YOURS ───────────────────────────────────────────────
  // The one producer the audience filter does not apply to, because the whole
  // point of it is the names you did not pick. Off by default, and priority 4
  // so it can never crowd out a followed player's homer.
  //
  // THE BODY USED TO SAY "Not one of yours" (2026-09-06). Donovan didn't like
  // it -- it tells you what the alert ISN'T instead of anything about the
  // homer itself, on a notification whose whole reason to exist is "this guy
  // just went deep." Swapped for the same box-score line the front-page
  // ticker and headline strip already use (lib/headlines.js's mlbLine()) --
  // AB/H first, then whatever's actually worth bragging about (multi-homer
  // night, extra bases, RBI). No extra API call: `line` already carries
  // every field this needs from the same boxscore poll that found the HR.
  //
  // BOARD HIT vs NOT ON BOARD (2026-09-14). A slate homer used to be a generic
  // homer feed. With tonight's board in hand it becomes the one Moonshot
  // sentence worth sending about a man you did not pick: he WAS on the board,
  // and here is where. `boardHit` is what discordAlerts.js keys on -- a board
  // hit is a story for the room, a random homer is not. Without a board the
  // event keeps the plain stat line and carries no boardHit flag at all.
  for (const [id, line] of Object.entries(lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    if (audience?.mlb?.has(String(id))) continue   // he already got his own, louder
    const g = gameOf.get(Number(line?.pk))
    const hit = board?.of?.get(String(id))
    const known = Boolean(board?.ids?.size)
    out.push(mlbEvent({
      key: `mlb:${mlbDayOf(g, day)}:${id}:anyhr:${hr}`,
      category: 'slate', priority: 4, url: mlbPlayerUrl(id, 'spray'),
      title: hr > 1 ? `\u{1F4A5} ${lastName(line?.name)} GOES DEEP AGAIN \u{00B7} ${hr} TONIGHT` : `\u{1F4A5} ${lastName(line?.name)} GOES DEEP`,
      body: hit
        ? `#${hit.rank} on tonight's Moonshot board${hit.role ? ` \u{00B7} ${hit.role} pick` : ''} \u{00B7} HR score ${hit.score} \u{00B7} ${hrStatLine(line)}`
        : known ? `Not on tonight's Moonshot board \u{00B7} ${hrStatLine(line)}` : hrStatLine(line),
      short: hit ? `${lastName(line?.name)} (#${hit.rank})` : lastName(line?.name),
      group: hit ? 'went deep on the board' : known ? 'went deep off the board' : 'went deep on the slate',
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
export function nflEventsFrom(snap, day, audience) {
  const out = []
  const games = Array.isArray(snap?.games) ? snap.games : []
  const lines = snap?.lines?.values ? [...snap.lines.values()] : []

  for (const g of games) {
    if (g?.state !== 'in') continue
    const mine = lines.filter((l) => l?.game_id === g.game_id && followsNfl(audience, l?.name))
    if (!mine.length) continue
    // priority bumped 0 and ships ON as of 2026-09-06, via the Alert Box
    // Score board -- Donovan wants kickoff itself immediate and on by
    // default, not bundled into the quiet 10-minute window with everything
    // else.
    out.push(nflEvent({
      key: `nfl:${nflDayOf(g, day)}:${g.game_id}:kick`,
      category: 'nflkick', priority: 0,
      playerNames: mine.map((l) => txt(l?.name)),
      title: `\u{1F3C8} KICKOFF`,
      body: `${txt(g.away)} at ${txt(g.home)} \u{00B7} ${mine.length} of your names ${mine.length === 1 ? 'is' : 'are'} in this one`,
      short: `${txt(g.away)}@${txt(g.home)}`, group: 'games kicked off',
    }))
    // ── THE RED ZONE ───────────────────────────────────────────────────────
    //
    // Football's bases loaded, and on a touchdown site the same argument
    // applies: it is the biggest thing that can be about to happen and it
    // lasts a couple of minutes. Priority 0 beside the touchdown itself.
    //
    // POSSESSION IS THE POINT. "Somebody is in the red zone" is worth nothing
    // -- your man's team has to have the ball. lines carry the team, so this
    // narrows `mine` to the players actually on the side that is threatening.
    //
    // ONE PER TEAM PER QUARTER, not per play. down and distance change on
    // every snap, and a key carrying them would fire four times on one drive
    // -- the same mistake the on-deck alert was making until it was trimmed.
    // A team with two red-zone trips in one quarter gets one message, which is
    // the right side to err on.
    if (g.redZone === true && g.possession) {
      const threatening = mine.filter((l) => txt(l?.team).toUpperCase() === txt(g.possession).toUpperCase())
      if (threatening.length) {
        const who = threatening.map((l) => lastName(l?.name))
        out.push(nflEvent({
          key: `nfl:${nflDayOf(g, day)}:${g.game_id}:red:${txt(g.possession)}:${num(g.period)}`,
          category: 'nflred', priority: 0,
          playerNames: threatening.map((l) => txt(l?.name)),
          title: `\u{1F6A9} RED ZONE`,
          body: `${txt(g.possession)} is inside the 20 \u{00B7} ${who.slice(0, 3).join(', ')}${txt(g.downDistance) ? ` \u{00B7} ${txt(g.downDistance)}` : ''}${txt(g.clock) ? ` \u{00B7} ${txt(g.clock)}` : ''}`,
          short: `${txt(g.possession)} (${who[0]})`, group: 'are in the red zone',
        }))
      }
    }

    const margin = Math.abs(num(g.home_score) - num(g.away_score))
    if (num(g.period) >= 4 && margin <= 8) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${g.game_id}:close:${g.period}`,
        category: 'nflclose', priority: 2,
        playerNames: mine.map((l) => txt(l?.name)),
        title: `\u{1F525} ONE-SCORE GAME`,
        body: `${txt(g.away)}-${txt(g.home)} \u{00B7} ${num(g.away_score)}-${num(g.home_score)} · ${txt(g.clock) || '4th'}`,
        short: `${txt(g.away)}-${txt(g.home)}`, group: 'games are close',
      }))
    }
  }

  for (const line of lines) {
    const name = txt(line?.name)
    if (!followsNfl(audience, name)) continue
    const g = games.find((x) => x?.game_id === line?.game_id)
    const last = lastName(name)
    const tds = num(line?.receiving_tds) + num(line?.rushing_tds)
    const rec = num(line?.receiving_yards)
    const rush = num(line?.rushing_yards)
    const pass = num(line?.passing_yards)

    if (tds >= 1) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:td:${tds}`,
        category: 'nfltd', priority: 0,
        title: tds > 1 ? `\u{1F3C8} ${last} SCORES AGAIN \u{00B7} ${tds} TODAY` : `\u{1F3C8} TOUCHDOWN`,
        body: `${tds > 1 ? '' : `${last} scores \u{00B7} `}${num(line?.receptions)} rec \u{00B7} ${rec} yds${rush ? ` \u{00B7} ${rush} rush` : ''}`,
        short: `${last}${tds > 1 ? ` (${tds})` : ''}`, group: 'scored',
        playerName: name,
      }))
    }
    const big = rec >= 100 ? ['rec', rec] : rush >= 100 ? ['rush', rush] : pass >= 300 ? ['pass', pass] : null
    if (big) {
      out.push(nflEvent({
        key: `nfl:${nflDayOf(g, day)}:${name}:big:${big[0]}:${Math.floor(big[1] / 50) * 50}`,
        category: 'nflbig', priority: 2,
        title: `\u{1F4C8} BIG DAY`,
        body: `${last}: ${big[1]} ${big[0]} yds \u{00B7} ${num(line?.receptions)} rec \u{00B7} ${tds} TD`,
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
      title: `\u{1F4CB} YOUR BOARD IS LIVE`,
      body: `${mine.length} of your name${mine.length === 1 ? '' : 's'} made it \u{00B7} best: ${lastName(best?.name)} (${Math.round(num(best?.hr_score))})`,
      short: `${mine.length} names`, group: 'boards are live',
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
      title: `\u{23F0} FIRST PITCH IS CLOSE`,
      body: `${who.length} of yours start soon \u{00B7} ` + who.slice(0, 4).join(', ') + (who.length > 4 ? ` +${who.length - 4}` : ''),
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
      title: `\u{26A0}\u{FE0F} GAME UPDATE`,
      body: `${who.slice(0, 2).join(' + ')} \u{00B7} ${why} \u{00B7} ${txt(g.detail) || `${txt(r?.team)} at ${txt(r?.opponent)}`}`,
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
      title: `\u{26A0}\u{FE0F} SCRATCH`,
      body: `${lastName(r?.name)} is out tonight \u{00B7} ${txt(r?.team)} card is posted without him`,
      short: lastName(r?.name), group: 'were scratched',
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
  // The bases-loaded spot ships ON. Priority 0, rare, and the single most
  // on-topic thing this site can say -- a home-run site that stayed quiet for
  // a slam chance would be missing its own point.
  slam: true,
  // Football's version of the same argument, and on by default for the same
  // reason: a touchdown site that stays quiet while your man's offence is
  // inside the twenty is not doing its job.
  nflred: true,
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
  multihit: false, callup: false,
  lineup: false, ondeck: false, clutch: false, xbh: false,
  hrr: false, bigbases: false, cold: false, firstpitch: false, finalline: false,
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
