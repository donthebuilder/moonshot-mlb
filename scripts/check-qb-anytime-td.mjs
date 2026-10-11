#!/usr/bin/env node
// QB ANYTIME TD (2026-10-10). TEST data only: made-up players, labelled as such.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-qb-anytime-td.mjs
// Proves: a QB with a TD score appears on the TD board once the file lists QB in markets[TD].positions; a QB with no TD
// score is never invented onto it; the QB pill exists (count 0 + the reason) only when the week has QBs the model does
// not score for TD; the count is real once he is scored; the grading rule counts rushing+receiving TDs, not passing.
import { readFileSync } from 'node:fs'
import { tdPool, QB_TD_NOTE } from '../lib/nfl/tdPool.js'
import { positionOptions, rowMatches } from '../lib/positions.js'
import { tdsIn } from '../lib/nfl/liveSlate.js'

let fail = 0
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : `: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`) }
const P = (id, position, td) => ({ player_id: id, name: `TEST ${id}`, team: 'AAA', opp: 'BBB', position, scores: td == null ? { PASS_YDS: 50 } : { TD: td } })
const week = (positions, players) => ({ markets: [{ key: 'TD', positions }], players })

const today = week(['RB', 'WR', 'TE'], [P('rb', 'RB', 70), P('wr', 'WR', 60), P('qb', 'QB', null)])
eq('TEST: QB with no TD score is not on the board (nothing invented)', tdPool(today).rows.map((p) => p.position), ['RB', 'WR'])
const later = week(['RB', 'WR', 'TE', 'QB'], [P('rb', 'RB', 70), P('qb', 'QB', 65), P('wr', 'WR', 60)])
eq('TEST: once the file lists QB and scores him he is on the board, in score order', tdPool(later).rows.map((p) => p.position), ['RB', 'QB', 'WR'])
eq('TEST: QB listed but unscored stays off', tdPool(week(['QB'], [P('qb', 'QB', null)])).rows.length, 0)

const opt = (rows, pending) => positionOptions('nfl', rows, { posOf: (p) => p.position, pending })
const o1 = opt(tdPool(today).rows, { QB: QB_TD_NOTE })
eq('TEST: pending QB pill offered with 0 and the reason', o1.filter((o) => o.key === 'QB').map((o) => [o.count, o.title, o.pending]), [[0, QB_TD_NOTE, true]])
eq('TEST: no pending pill, no QB pill, when the week has no QBs', opt(tdPool(week(['RB'], [P('rb', 'RB', 70)])).rows, null).some((o) => o.key === 'QB'), false)
const o2 = opt(tdPool(later).rows, null)
eq('TEST: QB pill count is real once scored', o2.filter((o) => o.key === 'QB').map((o) => [o.count, !o.pending]), [[1, true]])
eq('TEST: QB filter keeps only QBs', tdPool(later).rows.filter((p) => rowMatches('nfl', p, ['QB'], { posOf: (x) => x.position })).length, 1)

eq('grading: a QB rushing TD counts, a passing TD does not', [tdsIn({ rushing_tds: 1, passing_tds: 3 }), tdsIn({ passing_tds: 2 })], [1, 0])
const src = readFileSync(new URL('../components/nfl/tabs/Touchdowns.js', import.meta.url), 'utf8')
eq('TD board passes the pending QB note to the shared filter', /pending: qbPending/.test(src), true)
if (fail) { console.log(`\n${fail} FAIL`); process.exit(1) }
console.log('\nall ok')
