#!/usr/bin/env node
// THE CARD AND THE TWO-MAN (lib/card). Every input is TEST data (made-up players p1.., clubs AAA..ZZZ, made-up numbers), nothing real.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-two-man.mjs
// Covers: the selection rule + tie-breaks, the different-games constraint, lock-before-start, no rewrite after the lock (a fake table that
// holds the migration's rules), both-or-nothing grading with void legs, the record math (K of N, the count expected if independent, Wilson,
// units only from enough priced calls), Donovan's lane kept apart, the X text naming only the #1 straight, the #members text never going to
// X or a free channel (a leak check), the post kinds' tags, the migration's guards.
import './_no-injury-net.mjs'   // the injury layer's own fetch must not land in this test's call counts
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  CARD_VERSION, CARD_RULE, STRAIGHTS, STAKE, MIN_PRICED, CARD_LOCK_LEAD_MIN, cmpCandidate, fieldOf, pickStraights, pickTwoMan, lockRows, mayLockRow, lockWindowOpen, lockAtOf,
  donovanRow, LATE_LANE, isLateRow, LATE_EDIT_MIN, cleanNote, legWord, productResult, rowPrice, rowExpected, recordOf, recordsOf, recordWords, nflWindowsOf, decimalOf, americanOfDecimal,
} from '../lib/card/core.js'
import { membersCardText, resultText, cleanPublic } from '../lib/card/text.js'
import { lockCard, gradeCardRows, cardRows, saveDonovan, withdrawDonovan, latestCardDate, lateEntries, recordRows, dayRows, readCard, donovanEntry } from '../lib/card/store.js'
import { pickerRow, pairFloor, nhlSeasonOf, etWhen } from '../lib/card/picker.js'
import { sameOriginJson, adminDenyReason, isAdminUser } from '../lib/admin.js'
import { STATUS_WORD } from '../lib/callStatus.js'
import { xCardBuild, CARD_KIND, postCardMembers, postCardX } from '../lib/card/post.js'
import { wilson } from '../lib/interval.js'
import { tagOf, untagged, kindInfo, mayPostNow } from '../lib/dash/xSchedule.js'
import { fakeDb } from './_card-fakedb.mjs'
import { sportOfKind, tierOf, isRepeatExempt } from '../lib/dash/xPolicy.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-10T20:00:00Z')
Date.now = () => NOW   // pinned from the first line on: code under test (lib/card/store.js) reads Date.now() itself, so the check passes on any real date
// TEST candidates: id, game, start offset hours from NOW, score, rate
const C = (id, game, startH, score, rate = 0.3, extra = {}) => ({ player_id: id, name: `Player ${id}`, team: `T${game}A`, opp: `T${game}B`, game_id: game, game_date: '2026-10-10', start_ms: NOW + startH * H, score, rate, why: `why ${id}`, price: { median: 150, best: 170, books: 5, taken_at: '2026-10-10T19:00:00Z' }, ...extra })   // TEST price +150: a Card pick needs a stored price (rules.js); two of them multiply to +525
const FIELD = [C('p1', 'g1', 2, 90, 0.40), C('p2', 'g1', 2, 88, 0.35), C('p3', 'g2', 3, 85, 0.30), C('p4', 'g3', 4, 80, 0.25), C('p5', 'g3', 4, 70, 0.20), C('p6', 'g4', 1, 95, 0.10)]
const LOCK_AT = lockAtOf(NOW + 1 * H)
// a stored volume pick: a shots-on-goal candidate with its stored line and median price (TEST numbers)
const SOGC = (id, game, startH, score, line = 2.5, med = 130) => ({ ...C(id, game, startH, score, null), market: 'sog', line, price: { median: med, best: med + 10, books: 6, taken_at: '2026-10-10T19:00:00Z' } })
const SOG = [SOGC('s1', 'g1', 2, 77), SOGC('s2', 'g4', 1, 95), SOGC('s3', 'g2', 3, 60)]
const BMAP = (field = FIELD, sog = SOG) => ({ anytime: { cands: field, board: field.map((c) => c.score) }, sog: { cands: sog, board: [...sog.map((c) => c.score), 10, 20, 30, 40] } })
const INPUTS = (field = FIELD, games = 6) => ({ ok: true, byMarket: BMAP(field), games, all: field, prices: null })

// ── THE FAKE card_calls TABLE (scripts/_card-fakedb.mjs holds the migrations' rules) ──
// ── 1. SELECTION ──────────────────────────────────────────────────────────────
await t('straights: the top three by score, AT MOST ONE PER GAME (p2 is p1\'s teammate-game: skipped), whose game has not started', () => {
  const s = pickStraights(FIELD, NOW)
  assert.deepEqual(s.map((c) => c.player_id), ['p6', 'p1', 'p3'])
  assert.equal(new Set(s.map((c) => c.game_id)).size, s.length)
  // fewer games than three: fewer straights, never a second man from a used game
  const two = pickStraights([C('a', 'g1', 2, 90), C('b', 'g1', 2, 89), C('c', 'g2', 2, 80), C('d', 'g2', 2, 79)], NOW)
  assert.deepEqual(two.map((c) => c.player_id), ['a', 'c'])
  assert.deepEqual(pickStraights([C('a', 'g1', 2, 90), C('b', 'g1', 2, 89)], NOW).map((c) => c.player_id), ['a'])
  assert.equal(STRAIGHTS, 3)
})

await t('tie-breaks: score, then the higher rate, then the earlier start, then the player id; the feed order does not matter', () => {
  const tied = [C('b', 'g1', 3, 80, 0.3), C('a', 'g2', 3, 80, 0.3), C('c', 'g3', 2, 80, 0.3), C('d', 'g4', 5, 80, 0.5), C('e', 'g5', 5, 80, null), C('z', 'g6', 5, 79, 0.9)]
  const want = ['d', 'c', 'a', 'b', 'e', 'z']     // d: higher rate; c: earlier start; a before b: id; e: a missing rate sorts last; z: lower score
  assert.deepEqual(fieldOf(tied, NOW).map((c) => c.player_id), want)
  assert.deepEqual(fieldOf([...tied].reverse(), NOW).map((c) => c.player_id), want)
  assert.ok(cmpCandidate(tied[0], tied[1]) > 0)
})

await t('a candidate with no score, no start, no id or no game is left out (nothing is invented); one player appears once', () => {
  const f = fieldOf([...FIELD, C('x1', 'g9', 2, NaN), { ...C('x2', 'g9', 2, 50), start_ms: NaN }, { ...C('', 'g9', 2, 50) }, C('p1', 'g1', 2, 60)], NOW)
  assert.equal(f.length, 6)
  assert.equal(f.find((c) => c.player_id === 'p1').score, 90, 'his best line is kept')
})

await t('the Two-Man: the best player, then the best from a DIFFERENT game; none when every called player is in one game', () => {
  assert.deepEqual(pickTwoMan(FIELD, NOW).map((c) => c.player_id), ['p6', 'p1'])
  const noSix = FIELD.filter((c) => c.player_id !== 'p6')
  assert.deepEqual(pickTwoMan(noSix, NOW).map((c) => c.player_id), ['p1', 'p3'], 'p2 is p1\'s teammate in g1: skipped for the best of another game')
  assert.equal(pickTwoMan([C('a', 'g1', 2, 90), C('b', 'g1', 2, 80)], NOW), null)
  assert.equal(pickTwoMan([], NOW), null)
  for (const [a, b] of [pickTwoMan(FIELD, NOW), pickTwoMan(noSix, NOW)]) assert.notEqual(a?.game_id, b?.game_id)
})

// ── 2. THE LOCK ───────────────────────────────────────────────────────────────
await t('the lock (a six-game slate): three straights (1 unit) in their markets and one Two-Man (0.5 unit), every row ahead of its start, frozen legs', () => {
  const rows = lockRows({ sport: 'nhl', slate_key: '2026-10-10', card_date: '2026-10-10', byMarket: BMAP(), games: 6, now: NOW, lockAtMs: LOCK_AT })
  assert.equal(rows.length, 4)
  // slot 1 anytime goal: p6; slot 2 shots over: s2 is in p6's game (used), so s1; slot 3 a second goal pick from an unused game: p3 (p1 is in s1's game)
  assert.deepEqual(rows.filter((r) => r.product === 'straight').map((r) => [r.slot, r.stake, r.legs[0].player_id]), [[1, 1, 'p6'], [2, 1, 's1'], [3, 1, 'p3']])
  const two = rows.find((r) => r.product === 'two_man')
  assert.equal(two.stake, 0.5); assert.equal(two.slot, 1); assert.deepEqual(two.legs.map((l) => l.player_id), ['p6', 'p1'])
  assert.equal(two.start_at, new Date(NOW + 1 * H).toISOString(), 'the Two-Man starts with its earlier leg')
  for (const r of rows) {
    assert.equal(r.lane, 'bot'); assert.equal(r.model_version, CARD_VERSION); assert.equal(r.note, null)
    assert.ok(Date.parse(r.start_at) > NOW, 'locked before the start'); assert.ok(Date.parse(r.locks_at) <= Date.parse(r.start_at))
    assert.equal(r.legs.length, r.leg_count)
  }
  assert.equal(rows[0].rule, CARD_RULE.straight); assert.equal(two.rule, CARD_RULE.two_man)
  assert.equal(CARD_VERSION, 'card-v2')
})

