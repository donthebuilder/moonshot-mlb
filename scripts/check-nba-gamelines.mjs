#!/usr/bin/env node
// CHECKS for BUCKETS' "our line" (lib/nba/gameLines.js) and the book's game line (lib/odds/gameLine.js). TEST DATA ONLY:
// every event, club and price below is made up for the check and labelled so.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-gamelines.mjs
import { gameLineRow, bookLinesFor, spreadOf, moneylineOf } from '../lib/odds/gameLine.js'
import { projectMargin, missingValue, rotationOf, gameScore, atsResult, solveRatings, LINE_PARAMS } from '../lib/nba/gameLines.js'
import { SPORT_LINES } from '../lib/gameLines.js'
import { bookTeamKey } from '../lib/odds/gameTotal.js'

let bad = 0
const eq = (what, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// TEST event (made up): AAA at BBB, home BBB +1.5, moneylines +100 / -120
const book = (odds, extra = {}) => ({ odds, available: true, ...extra })
const TEST_EV = {
  leagueID: 'NBA', eventID: 'TEST-1', status: { startsAt: '2999-01-02T00:30:00.000Z' },
  teams: { away: { names: { short: 'AAA' } }, home: { names: { short: 'BBB' } } },
  odds: {
    'points-home-game-sp-home': { bookSpread: '+1.5', bookOdds: '-111', openBookSpread: '+2.5', byBookmaker: { b1: book('-112', { spread: '+1.5' }), b2: book('-110', { spread: '+2' }) } },
    'points-away-game-sp-away': { bookSpread: '-1.5', bookOdds: '-110', byBookmaker: { b1: book('-108', { spread: '-1.5' }) } },
    'points-home-game-ml-home': { bookOdds: '+100', openBookOdds: '-125', byBookmaker: { b1: book('+100') } },
    'points-away-game-ml-away': { bookOdds: '-120', openBookOdds: '+100', byBookmaker: { b1: book('-120') } },
    'firstToScore-home-game-ml-home': { bookOdds: '+112', byBookmaker: { b9: book('+112') } },
  },
}
const row = gameLineRow(TEST_EV, 'list', '2999-01-01T12:00:00.000Z')
eq('row: spread from the home side', [row.spread_home, row.spread_home_odds, row.spread_away_odds, row.spread_books, row.open_spread_home], [1.5, -111, -110, 1, 2.5])
eq('row: moneylines (points, not first-to-score)', [row.ml_home, row.ml_away, row.ml_books, row.open_ml_home], [100, -120, 1, -125])
eq('row: game date is the game\'s own (ET)', row.game_date, '2999-01-01')
eq('row: no fair price kept', Object.keys(row).some((k) => /fair/.test(k)), false)
eq('spread with sides that do not match -> none', spreadOf({ odds: { ...TEST_EV.odds, 'points-away-game-sp-away': { bookSpread: '-2.5', byBookmaker: { b1: book('-110', { spread: '-2.5' }) } } } }).spread_home, null)
eq('spread no live book on the number -> none', spreadOf({ odds: { ...TEST_EV.odds, 'points-home-game-sp-home': { bookSpread: '+1.5', byBookmaker: { b1: book('-110', { spread: '+1.5', available: false }) } } } }).spread_home, null)
eq('moneyline with one side missing -> none', moneylineOf({ odds: { 'points-home-game-ml-home': TEST_EV.odds['points-home-game-ml-home'] } }).ml_home, null)
eq('a league we do not keep -> no row', gameLineRow({ ...TEST_EV, leagueID: 'NCAAB' }, 'list', 'x'), null)
for (const L of ['NFL', 'NHL', 'MLB']) eq(`${L} rows kept, keyed by its sport`, gameLineRow({ ...TEST_EV, leagueID: L }, 'list', '2999-01-01T12:00:00.000Z')?.sport, L.toLowerCase())
eq('neither half -> no row', gameLineRow({ ...TEST_EV, odds: {} }, 'list', 'x'), null)

// book lines for a game: the newest row taken before now and before tip, matching the pair
const start = Date.parse('2999-01-02T00:30:00.000Z')
const rows = [
  { ...row, taken_at: '2999-01-01T12:00:00.000Z' },
  { ...row, snap: 'lock', spread_home: 2.5, taken_at: '2999-01-01T23:40:00.000Z' },
  { ...row, snap: 'close', spread_home: 3.5, taken_at: '2999-01-02T00:40:00.000Z' },   // after tip: never used
]
const g = [{ game_id: 'G1', away: 'AAA', home: 'BBB', start_ms: start }]
eq('book: newest before now', bookLinesFor('nba', g, rows, Date.parse('2999-01-02T00:00:00.000Z')).get('G1').spread_home, 2.5)
eq('book: before the lock snapshot existed', bookLinesFor('nba', g, rows, Date.parse('2999-01-01T20:00:00.000Z')).get('G1').spread_home, 1.5)
eq('book: never a row taken at/after tip', bookLinesFor('nba', g, rows, Date.parse('2999-01-03T00:00:00.000Z')).get('G1').spread_home, 2.5)
eq('book: another pair -> none', bookLinesFor('nba', [{ ...g[0], away: 'CCC' }], rows, Date.parse('2999-01-02T00:00:00.000Z')).has('G1'), false)

// the model's signs
const P = { ...LINE_PARAMS, home: 1.5, backToBack: 1.5, value: 0.2 }
eq('margin: home court', projectMargin(0, 0, {}, P), 1.5)
eq('margin: home on a back-to-back', projectMargin(0, 0, { b2bHome: true }, P), 0)
eq('margin: road club missing 10 game score -> home +2', projectMargin(0, 0, { missAway: 10 }, P), 3.5)
eq('margin: home club missing 10 -> home -2', projectMargin(0, 0, { missHome: 10 }, P), -0.5)
eq('margin: no rating -> null', projectMargin(null, 0, {}, P), null)

// who plays (TEST players)
const rot = rotationOf([[{ id: 'p1', min: 30, gs: 15 }, { id: 'p2', min: 20, gs: 4 }], [{ id: 'p1', min: 30, gs: 15 }]])
eq('rotation: minutes a game, a game sat = 0', rot.rotation.map((r) => [r.id, r.min]), [['p1', 30], ['p2', 10]])
const miss = missingValue(rot.rotation, new Set(['p2']), rot.rate)
eq('missing value: p1 out = his rate x his minutes', Math.round(miss * 100) / 100, Math.round(rot.rate('p1') * 30 * 100) / 100)
eq('missing value: nobody out = 0', missingValue(rot.rotation, new Set(['p1', 'p2']), rot.rate), 0)
eq('game score (TEST line)', Math.round(gameScore({ pts: 20, fgm: 8, fga: 15, ftm: 3, fta: 4, oreb: 1, dreb: 5, stl: 1, ast: 4, blk: 0, pf: 2, to: 3 }) * 10) / 10, 14.5)

// grades, from the home side
eq('ats: home -5.5 wins by 6 -> home', atsResult(6, -5.5), 'home')
eq('ats: home -5.5 wins by 5 -> away', atsResult(5, -5.5), 'away')
eq('ats: home +3 loses by 3 -> push', atsResult(-3, 3), 'push')

// ratings: a club that beats everyone rates above one that loses to everyone (TEST season)
const games = [{ away: 'X', home: 'Y', as: 110, hs: 100, ago: 1 }, { away: 'Z', home: 'X', as: 95, hs: 112, ago: 2 }, { away: 'Y', home: 'Z', as: 101, hs: 99, ago: 3 }]
const r = solveRatings(games, ['X', 'Y', 'Z'], {}, P)
eq('ratings: X above Y and Z', r.X > r.Y && r.X > r.Z, true)
eq('ratings: league centred at 0', Math.abs(r.X + r.Y + r.Z) < 1e-9, true)

// every sport: a version of its own, a unit, and a home edge the backtest picked
for (const [sp, S] of Object.entries(SPORT_LINES)) eq(`${sp}: own model version and unit`, [S.version.startsWith(`${sp}-lines-`), Boolean(S.unit), Number.isFinite(S.params.home)], [true, true, true])
eq('neutral site: no home edge', projectMargin(0, 0, {}, { ...SPORT_LINES.nfl.params, home: 0 }), 0)
// ESPN's club codes meet SGO's (TEST pairs from the codes each feed uses)
eq('nfl codes meet', [bookTeamKey('nfl', 'WSH'), bookTeamKey('nfl', 'LAR')], [bookTeamKey('nfl', 'WAS'), bookTeamKey('nfl', 'LA')])
eq('mlb codes meet', [bookTeamKey('mlb', 'CHW'), bookTeamKey('mlb', 'ATH')], [bookTeamKey('mlb', 'CWS'), bookTeamKey('mlb', 'OAK')])

console.log(bad ? `\n${bad} check(s) failed` : '\nOK: our line + book line checks pass')
process.exit(bad ? 1 : 0)
