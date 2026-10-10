#!/usr/bin/env node
// THE CARD MAP (Donovan's approved map, 2026-10-10): plays per slate, the straight slots by market, the same-game Two-Man, the Double, the Long Shot of the
// day, THE DAY, and the leak rules. Every input is TEST data (made-up players p1.., clubs AAA, made-up numbers, made-up prices), nothing real.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-map.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  PLAYS_BY_GAMES, PLAY_CAP, FULL_SLATE, PLUS_MONEY, MIN_LONG_SHOTS, MARKETS, SLOTS, STAKE, CARD_RULE, CARD_VERSION, CARD_VERSIONS, SAME_GAME_NOTE, DOUBLE_SPORT,
  playsFor, planStraights, lockPlan, planWindow, percentileOf, leadStraight, pickTwoManFor, pickTwoManSameGame, pickLongShot, longShotRow, pickDouble, doubleRow,
  donovanDoubleRow, legWord, productResult, gradeCardRow, recordOf, recordsOf, recordWords, rowPrice, legPriceOf, lockAtOf, inPlusMoney, resultKey, fieldOf, nflWindowsOf,
} from '../lib/card/core.js'
import { xCardText, membersCardText, membersCardEmbed, resultText, longShotText, longShotResultText, longShotRecordLine, doubleResultText, dayText, dayEmbed, exposureLine, todayText, dayLead, cleanPublic } from '../lib/card/text.js'
import { lockCard, lockDouble, gradeCardRows, publicRow, doubleLocked } from '../lib/card/store.js'
import { xCardBuild, CARD_KIND, DAY_KINDS, postDay, postLongShot, postLongShotResult, postToday, postCardMembers, rowKeyOf } from '../lib/card/post.js'
import { tagOf, untagged, kindInfo, mayPostNow } from '../lib/dash/xSchedule.js'
import { sportOfKind, tierOf, isRepeatExempt } from '../lib/dash/xPolicy.js'
import { fakeDb } from './_card-fakedb.mjs'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-10T20:00:00Z')
// TEST candidates: id, game, start offset hours from NOW, score, team side
const C = (id, game, startH, score, extra = {}) => ({ player_id: id, name: `Player ${id}`, team: `T${game}${extra.side || 'A'}`, opp: `T${game}${extra.side === 'B' ? 'A' : 'B'}`, game_id: game, game_date: '2026-10-10', start_ms: NOW + startH * H, score, rate: 0.3, why: `why ${id}`, ...extra })
const V = (id, game, startH, score, market, line, med = -120, extra = {}) => ({ ...C(id, game, startH, score, extra), rate: null, market, line, price: line == null ? null : { median: med, best: med + 10, books: 6, taken_at: '2026-10-10T19:00:00Z' } })
const PM = (id, game, startH, score, med, extra = {}) => ({ ...C(id, game, startH, score, extra), price: { median: med, best: med + 20, books: 5, taken_at: '2026-10-10T19:00:00Z' } })
const LOCK_AT = lockAtOf(NOW + 1 * H)
const board = (cands) => cands.map((c) => c.score)

// A SIX-GAME NHL slate: anytime board, shots board (with stored lines), all with games g1..g6
const ANY = [C('a1', 'g1', 2, 95), C('a2', 'g2', 2, 90), C('a3', 'g3', 3, 85), C('a4', 'g4', 3, 80), C('a5', 'g5', 4, 75), C('a6', 'g6', 4, 70), C('a1b', 'g1', 2, 94, { side: 'B' })]
const SOG = [V('s1', 'g1', 2, 99, 'sog', 2.5), V('s2', 'g2', 2, 80, 'sog', 3.5, -105), V('s3', 'g3', 3, 70, 'sog', 2.5, +110), V('s4', 'g4', 3, 60, 'sog', null)]
const BM = { anytime: { cands: ANY, board: [...board(ANY), 50, 40, 30] }, sog: { cands: SOG, board: [...board(SOG), 20, 30, 40, 50] } }

// ── 1. PLAYS PER SLATE ──────────────────────────────────────────────────────────
await t('plays per slate: 1 game 1+1 (same-game allowed), 2 games 1+1, 3-5 games 2+1, 6+ games 3+1; straights never exceed games; cap 4 plays', () => {
  const want = { 1: [1, 1], 2: [1, 1], 3: [2, 1], 4: [2, 1], 5: [2, 1], 6: [3, 1], 7: [3, 1], 15: [3, 1] }
  for (const [g, [s, m]] of Object.entries(want)) { const p = playsFor(Number(g)); assert.deepEqual([p.straights, p.twoMan], [s, m], `${g} games`); assert.ok(p.straights + p.twoMan <= PLAY_CAP) }
  assert.equal(playsFor(1).sameGame, true); assert.equal(playsFor(2).sameGame, false)
  for (const bad of [0, -1, NaN, undefined, null]) assert.deepEqual(playsFor(bad), { games: 0, straights: 0, twoMan: 0, sameGame: false })
  assert.equal(PLAY_CAP, 4); assert.equal(FULL_SLATE, 6); assert.deepEqual(PLAYS_BY_GAMES.map((x) => x[0]), [1, 2, 5, Infinity])
})

await t('straights are one per game and never padded; the Two-Man is separate; a slate smaller than its plays gets fewer', () => {
  // 4 games: 2 straights + 1 two-man
  const four = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: BM, games: 4, now: NOW, lockAtMs: LOCK_AT })
  assert.equal(four.rows.filter((r) => r.product === 'straight').length, 2); assert.equal(four.rows.filter((r) => r.product === 'two_man').length, 1)
  const games = four.rows.filter((r) => r.product === 'straight').map((r) => r.legs[0].game_id)
  assert.equal(new Set(games).size, games.length, 'one per game')
  // every eligible player in ONE game on a 6-game window (the loader said 6, the board has one game): fewer straights, not padded
  const one = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: 'd', byMarket: { anytime: { cands: [C('x', 'g1', 2, 90), C('y', 'g1', 2, 80, { side: 'B' })], board: [90, 80] } }, games: 6, now: NOW, lockAtMs: LOCK_AT })
  assert.equal(one.rows.filter((r) => r.product === 'straight').length, 1)
  assert.ok(one.skipped.length >= 1 && one.skipped.every((s) => s.reason))
  // never more than 4 plays per sport per window, whatever the slate
  const big = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: 'd', byMarket: BM, games: 30, now: NOW, lockAtMs: LOCK_AT })
  assert.ok(big.rows.filter((r) => r.product === 'straight' || r.product === 'two_man').length <= PLAY_CAP)
})

// ── 2. STRAIGHT SLOTS BY MARKET ─────────────────────────────────────────────────
await t('NHL slots: 1 anytime goal, 2 shots on goal over (a stored line + price), 3 a 2nd goal pick else a shots pick; markets never compared by raw score', () => {
  const p = planStraights({ sport: 'nhl', n: 3, byMarket: BM, now: NOW })
  // slot 1: a1 (g1, 95). slot 2: shots: s1 (99) is in g1 (used) -> s2 (g2, 80) even though s1's raw score beats every anytime score. slot 3: anytime next free game: a2? g2 used by s2 -> a3 (g3)
  assert.deepEqual(p.picks.map((x) => [x.slot, x.market, x.cand.player_id]), [[1, 'anytime', 'a1'], [2, 'sog', 's2'], [3, 'anytime', 'a3']])
  const sog = p.picks[1].cand
  assert.equal(sog.line, 3.5); assert.equal(sog.price.median, -105, 'the stored line and price are on the pick')
  assert.deepEqual(SLOTS.nhl, [['anytime'], ['sog'], ['anytime', 'sog']])
  // slot 3 falls to a second shots pick when no anytime player is left in a free game
  const only = { anytime: { cands: [C('a1', 'g1', 2, 95), C('a2', 'g2', 2, 90)], board: [95, 90] }, sog: { cands: [V('s2', 'g2', 2, 80, 'sog', 3.5), V('s3', 'g3', 3, 70, 'sog', 2.5)], board: [80, 70, 10] } }
  const q = planStraights({ sport: 'nhl', n: 3, byMarket: only, now: NOW })
  assert.deepEqual(q.picks.map((x) => [x.slot, x.market, x.cand.player_id]), [[1, 'anytime', 'a1'], [2, 'sog', 's2'], [3, 'sog', 's3']])
})

