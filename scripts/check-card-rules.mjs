#!/usr/bin/env node
// THE CARD'S FLOORS (Donovan, 2026-10-11): price floors (+120 straight, +500 Two-Man), line floors (100+ yards, 300+ passing, 7+ catches), no price = not on the
// Card, goals exempt, his own lane exempt, and the TRACKED record (graded, units per one unit staked). Every input is TEST data (made-up players p1.., clubs
// T..A, made-up numbers and prices), nothing real.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-rules.mjs
import './_no-injury-net.mjs'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  FLOORS, MIN_BAR, PRICE_FLOOR_EXEMPT, TRACKED_STAKE, barOfLine, lineClears, chooseRung, straightVerdict, twoManVerdict, meetsTwoManFloor, combinedPrice, trackedUnits, laneExempt,
} from '../lib/card/rules.js'
import {
  CARD_RULE_TEXT, CARD_RULE, CARD_VERSION, lockPlan, planStraights, pickTwoManFor, donovanRow, trackedRecordsOf, trackedWords, lockAtOf, isSameGameRule,
} from '../lib/card/core.js'
import { lockCard, gradeCardRows, TRACKED_TABLE, trackedFor } from '../lib/card/store.js'
import { loadLines } from '../lib/card/sources.js'
import { cleanPublic } from '../lib/card/text.js'
import { fakeDb } from './_card-fakedb.mjs'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-11T18:00:00Z')
Date.now = () => NOW
const LOCK_AT = lockAtOf(NOW + 1 * H)
// TEST candidates: id, game, start offset hours, score, anytime price (null = none on file)
const A = (id, game, score, med, extra = {}) => ({ player_id: id, name: `Player ${id}`, team: `T${game}A`, opp: `T${game}B`, game_id: game, game_date: '2026-10-11', start_ms: NOW + 2 * H, score, rate: 0.3, why: `why ${id}`, ...(med == null ? {} : { price: { median: med, best: med + 10, books: 5, taken_at: '2026-10-11T17:00:00Z' } }), ...extra })
const V = (id, game, score, market, line, med) => ({ ...A(id, game, score, med), rate: null, market, line })
const plan = (sport, byMarket, games = 6) => lockPlan({ sport, slate_key: 'k', card_date: '2026-10-11', byMarket, games, now: NOW, lockAtMs: LOCK_AT })
const only = (cands) => ({ anytime: { cands, board: cands.map((c) => c.score) } })

await t('THE NUMBERS ARE ONE CONFIG: +120 straight, +500 Two-Man, 100/100/300/7 lines, goals the only exempt market', () => {
  assert.equal(FLOORS.straight, 120); assert.equal(FLOORS.twoMan, 500)
  assert.deepEqual(MIN_BAR.nfl, { rec_yds: 100, rush_yds: 100, pass_yds: 300, rec: 7 })
  assert.deepEqual(PRICE_FLOOR_EXEMPT, { nhl: ['anytime'] })
  assert.equal(TRACKED_STAKE, 1)
  assert.ok(Object.isFrozen(FLOORS) && Object.isFrozen(MIN_BAR))
  // the copy is built from the config
  assert.match(CARD_RULE_TEXT.straight, /\+120/); assert.match(CARD_RULE_TEXT.two_man, /\+500/); assert.ok(CARD_RULE_TEXT.tracked)
})

await t('the straight price floor: +119 rejected, +120 accepted, -500 rejected, no price rejected (and says which)', () => {
  assert.equal(straightVerdict('nfl', 'anytime', A('p', 'g', 90, 119)).ok, false)
  assert.equal(straightVerdict('nfl', 'anytime', A('p', 'g', 90, 120)).ok, true)
  assert.equal(straightVerdict('nfl', 'anytime', A('p', 'g', 90, 121)).ok, true)
  const gibbs = straightVerdict('nfl', 'anytime', A('p', 'g', 90, -500))
  assert.deepEqual([gibbs.ok, gibbs.code], [false, 'price']); assert.match(gibbs.reason, /-500 is under the \+120 floor/)
  const none = straightVerdict('nfl', 'anytime', A('p', 'g', 90, null))
  assert.deepEqual([none.ok, none.code], [false, 'no_price'])
  // a short price on the other anytime markets (HR, TD) is never a Card straight
  assert.equal(straightVerdict('mlb', 'anytime', A('p', 'g', 90, -150)).ok, false)
  assert.equal(straightVerdict('mlb', 'anytime', A('p', 'g', 90, 120)).ok, true)
})

