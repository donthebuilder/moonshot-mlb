#!/usr/bin/env node
// NBA ODDS CAPTURE (2026-10-24) -- offline: an NBA event the snapshot table cannot store yields no snapshot rows, while its
// over/under lines still come out. TEST event below is made up (labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-odds-capture.mjs
import { snapRows, MARKETS, listWaits } from '../lib/odds/snap.js'
import { linesRows } from '../lib/odds/lines.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const book = { draftkings: { odds: '+450', available: true } }
const ev = {   // TEST
  eventID: 'TEST_NBA', leagueID: 'NBA', status: { startsAt: '2099-01-01T00:00:00Z' },
  teams: { home: { teamID: 'H', names: { short: 'HOM' } }, away: { teamID: 'A', names: { short: 'AWY' } } },
  players: { TEST_GUY_1_NBA: { name: 'Test Guy', teamID: 'H' } },
  odds: {
    'firstBasket-TEST_GUY_1_NBA-game-yn-yes': { playerID: 'TEST_GUY_1_NBA', byBookmaker: book },
    'points-TEST_GUY_1_NBA-game-ou-over': { playerID: 'TEST_GUY_1_NBA', statID: 'points', periodID: 'game', betTypeID: 'ou', sideID: 'over', bookOverUnder: '18.5', bookOdds: '-110', byBookmaker: { draftkings: { odds: '-110', overUnder: '18.5', available: true } } },
  },
}
check(MARKETS.NBA.stored === false, 'NBA first basket is not stored until the odds_snap market check allows it')
check(snapRows(ev, 'lock', '2098-12-31T23:00:00Z', () => '1').rows.length === 0, 'snapRows gives NBA nothing (no refused write to block the lock)')
const L = linesRows(ev, 'lock', '2098-12-31T23:00:00Z', () => '1').rows
check(L.some((r) => r.market === 'pts'), 'the points over/under line still comes out')
check(listWaits('NBA', 0) && listWaits('NBA', 11) && !listWaits('NBA', 12), 'NBA\'s day list waits until noon ET')
check(!listWaits('NHL', 0) && !listWaits('NFL', 0) && !listWaits('MLB', 0), 'every other league lists at the first tick, as before')
// ALTERNATE RUNGS (10-30): the Card's bar is 25+ points; a 23.5 main line plus 24.5 / 25.5 / 26.5 / 27.5 / 29.5 alternates stores the 3 lowest rungs (24.5 IS the 25+ bar)
const alt = (line, odds) => ({ overUnder: String(line), odds, available: true })
const evAlt = {   // TEST
  ...ev, odds: { 'points-TEST_GUY_1_NBA-game-ou-over': { playerID: 'TEST_GUY_1_NBA', statID: 'points', periodID: 'game', betTypeID: 'ou', sideID: 'over', bookOverUnder: '23.5', bookOdds: '-110', byBookmaker: {
    draftkings: { odds: '-110', overUnder: '23.5', available: true, altLines: [alt(24.5, '+120'), alt(25.5, '+150'), alt(26.5, '+190'), alt(27.5, '+240'), alt(29.5, '+400')] },
    fanduel: { odds: '-112', overUnder: '23.5', available: true, altLines: [alt(25.5, '+160'), alt(26.5, '+200')] },
  } } },
}
const A = linesRows(evAlt, 'lock', '2098-12-31T23:00:00Z', () => '1').rows.filter((r) => r.market === 'pts')
check(A.length === 4 && A.filter((r) => String(r.odd_id).includes('@')).length === 3, 'one main row plus the 3 lowest alternate rungs at or above the 25+ bar')
check(A.filter((r) => r.odd_id.includes('@')).map((r) => r.line).join() === '24.5,25.5,26.5', 'the rungs are 24.5 (the 25+ bar itself), 25.5, 26.5; 27.5 and 29.5 are past the 3')
const r255 = A.find((r) => r.odd_id.endsWith('@25.5'))
check(r255 && r255.books === 2 && r255.odds >= 150 && r255.odds <= 160 && r255.best_odds === 160, 'a rung is the median across the books listing it, best = the longest')
const benchEv = { ...evAlt, odds: { 'points-TEST_GUY_1_NBA-game-ou-over': { ...evAlt.odds['points-TEST_GUY_1_NBA-game-ou-over'], bookOverUnder: '9.5' } } }
check(linesRows(benchEv, 'lock', 'x', () => '1').rows.filter((r) => r.market === 'pts').length === 1, 'a bench man (main line under 60% of the bar) gets no alternate rows')
const nhlEv = { ...evAlt, leagueID: 'NHL' }
check(!linesRows(nhlEv, 'lock', 'x', () => '1').rows.some((r) => String(r.odd_id).includes('@')), 'other leagues are untouched')
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall nba odds capture checks ok')
