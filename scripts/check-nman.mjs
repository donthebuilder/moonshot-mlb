#!/usr/bin/env node
// HIS N-MAN (3 to 6 hand-picked players, all must land; 2026-10-12, "i want to be able to do up a 6 man with a card too"). Every input is TEST data
// (made-up players p1.., clubs, prices); nothing real.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nman.mjs
// Covers: the classification (3..6 = n_man, no one twice, two stays the Two-Man, the stake 0.25..1), the combined price math, the grading
// (all hit / one miss / a void / still waiting), ON TIME / LOCK AT SAVE / LATE through the table, a LATE row never public, the pre-migration refusal (nothing
// stored, the 2-leg Two-Man untouched), the post text and the post itself (names whole or not at all, one claim a day, no link / lock / guaranteed),
// the Two-Man's rows byte for byte, the migration (the n_man branches, idempotent, the .txt is the SQL).
import './_no-injury-net.mjs'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  CARD_VERSION, CARD_RULE, STAKE, NMAN_MIN, NMAN_MAX, NMAN_UNITS, cleanUnits, lockAtOf, donovanRow, LATE_LANE, adminNMan, twoManTitle, cardNameOf,
  legWord, productResult, gradeCardRow, rowPrice, recordOf, recordsOf, recordWords, decimalOf, americanOfDecimal,
} from '../lib/card/core.js'
import { comboOf } from '../lib/card/picker.js'
import { nManXText, resultText, cleanPublic } from '../lib/card/text.js'
import { saveDonovan, withdrawDonovan, gradeCardRows, cardRows, recordRows, dayRows, readCard, donovanEntry, lateEntries, NMAN_NEEDS_SQL } from '../lib/card/store.js'
import { nManBuild, postDonovanNMan, postCardX, CARD_KIND } from '../lib/card/post.js'
import { loadNManModel, nManSerialOf } from '../lib/cards/nManData.js'
import { fakeDb } from './_card-fakedb.mjs'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-10T20:00:00Z')
Date.now = () => NOW
const C = (id, game, startH, score, rate = 0.3, extra = {}) => ({ player_id: id, name: `Player ${id}`, team: `T${game}A`, opp: `T${game}B`, game_id: game, game_date: '2026-10-10', start_ms: NOW + startH * H, score, rate, why: `why ${id}`, price: { median: 150, best: 170, books: 5, taken_at: '2026-10-10T19:00:00Z' }, ...extra })
// TEST candidates: eight players in five games, the last one with no stored price
const FIELD = [C('p1', 'g1', 2, 90, 0.40), C('p2', 'g1', 2, 88, 0.35), C('p3', 'g2', 3, 85, 0.30), C('p4', 'g3', 4, 80, 0.25, { status: 'called' }), C('p5', 'g3', 4, 70, 0.20, { status: 'board' }), C('p6', 'g4', 1, 95, 0.10), C('p7', 'g5', 5, 60, 0.2), C('p8', 'g5', 5, 55, 0.2, { price: undefined })]
const LOCK_AT = lockAtOf(NOW + 1 * H)
const NOTE = 'Six on the top lines tonight.'
const SIX = ['p1', 'p3', 'p4', 'p5', 'p7', 'p8']
const BASE = { sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: FIELD, note: NOTE, now: NOW - 30 * 60e3, lockAtMs: LOCK_AT, allowLate: true }
const NM = (o = {}) => donovanRow({ ...BASE, product: 'n_man', playerIds: SIX, ...o })

// ── 1. CLASSIFICATION ─────────────────────────────────────────────────────────
await t('CLASSIFY: 2 to 6 distinct players on tonight\'s board = an n_man row (leg_count = the legs, slot 1, 0.5 unit, its own rule; 2 legs on the N-man tab is "ADMIN\'S 2-MAN", still product n_man, never the Two-Man); 1, 7, a repeat, a stranger, a bad product are refused', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const r = NM({ playerIds: SIX.slice(0, n) })
    assert.equal(r.ok, true, `${n} legs`)
    assert.equal(r.row.product, 'n_man'); assert.equal(r.row.leg_count, n); assert.equal(r.row.legs.length, n); assert.equal(r.row.slot, 1)
    assert.equal(r.row.lane, 'donovan'); assert.equal(r.row.rule, CARD_RULE.donovan_n_man); assert.equal(r.row.stake, 0.5); assert.equal(r.row.stake, STAKE.n_man)
    assert.equal(r.late, false); assert.equal(r.lockAtSave, false)
    assert.equal(new Date(r.row.locks_at).getTime(), LOCK_AT, 'frozen at the card\'s lock')
    assert.equal(r.row.start_at, new Date(Math.min(...r.row.legs.map((l) => Date.parse(l.start_at)))).toISOString(), 'start = the earliest leg\'s start')
  }
  assert.equal(NMAN_MIN, 2); assert.equal(NMAN_MAX, 6)
  const two = NM({ playerIds: ['p1', 'p3'] })      // 2026-10-12 ("2 yes"): two players on the N-man tab are a 2-leg n_man, a distinct product from the Two-Man
  assert.equal(two.ok, true); assert.equal(two.row.product, 'n_man'); assert.equal(two.row.leg_count, 2); assert.equal(twoManTitle(two.row), "ADMIN'S 2-MAN"); assert.notEqual(twoManTitle(two.row), twoManTitle(donovanRow({ ...BASE, playerIds: ['p1', 'p3'] }).row))
  assert.equal(donovanRow({ ...BASE, playerIds: ['p1', 'p3'] }).row.product, 'two_man', 'the Two-Man tab still saves a two_man')
  assert.match(NM({ playerIds: ['p1'] }).error, /2 to 6/)
  assert.equal(NM({ playerIds: ['p1'] }).ok, false)
  assert.equal(NM({ playerIds: [...SIX, 'p2'] }).ok, false, 'seven')
  assert.equal(NM({ playerIds: ['p1', 'p3', 'p1'] }).ok, false, 'never the same player twice'); assert.match(NM({ playerIds: ['p1', 'p3', 'p1'] }).error, /twice/)
  assert.equal(NM({ playerIds: ['p1', 'p3', 'zz'] }).ok, false, 'a man not on the board'); assert.match(NM({ playerIds: ['p1', 'p3', 'zz'] }).error, /board/)
  assert.equal(NM({ playerIds: ['p1', 'p3', ''] }).ok, false)
  assert.equal(donovanRow({ ...BASE, product: 'straight', playerIds: SIX }).ok, false, 'no other product')
  // a three-player call as a Two-Man is still refused with the Two-Man\'s own words
  const two3 = donovanRow({ ...BASE, playerIds: ['p1', 'p3', 'p4'] })
  assert.equal(two3.ok, false); assert.equal(two3.error, 'Pick two players.')
  // a leg with no stored price is still a leg: his lane is exempt from the floors
  assert.equal(NM({ playerIds: ['p1', 'p3', 'p8'] }).ok, true)
  // each leg keeps the sport's own board word (a man who is not on the board is "off", never CALLED)
  const r = NM({ playerIds: ['p1', 'p4', 'p5'] }).row
  assert.deepEqual(r.legs.map((l) => l.status), ['off', 'called', 'board'])
})