await t('lock-before-start: a game that has started is never in the lock; nothing is written for a started card', () => {
  const rows = lockRows({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: BMAP(), games: 6, now: NOW + 2 * H, lockAtMs: LOCK_AT })    // g4 (+1h) and g1 (+2h) have started
  assert.deepEqual(rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].player_id), ['p3', 'p4'])     // g4 and g1 have started: slot 1 p3 (g2); slot 2 (shots) has nobody left from a free game and is SKIPPED, never filled out of turn; slot 3 p4 (g3)
  assert.ok(rows.every((r) => Date.parse(r.start_at) > NOW + 2 * H))
  assert.equal(lockRows({ sport: 'nhl', slate_key: 'k', card_date: 'd', byMarket: BMAP(), games: 6, now: NOW + 5 * H, lockAtMs: LOCK_AT }).length, 0)
  assert.equal(mayLockRow({ start_at: new Date(NOW).toISOString() }, NOW), false)
  assert.equal(mayLockRow({ start_at: new Date(NOW + 1).toISOString() }, NOW), true)
})

await t('the lock window opens an hour before the first game and not before', () => {
  assert.equal(CARD_LOCK_LEAD_MIN, 60)
  const first = NOW + 3 * H
  assert.equal(lockWindowOpen(first, first - 61 * 60e3), false)
  assert.equal(lockWindowOpen(first, first - 60 * 60e3), true)
  assert.equal(lockWindowOpen(NaN, NOW), false)
})

await t('NFL windows: one card per game day (Thursday night, Sunday, Monday night) from the slate\'s own kickoffs, in Eastern dates', () => {
  const et = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const k = (iso) => ({ game_id: iso, kickoff: iso })
  const w = nflWindowsOf([k('2026-10-09T00:15:00Z'), k('2026-10-11T17:00:00Z'), k('2026-10-11T20:25:00Z'), k('2026-10-12T00:20:00Z'), k('2026-10-13T00:15:00Z'), { game_id: 'x', kickoff: 'nope' }], et)
  assert.deepEqual(w.map((x) => x.card_date), ['2026-10-08', '2026-10-11', '2026-10-12'])    // Thursday night, Sunday (early + late + the 8:20 pm one), Monday night
  assert.deepEqual(w.map((x) => x.label.split(' ')[0]), ['Thursday', 'Sunday', 'Monday'])
  assert.equal(w[1].first_start_ms, Date.parse('2026-10-11T17:00:00Z')); assert.equal(w[1].last_start_ms, Date.parse('2026-10-12T00:20:00Z') > Date.parse('2026-10-11T20:25:00Z') ? Date.parse('2026-10-12T00:20:00Z') : 0)
})

// ── 3. NO REWRITE AFTER THE LOCK ──────────────────────────────────────────────
await t('no rewrite after the lock: a second pass keeps the first rows; an update to a locked column is refused; delete is refused', async () => {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  const win = { card_date: '2026-10-10', slate_key: '2026-10-10', first_start_ms: NOW + 1 * H }
  const r1 = await lockCard(db, 'nhl', win, INPUTS(), { now: NOW })
  assert.match(r1, /^locked 3 straight\(s\) of 6 game\(s\) \+ two-man/)
  const snap = JSON.stringify(db.rows)
  // a later pass with a DIFFERENT field (a new best player) changes nothing
  clock.now = NOW + 30 * 60e3
  const better = [C('p9', 'g7', 3, 99, 0.5), ...FIELD]
  await lockCard(db, 'nhl', win, INPUTS(better), { now: clock.now })
  assert.equal(JSON.stringify(db.rows), snap, 'the locked rows are untouched')
  assert.equal(db.rows.length, 4)
  const bad = await db.from('card_calls').update({ stake: 9 }).eq('product', 'straight').select()
  assert.match(bad.error.message, /never rewritten/)
  const bad2 = await db.from('card_calls').update({ legs: [] }).eq('product', 'two_man').select()
  assert.match(bad2.error.message, /never rewritten/)
  const bad3 = await db.from('card_calls').delete().eq('lane', 'bot')
  assert.match(bad3.error.message, /never deleted/)
})

await t('a started game is refused by the table itself (insert at or after the start), and the store re-reads the clock', async () => {
  const clock = { now: NOW + 1 * H }     // exactly the first start
  const db = fakeDb(clock)
  const rows = lockRows({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: BMAP(), games: 6, now: NOW, lockAtMs: LOCK_AT })
  const r = await db.from('card_calls').upsert(rows.filter((x) => x.legs[0].player_id === 'p6'), { onConflict: 'x' })
  assert.match(r.error.message, /at or after the start/)
  assert.equal(db.rows.length, 0)
  assert.equal(await lockCard(db, 'nhl', { card_date: '2026-10-10', slate_key: 'k', first_start_ms: NOW + 4 * H }, INPUTS(), { now: NOW }), 'window-not-open')
})

// ── 4. GRADING: BOTH-OR-NOTHING ───────────────────────────────────────────────
await t('a straight is hit / miss / void on its one leg; a player who did not play voids it', () => {
  assert.equal(legWord({ played: true, landed: true }), 'hit'); assert.equal(legWord({ played: true, landed: false }), 'miss'); assert.equal(legWord({ played: false, landed: false }), 'void')
  assert.equal(legWord(null), null)
  for (const w of ['hit', 'miss', 'void']) assert.equal(productResult('straight', [w]), w)
  assert.equal(productResult('straight', [null]), null); assert.equal(productResult('straight', []), null)
})

await t('the Two-Man is both-or-nothing: both hit = hit; one miss = miss; ANY void leg = void, never a loss; nothing until both legs are final', () => {
  const R = (a, b) => productResult('two_man', [a, b])
  assert.equal(R('hit', 'hit'), 'hit')
  assert.equal(R('hit', 'miss'), 'miss'); assert.equal(R('miss', 'hit'), 'miss'); assert.equal(R('miss', 'miss'), 'miss')
  assert.equal(R('void', 'hit'), 'void'); assert.equal(R('hit', 'void'), 'void'); assert.equal(R('void', 'void'), 'void')
  assert.equal(R('void', 'miss'), 'void', 'a void leg voids it even when the other leg missed')
  assert.equal(R('hit', null), null, 'one leg still to play'); assert.equal(R(null, 'miss'), null, 'a miss now is not a loss until the other leg is known (it could void)')
  assert.equal(productResult('two_man', ['hit']), null)
})

await t('grading through the store: written once from the box-score words; a postponed game voids every leg in it; a re-run does not regrade', async () => {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  await lockCard(db, 'nhl', { card_date: '2026-10-10', slate_key: 'k', first_start_ms: NOW + 1 * H }, INPUTS(), { now: NOW })
  clock.now = NOW + 12 * H
  const open = db.rows.filter((r) => r.result == null)
  // p6 landed, p1 missed, p3 did not play (g2); s1 (a shots-over-2.5 pick) had 2 shots: a miss against the stored line
  const results = new Map([['g4|p6', { played: true, landed: true }], ['g1|p1', { played: true, landed: false }], ['g2|p3', { played: false, landed: false }], ['g1|s1', { played: true, landed: false, values: { sog: 2 } }]])
  assert.equal(await gradeCardRows(db, open, results, clock.now), 4)
  const by = (p, s) => db.rows.find((r) => r.product === p && (s == null || r.slot === s))
  assert.equal(by('straight', 1).result, 'hit'); assert.equal(by('straight', 2).result, 'miss', 'two shots against a 2.5 line'); assert.equal(by('straight', 3).result, 'void')
  assert.equal(by('two_man').result, 'miss', 'p6 hit, p1 missed: a miss')
  assert.deepEqual(by('two_man').leg_results.map((l) => l.result), ['hit', 'miss'])
  // the same pass again with different words: nothing regraded
  const again = await gradeCardRows(db, db.rows, new Map([['g4|p6', { played: true, landed: false }]]), clock.now)
  assert.equal(again, 0)
  assert.equal(by('straight', 1).result, 'hit')
  // a postponed game: the '*' word voids every leg of that game
  const db2 = fakeDb({ now: NOW })
  await lockCard(db2, 'nhl', { card_date: '2026-10-10', slate_key: 'k', first_start_ms: NOW + 1 * H }, INPUTS(), { now: NOW })
  db2.rows.forEach((r) => { r.start_at = new Date(NOW - H).toISOString() })   // (test only) the games are over
  const post = new Map([['g4|*', { played: false, landed: false }], ['g1|p1', { played: true, landed: true }], ['g1|s1', { played: true, landed: true, values: { sog: 4 } }]])
  await gradeCardRows(db2, db2.rows, post, NOW)
  assert.equal(db2.rows.find((r) => r.product === 'two_man').result, 'void', 'p6\'s game was postponed: the Two-Man voids, it is not a loss')
  assert.equal(db2.rows.find((r) => r.product === 'straight' && r.slot === 2).result, 'hit', 'four shots against a 2.5 line')
})

