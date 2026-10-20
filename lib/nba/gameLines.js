import { shrunkRate } from '../gameLines'

// 🏀 BUCKETS' GAME-LINE MODEL: A PROJECTED MARGIN FOR EVERY GAME (2026-10-19; the game
// page's "Our line", info only). Pure: no fetch, no clock.
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

// the shared arithmetic (every sport): lib/gameLines.js
export { solveRatings, projectMargin, missingValue, shrunkRate, homeWinShare, breakEven, payout, noVig, atsResult } from '../gameLines'
