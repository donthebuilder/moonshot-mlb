// lib/nfl/gameSplits.js -- TUDDY's twin of MOONSHOT's per-game combo filter
// (components/PlayerSplits.js ComboFilter + aggregateGames), pure and
// server-safe so one deterministic script can test it.
//
// THE DATA. nfl_logs.json's per-game rows (bots/nfl/nfl_gamelog.py) carry, since
// the 2026-10-06 bot change: d (date), h (1 home / 0 away; ABSENT at a neutral
// site), wd (kickoff weekday), rf (roof), sf (surface), r (W/L/T for his team;
// absent until scored), rs (rest days) -- next to the older s, w, opp, tm and
// the g_* stat columns. A log published BEFORE that change has none of them:
// every dimension below then has no options, the filter hides itself, and the
// page reads exactly as it did. Nothing is guessed from a missing field.
//
// BUCKETS MIRROR THE BOT (bots/nfl/nfl_splits.py SPLITS) so a combo line and a
// split row never disagree about what "indoors" or "short week" means:
//   indoors = dome | closed; outdoors = outdoors (a retractable "open" roof is in
//   neither); grass = grass; turf = any other named surface; short week = rest
//   <= 6 days; bye / long rest = rest >= 8 days.
import { stadiumOf } from './stadiums'

/** Fewer games than this and a line is a curiosity, not a signal (MOONSHOT's THIN_PA twin). */
export const THIN_G = 6
/** Under this the combo line says "very thin" out loud (MOONSHOT: pa < 20). */
export const VERY_THIN_G = 3
export const SHORT_REST = 6
export const LONG_REST = 8

export const WEEKDAYS = ['Thu', 'Sun', 'Mon', 'Sat', 'Fri']

const has = (v) => v !== undefined && v !== null && v !== ''

/** Does the log carry the per-game context at all? */
export function hasContext(log) {
  return Array.isArray(log) && log.some((g) => has(g?.d) || has(g?.wd) || has(g?.r) || has(g?.rs) || has(g?.rf))
}

const roofBucket = (rf) => (rf === 'dome' || rf === 'closed' ? 'indoors' : rf === 'outdoors' ? 'outdoors' : null)
const turfBucket = (sf) => (!has(sf) ? null : sf === 'grass' ? 'grass' : 'turf')
const restBucket = (rs) => (!Number.isFinite(rs) ? null : rs <= SHORT_REST ? 'short' : rs >= LONG_REST ? 'rested' : 'normal')

/** The home club of one game row: the building it was played in. null at a neutral site or when unknown. */
export function homeTeamOf(g) {
  if (g?.h === 1) return g.tm || null
  if (g?.h === 0) return g.opp || null
  return null
}

/** One log row -> the value of each dimension (null = this row can't say). */
export function dimsOf(g) {
  return {
    season: Number.isFinite(g?.s) ? String(g.s) : null,
    day: has(g?.wd) ? g.wd : null,
    ha: g?.h === 1 ? 'home' : g?.h === 0 ? 'away' : null,
    res: g?.r === 'W' ? 'win' : g?.r === 'L' ? 'loss' : null,        // a tie is neither
    roof: roofBucket(g?.rf),
    turf: turfBucket(g?.sf),
    rest: restBucket(Number(g?.rs)),
    opp: has(g?.opp) ? g.opp : null,
  }
}

const LABELS = {
  day: { Thu: 'Thursday', Sun: 'Sunday', Mon: 'Monday', Sat: 'Saturday', Fri: 'Friday' },
  ha: { home: 'Home', away: 'Away' },
  res: { win: 'Win', loss: 'Loss' },
  roof: { indoors: 'Indoors', outdoors: 'Outdoors' },
  turf: { grass: 'Grass', turf: 'Turf' },
  rest: { short: 'Short week', normal: 'Normal rest', rested: 'Bye / long rest' },
}

