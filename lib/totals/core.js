// TOP TOTALS: THE PURE HALF (2026-10-09, Donovan: "games with highest totals, like top 3 games, for each
// sport. Build those markets; we need to get them going and tracked and CALLED, not just on the board").
//
// WHAT THE MARKET IS. Each slate (a baseball / hockey / basketball night; a football week) has a TEAM
// model that already gives every game a projected combined count (the same number the Slate dial prints):
//   MLB  expected home runs     lib/teamHr.js                    (gameExpHr)
//   NFL  expected touchdowns    lib/nfl/teamTdModel.js           (slateTotals; the model's all-offensive-TD unit)
//   NHL  expected goals         lib/nhl/teamProj*.js             (lamp-team-v1)
//   NBA  expected points        lib/nba/teamModel*.js
// The three games with the highest projected total are the CALLS. The call is a row locked before the
// game starts and never written again but for its result: projected_total, line, rank and the field size
// go in at the lock; actual_total, result and hit come in once, after the final.
//
// THE LINE. The line a call is graded against is stored WITH the call. It is the projection itself
// (line_source 'projection'): OVER means the game produced more than the model said it would. When the
// counted result is in a narrower unit than the model's (NFL: the logs count tracked skill-player touchdowns,
// the model's cover turns them into all offensive touchdowns), the line is the projection in the RESULT's
// unit, stored beside the headline projection, so the grade compares like with like. There is no
// book total anywhere in the repo's odds data (props only), so none is used and none is invented; a book
// line would arrive as line_source 'book' beside the projection, never in place of it.
//
// Pure: no fetch, no clock but the `now` handed in. The reads are lib/totals/sources.js, the writes
// lib/totals/store.js. Tests: scripts/check-totals.mjs (TEST data).
import { TOTALS_CALLS, TOTALS_MIN_FIELD, totalsCallStatus } from '../callStatus'
import { ALL_SPORT_KEYS } from '../routes'

export const TOTALS_VERSION = 'top-totals-v1'
export { TOTALS_CALLS, TOTALS_MIN_FIELD, totalsCallStatus }

/** The sports the market runs in: the registry's own list, never a private one. */
export const TOTALS_SPORTS = ALL_SPORT_KEYS

/** What each sport's total is a count of (a table keyed by sport, not a ternary). `slate` is the grouping word. */
export const TOTALS_UNITS = {
  mlb: { unit: 'home runs', short: 'HR', slate: 'night', dp: 1 },
  nfl: { unit: 'touchdowns', short: 'TD', slate: 'week', dp: 1 },
  nhl: { unit: 'goals', short: 'G', slate: 'night', dp: 1 },
  nba: { unit: 'points', short: 'PTS', slate: 'night', dp: 0 },
}

/** Minutes before a slate's first start that the calls are made (lineups and goalies are mostly in by then). */
export const LOCK_LEAD_MIN = 90

const fin = (v) => (typeof v === 'number' && Number.isFinite(v))
const r2 = (v) => Math.round(v * 100) / 100

/** May the slate be locked now? From LOCK_LEAD_MIN before its first start. Whatever has not started by then is locked; a started game never is. */
export function lockWindowOpen(games, now, leadMin = LOCK_LEAD_MIN) {
  const starts = (games || []).map((g) => g?.start_ms).filter(fin)
  if (!starts.length || !fin(now)) return false
  return now >= Math.min(...starts) - leadMin * 60e3
}

/**
 * Rank a field of games by projected total, highest first. Ties go to the earlier start, then the id,
 * so the order never depends on the order the feed listed them in.
 * @param games [{ game_id, start_ms, projected }] -- a game without a finite projection or start is left out (no made-up number)
 */
export function rankField(games) {
  return (games || [])
    .filter((g) => g && g.game_id != null && fin(g.projected) && fin(g.start_ms))
    .slice()
    .sort((a, b) => b.projected - a.projected || a.start_ms - b.start_ms || String(a.game_id).localeCompare(String(b.game_id)))
    .map((g, i) => ({ ...g, rank: i + 1 }))
}

/**
 * THE LOCK. The rows to store for one slate at `now`: only games that have NOT started (start_ms > now) are in the
 * field, so nothing is ever written at or after first pitch / kickoff / puck drop / tip. The field is ranked, the
 * top TOTALS_CALLS are `called` when the field has more than that many games. The line is the projection.
 * Returns [] when nothing can be locked.
 */
