// League Activity shaping (lib/fantasy/activity.js). TEST DATA only.
import { byDay, playerIdsOf, shapeActivity, tradeIdsOf, activityType } from '../lib/fantasy/activity.js'

let failed = 0
const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) failed += 1 }

const players = [
  { id: 'p1', name: 'Test Receiver', position: 'WR', team: 'JAX' },
  { id: 'p2', name: 'Test Defense', position: 'DEF', team: 'HOU' },
  { id: 'p3', name: 'Test Back', position: 'RB', team: 'KC' },
  { id: 'p4', name: 'Test End', position: 'TE', team: 'DAL' },
]
const tx = [
  { id: 't1', team_id: 'A', transaction_type: 'free_agent', added_player_id: 'p1', dropped_player_id: 'p2', details: {}, created_at: '2026-09-24T02:00:00Z' },
  { id: 't2', team_id: 'A', transaction_type: 'trade', details: { trade_id: 'x' }, created_at: '2026-09-23T15:00:00Z' },
  { id: 't3', team_id: 'B', transaction_type: 'trade', details: { trade_id: 'x' }, created_at: '2026-09-23T15:00:00Z' },
  { id: 't4', team_id: 'C', transaction_type: 'drop', dropped_player_id: 'p9', details: {}, created_at: '2026-09-22T15:00:00Z' },
]
const items = [
  { trade_id: 'x', from_team_id: 'A', to_team_id: 'B', player_id: 'p3' },
  { trade_id: 'x', from_team_id: 'B', to_team_id: 'A', player_id: 'p4' },
]
const rows = shapeActivity({ transactions: tx, tradeItems: items, players })

ok('a trade\'s two rows collapse into one', rows.length === 3 && rows.filter((r) => r.kind === 'trade').length === 1)
const trade = rows.find((r) => r.kind === 'trade')
ok('each side lists what it received', trade.sides.find((s) => s.teamId === 'B').gets[0].name === 'Test Back' && trade.sides.find((s) => s.teamId === 'A').gets[0].name === 'Test End')
ok('add/drop carries both players', rows[0].added.name === 'Test Receiver' && rows[0].dropped.name === 'Test Defense' && rows[0].label === 'FREE AGENT')
ok('a missing player is named as unknown, not dropped', rows[2].dropped.name === 'Unknown player')
ok('newest first', rows.map((r) => r.id).join() === 't1,t2,t4')
ok('trade without items still shows both teams', shapeActivity({ transactions: tx.slice(1, 3) })[0].sides.length === 2)
ok('ids for lookups', tradeIdsOf(tx).join() === 'x' && playerIdsOf(tx, items).sort().join() === 'p1,p2,p3,p4,p9')
const days = byDay(rows)
ok(`grouped by Eastern day, 10 PM ET stays on its day (${days.map((d) => d.label).join(' | ')})`, days.length === 2 && days[0].label === 'WED, SEP 23' && days[0].rows.length === 2)
ok('unknown filter falls back to all', activityType('nope') === 'all' && activityType('trades') === 'trades')

if (failed) { console.error(`\n${failed} activity check(s) failed`); process.exit(1) }
console.log('\nall activity checks passed')
