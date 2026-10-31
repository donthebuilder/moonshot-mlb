#!/usr/bin/env node
// THE DAY-BEFORE LIST (lib/odds/snap.js listDays, app/api/odds/tick). Offline: pure function + the tick's source. No network, no data.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-odds-day-before.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { listDays, LIST_AHEAD_FROM_ET_HOUR } from '../lib/odds/snap.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const nextDay = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
const SAT = '2026-10-31', SUN = '2026-11-01'

t('NFL on its own day lists tomorrow too, from noon ET', () => {
  assert.deepEqual(listDays('NFL', SAT, SAT, 12, nextDay), [SAT, SUN])
  assert.deepEqual(listDays('NFL', SAT, SAT, 23, nextDay), [SAT, SUN])
})
t('before noon ET: today only (no object is spent early)', () => {
  assert.deepEqual(listDays('NFL', SAT, SAT, 11, nextDay), [SAT])
  assert.deepEqual(listDays('NFL', SAT, SAT, 0, nextDay), [SAT])
})
t('a manual ?date= for another day lists that day only (backfills never reach ahead)', () => {
  assert.deepEqual(listDays('NFL', '2026-10-25', SAT, 15, nextDay), ['2026-10-25'])
})
t('every other league is unchanged: MLB, NHL, NBA list their own day only', () => {
  for (const L of ['MLB', 'NHL', 'NBA']) assert.deepEqual(listDays(L, SAT, SAT, 15, nextDay), [SAT], L)
  assert.deepEqual(Object.keys(LIST_AHEAD_FROM_ET_HOUR), ['NFL'])
})
t('the tick lists each ET day through the same once-a-day guards (event map check + listed marker), and lock / close are untouched', () => {
  const src = fs.readFileSync(new URL('../app/api/odds/tick/route.js', import.meta.url), 'utf8')
  assert.match(src, /for \(const listDay of listDays\(league, date, easternToday\(\)/)
  assert.match(src, /\.eq\('game_date', listDay\)\.limit\(1\)/, 'the per-day "already listed" read is keyed on the day being listed')
  assert.match(src, /listed:\$\{sport\}:\$\{listDay\}/, 'the marker is per listed day, so an empty day is paid for once')
  assert.ok(!/\bdate\b/.test(src.slice(src.indexOf('const listDay') > 0 ? src.indexOf('for (const listDay') : 0, src.indexOf('// ── LOCK / CLOSE')).replace(/listDays\(league, date, easternToday\(\)/, '')), 'no stray use of the tick\'s own date inside the list block')
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: odds day-before list')
process.exit(failed ? 1 : 0)