await t('CLASSIFY: the stake is 0.5 by default; 0.25 to 1 in steps of 0.05 when he sets one; anything else is refused; a Two-Man\'s stake is never touched by `units`', () => {
  assert.equal(NM().row.stake, 0.5)
  for (const u of [0.25, 0.3, 0.5, 0.75, 1, '1', '0.25']) assert.equal(NM({ units: u }).row.stake, Number(u))
  for (const u of [0.2, 1.05, 0.33, 2, -1, 'abc']) assert.equal(NM({ units: u }).ok, false, `units ${u}`)
  assert.equal(cleanUnits(''), 0.5); assert.equal(cleanUnits(null), 0.5); assert.equal(NMAN_UNITS.min, 0.25); assert.equal(NMAN_UNITS.max, 1)
  assert.equal(donovanRow({ ...BASE, playerIds: ['p1', 'p3'], units: 1 }).row.stake, 0.5, 'a Two-Man ignores `units`')
})

await t('CLASSIFY: the title is ADMIN\'S <n>-MAN by the legs\' count, or the name he gave the card (28 characters, the same sanitiser as the note); LATE keeps both', () => {
  for (const n of [3, 4, 5, 6]) assert.equal(twoManTitle(NM({ playerIds: SIX.slice(0, n) }).row), `ADMIN'S ${n}-MAN`)
  assert.equal(adminNMan(6), "ADMIN'S 6-MAN")
  const named = NM({ cardName: 'Friday Heaters' }).row
  assert.equal(cardNameOf(named), 'Friday Heaters'); assert.equal(twoManTitle(named), 'Friday Heaters')
  assert.equal(NM({ cardName: 'x'.repeat(29) }).ok, false)
  assert.equal(NM({ cardName: 'see dash.com' }).ok, false, 'a link in the name is refused')
  assert.equal(NM({ cardName: 'Locked in' }).ok, false, 'the word lock is refused')
  assert.equal(NM({ note: 'a guaranteed winner' }).ok, false)
  assert.equal(NM({ note: '' }).ok, false, 'a note is required')
  assert.equal(NM({ now: NOW + 90 * 60e3, playerIds: ['p6', 'p3', 'p4'] }).row.rule, CARD_RULE.donovan_late)
})

// ── 2. THE COMBINED PRICE ─────────────────────────────────────────────────────
await t('COMBINED PRICE: each leg\'s BEST stored price multiplied (the same product rowPrice stores); a leg with no price = "not all priced", never a shorter ticket\'s price', () => {
  const p = (best, median = best) => ({ best, median })
  const six = comboOf(Array(6).fill(p(170)))
  const dec = 2.7 ** 6
  assert.equal(six.all, true); assert.equal(six.n, 6); assert.equal(six.priced, 6); assert.equal(six.best, Math.round((dec - 1) * 100))
  assert.equal(comboOf([p(150), p(200), p(300)]).best, americanOfDecimal(2.5 * 3 * 4))      // +150 +200 +300 -> 2.5 x 3 x 4 = 30.0 -> +2900
  assert.equal(comboOf([p(150), p(200), p(300)]).best, 2900)
  const part = comboOf([p(170), null, p(170), undefined])
  assert.equal(part.all, false); assert.equal(part.best, null); assert.equal(part.priced, 2); assert.equal(part.n, 4)
  assert.equal(comboOf([]).all, false); assert.equal(comboOf(null).best, null)
  assert.equal(comboOf([{ median: 150 }, { median: 150 }]).best, 525, 'a leg with only a median uses it')
  // minus-money legs multiply too
  assert.equal(comboOf([p(-200), p(-200)]).best, americanOfDecimal(1.5 * 1.5))
  // the stored row's price is the same number
  const row = NM({ playerIds: ['p1', 'p3', 'p4'] }).row
  const stored = rowPrice(row, row.legs.map((l) => ({ best: l.price.best, median: l.price.median })))
  assert.equal(stored.best, comboOf(row.legs.map((l) => l.price)).best)
  assert.equal(stored.median, americanOfDecimal(2.5 ** 3))
  // the picker gives the form {median,best,books}; null when the man has none
  assert.equal(comboOf([{ median: 150, best: 170, books: 5 }, null, { median: 150, best: 170, books: 5 }]).all, false)
})