await t('GOALS are exempt from the price floor (they still need a stored price); shots are not; Donovan\'s lane is exempt from everything', () => {
  assert.equal(straightVerdict('nhl', 'anytime', A('p', 'g', 90, -300)).ok, true, 'a goal at -300 is a Card straight')
  assert.equal(straightVerdict('nhl', 'anytime', A('p', 'g', 90, null)).ok, false, 'no price is still not on the Card, goals included')
  assert.equal(straightVerdict('nhl', 'sog', V('p', 'g', 90, 'sog', 2.5, 110)).ok, false, 'shots on goal at +110 is under the floor')
  assert.equal(straightVerdict('nhl', 'sog', V('p', 'g', 90, 'sog', 2.5, 120)).ok, true)
  assert.equal(laneExempt('donovan'), true); assert.equal(laneExempt('bot'), false)
  // his hand entry is never blocked: a -500 and an unpriced man go through donovanRow
  const field = [A('d1', 'g1', 90, -500), A('d2', 'g2', 80, null)]
  const made = donovanRow({ sport: 'nfl', slate_key: 'k', card_date: '2026-10-11', field, playerIds: ['d1', 'd2'], note: 'my pick', now: NOW, lockAtMs: LOCK_AT + 30 * 60e3 })
  assert.equal(made.ok, true, made.error); assert.equal(made.row.lane, 'donovan')
})

await t('the Two-Man floor: combined +499 rejected, +500 accepted; a leg with no price rejected; the arithmetic is the two prices multiplied', () => {
  assert.equal(meetsTwoManFloor(499), false); assert.equal(meetsTwoManFloor(500), true); assert.equal(meetsTwoManFloor(null), false)
  assert.equal(combinedPrice([{ median: 100 }, { median: 200 }]), 500)          // 2 x 3 = 6 -> +500
  assert.equal(combinedPrice([{ median: 100 }, { median: 199 }]), 498)          // 2 x 2.99 = 5.98
  assert.equal(twoManVerdict([{ median: 100 }, { median: 200 }]).ok, true)
  const low = twoManVerdict([{ median: 100 }, { median: 199 }])
  assert.deepEqual([low.ok, low.code, low.combined], [false, 'price', 498])
  assert.deepEqual([twoManVerdict([{ median: 300 }, null]).ok, twoManVerdict([{ median: 300 }, null]).code], [false, 'no_price'])
  // a short leg can ride a long one: -200 x +1000 = 1.5 x 11 = 16.5 -> +1550
  assert.equal(twoManVerdict([{ median: -200 }, { median: 1000 }]).ok, true)
  // the picker: the top man has no partner that clears it, so the next man is tried; same-game likewise
  const f = [A('a', 'g1', 95, -200), A('b', 'g2', 90, -150), A('c', 'g3', 80, 400)]
  const two = pickTwoManFor({ sport: 'nfl', games: 3, cands: f, now: NOW, pairOk: (x, y) => twoManVerdict([x.price, y.price]).ok })
  assert.deepEqual(two.legs.map((c) => c.player_id), ['a', 'c'], '1.5 x 5 = 7.5 -> +650 clears; a+b (+150) does not')
  const none = pickTwoManFor({ sport: 'nfl', games: 3, cands: [A('a', 'g1', 95, -200), A('b', 'g2', 90, -150)], now: NOW, pairOk: (x, y) => twoManVerdict([x.price, y.price]).ok })
  assert.equal(none, null)
  const sg = pickTwoManFor({ sport: 'nhl', games: 1, cands: [A('a', 'g1', 95, 100), A('b', 'g1', 90, 100, { team: 'T1B', opp: 'T1A' }), A('c', 'g1', 80, 250)], now: NOW, pairOk: (x, y) => twoManVerdict([x.price, y.price]).ok })
  assert.equal(sg.sameGame, true); assert.deepEqual(sg.legs.map((c) => c.player_id).sort(), ['a', 'c'], 'a+b is 4.0 (+300): short; a+c is 2 x 3.5 = +600')
})

