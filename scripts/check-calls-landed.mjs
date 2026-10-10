#!/usr/bin/env node
// ONE RECORD, CALLS LANDED, THE STRAIGHT LINE (2026-10-10). TEST data only (made-up players and prices, labelled).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-calls-landed.mjs
// What it proves: (1) the MLB Record page's market table reads the SAME locked calls as the tier table and the front
// door (one series, one bar per lane, n beside it); (2) calls landed pools the call tiers of any sport's calibration body
// and never a model band or a board row; (3) the straight line: n, hit rate, Wilson interval, implied rate from the stored
// prices, units only at 100+ priced calls; (4) the LAMP measures say which number is which; (5) the weekly record line adds up.
import assert from 'node:assert/strict'
import { gradeNight, summarize, nightSeries } from '../lib/calibration/mlbCalibration.js'
import { lockedRecordFrom } from '../lib/record/lockedRecord.js'
import { callsLandedFrom, straightLine, straightWords, landedWords } from '../lib/record/callsLanded.js'
import { mergeHrCalls } from '../lib/record/mlbCalls.js'
import { mlbSeries, mlbRecordModel, nhlMeasures, MLB_RECORD_MARKETS } from '../lib/record/page.js'
import { weeklyRecordLine } from '../lib/posts/receipt.js'
import { wilson } from '../lib/interval.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }

// ── (1) THE MLB RECORD, ONE POPULATION ──────────────────────────────────────────────────────────────
// TEST DATA: first pitch 20:00Z each night; night 2 is stamped AFTER first pitch (not a call anywhere).
const FP1 = Date.parse('2026-09-20T20:00:00Z'), FP2 = Date.parse('2026-09-21T20:00:00Z')
const games = new Map([['1', { start: FP1, type: 'R', state: 'Final', date: '2026-09-20' }], ['2', { start: FP2, type: 'R', state: 'Final', date: '2026-09-21' }]])
const por = (pk, pid, role, stamp) => ({ player_id: pid, player: `TEST ${pid}`, game_pk: pk, team: 'AAA', opp: 'BBB', game_pick_role: role, generated_at: stamp, scores: { hr: 50, hrw: 50 }, hr_overlay: {} })
const out = (pk, pid, o) => [`${pk}|${pid}`, { is_final: true, void: false, plate_appearances: 4, hits: 1, runs: 0, rbi: 0, total_bases: 1, home_runs: 0, ...o }]
const outcomes = new Map([out(1, 1, { home_runs: 1, total_bases: 4 }), out(1, 2, {}), out(1, 3, { hits: 2, total_bases: 2 }), out(2, 4, { home_runs: 1 })])
const night = gradeNight({
  date: '2026-09-20', games, outcomes,
  por: [
    por(1, 1, 'TOP', '2026-09-20T19:00:00Z'),          // TOP, homered
    por(1, 2, 'TOP/HIT', '2026-09-20T19:00:00Z'),      // TOP + HIT, one single: TOP misses, HIT clears
    por(1, 3, 'CONTACT', '2026-09-20T19:00:00Z'),      // 2 total bases
    por(2, 4, 'TOP', '2026-09-21T20:30:00Z'),          // stamped after first pitch
  ],
})
const sum = summarize(night.entries, { minN: 2 })
const rec = lockedRecordFrom({ ...sum, minN: 2, since: '2026-09-09', through: '2026-09-22' })
ok('nightSeries: one entry per night with a graded locked call; the late night is not in it', () => {
  assert.deepEqual(sum.regular.series, [{ date: '2026-09-20', markets: { TOP: { hit: 1, n: 2 }, HIT: { hit: 1, n: 1 }, CONTACT: { hit: 1, n: 1 } } }])
  assert.deepEqual(nightSeries([]), [])
})
ok('the record page series IS the tier table: summed over the nights it equals each tier row (same calls, same bar)', () => {
  const series = mlbSeries(rec)
  for (const t of sum.regular.tiers.filter((x) => x.kind === 'call' && x.n > 0)) {
    const hit = series.reduce((a, u) => a + (u.markets[t.key]?.hit || 0), 0), n = series.reduce((a, u) => a + (u.markets[t.key]?.n || 0), 0)
    assert.deepEqual([hit, n], [t.hits, t.n], t.key)
  }
})
ok('the market table prints each lane\'s own bar (PICK_JOBS), the same words the tier table uses', () => {
  assert.deepEqual(MLB_RECORD_MARKETS.map((m) => [m.key, m.job]), [['TOP', '1+ HR'], ['HR', '1+ HR'], ['HIT', '1+ hit'], ['HRR', '2+ H+R+RBI'], ['CONTACT', '2+ total bases']])
  const tierBar = Object.fromEntries(sum.regular.tiers.map((t) => [t.key, t.bar]))
  for (const m of MLB_RECORD_MARKETS) assert.equal(m.job, tierBar[m.key], m.key)
})
ok('mlbRecordModel reads the locked series only: no archive input, a night outside the locked record says why, loading says loading', () => {
  const m = mlbRecordModel({ night: { date: '2026-09-20', graded_slots: [] }, locked: rec })
  assert.deepEqual(m.last.markets, { TOP: { hit: 1, n: 2 }, HIT: { hit: 1, n: 1 }, CONTACT: { hit: 1, n: 1 } })
  assert.equal(m.last.note, null)
  assert.match(m.marketTitle, /LOCKED BEFORE FIRST PITCH/); assert.ok(!/archive/i.test(m.marketTitle))
  const off = mlbRecordModel({ night: { date: '2026-09-21', graded_slots: [] }, locked: rec })
  assert.match(off.last.note, /not in the locked record yet/)
  const loading = mlbRecordModel({ night: { date: '2026-09-20', graded_slots: [] }, locked: null })
  assert.equal(loading.series.length, 0); assert.match(loading.last.note, /loading/)
  assert.ok(!/backtest/.test(mlbRecordModel.toString()), 'no backtest input')
})