// ── 3. GRADING ────────────────────────────────────────────────────────────────
await t('GRADING: ALL legs must hit; one miss = miss; any void = void (never a loss); nothing until EVERY leg is known (a miss waits for the rest); a graded row is written once', async () => {
  const H6 = Array(6).fill('hit')
  assert.equal(productResult('n_man', H6), 'hit')
  assert.equal(productResult('n_man', ['hit', 'hit', 'miss', 'hit', 'hit', 'hit']), 'miss')
  assert.equal(productResult('n_man', ['miss', 'miss', 'miss']), 'miss')
  assert.equal(productResult('n_man', ['hit', 'void', 'hit']), 'void')
  assert.equal(productResult('n_man', ['miss', 'void', 'hit']), 'void', 'a void beats a miss: the ticket did not lose')
  assert.equal(productResult('n_man', ['hit', 'hit', null]), null, 'a leg not final yet')
  assert.equal(productResult('n_man', ['miss', null, 'hit']), null, 'a miss waits for the others, exactly as the Two-Man')
  assert.equal(productResult('n_man', ['hit', 'hit', 'push']), null, 'the Two-Man\'s rule: a push is not a final word for an anytime ticket')
  assert.equal(productResult('n_man', []), null); assert.equal(productResult('n_man', ['hit']), null)
  assert.equal(productResult('two_man', ['hit', 'hit']), 'hit', 'the Two-Man grader is unchanged')
  const g = gradeCardRow({ product: 'n_man', legs: NM().row.legs }, H6)
  assert.equal(g.result, 'hit'); assert.equal(g.leg_results.length, 6); assert.deepEqual(g.leg_results.map((x) => x.player_id), SIX)
  // through the table: graded once, from the box scores
  const clock = { now: LOCK_AT - 60e3 }
  const db = fakeDb(clock)
  const mk = NM({ now: clock.now })
  assert.equal((await saveDonovan(db, mk.row)).ok, true)
  clock.now = NOW + 6 * H
  const results = new Map(); const row = db.rows[0]
  for (const l of row.legs) results.set(`${l.game_id}|${l.player_id}`, { played: true, landed: l.player_id !== 'p5' })
  assert.equal(await gradeCardRows(db, [row], results, clock.now), 1)
  assert.equal(db.rows[0].result, 'miss'); assert.equal(db.rows[0].leg_results.length, 6)
  assert.equal(await gradeCardRows(db, [{ ...db.rows[0], result: null }], new Map([...results].map(([k, v]) => [k, { ...v, landed: true }])), clock.now), 0, 'a graded row is never regraded')
  assert.equal(db.rows[0].result, 'miss')
  // a player who did not play voids it
  const db2 = fakeDb({ now: NOW + 6 * H })
  const clock2 = { now: LOCK_AT - 60e3 }
  const dbv = fakeDb(clock2); await saveDonovan(dbv, NM({ now: clock2.now }).row); clock2.now = NOW + 6 * H
  const rv = new Map(); for (const l of dbv.rows[0].legs) rv.set(`${l.game_id}|${l.player_id}`, { played: l.player_id !== 'p3', landed: false })
  await gradeCardRows(dbv, [dbv.rows[0]], rv, clock2.now); assert.equal(dbv.rows[0].result, 'void')
  void db2
})

await t('RECORD: his N-man has its own record line (donovan_n_man), never mixed into his Two-Man\'s or the bot\'s; the words say every leg', () => {
  const rows = [
    { lane: 'donovan', product: 'n_man', result: 'hit', legs: [{}, {}, {}], stake: 0.5 }, { lane: 'donovan', product: 'n_man', result: 'miss', legs: [{}, {}, {}], stake: 0.5 },
    { lane: 'donovan', product: 'n_man', result: 'void', legs: [{}, {}, {}], stake: 0.5 }, { lane: 'donovan', product: 'two_man', result: 'hit', legs: [{}, {}], stake: 0.5 }, { lane: 'bot', product: 'two_man', result: 'miss', legs: [{}, {}], stake: 0.5 },
  ]
  const rec = recordsOf(rows)
  assert.equal(rec.donovan_n_man.graded, 2); assert.equal(rec.donovan_n_man.hits, 1); assert.equal(rec.donovan_n_man.voids, 1)
  assert.equal(rec.donovan.graded, 1); assert.equal(rec.two_man.graded, 1)
  const w = recordWords(rec.donovan_n_man, { product: 'n_man', who: "Admin's N-man: " })
  assert.match(w[0], /1 of 2 tickets landed every leg/); assert.ok(!/both legs/.test(w[0]))
  assert.match(recordWords(rec.donovan, { product: 'two_man' })[0], /landed both legs/)
})

// ── 4. ON TIME / LOCK AT SAVE / LATE THROUGH THE TABLE ────────────────────────
await t('ON TIME / LOCK AT SAVE / LATE: before the lock = verified, frozen at the lock; after the lock but before any start = verified and LOCKS AT SAVE; a started leg = the LATE lane for the WHOLE entry', async () => {
  const onTime = NM({ now: LOCK_AT - 60e3 })
  assert.equal(onTime.late, false); assert.equal(onTime.lockAtSave, false); assert.equal(onTime.row.lane, 'donovan')
  const afterLock = NM({ now: LOCK_AT + 60e3 })       // p6 starts at +1h = NOW+1h; the lock is NOW; p6 not in SIX; SIX starts at +2h..5h
  assert.equal(afterLock.late, false); assert.equal(afterLock.lockAtSave, true); assert.equal(afterLock.row.lane, 'donovan')
  assert.equal(afterLock.row.locks_at, new Date(LOCK_AT + 60e3).toISOString(), 'locks at the moment of the save')
  // a game of his has started (p1 at +2h): the whole entry is LATE, though four of the six have not started
  const late = NM({ now: NOW + 2.5 * H })
  assert.equal(late.ok, true); assert.equal(late.late, true); assert.equal(late.row.lane, LATE_LANE); assert.match(late.lateWhy, /started/)
  assert.equal(late.row.rule, CARD_RULE.donovan_late)
  // the same call without allowLate refuses (the Two-Man\'s own old behaviour)
  assert.equal(NM({ now: NOW + 2.5 * H, allowLate: false }).ok, false)
  // through the table
  const clock = { now: LOCK_AT - 60e3 }
  const db = fakeDb(clock)
  assert.equal((await saveDonovan(db, onTime.row)).ok, true)
  // still open: replace with another stake and other men (the stake is part of the key, so it is a withdraw + insert)
  const swap = NM({ now: clock.now, playerIds: ['p1', 'p3', 'p4'], units: 0.75, note: 'Swapped.' })
  assert.equal((await saveDonovan(db, swap.row)).ok, true)
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].stake, 0.75); assert.equal(db.rows[0].leg_count, 3); assert.equal(db.rows[0].note, 'Swapped.')
  // after the lock: LOCK AT SAVE for a day with no entry yet
  const db2 = fakeDb({ now: LOCK_AT + 60e3 })
  const r2 = await saveDonovan(db2, afterLock.row, { lockAtSave: true })
  assert.equal(r2.ok, true); assert.equal(db2.rows[0].lane, 'donovan'); assert.equal(db2.rows[0].locks_at, new Date(LOCK_AT + 60e3).toISOString())
  // frozen at once: it cannot be replaced (not even with another stake) or withdrawn; nothing is overwritten
  db2.rows[0].locks_at = new Date(LOCK_AT + 60e3).toISOString()
  const clk2 = { now: LOCK_AT + 5 * 60e3 }
  const dbL = fakeDb(clk2); await saveDonovan(dbL, afterLock.row, { lockAtSave: true }); clk2.now += 60e3
  const again = await saveDonovan(dbL, NM({ now: clk2.now, playerIds: ['p1', 'p3', 'p4'], units: 1, note: 'Swap.' }).row)
  assert.equal(again.ok, false); assert.equal(dbL.rows.length, 1); assert.equal(dbL.rows[0].note, NOTE); assert.equal(dbL.rows[0].stake, 0.5); assert.equal(dbL.rows[0].leg_count, 6)
  assert.equal((await withdrawDonovan(dbL, { sport: 'nhl', card_date: '2026-10-10', product: 'n_man' })).ok, false)
  // refused at or after the start (a verified-shaped row presented late)
  const dbS = fakeDb({ now: NOW + 3 * H + 1 })
  const bad = await saveDonovan(dbS, onTime.row); assert.equal(bad.ok, false); assert.match(bad.error, /nothing is locked at or after the start/)
  // the LATE lane: saved any time, apart from the verified entry, which it never touches; changes inside 15 minutes only
  const clk3 = { now: NOW + 2.5 * H }
  const db3 = fakeDb(clk3)
  assert.equal((await saveDonovan(db3, onTime.row)).ok, false, 'a verified row after its start is refused')
  assert.equal((await saveDonovan(db3, late.row)).ok, true); assert.equal(db3.rows[0].lane, LATE_LANE)
  assert.equal((await saveDonovan(db3, NM({ now: clk3.now, playerIds: ['p1', 'p3', 'p4'], note: 'Typo fixed.' }).row)).ok, true, 'inside the typo window')
  assert.equal(db3.rows.length, 1); assert.equal(db3.rows[0].note, 'Typo fixed.')
  clk3.now += 16 * 60e3
  assert.equal((await saveDonovan(db3, NM({ now: clk3.now, note: 'Too late.' }).row)).ok, false, 'frozen after 15 minutes')
})

