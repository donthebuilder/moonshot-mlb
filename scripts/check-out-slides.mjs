#!/usr/bin/env node
// OUT MEN OFF THE ATTACK LISTS (2026-10-24) -- offline checks for lib/injuries dropBlocked.
// Every row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-out-slides.mjs
import { indexEntries, dropBlocked } from '../lib/injuries/lookup.js'

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

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall out-slide checks ok')
