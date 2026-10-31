#!/usr/bin/env node
// THE FALSE-HOMER VOID (lib/dash/homerVoid.js). ALL DATA IS TEST DATA (made-up men Test a / Test b, games g1 / g2); a fake db; no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-homer-void.mjs
import assert from 'node:assert/strict'
import { falseRows, voidFalseHomers, voidedKeys, filedElsewhere } from '../lib/dash/homerVoid.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const R = (pid, n, extra = {}) => ({ day: '2026-10-01', player_id: pid, hr_n: n, name: `Test ${pid}`, game_pk: 'g1', ...extra })
const FINAL = (hr) => ({ final: true, hr })
const keys = (rows) => rows.map((r) => `${r.day}:${r.player_id}${r.hr_n}`)

await t('a row above his own game\'s final box-score count is false (the highest hr_n); at or below it is not', () => {
  assert.deepEqual(keys(falseRows([R('a', 1), R('a', 2), R('b', 1)], { g1: FINAL({ a: 1, b: 1 }) })), ['2026-10-01:a2'])
  assert.deepEqual(falseRows([R('a', 1), R('a', 2)], { g1: FINAL({ a: 2 }) }), [])
})
await t('judged by HIS GAME, not the date: a real homer filed under the wrong day is not voided (3 sat on 9-08 for a 9-07 game)', () => {
  assert.deepEqual(falseRows([R('a', 1, { day: '2026-10-02' })], { g1: FINAL({ a: 1 }) }), [])
})
await t('one homer filed under TWO days is one: the later day\'s copy is the extra', () => {
  const both = [R('a', 1, { day: '2026-10-01' }), R('a', 1, { day: '2026-10-02' })]
  assert.deepEqual(keys(falseRows(both, { g1: FINAL({ a: 1 }) })), ['2026-10-02:a1'])
})
await t('never judged: game not final or unreadable, a man not in his game\'s box score, a row with no game_pk', () => {
  assert.deepEqual(falseRows([R('a', 1)], { g1: { final: false, hr: {} } }), [])
  assert.deepEqual(falseRows([R('a', 1)], {}), [])
  assert.deepEqual(falseRows([R('a', 1)], { g1: FINAL({ b: 0 }) }), [])
  assert.deepEqual(falseRows([R('a', 1, { game_pk: null })], { g1: FINAL({ a: 0 }) }), [])
  assert.equal(falseRows([R('z', 1)], { g1: FINAL({ z: 0 }) }).length, 1, 'a man with a line and zero homers: every row goes')
})
const fakeDb = (feed) => {
  const state = { feed, voids: [] }
  const sel = (table) => {
    let rows = table === 'homer_feed' ? state.feed.slice() : state.voids.map((v) => ({ day: v.day, player_id: v.player_id, hr_n: v.hr_n }))
    const q = { eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return q }, neq: (k, v) => { rows = rows.filter((r) => r[k] !== v); return q }, in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return q }, then: (res) => res({ data: rows, error: null }) }
    return q
  }
  return { state, from: (table) => ({
    select: () => sel(table),
    upsert: async (rows) => { state.voids.push(...rows); return { error: null } },
    delete: () => ({ match: async (m) => { state.feed = state.feed.filter((r) => !(r.day === m.day && r.player_id === m.player_id && r.hr_n === m.hr_n)); return { error: null } } }),
  }) }
}
await t('the sweep copies the row (with its day and the box count) to the voids table, THEN removes it; the rest stays', async () => {
  const db = fakeDb([R('a', 1), R('a', 2), R('b', 1), R('a', 1, { day: '2026-10-02' })])
  const out = await voidFalseHomers(db, '2026-10-01', { g1: FINAL({ a: 1, b: 1 }) })
  assert.deepEqual(out.voided.map((v) => `${v.name}#${v.hr_n}`), ['Test a#2', 'Test a#1'])
  assert.deepEqual(db.state.voids.map((v) => `${v.day}:${v.hr_n}:${v.box_hr}`).sort(), ['2026-10-01:2:1', '2026-10-02:1:1'])
  assert.deepEqual(keys(db.state.feed), ['2026-10-01:a1', '2026-10-01:b1'])
})
await t('if the copy fails nothing is deleted; no db or nothing false = nothing happens; the tick\'s guards read the voids and the other day\'s rows', async () => {
  const db = fakeDb([R('a', 1), R('a', 2)]); const real = db.from; db.from = (tb) => (tb === 'homer_feed_voids' ? { ...real(tb), upsert: async () => ({ error: { message: 'no table' } }) } : real(tb))
  const out = await voidFalseHomers(db, '2026-10-01', { g1: FINAL({ a: 1 }) })
  assert.equal(out.voided.length, 0); assert.equal(db.state.feed.length, 2)
  assert.equal((await voidFalseHomers(null, '2026-10-01', {})).voided.length, 0)
  const ok = fakeDb([R('a', 1), R('a', 2)]); await voidFalseHomers(ok, '2026-10-01', { g1: FINAL({ a: 1 }) })
  assert.ok((await voidedKeys(ok, '2026-10-01')).has('a:2'))
  const two = fakeDb([R('a', 1, { day: '2026-10-01' })])
  assert.ok((await filedElsewhere(two, '2026-10-02', ['g1'])).has('g1|a|1'))
  assert.equal((await filedElsewhere(two, '2026-10-01', ['g1'])).size, 0, 'the same day is the tick\'s own claim, not a duplicate')
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: homer void')
process.exit(failed ? 1 : 0)
