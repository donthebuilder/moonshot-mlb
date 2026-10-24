// LAMP ATG DEVIG (2026-10-24). TEST DATA below is invented for this check only, never shown or stored.
// run: node --import ./scripts/_esm-resolve.mjs scripts/check-atg-devig.mjs
import assert from 'node:assert/strict'
import { devigRows, EV_FLAG, METHOD } from '../lib/odds/devig.js'
import { matchMarket, dateSlug } from '../lib/odds/kalshi.js'
import { saveAtgDevig } from '../lib/odds/devigStore.js'

const base = { sport: 'nhl', market: 'goal', event_id: 'TEST_EV', game_date: '2026-10-23', starts_at: '2026-10-23T23:00:00Z', snap: 'list', taken_at: '2026-10-23T11:00:00Z', available: true }
// TEST: fair +300 -> fair prob 25%. A +400 price is +25% EV (0.25*4 - 0.75); a +250 price is -12.5%.
const rows = [
  { ...base, sgo_player_id: 'TEST_A_1_NHL', player_name: 'Test Alpha', our_player_id: '1', book: 'bookx', odds: 400, fair_odds: 300, open_fair_odds: 250 },
  { ...base, sgo_player_id: 'TEST_A_1_NHL', player_name: 'Test Alpha', our_player_id: '1', book: 'booky', odds: 250, fair_odds: 300, open_fair_odds: 250 },
  { ...base, sgo_player_id: 'TEST_B_2_NHL', player_name: 'Test Beta', our_player_id: null, book: 'bookx', odds: -150, fair_odds: -200 },
  { ...base, sgo_player_id: 'TEST_C_3_NHL', player_name: 'Test Gamma', book: 'bookx', odds: 500, fair_odds: null },        // no fair price: no row
  { ...base, sgo_player_id: 'TEST_D_4_NHL', player_name: 'Test Delta', book: 'bookx', odds: 500, fair_odds: 400, available: false }, // unavailable: no row
]
const out = devigRows(rows)
assert.equal(out.length, 2, 'only players with a fair price and an available book')
const [a, b] = out
assert.equal(a.player_name, 'Test Alpha'); assert.equal(a.best_book, 'bookx'); assert.equal(a.best_odds, 400)
assert.equal(a.best_ev_pct, 25); assert.equal(a.books.booky.ev_pct, -12.5); assert.equal(a.open_fair_odds, 250)
assert.equal(a.method, METHOD); assert.equal(a.kalshi_trusted, null)
// TEST: fair -200 -> 66.67%; a -150 price -> 0.6667*0.6667 - 0.3333 = +11.11%
assert.equal(b.best_ev_pct, 11.11); assert.equal(b.our_player_id, null, 'unmatched stays null')
assert.ok(out[0].best_ev_pct >= out[1].best_ev_pct, 'best EV first')
assert.ok(a.best_ev_pct >= EV_FLAG)
assert.equal(Object.keys(a).some((k) => /prob|pct$/.test(k) && k !== 'best_ev_pct' && k !== 'ev_pct'), false, 'no printed probability field')

// Kalshi: unique surname match only
const mk = [{ ticker: 'KXNHLGOAL-26OCT23TORBOS-BOSPASTA88-1' }, { ticker: 'KXNHLGOAL-26OCT23TORBOS-TORMATTHEWS34-1' }, { ticker: 'KXNHLGOAL-26OCT23AAABBB-AAASMITH1-1' }, { ticker: 'KXNHLGOAL-26OCT23AAABBB-BBBSMITH2-1' }]
assert.equal(matchMarket(mk, 'Auston Matthews').ticker, mk[1].ticker)
assert.equal(matchMarket(mk, 'John Smith'), null, 'two Smiths = no match, never a guess')
assert.equal(matchMarket(mk, 'Nobody Here'), null)
assert.equal(dateSlug('2026-10-03'), '26OCT03')

// store: a failing table is logged and returned, never thrown
const bad = { from: () => ({ upsert: async () => ({ error: { message: 'relation does not exist' } }) }) }
const res = await saveAtgDevig(bad, rows.slice(2, 3), '2026-10-23')
assert.equal(res.rows, 0); assert.match(res.error, /does not exist/)
let wrote = null
const good = { from: (t) => ({ upsert: async (r, o) => { wrote = { t, n: r.length, o }; return { error: null } } }) }
const ok = await saveAtgDevig(good, rows.slice(2, 3), '2026-10-23')
assert.equal(ok.rows, 1); assert.equal(wrote.t, 'lamp_atg_devig'); assert.equal(wrote.o.ignoreDuplicates, true)
console.log('check-atg-devig: OK')
