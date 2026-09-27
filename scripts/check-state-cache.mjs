// lib/dash/stateCache.js: subscriber settings read by stamp.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-state-cache.mjs
// A fake client records every select, so the checks can count what a tick
// would pull from Supabase.
import { readUserState } from '../lib/dash/stateCache.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }

function fakeDb(rows) {
  const calls = []
  return {
    calls, rows,
    from() {
      const q = { cols: '', f: {} }
      const api = {
        select(c) { q.cols = c; return api },
        in(col, vals) {
          q.f[col] = vals
          if (!('user_id' in q.f && 'key' in q.f)) return api
          calls.push(q.cols)
          const out = rows.filter((r) => q.f.user_id.includes(r.user_id) && q.f.key.includes(r.key))
            .map((r) => Object.fromEntries(q.cols.split(',').map((c) => [c, r[c]])))
          return Promise.resolve({ data: out, error: null })
        },
      }
      return api
    },
  }
}
const KEYS = ['dash_alerts_v1', 'dash_follow_v1']
const rows = [
  { user_id: 'u1', key: 'dash_follow_v1', value: { big: 1 }, updated_at: 't1' },
  { user_id: 'u1', key: 'dash_alerts_v1', value: { a: 1 }, updated_at: 't1' },
  { user_id: 'u2', key: 'dash_follow_v1', value: { small: 1 }, updated_at: 't1' },
]
const db = fakeDb(rows)
const cache = new Map()
const valueReads = () => db.calls.filter((c) => c.includes('value')).length

const r1 = await readUserState(db, ['u1', 'u2'], KEYS, cache)
check(r1.length === 3 && valueReads() === 1, 'cold: one stamp read + one value read, all 3 rows')
await readUserState(db, ['u1', 'u2'], KEYS, cache)
check(valueReads() === 1 && db.calls.length === 3, 'warm, nothing changed: stamps only, no value read')
rows[2] = { ...rows[2], value: { small: 2 }, updated_at: 't2' }
const r3 = await readUserState(db, ['u1', 'u2'], KEYS, cache)
check(valueReads() === 2 && r3.find((r) => r.user_id === 'u2').value.small === 2, 'u2 changed: values re-read, new value served')
check(r3.find((r) => r.key === 'dash_follow_v1' && r.user_id === 'u1').value.big === 1, 'u1 unchanged: served from cache')
rows.splice(1, 1)
const r4 = await readUserState(db, ['u1', 'u2'], KEYS, cache)
check(r4.length === 2 && !r4.some((r) => r.key === 'dash_alerts_v1'), 'a deleted row drops out')
check((await readUserState(db, [], KEYS, cache)).length === 0, 'no subscribers: no read at all')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
