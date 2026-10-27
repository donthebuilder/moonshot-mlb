// PAIR HISTORY v2, THE READER (2026-10-07). Pure functions over pairhist_v2_<sport>.json, the bot's
// four-season file of ACTIVE players (bots/pair_history_v2.py, model_version pairhist_v2). Nothing here
// fetches and nothing here invents a number: a file that is missing or the wrong shape reads as null,
// and the page says it is not published yet.
//
//   readPairHistV2(json, sport)      -> the file, or null
//   pairHistRows(file, opts)         -> DenseTable rows, ranked by joint event days
//   seasonLabel(sport, year)         -> '2025' (MLB, NFL) or '25-26' (NHL, NBA)
import { arr } from './player'

const DAY = 86400000

/** The file, or null when it is absent, the wrong sport, or not pairhist_v2. */
export function readPairHistV2(json, sport) {
  if (!json || typeof json !== 'object') return null
  if (json.model_version !== 'pairhist_v2' || json.sport !== sport) return null
  if (!Array.isArray(json.pairs)) return null
  return json
}

// a season that spans two calendar years is written split (NHL: '25-26'); the others by their year
const SPLIT_SEASON = { nhl: true, nba: true }
export const seasonLabel = (sport, y) => (SPLIT_SEASON[sport] ? `${String(y).slice(2)}-${String(y + 1).slice(2)}` : String(y))

// whole days between two YYYY-MM-DD strings, read as dates (never a wall clock): the file's own day
export function daysBetween(from, to) {
  const a = Date.parse(`${String(from).slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${String(to).slice(0, 10)}T12:00:00Z`)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY) : null
}

// THE GAP (2026-10-27, Donovan: "how long it's been since this pair has went ... the over under on how many games both of them
// play on the same day until they score together"). Counted in JOINT GAMES (days both played), the file's own unit:
//   gap    joint games per joint event (200 joint games, 12 joint events -> one every 16.7)
//   line   the half-game that brackets the gap (16.7 -> 16.5; 6.0 -> 6.5), so a count of games can never land on it
//   since  joint games since the last joint event (the file's joint_days_since_last; absent -> null, never guessed)
//   side   'over' when `since` is past the line, 'under' when short of it
// A TRACKING LINE, NOT A PREDICTION: a long gap does not raise tonight's odds. Under PACE_MIN_JOINT_DAYS joint games or
// PACE_MIN_EVENT_DAYS joint events there is no line (a gap off 1 or 2 events is noise).
export const PACE_MIN_JOINT_DAYS = 5
export const PACE_MIN_EVENT_DAYS = 2
export function paceLine(jointDays, jointEvents) {
  const jd = Number(jointDays), je = Number(jointEvents)
  if (!Number.isFinite(jd) || !Number.isFinite(je) || je <= 0 || jd < PACE_MIN_JOINT_DAYS || je < PACE_MIN_EVENT_DAYS) return { gap: null, line: null }
  const gap = jd / je
  return { gap: Math.round(gap * 10) / 10, line: Math.floor(gap) + 0.5 }
}
/** 'over' / 'under' the line; null when there is no line or no count of games since. */
export const paceSide = (since, line) => (Number.isFinite(since) && Number.isFinite(line) ? (since > line ? 'over' : 'under') : null)

// TEAMMATES (2026-10-27, Donovan: "filter out same teams ... and one that will only show the same team pairings"): 'same' when both
// men are on one club in the file (each man's club as of his newest game), 'cross' when on two, null when either club is missing.
export const pairMates = (a, b) => (a?.team && b?.team ? (a.team === b.team ? 'same' : 'cross') : null)

/**
 * Rows for the table. `asOf` is the day the file was built (its own generated_at), so "days ago" is
 * how long before the file the pair last did it together, and a stale file does not look fresh.
 */
export function pairHistRows(file, { query = '', sameGameOnly = false } = {}) {
  if (!file) return []
  const q = String(query || '').toLowerCase().trim()
  const asOf = String(file.generated_at || '').slice(0, 10)
  const seasons = arr(file.seasons_covered)
  const rows = []
  arr(file.pairs).forEach((p) => {
    const ps = arr(p?.players)
    if (ps.length < 2) return
    const names = `${ps[0]?.name || ''} ${ps[1]?.name || ''}`.toLowerCase()
    if (q && !names.includes(q)) return
    if (sameGameOnly && !(Number(p.same_game_event_days) > 0)) return
    const row = {
      _key: String(p.pair_key || `${ps[0]?.player_id}|${ps[1]?.player_id}`),
      _a: ps[0], _b: ps[1],
      pair: `${ps[0]?.name || ''} + ${ps[1]?.name || ''}`,
      jd: Number(p.joint_days),
      je: Number(p.joint_event_days),
      sg: Number(p.same_game_event_days),
      rate: Number.isFinite(Number(p.rate)) ? Math.round(Number(p.rate) * 1000) / 10 : null,
      exp: Number.isFinite(Number(p.expected_joint)) ? Number(p.expected_joint) : null,
      lift: Number.isFinite(Number(p.lift)) ? Number(p.lift) : null,
      last: p.last_joint_date || null,
      ago: p.last_joint_date && asOf ? daysBetween(p.last_joint_date, asOf) : null,
      mates: pairMates(ps[0], ps[1]),
      since: p.joint_days_since_last != null && Number.isFinite(Number(p.joint_days_since_last)) ? Number(p.joint_days_since_last) : null,
      ...paceLine(p.joint_days, p.joint_event_days),
    }
    row.side = paceSide(row.since, row.line)
    seasons.forEach((y) => { const s = p.seasons?.[String(y)]; row[`s${y}`] = Array.isArray(s) ? Number(s[1]) : null })
    rows.push(row)
  })
  rows.sort((a, b) => b.je - a.je || b.sg - a.sg || (b.rate ?? 0) - (a.rate ?? 0))
  rows.forEach((r, i) => { r.rank = i + 1 })
  return rows
}

/** One plain sentence on how far the history reaches and who is in it. */
export function coverageLine(file, sport) {
  if (!file) return ''
  const ys = arr(file.seasons_covered)
  if (!ys.length) return ''
  const span = ys.length === 1 ? seasonLabel(sport, ys[0]) : `${seasonLabel(sport, ys[0])} to ${seasonLabel(sport, ys[ys.length - 1])}`
  return `${ys.length} season${ys.length === 1 ? '' : 's'} (${span}) · ${file.active_players ?? '—'} active players · ${arr(file.pairs).length} pairs`
}
