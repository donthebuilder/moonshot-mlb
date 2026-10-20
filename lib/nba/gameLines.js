// 🏀 BUCKETS' GAME-LINE MODEL: A PROJECTED MARGIN FOR EVERY GAME (2026-10-19, DRAFT: research only, nothing on the
// site reads this yet). Pure: no fetch, no clock.
//
//   home margin = the home club's rating - the road club's rating + home court - back-to-back legs
//                 + WHO PLAYS: value x (what the road club is missing - what the home club is missing)
//
// A club's rating is its point margin a game, OPPONENT-ADJUSTED (beating good clubs counts more), RECENT games
// weighted up (a half-life in games), and SHRUNK toward last season's rating pulled back toward 0 (a club is not
// what it was a year ago). Only real final scores go in; with no prior and no games a club has no rating (a dash).
//
// The spread side compares this margin to the book's spread. The moneyline side turns the margin into a win share
// with a normal curve (WIN_SD, fitted on games before the backtest's split). That share is LOGGED for grading and
// calibration only: BUCKETS never prints a model probability (scripts/check-no-printed-probability.mjs). Constants
// come from scripts/backtest-nba-gamelines.mjs (v1), fitted on 2025-26 games before 2026-01-15 and scored after.

export const GAME_LINES_VERSION = 'nba-lines-v1'

// The LIVE model (backtest --live, 2026-10-19): only what the site can read at the lock. Held out on 625 games of
// 2025-26: margin MAE 11.51 (the closing spread 11.01), spread side vs the close 301-324 (48.2%). Under the bar:
// INFORMATION ONLY, never CALLED (Donovan 10-19).
export const LINE_PARAMS = {
  halfLife: 20,       // days: a game this many days back counts half
  priorGames: 10,     // games of weight holding each rating to its prior
  priorKeep: 0.5,     // share of last season's rating a club keeps
  home: 1.5,          // points to the home club (fitted into the ratings too)
  backToBack: 1.5,    // points off a club on the second night of a back-to-back
  value: 0.2,         // margin points per point of game score a club is missing tonight (0 = availability off)
  fullStrength: false, // true: past margins are put back to full strength before the ratings are solved (backtest only)
  winSd: 13,          // points: the spread of real margins around the projection
}

// WHO PLAYS, as the live model reads it: the rotation is the club's last ROTATION_GAMES box scores (a game sat = 0
// minutes); a player's rate is his game score a minute in those games, leaning on BENCH_RATE for RATE_MINUTES.
// No number until the club has ROTATION_MIN_GAMES this season (the backtest did the same).
export const ROTATION_GAMES = 10
export const ROTATION_MIN_GAMES = 3
export const RATE_MINUTES = 300
export const BENCH_RATE = 0.286   // game score a minute: the 20th percentile of 2024-25's 500+ minute players (measured in the backtest)

/** Hollinger's game score for one box-score line ({ pts, fgm, fga, ftm, fta, oreb, dreb, stl, ast, blk, pf, to }). */
export function gameScore(b) {
  const v = (k) => (Number.isFinite(Number(b?.[k])) ? Number(b[k]) : 0)
  return v('pts') + 0.4 * v('fgm') - 0.7 * v('fga') - 0.4 * (v('fta') - v('ftm')) + 0.7 * v('oreb') + 0.3 * v('dreb') + v('stl') + 0.7 * v('ast') + 0.7 * v('blk') - 0.4 * v('pf') - v('to')
}

/**
 * A club's rotation from its last games: lastGames = [[{ id, min, gs }]] (one list per game, players who played).
 * -> { rotation: [{ id, min }], rate: id -> game score a minute }
 */
export function rotationOf(lastGames) {
  const mins = new Map(), gss = new Map()
  for (const gm of lastGames || []) for (const p of gm) { mins.set(p.id, (mins.get(p.id) || 0) + p.min); gss.set(p.id, (gss.get(p.id) || 0) + p.gs) }
  const n = (lastGames || []).length || 1
  return { rotation: [...mins].map(([id, m]) => ({ id, min: m / n })), rate: (id) => shrunkRate(gss.get(id) || 0, mins.get(id) || 0, BENCH_RATE, RATE_MINUTES) }
}

/**
 * Ratings going into a day. `games` = every final game BEFORE that day [{ away, home, as, hs, ago }], where `ago` =
 * days between that game and the day; `prior` = { [club]: last season's rating } or {}. Solved by weighted ridge least squares
 * (Gauss-Seidel sweeps, warm start from `start`). -> { [club]: rating }
 */
export function solveRatings(games, clubs, prior, p = LINE_PARAMS, start = null, sweeps = 12) {
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
export function projectMargin(rHome, rAway, { b2bHome = false, b2bAway = false, missHome = 0, missAway = 0 } = {}, p = LINE_PARAMS) {
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
export const homeWinShare = (margin, p = LINE_PARAMS) => (margin == null ? null : phi(margin / p.winSd))

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
