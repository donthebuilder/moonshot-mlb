#!/usr/bin/env node
// lib/contact.js, checked (2026-09-27). TEST DATA below is made up for the
// arithmetic and labelled as such; nothing here is a real player's line.
//   node scripts/check-contact.mjs
import assert from 'node:assert/strict'
import './_esm-resolve.mjs'
const { statcastBarrel, windowRows, contactStats, discipline, isBBE } = await import('../lib/contact.js')

let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

// Statcast's zone edges: 26-30 at 98, 25-31 at 99, 24-33 at 100, 8-50 at 116+.
ok('barrel zone edges', () => {
  assert.equal(statcastBarrel(97.9, 28), false)
  assert.equal(statcastBarrel(98, 26), true); assert.equal(statcastBarrel(98, 30), true)
  assert.equal(statcastBarrel(98, 25), false); assert.equal(statcastBarrel(98, 31), false)
  assert.equal(statcastBarrel(99, 25), true); assert.equal(statcastBarrel(99, 31), true)
  assert.equal(statcastBarrel(100, 24), true); assert.equal(statcastBarrel(100, 33), true); assert.equal(statcastBarrel(100, 34), false)
  assert.equal(statcastBarrel(116, 8), true); assert.equal(statcastBarrel(116, 50), true)
  assert.equal(statcastBarrel(120, 8), true); assert.equal(statcastBarrel(120, 51), false)
  // the bot's fixed box (98+ and 24-32) misses this one: 105 mph at 20 degrees
  assert.equal(statcastBarrel(105, 20), true)
  assert.equal(statcastBarrel(null, 20), false)
})

// TEST DATA: one batted ball a day, Sep 1-26, plus a strikeout row (no ev).
const spray = []
for (let d = 1; d <= 26; d++) spray.push({ date: `2026-09-${String(d).padStart(2, '0')}`, ev: 90 + (d % 15), la: 20, bb_type: d % 2 ? 'fly_ball' : 'ground_ball', arm: d % 3 ? 'R' : 'L', is_hr: d === 20, is_xbh: d === 20 || d === 10, is_350_plus: d === 20, is_hard_hit: 90 + (d % 15) >= 95, is_pull_air: d % 4 === 1 })
spray.push({ date: '2026-09-25', ev: null, bb_type: '', is_k: true })

ok('a strikeout is not a batted ball', () => { assert.equal(spray.filter(isBBE).length, 26) })

ok('last 15 days = the 15 calendar days before the game date', () => {
  const w = windowRows(spray, 'd15', '2026-09-27')
  assert.equal(w.from, '2026-09-12'); assert.equal(w.to, '2026-09-26')
  assert.equal(w.rows.length, 15)
  assert.equal(w.cut, false)
})
ok('the game day itself is never in the window', () => {
  const w = windowRows(spray, 'd15', '2026-09-20')
  assert.ok(w.rows.every((r) => r.date < '2026-09-20'))
})
ok('a window longer than the file says the file is shorter', () => {
  const w = windowRows(spray, 'd45', '2026-09-27')
  assert.equal(w.cut, true); assert.equal(w.from, '2026-09-01'); assert.equal(w.rows.length, 26)
})
ok('last 50 BBE with fewer on file takes them all', () => {
  const w = windowRows(spray, 'bbe50', '2026-09-27')
  assert.equal(w.rows.length, 26); assert.equal(w.from, '2026-09-01'); assert.equal(w.to, '2026-09-26')
})
ok('counts and rates', () => {
  const s = contactStats(windowRows(spray, 'all', '2026-09-27').rows)
  assert.equal(s.bbe, 26); assert.equal(s.hr, 1); assert.equal(s.xbh, 2); assert.equal(s.d350, 1)
  assert.equal(s.air, 13); assert.equal(s.rate('air'), 0.5)
  assert.equal(s.ev100, spray.filter((r) => r.ev >= 100).length)
  assert.equal(contactStats([]).rate('hr'), null)
})
ok('plate discipline weights each pitch type by pitches seen', () => {
  // TEST DATA: 300 fastballs at 50% zone, 100 sliders at 30% zone
  const d = discipline([{ seen: 300, zone_pct: 0.5, chase_rate: 0.2, whiff_pct: 20, swstr_pct: 10 }, { seen: 100, zone_pct: 0.3, chase_rate: 0.4, whiff_pct: 40, swstr_pct: 20 }])
  assert.equal(d.pitches, 400)
  assert.ok(Math.abs(d.zone - 0.45) < 1e-9); assert.ok(Math.abs(d.chase - 0.25) < 1e-9)
  assert.ok(Math.abs(d.whiff - 0.25) < 1e-9); assert.ok(Math.abs(d.swstr - 0.125) < 1e-9)
  assert.equal(discipline([]), null)
})
console.log(`\n${n} checks passed`)
