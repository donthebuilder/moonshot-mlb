// 🏅 LAMP'S AWARD RACES: THE MODEL (2026-10-20, Donovan: futures for every sport, "we need those models being ran"). Pure: no
// fetches, so the fit script and the site read the same math. BUCKETS' recipe (lib/nba/awardModel.js) for hockey.
//
// THE SHAPE. One award = a pool of players in one season and a SHARE for each that sums to 1 over the pool: a softmax of a
// weighted sum of his numbers, each a z-score WITHIN THAT SEASON'S POOL (lib/awardCore.js). Weights FITTED on real voting:
// Hockey-Reference's voting pages (points won, every player who got a vote; everyone else in the pool got 0), seasons
// 2012-2026, features from the league's own stats reports (api.nhle.com/stats skater, goalie and team summary) -- the same
// reports LAMP reads live. The fit and its hold-out are in scripts/fit-nhl-awards.mjs and the commit that wrote AWARD_FITS.
//
// GOALIES AND SKATERS IN ONE POOL (Hart, Calder). A skater's scoring numbers are blank for a goalie and a goalie's are blank
// for a skater; a blank is the pool mean (z 0), so each side is z-scored among its own, and `isG` carries what voters think of
// goalies as a group. Per-game rates throughout: the seasons run 48 (2013), ~70 (2020), 56 (2021) and 82 games.
//
// WHAT A SHARE IS. "The share of the race these lines carry if the votes were cast on them". A model's read, never a book's
// price, and never printed as a chance.
import { zScore, softmax, fitSoftmax, fitTemperature, temperatureAt } from '../awardCore'

export { zScore, softmax, fitSoftmax, fitTemperature, temperatureAt }
export const AWARDS_MODEL_VERSION = 'nhl-awards-v1'

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

// A skater traded mid-season is one row with "TOR,BOS"; the club he is on now is the last one named.
const lastClub = (s) => String(s || '').split(',').pop().trim()

/** One row of the league's skater/summary report -> his per-game line (null when he has no games). */
export function skaterLine(r) {
  const gp = num(r?.gamesPlayed) || 0
  if (!gp) return null
  return { id: String(r.playerId), name: r.skaterFullName, team: lastClub(r.teamAbbrevs), pos: r.positionCode, gp,
    g: num(r.goals), a: num(r.assists), pts: num(r.points),
    ptsPg: (num(r.points) || 0) / gp, gPg: (num(r.goals) || 0) / gp, toi: num(r.timeOnIcePerGame), pmPg: (num(r.plusMinus) || 0) / gp }
}
/** One row of goalie/summary -> his line (null without games or shots against). */
export function goalieLine(r) {
  const gp = num(r?.gamesPlayed) || 0, sa = num(r?.shotsAgainst) || 0
  if (!gp || !sa) return null
  return { id: String(r.playerId), name: r.goalieFullName, team: lastClub(r.teamAbbrevs), pos: 'G', gp, gs: num(r.gamesStarted) || 0,
    w: num(r.wins), so: num(r.shutouts), gaa: num(r.goalsAgainstAverage),
    svPct: (num(r.saves) || 0) / sa, saPg: sa / gp }
}
/** The league's save percentage over a goalie report: every save over every shot (null without shots). */
export function leagueSv(rows) {
  let sa = 0, sv = 0
  for (const r of rows || []) { sa += num(r.shotsAgainst) || 0; sv += num(r.saves) || 0 }
  return sa > 0 ? sv / sa : null
}

/**
 * The raw numbers every award reads, from one season line + his club. A line is per game:
 *   skater { pos, gp, ptsPg, gPg, toi (seconds a game), pmPg }   goalie { pos: 'G', gp, gs, svPct, saPg }
 * club { games, pointPct }. lgSv: the league's save percentage that season (every goalie's saves over shots).
 */
export function rawFeatures(l, club, lgSv) {
  const g = l.pos === 'G'
  const tg = num(club?.games)
  const gpFrac = l.gpFrac != null ? l.gpFrac : tg ? Math.min(1, (num(l.gp) || 0) / tg) : null
  const gsFrac = l.gsFrac != null ? l.gsFrac : tg && g ? Math.min(1, (num(l.gs) || 0) / tg) : null
  // goals saved above the league's save percentage, per club game (season length taken out)
  const gsaa = g && num(l.svPct) != null && num(l.saPg) != null && lgSv != null && gpFrac != null ? (l.svPct - lgSv) * l.saPg * gpFrac : null
  return {
    ptsPg: g ? null : num(l.ptsPg), gPg: g ? null : num(l.gPg), toi: g ? null : num(l.toi) != null ? l.toi / 60 : null,
    pmPg: g ? null : num(l.pmPg),
    gpFrac: g ? gsFrac : gpFrac, gsFrac,
    isD: l.pos === 'D' ? 1 : 0, isG: g ? 1 : 0,
    svPct: g ? num(l.svPct) : null, gsaa,
    teamPct: num(club?.pointPct),
  }
}

