// The cooldown (lib/card/cooldown.js). Test data is labelled TEST.
import assert from 'node:assert/strict'
import { coolDownSet, withoutCooled, cooldownOn } from '../lib/card/cooldown.js'
let failed = 0
const t = async (n, f) => { try { await f(); console.log(`PASS  ${n}`) } catch (e) { failed++; console.log(`FAIL  ${n}\n      ${e.message}`) } }
const leg = (id, sport = 'mlb') => ({ player_id: id, name: `TEST ${id}`, sport })
const row = (d, id, result, sport = 'mlb', extra = {}) => ({ sport, card_date: d, result, legs: [leg(id, sport)], leg_results: null, ...extra })

await t('off unless CARD_COOLDOWN_ON', () => { delete process.env.CARD_COOLDOWN_ON; assert.equal(cooldownOn(), false); process.env.CARD_COOLDOWN_ON = 'on'; assert.equal(cooldownOn(), true); delete process.env.CARD_COOLDOWN_ON })
await t('three Card days running, all misses = cooled', () => {
  const s = coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'a', 'miss'), row('2026-10-26', 'a', 'miss')], 'mlb')
  assert.deepEqual([...s.keys()], ['a'])
})
await t('one hit in the stretch keeps him (a man who is hitting stays)', () => {
  assert.equal(coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'a', 'hit'), row('2026-10-26', 'a', 'miss')], 'mlb').size, 0)
})
await t('missing a day, or only two days, is not three running', () => {
  assert.equal(coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'b', 'miss'), row('2026-10-26', 'a', 'miss')], 'mlb').size, 0)
  assert.equal(coolDownSet([row('2026-10-25', 'a', 'miss'), row('2026-10-26', 'a', 'miss')], 'mlb').size, 0)
})
await t('an ungraded or void leg is not a miss', () => {
  assert.equal(coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'a', null), row('2026-10-26', 'a', 'miss')], 'mlb').size, 0)
  assert.equal(coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'a', 'void'), row('2026-10-26', 'a', 'miss')], 'mlb').size, 0)
})
await t('a Double leg counts for its own sport, by its own leg result', () => {
  const dbl = (d, r2) => ({ sport: 'all', card_date: d, result: 'miss', legs: [leg('n1', 'nhl'), leg('a', 'mlb')], leg_results: [{ player_id: 'n1', result: 'hit' }, { player_id: 'a', result: r2 }] })
  assert.deepEqual([...coolDownSet([dbl('2026-10-24', 'miss'), dbl('2026-10-25', 'miss'), row('2026-10-26', 'a', 'miss')], 'mlb').keys()], ['a'])
  assert.equal(coolDownSet([dbl('2026-10-24', 'miss'), dbl('2026-10-25', 'miss'), dbl('2026-10-26', 'miss')], 'nhl').size, 0, 'the NHL leg hit')
})
await t('another sport is untouched; withoutCooled drops only the cooled', () => {
  const s = coolDownSet([row('2026-10-24', 'a', 'miss'), row('2026-10-25', 'a', 'miss'), row('2026-10-26', 'a', 'miss')], 'nhl')
  assert.equal(s.size, 0)
  const cool = new Map([['a', { name: 'TEST a' }]])
  assert.deepEqual(withoutCooled([{ player_id: 'a' }, { player_id: 'b' }], cool).map((c) => c.player_id), ['b'])
  assert.equal(withoutCooled([{ player_id: 'a' }], new Map()).length, 1)
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