// ── (2) CALLS LANDED ────────────────────────────────────────────────────────────────────────────────
ok('callsLandedFrom: pools the CALL tiers only (not model bands, not board rows), with a Wilson range', () => {
  const l = callsLandedFrom({ minN: 30, regular: { nights: 4, tiers: [
    { key: 'TOP', kind: 'call', label: 'TOP', bar: '1+ HR', n: 40, hits: 10 },
    { key: 'HIT', kind: 'call', label: 'HIT', bar: '1+ hit', n: 60, hits: 40 },
    { key: 'hr_overlay', kind: 'model', label: 'HR Overlay', bar: '1+ HR', n: 99, hits: 99 },
  ] } })
  assert.deepEqual([l.n, l.hits, l.rate], [100, 50, 50])
  assert.deepEqual(l.ci.map((x) => Math.round(x)), wilson(50, 100).map((x) => Math.round(x)))
  assert.deepEqual(landedWords(l, { callWord: 'calls' }), ['50 of 100 calls landed', '50%, 95% range 40–60% · 4 nights, each call on its own bar'])
  // the sports whose tiers are status rows: only the CALLED row is a call
  const nhl = callsLandedFrom({ minN: 30, regular: { nights: 2, tiers: [
    { key: 'called', kind: 'status', status: 'called', n: 48, hits: 16 }, { key: 'board', kind: 'status', status: 'board', n: 300, hits: 90 }, { key: 'off', kind: 'status', status: 'off', n: 900, hits: 100 },
  ] } })
  assert.deepEqual([nhl.n, nhl.hits], [48, 16])
  assert.equal(callsLandedFrom({ regular: { nights: 0, tiers: [] } }), null)
})
ok('callsLandedFrom: under the minimum the words give the count and no rate', () => {
  const l = callsLandedFrom({ minN: 30, regular: { nights: 1, tiers: [{ key: 'TOP', kind: 'call', n: 7, hits: 2 }] } })
  assert.match(landedWords(l)[1], /not enough calls for a rate yet \(30 needed\)/)
})