await t('A LATE n_man is in NO count, read, day, post or image (the public views read lane "bot" and "donovan" by name); his verified Two-Man beside it is untouched', async () => {
  const clock = { now: NOW + 2.5 * H }
  const db = fakeDb(clock)
  const late = NM({ now: clock.now })
  assert.equal((await saveDonovan(db, late.row)).ok, true)
  const two = donovanRow({ ...BASE, playerIds: ['p6', 'p3'], now: NOW - 30 * 60e3 })     // an on-time Two-Man for the same day, saved earlier (p6 starts at +1h)
  clock.now = NOW - 30 * 60e3; const db4 = fakeDb(clock); assert.equal((await saveDonovan(db4, two.row)).ok, true)
  clock.now = NOW + 2.5 * H
  assert.equal(db.rows.length, 1)
  assert.equal((await cardRows(db, 'nhl', '2026-10-10', { now: clock.now })).length, 0, 'not in the card rows')
  assert.equal((await readCard(db, 'nhl', '2026-10-10', { now: clock.now, audience: 'members' })).rows.length, 0)
  assert.equal((await recordRows(db, 'nhl', { now: clock.now })).length, 0, 'not in the record rows')
  assert.equal((await dayRows(db, '2026-10-10', { now: clock.now })).length, 0, 'not in THE DAY')
  const le = await lateEntries(db, { sport: 'nhl', product: 'n_man' }); assert.equal(le.rows.length, 1, 'it is on his own admin list')
  assert.equal((await lateEntries(db, { sport: 'nhl' })).rows.length, 0, 'and not on the Two-Man\'s list')
  assert.ok(await donovanEntry(db, 'nhl', '2026-10-10', 'n_man', CARD_VERSION, LATE_LANE))
  assert.equal(await donovanEntry(db, 'nhl', '2026-10-10', 'n_man'), null, 'there is no verified entry')
  const model = await loadNManModel({ sport: 'nhl', date: '2026-10-10', db, now: clock.now })
  assert.equal(model.ok, false); assert.equal(model.status, 404, 'the card route answers 404 for a day with only a LATE n_man')
  // an OPEN verified entry (before its lock) is not readable either, so its card is a 404 too
  const clk = { now: LOCK_AT - 60e3 }; const dbo = fakeDb(clk); await saveDonovan(dbo, NM({ now: clk.now }).row)
  assert.equal((await loadNManModel({ sport: 'nhl', date: '2026-10-10', db: dbo, now: clk.now })).status, 404, 'before its lock the card does not exist for the public')
  // his post never takes a LATE row
  assert.equal(await postDonovanNMan({}, { sport: 'nhl', day: '2026-10-10', rows: [{ ...late.row, lane: LATE_LANE }], now: NOW }), 'no-entry')
})

await t('BEFORE THE MIGRATION: an n_man save is refused with a clear message and NOTHING is stored (on time or after the lock); the 2-leg Two-Man works exactly as today', async () => {
  const clock = { now: LOCK_AT - 60e3 }
  const db = fakeDb(clock, { nman: false })
  const r = await saveDonovan(db, NM({ now: clock.now }).row)
  assert.equal(r.ok, false); assert.equal(r.needsSql, true); assert.ok(r.error.startsWith(NMAN_NEEDS_SQL)); assert.match(r.error, /202610121200_card_calls_nman\.sql/); assert.match(r.error, /Nothing was saved/)
  assert.equal(db.rows.length, 0)
  const clk2 = { now: LOCK_AT + 60e3 }
  const db2 = fakeDb(clk2, { nman: false })
  const mk = NM({ now: clk2.now })
  const r2 = await saveDonovan(db2, mk.row, { lockAtSave: mk.lockAtSave })
  assert.equal(r2.ok, false); assert.equal(r2.needsSql, true); assert.equal(db2.rows.length, 0)
  const clk3 = { now: NOW + 2.5 * H }
  const db3 = fakeDb(clk3, { nman: false })
  const r3 = await saveDonovan(db3, NM({ now: clk3.now }).row); assert.equal(r3.ok, false); assert.equal(r3.needsSql, true); assert.equal(db3.rows.length, 0)
  // the Two-Man on the same (old) table: saved, replaced, locked at save, LATE: unchanged
  const clk4 = { now: LOCK_AT - 60e3 }
  const db4 = fakeDb(clk4, { nman: false })
  const two = donovanRow({ ...BASE, playerIds: ['p3', 'p5'], now: clk4.now })
  assert.equal((await saveDonovan(db4, two.row)).ok, true); assert.equal(db4.rows[0].product, 'two_man'); assert.equal(db4.rows[0].leg_count, 2)
  clk4.now = LOCK_AT + 60e3
  const db5 = fakeDb(clk4, { nman: false }); const two5 = donovanRow({ ...BASE, playerIds: ['p3', 'p5'], now: clk4.now })
  assert.equal((await saveDonovan(db5, two5.row, { lockAtSave: two5.lockAtSave })).ok, true, 'the Two-Man lock-at-save needs only the 10-12 late migration')
})

