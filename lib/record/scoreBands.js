// THE LAMP SCORE BANDS (2026-10-13): "of the skaters LAMP scored 90+, how often did one score?" Pure and client-safe.
//
// ONE QUESTION, ONE FUNCTION. Rows in are lib/record/nhl.js ModelRecords (lamp_goal_log, read by the calibration
// reader that also feeds the ladder), rows out are counts: score band x scored rate, and the 90+ split by the call.
// Nothing here is a model output and nothing is typed: every figure is a count of the rows handed in, printed with
// n and its 95% Wilson range. The status on each row is the one stored at lock (scoreNight in lib/nhl/goalModel.js
// sets it; STATUS_WORD supplies the words) -- it is never re-derived from the score here.
//
// Scope (printed with it, same as the ladder): regular season only (game_type 2), a lock stamp, graded, DRESSED
// (a skater who did not dress is void, not a miss, and is in no denominator). A row with no score (the model could
// not rank him) is in no band; the count is kept so the bands + that count equal the ladder's base.
//
// Never a probability, never a price: this is a rate of what happened, over a sample that is said to be small.
import { wilson } from '../interval'
import { STATUS_WORD } from '../callStatus'

/** Band edges, top first. `min` is inclusive; a score is a whole number 0-100 (lamp_goal_log.score is a smallint). */
export const SCORE_BANDS = Object.freeze([
  { key: '90+', label: '90+', min: 90 },
  { key: '85-89', label: '85-89', min: 85 },
  { key: '80-84', label: '80-84', min: 80 },
  { key: '70-79', label: '70-79', min: 70 },
  { key: '<70', label: 'Under 70', min: -Infinity },
])
/** Under this many graded skaters in a row the row says "small sample". Same floor as the ladder (LADDER_MIN_N). */
export const BANDS_MIN_N = 30
export const BAND_TOP = 90

// ONE BAND SET PER SPORT (2026-10-20, MOONSHOT parity): LAMP's 0-100 goal score keeps its bands exactly; MOONSHOT's home-run
// score runs lower (one night's 267 hitters: median 28, top tenth from 54, highest 87), so its bands sit where its own
// scores are, with 60+ (about the top 3%) as the top. The words follow the sport.
const MLB_BANDS = Object.freeze([
  { key: '60+', label: '60+', min: 60 },
  { key: '50-59', label: '50-59', min: 50 },
  { key: '40-49', label: '40-49', min: 40 },
  { key: '30-39', label: '30-39', min: 30 },
  { key: '<30', label: 'Under 30', min: -Infinity },
])
// TUDDY's TD score (2026-10-20, weeks 1-6: 1,520 graded player-games, median 48, top 3% from 68, highest 79): 70+ is the
// top, about the share MOONSHOT's 60+ is. Counted per WEEK, each player frozen at the last update before his own kickoff
// (bots/nfl/nfl_signal_audit.py td_rows).
const NFL_BANDS = Object.freeze([
  { key: '70+', label: '70+', min: 70 },
  { key: '60-69', label: '60-69', min: 60 },
  { key: '50-59', label: '50-59', min: 50 },
  { key: '40-49', label: '40-49', min: 40 },
  { key: '<40', label: 'Under 40', min: -Infinity },
])
export const BAND_SETS = Object.freeze({
  nhl: { bands: SCORE_BANDS, top: 90, product: 'LAMP', noun: 'skater', did: 'scored', what: 'Goal scorers', lock: 'puck drop', gone: 'A skater who did not dress', kept: 'dressed skaters' },
  mlb: { bands: MLB_BANDS, top: 60, product: 'MOONSHOT', noun: 'hitter', did: 'homered', what: 'Home runs', lock: 'first pitch', gone: 'A hitter whose game did not happen or who did not play', kept: 'hitters' },
  nfl: { bands: NFL_BANDS, top: 70, product: 'TUDDY', noun: 'player', did: 'scored a TD', what: 'Touchdowns', lock: 'kickoff', gone: 'A player with no line that week', kept: 'players', unit: 'week' },
})
export const bandSetOf = (sport) => BAND_SETS[sport] || BAND_SETS.nhl

const pct1 = (h, n) => (n > 0 ? Math.round((1000 * h) / n) / 10 : null)
const cell = (h, n) => ({ n, hits: h, rate: pct1(h, n), ci: wilson(h, n), small: n < BANDS_MIN_N })
const count = (list) => cell(list.filter((r) => r.result === 'hit').length, list.length)
const settled = (r) => r?.result === 'hit' || r?.result === 'miss'
const hasScore = (r) => r.score !== null && r.score !== undefined && Number.isFinite(Number(r.score))
const bandOf = (score, set = BAND_SETS.nhl) => set.bands.find((b) => score >= b.min)

/** Two 95% ranges share some ground. */
const overlap = (a, b) => Boolean(a?.ci && b?.ci && a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1])