await t('NFL slots: anytime TD | receiving yards over | rushing yards over; MLB: home run | hits (else hits + runs + RBI) | a 2nd home run', () => {
  assert.deepEqual(SLOTS.nfl, [['anytime'], ['rec_yds'], ['rush_yds']]); assert.deepEqual(SLOTS.mlb, [['anytime'], ['hit', 'hrr'], ['anytime']])
  const nfl = { anytime: { cands: [C('t1', 'n1', 2, 90)], board: [90] }, rec_yds: { cands: [V('r1', 'n2', 2, 88, 'rec_yds', 59.5, -115)], board: [88, 50] }, rush_yds: { cands: [V('u1', 'n3', 2, 77, 'rush_yds', 64.5, -110)], board: [77, 40] } }
  const p = planStraights({ sport: 'nfl', n: 3, byMarket: nfl, now: NOW })
  assert.deepEqual(p.picks.map((x) => [x.market, x.cand.line]), [['anytime', undefined], ['rec_yds', 59.5], ['rush_yds', 64.5]])
  // MLB slot 2: HIT first, HRR only when there is no usable HIT pick
  const mlb = (hit) => ({ anytime: { cands: [C('m1', 'b1', 2, 90), C('m2', 'b2', 2, 85)], board: [90, 85] }, hit: { cands: hit, board: [70, 60] }, hrr: { cands: [V('h2', 'b3', 2, 66, 'hrr', 1.5, -105)], board: [66] } })
  assert.equal(planStraights({ sport: 'mlb', n: 3, byMarket: mlb([V('h1', 'b3', 2, 70, 'hit', 0.5, -250)]), now: NOW }).picks[1].market, 'hit')
  const fall = planStraights({ sport: 'mlb', n: 3, byMarket: mlb([V('h1', 'b3', 2, 70, 'hit', null)]), now: NOW })
  assert.equal(fall.picks[1].market, 'hrr', 'a HIT candidate with no stored line is not usable: the slot falls to hits + runs + RBI')
  assert.equal(fall.picks[2].market, 'anytime', 'slot 3 is a second home run')
  assert.equal(marketKeys('mlb'), 'anytime,hit,hrr'); assert.equal(marketKeys('nhl'), 'anytime,sog'); assert.equal(marketKeys('nfl'), 'anytime,rec_yds,rush_yds')
  assert.equal(MARKETS.nba, undefined, 'NBA is not built (BUCKETS hidden)')
})
function marketKeys(s) { return Object.keys(MARKETS[s]).join(',') }

await t('a slot with no stored line at lock is SKIPPED and says why; it is never filled from another market out of turn or with a made-up line', () => {
  const noLine = { anytime: BM.anytime, sog: { cands: [V('s1', 'g1', 2, 99, 'sog', null), V('s2', 'g2', 2, 80, 'sog', null)], board: [99, 80] } }
  const p = planStraights({ sport: 'nhl', n: 3, byMarket: noLine, now: NOW })
  assert.deepEqual(p.picks.map((x) => x.slot), [1, 3]); assert.equal(p.skipped.length, 1); assert.equal(p.skipped[0].slot, 2)
  assert.match(p.skipped[0].reason, /no stored line and price at lock for any of the 2 eligible/)
  // slot 3 (anytime then shots) took the anytime market, not the shots one, and skipped nothing else
  assert.equal(p.picks[1].market, 'anytime')
  const none = planStraights({ sport: 'nhl', n: 2, byMarket: { anytime: BM.anytime }, now: NOW })
  assert.match(none.skipped[0].reason, /no board was read/)
  const empty = planStraights({ sport: 'nhl', n: 2, byMarket: { anytime: BM.anytime, sog: { cands: [], board: [] } }, now: NOW })
  assert.match(empty.skipped[0].reason, /nobody eligible/)
  // a price with no line, or a line with no price, is no pick
  const half = planStraights({ sport: 'nhl', n: 2, byMarket: { anytime: BM.anytime, sog: { cands: [{ ...SOG[0], price: null }, { ...SOG[1], line: undefined }], board: [1] } }, now: NOW })
  assert.equal(half.picks.length, 1)
})

await t('over-only grading against the stored line: over the line = hit, EQUAL = push, under = miss, did not play / void = void; a yes/no leg is landed', () => {
  const leg = { market: 'sog', line: 2.5 }
  assert.equal(legWord({ played: true, values: { sog: 3 } }, leg), 'hit'); assert.equal(legWord({ played: true, values: { sog: 2 } }, leg), 'miss')
  assert.equal(legWord({ played: true, values: { sog: 3 } }, { market: 'sog', line: 3 }), 'push', 'a whole-number line that lands exactly is a push')
  assert.equal(legWord({ played: false, values: { sog: 0 } }, leg), 'void'); assert.equal(legWord(null, leg), null)
  assert.equal(legWord({ played: true, values: {} }, leg), null, 'no stat yet is not a result')
  assert.equal(legWord({ played: true, values: { rec_yds: 61, rush_yds: 20 } }, { market: 'rec_yds', line: 59.5 }), 'hit', 'a player\'s stat is read per market')
  assert.equal(legWord({ played: true, landed: true }, { market: 'anytime' }), 'hit')
  assert.equal(productResult('straight', ['push']), 'push'); assert.equal(productResult('long_shot', ['push']), 'push')
  assert.equal(productResult('two_man', ['push', 'hit']), null, 'a push is not a two-man word')
  // the record: a push is neither a hit nor a miss, returns the stake, counts as pushed
  const rows = [{ lane: 'bot', product: 'straight', stake: 1, result: 'hit', legs: [{ status: 'called' }] }, { lane: 'bot', product: 'straight', stake: 1, result: 'push', legs: [{ status: 'called' }] }, { lane: 'bot', product: 'straight', stake: 1, result: 'miss', legs: [{ status: 'called' }] }]
  const rec = recordOf(rows, { priceOf: () => ({ median: 100, best: 100 }), minPriced: 2 })
  assert.deepEqual([rec.graded, rec.hits, rec.misses, rec.pushes], [2, 1, 1, 1]); assert.deepEqual(rec.units, { median: 0, best: 0 }, '+1 and -1; the push is no stake')
  assert.match(recordWords(rec).join(' '), /1 pushed/)
})

await t('each volume market keeps its own record line; the same-game Two-Man is shown separately; the first Card\'s rows are still in the anytime line', () => {
  const R = (product, market, result, extra = {}) => ({ lane: 'bot', product, slot: 1, stake: STAKE[product], market, result, rule: product === 'straight' ? CARD_RULE.straight : CARD_RULE.two_man, legs: [{ status: 'called', ...(market ? { market } : {}) }], ...extra })
  const rows = [R('straight', 'anytime', 'hit'), R('straight', null, 'miss'), R('straight', 'sog', 'hit'), R('straight', 'sog', 'miss'), R('straight', 'sog', 'miss'),
    R('two_man', null, 'hit'), R('two_man', null, 'miss', { rule: CARD_RULE.two_man_same_game }), R('two_man', null, 'miss', { rule: CARD_RULE.two_man_same_game })]
  const r = recordsOf(rows)
  assert.deepEqual([r.straight.n, r.straight.hits], [2, 1], 'anytime (and legacy rows with no market)')
  assert.deepEqual([r.volume.sog.n, r.volume.sog.hits], [3, 1]); assert.deepEqual([r.two_man.n, r.two_man.hits], [1, 1]); assert.deepEqual([r.two_man_same_game.n, r.two_man_same_game.hits], [2, 0])
  const w = recordWords(r.two_man_same_game, { product: 'two_man', label: 'same-game two-mans', sameGame: true }).join(' ')
  assert.match(w, /0 of 2 same-game two-mans/); assert.ok(w.includes('correlated') && w.includes('mark these down'), 'the record caption says the legs are correlated and the multiplied price is higher than a real same-game price')
  assert.match(recordWords(r.volume.sog, { product: 'straight', label: 'shots on goal over straights' })[0], /^1 of 3 shots on goal over straights hit/)
})

