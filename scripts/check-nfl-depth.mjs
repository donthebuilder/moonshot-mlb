#!/usr/bin/env node
// TUDDY'S TRUE DEPTH CHART (lib/nfl/depthChart.js). ALL DATA IS TEST DATA (made-up clubs and men: Test One..); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-depth.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseDepth, nextUp } from '../lib/nfl/depthChart.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const A = (name, hurt = false) => ({ displayName: name, injuries: hurt ? [{ status: 'Out' }] : [] })
const json = { depthchart: [
  { name: 'Base 3-4 D', positions: { lde: { athletes: [A('Test Lineman')] } } },
  { name: '3WR 1TE', positions: {
    wr1: { athletes: [A('Test One'), A('Test OneBackup', true), A('Test OneThird')] }, wr2: { athletes: [A('Test Two'), A('Test Twoback')] }, wr3: { athletes: [A('Test Three')] },
    te: { athletes: [A('Test Tight'), A('Test Tight Two')] }, rb: { athletes: [A('Test Back')] }, qb: { athletes: [A('Test Qb'), A('Test Qb Two')] }, lt: { athletes: [A('Test Tackle')] } } },
] }

t('parse: the offense chart only (the one with the receivers), skill slots only, in depth order, hurt flagged', () => {
  const d = parseDepth(json)
  assert.deepEqual(Object.keys(d).sort(), ['qb', 'rb', 'te', 'wr1', 'wr2', 'wr3'])
  assert.deepEqual(d.wr1.map((a) => a.name), ['Test One', 'Test OneBackup', 'Test OneThird']); assert.equal(d.wr1[1].hurt, true)
  assert.deepEqual(parseDepth({}), {}); assert.deepEqual(parseDepth(null), {})
})
t('next up = the next man on HIS slot\'s line, never the next slot (WR2 out -> WR2\'s backup, not WR3)', () => {
  const d = parseDepth(json)
  assert.deepEqual(nextUp(d, 'Test Two'), { slot: 'wr2', role: 'WR2', next: 'Test Twoback' })
  assert.equal(nextUp(d, 'Test Tight').next, 'Test Tight Two')
})
t('skips a backup ESPN lists injured; nobody left = null; last on his line = null; a man not on the chart = null (nothing guessed)', () => {
  const d = parseDepth(json)
  assert.equal(nextUp(d, 'Test One').next, 'Test OneThird', 'the hurt backup is skipped')
  assert.equal(nextUp(d, 'Test Three'), null); assert.equal(nextUp(d, 'Test Back'), null); assert.equal(nextUp(d, 'Somebody Else'), null)
})
t('accents and punctuation do not break the match (nameKey)', () => {
  const d = parseDepth({ depthchart: [{ name: '3WR 1TE', positions: { wr1: { athletes: [A('Amon-Ra St. Brown'), A('José Test')] } } }] })
  assert.equal(nextUp(d, 'Amon-Ra St Brown').next, 'José Test')
})
t('the route is read-only, asks ESPN for at most four clubs, and the Out list shows NEXT UP only behind an OUT-class man', () => {
  const route = fs.readFileSync(new URL('../app/api/nfl/depth/route.js', import.meta.url), 'utf8')
  assert.match(route, /\.slice\(0, 4\)/); assert.ok(!/POST|upsert|insert/i.test(route))
  const out = fs.readFileSync(new URL('../components/injuries/InjuryOut.js', import.meta.url), 'utf8')
  assert.match(out, /nextUpOf && BLOCKS\.has\(e\.status\)/)
})
console.log(failed ? `\n${failed} FAILED` : '\nOK: nfl depth')
process.exit(failed ? 1 : 0)
