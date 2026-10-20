// GAME LINES, THE SHARED ARITHMETIC (2026-10-19 BUCKETS, 2026-10-20 every sport). Pure: no fetch, no clock.
//
//   home margin = the home club's rating - the road club's rating + home edge - short-rest legs (+ who plays, NBA)
//
// A club's rating is its margin a game (points, goals, runs), OPPONENT-ADJUSTED, recent games weighted up (a half-life in
// days) and SHRUNK toward last season's rating pulled back toward 0. Only real final scores go in. Each sport's constants
// live in SPORT_LINES (MLB / NFL / NHL; BUCKETS' in lib/nba/gameLines.js), fitted by scripts/backtest-gamelines.mjs on
// last season's games before a split and scored after. The win share is LOGGED for calibration only and never printed.
// "Our line" is INFORMATION ONLY in every sport (Donovan 10-19 / 10-20): never CALLED, no record.

/**
 * Each sport's model (backtest-gamelines.mjs, held-out numbers in the commit). short = days of rest that count as a
 * short turn-around (NHL: the second night of a back-to-back; NFL: a Thursday game after a Sunday); unit = what a
 * margin is counted in.
 */
export const SPORT_LINES = {
  nfl: { version: 'nfl-lines-v1', unit: 'points', short: 4, params: { halfLife: 1e6, priorGames: 8, priorKeep: 0.5, home: 3, backToBack: 0, value: 0, fullStrength: false, winSd: 13.15 } },
  nhl: { version: 'nhl-lines-v1', unit: 'goals', short: 1, params: { halfLife: 20, priorGames: 40, priorKeep: 0.3, home: 0.15, backToBack: 0.3, value: 0, fullStrength: false, winSd: 2.75 } },
  mlb: { version: 'mlb-lines-v1', unit: 'runs', short: 0, params: { halfLife: 40, priorGames: 80, priorKeep: 0.7, home: 0.15, backToBack: 0, value: 0, fullStrength: false, winSd: 3.46 } },
}

/**
 * Ratings going into a day. `games` = every final game BEFORE that day [{ away, home, as, hs, ago }], where `ago` =
 * days between that game and the day; `prior` = { [club]: last season's rating } or {}. Solved by weighted ridge least squares
 * (Gauss-Seidel sweeps, warm start from `start`). -> { [club]: rating }
 */
export function solveRatings(games, clubs, prior, p, start = null, sweeps = 12) {
  const r = {}
  for (const c of clubs) r[c] = start?.[c] ?? (prior[c] != null ? p.priorKeep * prior[c] : 0)
  const decay = Math.log(2) / Math.max(p.halfLife, 1e-9)
  const by = new Map(clubs.map((c) => [c, []]))
  for (const g of games) {
    const w = Math.exp(-decay * (g.ago || 0))
    // g.adj (when given): what the past margin would have been at full strength (WHO PLAYS, both sides)
    const m = g.hs - g.as - p.home + (p.fullStrength ? (g.adj || 0) : 0)
    by.get(g.home)?.push({ o: g.away, m, w })
    by.get(g.away)?.push({ o: g.home, m: -m, w })
  }
  for (let s = 0; s < sweeps; s++) {
    for (const c of clubs) {
      const pr = prior[c] != null ? p.priorKeep * prior[c] : 0
      let num = p.priorGames * pr, den = p.priorGames
      for (const x of by.get(c)) { num += x.w * (x.m + r[x.o]); den += x.w }
      r[c] = num / den
    }
    // ratings are relative: keep the league at 0
    const mean = clubs.reduce((t, c) => t + r[c], 0) / clubs.length
    for (const c of clubs) r[c] -= mean
  }
  return r
}

/**
 * The home club's projected margin (points; negative = the road club is better). null without both ratings.
 * missHome / missAway = the game score each club is missing tonight (missingValue), 0 when unknown.
 */
export function projectMargin(rHome, rAway, { b2bHome = false, b2bAway = false, missHome = 0, missAway = 0 } = {}, p) {
  if (rHome == null || rAway == null) return null
  return rHome - rAway + p.home - (b2bHome ? p.backToBack : 0) + (b2bAway ? p.backToBack : 0) + p.value * ((missAway || 0) - (missHome || 0))
}

/**
 * WHO PLAYS: the game score a club is missing tonight.
 *   rotation  [{ id, min }]  each player's minutes a game over the club's last games (a game he sat counts 0, so a
 *                            player out for weeks has already dropped out of it)
 *   playing   Set of ids     who is playing tonight (live: the injury report at the lock; backtest: the box score)
 *   rate      id -> game score a minute (season to date, shrunk to a prior)
 * -> missing game score (>= 0). A newcomer not yet in the rotation adds nothing.
 */
export function missingValue(rotation, playing, rate) {
  let miss = 0
  for (const r of rotation || []) if (!playing.has(r.id)) miss += (rate(r.id) || 0) * r.min
  return miss
}

/** A player's game score a minute: this season's, leaning on a prior until `k` minutes pile up. */
export const shrunkRate = (gs, min, prior, k) => (gs + k * prior) / (min + k)

// the normal curve's cumulative share (Abramowitz-Stegun 7.1.26; error < 1.5e-7)
function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** LOGGED ONLY, never printed: the home club's win share from a projected margin. */
export const homeWinShare = (margin, p) => (margin == null ? null : phi(margin / p.winSd))

/** American odds -> the break-even share (with the book's cut still in). */
export const breakEven = (am) => (am == null ? null : am < 0 ? -am / (-am + 100) : 100 / (am + 100))
/** Profit on a 1-unit stake that wins at American odds `am`. */
export const payout = (am) => (am < 0 ? 100 / -am : am / 100)
/** The two sides' shares with the cut taken out (proportional). */
export function noVig(amHome, amAway) {
  const h = breakEven(amHome), a = breakEven(amAway)
  return h == null || a == null ? null : { home: h / (h + a), away: a / (h + a) }
}

/**
 * The spread grade from the home side: `spreadHome` is the home club's number (-5.5 = home gives 5.5).
 * -> 'home' | 'away' | 'push'
 */
export function atsResult(homeMargin, spreadHome) {
  const v = homeMargin + spreadHome
  return Math.abs(v) < 1e-9 ? 'push' : v > 0 ? 'home' : 'away'
}