/**
 * The selectors this player's log can support, in display order. A selector
 * appears only when at least TWO different values exist in his log (a pick of
 * one value would be the same as no filter). Shape:
 *   [{ key, placeholder, options: [{ v, label }] }]
 */
export function comboFields(log) {
  if (!Array.isArray(log) || !log.length) return []
  const seen = {}
  for (const g of log) {
    const d = dimsOf(g)
    for (const k of Object.keys(d)) if (d[k] != null) (seen[k] = seen[k] || new Set()).add(d[k])
  }
  const out = []
  const push = (key, placeholder, options) => { if (options.length > 1) out.push({ key, placeholder, options }) }
  const known = (k, order) => order.filter((v) => seen[k]?.has(v)).map((v) => ({ v, label: LABELS[k][v] }))
  push('day', 'Any day', WEEKDAYS.filter((v) => seen.day?.has(v)).map((v) => ({ v, label: LABELS.day[v] })))
  push('ha', 'Home/Away', known('ha', ['home', 'away']))
  push('res', 'Win/Loss', known('res', ['win', 'loss']))
  push('roof', 'Roof', known('roof', ['indoors', 'outdoors']))
  push('turf', 'Surface', known('turf', ['grass', 'turf']))
  push('rest', 'Rest', known('rest', ['short', 'normal', 'rested']))
  push('opp', 'Any opponent', [...(seen.opp || [])].sort().map((v) => ({ v, label: `vs ${v}` })))
  push('season', 'Any season', [...(seen.season || [])].sort().reverse().map((v) => ({ v, label: v })))
  return out
}

/** AND every chosen selector. `sel` is { key: value }; empty values are ignored. */
export function filterGames(log, sel = {}) {
  const on = Object.entries(sel).filter(([, v]) => v)
  if (!on.length) return Array.isArray(log) ? [...log] : []
  return (log || []).filter((g) => {
    const d = dimsOf(g)
    return on.every(([k, v]) => d[k] === v)
  })
}

const PER_GAME = [
  ['recyd', 'g_recyd'], ['rec', 'g_rec'], ['ruyd', 'g_ruyd'], ['car', 'g_car'], ['payd', 'g_payd'],
]

/**
 * Rows in, one line out: games, touchdowns, TD a game, the share of games with
 * at least one, and the per-game rate of each yardage stat. Football's twin of
 * aggregateGames(); a stat he never records in the window comes back null so
 * the table does not draw a column of zeroes for a kicker's receiving yards.
 */
export function aggregateNflGames(rows) {
  const g = rows.length
  if (!g) return { g: 0 }
  const sum = (f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0)
  const td = sum('g_td')
  const tdG = rows.filter((r) => (Number(r.g_td) || 0) >= 1).length
  const out = {
    _key: 'combo', split: 'Combo', g, td, tdPerG: td / g, tdPct: (100 * tdG) / g, tdG,
    multi: rows.filter((r) => (Number(r.g_td) || 0) >= 2).length,
    thin: g < THIN_G, veryThin: g < VERY_THIN_G,
  }
  for (const [k, f] of PER_GAME) {
    const total = sum(f)
    out[k] = total > 0 ? total / g : null
  }
  return out
}

/** The upcoming game's building -> his record in it, from the log. Honest or null. */
// A club that moved is a different building: only games from this season on count.
const BUILDING_SINCE = { BUF: 2026 }

export function stadiumRecord(log, venueName) {
  if (!venueName || !Array.isArray(log)) return null
  const here = log.filter((g) => {
    const home = homeTeamOf(g)
    if (!home) return false
    if (BUILDING_SINCE[home] && (g.s || 0) < BUILDING_SINCE[home]) return false
    return stadiumOf(home)?.name === venueName
  })
  const all = log.filter((g) => g.h === 1 || g.h === 0)
  if (!here.length || !all.length) return null
  const a = aggregateNflGames(here)
  const base = aggregateNflGames(all)
  return { ...a, venue: venueName, baseTdPerG: base.tdPerG, baseGames: base.g, seasons: [...new Set(here.map((g) => g.s))].sort() }
}
