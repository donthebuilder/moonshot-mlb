#!/usr/bin/env node
// A BUCKETS "why" LINE NEVER PRINTS "undefined" OR "NaN" (2026-10-12; the double-double card read "undefined 95th · undefined 95th").
// Every leg of every market, every double-double / triple-double version and every shadow has a word; a leg without a word is left
// out, never printed. TEST DATA: the percentiles below are made up.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nba-why-words.mjs
import assert from 'node:assert/strict'
const M = await import('../lib/nba/model.js')
let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

const allLegs = () => {
  const s = new Set()
  for (const d of Object.values(M.NBA_MARKETS)) for (const l of d.legs) s.add(l)
  for (const m of Object.values(M.DDTD)) for (const v of Object.values(m)) for (const l of v.legs) s.add(l)
  for (const d of Object.values(M.NBA_SHADOWS)) for (const l of d.legs) s.add(l)
  return [...s]
}
const BAD = /undefined|NaN|null|\[object/
const BANNED = /\b(lock|locks|locked|due|guarantee|guaranteed|sure thing|can't miss)\b/i

ok('every leg of every market, DD/TD version and shadow has a word', () => {
  const missing = allLegs().filter((l) => !M.WHY_WORD[l])
  assert.deepEqual(missing, [], `legs with no word: ${missing.join(', ')}`)
})
ok('the words are plain and neutral (no lock / due / guaranteed), and none is blank', () => {
  for (const [k, w] of Object.entries(M.WHY_WORD)) { assert.ok(w && w.trim() === w && w.length > 2, k); assert.ok(!BANNED.test(w), `${k}: ${w}`); assert.ok(!BAD.test(w), k) }
})
ok('whyNba never contains undefined / NaN for any market with every leg present (the double-double card\'s case included)', () => {
  for (const [market, d] of Object.entries(M.NBA_MARKETS)) {
    const pct = Object.fromEntries(d.legs.map((l, i) => [l, 95 - i]))
    const why = M.whyNba(market, { pct })
    assert.ok(!BAD.test(why), `${market}: ${why}`); assert.ok(why.endsWith('percentile tonight'), why)
    assert.equal(why.split(' · ').length, d.legs.length, `${market}: one clause per leg`)
  }
  assert.match(M.whyNba('dd', { pct: { ddAdj: 95, ddRecentAdj: 95, minPg: 60 } }), /^double-double games against tonight.s opponent 95th · recent double-doubles against tonight.s opponent 95th · minutes 60th percentile tonight$/)
})
ok('every key in the model\'s adj set (and every v1 / v2 / shadow leg) is covered one at a time, with ordinals right', () => {
  for (const leg of allLegs()) {
    for (const market of Object.keys(M.NBA_MARKETS).filter((m) => M.NBA_MARKETS[m].legs.includes(leg))) {
      const why = M.whyNba(market, { pct: { [leg]: 82.4 } })
      assert.ok(!BAD.test(why), `${market}/${leg}: ${why}`); assert.ok(why.includes('82nd'), why)
    }
  }
  for (const leg of ['ddAdj', 'ddRecentAdj', 'tdAdj', 'ddRate', 'ddRecent', 'tdRate', 'minCur']) assert.ok(M.WHY_WORD[leg], leg)
})
ok('a leg with a missing, null or NaN percentile (or no word) is left out, never printed; nothing left = the row\'s own reason', () => {
  assert.equal(M.whyNba('dd', { pct: { ddAdj: NaN, ddRecentAdj: null, minPg: undefined }, reason: 'TEST reason' }), 'TEST reason')
  assert.equal(M.whyNba('dd', { pct: { ddAdj: 90, ddRecentAdj: NaN, minPg: 40 } }), 'double-double games against tonight’s opponent 90th · minutes 40th percentile tonight')
  assert.ok(!BAD.test(M.whyNba('pts', { pct: { ptsPg: 'x', madeUpLeg: 99 }, reason: '' })))
  assert.equal(M.whyNba('pts', null), ''); assert.equal(M.whyNba('pts', { reason: 'only a reason' }), 'only a reason')
  assert.equal(M.whyNba('not-a-market', { pct: { ptsPg: 50 }, reason: 'r' }), 'r')
})

console.log(`\n${n} groups ok`)
