// Long Shots by slate (lib/card/core.js pickLongShots, CARD_LONGSHOTS_N_ON). Test data is labelled TEST.
import assert from 'node:assert/strict'
import { pickLongShots, planWindow, longShotsByGamesOn, CARD_RULE } from '../lib/card/core.js'
let failed = 0
const t = async (n, f) => { try { await f(); console.log(`PASS  ${n}`) } catch (e) { failed++; console.log(`FAIL  ${n}\n      ${e.message}`) } }
const NOW = Date.parse('2026-10-30T20:00:00Z'); const START = NOW + 4 * 3600e3
const cand = (id, game, score, price) => ({ player_id: id, name: `TEST ${id}`, team: 'T', opp: 'O', game_id: game, game_date: '2026-10-30', start_ms: START, score, status: 'called' })
const prices = (o) => new Map(Object.entries(o).map(([k, v]) => [k, { median: v, best: v, books: 3, taken_at: 'x' }]))

await t('off unless CARD_LONGSHOTS_N_ON', () => { delete process.env.CARD_LONGSHOTS_N_ON; assert.equal(longShotsByGamesOn(), false); process.env.CARD_LONGSHOTS_N_ON = 'on'; assert.equal(longShotsByGamesOn(), true); delete process.env.CARD_LONGSHOTS_N_ON })
await t('as many long shots as straights: 1 game 1, 2 games 1, 4 games 2, 8 games 3', () => {
  const cands = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cand(`p${i}`, `g${i}`, 100 - i))
  const pr = prices(Object.fromEntries(cands.map((c) => [c.player_id, 600])))
  for (const [games, want] of [[1, 1], [2, 1], [4, 2], [8, 3]]) assert.equal(pickLongShots({ games, cands, prices: pr, now: NOW }).picks.length, want, `${games} games`)
})
await t('+550 or longer only, one per game, top score first, never an excluded man', () => {
  const cands = [cand('a', 'g1', 99), cand('b', 'g1', 98), cand('c', 'g2', 97), cand('d', 'g3', 96), cand('e', 'g4', 95)]
  const pr = prices({ a: 600, b: 700, c: 400, d: 650, e: 900 })
  const r = pickLongShots({ games: 6, cands, prices: pr, now: NOW, exclude: new Set(['d']) })
  assert.deepEqual(r.picks.map((x) => x.player_id), ['a', 'e'], 'a (g1 top), c is +400 so out, d excluded, e')
})
await t('nobody at +550: no picks and a reason, nothing shorter substituted', () => {
  const r = pickLongShots({ games: 6, cands: [cand('a', 'g1', 99)], prices: prices({ a: 300 }), now: NOW })
  assert.equal(r.picks.length, 0); assert.match(r.reason, /550/)
})
await t('planWindow: switch off = the old single long shot on a 6+ slate only; on = slots 1..n, rule v3, not a man already on the Card', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => cand(`m${i}`, `g${i}`, 100 - i))
  const byMarket = (cs) => ({ anytime: { cands: cs, board: cs.map((c) => c.score) } })
  const cs = mk(4); const pr = prices(Object.fromEntries(cs.map((c, i) => [c.player_id, i === 0 ? 150 : 650])))
  const win = { slate_key: 'k', card_date: '2026-10-30', first_start_ms: START, games: 4 }
  const inputs = { byMarket: byMarket(cs), prices: pr, all: cs, games: 4 }
  delete process.env.CARD_LONGSHOTS_N_ON
  assert.equal(planWindow({ sport: 'nhl', win, inputs, now: NOW }).rows.filter((r) => r.product === 'long_shot').length, 0, 'old rule: 4 games has no long shot')
  process.env.CARD_LONGSHOTS_N_ON = 'on'
  const on = planWindow({ sport: 'nhl', win, inputs, now: NOW }).rows
  const ls = on.filter((r) => r.product === 'long_shot')
  assert.equal(ls.length, 2); assert.deepEqual(ls.map((r) => r.slot), [1, 2]); assert.ok(ls.every((r) => r.rule === CARD_RULE.long_shot_n))
  const carded = new Set(on.filter((r) => r.product !== 'long_shot').flatMap((r) => r.legs.map((l) => l.player_id)))
  assert.ok(ls.every((r) => !carded.has(r.legs[0].player_id)), 'no man on the Card twice')
  delete process.env.CARD_LONGSHOTS_N_ON
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