await t('the line floors per market: receiving and rushing 100+, passing 300+, catches 7+; shots and hits have none; 99.5 is a 100+ bar, a whole 100 needs 101', () => {
  assert.equal(barOfLine(99.5), 100); assert.equal(barOfLine(100), 101); assert.equal(barOfLine(100.5), 101); assert.equal(barOfLine(null), null)
  for (const [m, ok, no] of [['rec_yds', 99.5, 98.5], ['rush_yds', 99.5, 89.5], ['pass_yds', 299.5, 249.5], ['rec', 6.5, 5.5]]) {
    assert.equal(lineClears('nfl', m, ok), true, `${m} ${ok}`); assert.equal(lineClears('nfl', m, no), false, `${m} ${no}`)
  }
  assert.equal(lineClears('nfl', 'rec_yds', 100), true)
  assert.equal(lineClears('nhl', 'sog', 0.5), true); assert.equal(lineClears('mlb', 'hit', 0.5), true, 'no floor was set for shots or hits')
  const lo = straightVerdict('nfl', 'rec_yds', V('p', 'g', 90, 'rec_yds', 52.5, 200))
  assert.deepEqual([lo.ok, lo.code], [false, 'line']); assert.match(lo.reason, /line 52\.5 \(53\+\) is under the 100\+ floor/)
  assert.equal(straightVerdict('nfl', 'rec_yds', V('p', 'g', 90, 'rec_yds', 99.5, 200)).ok, true)
  // the rung chooser: the lowest rung that clears, else the lowest published (which then fails and says so)
  const rungs = [{ line: 99.5, median: 300 }, { line: 59.5, median: -130 }, { line: 79.5, median: 110 }, { line: 119.5, median: 700 }]
  assert.equal(chooseRung(rungs, 'nfl', 'rec_yds').line, 99.5)
  assert.equal(chooseRung(rungs.slice(1, 3), 'nfl', 'rec_yds').line, 59.5)
  assert.equal(chooseRung(rungs, 'nhl', 'sog').line, 59.5, 'a market with no floor takes the lowest')
  assert.equal(chooseRung([], 'nfl', 'rec_yds'), null)
})

await t('the picker: a 52.5 receiving line is never a Card straight, a 99.5 is; the slot says why when nobody clears', () => {
  const nfl = {
    anytime: { cands: [A('t1', 'n1', 90, 200)], board: [90] },
    rec_yds: { cands: [V('r1', 'n2', 88, 'rec_yds', 52.5, 150), V('r2', 'n3', 70, 'rec_yds', 99.5, 250)], board: [88, 70] },
    rush_yds: { cands: [V('u1', 'n4', 77, 'rush_yds', 64.5, 150)], board: [77] },
  }
  const p = planStraights({ sport: 'nfl', n: 3, byMarket: nfl, now: NOW })
  assert.deepEqual(p.picks.map((x) => [x.market, x.cand.player_id]), [['anytime', 't1'], ['rec_yds', 'r2']], 'r1 (52.5) is passed over for the 99.5')
  assert.equal(p.skipped.length, 1); assert.match(p.skipped[0].reason, /none of the 1 eligible cleared the floors \(1 under the line floor\)/)
  // the pre-floor rule (what the tracking compares against) would have taken r1 and u1
  const was = planStraights({ sport: 'nfl', n: 3, byMarket: nfl, now: NOW, floors: false })
  assert.deepEqual(was.picks.map((x) => x.cand.player_id), ['t1', 'r1', 'u1'])
})

