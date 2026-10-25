#!/usr/bin/env node
// OUT MEN OFF THE ATTACK LISTS (2026-10-24) -- offline checks for lib/injuries dropBlocked and lib/nfl/roles slideRoles.
// Every row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-out-slides.mjs
import { indexEntries, dropBlocked } from '../lib/injuries/lookup.js'
import { slideRoles } from '../lib/nfl/roles.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST NBA report: 1 OUT, 2 QUESTIONABLE, 3 DOUBTFUL
const idx = indexEntries('nba', [
  { player_id: '1', name: 'Test One', team: 'BOS', status: 'OUT' },
  { player_id: '2', name: 'Test Two', team: 'BOS', status: 'QUESTIONABLE' },
  { player_id: '3', name: 'Test Three', team: 'BOS', status: 'DOUBTFUL' },
])
const rows = [1, 2, 3, 4].map((i) => ({ playerId: String(i), name: `Test ${i}`, team: 'BOS' }))
const kept = dropBlocked(idx, rows).map((r) => r.playerId)
check(kept.join(',') === '2,4', 'OUT and DOUBTFUL leave; QUESTIONABLE and the unlisted stay')
check(dropBlocked(null, rows) === rows, 'no report = the rows as they are (a missing report never empties a list)')
const best = (rs) => rs.slice().sort((a, b) => Number(a.playerId) - Number(b.playerId))[0]
check(best(dropBlocked(idx, rows)).playerId === '2', 'filtered BEFORE the pick: the next man takes the slot')

// TEST NFL depth: TST WR1 out
const players = [['a', 'WR1'], ['b', 'WR2'], ['c', 'WR3'], ['d', 'Other WR'], ['e', 'RB1'], ['q', 'QB']].map(([id]) => ({ player_id: id, team: 'TST' }))
const roles = { a: 'WR1', b: 'WR2', c: 'WR3', d: 'Other WR', e: 'RB1', q: 'QB' }
const s = slideRoles(roles, players, (p) => p.player_id === 'a')
check(!('a' in s) && s.b === 'WR1' && s.c === 'WR2' && s.d === 'WR3', 'WR1 out: WR2 -> WR1, WR3 -> WR2, the best Other WR -> WR3')
check(s.e === 'RB1' && s.q === 'QB', 'other positions untouched')
const s2 = slideRoles(roles, players, (p) => p.player_id === 'q')
check(!('q' in s2) && s2.a === 'WR1', 'QB out: he drops, nobody else moves')
check(slideRoles(roles, players, () => false).d === 'Other WR', 'nobody out: the chart as it was')

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall out-slide checks ok')
