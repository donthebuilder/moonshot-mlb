// ═══════════════════════════════════════════════════════════════════════════
// ⚾⚾ DOUBLEHEADERS — the same hitter, legitimately, twice
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-17, looking at the board: "names also duplicated idk whats
// thats about."
//
// WHAT IT ACTUALLY WAS. Nothing was duplicated. On 08-17 the live slate carried
// 195 rows and 17 player_ids appeared twice — every one of them a St. Louis or
// Cincinnati bat. STL @ CIN was a doubleheader: game_pk 824514 at 17:40 and
// 824478 at 22:40. Alec Burleson really does hit twice today. Two rows is the
// correct answer.
//
// SO WHY DID IT READ AS A BUG. Because the two rows were IDENTICAL on screen —
// same name, same team, same opponent, same every score, no first-pitch column
// on that board. Two indistinguishable rows are worse than either one row or
// two labelled ones: the reader's only available conclusion is that the page is
// broken, and on this occasion the page was right and looked wrong.
//
// WHAT NOT TO DO: dedupe them. That would delete a real plate appearance —
// straight through the house rule that information is never removed, only
// re-formed. It would also silently halve a doubleheader team's presence on
// every board on exactly the days they matter most.
//
// WHAT THIS DOES: works out, per slate, which game_pks belong to a matchup
// played more than once, numbers them by first pitch, and hands back a marker
// so a board can say G1 / G2. Absent entirely on a normal day — no column, no
// glyph, no cost.
//
// ORDERING. By first pitch ascending, because that is what "game 1" means to
// anyone reading it. game_pk is the tiebreak and NOT the primary key: MLB
// assigns them in scheduling order, which is usually chronological and is not
// guaranteed to be — on 08-17 the 17:40 game is 824514 and the 22:40 game is
// 824478, i.e. the higher pk is the EARLIER game. Sorting on pk would have
// labelled this doubleheader backwards, and it would have looked authoritative.

import { n, clean } from './player'

/** Both halves of a matchup, order-independent, so home/away rows group. */
function matchKey(p) {
  const a = clean(p?.team, '').toUpperCase()
  const b = clean(p?.opp, '').toUpperCase()
  // A row missing its opponent still groups by team — the 08-17 slate publishes
  // opp as null on every row, which is a separate bot gap. Falling back to team
  // alone is what makes this work anyway: a team with two game_pks tonight is a
  // doubleheader whether or not the row names who they are playing.
  return b ? [a, b].sort().join('@') : a
}

function firstPitch(p) {
  const t = clean(p?.game_time, '')
  const ms = t ? Date.parse(t) : NaN
  return Number.isFinite(ms) ? ms : null
}

/**
 * Map of game_pk → { num, of } for every game in a repeated matchup.
 *
 * Returns an EMPTY map on an ordinary slate, which is the signal callers use to
 * render nothing at all.
 */
export function gameNumbers(rows = []) {
  const byMatch = new Map()
  for (const p of rows || []) {
    const pk = clean(p?.game_pk, '')
    if (!pk) continue
    const k = matchKey(p)
    if (!k) continue
    if (!byMatch.has(k)) byMatch.set(k, new Map())
    const games = byMatch.get(k)
    if (!games.has(pk)) games.set(pk, firstPitch(p))
    else if (games.get(pk) == null) games.set(pk, firstPitch(p))
  }

  const out = new Map()
  for (const games of byMatch.values()) {
    if (games.size < 2) continue          // the ordinary case: nothing to say
    const ordered = [...games.entries()].sort((x, y) => {
      const tx = x[1]; const ty = y[1]
      // A game with no published time sorts last rather than winning by
      // accident — an unknown first pitch is not an early one.
      if (tx == null && ty == null) return String(x[0]).localeCompare(String(y[0]))
      if (tx == null) return 1
      if (ty == null) return -1
      if (tx !== ty) return tx - ty
      return String(x[0]).localeCompare(String(y[0]))
    })
    ordered.forEach(([pk], i) => out.set(String(pk), { num: i + 1, of: ordered.length }))
  }
  return out
}

/** Is any matchup on this slate being played more than once? */
export function hasDoubleheader(rows = []) {
  return gameNumbers(rows).size > 0
}

/** 1, 2, … for a hitter in a repeated matchup; 0 for everyone else. */
export function gameNumOf(p, map) {
  if (!map || !map.size) return 0
  const g = map.get(clean(p?.game_pk, ''))
  return g ? g.num : 0
}

/** "G1" / "G2", or '' when there is nothing to disambiguate. */
export function gameTag(p, map) {
  const num = gameNumOf(p, map)
  return num ? `G${num}` : ''
}

/**
 * The sentence a board prints above itself when a doubleheader is on.
 *
 * Written as a sentence and not a badge legend because the reader's question is
 * "why is this name here twice", and the answer is a fact about the schedule,
 * not a key to a symbol.
 */
export function doubleheaderNote(rows = []) {
  const map = gameNumbers(rows)
  if (!map.size) return ''
  const teams = new Set()
  let dupes = 0
  const seen = new Map()
  for (const p of rows || []) {
    if (!gameNumOf(p, map)) continue
    const t = clean(p?.team, '')
    if (t) teams.add(t)
    const id = clean(p?.player_id, '') || clean(p?.name, '')
    if (!id) continue
    seen.set(id, (seen.get(id) || 0) + 1)
  }
  for (const c of seen.values()) if (c > 1) dupes += 1
  const list = [...teams].sort().join(' and ')
  const games = map.size
  if (!dupes) return ''
  return `${list} ${teams.size === 1 ? 'plays' : 'play'} twice today, so ${dupes} `
    + `hitter${dupes === 1 ? '' : 's'} appear${dupes === 1 ? 's' : ''} on this board `
    + `once per game — the G column says which. Both rows are real; neither is a `
    + `duplicate. ${games} games across ${map.size === 2 ? 'the one matchup' : 'repeated matchups'}.`
}

/**
 * One entry per PERSON, keeping his first (best, if pre-sorted) row.
 *
 * For any "top N" list. A ranked chart of 15 that spends two of its slots on
 * the same man because his team plays twice is a chart of 14, and the second
 * row tells the reader nothing the first did not — same argument as The Four in
 * components/BotPicksStrip.js. Full boards do NOT use this: there, both rows
 * are the point, and the G column tells them apart.
 *
 * Each kept row is tagged `_slateGames` so the surface can say "2×" instead of
 * quietly dropping a game. Condense the form, keep the fact.
 */
export function uniqueByPerson(rows = []) {
  const keyOf = (p) => (p?.player_id != null && p.player_id !== ''
    ? `id:${p.player_id}`
    : `nm:${String(p?.name || '').toLowerCase()}|${String(p?.team || '')}`)

  const games = new Map()
  for (const p of rows || []) {
    const k = keyOf(p)
    if (k === 'nm:|') continue
    games.set(k, (games.get(k) || 0) + 1)
  }
  const seen = new Set()
  const out = []
  for (const p of rows || []) {
    const k = keyOf(p)
    if (k === 'nm:|') { out.push(p); continue }   // unidentifiable: never merged
    if (seen.has(k)) continue
    seen.add(k)
    out.push(Object.assign({}, p, { _slateGames: games.get(k) || 1 }))
  }
  return out
}

/** Everything a board needs, in one call. */
export function useDoubleheader(rows = []) {
  const map = gameNumbers(rows)
  return { map, on: map.size > 0, note: doubleheaderNote(rows), tag: (p) => gameTag(p, map), num: (p) => gameNumOf(p, map) }
}

export const _internals = { matchKey, firstPitch, n }