// ── 5. THE TWO-MAN\'S ROWS, BYTE FOR BYTE ─────────────────────────────────────
await t('BYTE-IDENTICAL: a Two-Man row built now equals the one the previous code built (golden JSON from commit e33f252), for every case; a 3-leg call as a Two-Man is still "Pick two players."', () => {
  const GOLD = '{"ok":true,"late":false,"lockAtSave":false,"lateWhy":null,"row":{"sport":"nhl","card_date":"2026-10-10","slate_key":"k","lane":"donovan","model_version":"card-v2","locks_at":"2026-10-10T20:00:00.000Z","product":"two_man","slot":1,"rule":"donovan-hand-picked-v1","stake":0.5,"legs":[{"player_id":"p3","name":"Player p3","team":"Tg2A","opp":"Tg2B","pos":null,"game_id":"g2","game_date":"2026-10-10","start_at":"2026-10-10T23:00:00.000Z","score":85,"rate":0.3,"role":null,"why":"why p3","status":"off","price":{"median":150,"best":170,"books":5,"taken_at":"2026-10-10T19:00:00Z"}},{"player_id":"p5","name":"Player p5","team":"Tg3A","opp":"Tg3B","pos":null,"game_id":"g3","game_date":"2026-10-10","start_at":"2026-10-11T00:00:00.000Z","score":70,"rate":0.2,"role":null,"why":"why p5","status":"board","price":{"median":150,"best":170,"books":5,"taken_at":"2026-10-10T19:00:00Z"}}],"leg_count":2,"note":"Two on the top line.","start_at":"2026-10-10T23:00:00.000Z"}}'
  const f2 = [C('p1', 'g1', 2, 90, 0.40), C('p2', 'g1', 2, 88, 0.35), C('p3', 'g2', 3, 85, 0.30), C('p4', 'g3', 4, 80, 0.25, { status: 'called' }), C('p5', 'g3', 4, 70, 0.20, { status: 'board' }), C('p6', 'g4', 1, 95, 0.10)]
  const got = donovanRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: f2, playerIds: ['p3', 'p5'], note: 'Two on the top line.', now: NOW - 30 * 60e3, lockAtMs: LOCK_AT, allowLate: true })
  assert.equal(JSON.stringify(got), GOLD)
  assert.equal(JSON.stringify(donovanRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: f2, playerIds: ['p3', 'p5'], note: 'Two on the top line.', now: NOW - 30 * 60e3, lockAtMs: LOCK_AT, allowLate: true, product: 'two_man', units: 1 })), GOLD, 'an explicit two_man with a stray `units` is the same bytes')
  assert.equal(donovanRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: f2, playerIds: ['p3'], note: 'x', now: NOW, lockAtMs: LOCK_AT }).error, 'Pick two players.')
  assert.equal(donovanRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: f2, playerIds: ['p3', 'p3'], note: 'x', now: NOW, lockAtMs: LOCK_AT }).error, 'Pick two different players.')
  assert.equal(donovanRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', field: f2, playerIds: ['p3', 'zz'], note: 'x', now: NOW - H, lockAtMs: LOCK_AT }).error, "Both players must come from tonight's board.")
})