// ── 5. THE RECORD ─────────────────────────────────────────────────────────────
const G = (product, results, rates, extra = {}) => results.map((result, i) => ({
  lane: 'bot', product, slot: 1, stake: STAKE[product], result, legs: (Array.isArray(rates[i]) ? rates[i] : [rates[i]]).map((rate, j) => ({ player_id: `q${i}${j}`, game_date: '2026-10-10', rate })), ...extra,
}))
await t('K of N, the count expected if the legs were independent (the product of each leg\'s stored rate), the 95% range', () => {
  const rows = G('two_man', ['hit', 'miss', 'miss', 'void', null], [[0.5, 0.4], [0.3, 0.3], [0.2, 0.5], [0.9, 0.9], [0.5, 0.5]])
  const rec = recordOf(rows)
  assert.equal(rec.n, 5); assert.equal(rec.graded, 3); assert.equal(rec.hits, 1); assert.equal(rec.misses, 2); assert.equal(rec.voids, 1); assert.equal(rec.pending, 1)
  assert.equal(rec.pct, 33.3)
  assert.equal(rec.expected, 0.4, '0.5*0.4 + 0.3*0.3 + 0.2*0.5 = 0.39 -> 0.4 over the 3 graded rows (the void and the pending row are no result)')
  assert.equal(rec.expectedN, 3)
  const w = wilson(1, 3)
  assert.deepEqual(rec.ci, w)
  assert.ok(rec.ci[0] < 33.3 && rec.ci[1] > 33.3)
  assert.equal(rowExpected({ legs: [{ rate: 0.5 }, { rate: null }] }), null, 'a missing rate gives no expectation, never a made-up one')
  assert.equal(recordOf(G('straight', ['hit', 'miss'], [0.3, 0.2])).expected, 0.5, 'a straight\'s expectation is its leg\'s rate')
  assert.equal(recordOf([]).pct, null)
})

await t('units: only from 100 priced graded calls; fewer says "not enough priced calls yet"; a Two-Man is the PRODUCT of its two stored prices at half a unit', () => {
  const two = G('two_man', ['hit', 'miss'], [[0.5, 0.5], [0.5, 0.5]])
  const price = () => ({ median: 200, best: 300 })
  const few = recordOf(two, { priceOf: () => rowPrice(two[0], [price(), price()]) })
  assert.equal(few.units, null); assert.match(few.unitsWhy, /not enough priced calls yet \(2 of 100\)/); assert.equal(MIN_PRICED, 100)
  // a Two-Man at +200 and +200 pays 3 x 3 = 9 (decimal): +800; half a unit stake
  const p = rowPrice(two[0], [price(), price()])
  assert.equal(p.median, 800); assert.equal(p.best, 1500)      // best +300 each: 4 x 4 = 16 -> +1500
  assert.equal(americanOfDecimal(decimalOf(200) * decimalOf(200)), 800)
  const enough = recordOf(two, { priceOf: (r) => rowPrice(r, [price(), price()]), minPriced: 2 })
  // hit: 0.5 * (9 - 1) = +4.0 ; miss: -0.5  -> +3.5 at the median ; best: 0.5 * (16 - 1) = 7.5 - 0.5 = +7.0
  assert.deepEqual(enough.units, { median: 3.5, best: 7 })
  // one leg with no stored price = no price for the row, and it is counted as unpriced (never guessed)
  assert.equal(rowPrice(two[0], [price(), null]), null)
  assert.equal(recordOf(two, { priceOf: (r) => rowPrice(r, [price(), null]), minPriced: 1 }).priced, 0)
  // straights: a flat unit each: hit at +300 = +3, miss = -1
  const st = G('straight', ['hit', 'miss', 'miss'], [0.3, 0.3, 0.3])
  const u = recordOf(st, { priceOf: () => ({ median: 300, best: 350 }), minPriced: 3 })
  assert.deepEqual(u.units, { median: 1, best: 1.5 })
  // a void is no result and no stake
  assert.equal(recordOf(G('straight', ['void'], [0.3]), { priceOf: () => ({ median: 300, best: 350 }), minPriced: 1 }).priced, 0)
})

await t('the record reads as plain words: "if independent", the 95% range, voids, and the units line; counts only (no chance printed)', () => {
  const rows = G('two_man', ['hit', 'miss', 'miss', 'void'], [[0.5, 0.4], [0.3, 0.3], [0.2, 0.5], [0.9, 0.9]])
  const ws = recordWords(recordOf(rows), { product: 'two_man' })
  assert.match(ws[0], /^1 of 3 two-mans landed both legs \(33\.3%, 95% range \d+–\d+%\)\.$/)
  assert.match(ws.join(' '), /If the legs were independent we would expect 0\.4/)
  assert.match(ws.join(' '), /1 voided/); assert.match(ws.join(' '), /Units: not enough priced calls yet/)
  assert.deepEqual(recordWords(recordOf([]), { product: 'straight' }), [])
})

// ── 6. DONOVAN'S LANE ─────────────────────────────────────────────────────────
const NOTE = 'Both guys are on hot lines tonight.\nShots, shots, shots.'
const DON = { sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: FIELD, playerIds: ['p3', 'p5'], note: NOTE, now: NOW - 30 * 60e3, lockAtMs: LOCK_AT }
await t('Donovan\'s entry: two different real players from the board, a one-to-three line note, only before the lock and before any game starts', () => {
  const ok = donovanRow(DON)
  assert.equal(ok.ok, true); assert.equal(ok.row.lane, 'donovan'); assert.equal(ok.row.product, 'two_man'); assert.equal(ok.row.stake, 0.5); assert.equal(ok.row.note, NOTE)
  assert.equal(ok.row.rule, CARD_RULE.donovan); assert.deepEqual(ok.row.legs.map((l) => l.player_id), ['p3', 'p5'])
  assert.equal(donovanRow({ ...DON, playerIds: ['p3', 'p3'] }).ok, false)
  assert.equal(donovanRow({ ...DON, playerIds: ['p3'] }).ok, false)
  assert.match(donovanRow({ ...DON, playerIds: ['p3', 'nobody'] }).error, /from tonight's board/)
  assert.match(donovanRow({ ...DON, now: LOCK_AT }).error, /lock has passed/, 'at the lock the form refuses')
  assert.match(donovanRow({ ...DON, now: NOW + 1.5 * H }).error, /game has started|lock has passed/)
  assert.match(donovanRow({ ...DON, field: FIELD.map((c) => (c.player_id === 'p3' ? { ...c, start_ms: NOW - 31 * 60e3 } : c)) }).error, /game has started/)
  // the same player may be two men from the same game (his lane has no different-games rule)
  assert.equal(donovanRow({ ...DON, playerIds: ['p1', 'p2'] }).ok, true)
})

await t('Donovan\'s note: one to three non-empty lines; no link, hashtag, @mention, "lock", "guaranteed" or "winner" (it can go to X)', () => {
  assert.equal(cleanNote('one\n\n two  \nthree').note, 'one\ntwo\nthree')
  assert.equal(cleanNote('').ok, false); assert.equal(cleanNote('a\nb\nc\nd').ok, false); assert.equal(cleanNote('x'.repeat(500)).ok, false)
  for (const bad of ['see https://x.com/a', 'go to dash.com', '#locks', 'tag @someone', 'a lock tonight', 'guaranteed', 'two winners', 'free money']) assert.equal(cleanNote(bad).ok, false, bad)
  assert.equal(cleanNote('Hot lines, good matchup. Locked in on shots.').ok, false)
  assert.equal(cleanNote('Hot lines and a soft matchup.').ok, true)
})

await t('the table: his entry may be saved and replaced before the lock, never after; then it is frozen; the bot\'s record never contains it', async () => {
  const clock = { now: NOW - 30 * 60e3 }
  const db = fakeDb(clock)
  const row = donovanRow(DON).row
  assert.equal((await saveDonovan(db, row)).ok, true)
  const edit = donovanRow({ ...DON, playerIds: ['p4', 'p5'], note: 'Changed my mind.' }).row
  assert.equal((await saveDonovan(db, edit)).ok, true, 'replaced before the lock')
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].note, 'Changed my mind.')
  // not public before the lock: cardRows returns nothing of his
  assert.equal((await cardRows(db, 'nhl', '2026-10-10', { now: clock.now })).length, 0)
  // the lock passes
  clock.now = LOCK_AT + 1
  assert.equal((await cardRows(db, 'nhl', '2026-10-10', { now: clock.now })).length, 1, 'free to display after the lock')
  const late = await saveDonovan(db, donovanRow({ ...DON, now: NOW - 30 * 60e3, note: 'Too late edit.' }).row)   // even a stale form post is refused by the table
  assert.equal(late.ok, false); assert.match(late.error, /closed|never rewritten/)
  assert.equal(db.rows[0].note, 'Changed my mind.')
  assert.equal((await withdrawDonovan(db, { sport: 'nhl', card_date: '2026-10-10' })).ok, false, 'no withdrawing after the lock')
  assert.equal(db.rows.length, 1)
  // the game starts: nothing can touch it
  clock.now = NOW + 1 * H
  assert.equal((await saveDonovan(db, donovanRow({ ...DON, now: NOW - 30 * 60e3 }).row)).ok, false)
  // withdraw while open works
  const db2 = fakeDb({ now: NOW - 30 * 60e3 })
  await saveDonovan(db2, row)
  assert.equal((await withdrawDonovan(db2, { sport: 'nhl', card_date: '2026-10-10' })).ok, true); assert.equal(db2.rows.length, 0)
})