export function lockRows({ sport, slate_key, games, now, version = TOTALS_VERSION }) {
  const field = rankField((games || []).filter((g) => fin(g?.start_ms) && g.start_ms > now))
  const n = field.length
  return field.map((g) => ({
    sport, slate_key, game_id: String(g.game_id), game_date: g.game_date, start_at: new Date(g.start_ms).toISOString(),
    away: g.away, home: g.home, model_version: version, unit: TOTALS_UNITS[sport]?.unit || null,
    projected_total: r2(g.projected), line: r2(fin(g.line) ? g.line : g.projected), line_source: 'projection',
    rank: g.rank, field_size: n, called: n >= TOTALS_MIN_FIELD && g.rank <= TOTALS_CALLS,
    locked_at: new Date(now).toISOString(),
  }))
}

/** True when a row may still be written at `now` (a row for a game whose start has come is refused). */
export const mayLockRow = (row, now) => fin(now) && Date.parse(row?.start_at) > now

/**
 * THE GRADE. Over means the combined count beat the stored line; equal to the line is a push (no win, no
 * loss); a game that never counted (postponed, cancelled) is void. Returns the fields the row takes, once.
 */
export function gradeRow(row, actual) {
  if (actual === 'void') return { actual_total: null, result: 'void', hit: null }
  if (actual == null || actual === '' || row?.line == null || row.line === '') return null   // Number(null) is 0: an absent value is not a zero
  const a = Number(actual)
  const line = Number(row.line)
  if (!Number.isFinite(a) || !Number.isFinite(line)) return null
  const result = a > line ? 'over' : a < line ? 'under' : 'push'
  return { actual_total: a, result, hit: result === 'over' ? true : result === 'under' ? false : null }
}

/** A graded row may be written once: true when the row has no result yet. */
export const isOpen = (row) => row && row.result == null

/** One record from rows: { n, graded, hits, misses, pushes, voids, pct }. pct = hits / (hits + misses), null with none. */
export function tally(rows) {
  const out = { n: 0, graded: 0, hits: 0, misses: 0, pushes: 0, voids: 0, pct: null }
  for (const r of rows || []) {
    out.n += 1
    if (r.result == null) continue
    if (r.result === 'void') { out.voids += 1; continue }
    out.graded += 1
    if (r.result === 'over') out.hits += 1
    else if (r.result === 'under') out.misses += 1
    else out.pushes += 1
  }
  const d = out.hits + out.misses
  out.pct = d ? out.hits / d : null
  return out
}

/** The ledger's record: the CALLED rows' tally, and the ON THE BOARD rows' beside it (the label comes from callStatus). */
export function recordOf(rows) {
  const by = { called: [], board: [], off: [] }
  for (const r of rows || []) by[totalsCallStatus(r)].push(r)
  return { called: tally(by.called), board: tally(by.board), off: tally(by.off) }
}

/** How a total prints in its sport's own precision (NBA whole points, the others one decimal). */
export const fmtTotal = (sport, v) => (fin(Number(v)) && v != null ? Number(v).toFixed(TOTALS_UNITS[sport]?.dp ?? 1) : '—')

// ── THE POST ─────────────────────────────────────────────────────────────────
// Text only: no link, no hashtag (the X rules); no player named, so the repeat guard has nobody to hold.
// Numbers are counts of the sport's own thing, never a chance.
const HEAD = { mlb: 'MLB', nfl: 'NFL', nhl: 'NHL', nba: 'NBA' }
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}` : '' }

/** The post for a locked slate's CALLED rows, or '' (fewer than the calls, or too long even for one). */
export function totalsPostText({ sport, day, rows, hardLimit = 280 }) {
  const calls = (rows || []).filter((r) => totalsCallStatus(r) === 'called').sort((a, b) => a.rank - b.rank)
  const u = TOTALS_UNITS[sport]
  if (!u || calls.length < TOTALS_CALLS) return ''
  const build = (list) => [
    `\u{1F4C8} TOP TOTALS · ${HEAD[sport]} · ${prettyDay(day)}`,
    `The ${list.length} games our model has scoring the most ${u.unit} (called before the ${u.slate === 'week' ? 'first kickoff' : 'first game'}):`,
    '',
    ...list.map((r) => `${r.rank}. ${r.away} @ ${r.home} · ${fmtTotal(sport, r.projected_total)} ${u.short}`),
    '',
    'Graded against that number after the final.',
  ].join('\n')
  const t = build(calls)
  return [...t].length + 4 <= hardLimit ? t : ''
}