await t('-500 is never on the Card; no price is never on the Card; both are TRACKED with their reason; goals at a short price still make the Card', () => {
  const sl = plan('nfl', only([A('gibbs', 'g1', 95, -500), A('nop', 'g2', 90, null), A('ok1', 'g3', 85, 140), A('ok2', 'g4', 80, 180)]), 6)
  const ids = sl.rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].player_id)
  assert.deepEqual(ids, ['ok1'], 'the NFL ladder has only the TD slot in this test; the first man who clears is the straight')
  const tr = sl.tracked.filter((r) => r.product === 'straight')
  assert.deepEqual(tr.map((r) => [r.legs[0].player_id, r.reason_code, r.rule, r.stake]), [['gibbs', 'price', 'tracked-straight-v1', 1]])
  // the unpriced man: pick him as the only candidate
  const np = plan('nfl', only([A('nop', 'g2', 90, null)]), 6)
  assert.equal(np.rows.filter((r) => r.product === 'straight').length, 0)
  assert.equal(np.tracked[0].reason_code, 'no_price'); assert.equal(np.tracked[0].legs[0].price, undefined, 'nothing invented: a tracked pick with no price stores none')
  assert.ok(np.skipped.some((s) => /1 with no stored price/.test(s.reason)))
  // goals: -300 is on the Card
  const g = plan('nhl', only([A('goal1', 'g1', 95, -300), A('goal2', 'g2', 90, -250)]), 6)
  assert.deepEqual(g.rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].player_id), ['goal1', 'goal2'], 'both short-priced goals are Card straights (slots 1 and 3)'); assert.equal(g.tracked.filter((r) => r.product === 'straight').length, 0)
  // every Card straight row froze the price it was picked at
  for (const r of sl.rows.filter((x) => x.product === 'straight')) assert.ok(Number.isInteger(r.legs[0].price.median) && r.legs[0].price.median >= 120)
})

await t('the Two-Man at lock: the best pair that clears +500; the pre-floor pair is tracked when it fell short; no pair = no Two-Man, said plainly', () => {
  const cands = [A('a', 'g1', 95, -200), A('b', 'g2', 90, -150), A('c', 'g3', 80, 400), A('d', 'g4', 70, 150), A('e', 'g5', 60, 150), A('f', 'g6', 50, 150)]
  const s = plan('nfl', only(cands), 6)
  const two = s.rows.find((r) => r.product === 'two_man')
  assert.deepEqual(two.legs.map((l) => l.player_id), ['a', 'c']); assert.equal(two.rule, CARD_RULE.two_man)
  assert.ok(two.legs.every((l) => Number.isInteger(l.price.median)), 'both prices are frozen with the Two-Man')
  const tt = s.tracked.find((r) => r.product === 'two_man')
  assert.deepEqual(tt.legs.map((l) => l.player_id), ['a', 'b']); assert.equal(tt.reason_code, 'price'); assert.match(tt.reason, /\+150 multiplied is under the \+500 floor/)
  assert.equal(tt.stake, 1)
  const none = plan('nfl', only([A('a', 'g1', 95, -200), A('b', 'g2', 90, -150)]), 2)
  assert.equal(none.rows.filter((r) => r.product === 'two_man').length, 0)
  assert.ok(none.skipped.some((x) => x.slot === 'two-man' && /cleared the \+500 floor/.test(x.reason)))
  assert.equal(none.tracked.filter((r) => r.product === 'two_man').length, 1)
  // a pair with a leg that has no price is tracked as no_price
  const np = plan('nfl', only([A('a', 'g1', 95, 300), A('b', 'g2', 90, null)]), 2)
  assert.equal(np.rows.filter((r) => r.product === 'two_man').length, 0); assert.equal(np.tracked.find((r) => r.product === 'two_man').reason_code, 'no_price')
  // a pair that clears the floor is simply the Two-Man and is not tracked
  const good = plan('nfl', only([A('a', 'g1', 95, 300), A('b', 'g2', 90, 300)]), 2)
  assert.equal(good.rows.filter((r) => r.product === 'two_man').length, 1); assert.equal(good.tracked.filter((r) => r.product === 'two_man').length, 0)
})