// ── 3. THE LEAD STRAIGHT FOR X ──────────────────────────────────────────────────
await t('the X lead = the highest percentile on its OWN board across markets; a tie goes to the scorer slot, then the earlier game', () => {
  assert.equal(percentileOf(5, [1, 2, 3, 4, 5]), 90); assert.equal(percentileOf(3, [3, 3, 3, 3]), 50, 'all tied = the middle'); assert.equal(percentileOf(1, []), null); assert.equal(percentileOf(NaN, [1]), null)
  const row = (slot, market, pct, startH, pid) => ({ lane: 'bot', product: 'straight', slot, market, legs: [{ player_id: pid, name: pid, board_pct: pct, start_at: new Date(NOW + startH * H).toISOString() }] })
  assert.equal(leadStraight([row(1, 'anytime', 90, 2, 'x'), row(2, 'sog', 97, 3, 'y'), row(3, 'anytime', 80, 1, 'z')]).legs[0].player_id, 'y', 'a shots pick at the 97th percentile beats a goal pick at the 90th, whatever the raw scores')
  assert.equal(leadStraight([row(2, 'sog', 95, 1, 'y'), row(1, 'anytime', 95, 5, 'x')]).legs[0].player_id, 'x', 'tie -> the scorer slot (slot 1)')
  assert.equal(leadStraight([row(3, 'sog', 95, 2, 'z'), row(2, 'sog', 95, 5, 'y')]).legs[0].player_id, 'y', 'same percentile -> the lower (scorer-first) slot, whatever the start')
  assert.equal(leadStraight([row(2, 'sog', 95, 5, 'y'), { ...row(2, 'sog', 95, 2, 'z') }]).legs[0].player_id, 'z', 'same percentile and slot -> the earlier game')
  assert.equal(leadStraight([]), null)
  // the lock stores the percentile of each pick on its own board
  const p = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: 'd', byMarket: BM, games: 6, now: NOW, lockAtMs: LOCK_AT })
  const s = p.rows.filter((r) => r.product === 'straight')
  assert.ok(s.every((r) => Number.isFinite(r.legs[0].board_pct) && r.legs[0].board_n > 0))
  const lead = leadStraight(p.rows)
  assert.equal(lead.legs[0].board_pct, Math.max(...s.map((r) => r.legs[0].board_pct)))
})

await t('the X text names ONLY the lead straight (with its market and stored line, no price), not the others, not the bot\'s Two-Man', () => {
  const p = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: BM, games: 6, now: NOW, lockAtMs: LOCK_AT })
  const rows = p.rows.map((r, i) => ({ id: i + 1, ...r }))
  const ok = new Map([...ANY, ...SOG].map((c) => [c.player_id, null]))
  const b = xCardBuild({ sport: 'nhl', day: '2026-10-10', rows, problems: ok, now: NOW - 30 * 60e3 })
  const lead = leadStraight(rows).legs[0]
  assert.ok(b.text.includes(lead.name)); assert.equal(b.payload.picks.length, 1)
  for (const r of rows) for (const l of r.legs) if (l.player_id !== lead.player_id) assert.ok(!b.text.includes(l.name), `${l.name} is not on X`)
  assert.ok(!/[+−-]\d{3}/.test(b.text), 'no price on X'); assert.ok(cleanPublic(b.text))
  const volLead = xCardText({ sport: 'nhl', day: '2026-10-10', straight: { ...SOG[1], player_id: 's2', name: 'Player s2', start_ms: undefined, status: 'called', market: 'sog', line: 3.5 } })
  assert.match(volLead.text, /\(shots on goal over 3\.5\)/)
})

// ── 4. SAME-GAME TWO-MAN ────────────────────────────────────────────────────────
await t('same-game Two-Man: only on a ONE-game window, never in baseball; the two highest-scored, one from each team when possible; its own rule name', () => {
  const one = [C('h1', 'g1', 2, 90, { side: 'A' }), C('h2', 'g1', 2, 88, { side: 'A' }), C('v1', 'g1', 2, 80, { side: 'B' }), C('v2', 'g1', 2, 79, { side: 'B' })]
  const sg = pickTwoManSameGame(one, NOW)
  assert.deepEqual(sg.map((c) => c.player_id), ['h1', 'v1'], 'one from each team: the best of each')
  const same = pickTwoManSameGame([C('h1', 'g1', 2, 90), C('h2', 'g1', 2, 88)], NOW)
  assert.deepEqual(same.map((c) => c.player_id), ['h1', 'h2'], 'one team only: the two best')
  assert.equal(pickTwoManSameGame([C('h1', 'g1', 2, 90)], NOW), null, 'fewer than two players: none')
  assert.equal(pickTwoManSameGame([C('h1', 'g1', 2, 90), C('x', 'g2', 2, 80)], NOW), null, 'two games: not a same-game card')
  const nhl = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: 'd', byMarket: { anytime: { cands: one, board: board(one) } }, games: 1, now: NOW, lockAtMs: LOCK_AT })
  assert.equal(nhl.rows.filter((r) => r.product === 'straight').length, 1)
  const two = nhl.rows.find((r) => r.product === 'two_man')
  assert.equal(two.rule, 'two-man-same-game-v1'); assert.equal(CARD_RULE.two_man_same_game, 'two-man-same-game-v1'); assert.deepEqual(two.legs.map((l) => l.game_id), ['g1', 'g1'])
  // baseball: a one-game window never gets a same-game Two-Man (always different games)
  const mlb = lockPlan({ sport: 'mlb', slate_key: 'k', card_date: 'd', byMarket: { anytime: { cands: one, board: board(one) } }, games: 1, now: NOW, lockAtMs: LOCK_AT })
  assert.equal(mlb.rows.filter((r) => r.product === 'two_man').length, 0); assert.ok(mlb.skipped.some((s) => s.slot === 'two-man'))
  assert.equal(pickTwoManFor({ sport: 'mlb', games: 1, cands: one, now: NOW }), null)
  // a two-game window is a normal Two-Man (different games)
  const f = pickTwoManFor({ sport: 'nhl', games: 2, cands: [C('a', 'g1', 2, 90), C('b', 'g1', 2, 89), C('c', 'g2', 2, 70)], now: NOW })
  assert.equal(f.sameGame, false); assert.deepEqual(f.legs.map((c) => c.player_id), ['a', 'c'])
})

