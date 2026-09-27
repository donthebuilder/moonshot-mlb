#!/usr/bin/env node
// Arithmetic tests for lib/odds/priceAtLock.js + roi.js. No network, no DB.
//   node scripts/odds/check-roi.mjs
import './../_esm-resolve.mjs'
const { pricesFromRows, impliedOf, americanOf, winProfit } = await import('../../lib/odds/priceAtLock.js')
const { roiTable, bandOf } = await import('../../lib/odds/roi.js')
const { mlbPicksFromGraded } = await import('../../lib/odds/gradedPicks.js')

let pass = 0; let fail = 0
const check = (label, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`); ok ? pass++ : fail++ }
const near = (a, b) => Math.abs(a - b) < 1e-9

check('+300 implies 25%', near(impliedOf(300), 0.25), impliedOf(300))
check('-150 implies 60%', near(impliedOf(-150), 0.6), impliedOf(-150))
check('25% is +300', americanOf(0.25) === 300, americanOf(0.25))
check('60% is -150', americanOf(0.6) === -150, americanOf(0.6))
check('+250 win pays 2.5', near(winProfit(250), 2.5), winProfit(250))
check('-200 win pays 0.5', near(winProfit(-200), 0.5), winProfit(-200))
check('bands: +149 short, +150 mid, +400 mid, +401 long, +901 longshot',
  [bandOf(149), bandOf(150), bandOf(400), bandOf(401), bandOf(901)].join() === 'short,mid,mid,long,longshot')

const row = (o) => ({ sport: 'mlb', game_date: '2026-09-26', our_player_id: '1', event_id: 'e1', available: true, taken_at: 't', ...o })
const { prices, ambiguous } = pricesFromRows([
  row({ book: 'a', odds: 300 }), row({ book: 'b', odds: 400 }), row({ book: 'c', odds: 900, available: false }),
  row({ our_player_id: '2', event_id: 'e1', book: 'a', odds: 500 }), row({ our_player_id: '2', event_id: 'e2', book: 'a', odds: 600 }),
])
const p1 = prices.get('mlb:2026-09-26:1')
check('best skips an unavailable book (+400, not +900)', p1?.best === 400 && p1.best_book === 'b', p1)
check('median of +300/+400 in implied terms (22.5%) is +344', p1?.median === 344, p1)
check('two events one date = ambiguous, no price', !prices.has('mlb:2026-09-26:2') && ambiguous === 1, { ambiguous })

// 100 picks at +300 median / +400 best, 25 hits: fair at the median.
const picks = Array.from({ length: 100 }, (_, i) => ({ sport: 'nhl', status: 'called', result: i < 25 ? 'hit' : 'miss', price: { best: 400, median: 300 } }))
picks.push({ sport: 'nhl', status: 'called', result: 'void', price: { best: 400, median: 300 } })
const [t] = roiTable(picks)
check('void is not a pick (n = 100)', t.n === 100, t)
check('25 hits at +300 = 0% ROI at the median', near(t.roiMedian, 0), t.roiMedian)
check('25 hits at +400 best = +25% ROI', near(t.roiBest, 25), t.roiBest)
check('n = 100 is shown; 99 is not', t.shown && !roiTable(picks.slice(1))[0].shown)

const mp = mlbPicksFromGraded('2026-09-26', { graded_slots: [
  { player_id: 7, name: 'A', game_pick_role: 'TOP', is_final: true, plate_appearances: 4, actual_hr: 1 },
  { player_id: 7, name: 'A', game_pick_role: 'HR', is_final: true, plate_appearances: 4, actual_hr: 1 },
  { player_id: 8, name: 'B', game_pick_role: 'WATCH', is_final: true, plate_appearances: 0, actual_hr: 0 },
  { player_id: 9, name: 'C', game_pick_role: 'HIT', is_final: false, plate_appearances: 2, actual_hr: 0 },
] })
const a = mp.find((x) => x.player_id === '7')
check('MLB: two slots, one player, one hit, HR call, CALLED', mp.length === 3 && a.result === 'hit' && a.hrCall && a.status === 'called', mp)
check('MLB: no PA = void; WATCH = on the board', mp.find((x) => x.player_id === '8').result === 'void' && mp.find((x) => x.player_id === '8').status === 'board')
check('MLB: not final = not graded; HIT is a call but not an HR call', mp.find((x) => x.player_id === '9').result === null && !mp.find((x) => x.player_id === '9').hrCall)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
