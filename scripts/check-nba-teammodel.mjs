#!/usr/bin/env node
// BUCKETS team model (expected points) -- offline checks. Every club line and game below is TEST DATA
// (made up, labelled TEST); no network. The real-games numbers are scripts/backtest-nba-teammodel.mjs.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-teammodel.mjs
import { averageOf, clubLine, leagueMean, restBefore, sidePoints, projectGame, pairingTotals, percentileIn, PARAMS, EXPECTED_POINTS_WORDS } from '../lib/nba/teamModel.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e
const P = { ...PARAMS, form: 'additive', home: 0, backToBack: 0, defWeight: 1, priorKeep: 1, shrinkGames: 10 }

// TEST: league 100 a team-game. TST-A scores 110 allows 100; TST-B scores 100 allows 90 (a stingy club).
const L = 100
const prior = { A: { pf: 110, pa: 100 }, B: { pf: 100, pa: 90 } }
const games = (n, us, them) => Array.from({ length: n }, () => ({ us, them }))

check(EXPECTED_POINTS_WORDS === 'expected points', 'the wording is one constant')
check(averageOf([]) === null && averageOf([{ us: 100, them: 90 }, { us: 110, them: 100 }]).pf === 105, 'averageOf: no games -> null; mean of the games')
check(clubLine([], null, L) === null, 'no prior and no games -> no line (never a guess)')
check(clubLine([], prior.A, null) === null, 'no league mean -> no line')
const a0 = clubLine([], prior.A, L, P)
check(a0.n === 0 && a0.basis === 'last season' && near(a0.pf, 110) && near(a0.pa, 100), 'no games yet: all prior, labelled "last season"')
const half = clubLine(games(10, 120, 100), prior.A, L, P)
check(near(half.pf, 115) && half.basis === 'part last season', '10 games at 120 vs a 110 prior with 10 games of weight -> 115, "part last season"')
const full = clubLine(games(60, 120, 100), prior.A, L, P)
check(full.basis === 'this season' && full.pf > 118 && full.pf < 120, '60 games: mostly this season')
const half2 = clubLine([], prior.A, L, { ...P, priorKeep: 0.5 })
check(near(half2.pf, 105), 'priorKeep 0.5 pulls last season halfway to the league mean')
check(near(clubLine(games(5, 90, 90), null, L, P).pf, (5 * 90 + 10 * 100) / 15), 'no prior: the league mean stands in, not zero')

check(near(leagueMean(0, 0, 112, P), 112), 'league mean: before any game, last season\'s')
check(near(leagueMean(0, 0, null, P), NaN) === false && leagueMean(0, 0, null, P) === null, 'league mean: nothing known -> null')
check(near(leagueMean(1000, 115000, 112, { ...P, leagueShrinkGames: 200 }), (115000 + 200 * 112) / 1200), 'league mean: this season to date, leaning on last season early')

const aL = clubLine([], prior.A, L, P), bL = clubLine([], prior.B, L, P)
check(near(sidePoints(aL, bL, L, {}, P), 100 + 10 + -10), 'additive: league + own scoring gap + opponent allowed gap')
const g = projectGame({ away: aL, home: bL, L }, P)
check(near(g.away + g.home, g.total) && g.basis === 'last season', 'total = away + home; the game takes the weaker basis')
const sw = projectGame({ away: bL, home: aL, L }, P)
check(near(sw.total, g.total), 'with no home court the total does not depend on who is home')
const H = { ...P, home: 1.5 }
const gh = projectGame({ away: aL, home: bL, L }, H)
check(near(gh.home - g.home, 1.5) && near(g.away - gh.away, 1.5) && near(gh.total, g.total), 'home court: + to the home club, - to the road club, the total unchanged')
const gb = projectGame({ away: aL, home: bL, L, rest: { away: 1, home: 3 } }, { ...P, backToBack: 2 })
check(near(g.away - gb.away, 2) && near(g.home, gb.home) && gb.b2b.away === true && gb.b2b.home === false, 'back-to-back: the tired club loses the constant, the rest club does not')
const gn = projectGame({ away: aL, home: bL, L, rest: { away: null, home: null } }, { ...P, backToBack: 2 })
check(near(gn.total, g.total), 'no earlier game (rest null) is not a back-to-back')
check(projectGame({ away: null, home: bL, L }, P) === null && projectGame({ away: aL, home: bL, L: null }, P) === null, 'a club with no line -> no projection')
const M = { ...P, form: 'multiplicative' }
check(near(sidePoints(aL, bL, L, {}, M), 110 * 90 / 100), 'multiplicative: own scoring x opponent allowed / league')
const lowD = clubLine([], { pf: 100, pa: 80 }, L, P)
check(sidePoints(aL, lowD, L, {}, P) < sidePoints(aL, bL, L, {}, P), 'a stingier opponent lowers the number')

check(restBefore(['2026-10-20', '2026-10-22'], '2026-10-23') === 1 && restBefore(['2026-10-20'], '2026-10-23') === 3 && restBefore([], '2026-10-23') === null, 'restBefore: 1 = played last night; none = null')
check(restBefore(['2026-10-23', '2026-10-25'], '2026-10-23') === null, 'restBefore: games on or after the day are not earlier games')
check(restBefore(['2026-02-28'], '2026-03-01') === 1, 'restBefore: month change')

const lines = { A: aL, B: bL, C: clubLine([], { pf: 105, pa: 105 }, L, P) }
const dist = pairingTotals(lines, L, P)
check(dist.length === 6 && dist.every((v, i) => i === 0 || dist[i - 1] <= v), 'pairingTotals: every ordered pairing, sorted')
check(percentileIn(dist, dist[dist.length - 1]) === 1 && percentileIn(dist, dist[0] - 1) === 0 && percentileIn([], 5) === null && percentileIn(dist, NaN) === null, 'percentileIn: top = 1, below all = 0, nothing = null')
check(near(percentileIn([1, 2, 3, 4], 2.5), 0.5), 'percentileIn: share at or below')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