await t('tracked returns arithmetic, per ONE unit: +150 win = +1.5u, -200 win = +0.5u, a loss = -1u, void / push / ungraded return nothing', () => {
  assert.equal(trackedUnits('hit', 150), 1.5); assert.equal(trackedUnits('hit', -200), 0.5)
  assert.equal(trackedUnits('miss', 150), -1); assert.equal(trackedUnits('miss', -200), -1)
  assert.equal(trackedUnits('void', 150), null); assert.equal(trackedUnits('push', 150), null); assert.equal(trackedUnits(null, 150), null); assert.equal(trackedUnits('hit', null), null)
  assert.equal(trackedUnits('hit', -500), 0.2); assert.equal(trackedUnits('hit', 100), 1)
  const row = (result, med, extra = {}) => ({ product: 'straight', stake: 1, result, legs: [{ status: 'called', ...(med == null ? {} : { price: { median: med, best: med } }) }], ...extra })
  const rec = trackedRecordsOf([row('hit', 150), row('hit', -200), row('miss', 300), row('miss', -500), row('hit', null), row('void', 200), row(null, 200)]).straight
  assert.deepEqual([rec.graded, rec.hits, rec.misses, rec.voids, rec.pending], [5, 3, 2, 1, 1])
  assert.equal(rec.priced, 4); assert.equal(rec.units.median, 1.5 + 0.5 - 1 - 1, 'the unpriced win is graded but carries no units')
  const words = trackedWords(rec, { product: 'straight' }).join(' ')
  assert.match(words, /3 of 5 straights hit \(60%, 95% range \d+–\d+%\)/); assert.match(words, /One unit each on 4 priced: \+0\.0 units|One unit each on 4 priced: [+−]0\.0 units/)
  assert.match(words, /1 had no stored price/)
  // a Two-Man is its two prices multiplied: +100 and +200 -> +500; a win returns 5 units on one
  const tm = trackedRecordsOf([{ product: 'two_man', stake: 1, result: 'hit', legs: [{ price: { median: 100, best: 100 } }, { price: { median: 200, best: 200 } }] }]).two_man
  assert.equal(tm.units.median, 5)
  // honest words: no chance printed, no banned word, same dignity for wins and misses
  assert.ok(cleanPublic(words)); assert.ok(!/\block|\bdue\b|guarantee|\bchance\b|probab/i.test(words), words)
})