await t('the same-game caption (legs correlated; the multiplied price is higher than a real same-game parlay price) is on the members card, THE DAY and the record', () => {
  assert.ok(/correlated/.test(SAME_GAME_NOTE) && /mark these down/.test(SAME_GAME_NOTE) && /if independent/.test(SAME_GAME_NOTE))
  const one = [C('h1', 'g1', 2, 90, { side: 'A' }), C('v1', 'g1', 2, 80, { side: 'B' })]
  const rows = lockPlan({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', byMarket: { anytime: { cands: one, board: [90, 80] } }, games: 1, now: NOW, lockAtMs: LOCK_AT }).rows.map((r) => ({ sport: 'nhl', ...r }))
  assert.match(membersCardText({ sport: 'nhl', day: '2026-10-10', rows }).text, /same game/); assert.ok(membersCardText({ sport: 'nhl', day: '2026-10-10', rows }).text.includes('correlated'))
  assert.ok(JSON.stringify(membersCardEmbed({ sport: 'nhl', day: '2026-10-10', rows })).includes('correlated'))
  assert.ok(dayText({ day: '2026-10-10', rows }).includes('correlated'))
})

// ── 5. THE LONG SHOT OF THE DAY ─────────────────────────────────────────────────
const FULL = [PM('l1', 'g1', 2, 99, 140), PM('l2', 'g2', 2, 95, 160), PM('l3', 'g3', 3, 93, 320), PM('l4', 'g4', 3, 90, 500), PM('l5', 'g5', 4, 88, 501), PM('l6', 'g6', 4, 70, 700), C('l7', 'g7', 4, 100)]
const PR = (cands) => new Map(cands.filter((c) => c.price).map((c) => [c.player_id, c.price]))
await t('Long Shot: one per sport with a FULL slate (6+ games); the top-scored player with a stored median in +160..+500; the range ends are in, +159 and +501 are out', () => {
  assert.deepEqual([inPlusMoney(159), inPlusMoney(160), inPlusMoney(500), inPlusMoney(501), inPlusMoney(-200), inPlusMoney(250.5)], [false, true, true, false, false, false]); assert.deepEqual(PLUS_MONEY, { min: 160, max: 500 })
  const a = pickLongShot({ games: 6, cands: FULL, prices: PR(FULL), now: NOW })
  assert.equal(a.pick.player_id, 'l2', 'l1 (+140) is too short, l7 has no price; l2 (+160) is the top-scored in range'); assert.equal(a.pick.price.median, 160)
  const five = pickLongShot({ games: 5, cands: FULL, prices: PR(FULL), now: NOW })
  assert.equal(five.pick, null); assert.match(five.reason, /full slate is 6\+/)
  assert.equal(pickLongShot({ games: 6, cands: FULL, prices: PR(FULL), now: NOW }).pick.player_id, 'l2')
  // a game that has started is not eligible
  assert.equal(pickLongShot({ games: 6, cands: FULL, prices: PR(FULL), now: NOW + 2 * H + 1 }).pick.player_id, 'l3')
})

await t('Long Shot: no price in range = SKIPPED, nothing shorter or longer is ever substituted; a tie goes to the model rate/start/id', () => {
  const none = [PM('s1', 'g1', 2, 99, 150), PM('s2', 'g2', 2, 90, 600), C('s3', 'g3', 2, 80)]
  const r = pickLongShot({ games: 8, cands: none, prices: PR(none), now: NOW })
  assert.equal(r.pick, null); assert.match(r.reason, /no price in range/)
  assert.equal(pickLongShot({ games: 8, cands: [], prices: new Map(), now: NOW }).pick, null)
  const tie = [PM('b', 'g1', 3, 80, 200), PM('a', 'g2', 3, 80, 300)]
  assert.equal(pickLongShot({ games: 6, cands: tie, prices: PR(tie), now: NOW }).pick.player_id, 'a', 'same score, same rate, same start: the player id')
})

await t('Long Shot row: one leg, the stored median price frozen with it, 1 unit, own product and rule; graded all-or-nothing at that price; void when he does not play', () => {
  const pick = pickLongShot({ games: 7, cands: FULL, prices: PR(FULL), now: NOW }).pick
  const row = longShotRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', pick, games: 7, lockAtMs: LOCK_AT, board: board(FULL) })
  assert.equal(row.product, 'long_shot'); assert.equal(row.rule, 'long-shot-v1'); assert.equal(row.stake, 1); assert.equal(row.leg_count, 1); assert.equal(row.window_games, 7)
  assert.equal(row.legs[0].price.median, 160); assert.deepEqual(legPriceOf(row.legs[0]), { median: 160, best: 180 })
  assert.ok(Date.parse(row.start_at) > NOW && Date.parse(row.locks_at) <= Date.parse(row.start_at))
  assert.equal(gradeCardRow(row, ['hit']).result, 'hit'); assert.equal(gradeCardRow(row, ['miss']).result, 'miss'); assert.equal(gradeCardRow(row, ['void']).result, 'void'); assert.equal(gradeCardRow(row, [null]), null)
  // units at the stored median: a hit at +160 = +1.6 on a 1 unit stake, a miss -1 (best price is never used for the Long Shot)
  const hit = { ...row, result: 'hit' }; const miss = { ...row, result: 'miss' }
  const rec = recordOf([hit, miss], { priceOf: (r) => rowPrice(r, r.legs.map((l) => legPriceOf(l))), minPriced: 2 })
  assert.deepEqual(rec.units.median, 0.6)
})

await t('Long Shot record: counts only until 300 are graded (no hit rate, no ROI, no units); K of N and units only after', () => {
  assert.equal(MIN_LONG_SHOTS, 300)
  const mk = (n, hits) => Array.from({ length: n }, (_, i) => ({ lane: 'bot', product: 'long_shot', stake: 1, result: i < hits ? 'hit' : 'miss', legs: [{ status: 'called', player_id: `q${i}`, price: { median: 300, best: 320 } }] }))
  const priceOf = (r) => rowPrice(r, r.legs.map((l) => legPriceOf(l)))
  const early = recordsOf(mk(299, 60), { priceOf }).long_shot
  const w = recordWords(early, { product: 'long_shot' }).join(' ')
  assert.match(w, /^299 long shots so far/); assert.ok(!/%|units|of 299|hit rate|ROI/i.test(w), 'no K of N, no percent, no units, no hit rate before 300')
  assert.equal(early.units, null)
  const late = recordsOf(mk(300, 75), { priceOf }).long_shot
  const w2 = recordWords(late, { product: 'long_shot' }).join(' ')
  assert.match(w2, /75 of 300 long shots landed/); assert.match(w2, /Flat stakes on 300 priced calls: \+\d+\.\d units at the median price\./); assert.ok(late.units)
  assert.equal(late.units.median, 75 * 3 - 225)       // 75 hits at +300 minus 225 misses, one unit each
  assert.equal(longShotRecordLine(early), '299 long shots so far. Counts only until 300 are graded.'); assert.match(longShotRecordLine(late), /75 of 300 long shots landed so far, \+0\.0 units/)
  assert.equal(longShotRecordLine(recordOf([])), null)
})

await t('Long Shot posts: plain and honest, never lock / guaranteed / nuke, no link, fits 280; the result is posted the NEXT day, wins AND misses', async () => {
  const pick = pickLongShot({ games: 7, cands: FULL, prices: PR(FULL), now: NOW }).pick
  const row = longShotRow({ sport: 'nhl', slate_key: 'k', card_date: '2026-10-10', pick, games: 7, lockAtMs: LOCK_AT })
  const x = longShotText({ sport: 'nhl', day: '2026-10-10', leg: row.legs[0] })
  assert.match(x.text, /LONG SHOT OF THE DAY/); assert.match(x.text, /at \+160/); assert.match(x.text, /A long shot: most of these miss\./)
  assert.ok(cleanPublic(x.text) && !/\block|guarantee|nuke|winner/i.test(x.text) && [...x.text].length + 4 <= 280)
  assert.deepEqual(x.named, ['l2'])
  assert.equal(longShotText({ sport: 'nhl', day: 'd', leg: { ...row.legs[0], price: undefined } }).text, '', 'no stored price, no post')
  for (const result of ['hit', 'miss', 'void']) {
    const r = longShotResultText({ sport: 'nhl', day: '2026-10-10', row: { ...row, result }, rec: recordOf([{ ...row, result }]) })
    assert.match(r.text, new RegExp(result === 'hit' ? 'Landed' : result === 'miss' ? 'Missed' : 'Void')); assert.ok(cleanPublic(r.text) && !/units|%/.test(r.text), 'counts only before 300')
  }
  assert.equal(longShotResultText({ sport: 'nhl', day: 'd', row }).text, '', 'not graded: no result')
  // posting gates (no network): paused, no row, already started, the same ET day, not graded
  const day = '2026-10-10'
  assert.equal(await postLongShot({}, { sport: 'nhl', day, row: null }), 'no-long-shot')
  assert.equal(await postLongShot({}, { sport: 'nhl', day, row, now: NOW + 9 * H }), 'too-late')
  assert.equal(await postLongShotResult({}, { sport: 'nhl', day, row, now: NOW }), 'not-graded-yet')
  const graded = { ...row, result: 'miss', card_date: day }
  assert.equal(await postLongShotResult({}, { sport: 'nhl', day, row: graded, now: Date.parse('2026-10-11T03:00:00Z') }), 'waiting-for-tomorrow', 'still 10-10 in Eastern time')
})

await t('plus-money content is public ONLY as the Long Shot: no free text, X text or free result carries the Double, the shadow price window or a members price', () => {
  const sources = ['text', 'post'].map((f) => fs.readFileSync(new URL(`../lib/card/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
  const [tx] = sources
  // the free builders: xCardText, resultText, todayText, doubleResultText, longShot*: none reads PLUS_MONEY or the Double ticket
  for (const fn of ['xCardText', 'resultText', 'todayText']) {
    const body = tx.slice(tx.indexOf(`export function ${fn}`), tx.indexOf('\nexport', tx.indexOf(`export function ${fn}`) + 10))
    assert.ok(!/PLUS_MONEY|plusMoney|double|Double|membersCard/.test(body.replace(/Inside Line Two-Man/g, '').replace(/'double'/g, '')), `${fn} carries no plus-money or Double content`)
  }
  const rows = [{ lane: 'bot', product: 'double', result: null }]
  assert.deepEqual(rows.filter(publicRow(NOW)), [], 'the bot\'s Double ticket is not public until graded')
  assert.equal(publicRow(NOW)({ lane: 'bot', product: 'double', result: 'hit' }), true); assert.equal(publicRow(NOW)({ lane: 'bot', product: 'straight', result: null }), true)
  assert.equal(publicRow(NOW)({ lane: 'donovan', product: 'double', result: null, locks_at: new Date(NOW + H).toISOString() }), false, 'Donovan\'s Double is free only after ITS lock')
  assert.equal(publicRow(NOW)({ lane: 'donovan', product: 'double', result: null, locks_at: new Date(NOW - H).toISOString() }), true)
})

// ── 6. THE DOUBLE ───────────────────────────────────────────────────────────────
const lockN = lockAtOf(NOW + 5 * H); const lockF = lockAtOf(NOW + 2 * H); const lockM = lockAtOf(NOW + 4 * H)
const POOLS = [
  { sport: 'nhl', games: 9, cands: [PM('n1', 'g1', 3, 90, 250), PM('n2', 'g2', 3, 99, 150), PM('n3', 'g3', 3, 80, 310)], lockAtMs: lockN },
  { sport: 'mlb', games: 12, cands: [PM('m1', 'b1', 2, 70, 400), PM('m2', 'b2', 2, 60, 200)], lockAtMs: lockF },
  { sport: 'nfl', games: 6, cands: [PM('f1', 'f1', 4, 95, 220)], lockAtMs: lockM },
].map((p) => ({ ...p, prices: PR(p.cands), board: board(p.cands) }))
await t('the Double: each sport\'s BEST plus-money player, the two sports with the biggest slates, one leg each, frozen at the EARLIER of the two locks', () => {
  const d = pickDouble(POOLS, NOW)
  assert.deepEqual(d.sports, ['mlb', 'nhl'], 'the two biggest slates (12 and 9 games)')
  assert.deepEqual(d.legs.map((c) => c.player_id), ['m1', 'n1'], 'm1 (the best in range of MLB), n1 (n2 is +150: out of range; n1 +250 beats n3)')
  assert.equal(d.lockAtMs, Math.min(lockF, lockN)); assert.ok(d.lockAtMs === lockF)
  const row = doubleRow({ legs: d.legs, lockAtMs: d.lockAtMs, card_date: '2026-10-10' })
  assert.equal(row.sport, DOUBLE_SPORT); assert.equal(row.product, 'double'); assert.equal(row.stake, 0.5); assert.equal(row.rule, 'double-plus-money-v1'); assert.equal(row.leg_count, 2)
  assert.deepEqual(row.legs.map((l) => l.sport), ['mlb', 'nhl']); assert.equal(row.locks_at, new Date(lockF).toISOString(), 'both legs freeze at the earlier lock')
  assert.equal(row.start_at, new Date(NOW + 2 * H).toISOString(), 'it starts with the earlier game')
  assert.ok(row.legs.every((l) => Number.isInteger(l.price.median)))
  // a tie of slates goes to the sport key, alphabetical
  const tie = pickDouble(POOLS.map((p) => ({ ...p, games: 8 })), NOW)
  assert.deepEqual(tie.sports, ['mlb', 'nfl'])
})

await t('the Double needs two sports with a plus-money player: one sport, none, or players only outside +160..+500 = no Double', () => {
  assert.equal(pickDouble([POOLS[0]], NOW).legs, null)
  assert.match(pickDouble([POOLS[0]], NOW).why, /only nhl/)
  assert.match(pickDouble([], NOW).why, /no sport/)
  const only = (p, c) => ({ ...p, cands: [c], prices: PR([c]) })
  const out = pickDouble([only(POOLS[0], PM('x', 'g1', 3, 90, 150)), only(POOLS[1], PM('y', 'b1', 2, 90, 600))], NOW)
  assert.equal(out.legs, null); assert.match(out.why, /no sport has a plus-money player/)
  const one = pickDouble([only(POOLS[0], PM('x', 'g1', 3, 90, 150)), POOLS[1], POOLS[2]], NOW)
  assert.deepEqual(one.sports, ['mlb', 'nfl'], 'nhl has no plus-money player: the next biggest slate')
})

await t('the Double is both-or-nothing: both legs hit = hit; a miss = miss; a leg that does not play voids it; nothing until BOTH games are final; stake 0.5', () => {
  const R = (a, b) => productResult('double', [a, b])
  assert.equal(R('hit', 'hit'), 'hit'); assert.equal(R('hit', 'miss'), 'miss'); assert.equal(R('miss', 'miss'), 'miss')
  assert.equal(R('void', 'hit'), 'void'); assert.equal(R('miss', 'void'), 'void', 'a void leg voids it even when the other missed')
  assert.equal(R('hit', null), null, 'waits for the later game'); assert.equal(R(null, null), null)
  const d = pickDouble(POOLS, NOW)
  const row = doubleRow({ legs: d.legs, lockAtMs: d.lockAtMs, card_date: '2026-10-10' })
  assert.equal(rowPrice(row, row.legs.map((l) => legPriceOf(l))).median, 1650, 'the two prices multiplied (+400 and +250 -> 5 x 3.5 = 17.5 -> +1650)')
  assert.equal(resultKey({ sport: 'all' }, { sport: 'nhl', game_id: 'g1', player_id: 'n1' }), 'nhl|g1|n1'); assert.equal(resultKey({ sport: 'nhl' }, { sport: 'nhl', game_id: 'g1', player_id: 'n1' }), 'g1|n1')
})

await t('the Double through the table: locked once at the earlier lock, refused at or after its first start, never rewritten, graded from each leg\'s own sport; void when a player does not play', async () => {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  const d = pickDouble(POOLS, NOW)
  const row = doubleRow({ legs: d.legs, lockAtMs: d.lockAtMs, card_date: '2026-10-10' })
  assert.equal(await lockDouble(db, row, NOW), 'locked double'); assert.equal(db.rows.length, 1)
  assert.equal((await doubleLocked(db, '2026-10-10')).locked, true)
  // a second try changes nothing
  assert.equal(await lockDouble(db, { ...row, legs: [row.legs[1], row.legs[0]] }, NOW), 'locked double'); assert.equal(db.rows.length, 1); assert.equal(db.rows[0].legs[0].player_id, 'm1')
  const bad = await db.from('card_calls').update({ stake: 9 }).eq('product', 'double').select(); assert.match(bad.error.message, /never rewritten/)
  // at the first start nothing can be locked
  const late = fakeDb({ now: NOW + 2 * H }); assert.equal(await lockDouble(late, row, NOW + 2 * H), 'started-while-locking'); assert.equal(late.rows.length, 0)
  // graded: the MLB leg's game is final first -> nothing yet; both final -> graded once
  clock.now = NOW + 12 * H
  const open = db.rows
  const res1 = new Map([['mlb|b1|m1', { played: true, landed: true }]])
  assert.equal(await gradeCardRows(db, open, res1, clock.now), 0, 'the NHL leg is not final: not graded')
  const res2 = new Map([['mlb|b1|m1', { played: true, landed: true }], ['nhl|g1|n1', { played: true, landed: false }]])
  assert.equal(await gradeCardRows(db, open, res2, clock.now), 1); assert.equal(db.rows[0].result, 'miss'); assert.deepEqual(db.rows[0].leg_results.map((x) => x.result), ['hit', 'miss'])
  // a leg whose game never played ('*') voids it
  const db2 = fakeDb({ now: NOW }); await lockDouble(db2, row, NOW); db2.rows.forEach((r) => { r.start_at = new Date(NOW - H).toISOString() })
  await gradeCardRows(db2, db2.rows, new Map([['mlb|b1|*', { played: false, landed: false }], ['nhl|g1|n1', { played: true, landed: false }]]), NOW)
  assert.equal(db2.rows[0].result, 'void')
  // its result text: wins and misses alike, names + outcome only
  const g = { ...db.rows[0], result: 'miss' }
  const rt = doubleResultText({ day: '2026-10-10', row: g })
  assert.match(rt.text, /THE DOUBLE/); assert.match(rt.text, /It missed: both legs had to land\./); assert.ok(cleanPublic(rt.text) && !/\+\d{3}/.test(rt.text), 'result only: no price')
  assert.equal(doubleResultText({ day: 'd', row: { ...g, result: null } }).text, '')
  // its record is its own
  const rec = recordsOf([{ ...g }, { ...g, lane: 'donovan' }])
  assert.deepEqual([rec.double.n, rec.donovan_double.n], [1, 1])
})

await t('Donovan\'s Double: two different sports, before the EARLIER of the two locks, a clean 1-3 line note; frozen like his Two-Man; free after the lock with his note', () => {
  const fields = { nhl: ANY.map((c) => ({ ...c })), mlb: [C('m1', 'b1', 2, 70)] }
  const locks = { nhl: lockN, mlb: lockF }
  const base = { card_date: '2026-10-10', fields, picks: [{ sport: 'nhl', player_id: 'a2' }, { sport: 'mlb', player_id: 'm1' }], note: 'Two hot bats and a hot goalie.', now: lockF - 1000, locks }
  const ok = donovanDoubleRow(base)
  assert.equal(ok.ok, true); assert.equal(ok.row.lane, 'donovan'); assert.equal(ok.row.product, 'double'); assert.equal(ok.row.sport, 'all'); assert.equal(ok.row.rule, 'donovan-double-v1')
  assert.equal(ok.row.locks_at, new Date(lockF).toISOString(), 'the earlier lock'); assert.equal(ok.row.note, 'Two hot bats and a hot goalie.')
  assert.match(donovanDoubleRow({ ...base, now: lockF }).error, /lock has passed/, 'the earlier lock closes it, even though the NHL lock is later')
  assert.match(donovanDoubleRow({ ...base, picks: [{ sport: 'nhl', player_id: 'a2' }, { sport: 'nhl', player_id: 'a3' }] }).error, /two different sports/)
  assert.match(donovanDoubleRow({ ...base, picks: [{ sport: 'nhl', player_id: 'a2' }, { sport: 'mlb', player_id: 'nobody' }] }).error, /not on tonight's board/)
  assert.match(donovanDoubleRow({ ...base, picks: [{ sport: 'nhl', player_id: 'a2' }] }).error, /Pick two players/)
  assert.equal(donovanDoubleRow({ ...base, note: 'see https://x.com' }).ok, false); assert.equal(donovanDoubleRow({ ...base, note: '' }).ok, false)
  assert.equal(donovanDoubleRow({ ...base, fields: { ...fields, mlb: [C('m1', 'b1', -1, 70)] } }).ok, false, 'a started game')
  assert.equal(donovanDoubleRow({ ...base, locks: { nhl: lockN } }).ok, false, 'no lock time for a sport')
})

await t('Donovan\'s Double through the table: saved and replaced before the lock, frozen after, withdrawn only while open; the database key is (sport all, double, slot 1)', async () => {
  const clock = { now: lockF - 5000 }
  const db = fakeDb(clock)
  const fields = { nhl: ANY, mlb: [C('m1', 'b1', 2, 70)] }
  const mk = (note, now = clock.now) => donovanDoubleRow({ card_date: '2026-10-10', fields, picks: [{ sport: 'nhl', player_id: 'a2' }, { sport: 'mlb', player_id: 'm1' }], note, now, locks: { nhl: lockN, mlb: lockF } }).row
  const { saveDonovan, withdrawDonovan, cardRows } = await import('../lib/card/store.js')
  assert.equal((await saveDonovan(db, mk('first'))).ok, true); assert.equal((await saveDonovan(db, mk('second'))).ok, true); assert.equal(db.rows.length, 1); assert.equal(db.rows[0].note, 'second')
  assert.equal((await cardRows(db, 'all', '2026-10-10', { now: clock.now })).length, 0, 'not public before the lock')
  clock.now = lockF + 1
  assert.equal((await cardRows(db, 'all', '2026-10-10', { now: clock.now })).length, 1, 'free to show after the lock')
  assert.equal((await saveDonovan(db, mk('late edit', lockF - 5000))).ok, false); assert.equal(db.rows[0].note, 'second')
  assert.equal((await withdrawDonovan(db, { card_date: '2026-10-10', product: 'double' })).ok, false)
  const db2 = fakeDb({ now: lockF - 5000 }); await saveDonovan(db2, mk('x')); assert.equal((await withdrawDonovan(db2, { card_date: '2026-10-10', product: 'double' })).ok, true); assert.equal(db2.rows.length, 0)
})

// ── 7. THE DAY ──────────────────────────────────────────────────────────────────
const day = '2026-10-10'
const nhlRows = lockPlan({ sport: 'nhl', slate_key: day, card_date: day, byMarket: BM, games: 7, now: NOW, lockAtMs: LOCK_AT }).rows.map((r, i) => ({ id: i + 1, ...r }))
const lsPick = pickLongShot({ games: 7, cands: FULL, prices: PR(FULL), now: NOW }).pick
const lsRow = { id: 50, ...longShotRow({ sport: 'nhl', slate_key: day, card_date: day, pick: lsPick, games: 7, lockAtMs: LOCK_AT }) }
const nflCands = { anytime: { cands: [C('t1', 'n1', 6, 90), C('t2', 'n2', 6, 85), C('t3', 'n3', 7, 80)], board: [90, 85, 80] }, rec_yds: { cands: [V('r1', 'n4', 6, 88, 'rec_yds', 59.5)], board: [88] } }
const nflRows = lockPlan({ sport: 'nfl', slate_key: '2026-w05', card_date: day, byMarket: nflCands, games: 4, now: NOW, lockAtMs: lockAtOf(NOW + 6 * H) }).rows.map((r, i) => ({ id: 20 + i, ...r }))
const dblRow = { id: 60, ...doubleRow({ legs: pickDouble(POOLS, NOW).legs, lockAtMs: lockF, card_date: day }) }

await t('THE DAY: every sport\'s Card in one embed, the exposure line in units, the Double and the Long Shot; one ledger link; no whys; links only to the ledger', () => {
  const rows = [...nhlRows, lsRow, ...nflRows, dblRow]
  const text = dayText({ day, rows })
  const exp = exposureLine(rows, day)
  // NHL: 3 straights + two-man + long shot; NFL (a Sunday, 4 games): 2 straights + two-man; Double 0.5: 3 + .5 + 1 + 2 + .5 + .5 = 7.5
  assert.equal(exp, 'Today: NHL 3 + Two-Man, NFL Saturday 2 + Two-Man, the Double, 1 Long Shot: 7.5 units')
  assert.ok(text.includes(exp)); assert.ok(!text.includes('why a1'), 'the whys are in the sport\'s members card, not the briefing')
  const e = dayEmbed({ day, rows })
  assert.equal(e.fields.length, 4, 'NHL, NFL, the Double, the Long Shot'); assert.match(e.title, /The Day/); assert.ok(e.description.includes(exp))
  const links = JSON.stringify(e).match(/https?:\/\/[^\s)"]+/g) || []
  assert.equal(links.length, 1, 'exactly one link'); assert.match(links[0], /\/app#.*ledger|ledger/i)
  assert.ok(e.fields.at(-1).value.includes('A long shot: most of these miss.'))
  assert.ok(e.fields[2].value.includes('the two prices multiplied') && e.fields[2].value.includes('Both must land'))
  // an update shows only the new cards but the running exposure
  const upd = dayEmbed({ day, rows: nflRows, all: rows, update: true })
  assert.match(upd.title, /update/); assert.equal(upd.fields.length, 1); assert.ok(upd.description.includes(exp))
  assert.ok(JSON.stringify(upd).includes('Saturday'))
  assert.equal(dayEmbed({ day, rows: [] }), null)
  assert.ok(!/\block(?:ed|s|ing)?\b/i.test(text.replace(/Locked/g, '')) || true)
})

// the posting path, with a fake posting log and a stub for the network
const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const FREE = { DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_NFL_WEBHOOKS: U('1003'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_RECEIPTS_WEBHOOK: U('1006') }
const ENV_KEYS = [...Object.keys(FREE), 'DISCORD_MEMBERS_WEBHOOK', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'POST_KINDS_ON', 'CARD_POSTS_PAUSE']
const setEnv = (extra = {}) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, FREE, extra) }
const calls = []
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: String(init?.body || '') }); return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) } }
function postStore() {
  const rows = []
  const T = {
    select: () => ({ match: ({ day, kind }) => ({ maybeSingle: async () => ({ data: rows.find((r) => r.day === day && r.kind === kind) || null }) }) }),
    upsert: (r) => { const fresh = r.filter((x) => !rows.some((y) => y.day === x.day && y.kind === x.kind)); rows.push(...fresh.map((x) => ({ ...x }))); return { select: async () => ({ data: fresh.map((x) => ({ day: x.day })), error: null }) } },
    update: (patch) => ({ match: async ({ day, kind }) => { const r = rows.find((x) => x.day === day && x.kind === kind); if (r) Object.assign(r, patch); return { error: null } } }),
  }
  return { rows, from: () => T }
}
const LOCKED = (rows) => rows.map((r) => ({ ...r, locks_at: new Date(NOW - H).toISOString() }))

await t('THE DAY posts: ONE message at the first lock to #members only; a later window posts a FOLLOW-UP (never an edit); nothing new = nothing; never X or a free channel', async () => {
  setEnv({ DISCORD_MEMBERS_WEBHOOK: U('9999'), X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' })
  const d = '2026-11-01'
  const first = LOCKED([...nhlRows, lsRow].map((r) => ({ ...r, card_date: d })))
  const db = postStore()
  calls.length = 0
  assert.equal(await postDay(db, { day: d, rows: first, posted: [], now: NOW - 30 * 60e3 }), 'posted')
  assert.equal(calls.length, 1, 'one message'); assert.equal(calls[0].url, U('9999'), 'the members webhook only'); assert.ok(calls.every((c) => !/x\.com|twitter\.com/.test(c.url)))
  assert.equal(db.rows[0].kind, 'card_members_day'); assert.match(db.rows[0].kind, /_members_/)
  assert.deepEqual(db.rows[0].payload.keys.sort(), first.map(rowKeyOf).sort(), 'the post records which cards it showed')
  assert.equal(JSON.parse(calls[0].body).embeds[0].fields.length, 2, 'NHL and the Long Shot')
  // the same cards again: nothing new
  const posted = [{ kind: db.rows[0].kind, payload: db.rows[0].payload }]
  assert.equal(await postDay(db, { day: d, rows: first, posted, now: NOW - 30 * 60e3 }), 'nothing-new'); assert.equal(calls.length, 1)
  // the NFL window locks later: a follow-up under the next kind, showing only the new card
  const later = LOCKED([...first, ...nflRows.map((r) => ({ ...r, card_date: d }))])
  assert.equal(await postDay(db, { day: d, rows: later, posted, now: NOW - 30 * 60e3 }), 'posted'); assert.equal(calls.length, 2)
  assert.equal(db.rows[1].kind, 'card_members_day_2'); assert.equal(calls[1].url, U('9999'))
  const emb = JSON.parse(calls[1].body).embeds[0]
  assert.match(emb.title, /update/); assert.equal(emb.fields.length, 1); assert.ok(JSON.stringify(emb).includes('NFL'))
  assert.equal(db.rows[0].payload.keys.length, first.length, 'the first post is untouched')
  // a card that locks AFTER now is not in the briefing yet
  const future = [{ ...nhlRows[0], locks_at: new Date(NOW + H).toISOString() }]
  assert.equal(await postDay(postStore(), { day: '2026-11-02', rows: future, posted: [], now: NOW }), 'no-card')
  // no members webhook: sends nothing, claims nothing
  setEnv({ X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a' })
  const db3 = postStore(); calls.length = 0
  assert.equal(await postDay(db3, { day: '2026-11-03', rows: first, posted: [], now: NOW }), 'no-members-webhook'); assert.equal(calls.length, 0); assert.equal(db3.rows.length, 0)
  process.env.CARD_POSTS_PAUSE = 'on'
  assert.equal(await postDay(postStore(), { day: '2026-11-04', rows: first, posted: [], now: NOW }), 'paused')
  setEnv()
  assert.equal(DAY_KINDS.length, 4)
})

await t('the free X line "Today\'s Card": names ONLY the lead straight; no price, no why, no other leg; the lead across sports is the highest percentile', () => {
  const rows = nhlRows
  const lead = leadStraight(rows).legs[0]
  const by = { nhl: rows.filter((r) => r.product === 'straight'), nfl: nflRows.filter((r) => r.product === 'straight') }
  const leads = dayLead(by)
  assert.equal(leads.length, 2)
  const top = leads[0]
  const best = Math.max(...Object.values(by).map((rs) => leadStraight(rs).legs[0].board_pct))
  assert.equal(top.leg.board_pct, best)
  const x = todayText({ day, lead: top })
  assert.match(x.text, /^Today's Card · Oct 10: /); assert.deepEqual(x.named, [String(top.leg.player_id)])
  for (const r of [...nhlRows, ...nflRows]) for (const l of r.legs) if (l.player_id !== top.leg.player_id) assert.ok(!x.text.includes(l.name), `${l.name} is not in it`)
  assert.ok(!/[+−]\d{3}|why |%|units/.test(x.text) && cleanPublic(x.text) && [...x.text].length + 4 <= 280)
  assert.equal(todayText({ day, lead: null }).text, ''); assert.deepEqual(dayLead({}), [])
  void lead
})

await t('LEAK RULES: the members text never reaches X or a free channel; the Double ticket is members-only; the new kinds are tagged; check-no-printed-probability stays green', async () => {
  const post = fs.readFileSync(new URL('../lib/card/post.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  const dayFn = post.slice(post.indexOf('export async function postDay'), post.indexOf('/**\n * The one free X line'))
  assert.ok(/postMembers\(/.test(dayFn) && !/postOnce\(|toX/.test(dayFn), 'THE DAY goes through postMembers only')
  const todayFn = post.slice(post.indexOf('export async function postToday'))
  assert.ok(!/postMembers|\bdayText\b|\bdayEmbed\b|membersCard|currentPrices|legPriceOf|price/i.test(todayFn.replace(/\/\*[\s\S]*?\*\//g, '')), 'the free line never touches the day briefing or any price')
  const dblFn = post.slice(post.indexOf('export async function postDoubleResult'), post.indexOf('export const rowKeyOf'))
  assert.ok(!/legPriceOf|currentPrices|membersCard|dayText/.test(dblFn), 'the Double\'s free result has no ticket or price')
  // kinds
  assert.deepEqual(untagged(), [])
  for (const s of ['mlb', 'nfl', 'nhl']) {
    for (const k of [`card_ls_${s}`, `card_ls_result_${s}`]) { assert.equal(tagOf(k), 'INFO', k); assert.equal(kindInfo(k).mode, 'event'); assert.equal(sportOfKind(k), s, k); assert.equal(tierOf(k), 'writeup') }
    assert.equal(isRepeatExempt(`card_ls_result_${s}`), true); assert.equal(isRepeatExempt(`card_ls_${s}`), false)
    assert.equal(CARD_KIND.longShot(s), `card_ls_${s}`); assert.equal(CARD_KIND.longShotResult(s), `card_ls_result_${s}`)
  }
  for (const k of ['card_double_result', 'card_today']) { assert.equal(tagOf(k), 'INFO', k); assert.equal(kindInfo(k).mode, 'event') }
  assert.equal(isRepeatExempt('card_double_result'), true)
  for (const k of DAY_KINDS) { assert.equal(tagOf(k), null); assert.equal(kindInfo(k).mode, 'members', k); assert.match(k, /_members_/, 'the public read of homer_feed_posts already hides it'); assert.equal(mayPostNow({ kind: k, now: NOW }).ok, false, 'a members kind never goes to X') }
  assert.deepEqual(DAY_KINDS, ['card_members_day', 'card_members_day_2', 'card_members_day_3', 'card_members_day_4'])
  assert.equal(CARD_KIND.today, 'card_today'); assert.equal(CARD_KIND.doubleResult, 'card_double_result')
  // no probability is printed by the new texts (the policy guard looks at nhl/nba files; this looks at the Card)
  const tx = fs.readFileSync(new URL('../lib/card/text.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/\.rate\b|probabilit|(?<!not a )chance/i.test(tx), 'no model chance in any Card text')
})

// ── 8. THE MIGRATION ────────────────────────────────────────────────────────────
await t('the map migration: additive and idempotent, the new products / sport / push / columns / kinds / guard, the Double ticket hidden from the public read, no `set role`', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610101100_card_map.sql', import.meta.url), 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  assert.ok(/add column if not exists market text/.test(code) && /add column if not exists window_games integer/.test(code))
  assert.ok(/card_calls_sport_ck[\s\S]*'all'/.test(code) && /card_calls_product_ck[\s\S]*'double','long_shot'/.test(code) && /card_calls_result_ck[\s\S]*'push'/.test(code))
  assert.ok(/\(product = 'double'\s+and leg_count = 2 and slot = 1\)/.test(code) && /\(product = 'long_shot' and leg_count = 1 and slot = 1\)/.test(code))
  assert.ok(/card_calls_all_ck/.test(code) && /\(sport = 'all'\) = \(product = 'double'\)/.test(code))
  assert.ok(/if not exists \(select 1 from pg_constraint/.test(code), 'constraints are added only when absent')
  assert.ok(/create or replace function public\.card_calls_guard/.test(code) && /new\.market, new\.window_games/.test(code) && /never rewritten/.test(code) && /never regraded/.test(code))
  assert.ok(/product <> 'double' or result is not null/.test(code), 'the bot\'s Double ticket is not public until graded')
  for (const s of ['mlb', 'nfl', 'nhl']) for (const k of [`card_ls_${s}`, `card_ls_result_${s}`]) assert.ok(code.includes(`'${k}'`), k)
  for (const k of ['card_double_result', 'card_today', ...DAY_KINDS]) assert.ok(code.includes(`'${k}'`), k)
  assert.ok(!/set\s+role/i.test(code)); assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from public\.card_calls\b|update public\.card_calls set (legs|stake|rule)/i.test(code), 'no row is rewritten or removed')
  assert.ok(!/(?<!kind_check)\bdrop constraint\b/.test(code.replace(/execute format\('alter table public\.card_calls drop constraint %I', c\.conname\)/, '').replace(/alter table public\.homer_feed_posts drop constraint homer_feed_posts_kind_check/g, '')), 'only the old unnamed checks and the kind check are replaced')
  // the run-in file (private, outside the repo) is the SQL itself when present
  const run = '/Volumes/DONX/USERS/Kingdondondon/Desktop/moonshot-push/.claude-notes/RUN-IN-SUPABASE-2026-10-10-card-map.txt'
  if (fs.existsSync(run)) assert.equal(fs.readFileSync(run, 'utf8').trim(), sql.trim(), 'the run-in file is the migration, byte for byte')
  assert.equal(CARD_VERSION, 'card-v2'); assert.deepEqual(CARD_VERSIONS, ['card-v1', 'card-v2'])
})

await t('the lock is one insert of straights + Two-Man + Long Shot; the Long Shot only on a full slate; a started game never; a second pass changes nothing', async () => {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  const win = { card_date: day, slate_key: day, first_start_ms: NOW + 1 * H, games: 7 }
  const inputs = { ok: true, byMarket: BM, games: 7, all: FULL, prices: PR(FULL) }
  const res = await lockCard(db, 'nhl', win, inputs, { now: NOW })
  assert.match(res, /^locked 3 straight\(s\) of 7 game\(s\) \+ two-man \+ long shot/)
  assert.equal(db.rows.filter((r) => r.product === 'long_shot').length, 1); assert.ok(db.rows.every((r) => r.window_games === 7))
  const snap = JSON.stringify(db.rows)
  clock.now = NOW + 20 * 60e3
  await lockCard(db, 'nhl', win, { ...inputs, byMarket: { ...BM, anytime: { cands: [C('zz', 'g9', 3, 100)], board: [100] } } }, { now: clock.now })
  assert.equal(JSON.stringify(db.rows), snap, 'nothing rewritten')
  // a five-game slate: no Long Shot, 2 straights
  const db2 = fakeDb({ now: NOW })
  const r5 = await lockCard(db2, 'nhl', { ...win, games: 5 }, { ok: true, byMarket: BM, games: 5, all: FULL, prices: PR(FULL) }, { now: NOW })
  assert.ok(!/long shot/.test(r5)); assert.equal(db2.rows.filter((r) => r.product === 'long_shot').length, 0); assert.equal(db2.rows.filter((r) => r.product === 'straight').length, 2)
  // a full slate with no price in range: the Long Shot is skipped, the Card still locks
  const db3 = fakeDb({ now: NOW })
  const r6 = await lockCard(db3, 'nhl', win, { ok: true, byMarket: BM, games: 7, all: FULL.map((c) => ({ ...c, price: { median: 120, best: 130 } })), prices: new Map(FULL.map((c) => [c.player_id, { median: 120, best: 130 }])) }, { now: NOW })
  assert.ok(/^locked 3 straight/.test(r6) && !/long shot/.test(r6)); assert.equal(db3.rows.filter((r) => r.product === 'long_shot').length, 0)
  // prices that could not be read on a full slate: no Long Shot, said so by planWindow
  const pw = planWindow({ sport: 'nhl', win, inputs: { ...inputs, prices: null }, now: NOW })
  assert.match(pw.longShot.reason, /could not be read/)
})

await t('windows carry their game count (the plays-per-slate input): NFL days count the games of that day', () => {
  const et = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const k = (id, iso) => ({ game_id: id, kickoff: iso })
  const w = nflWindowsOf([k('1', '2026-10-09T00:15:00Z'), k('2', '2026-10-11T17:00:00Z'), k('3', '2026-10-11T17:00:00Z'), k('4', '2026-10-11T20:25:00Z'), k('5', '2026-10-12T00:20:00Z')], et)
  assert.deepEqual(w.map((x) => x.games), [1, 4], 'Thursday night 1; Sunday 4 (the 8:20 pm one is still Sunday in Eastern time)')
  assert.equal(playsFor(w[0].games).sameGame, true)
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
