// 🏀 BUCKETS' PROJECTED POINTS (xPTS), 2026-10-07. Pure: no fetch, no clock.
//
//   projected points = recent minutes  x  per-minute scoring rate  x  opponent factor
//
//   recent minutes   his mean minutes over his last RECENT_N games he played
//   per-minute rate  his points per minute over those same games, SHRUNK toward his
//                    season points per minute: (recentMin*recentRate + K*seasonRate) /
//                    (recentMin + K), K = SHRINK_MIN minutes of "season" weight.
//   opponent factor  1 + BETA * (what the opponent allows a game / the league's mean - 1):
//                    the club's REAL points allowed a game (ESPN's byteam opponent block,
//                    or a club's own results). It is a TEAM number: we hold no points-allowed-
//                    to-position, so the adjustment is the whole defence's, damped by BETA.
//                    No opponent number -> factor 1, and the row says so.
//
// This is a MEASURED PROJECTION of a box-score count, not a model score and not a
// probability: it prints as "xPTS" with one decimal and says what it is built from. The
// constants below were chosen on past nights and checked on held-out ones
// (scripts/backtest-nba-xpts.mjs); the numbers are in that script's output and the commit.
export const RECENT_N = 8
export const MIN_RECENT = 5       // fewer recent games than this and he is not projected
export const SHRINK_MIN = 3000   // minutes of season weight, tuned on 2025-26 games before 2026-02-01 (the recent rate moves the number only a little; recent MINUTES carry it)
export const BETA = 0.75         // how much of the opponent's gap carries onto one player (tuned the same way)

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * recent: [{ min, pts }] his games NEWEST FIRST (games he played; only the first RECENT_N are read).
 * season: { min, pts } his season-to-date TOTALS (minutes, points) before this game, or per-game with gp
 *         ({ minPg, ptsPg, gp }) -- either form.
 * opp:    { allowed, league } the opponent's points allowed a game and the league's mean (both real), or null.
 * Returns { ok, xpts, minRecent, rateRecent, rateSeason, rate, oppFactor, n, why } -- ok false carries `reason`.
 */
export function projectPoints({ recent, season, opp = null }, { n = RECENT_N, k = SHRINK_MIN, beta = BETA, minGames = MIN_RECENT } = {}) {
  const last = (recent || []).filter((g) => fin(g?.min) != null && g.min > 0 && fin(g?.pts) != null).slice(0, n)
  if (last.length < minGames) return { ok: false, reason: `fewer than ${minGames} recent games on file (${last.length})` }
  const sumMin = last.reduce((t, g) => t + g.min, 0)
  const sumPts = last.reduce((t, g) => t + g.pts, 0)
  const minRecent = sumMin / last.length
  const rateRecent = sumPts / sumMin
  const sMin = fin(season?.min) ?? (fin(season?.minPg) != null && fin(season?.gp) != null ? season.minPg * season.gp : null)
  const sPts = fin(season?.pts) ?? (fin(season?.ptsPg) != null && fin(season?.gp) != null ? season.ptsPg * season.gp : null)
  const rateSeason = sMin && sMin > 0 && sPts != null ? sPts / sMin : null
  const rate = rateSeason == null ? rateRecent : (sumMin * rateRecent + k * rateSeason) / (sumMin + k)
  const allowed = fin(opp?.allowed), league = fin(opp?.league)
  const oppFactor = allowed != null && league != null && league > 0 ? 1 + beta * (allowed / league - 1) : 1
  return { ok: true, xpts: minRecent * rate * oppFactor, minRecent, rateRecent, rateSeason, rate, oppFactor, oppKnown: allowed != null && league != null, n: last.length }
}

/** One plain line for the row's tooltip / the player page: what the number is made of. */
export function xptsLine(p) {
  if (!p?.ok) return p?.reason || 'No projection.'
  const f = (v, d = 1) => Number(v).toFixed(d)
  const opp = p.oppKnown ? `${p.oppFactor >= 1 ? '+' : '-'}${f(Math.abs(p.oppFactor - 1) * 100, 0)}% for the opponent's points allowed` : 'no opponent adjustment (no points-allowed number)'
  return `${f(p.minRecent)} min (last ${p.n}) x ${f(p.rate, 2)} pts a minute (last ${p.n}, pulled toward his season) ${opp} = ${f(p.xpts)} points. A projection of a box-score count, not a probability.`
}

export const MIN_SEASON_FOR_BASELINE = 10

/** The naive baseline the projection must beat: his season-to-date points per game (needs >= 10 games). */
export function seasonAverage(prior) {
  const g = (prior || []).filter((x) => fin(x?.min) != null && x.min > 0 && fin(x?.pts) != null)
  if (g.length < MIN_SEASON_FOR_BASELINE) return null
  return g.reduce((t, x) => t + x.pts, 0) / g.length
}