await t('LOCKED ROWS ARE NEVER TOUCHED: a second pass (new prices, new floors) rewrites nothing; an old pre-floor row stays as it was; tracked rows are insert-once and graded once', async () => {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  const win = { card_date: '2026-10-11', slate_key: 'k', first_start_ms: NOW + 1 * H, games: 6 }
  // a row locked BEFORE the floors (no price on the leg, the old rule id) is already in the table
  const oldRow = { sport: 'nfl', card_date: '2026-10-11', slate_key: 'k', lane: 'bot', product: 'straight', slot: 1, market: null, model_version: CARD_VERSION, rule: 'straight-slots-v2', stake: 1, legs: [{ player_id: 'old', name: 'Player old', game_id: 'g9', game_date: '2026-10-11', start_at: new Date(NOW + 2 * H).toISOString() }], leg_count: 1, note: null, start_at: new Date(NOW + 2 * H).toISOString(), locks_at: new Date(LOCK_AT).toISOString(), window_games: 6 }
  await db.from('card_calls').upsert([oldRow], { onConflict: 'x', ignoreDuplicates: false })
  const before = JSON.stringify(db.rows)
  const cands = [A('gibbs', 'g1', 95, -500), A('ok1', 'g2', 85, 140), A('ok2', 'g3', 84, 150), A('ok3', 'g4', 83, 160), A('ok4', 'g5', 82, 170), A('ok5', 'g6', 81, 180)]
  const inputs = { ok: true, byMarket: only(cands), games: 6 }
  const res = await lockCard(db, 'nfl', win, inputs, { now: NOW })
  assert.match(res, /^locked 1 straight\(s\) of 6 game\(s\)/); assert.match(res, /tracked 2 not on the card \(price, price\)/)
  assert.equal(JSON.stringify(db.rows.find((r) => r.legs[0].player_id === 'old')), JSON.stringify(JSON.parse(before)[0]), 'the pre-floor row is byte-identical')
  assert.equal(db.trackedRows.length, 2, 'the -500 straight and the pre-floor Two-Man'); assert.equal(db.trackedRows[0].legs[0].player_id, 'gibbs')
  assert.equal(db.rows.some((r) => r.legs.some((l) => l.player_id === 'gibbs')), false, 'a tracked pick is not in card_calls')
  const snapC = JSON.stringify(db.rows); const snapT = JSON.stringify(db.trackedRows)
  clock.now = NOW + 20 * 60e3
  // a second pass with different prices (gibbs now +300) changes nothing already stored
  await lockCard(db, 'nfl', win, { ...inputs, byMarket: only([A('gibbs', 'g1', 95, 300), ...cands.slice(1)]) }, { now: clock.now })
  assert.equal(JSON.stringify(db.rows), snapC); assert.equal(JSON.stringify(db.trackedRows), snapT, 'the tracked row is insert-once')
  // the table refuses a rewrite of a locked tracked column and a regrade
  const edit = await db.from(TRACKED_TABLE).update({ legs: [] }).eq('id', db.trackedRows[0].id)
  assert.match(edit.error?.message || '', /never rewritten/); assert.equal(JSON.stringify(db.trackedRows), snapT)
  // graded by the existing grader, once, after the start
  clock.now = NOW + 3 * H
  const words = { hit: { played: true, landed: true, values: {} }, miss: { played: true, landed: false, values: {} } }
  const open = db.trackedRows.filter((r) => r.result == null)
  const results = new Map([[`${open[0].legs[0].game_id}|${open[0].legs[0].player_id}`, words.hit]])
  assert.equal(await gradeCardRows(db, open, results, clock.now, TRACKED_TABLE), 1)
  assert.equal(db.trackedRows[0].result, 'hit'); assert.equal(db.trackedRows[0].leg_results[0].result, 'hit')
  const again = new Map([[`${open[0].legs[0].game_id}|${open[0].legs[0].player_id}`, words.miss]])
  assert.equal(await gradeCardRows(db, db.trackedRows, again, clock.now, TRACKED_TABLE), 0, 'a graded tracked row is never regraded')
  assert.equal(db.trackedRows[0].result, 'hit')
  // its return at the stored price: gibbs at -500 hit = +0.2u
  const rec = trackedRecordsOf(db.trackedRows).straight
  assert.deepEqual([rec.graded, rec.hits, rec.units.median], [1, 1, 0.2])
})

await t('the tracked table missing (the migration not run yet) is silent: the Card still locks and nothing throws', async () => {
  const db = fakeDb({ now: NOW })
  const real = db.from
  db.from = (n) => (n === TRACKED_TABLE ? { upsert: () => Promise.resolve({ error: { code: '42P01', message: 'relation "card_tracked" does not exist' } }), select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'does not exist' } }) }) }) }) } : real(n))
  const win = { card_date: '2026-10-11', slate_key: 'k', first_start_ms: NOW + 1 * H, games: 6 }
  const res = await lockCard(db, 'nfl', win, { ok: true, byMarket: only([A('gibbs', 'g1', 95, -500), A('ok1', 'g2', 85, 140)]), games: 6 }, { now: NOW })
  assert.match(res, /^locked 1 straight/); assert.ok(!/tracked/.test(res)); assert.equal(db.rows.length >= 1, true)
  assert.equal(await trackedFor(db, 'nfl'), null)
})

