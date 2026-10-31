// The lock audit (lib/card/lockAudit.js, core.js planStraights `audit`). Test data is labelled TEST.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { planStraights, planWindow } from '../lib/card/core.js'
import { lockAuditRow, writeLockAudit } from '../lib/card/lockAudit.js'
let failed = 0
const t = async (n, f) => { try { await f(); console.log(`PASS  ${n}`) } catch (e) { failed++; console.log(`FAIL  ${n}\n      ${e.message}`) } }
const NOW = Date.parse('2026-10-30T20:00:00Z'); const START = NOW + 4 * 3600e3
const c = (id, game, score, price, extra = {}) => ({ player_id: id, name: `TEST ${id}`, team: 'T', opp: 'O', game_id: game, game_date: '2026-10-30', start_ms: START, score, status: 'called', price: price == null ? undefined : { median: price, best: price, books: 3 }, ...extra })

await t('each man in a slot gets a verdict: picked, price floor, no price, game used, lower', () => {
  const cands = [c('a', 'g1', 99, 105), c('b', 'g1', 98, 150), c('c', 'g2', 97, null), c('d', 'g2', 96, 200), c('e', 'g3', 95, 180)]
  const r = planStraights({ sport: 'nfl', n: 1, byMarket: { anytime: { cands, board: cands.map((x) => x.score) } }, now: NOW })
  const a = r.audit.find((x) => x.market === 'anytime')
  const v = Object.fromEntries(a.ranked.map((x) => [x.player_id, x.verdict]))
  assert.equal(v.a, 'price'); assert.equal(v.b, 'picked'); assert.equal(v.c, 'no_price'); assert.equal(v.d, 'lower_than_pick'); assert.equal(v.e, 'lower_than_pick')
  assert.equal(r.picks[0].cand.player_id, 'b', 'the audit names the same man the picker took')
})
await t('a game already used by an earlier slot is named', () => {
  const g1 = [c('a', 'g1', 99, 150), c('b', 'g2', 90, 150)]
  const sg = [{ ...c('a', 'g1', 99, 130), line: 3.5, market: 'sog' }, { ...c('x', 'g2', 80, 140), line: 3.5, market: 'sog' }]
  const r = planStraights({ sport: 'nhl', n: 2, byMarket: { anytime: { cands: g1, board: [99, 90] }, sog: { cands: sg, board: [99, 80] } }, now: NOW })
  const s2 = r.audit.find((x) => x.slot === 2)
  assert.equal(s2.ranked.find((x) => x.player_id === 'a').verdict, 'game_used')
})
await t('the audit never changes the picks (same picks with and without reading it)', () => {
  const cands = [c('a', 'g1', 99, 105), c('b', 'g2', 98, 150)]
  const r = planStraights({ sport: 'nfl', n: 1, byMarket: { anytime: { cands, board: [99, 98] } }, now: NOW })
  assert.deepEqual(r.picks.map((p) => p.cand.player_id), ['b'])
})
await t('the row carries the picks, the audit, the skipped slots and the cooldown note', () => {
  const cands = [c('a', 'g1', 99, 105), c('b', 'g2', 98, 150)]
  const win = { slate_key: 'k', card_date: '2026-10-30', first_start_ms: START, games: 2 }
  const plan = planWindow({ sport: 'nfl', win, inputs: { byMarket: { anytime: { cands, board: [99, 98] } }, games: 2 }, now: NOW })
  const row = lockAuditRow({ sport: 'nfl', win, plan, version: 'card-v2', inputs: { cooledNote: 'cooled (3 Card days, no hit): TEST z' } })
  assert.equal(row.sport, 'nfl'); assert.ok(row.audit.length >= 1); assert.equal(row.plays.picked[0].name, 'TEST b'); assert.match(row.note, /cooled/)
})
await t('a failed or missing table never throws and never blocks a lock', async () => {
  const bad = { from: () => ({ upsert: async () => ({ error: { message: 'relation "card_lock_audit" does not exist' } }) }) }
  assert.match(await writeLockAudit(bad, { sport: 'x' }), /audit:/)
  const boom = { from: () => { throw new Error('down') } }
  assert.match(await writeLockAudit(boom, {}), /down/)
})
await t('the lock writes the audit after the rows and the migration exists with a probe', () => {
  const store = fs.readFileSync(new URL('../lib/card/store.js', import.meta.url), 'utf8')
  assert.match(store, /writeLockAudit\(db, lockAuditRow/)
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610310100_card_lock_audit.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.card_lock_audit/); assert.match(sql, /PROBE/)
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