// ── 6. THE POST TEXT AND THE POST ─────────────────────────────────────────────
await t('POST TEXT: "ADMIN\'S 6-MAN: A + B + ..." (or his card name) with his note, whole or not at all, under 280, no link / hashtag / lock / guaranteed / winner / price; the same sanitiser as the note', () => {
  const row = NM().row
  const x = nManXText({ sport: 'nhl', day: '2026-10-10', row })
  assert.ok(x.text.includes("ADMIN'S 6-MAN: Player p1 + Player p3 + Player p4 + Player p5 + Player p7 + Player p8"), x.text)
  assert.ok(x.text.includes(NOTE)); assert.ok([...x.text].length <= 280); assert.deepEqual(x.named, SIX)
  assert.ok(cleanPublic(x.text)); assert.ok(!/https?:|www\.|#|@/.test(x.text)); assert.ok(!/\block|guarantee|\bdue\b|winner|\+\d{3,}/i.test(x.text.replace(/Player p\d/g, '')), 'no price, no banned word')
  assert.match(x.text, /^\u{1F3AF} THE CARD · NHL · Oct 10\n\nADMIN'S 6-MAN: /u)
  assert.ok(nManXText({ sport: 'nhl', day: '2026-10-10', row: NM({ cardName: 'Friday Heaters' }).row }).text.includes('Friday Heaters: Player p1'))
  assert.ok(nManXText({ sport: 'nhl', day: '2026-10-10', row: NM({ playerIds: SIX.slice(0, 3) }).row }).text.includes("ADMIN'S 3-MAN: "))
  // a man left out (named too recently) = no post at all: five men is not the ticket
  assert.equal(nManXText({ sport: 'nhl', day: '2026-10-10', row, exclude: new Set(['p3']) }).text, '')
  // a long note loses its last lines, then is cut, never the names
  const longNote = NM({ note: Array(3).fill('x'.repeat(120)).join('\n') }).row
  const lx = nManXText({ sport: 'nhl', day: '2026-10-10', row: longNote })
  assert.ok(lx.text && [...lx.text].length <= 280 && lx.text.includes('Player p8'), 'the names always survive')
  // names that cannot fit at all: nothing (whole or not at all)
  const huge = { ...row, legs: row.legs.map((l) => ({ ...l, name: 'N'.repeat(60) })) }
  assert.equal(nManXText({ sport: 'nhl', day: '2026-10-10', row: huge }).text, '')
  assert.equal(nManXText({ sport: 'nba', day: '2026-10-10', row }).text, '')
  // a text with a banned word is never returned (defence in depth: the row\'s own sanitiser already refuses it)
  assert.equal(nManXText({ sport: 'nhl', day: '2026-10-10', row: { ...row, note: 'see https://x.com/a' } }).text.includes('https'), false)
})

await t('POST: nManBuild names all of them or none; naming problems (a definite no) drop it; a started game drops it; the payload carries product n_man', () => {
  const row = NM().row
  const clean = new Map(SIX.map((id) => [id, null]))
  const ok = nManBuild({ sport: 'nhl', day: '2026-10-10', row, problems: clean, now: NOW })
  assert.ok(ok.text.includes("ADMIN'S 6-MAN")); assert.equal(ok.payload.product, 'n_man'); assert.equal(ok.payload.picks.length, 6)
  const blocked = new Map(clean); blocked.set('p4', { id: 'p4', reason: 'OUT', pending: false })
  assert.equal(nManBuild({ sport: 'nhl', day: '2026-10-10', row, problems: blocked, now: NOW }).text, '', 'one definite no = no post')
  assert.equal(nManBuild({ sport: 'nhl', day: '2026-10-10', row, problems: new Map(), now: NOW }).text, '', 'a man the board does not list = no post')
  assert.equal(nManBuild({ sport: 'nhl', day: '2026-10-10', row, problems: clean, now: NOW + 2.5 * H }).text, '', 'a started game')
})

// the posting path: fetch stubbed (nothing is sent), a table that remembers claims
const calls = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ url: u, body: init.body })
  if (u.includes('api.x.com/2/media/upload')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 'm-1' } }) }
  if (u.includes('api.x.com')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 't-1' } }) }
  return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) }
}
const FREE = 'https://discord.com/api/webhooks/2001/TEST-TOKEN'
const XENV = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' }
const setEnv = (extra = {}) => { for (const k of Object.keys(process.env)) if (/^DISCORD_|^X_|POST_KINDS_ON|DUAL_CARD_OFF|SUPABASE/.test(k)) delete process.env[k]; Object.assign(process.env, { DISCORD_HOMER_WEBHOOK: FREE, DISCORD_NHL_WEBHOOKS: FREE, ...extra }) }
const stateDb = ({ seed = [], failClaim = false } = {}) => {
  const rowsT = [...seed]
  const T = {
    select: () => ({ match: (m) => ({ maybeSingle: async () => ({ data: rowsT.find((r) => r.day === m.day && r.kind === m.kind) || null }) }), eq: () => T.select(), in: () => T.select(), order: () => T.select(), limit: async () => ({ data: [] }) }),
    upsert: (r) => ({ select: async () => {
      if (failClaim) return { data: null, error: { message: 'new row violates check constraint "homer_feed_posts_kind_check"' } }
      const out = []; for (const x of r) if (!rowsT.some((q) => q.day === x.day && q.kind === x.kind)) { rowsT.push({ ...x }); out.push({ day: x.day }) }
      return { data: out, error: null } } }),
    update: (patch) => ({ match: async (m) => { const q = rowsT.find((r) => r.day === m.day && r.kind === m.kind); if (q) Object.assign(q, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }), insert: async () => ({ error: null }),
  }
  return { rowsT, db: { from: () => T } }
}
const { _resetTakenForTests: resetTaken } = await import('../lib/dash/postClaim.js')
const tweets = () => calls.filter((c) => c.url.endsWith('/2/tweets')).map((c) => JSON.parse(c.body))

await t('POST: his N-man posts through card_don_<sport> once a day (X + the free channel, the card as the picture), never a started game, never before his lock, never twice; the card post still names the Two-Man', async () => {
  const NOWJ = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const DAY = '2026-10-12'
  const mk = (o = {}) => ({ ...NM({ now: NOWJ - 30 * 60e3 }).row, locks_at: iso(NOWJ - 5 * 60e3), start_at: iso(NOWJ + 2 * H), legs: NM().row.legs.map((l) => ({ ...l, start_at: iso(NOWJ + 2 * H) })), ...o })
  const problems = new Map(SIX.map((id) => [id, null]))
  let asked = 0
  const image = async () => { asked += 1; return Buffer.from('PNG-nman') }
  setEnv(XENV); calls.length = 0; resetTaken()
  const s1 = stateDb()
  const r1 = await postDonovanNMan(s1.db, { sport: 'nhl', day: DAY, rows: [mk()], now: NOWJ, image, problems })
  const tw = tweets()[0]
  assert.match(r1, /^posted/, r1)
  assert.ok(tw.text.includes("ADMIN'S 6-MAN: Player p1 + Player p3") && tw.text.includes(NOTE)); assert.ok(!/https?:\/\/|\block|guarantee|\bdue\b/i.test(tw.text))
  assert.equal(tw.media?.media_ids?.length, 1, 'the card rides the X post'); assert.ok(calls.some((c) => c.url === FREE && c.body instanceof FormData), 'and the free channel')
  const claim = s1.rowsT.find((r) => r.kind === CARD_KIND.don('nhl'))
  assert.ok(claim && claim.day === DAY && claim.payload.product === 'n_man', 'one claim row (day, card_don_nhl) marks it an n_man post'); assert.equal(asked, 1)
  calls.length = 0
  assert.equal(await postDonovanNMan(s1.db, { sport: 'nhl', day: DAY, rows: [mk()], now: NOWJ + 600e3, image, problems }), 'already-posted (this sport-day slot is taken: the Two-Man\'s own post, or this one)'); assert.equal(calls.length, 0)
  // the claim made by his N-man does NOT stop the card post from naming his Two-Man (donovanPostClaimed ignores an n_man claim)
  const { donovanPostClaimed } = await import('../lib/card/post.js')
  assert.equal(await donovanPostClaimed(s1.db, 'nhl', DAY), false)
  assert.equal(await donovanPostClaimed(stateDb({ seed: [{ day: DAY, kind: 'card_don_nhl', payload: { picks: [] } }] }).db, 'nhl', DAY), true, 'a Two-Man claim still does')
  // LATE, started, not locked yet, no entry, a name with a definite no
  setEnv(XENV); calls.length = 0; resetTaken()
  const s6 = stateDb()
  assert.equal(await postDonovanNMan(s6.db, { sport: 'nhl', day: DAY, rows: [mk({ lane: LATE_LANE })], now: NOWJ, image, problems }), 'no-entry')
  assert.equal(await postDonovanNMan(s6.db, { sport: 'nhl', day: DAY, rows: [], now: NOWJ, image, problems }), 'no-entry')
  assert.equal(await postDonovanNMan(s6.db, { sport: 'nhl', day: DAY, rows: [mk({ start_at: iso(NOWJ - 1000) })], now: NOWJ, image, problems }), 'too-late')
  assert.equal(await postDonovanNMan(s6.db, { sport: 'nhl', day: DAY, rows: [mk({ locks_at: iso(NOWJ + 600e3) })], now: NOWJ, image, problems }), 'not-locked-yet')
  assert.equal(calls.length, 0, 'none of those sent anything')
  // before the SQL is run for the post kind: skipped, nothing sent
  setEnv(XENV); calls.length = 0; resetTaken()
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '))
  const s7 = stateDb({ failClaim: true })
  const r7 = await postDonovanNMan(s7.db, { sport: 'nhl', day: '2026-10-21', rows: [mk()], now: NOWJ, image, problems })
  console.error = ce
  assert.match(r7, /^skipped: run the update/); assert.equal(calls.length, 0)
  // the picture failing leaves the post as text
  setEnv(XENV); calls.length = 0; resetTaken()
  const s8 = stateDb()
  const r8 = await postDonovanNMan(s8.db, { sport: 'nhl', day: '2026-10-22', rows: [mk()], now: NOWJ, image: async () => null, problems })
  assert.match(r8, /^posted/); assert.equal(tweets().at(-1).media, undefined)
  // paused
  process.env.CARD_POSTS_PAUSE = 'on'
  assert.equal(await postDonovanNMan(stateDb().db, { sport: 'nhl', day: DAY, rows: [mk()], now: NOWJ, image, problems }), 'paused')
  delete process.env.CARD_POSTS_PAUSE
})

await t('THE CARD\'S OTHER POSTS DO NOT SEE IT: the free result ignores an ungraded n_man (it never blocks the Card\'s result); THE DAY and the card post skip it', () => {
  const bot = [{ lane: 'bot', product: 'straight', slot: 1, result: 'hit', legs: [{ player_id: 'a', name: 'Test A', team: 'X', opp: 'Y' }], stake: 1 }]
  const nm = { lane: 'donovan', product: 'n_man', slot: 1, result: null, legs: NM().row.legs, note: NOTE }
  const a = resultText({ sport: 'nhl', day: '2026-10-10', rows: bot })
  const b = resultText({ sport: 'nhl', day: '2026-10-10', rows: [...bot, nm] })
  assert.ok(a.text); assert.equal(b.text, a.text, 'the free result is the same with or without his ungraded N-man')
  const tick = fs.readFileSync(new URL('../lib/card/tick.js', import.meta.url), 'utf8')
  assert.ok(/Date\.parse\(r\.locks_at\) <= now && r\.product !== 'n_man'/.test(tick), 'THE DAY skips it')
  assert.ok(/postDonovanNMan\(db/.test(tick), 'the tick posts it')
  assert.ok(!/n_man/.test(fs.readFileSync(new URL('../lib/card/text.js', import.meta.url), 'utf8').slice(0, fs.readFileSync(new URL('../lib/card/text.js', import.meta.url), 'utf8').indexOf('HIS N-MAN ON X')).replace(/\/\/.*$/gm, '').replace(/and r\.product !== 'n_man'|r\.product !== 'n_man'/g, '')), 'no other text builder names n_man')
})

await t('SERIAL: his N-man\'s number is its place among his locked N-men for the sport (lane donovan, locked only)', () => {
  const rows = [{ card_date: '2026-10-08', lane: 'donovan', locks_at: '2026-10-08T20:00:00Z' }, { card_date: '2026-10-09', lane: 'donovan', locks_at: '2026-10-09T20:00:00Z' }, { card_date: '2026-10-10', lane: 'donovan', locks_at: '2026-10-10T20:00:00Z' }, { card_date: '2026-10-11', lane: 'donovan_late', locks_at: '2026-10-11T20:00:00Z' }]
  assert.deepEqual(nManSerialOf(rows, { cardDate: '2026-10-10', now: Date.parse('2026-10-10T21:00:00Z') }), { n: 3, of: 3, caption: 'N-MAN NO.' })
  assert.equal(nManSerialOf(rows, { cardDate: '2026-10-11', now: Date.parse('2026-10-12T00:00:00Z') }), null, 'a late entry has none')
  assert.equal(nManSerialOf(rows, { cardDate: '2026-10-10', now: Date.parse('2026-10-10T19:00:00Z') }), null, 'not locked yet')
})

// ── 7. THE ROUTES AND THE MIGRATION ───────────────────────────────────────────
const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
await t('ROUTES: admin only, same-origin writes, the same confirmations; the card route reads the PUBLIC view only; LATE is never drawn for the public', () => {
  const api = src('app/api/admin/two-man/route.js')
  assert.ok(/product = body\.product === 'n_man' \? 'n_man' : 'two_man'/.test(api) && /product, units: product === 'n_man'/.test(api), 'the save passes product + units to donovanRow')
  assert.ok(/made\.lockAtSave && body\.confirm_lock !== true/.test(api) && /made\.late && body\.confirm_late !== true/.test(api), 'lock-at-save and LATE still need their confirmations')
  assert.ok(/needs_sql: saved\.needsSql/.test(api) && /sameOriginJson/.test(api) && /if \(!\(await admin\(\)\)\) return no\(\)/.test(api))
  assert.ok(/withdrawDonovan\(db, \{ sport, card_date: date, product,/.test(api), 'withdraw is per product')
  const pre = src('app/api/admin/two-man/preview/route.js')
  assert.ok(/isAdminUser/.test(pre) && /sameOriginJson/.test(pre) && !/\.upsert\(|\.insert\(|\.update\(|\.delete\(/.test(pre), 'the preview is admin-gated and writes nothing')
  const route = src('app/api/card/nman/route.js')
  assert.ok(/nManCardImage/.test(route) && !/lane|donovan_late/.test(route.replace(/\/\/.*$/gm, '')), 'the public route takes no lane: it can only ever read his verified row')
  const data = src('lib/cards/nManData.js')
  assert.ok(/audience: 'public'/.test(data) && /r\.lane === 'donovan' && r\.product === 'n_man'/.test(data))
  assert.ok(/no printed probability|No probability/i.test(src('lib/cards/nManCard.js')))
})

await t('THE MIGRATION: n_man in the product / shape / lane checks, the guard\'s lock-at-save covers it, idempotent, no role switching, probes at the end, and the plain .txt IS the SQL', () => {
  const sql = src('supabase/migrations/202610121200_card_calls_nman.sql')
  const code = sql.replace(/--.*$/gm, '')
  assert.ok(/card_calls_product_ck/.test(code) && /'n_man'\)\);/.test(code), 'product check')
  assert.ok(/product = 'n_man'\s+and leg_count between 2 and 6 and slot = 1/.test(code), 'shape check: 2..6 legs, slot 1')
  assert.ok(/lane = 'bot' and product <> 'n_man'/.test(code) && /lane <> 'bot' and product in \('two_man','double','n_man'\)/.test(code), 'the bot never has an n_man')
  assert.ok(/if new\.product in \('two_man', 'n_man'\) then\s+new\.locks_at := now\(\);/.test(code), 'LOCK AT SAVE covers n_man')
  assert.ok(/new\.lane = 'donovan_late'/.test(code) && /interval '15 minutes'/.test(code), 'the late lane and its 15-minute window are in the function')
  assert.ok(/not like '%n_man%'/.test(code), 'idempotent: a constraint that already says n_man is left alone')
  assert.ok(!/set\s+(local\s+)?role|reset role/i.test(code), 'no role switching')
  assert.ok(/-- PROBES/.test(sql) && sql.indexOf('-- PROBES') > sql.indexOf('create trigger'), 'probes are comments at the end')
  assert.ok(!/drop table|truncate|delete from|update public\.card_calls/i.test(code), 'no row is touched')
  // the guard is the 10-12 late migration\'s function with exactly one change
  const late = src('supabase/migrations/202610121100_card_calls_late.sql')
  const fn = (s) => s.slice(s.indexOf('create or replace function public.card_calls_guard()'), s.indexOf('drop trigger if exists card_calls_guard'))
  const oldFn = fn(late)
  const newFn = fn(sql)
  const norm = (s) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ')
  assert.equal(norm(newFn).replace("product in ('two_man', 'n_man')", "product = 'two_man'"), norm(oldFn), 'the only code change in the guard is the n_man lock-at-save')
  const txt = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/SIX-MAN/nman_SQL.txt'
  if (fs.existsSync(txt)) assert.equal(fs.readFileSync(txt, 'utf8'), sql, 'the .txt is the migration, byte for byte')
})

await t('EVERY leg_count CHECK on card_calls is widened: the earlier migrations are scanned, and the new one relaxes each (the original column check leg_count in (1,2) blocked a 3-leg row on 2026-10-12)', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const earlier = fs.readdirSync(dir).filter((f) => /^2026\d+_.*\.sql$/.test(f) && f < '202610121200').map((f) => [f, fs.readFileSync(new URL(f, dir), 'utf8').replace(/--.*$/gm, '')])
  const mine = fs.readFileSync(new URL('202610121200_card_calls_nman.sql', dir), 'utf8').replace(/--.*$/gm, '')
  const found = []
  for (const [f, sql] of earlier) {
    if (!/card_calls\b/.test(sql)) continue
    // a column check on leg_count alone, or a named / table check that mentions leg_count
    for (const m of sql.matchAll(/leg_count\s+integer[^,\n]*check\s*\(([^)]*\))/gi)) found.push({ f, kind: 'column', def: m[1] })
    for (const m of sql.matchAll(/constraint\s+(\w+)\s+check\s*\(([\s\S]*?)\);/gi)) if (/leg_count/.test(m[2]) && !/jsonb/.test(m[2])) found.push({ f, kind: 'named', name: m[1], def: m[2] })
    for (const m of sql.matchAll(/\n\s*check\s*\(([^;]*?leg_count[^;]*?)\),?\n/gi)) if (!/jsonb/.test(m[1])) found.push({ f, kind: 'table', def: m[1] })
  }
  assert.ok(found.some((x) => x.kind === 'column' && /leg_count in \(1,2\)/i.test(x.def)), 'the scan finds the original column check')
  for (const x of found) {
    if (x.kind === 'column') assert.ok(/card_calls_leg_count_check/.test(mine) && /leg_count between 1 and 6/.test(mine) && /drop constraint %I/.test(mine), `${x.f}: the column check on leg_count is dropped and re-added widened`)
    else if (x.kind === 'named') assert.ok(new RegExp(`${x.name}`).test(mine) && /n_man/.test(mine), `${x.f}: ${x.name} is relaxed by the new migration`)
    else assert.ok(/like '%leg_count%'/.test(mine) || /leg_count/.test(mine), `${x.f}: a table check on leg_count is covered`)
  }
  // by definition too, in case the name differs
  assert.ok(/pg_get_constraintdef\(oid\) like '%leg_count%'/.test(mine), 'found by definition as well as by name')
  // the other column checks of the first migration do not block an n_man row
  const first = fs.readFileSync(new URL('202610101000_card_calls.sql', dir), 'utf8')
  assert.ok(/slot\s+integer\s+not null check \(slot between 1 and 3\)/.test(first), 'slot 1..3: an n_man row is slot 1')
  assert.ok(/stake\s+numeric\s+not null check \(stake > 0\)/.test(first) && /char_length\(note\) <= 600/.test(first) && /locks_at <= start_at/.test(first), 'stake > 0, note <= 600 chars, locks_at <= start_at: all hold for an n_man row')
  assert.ok(/check \(note is null or lane = 'donovan'\)/.test(first) && /card_calls_note_lane_ck[\s\S]*donovan_late/.test(fs.readFileSync(new URL('202610121100_card_calls_late.sql', dir), 'utf8')), 'the note rule allows donovan and donovan_late')
})

await t('THE LANE CHECK THROUGH THE TABLE: the bot can never have an n_man row; 3..6 legs pass after the migration; 7 legs and 0..1-slot violations are refused; before it, 3 legs are refused', async () => {
  const clock = { now: LOCK_AT - 60e3 }
  const row = NM({ now: clock.now }).row
  const botRow = { ...row, lane: 'bot', note: null }
  const db = fakeDb(clock)
  const r = await db.from('card_calls').upsert([botRow])
  assert.match(r.error.message, /card_calls_lane_ck/); assert.equal(db.rows.length, 0)
  const seven = { ...row, legs: [...row.legs, row.legs[0]], leg_count: 7 }
  assert.match((await fakeDb(clock).from('card_calls').upsert([seven])).error.message, /card_calls_shape_ck/)
  const slot2 = { ...row, slot: 2 }
  assert.match((await fakeDb(clock).from('card_calls').upsert([slot2])).error.message, /shape_ck/)
  const three = NM({ now: clock.now, playerIds: ['p1', 'p3', 'p4'] }).row
  assert.equal((await fakeDb(clock).from('card_calls').upsert([three])).error, null)
  assert.match((await fakeDb(clock, { nman: false }).from('card_calls').upsert([three])).error.message, /check constraint/)
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
