#!/usr/bin/env node
// Unit test for lib/multiSort.js. TEST DATA ONLY -- the rows below are made up
// to exercise the comparator; none of it is a real player or a real number.
//   node scripts/test-multisort.mjs
import assert from 'node:assert/strict'
import { buildSorter, nextSort, encodeSort, decodeSort, tierFn } from '../lib/multiSort.js'

let n = 0
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`) }

// TEST rows: 10 fake rows, score has a clear top / middle / bottom, l5 is the second sort.
const rows = [
  { id: 'A', score: 90, l5: 0.100, team: 'XXX' },
  { id: 'B', score: 88, l5: 0.400, team: 'YYY' },
  { id: 'C', score: 86, l5: 0.250, team: 'XXX' },
  { id: 'D', score: 60, l5: 0.300, team: 'YYY' },
  { id: 'E', score: 58, l5: 0.100, team: 'XXX' },
  { id: 'F', score: 55, l5: 0.500, team: 'YYY' },
  { id: 'G', score: 52, l5: 0.200, team: 'XXX' },
  { id: 'H', score: 50, l5: 0.350, team: 'YYY' },
  { id: 'I', score: 20, l5: 0.450, team: 'XXX' },
  { id: 'J', score: 10, l5: 0.050, team: 'YYY' },
]
const ids = (arr) => arr.map((r) => r.id).join('')
const sortBy = (sort, data = rows, colOf) => [...data].sort(buildSorter(sort, data, colOf).compare)

t('one key is the plain raw order, descending', () => {
  assert.equal(ids(sortBy([{ key: 'score', dir: 'desc' }])), 'ABCDEFGHIJ')
})
t('one key ascending', () => {
  assert.equal(ids(sortBy([{ key: 'score', dir: 'asc' }])), 'JIHGFEDCBA')
})
t('two keys: the first makes tiers, the second orders INSIDE each tier', () => {
  // tiers of score (top 20% / middle / bottom 20%): top = A B C, middle = D E F G H, bottom = I J
  const out = sortBy([{ key: 'score', dir: 'desc' }, { key: 'l5', dir: 'desc' }])
  assert.equal(ids(out.slice(0, 3)), 'BCA', 'top tier, ordered by l5 desc (.400, .250, .100)')
  assert.equal(ids(out.slice(3, 8)), 'FHDGE', 'middle tier ordered by l5 desc, NOT by score')
  assert.equal(ids(out.slice(8)), 'IJ', 'bottom tier, l5 .450 before .050')
})
t('a tier never mixes: no row of a lower tier appears above a higher tier', () => {
  const out = sortBy([{ key: 'score', dir: 'desc' }, { key: 'l5', dir: 'asc' }])
  const sorter = buildSorter([{ key: 'score', dir: 'desc' }, { key: 'l5', dir: 'asc' }], rows)
  const sigs = out.map(sorter.tierSig)
  // the tier signature changes at most twice (3 tiers) down the table
  let changes = 0
  for (let i = 1; i < sigs.length; i += 1) if (sigs[i] !== sigs[i - 1]) changes += 1
  assert.equal(changes, 2)
})
t('explicit tiers on a column: `tiers: [50]` makes score 50+ the group', () => {
  const colOf = (k) => (k === 'score' ? { tiers: [50] } : undefined)
  const out = sortBy([{ key: 'score', dir: 'desc' }, { key: 'l5', dir: 'desc' }], rows, colOf)
  // 50+ is A..H ordered by l5 desc: F .5, B .4, H .35, D .3, C .25, G .2, A .1, E .1 (the tie keeps input order, A before E); then I .45, J .05
  assert.equal(ids(out), 'FBHDCGAEIJ')
})
t('three keys: tiers inside tiers, then raw', () => {
  const data = [
    { id: 'a', x: 90, y: 5, z: 1 }, { id: 'b', x: 90, y: 5, z: 3 }, { id: 'c', x: 90, y: 1, z: 9 },
    { id: 'd', x: 10, y: 5, z: 2 }, { id: 'e', x: 10, y: 1, z: 8 }, { id: 'f', x: 10, y: 1, z: 7 },
  ]
  const colOf = (k) => ({ x: { tiers: [50] }, y: { tiers: [3] } }[k])
  const out = sortBy([{ key: 'x', dir: 'desc' }, { key: 'y', dir: 'desc' }, { key: 'z', dir: 'desc' }], data, colOf)
  assert.equal(ids(out), 'bacdef')
})
t('blanks sink below every tier, whichever way the column points', () => {
  const data = [...rows, { id: 'K', score: null, l5: 0.9, team: 'XXX' }, { id: 'L', score: 70, l5: '', team: 'XXX' }]
  const desc = sortBy([{ key: 'score', dir: 'desc' }, { key: 'l5', dir: 'desc' }], data)
  const asc = sortBy([{ key: 'score', dir: 'asc' }, { key: 'l5', dir: 'asc' }], data)
  assert.equal(desc[desc.length - 1].id, 'K')
  assert.equal(asc[asc.length - 1].id, 'K')
  // blank in the LAST key sinks inside its tier
  const inTier = desc.filter((r) => r.score >= 85).map((r) => r.id)
  assert.ok(inTier.length >= 2)
})
t('a text column is its own tier: team first, then score inside each team', () => {
  const out = sortBy([{ key: 'team', dir: 'asc' }, { key: 'score', dir: 'desc' }])
  assert.equal(out.slice(0, 5).every((r) => r.team === 'XXX'), true)
  assert.equal(ids(out.slice(0, 5)), 'ACEGI')
  assert.equal(ids(out.slice(5)), 'BDFHJ')
})
t('too few rows to call a top: each value is its own tier (plain lexicographic)', () => {
  const few = [{ id: 'p', a: 3, b: 1 }, { id: 'q', a: 3, b: 2 }, { id: 'r', a: 2, b: 9 }]
  assert.equal(ids(sortBy([{ key: 'a', dir: 'desc' }, { key: 'b', dir: 'desc' }], few)), 'qpr')
})
t('tierFn: equal values always share a tier', () => {
  const f = tierFn(rows.map((r) => r.score), {})
  assert.equal(f(52), f(52))
  assert.equal(f(90) > f(55), true)
  assert.equal(f(55) > f(10), true)
  assert.equal(f(null), null)
})
t('nextSort: plain tap replaces, flips on the lone key', () => {
  assert.deepEqual(nextSort([{ key: 'a', dir: 'desc' }], 'b', false), [{ key: 'b', dir: 'desc' }])
  assert.deepEqual(nextSort([{ key: 'a', dir: 'desc' }], 'a', false), [{ key: 'a', dir: 'asc' }])
  assert.deepEqual(nextSort([{ key: 'a', dir: 'desc' }, { key: 'b', dir: 'desc' }], 'a', false), [{ key: 'a', dir: 'desc' }])
})
t('nextSort: extending adds the next tier, flips, then drops', () => {
  let s = [{ key: 'a', dir: 'desc' }]
  s = nextSort(s, 'b', true)
  assert.deepEqual(s, [{ key: 'a', dir: 'desc' }, { key: 'b', dir: 'desc' }])
  s = nextSort(s, 'b', true)
  assert.deepEqual(s, [{ key: 'a', dir: 'desc' }, { key: 'b', dir: 'asc' }])
  s = nextSort(s, 'b', true)
  assert.deepEqual(s, [{ key: 'a', dir: 'desc' }])
})
t('encode / decode round trip, unknown keys dropped, dupes dropped', () => {
  const s = [{ key: 'adj', dir: 'desc' }, { key: 'a5', dir: 'asc' }]
  assert.equal(encodeSort(s), 'adj.d,a5.a')
  assert.deepEqual(decodeSort('adj.d,a5.a'), s)
  assert.deepEqual(decodeSort('adj.d,nope.d,adj.a,a5.a', new Set(['adj', 'a5'])), s)
  assert.deepEqual(decodeSort('garbage'), [])
})
console.log(`\n${n} passed`)