// THE FOUR VOTED AWARDS. pool: who can get a vote (share of his club's games, so a 48-game season and an 82-game one read the
// same). feats: the fitted inputs, in order (the first is the one-number baseline the fit script scores against).
export const AWARD_DEFS = {
  hart: {
    label: 'Hart', title: 'Hart Trophy (MVP)', hr: 'hart',
    pool: (l, f) => (l.pos === 'G' ? f.gsFrac >= 0.4 : f.gpFrac >= 0.5),
    feats: ['ptsPg', 'gPg', 'gpFrac', 'teamPct', 'isD', 'isG', 'gsaa', 'svPct'],
  },
  vezina: {
    label: 'Vezina', title: 'Vezina Trophy (best goalie)', hr: 'vezina', goalies: true,
    pool: (l, f) => l.pos === 'G' && f.gsFrac >= 0.3,
    feats: ['gsaa', 'svPct', 'gsFrac', 'teamPct'],
  },
  norris: {
    label: 'Norris', title: 'Norris Trophy (best defenseman)', hr: 'norris', defense: true,
    pool: (l, f) => l.pos === 'D' && f.gpFrac >= 0.5,
    feats: ['ptsPg', 'gPg', 'toi', 'pmPg', 'gpFrac', 'teamPct'],
  },
  calder: {
    label: 'Calder', title: 'Calder Trophy (top rookie)', hr: 'calder', rookies: true,
    pool: (l, f) => (l.pos === 'G' ? f.gsFrac >= 0.2 : f.gpFrac >= 0.25),
    feats: ['ptsPg', 'gPg', 'toi', 'gpFrac', 'isD', 'teamPct', 'isG', 'gsaa'],
  },
}

/**
 * EARLY SEASON = MOSTLY LAST SEASON. His per-game line this season, shrunk toward last season's by `k` games of last season
 * (after k games his own season counts half; a page rule, as BUCKETS'). A rookie's line is his own, however few games.
 */
export const BLEND_GAMES = 15
const RATE_KEYS = ['ptsPg', 'gPg', 'toi', 'pmPg', 'svPct', 'saPg', 'gpFrac', 'gsFrac']
export function blendLine(cur, prev, k = BLEND_GAMES) {
  if (!prev) return cur
  if (!cur) return { ...prev, gp: 0, gs: 0, basisLast: true }
  const g = num(cur.gp) || 0
  const a = g / (g + k)
  const out = { ...cur }
  for (const key of RATE_KEYS) {
    const c = num(cur[key]), p = num(prev[key])
    out[key] = c == null ? p : p == null ? c : a * c + (1 - a) * p
  }
  return out
}

// THE FITTED WEIGHTS (scripts/fit-nhl-awards.mjs, all seasons 2012-2026; hold-out numbers in that script's output and the
// commit). T0 = the opening-night temperature (last season's lines against this season's vote); null for the Calder (no NHL
// line yet).
export const AWARD_FITS = {
  hart: { w: [1.643, 0.295, 1.107, 0.42, 0.312, 0.946, 2.432, 0.511], T0: 1.6, measured: 'Held out 2021-26: winner No. 1 in 4 of 6, top 3 in 5 of 6. It misses goalies: Hellebuyck (2025) ranked 52nd.' },
  vezina: { w: [0.677, 1.496, 1.717, 0.796], T0: 4.3, measured: 'Held out 2021-26: winner No. 1 in 4 of 6, top 3 in 6 of 6.' },
  norris: { w: [1.13, 0.171, 1.67, 0.652, 1.263, 0.401], T0: 1.75, measured: 'Held out 2021-26: winner No. 1 in 3 of 6, top 3 in 3 of 6. The weakest race: box scores see little defence.' },
  calder: { w: [1.327, 0.453, 0.443, 1.482, -0.099, 0.214, 0.628, 2.713], T0: null, measured: 'Held out 2021-26: winner No. 1 in 4 of 6, top 3 in 5 of 6.' },
}