// ── (3) THE STRAIGHT LINE ───────────────────────────────────────────────────────────────────────────
const call = (result, median, best) => ({ result, median, best })
ok('straightLine: n and hit rate count every graded call; voids are no result; the price comparison counts priced calls only', () => {
  const s = straightLine([call('hit', 300, 350), call('miss', 300, 320), call('miss', null, null), call('void', 300, 300), call('hit', null, null)])
  assert.deepEqual([s.n, s.hits, s.voids, s.priced, s.pricedHits], [4, 2, 1, 2, 1])
  assert.equal(s.rate, 50); assert.equal(s.impliedRate, 25)             // +300 implies 25%
  assert.equal(s.units, null)                                            // under 100 priced: no return quoted
  assert.equal(straightLine([]), null); assert.equal(straightLine([call('void', 1, 1)]), null)
})
ok('straightLine: units at the median and best price appear at 100 priced calls and not before', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => call(i % 4 === 0 ? 'hit' : 'miss', 300, 350))    // 25% at +300: a fair price
  assert.equal(straightLine(mk(99)).units, null)
  const s = straightLine(mk(100))
  assert.deepEqual([s.priced, s.pricedHits], [100, 25])
  assert.deepEqual(s.units, { median: 0, best: 12.5 })                 // 25 x +3 - 75 = 0 at the median; 25 x +3.5 - 75 = +12.5 at the best
  const w = straightWords(s, { callWord: 'test calls' })
  assert.match(w[0], /^25 of 100 test calls hit this season \(25%, 95% range 1\d–3\d%\)\.$/)
  assert.match(w.join(' '), /prices imply 25% for those/); assert.match(w.join(' '), /\+0\.0 units at the median price, \+12\.5 at the best price/)
})
ok('straightWords: no stored price says so and prints no price figure', () => {
  const w = straightWords(straightLine([call('hit', null, null), call('miss', null, null)])).join(' ')
  assert.match(w, /No stored price on any of them yet/); assert.ok(!/units|imply/.test(w))
})
ok('mergeHrCalls: a hitter named by TOP and HR is one call that night, roles joined; a miss in either lane is a miss', () => {
  const rows = mergeHrCalls({ TOP: [{ date: '2026-09-20', pid: 1, name: 'TEST 1', team: 'AAA', hit: true }, { date: '2026-09-20', pid: 2, name: 'TEST 2', team: 'AAA', hit: false }], HR: [{ date: '2026-09-20', pid: 1, name: 'TEST 1', team: 'AAA', hit: true }] })
  assert.deepEqual(rows.map((r) => [r.player_id, r.role, r.result]), [['1', 'TOP/HR', 'hit'], ['2', 'TOP', 'miss']])
})

// ── (4) LAMP: EACH NUMBER IN ITS OWN WORDS ──────────────────────────────────────────────────────────
ok('nhlMeasures: hit rate per call, capture and on-the-board are separate lines with their own counts and the window', () => {
  const rec2 = { nights: [{ date: '2026-09-29' }, { date: '2026-10-09' }], total: { calledN: 145, calledHits: 48, scorers: 374, scorersCalled: 70, scorersOnBoard: 120 }, sog: { calledN: 20, calledHits: 5 } }
  const m = nhlMeasures(rec2)
  assert.deepEqual(m.map((x) => [x.key, x.value]), [['rate', '48 of 145 (33%)'], ['capture', '70 of 374 (19%)'], ['board', '120 of 374 (32%)'], ['sog', '5 of 20 (25%)']])
  assert.match(m[0].sub, /did not dress is not counted/); assert.match(m[1].sub, /any LAMP market/); assert.match(m[1].sub, /not how often a call scores/)
  assert.match(m[0].sub, /2 graded nights, Sep 29 to Oct 9/)
  assert.deepEqual(nhlMeasures({ nights: [], total: null }), [])
})

// ── (5) THE WEEKLY RECORD LINE ──────────────────────────────────────────────────────────────────────
ok('weeklyRecordLine: made = landed + missed + did not play, from the counts handed in', () => {
  assert.equal(weeklyRecordLine({ cashed: 5, missed: 5, void: 1 }, '3 nights'), 'CALLED · 11 calls made · 5 landed · 5 missed · 1 did not play · 3 nights')
  assert.equal(weeklyRecordLine({ cashed: 1, missed: 0, void: 0 }, ''), 'CALLED · 1 call made · 1 landed · 0 missed')
})

console.log(fail ? `\n${fail} FAILED` : '\nTEST DATA: all green')
process.exit(fail ? 1 : 0)
