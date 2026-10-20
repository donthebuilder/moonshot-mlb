// 🏅 BUCKETS' AWARD RACES: THE MODEL (2026-10-20, Donovan: "who's gonna win rookie of the year, defensive player, most improved,
// MVP, finals MVP ... we need those models being ran"). Pure: no fetches, so the fit script and the site read the same math.
//
// THE SHAPE. One award = a pool of players in one season and a SHARE for each that sums to 1 over the pool: a softmax of
// a weighted sum of his numbers, each number taken as a z-score WITHIN THAT SEASON'S POOL (so a 2012 scoring line and a 2026
// one are compared to their own league, not to each other). The weights are FITTED on real voting: Basketball-Reference's
// award pages (points won / points possible, every player who got a vote; everyone else in the pool got 0), seasons
// 2012-2026, features from ESPN's season lines and standings -- the same reads the site makes live. The fit and its
// hold-out numbers are in scripts/fit-nba-awards.mjs and the commit that wrote AWARD_FITS.
//
// WHAT A SHARE IS. "The share of the race these lines carry if the votes were cast on them", fitted so that the winner
// gets as much of it as he really did. Early in the season it leans on last season (see blendLine) and the spread is
// widened by the measured opening-night temperature (see temperatureAt). It is a model's read, never a book's price.

import { zScore, softmax, fitSoftmax, fitTemperature, temperatureAt } from '../awardCore'

export { zScore, softmax, fitSoftmax, fitTemperature, temperatureAt }
export const AWARDS_MODEL_VERSION = 'nba-awards-v1'

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

/** True shooting from per-game points, shots and free throws (null without shots). */
export function trueShooting(l) {
  const den = 2 * ((num(l.fga) || 0) + 0.44 * (num(l.fta) || 0))
  return den > 0 ? num(l.pts) / den : null
}

/** Points a club allows per opponent possession, from its opponents' per-game block (null when a piece is missing). */
export function defPerPoss(o) {
  const v = (k) => num(o?.[k])
  const poss = v('avgFieldGoalsAttempted') + 0.44 * v('avgFreeThrowsAttempted') + v('avgTurnovers') - v('avgOffensiveRebounds')
  return v('avgPoints') != null && Number.isFinite(poss) && poss > 0 ? v('avgPoints') / poss : null
}

/** The raw numbers every award reads, from one season line + his club's record. `prev` = his line the season before (MIP). */
export function rawFeatures(l, club, prev = null) {
  const gpFrac = l.gpFrac != null ? l.gpFrac : club?.games ? Math.min(1, (num(l.gp) || 0) / club.games) : null
  return {
    pts: num(l.pts), reb: num(l.reb), ast: num(l.ast), stl: num(l.stl), blk: num(l.blk), min: num(l.min),
    stocks: (num(l.stl) || 0) + (num(l.blk) || 0),
    ts: trueShooting(l),
    gpFrac,
    teamWin: club?.winPct ?? null,
    // points per 100 opponent possessions his club allows, below the league (higher = better defence)
    teamDef: club?.defVsLeague ?? null,
    dPts: prev ? num(l.pts) - num(prev.pts) : null,
    dMin: prev ? num(l.min) - num(prev.min) : null,
    dAst: prev ? num(l.ast) - num(prev.ast) : null,
    dReb: prev ? num(l.reb) - num(prev.reb) : null,
    prevPts: prev ? num(prev.pts) : null,
  }
}

// THE FOUR VOTED AWARDS. pool: who can get a vote (a season line big enough to be judged). feats: the fitted inputs, in order.
// rule65: the 65-game rule (2023-24 on: MVP, DPOY and MIP need 65 games; ROY does not), applied live as "can still reach 65".
export const AWARD_DEFS = {
  mvp: {
    label: 'MVP', title: 'Most Valuable Player', br: 'mvp', rule65: true,
    pool: (l) => l.gp >= 40 && l.min >= 20,
    feats: ['pts', 'ast', 'reb', 'stocks', 'ts', 'teamWin', 'gpFrac'],
  },
  dpoy: {
    label: 'DPOY', title: 'Defensive Player of the Year', br: 'dpoy', rule65: true,
    pool: (l) => l.gp >= 40 && l.min >= 20,
    feats: ['blk', 'stl', 'reb', 'teamDef', 'teamWin', 'min', 'gpFrac'],
  },
  roy: {
    label: 'ROY', title: 'Rookie of the Year', br: 'roy', rule65: false, rookies: true,
    pool: (l) => l.gp >= 20 && l.min >= 10,
    feats: ['pts', 'reb', 'ast', 'stocks', 'min', 'gpFrac', 'teamWin'],
  },
  mip: {
    label: 'MIP', title: 'Most Improved Player', br: 'mip', rule65: true, needsPrev: true,
    pool: (l, prev) => l.gp >= 40 && l.min >= 15 && prev && prev.gp >= 20,
    feats: ['dPts', 'dMin', 'dAst', 'dReb', 'prevPts', 'gpFrac', 'teamWin'],
  },
}

/**
 * EARLY SEASON = MOSTLY LAST SEASON. His per-game line this season, shrunk toward last season's by `k` games of last season
 * (k = 15: after 15 games his own season counts half). A rookie has no last season: his line is his own, however few games.
 * gpFrac: games he has played over games his club has played, shrunk the same way toward last season's.
 */
export const BLEND_GAMES = 15
export function blendLine(cur, prev, k = BLEND_GAMES) {
  if (!prev) return cur
  if (!cur) return { ...prev, gp: 0, basisLast: true }
  const g = num(cur.gp) || 0
  const a = g / (g + k)
  const out = { ...cur }
  for (const key of ['pts', 'reb', 'ast', 'stl', 'blk', 'min', 'fga', 'fta']) {
    const c = num(cur[key]), p = num(prev[key])
    out[key] = c == null ? p : p == null ? c : a * c + (1 - a) * p
  }
  return out
}

// THE FITTED WEIGHTS (scripts/fit-nba-awards.mjs, all seasons 2012-2026; hold-out numbers in that script's output and the
// commit). T0 = the opening-night temperature (last season's lines against this season's vote), null where the award has no
// opening-night read (ROY: no NBA line yet; MIP: improvement needs this season's games).
export const AWARD_FITS = {
  mvp: { w: [1.387, 0.507, 0.54, 0.349, 0.105, 1.309, 0.414], T0: 1.3, measured: 'Held out 2021-26: winner No. 1 in 3 of 6, top 3 in 6 of 6.' },
  dpoy: { w: [-0.006, 1.166, 0.917, 2.106, 0.858, 0.312, 0.428], T0: 2.45, measured: 'Held out 2021-26: winner No. 1 in 1 of 6, top 3 in 1 of 6. The weakest race: box scores see little defence.' },
  roy: { w: [1.107, 0.189, 0.196, 0.146, 0.405, 0.835, 0.929], T0: null, measured: 'Held out 2021-26: winner No. 1 in 3 of 6, top 3 in 6 of 6.' },
  mip: { w: [2.328, -2.093, 0.324, 0.337, 0.367, 0.93, 0.762], T0: null, measured: 'Held out 2021-26: winner No. 1 in 2 of 6, top 3 in 3 of 6.' },
  // Finals MVP: within the champion's roster, share ∝ (his share of the club's points + rebounds + assists) ^ a
  fmvp: { a: 4.7, measured: 'The champion\'s top producer won it 11 of 15 times (2012-26, each left out of its own fit).' },
}