await t('lanes are never mixed: three records, the bot\'s straights, the bot\'s Two-Man, Donovan\'s Two-Man', () => {
  const rows = [
    ...G('straight', ['hit', 'miss'], [0.3, 0.3]),
    ...G('two_man', ['hit'], [[0.3, 0.3]]),
    ...G('two_man', ['miss', 'miss', 'hit'], [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3]], { lane: 'donovan' }),
  ]
  const r = recordsOf(rows)
  assert.deepEqual([r.straight.n, r.straight.hits], [2, 1])
  assert.deepEqual([r.two_man.n, r.two_man.hits], [1, 1], 'the bot\'s Two-Man has none of his')
  assert.deepEqual([r.donovan.n, r.donovan.hits, r.donovan.misses], [3, 1, 2])
  const src = fs.readFileSync(new URL('../lib/card/core.js', import.meta.url), 'utf8')
  assert.ok(/by\('bot', 'two_man'\)/.test(src) && /by\('donovan', 'two_man'\)/.test(src))
  assert.match(recordWords(r.donovan, { product: 'two_man', who: "Donovan's: " })[0], /^Donovan's: 1 of 3/)
})

// ── 7. THE POSTS ──────────────────────────────────────────────────────────────
const CARD_ROWS = (() => {
  const bot = lockRows({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: BMAP(), games: 6, now: NOW, lockAtMs: LOCK_AT })
  const don = donovanRow({ ...DON }).row
  return [...bot, don].map((r, i) => ({ id: i + 1, ...r }))
})()
const OK_PROBLEMS = new Map(FIELD.map((c) => [c.player_id, null]))

await t('the X post names ONLY the lead straight and Donovan\'s Two-Man with his note: not the other straights, not the bot\'s Two-Man', () => {
  const b = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows: CARD_ROWS, problems: OK_PROBLEMS, now: NOW - 30 * 60e3 })
  assert.ok(b.text.length > 0)
  assert.match(b.text, /Straight: Player p6 · Tg4A vs Tg4B \(anytime goal\)/)
  assert.match(b.text, /Donovan's Two-Man: Player p3 \+ Player p5/); assert.ok(b.text.includes('Shots, shots, shots.'))
  // the other straights and the bot's two-man legs (p6 is #1; p1 / p2 are #2, #3 and the Two-Man's second leg) are nowhere in the text or the payload
  for (const n of ['Player p1', 'Player p2', 'Player s1']) assert.ok(!b.text.includes(n), `${n} must not be on X`)
  assert.deepEqual(b.payload.picks.map((p) => p.player_id).sort(), ['p3', 'p5', 'p6'])
  assert.ok(!/Two-Man: Player p6/.test(b.text), 'the bot\'s Two-Man is not on X')
  assert.ok(cleanPublic(b.text), 'no link, hashtag, lock, guaranteed or winner'); assert.ok([...b.text].length + 4 <= 280)
  assert.ok(!/\bprice|\+\d{3}|%/.test(b.text), 'no price or chance on X')
})

await t('X rules: a long note loses lines before names; a repeat-guard exclusion drops the name, never swaps in another straight; nothing to say = no post', () => {
  const longNote = ['A'.repeat(130), 'B'.repeat(130), 'C'.repeat(130)].join('\n')
  const don = donovanRow({ ...DON, note: longNote })
  assert.equal(don.ok, true)
  const rows = CARD_ROWS.map((r) => (r.lane === 'donovan' ? { ...don.row, id: 9 } : r))
  const b = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows, problems: OK_PROBLEMS, now: NOW - 30 * 60e3 })
  assert.ok([...b.text].length + 4 <= 280); assert.ok(b.text.includes('Player p3') && b.text.includes('Player p6'))
  const ex = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows: CARD_ROWS, problems: OK_PROBLEMS, exclude: new Set(['p6']), now: NOW - 30 * 60e3 })
  assert.ok(!ex.text.includes('Straight:'), 'the lead straight is left out when he was named too recently'); assert.ok(!ex.text.includes('Player p1') && !ex.text.includes('Player p2') && !ex.text.includes('Player s1'))
  assert.ok(ex.text.includes('Donovan'))
  assert.equal(xCardBuild({ sport: 'nhl', day: 'd', rows: [], problems: OK_PROBLEMS, now: NOW }).text, '')
  const none = xCardBuild({ sport: 'nhl', day: 'd', rows: CARD_ROWS.filter((r) => r.lane === 'bot' && r.product !== 'straight'), problems: OK_PROBLEMS, now: NOW })
  assert.equal(none.text, '', 'the bot\'s Two-Man alone never makes an X post')
})

await t('X naming rule: a name not confirmed yet HOLDS the post; a definite no leaves him out (his Two-Man goes whole or not at all); a started game is never named', () => {
  const pend = new Map(OK_PROBLEMS); pend.set('p6', { id: 'p6', reason: 'starting goalie not confirmed', pending: true })
  const held = xCardBuild({ sport: 'nhl', day: 'd', rows: CARD_ROWS, problems: pend, now: NOW - 30 * 60e3 })
  assert.equal(held.text, ''); assert.ok(held.pending?.length === 1); assert.equal(held.startMs, NOW + 1 * H)
  const out = new Map(OK_PROBLEMS); out.set('p3', { id: 'p3', reason: 'listed out', pending: false })
  const left = xCardBuild({ sport: 'nhl', day: 'd', rows: CARD_ROWS, problems: out, now: NOW - 30 * 60e3 })
  assert.ok(left.text.includes('Straight:') && !left.text.includes('Donovan') && !left.text.includes('Player p3') && !left.text.includes('Player p5'))
  assert.ok(!left.text.includes('Shots, shots, shots.'), 'his note does not go out about two men whose names cannot be shown')
  assert.deepEqual(left.payload.picks.map((p) => p.player_id), ['p6'])
  const unseen = xCardBuild({ sport: 'nhl', day: 'd', rows: CARD_ROWS, problems: new Map(), now: NOW - 30 * 60e3 })
  assert.equal(unseen.text, '', 'a board that could not be read names nobody')
  const started = xCardBuild({ sport: 'nhl', day: 'd', rows: CARD_ROWS, problems: OK_PROBLEMS, now: NOW + 1 * H + 1 })
  assert.ok(!started.text.includes('Player p6'), 'p6\'s game has started')
})

// rows locked BEFORE the 10-11 floors froze no anytime price: the members text falls back to the newest stored price for them (those rows are still read)
const OLD_ROWS = CARD_ROWS.map((r) => ({ ...r, legs: r.legs.map((l) => (l.market && l.market !== 'anytime' ? l : (({ price, ...rest }) => rest)(l))) }))
const PRICES = new Map([['p6', { best: 450, median: 380, books: 5 }], ['p1', { best: 300, median: 280, books: 6 }], ['p3', { best: 250, median: 230, books: 4 }]])
await t('the #members card carries the whole Card, the bot\'s Two-Man, each price (or "no price on file yet") and the why', () => {
  const m = membersCardText({ sport: 'nhl', day: '2026-10-10', rows: OLD_ROWS, prices: PRICES })
  for (const n of ['Player p6', 'Player s1', 'Player p3', 'Player p1']) assert.ok(m.text.includes(n), n)
  assert.match(m.text, /CALLED/)
  assert.match(m.text, /1\. Player p6 .*1 unit · \+450 best, \+380 median \(5 books\)/)
  assert.match(m.text, /2\. Player s1 .*shots on goal over 2\.5 · 1 unit · \+130 median across 6 books/, 'a volume pick shows its stored line and the price frozen at the lock')
  assert.match(m.text, /TWO-MAN: Player p6 \+ Player p1 · different games · 0\.5 unit · about \+2100 best/)   // the product of the two prices
  assert.ok(m.text.includes('why p6')); assert.ok(!m.text.includes("Donovan"), 'his lane is free: not in the members card')
  const noPrice = membersCardText({ sport: 'nhl', day: 'd', rows: OLD_ROWS, prices: new Map() })
  assert.match(membersCardText({ sport: 'nhl', day: 'd', rows: CARD_ROWS, prices: new Map() }).text, /1\. Player p6 .*\+150 median across 5 books/, 'a Card locked under the floors freezes the price it was picked at')
  assert.match(noPrice.text, /no price on file yet/); assert.match(noPrice.text, /no price on file for both legs yet/)
  assert.ok([...m.text].length <= 1900)
  // the two-man price is the PRODUCT of the two prices: +450 and +300 -> 5.5 x 4 = 22 -> +2100 (best)
  assert.match(m.text, /about \+2100 best/)
})

