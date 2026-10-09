// 🏀 BUCKETS' TEAM MODEL: EXPECTED POINTS FOR A GAME (2026-10-08, Donovan: the "expected" number on every
// slate comes from a TEAM model). Pure: no fetch, no clock.
//
//   a club's expected points = what clubs score  +  how much THIS club scores above that  +  how much the
//                              OPPONENT allows above that  +  home court  -  the second night of a back-to-back
//
// Built only from real results: each club's points scored and allowed a game (ESPN's club schedules) and the
// league mean. Early in a season the club's numbers are SHRUNK: SHRINK_GAMES games of weight on a prior, and the
// prior is last season's club line pulled PRIOR_KEEP of the way back to the league mean (a club is not what it was
// a year ago). With no game played yet the number is all prior and says "last season". No prior and no games ->
// no number (a dash), never a guess.
//
// The constants and the formulation were chosen on 2025-26 games before FIT_BEFORE and scored on the games
// after (scripts/backtest-nba-teammodel.mjs prints the numbers; they are in the commit). This is a MEASURED
// PROJECTION of a box-score count (points), not a model score and not a probability; it is never printed as a
// chance of anything. Player xPTS (lib/nba/expectedPoints.js) is a different number and stays.
export const EXPECTED_POINTS_WORDS = 'expected points'
export const EXPECTED_POINTS_LABEL = 'Expected points'

export const PARAMS = {
  form: 'multiplicative',   // 'additive' | 'multiplicative' -- picked on the fit games (the two score the same held out)
  shrinkGames: 20,    // games of weight on the prior
  priorKeep: 0.3,     // how much of last season's gap to the league mean a club keeps
  defWeight: 1,       // how much of the opponent's allowed-points gap carries over
  home: 1.0,          // points added to the home club, taken off the road club
  backToBack: 2.0,    // points off a club playing its second night in a row
  leagueShrinkGames: 30,   // team-games of weight on last season's league mean
}

const DAY = 86400000
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY)
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** { pf, pa, n } from final results [{ us, them }]; null with no game. */
export function averageOf(results) {
  const r = (results || []).filter((g) => fin(g.us) != null && fin(g.them) != null)
  if (!r.length) return null
  return { pf: r.reduce((t, g) => t + g.us, 0) / r.length, pa: r.reduce((t, g) => t + g.them, 0) / r.length, n: r.length }
}

/** The league's points a team-game: this season to date, shrunk toward last season's mean. null when neither is known. */
export function leagueMean(curTeamGames, curSum, prevMean, p = PARAMS) {
  const k = p.leagueShrinkGames
  if (prevMean == null) return curTeamGames > 0 ? curSum / curTeamGames : null
  return (curSum + k * prevMean) / (curTeamGames + k)
}

/**
 * A club's line going into a day.
 *   results  its final regular-season games BEFORE that day [{ us, them }]
 *   prior    last season's { pf, pa } or null
 *   L        the league mean a team-game
 * -> { pf, pa, n, basis } or null (no prior, no games).
 */
export function clubLine(results, prior, L, p = PARAMS) {
  const cur = averageOf(results)
  if (!cur && !prior) return null
  if (L == null) return null
  const pr = prior ? { pf: L + p.priorKeep * (prior.pf - L), pa: L + p.priorKeep * (prior.pa - L) } : { pf: L, pa: L }
  const n = cur?.n || 0
  const k = p.shrinkGames
  const pf = cur ? (cur.pf * n + pr.pf * k) / (n + k) : pr.pf
  const pa = cur ? (cur.pa * n + pr.pa * k) / (n + k) : pr.pa
  return { pf, pa, n, basis: n === 0 ? 'last season' : n < k * 2 ? 'part last season' : 'this season' }
}

/** Days since the club's last game before `date` (1 = it played last night); null when it has none. `dates` = its earlier game days. */
export function restBefore(dates, date) {
  const t = dayNum(date)
  let last = null
  for (const d of dates || []) { const x = dayNum(d); if (x < t && (last == null || x > last)) last = x }
  return last == null ? null : t - last
}

/** One side's points: `off` is its line, `def` the opponent's line. */
export function sidePoints(off, def, L, { home = false, b2b = false } = {}, p = PARAMS) {
  const base = p.form === 'multiplicative'
    ? (off.pf * (L + p.defWeight * (def.pa - L))) / L
    : L + (off.pf - L) + p.defWeight * (def.pa - L)
  return base + (home ? p.home : -p.home) - (b2b ? p.backToBack : 0)
}

/**
 * One game. away / home = club lines (clubLine) ; rest = { away, home } days since each last played (or null).
 * -> { away, home, total, basis } in points, or null when either club has no line.
 */
export function projectGame({ away, home, L, rest = {} }, p = PARAMS) {
  if (!away || !home || L == null) return null
  const a = sidePoints(away, home, L, { home: false, b2b: rest.away === 1 }, p)
  const h = sidePoints(home, away, L, { home: true, b2b: rest.home === 1 }, p)
  // the weaker basis names the game: last season < part last season < this season
  const rank = { 'last season': 0, 'part last season': 1, 'this season': 2 }
  const basis = rank[away.basis] <= rank[home.basis] ? away.basis : home.basis
  return { away: a, home: h, total: a + h, basis, b2b: { away: rest.away === 1, home: rest.home === 1 } }
}

/** Every club pairing's total (neutral rest): the league's distribution of the number, for the dial's heat. */
export function pairingTotals(lines, L, p = PARAMS) {
  const out = []
  const ks = Object.keys(lines).filter((k) => lines[k])
  for (const a of ks) for (const h of ks) {
    if (a === h) continue
    const g = projectGame({ away: lines[a], home: lines[h], L }, p)
    if (g) out.push(g.total)
  }
  return out.sort((x, y) => x - y)
}

/** 0..1: where `v` sits in the sorted league distribution (share of pairings at or below it). */
export function percentileIn(sorted, v) {
  if (!sorted?.length || !Number.isFinite(v)) return null
  let lo = 0, hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m }
  return lo / sorted.length
}
