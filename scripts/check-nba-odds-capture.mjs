#!/usr/bin/env node
// NBA ODDS CAPTURE (2026-10-24) -- offline: an NBA event the snapshot table cannot store yields no snapshot rows, while its
// over/under lines still come out. TEST event below is made up (labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-odds-capture.mjs
import { snapRows, MARKETS } from '../lib/odds/snap.js'
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
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall nba odds capture checks ok')