await t('the free result: every row\'s outcome, hits AND misses, no price, fits 280, clean', () => {
  const graded = CARD_ROWS.map((r) => ({ ...r, result: r.lane === 'donovan' ? 'miss' : r.product === 'two_man' ? 'void' : r.slot === 1 ? 'hit' : r.slot === 2 ? 'miss' : 'void' }))
  const r = resultText({ sport: 'nhl', day: '2026-10-10', rows: graded })
  assert.match(r.text, /Straights: 1 of 2 hit \(1 void\)/); assert.match(r.text, /Two-Man: .*void \(did not play\)/); assert.match(r.text, /Donovan's Two-Man: .*missed/)
  assert.ok(r.text.includes('✗') || r.text.includes('missed'), 'a miss is shown')
  assert.ok(cleanPublic(r.text) && [...r.text].length + 4 <= 280)
  assert.equal(resultText({ sport: 'nhl', day: 'd', rows: CARD_ROWS }).text, '', 'nothing until every row is graded')
  assert.ok(!/\+\d{3}/.test(r.text))
})

// the #members LEAK CHECK: the whole card goes to the members webhook ONLY, never X, never a free channel
const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const FREE = { DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_NFL_WEBHOOKS: U('1003'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_RECEIPTS_WEBHOOK: U('1006') }
const ENV_KEYS = [...Object.keys(FREE), 'DISCORD_MEMBERS_WEBHOOK', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'POST_KINDS_ON', 'CARD_POSTS_PAUSE', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const setEnv = (extra = {}) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, FREE, extra) }
const calls = []
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: String(init?.body || '') }); return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) } }
function postDb() {
  const rows = []
  const T = {
    select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }), in: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
    upsert: (r) => { rows.push(...r); return { select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) } },
    update: () => ({ match: async () => ({ error: null }) }),
  }
  const snap = { select: () => ({ eq: () => ({ in: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) }
  return { from: (n) => (n === 'odds_snap' ? snap : T), rows }
}

await t('LEAK CHECK: the members card goes to the members webhook ONLY (never a free channel, never X); with no members webhook it sends nothing and claims nothing', async () => {
  const bot = CARD_ROWS.filter((r) => r.lane === 'bot')
  setEnv({ DISCORD_MEMBERS_WEBHOOK: U('9999'), X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' })
  calls.length = 0
  const db = postDb()
  const out = await postCardMembers(db, { sport: 'nhl', day: '2026-10-10', rows: bot, now: NOW - 30 * 60e3 })
  assert.equal(out, 'posted')
  assert.equal(calls.length, 1, 'exactly one network call')
  assert.equal(calls[0].url, U('9999'), 'to the members URL only')
  assert.ok(calls.every((c) => !/x\.com|twitter\.com/.test(c.url)), 'nothing to X')
  assert.ok(calls[0].body.includes('Player p1') && calls[0].body.includes('Player s1') && calls[0].body.includes('Two-Man (0.5 unit)'), 'the whole card is what went')
  assert.equal(db.rows[0].kind, 'card_members_nhl'); assert.match(db.rows[0].kind, /_members_/, 'the kind the public read policy already hides')
  // no members webhook: nothing sent, nothing claimed
  setEnv({ X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' })
  calls.length = 0
  const db2 = postDb()
  assert.equal(await postCardMembers(db2, { sport: 'nhl', day: '2026-10-10', rows: bot, now: NOW - 30 * 60e3 }), 'no-members-webhook')
  assert.equal(calls.length, 0); assert.equal(db2.rows.length, 0)
  // a members URL that is also a free hook is refused (membersWebhook): still nothing to the free channel
  setEnv({ DISCORD_MEMBERS_WEBHOOK: FREE.DISCORD_NHL_WEBHOOKS })
  calls.length = 0
  assert.equal(await postCardMembers(postDb(), { sport: 'nhl', day: '2026-10-10', rows: bot, now: NOW - 30 * 60e3 }), 'no-members-webhook')
  assert.equal(calls.length, 0)
  // too late (the games have started) and paused: nothing
  setEnv({ DISCORD_MEMBERS_WEBHOOK: U('9999') })
  assert.equal(await postCardMembers(postDb(), { sport: 'nhl', day: 'd', rows: bot, now: NOW + 9 * H }), 'too-late')
  process.env.CARD_POSTS_PAUSE = 'on'
  assert.equal(await postCardMembers(postDb(), { sport: 'nhl', day: 'd', rows: bot, now: NOW - 1 }), 'paused')
  assert.equal(calls.length, 0)
})

await t('LEAK CHECK: the code paths: the members text is built only on the members path; the X path never builds or reads it', () => {
  const post = fs.readFileSync(new URL('../lib/card/post.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  const xFn = post.slice(post.indexOf('export async function postCardX'), post.indexOf('/** The #members card'))
  assert.ok(!/membersCardText|postMembers|currentPrices/.test(xFn), 'postCardX never touches the members text or prices')
  const memFn = post.slice(post.indexOf('export async function postCardMembers'), post.indexOf('/** The free result post'))
  assert.ok(/postMembers\(/.test(memFn) && !/postOnce\(|postToX|toX/.test(memFn), 'the members post goes through postMembers only')
  const resFn = post.slice(post.indexOf('export async function postCardResult'))
  assert.ok(!/membersCardText|currentPrices/.test(resFn), 'the free result carries no price')
  const tx = fs.readFileSync(new URL('../lib/card/text.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  const xt = tx.slice(tx.indexOf('export function xCardText'), tx.indexOf('/** The price of a leg in words'))
  assert.ok(!/two_man|price|fmtAmerican/.test(xt.replace(/Donovan's Two-Man/g, '')), 'the X text builder has no price and no bot two-man')
  assert.ok(!/\.rate\b/.test(tx), 'no model rate is read by any text')
  // the X post is posted by postOnce with the free feed; its kind is not a members kind
  assert.ok(!/_members_/.test(CARD_KIND.x('nhl')) && /_members_/.test(CARD_KIND.members('nhl')))
})

await t('the post kinds: all tagged (INFO event / members), the sport read from the kind, results exempt from the repeat guard, no untagged kind (the map\'s kinds are in check-card-map)', () => {
  assert.deepEqual(untagged(), [])
  for (const s of ['mlb', 'nfl', 'nhl']) {
    assert.equal(tagOf(`card_${s}`), 'INFO'); assert.equal(tagOf(`card_result_${s}`), 'INFO'); assert.equal(tagOf(`card_members_${s}`), null, 'a members kind carries no X tag')
    assert.equal(kindInfo(`card_members_${s}`).mode, 'members'); assert.equal(kindInfo(`card_${s}`).mode, 'event'); assert.equal(kindInfo(`card_${s}`).sport, s)
    for (const k of [`card_${s}`, `card_result_${s}`, `card_members_${s}`]) assert.equal(sportOfKind(k), s, k)
    assert.equal(tierOf(`card_${s}`), 'writeup'); assert.equal(isRepeatExempt(`card_result_${s}`), true); assert.equal(isRepeatExempt(`card_${s}`), false)
    assert.equal(mayPostNow({ kind: `card_members_${s}`, now: NOW }).ok, false, 'a members kind never goes to X')
    assert.equal(CARD_KIND.x(s), `card_${s}`); assert.equal(CARD_KIND.result(s), `card_result_${s}`)
  }
  assert.equal(kindInfo('card_nba'), null, 'BUCKETS has no card kind')
  assert.equal(sportOfKind('card_nhl'), 'nhl'); assert.equal(sportOfKind('card_result_nfl'), 'nfl')
})

await t('the X post path: claims one row per (day, kind), names only what the build allowed, and never mentions the bot\'s Two-Man', async () => {
  setEnv({ DISCORD_MEMBERS_WEBHOOK: U('9999') })
  calls.length = 0
  const db = postDb()
  // the naming boards are not reachable in a test: the unseen-board case names nobody and so posts nothing
  const out = await postCardX(db, { sport: 'nhl', day: '2026-10-10', rows: CARD_ROWS, now: NOW - 30 * 60e3 })
  assert.match(out, /not-enough-yet|held|off/)
  assert.equal(db.rows.length, 0, 'nothing claimed when nothing may be named')
  assert.ok(calls.every((c) => !c.body.includes('Player p1')))
  assert.equal(await postCardX(postDb(), { sport: 'nhl', day: 'd', rows: CARD_ROWS, now: NOW + 9 * H }), 'too-late')
})


await t('the X post: the #1 straight carries its status word and ONE data line (its why), dropped before Donovan\'s words when too long; clean', () => {
  const b = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows: CARD_ROWS, problems: OK_PROBLEMS, now: NOW - 30 * 60e3 })
  assert.match(b.text, /Straight: Player p6 · Tg4A vs Tg4B \(anytime goal\) · CALLED\nwhy p6\n/)
  assert.ok(cleanPublic(b.text) && [...b.text].length + 4 <= 280)
  const long = CARD_ROWS.map((r) => (r.slot === 1 && r.product === 'straight' && r.lane === 'bot' ? { ...r, legs: [{ ...r.legs[0], why: 'w'.repeat(200), status: 'board' }] } : r))
  const l = xCardBuild({ sport: 'nhl', day: 'd', rows: long, problems: OK_PROBLEMS, now: NOW - 30 * 60e3 })
  assert.ok(!l.text.includes('www') && l.text.includes('ON THE BOARD') && l.text.includes('Shots, shots, shots.'), 'the data line goes first, his note stays')
})

await t('status words: a football straight is CALLED or ON THE BOARD from its leg; the record shows the mix; NFL pool takes called + board only from the TD ladder / game calls', () => {
  const rows = lockRows({ sport: 'nfl', slate_key: 'k', card_date: 'd', byMarket: { anytime: { cands: [C('a', 'g1', 2, 90, 0.3, { status: 'board' }), C('b', 'g2', 2, 80, 0.3, { status: 'called' }), C('c', 'g3', 2, 70, 0.3, { status: 'called' })], board: [90, 80, 70] }, rec_yds: { cands: [{ ...C('r', 'g4', 2, 99, null, { status: 'called' }), market: 'rec_yds', line: 99.5, price: { median: 125, best: 130 } }], board: [99] } }, games: 6, now: NOW, lockAtMs: LOCK_AT })
  assert.deepEqual(rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].status), ['board', 'called'])
  assert.deepEqual(rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].market), ['anytime', 'rec_yds'], 'slot 3 (rushing yards) had no board: skipped')
  const g = rows.map((r) => ({ ...r, result: 'hit' }))
  const rec = recordOf(g.filter((r) => r.product === 'straight'))
  assert.deepEqual(rec.mix, { called: 1, board: 1 })
  assert.match(recordWords(rec, { product: 'straight' }).join(' '), /1 CALLED, 1 ON THE BOARD/)
  assert.match(membersCardText({ sport: 'nfl', day: 'd', rows: rows.map((r, i) => ({ id: i, ...r })) }).text, /ON THE BOARD/)
  const src = fs.readFileSync(new URL('../lib/card/sources.js', import.meta.url), 'utf8')
  assert.ok(/status === 'called' \|\| status === 'board'/.test(src) && /onBot\.market === 'TD' \|\| onBot\.market === 'GAME'/.test(src))
})

// ── 8. THE MIGRATION AND THE ROUTES ───────────────────────────────────────────
await t('the migration: the table, the guard trigger (insert / update / delete), Donovan open until his lock, RLS, the nine kinds, no `set role`', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610101000_card_calls.sql', import.meta.url), 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  assert.ok(/create table if not exists public\.card_calls/.test(code) && /unique \(sport, card_date, lane, product, slot, model_version\)/.test(code))
  assert.ok(/create trigger card_calls_guard before insert or update or delete/.test(code))
  assert.ok(/now\(\) >= new\.start_at/.test(code) && /now\(\) >= new\.locks_at/.test(code) && /never rewritten/.test(code) && /never regraded/.test(code) && /never deleted/.test(code))
  assert.ok(/old\.lane = 'donovan' and old\.result is null and now\(\) < old\.locks_at/.test(code))
  assert.ok(/using \(sport <> 'nba' and \(lane = 'bot' or now\(\) >= locks_at\)\)/.test(code))
  assert.ok(/check \(note is null or lane = 'donovan'\)/.test(code) && /check \(lane = 'bot' or product = 'two_man'\)/.test(code))
  for (const s of ['mlb', 'nfl', 'nhl']) for (const k of [`card_${s}`, `card_result_${s}`, `card_members_${s}`]) assert.ok(code.includes(`'${k}'`), k)
  assert.ok(!/set\s+role/i.test(code))
  // the RUN-IN file (private, outside the repo) is the SQL itself when present
  const run = '/Volumes/DONX/USERS/Kingdondondon/Desktop/moonshot-push/.claude-notes/RUN-IN-SUPABASE-2026-10-10-two-man.txt'
  if (fs.existsSync(run)) assert.equal(fs.readFileSync(run, 'utf8').trim(), sql.trim(), 'the run-in file is the migration, byte for byte')
})

await t('the admin form: gated by ADMIN_EMAILS (404 otherwise), refuses a save once the lock has passed or a game started; the page is not indexed', () => {
  const api = fs.readFileSync(new URL('../app/api/admin/two-man/route.js', import.meta.url), 'utf8')
  assert.ok(/isAdminUser\(user\)/.test(api) && /status: 404/.test(api))
  assert.ok(/onTime\(win, now\)/.test(api) && /now < lockAtOf\(win\.first_start_ms\) && now < win\.first_start_ms/.test(api) && /donovanRow\(/.test(api) && /allowLate: true/.test(api), 'always open: the route classifies on time vs LATE with the same lock rule')
  const page = fs.readFileSync(new URL('../app/admin/two-man/page.js', import.meta.url), 'utf8')
  assert.ok(/notFound\(\)/.test(page) && /robots/.test(page) && /isAdminUser/.test(page))
  const pub = fs.readFileSync(new URL('../app/api/card/route.js', import.meta.url), 'utf8')
  assert.ok(/rate, \.\.\.leg/.test(pub), 'the public read does not send the stored model rate')
  assert.ok(!/created_by|email/.test(fs.readFileSync(new URL('../supabase/migrations/202610101000_card_calls.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')), 'no email is stored on a public row')
})

await t('the surfaces read the one table: the Card on each sport\'s Games tab, the record lines on the Ledger and /called, the cron', () => {
  const has = (f, re) => assert.ok(re.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), `${f} ${re}`)
  has('components/Dashboard.js', /<CardSection sport="mlb"( compact)? \/>/); has('components/lamp/LampDashboard.js', /<CardSection sport="nhl" Table=\{LampTable\}( compact)? \/>/); has('components/nfl/NflDashboard.js', /<CardSection sport="nfl" Table=\{NflTable\}( compact)? \/>/)
  has('components/pages/LedgerShell.js', /<CardSection sport=\{sport\} mode="record" \/>/); has('components/record/CalibrationSection.js', /<CardSection sport=\{sport\} mode="record" \/>/)
  has('app/api/totals/tick/route.js', /cardTick\(db, now\)/)
  assert.ok(!/api\/card\/tick/.test(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')), 'the Card has no cron of its own (the daily invocation budget)')
  const comp = fs.readFileSync(new URL('../components/card/CardSection.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(comp), 'no hex literal in the component'); assert.ok(!/\.rate\b|probabilit|(?<!not a )chance/i.test(comp), 'the page prints no model chance')
  assert.ok(/aria-expanded/.test(comp) && /minHeight: 44/.test(comp), 'the collapsed line is a 44px target')
})

await t('latestCardDate: the newest card whose row is public (Donovan\'s open entry is not a card)', async () => {
  const clock = { now: NOW - 30 * 60e3 }
  const db = fakeDb(clock)
  await saveDonovan(db, donovanRow(DON).row)
  const orig = db.from
  db.from = (n) => { const tb = orig(n); return { ...tb, select: () => { const q = tb.select(); q.order = () => q; return q } } }
  assert.equal(await latestCardDate(db, 'nhl', clock.now), null)
  assert.equal(await latestCardDate(db, 'nhl', LOCK_AT + 1), '2026-10-10')
})

// ── 9. ALWAYS OPEN: THE LATE LANE, THE PICKER, THE PREVIEW (Donovan, 2026-10-12: "i want to be able to submit mine whenever") ──
const LATE_OK = { ...DON, allowLate: true }
await t('LATE 1: before the lock and before any game it is the verified entry EXACTLY as before; after the lock, or with a started game, it is the LATE lane (rule, lock <= start)', () => {
  const plain = donovanRow(DON); const open = donovanRow(LATE_OK)
  assert.deepEqual(open.row, plain.row, 'an on-time entry is byte-identical with allowLate on')
  assert.equal(open.late, false); assert.equal(open.row.lane, 'donovan'); assert.equal(open.row.rule, CARD_RULE.donovan)
  const afterLock = donovanRow({ ...LATE_OK, now: LOCK_AT + 60e3 })      // lock passed, p3 and p5 not started yet
  assert.equal(afterLock.ok, true); assert.equal(afterLock.late, true); assert.equal(afterLock.row.lane, LATE_LANE); assert.equal(afterLock.row.rule, 'donovan-late-v1'); assert.match(afterLock.lateWhy, /lock/)
  const started = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p3'], now: NOW + 90 * 60e3 })     // p6's game started half an hour ago
  assert.equal(started.ok, true); assert.equal(started.late, true); assert.equal(started.row.lane, LATE_LANE); assert.match(started.lateWhy, /started/)
  for (const r of [afterLock.row, started.row]) assert.ok(Date.parse(r.locks_at) <= Date.parse(r.start_at), 'locks_at <= start_at (the table\'s own check)')
  // without allowLate nothing changed: it still refuses
  assert.match(donovanRow({ ...DON, now: LOCK_AT + 60e3 }).error, /lock has passed/); assert.match(donovanRow({ ...DON, playerIds: ['p6', 'p3'], now: NOW + 90 * 60e3 }).error, /game has started/)
  assert.equal(isLateRow(started.row), true); assert.equal(isLateRow(open.row), false)
  // a note and two real players are still required of a late entry
  assert.equal(donovanRow({ ...LATE_OK, now: NOW + 90 * 60e3, note: '' }).ok, false); assert.equal(donovanRow({ ...LATE_OK, now: NOW + 90 * 60e3, playerIds: ['p6'] }).ok, false)
  // his lane is exempt from the floors: priceless men are fine
  assert.equal(donovanRow({ ...LATE_OK, field: FIELD.map((c) => ({ ...c, price: undefined })) }).ok, true)
})

await t('LATE 2: the legs keep the sport\'s own board word (a man who is not on the board is "off", not CALLED); an on-time call stays CALLED', () => {
  const f = [C('a', 'g1', 2, 90, 0.3, { status: 'called' }), C('b', 'g2', 2, 80, 0.3, { status: 'board' }), C('c', 'g3', 2, 20, 0.3, { status: 'off' })]
  const r = donovanRow({ ...DON, field: f, playerIds: ['a', 'c'] })
  assert.deepEqual(r.row.legs.map((l) => l.status), ['called', 'off'])
  assert.deepEqual(donovanRow({ ...DON, field: f, playerIds: ['b', 'a'] }).row.legs.map((l) => l.status), ['board', 'called'])
})

await t('LATE 3: saved after the start, a late row is marked LATE, never overwrites his locked on-time entry, and is in NO count, read, day, post or ledger', async () => {
  const clock = { now: NOW - 30 * 60e3 }
  const db = fakeDb(clock)
  const ontime = donovanRow(DON).row
  assert.equal((await saveDonovan(db, ontime)).ok, true)
  clock.now = NOW + 90 * 60e3                                              // p6's game has started; the on-time entry is locked
  const mk = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p4'], note: 'Late look: hindsight, for me.', now: clock.now })
  assert.equal(mk.late, true)
  const saved = await saveDonovan(db, mk.row)
  assert.equal(saved.ok, true, 'the table takes a late row after the start')
  assert.equal(db.rows.length, 2, 'two rows: the on-time entry and the late one')
  const onRow = db.rows.find((r) => r.lane === 'donovan'); const lateRow = db.rows.find((r) => r.lane === LATE_LANE)
  assert.equal(onRow.note, NOTE, 'the locked on-time entry is untouched'); assert.deepEqual(onRow.legs.map((l) => l.player_id), ['p3', 'p5'])
  assert.equal(lateRow.note, 'Late look: hindsight, for me.'); assert.equal(lateRow.locked_at, new Date(clock.now).toISOString(), 'locked_at is the real save time')
  // every verified reader leaves it out, whatever the clock
  for (const audience of ['public', 'members']) assert.ok((await readCard(db, 'nhl', '2026-10-10', { now: clock.now, audience })).rows.every((r) => r.lane !== LATE_LANE), `readCard ${audience}`)
  assert.ok((await recordRows(db, 'nhl', { now: clock.now })).every((r) => r.lane !== LATE_LANE), 'recordRows')
  assert.ok((await dayRows(db, '2026-10-10', { now: clock.now })).every((r) => r.lane !== LATE_LANE), 'dayRows')
  assert.equal((await recordRows(db, 'nhl', { now: clock.now })).length, 1)
  // a date that has ONLY a late entry is not a card
  const dbL = fakeDb({ now: NOW + 90 * 60e3 }); await saveDonovan(dbL, mk.row)
  assert.equal(await latestCardDate(dbL, 'nhl', NOW + 9 * H), null); assert.deepEqual(await cardRows(dbL, 'nhl', '2026-10-10', { now: NOW + 9 * H }), [])
  // the records: his verified lane counts only his on-time row
  const rows = await recordRows(db, 'nhl', { now: clock.now }); assert.equal(recordsOf(rows).donovan.n, 1)
  // it is readable for him alone
  const mine = await lateEntries(db, { sport: 'nhl' })
  assert.equal(mine.rows.length, 1); assert.equal(mine.rows[0].lane, LATE_LANE)
  assert.equal((await donovanEntry(db, 'nhl', '2026-10-10', 'two_man', undefined, LATE_LANE))?.note, 'Late look: hindsight, for me.')
  assert.equal((await donovanEntry(db, 'nhl', '2026-10-10'))?.note, NOTE)
  // replacing the LATE row leaves the on-time row alone, a second late save with the same key is the same row
  const again = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p2'], note: 'Changed it.', now: clock.now })
  assert.equal((await saveDonovan(db, again.row)).ok, true); assert.equal(db.rows.length, 2); assert.equal(db.rows.find((r) => r.lane === 'donovan').note, NOTE)
})

await t('LATE 4: a late row is graded for his reference only (the record, the Card and the posts never count it); frozen after 15 minutes', async () => {
  const clock = { now: NOW + 90 * 60e3 }
  const db = fakeDb(clock)
  const mk = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p4'], now: clock.now })
  await saveDonovan(db, mk.row)
  // typo window: change and withdraw inside LATE_EDIT_MIN
  clock.now += (LATE_EDIT_MIN - 1) * 60e3
  assert.equal((await saveDonovan(db, donovanRow({ ...LATE_OK, playerIds: ['p6', 'p5'], note: 'Typo fixed.', now: clock.now }).row)).ok, true)
  assert.equal(db.rows[0].note, 'Typo fixed.')
  // after the window it is frozen: no rewrite, no withdraw
  clock.now += 2 * 60e3
  const frozen = await saveDonovan(db, donovanRow({ ...LATE_OK, playerIds: ['p6', 'p4'], note: 'Too late to change.', now: clock.now }).row)
  assert.equal(frozen.ok, false); assert.match(frozen.error, /never rewritten/); assert.equal(db.rows[0].note, 'Typo fixed.')
  assert.equal((await withdrawDonovan(db, { sport: 'nhl', card_date: '2026-10-10', lane: LATE_LANE })).ok, false)
  // graded by the same grader once its games are final; the result is for the late list only
  clock.now = NOW + 9 * H
  const results = new Map(db.rows[0].legs.map((l) => [`${l.game_id}|${l.player_id}`, { played: true, landed: true }]))
  assert.equal(await gradeCardRows(db, db.rows, results, clock.now), 1); assert.equal(db.rows[0].result, 'hit')
  const mine = await lateEntries(db, { sport: 'nhl' })
  assert.equal(mine.record.graded, 1); assert.equal(mine.record.hits, 1)
  assert.equal(recordsOf(await recordRows(db, 'nhl', { now: clock.now })).donovan.n, 0, 'not in his verified record')
  // withdraw inside the window works
  const db2 = fakeDb({ now: NOW + 90 * 60e3 }); await saveDonovan(db2, mk.row)
  assert.equal((await withdrawDonovan(db2, { sport: 'nhl', card_date: '2026-10-10', lane: LATE_LANE })).ok, true); assert.equal(db2.rows.length, 0)
})

await t('LATE 5: before the migration is run a late save is refused with a clear message and NOTHING is stored (never a late entry in the verified lane)', async () => {
  const stored = []
  const db = { from: () => ({ upsert: (rows) => { stored.push(...rows); return { select: () => Promise.resolve({ data: null, error: { message: 'new row for relation "card_calls" violates check constraint "card_calls_lane_check"' } }) } } }) }
  const mk = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p4'], now: NOW + 90 * 60e3 })
  const r = await saveDonovan(db, mk.row)
  assert.equal(r.ok, false); assert.equal(r.needsSql, true); assert.match(r.error, /202610121100_card_calls_late\.sql/); assert.match(r.error, /Nothing was saved/)
  assert.ok(stored.every((x) => x.lane === LATE_LANE), 'the row it tried to write was the late lane, never donovan')
})

await t('LATE 6: a late row can never reach a post, an image or a public route (posts read lane "donovan" by name; the image routes read the public view)', async () => {
  const mk = donovanRow({ ...LATE_OK, playerIds: ['p6', 'p4'], note: 'Late only.', now: NOW + 90 * 60e3 })
  const rows = [mk.row, ...CARD_ROWS.filter((r) => r.lane === 'bot')]
  const b = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows, problems: new Map(), now: NOW - 3600e3 })
  assert.ok(!/Late only|Donovan/.test(b.text), 'the X post builder ignores a late row')
  const m = membersCardText({ sport: 'nhl', day: '2026-10-10', rows, prices: new Map() })
  assert.ok(!(m.text || '').includes('Late only'))
  for (const f of ['lib/card/post.js', 'lib/card/text.js', 'lib/card/tick.js']) {
    const code = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    assert.ok(!/donovan_late|LATE_LANE|lateEntries/.test(code), `${f} never names the late lane`)
  }
  for (const f of ['app/api/card/route.js', 'app/api/card/day/route.js', 'app/api/card/dual/route.js', 'app/api/card/slab/route.js']) {
    const code = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.ok(!/donovan_late|lateEntries/.test(code), `${f} cannot read the late lane`)
  }
})

await t('PICKER: each row carries face, name, club, opponent, the game start in ET with the day, market, stored price, floor status (information only), board word and score', () => {
  const base = (id, extra = {}) => ({ player_id: id, name: `Player ${id}`, team: 'AAA', opp: 'BBB', pos: 'C', game_id: 'g1', start_ms: Date.parse('2026-10-10T23:00:00Z'), score: 77.4, status: 'called', espn_id: '4242', ...extra })
  const priced = (m) => ({ median: m, best: m + 10, books: 6, taken_at: '2026-10-10T19:00:00Z' })
  const nhl = pickerRow(base('8478402'), { sport: 'nhl', price: priced(150), now: NOW, season: nhlSeasonOf('2026-10-10') })
  assert.equal(nhlSeasonOf('2026-10-10'), '20262027'); assert.equal(nhlSeasonOf('2027-02-01'), '20262027')
  assert.deepEqual(Object.keys(nhl).sort(), ['board_word', 'face', 'floor', 'game_id', 'market', 'name', 'opp', 'player_id', 'pos', 'price', 'score', 'start_at', 'started', 'status', 'team', 'when'].sort())
  assert.equal(nhl.name, 'Player 8478402'); assert.equal(nhl.team, 'AAA'); assert.equal(nhl.opp, 'BBB'); assert.equal(nhl.board_word, STATUS_WORD.called)
  assert.equal(nhl.when, 'Sat 7:00 PM ET'); assert.equal(etWhen('2026-10-10T23:00:00Z'), 'Sat 7:00 PM ET'); assert.equal(nhl.started, false)
  assert.equal(nhl.market, 'anytime goal'); assert.deepEqual(nhl.price, { median: 150, best: 160, books: 6 })
  assert.match(nhl.face.photo, /^https:\/\/assets\.nhle\.com\/mugs\/nhl\/20262027\/AAA\/8478402\.png$/)
  assert.equal(nhl.floor.code, 'ok')
  // floors: informational. +150 clears, +100 is under for a baseball / football anytime, goals are exempt, no price says so; a priceless man is still a row
  assert.equal(pickerRow(base('1'), { sport: 'mlb', price: priced(150), now: NOW }).floor.code, 'ok')
  assert.equal(pickerRow(base('1'), { sport: 'mlb', price: priced(100), now: NOW }).floor.code, 'price')
  assert.equal(pickerRow(base('1'), { sport: 'nhl', price: priced(-200), now: NOW, season: '20262027' }).floor.code, 'ok', 'goals are exempt from the straight floor')
  const none = pickerRow(base('1'), { sport: 'nfl', price: null, now: NOW })
  assert.equal(none.price, null); assert.equal(none.floor.code, 'no_price'); assert.equal(none.market, 'anytime touchdown'); assert.deepEqual(none.face, { sport: 'nfl', espnId: '4242' })
  assert.deepEqual(pickerRow(base('660271'), { sport: 'mlb', price: null, now: NOW }).face, { sport: 'mlb', id: '660271' })
  assert.equal(pickerRow(base('1', { status: 'off' }), { sport: 'mlb', now: NOW }).board_word, STATUS_WORD.off)
  assert.equal(pickerRow(base('1', { status: 'board' }), { sport: 'mlb', now: NOW }).board_word, STATUS_WORD.board)
  assert.equal(pickerRow(base('1', { start_ms: NOW - 1 }), { sport: 'mlb', now: NOW }).started, true)
  // the pair
  const a = pickerRow(base('1'), { sport: 'mlb', price: priced(150), now: NOW }); const b = pickerRow(base('2'), { sport: 'mlb', price: priced(150), now: NOW }); const c = pickerRow(base('3'), { sport: 'mlb', price: priced(100), now: NOW })
  assert.deepEqual([pairFloor(a, b).code, pairFloor(a, b).combined], ['ok', 525]); assert.equal(pairFloor(c, c).code, 'price'); assert.equal(pairFloor(a, none).code, 'no_price')
  // the component draws what the row carries, through the site's face, team mark and status badge (no hex, no sport ternary)
  const form = fs.readFileSync(new URL('../components/admin/TwoManForm.js', import.meta.url), 'utf8')
  assert.ok(/PlayerFace/.test(form) && /TeamMark/.test(form) && /CallStatusBadge/.test(form) && /\/api\/admin\/two-man\/preview/.test(form))
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(form.replace(/\/\/.*$/gm, '')), 'no hex literal in the form')
  assert.ok(!/sport === '(nfl|nhl|mlb)' \?/.test(form), 'no sport ternary')
})

await t('ADMIN ONLY: the preview route stores nothing, is admin-gated (404), and refuses a cross-site or non-JSON write; the page and both APIs share the gate', () => {
  const prev = fs.readFileSync(new URL('../app/api/admin/two-man/preview/route.js', import.meta.url), 'utf8')
  const code = prev.replace(/\/\/.*$/gm, '')
  assert.ok(/isAdminUser\(user\)/.test(code) && /404\)/.test(code) && /sameOriginJson\(request\)/.test(code))
  assert.ok(!/saveDonovan|\.upsert\(|\.insert\(|\.update\(|\.delete\(|withdrawDonovan|lockCard|postCard/.test(code), 'the preview writes nothing and posts nothing')
  assert.ok(/no-store/.test(code) && !/public/.test(code), 'never cached')
  const api = fs.readFileSync(new URL('../app/api/admin/two-man/route.js', import.meta.url), 'utf8')
  assert.ok(/sameOriginJson\(request\)/.test(api) && /confirm_late/.test(api) && /needs_confirm/.test(api))
  // gates: a confirmed, allow-listed email only; the reason is a code for the server log
  process.env.ADMIN_EMAILS = 'boss@test.invalid'
  assert.equal(isAdminUser({ email: 'boss@test.invalid', email_confirmed_at: '2026-01-01' }), true)
  assert.equal(isAdminUser({ email: 'boss@test.invalid' }), false, 'an unconfirmed email is not an admin')
  assert.equal(isAdminUser({ email: 'other@test.invalid', email_confirmed_at: 'x' }), false); assert.equal(isAdminUser(null), false)
  assert.equal(adminDenyReason(null), 'signed-out'); assert.equal(adminDenyReason({ email: 'boss@test.invalid' }), 'email-unconfirmed'); assert.equal(adminDenyReason({ email: 'x@test.invalid', email_confirmed_at: 'x' }), 'email-not-listed')
  assert.equal(adminDenyReason({ email: 'boss@test.invalid', email_confirmed_at: 'x' }), null)
  process.env.ADMIN_EMAILS = ''
  assert.equal(adminDenyReason({ email: 'boss@test.invalid', email_confirmed_at: 'x' }), 'allow-list-env-missing'); assert.equal(isAdminUser({ email: 'boss@test.invalid', email_confirmed_at: 'x' }), false, 'fails closed with no env')
  const req = (h) => ({ headers: { get: (k) => h[k.toLowerCase()] ?? null } })
  assert.equal(sameOriginJson(req({ 'content-type': 'application/json', origin: 'https://dashnetwork.vercel.app', host: 'dashnetwork.vercel.app' })), true)
  assert.equal(sameOriginJson(req({ 'content-type': 'application/json', origin: 'https://evil.example', host: 'dashnetwork.vercel.app' })), false, 'cross-site refused')
  assert.equal(sameOriginJson(req({ 'content-type': 'text/plain', host: 'dashnetwork.vercel.app' })), false, 'a form post (not JSON) refused')
  assert.equal(sameOriginJson(req({ 'content-type': 'application/json' })), true, 'no Origin = not a browser form post; the session still gates it')
  const page = fs.readFileSync(new URL('../app/admin/two-man/page.js', import.meta.url), 'utf8')
  assert.ok(/!isAdminUser\(user\)\) \{[\s\S]*?notFound\(\)/.test(page))
  // nothing sensitive in a response: no env, no email, no service key
  for (const f of ['app/api/admin/two-man/route.js', 'app/api/admin/two-man/preview/route.js']) assert.ok(!/process\.env|SERVICE_ROLE|user\.email/.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), `${f} sends no secret`)
})

await t('THE LATE MIGRATION: the lane, the trigger, the restrictive read policy (late is never readable by anon), idempotent, no role switching; the plain .txt IS the SQL', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610121100_card_calls_late.sql', import.meta.url), 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  assert.ok(/check \(lane in \('bot','donovan','donovan_late'\)\)/.test(code) && /check \(note is null or lane in \('donovan','donovan_late'\)\)/.test(code))
  assert.ok(/new\.lane = 'donovan_late'/.test(code) && /old\.lane = 'donovan_late'/.test(code) && /interval '15 minutes'/.test(code))
  assert.ok(/as restrictive for select to anon, authenticated/.test(code) && /using \(lane <> 'donovan_late'\)/.test(code))
  assert.ok(/drop policy if exists card_calls_no_late/.test(code) && /create or replace function public\.card_calls_guard/.test(code) && /drop trigger if exists card_calls_guard/.test(code))
  // the verified lane's rules are unchanged inside the new guard
  assert.ok(/now\(\) >= new\.start_at/.test(code) && /now\(\) >= new\.locks_at/.test(code) && /a locked card is never rewritten/.test(code) && /a graded card row is never regraded/.test(code) && /nothing is graded before the start/.test(code))
  assert.ok(!/set\s+role/i.test(sql) && !/drop table|truncate|delete from/i.test(code) && !/alter table public\.card_calls drop column/i.test(code))
  const txt = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/TWO-MAN-LATE/card_late_SQL.txt'
  if (fs.existsSync(txt)) assert.equal(fs.readFileSync(txt, 'utf8').trim(), sql.trim(), 'the .txt is the migration, byte for byte')
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