await t('loadLines picks the lowest rung that clears the floor when several are stored; one stored line is used as it is (today\'s shape)', async () => {
  const rows = [
    { our_player_id: 'x', line: 99.5, odds: 300, best_odds: 320, books: 4, taken_at: '2026-10-11T17:00:00Z', snap: 'lock' },
    { our_player_id: 'x', line: 59.5, odds: -130, best_odds: -120, books: 6, taken_at: '2026-10-11T17:00:00Z', snap: 'lock' },
    { our_player_id: 'x', line: 40.5, odds: -200, best_odds: -190, books: 6, taken_at: '2026-10-11T12:00:00Z', snap: 'lock' },
    { our_player_id: 'y', line: 61.5, odds: -115, best_odds: -110, books: 6, taken_at: '2026-10-11T17:00:00Z', snap: 'lock' },
  ]
  const q = { eq: () => q, in: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: rows, error: null }) }
  const db = { from: () => ({ select: () => q }) }
  const m = await loadLines(db, 'nfl', { ids: ['x', 'y'], dates: ['2026-10-11'], lineMarket: 'rec_yds', now: NOW, marketKey: 'rec_yds' })
  assert.equal(m.get('x').line, 99.5, 'the 100+ rung, from the newest snapshot only'); assert.equal(m.get('x').median, 300)
  assert.equal(m.get('y').line, 61.5, 'only one line stored: it is used, and then fails the floor in the picker')
})

await t('one config source: no other file in lib/card (or the page) hard-codes a floor number; the migration and its run-in .txt are the same SQL', () => {
  for (const f of fs.readdirSync('lib/card').filter((x) => x.endsWith('.js') && x !== 'rules.js')) {
    const code = fs.readFileSync(`lib/card/${f}`, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    assert.ok(!/\b120\b/.test(code.replace(/PLUS_MONEY|min: 160/g, '')), `${f}: a hard-coded 120`)
    assert.ok(!/>=\s*500\b/.test(code), `${f}: a hard-coded 500 floor`)
    assert.ok(!/\b(?:rec_yds|rush_yds)\b[^\n]*\b100\b/.test(code), `${f}: a hard-coded line floor`)
  }
  const sql = fs.readFileSync('supabase/migrations/202610111200_card_tracked.sql', 'utf8')
  assert.match(sql, /create table if not exists public\.card_tracked/); assert.match(sql, /card_tracked_guard/); assert.match(sql, /enable row level security/)
  const run = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/CARD-RULES/card_tracked_SQL.txt'
  if (fs.existsSync(run)) assert.equal(fs.readFileSync(run, 'utf8').trim(), sql.trim(), 'the run-in file is the migration, byte for byte')
})

await t('rule ids moved on (v3 / v2) without touching the model_version; a same-game Two-Man of either generation is still one', () => {
  assert.equal(CARD_VERSION, 'card-v2')
  assert.equal(CARD_RULE.straight, 'straight-slots-v3-floors'); assert.equal(isSameGameRule('two-man-same-game-v1'), true); assert.equal(isSameGameRule('two-man-same-game-v2'), true); assert.equal(isSameGameRule(CARD_RULE.two_man), false)
})

await t('football anytime TD: a straight comes from the top 30 of the board (2026-10-13); the flat +120 floor stays; other sports have no cap', () => {
  // TEST DATA: 40 invented players, scores 100..61; 'deep' is board rank 36, 'top' is rank 2
  const board = Array.from({ length: 40 }, (_, i) => 100 - i)
  const mk = (id, g, score) => ({ player_id: id, game_id: g, score, status: 'called', start_ms: NOW + 1e6, price: { median: 300 } })
  const run = (sport, cands) => planStraights({ sport, n: 1, now: NOW, byMarket: { anytime: { cands, board } } })
  assert.deepEqual(run('nfl', [mk('deep', 'g1', 65)]).picks, [])
  assert.match(run('nfl', [mk('deep', 'g1', 65)]).skipped[0].reason, /board-rank cap/)
  assert.equal(run('nfl', [mk('deep', 'g1', 65), mk('top', 'g2', 99)]).picks[0].cand.player_id, 'top')
  assert.equal(run('nhl', [mk('deep', 'g1', 65)]).picks[0].cand.player_id, 'deep', 'no cap outside football')
  assert.equal(straightVerdict('nfl', 'anytime', { ...mk('x', 'g', 80), board_rank: 30 }).ok, true)
  assert.equal(straightVerdict('nfl', 'anytime', { ...mk('x', 'g', 80), board_rank: 31 }).code, 'rank')
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
