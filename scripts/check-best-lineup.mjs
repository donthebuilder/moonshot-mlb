// Set best lineup never moves a locked player and starts the healthy best --
// TEST DATA only. (2026-09-24: the 3zzz Lawrence-over-Hurts case.)
// Run: node --import ./scripts/_esm-resolve.mjs scripts/check-best-lineup.mjs
import { planBestLineup } from '../lib/fantasy/optimizeLineup.js'
import { lineupCheck } from '../lib/fantasy/lineupCheck.js'

let failed = 0
const ok = (name, cond) => { if (!cond) failed++; console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${name}`) }
const P = (id, position, v, extra = {}) => ({ id, name: id, position, team: 'T' + id, v, ...extra })
const roster = [
  P('qbLow', 'QB', 17), P('qbHigh', 'QB', 22), P('rb1', 'RB', 15), P('rb2', 'RB', 12), P('rbOut', 'RB', 30, { injury_status: 'OUT' }),
  P('wr1', 'WR', 14), P('wr2', 'WR', 11), P('wr3', 'WR', 10), P('te', 'TE', 9), P('k', 'K', 7), P('def', 'DEF', 6), P('rbLocked', 'RB', 1),
]
const rows = [
  { slot: 'QB', slot_index: 1, player_id: 'qbLow' }, { slot: 'RB', slot_index: 1, player_id: 'rbLocked', locked_at: '2026-09-24T00:00:00Z' },
  { slot: 'BENCH', slot_index: 1, player_id: 'qbHigh' },
]
const league = { has_kicker: true, has_defense: true }
const plan = planBestLineup({ league, roster, rows, started: () => false, onBye: () => false, project: (p) => p.v })
const at = (slot, i) => plan.rows.find((r) => r.slot === slot && r.slot_index === i)?.player_id
ok('the better QB starts', at('QB', 1) === 'qbHigh')
ok('the locked RB1 is not in the plan (it stays put)', !plan.rows.some((r) => r.player_id === 'rbLocked') && at('RB', 1) === undefined)
ok('RB2 goes to the best healthy RB', at('RB', 2) === 'rb1')
ok('the OUT back does not start', !plan.rows.some((r) => r.player_id === 'rbOut' && r.slot !== 'BENCH'))
ok('FLEX takes the next best eligible', at('FLEX', 1) === 'rb2')
ok('the benched QB is on the bench', plan.rows.some((r) => r.player_id === 'qbLow' && r.slot === 'BENCH'))
ok(`it counts changes (${plan.changed})`, plan.changed > 0)

const checks = lineupCheck({ starters: [{ slot: 'QB', slot_index: 1, player_id: 'qbLow', player: roster[0] }], roster, project: (p) => p.v, byeTeams: null })
ok('lineup check names Hurts-over-Lawrence style swaps', checks.length === 1 && checks[0].bench.id === 'qbHigh')

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall best-lineup checks passed')