/**
 * ModelRecords -> the score-band table, or null when nothing in scope is graded.
 * { scope, nights, from, to, minN, all, unscored,
 *   bands: [{ key, label, n, hits, rate, ci, small }],            // 90+, 85-89, 80-84, 70-79, under 70
 *   split: [{ key, label, status, n, hits, rate, ci, small }],    // CALLED + 90+, 90+ not called, CALLED under 90
 *   topOverlap }                                                   // CALLED+90+ vs 90+ not called: the ranges overlap (true/false/null)
 */
export function scoreBandsFromRecords(records, sport = 'nhl') {
  const set = bandSetOf(sport)
  const T = set.top
  const rows = (records || []).filter((r) => settled(r) && r.locked_at && Number(r.game_type) === 2)
  if (!rows.length) return null
  const scored = rows.filter(hasScore)
  const dates = [...new Set(rows.map((r) => r.game_date))].sort()
  const bands = set.bands.map((b) => ({ key: b.key, label: b.label, ...count(scored.filter((r) => bandOf(Number(r.score), set) === b)) }))
  const top = scored.filter((r) => Number(r.score) >= T)
  const split = [
    { key: 'called90', label: `${STATUS_WORD.called} + ${T}+`, status: 'called', ...count(top.filter((r) => r.status === 'called')) },
    { key: 'not90', label: `${T}+ not ${STATUS_WORD.called}`, status: null, ...count(top.filter((r) => r.status !== 'called')) },
    { key: 'calledUnder', label: `${STATUS_WORD.called} under ${T}`, status: 'called', ...count(scored.filter((r) => r.status === 'called' && Number(r.score) < T)) },
  ]
  return {
    sport, top: T, topKey: set.bands[0].key,
    scope: 'regular', nights: dates.length, from: dates[0], to: dates.at(-1), minN: BANDS_MIN_N,
    all: count(rows), unscored: count(rows.filter((r) => !hasScore(r))),
    bands, split, topOverlap: split[0].n && split[1].n ? overlap(split[0], split[1]) : null,
  }
}

/** The body of /api/calibration's `scoreBands` (null from an older cached body): only a block with graded rows prints. */
export function scoreBandsFrom(cal) {
  const b = cal?.scoreBands
  return b && b.all?.n > 0 && Array.isArray(b.bands) ? b : null
}

const nf = (n) => Number(n).toLocaleString('en-US')
const rate = (c) => (c.rate == null ? '—' : `${c.rate.toFixed(1)}%`)
const range = (c) => (c.ci ? `${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}%` : '—')
const md = (ymd) => { const [, m, d] = String(ymd || '').split('-'); return m && d ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${Number(d)}` : '' }

/** A row's cells as printed. */
export function bandCells(c) {
  return { of: `${nf(c.hits)} of ${nf(c.n)}`, n: nf(c.n), rate: rate(c), range: range(c), small: c.small }
}

/** The scope in words (the window every row was counted over). */
export function bandsScope(b) {
  if (!b) return ''
  const w = bandSetOf(b.sport)
  const when = w.unit === 'week'
    ? `${b.nights} graded ${b.nights === 1 ? 'week' : 'weeks'} (week ${Number(String(b.from).slice(1))} to ${Number(String(b.to).slice(1))}), each player as he stood at the last update before his ${w.lock}`
    : `${b.nights} graded ${b.nights === 1 ? 'night' : 'nights'} (${md(b.from)} to ${md(b.to)}), locked before ${w.lock}`
  return `Regular season, ${when}. ${w.gone} is out of every count${b.unscored?.n ? `; ${nf(b.unscored.n)} ${w.kept} with no score are in no band` : ''}.`
}

/** The plain small-sample note, always printed with the table: how small, what the ranges say, and that it is a count. */
export function bandsNote(b) {
  if (!b) return ''
  const w = bandSetOf(b.sport)
  const top = b.bands.find((x) => x.key === (b.topKey || '90+'))
  const parts = [`Small sample so far: ${nf(top?.n || 0)} ${w.noun}-games scored ${b.top ?? 90}+. Read these as counts of what happened, not a settled rate.`]
  const under = [...b.bands, ...b.split].filter((r) => r.n > 0 && r.small).map((r) => r.label)
  if (under.length) parts.push(`${under.join(', ')} ${under.length === 1 ? 'has' : 'have'} under ${b.minN} ${w.noun}s: tracking only.`)
  if (b.topOverlap === true) parts.push(`${b.split[0].label} and ${b.split[1].label} have 95% ranges that overlap: this sample cannot tell them apart yet.`)
  else if (b.topOverlap === false) parts.push(`${b.split[0].label} and ${b.split[1].label} have 95% ranges that do not overlap in this sample.`)
  return parts.join(' ')
}
