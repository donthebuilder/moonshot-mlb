#!/usr/bin/env node
// THE ISSUE-NUMBER BACKFILL (lib/cards/backfill.js) against a FAKE database: order, idempotence, only cards the rules prove, nothing for BUCKETS / a long shot priced after the lock,
// existing numbers kept, the out-of-order note, the dry run writing nothing. TEST rows only; no network.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-backfill-card-issues.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { plan, applyPlan } from '../lib/cards/backfill.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const fakeDb = (seed = []) => {
  const rows = [...seed]
  return { rows, rpcs: 0, rpc: async function (fn, a) {
    this.rpcs += 1
    let r = rows.find((x) => x.card_id === a.p_card_id || x.slot_id === a.p_slot_id)
    if (!r) { r = { card_id: a.p_card_id, slot_id: a.p_slot_id, moment: a.p_moment, issue_no: rows.filter((x) => x.moment === a.p_moment).length + 1, game_day: a.p_game_day }; rows.push(r) }
    return { data: r, error: null }
  } }
}
const hatOn = (day, g) => ({ ...F.TEST_HAT, day, game_id: g })
const items = [
  { key: 'nhl_hat_trick', row: hatOn('2026-02-03', 30) }, { key: 'nhl_hat_trick', row: hatOn('2026-01-05', 10) }, { key: 'nhl_hat_trick', row: hatOn('2026-01-05', 9) },
  { key: 'nhl_hat_trick', row: hatOn('2026-01-05', 9) },                                                     // read twice: one card
  { key: 'nhl_hat_trick', row: { ...F.TEST_HAT, goals: F.TEST_HAT.goals.slice(0, 2) } },                    // 2 goals: no card
  { key: 'nba_40_points', row: { player_id: '1', name: 'T', pts: 45, game_id: '1', day: '2026-01-01' } },    // BUCKETS: never
  { key: 'long_shot_cashed', row: { ...F.TEST_LONG_SHOT, price_source: 'latest' } },                         // priced after the lock: no card
  { key: 'mlb_multi_hr', row: F.TEST_MULTI_HR },
]
await t('the plan orders each moment by game day then id, numbers from 1, and counts only what the rules prove', () => {
  const p = plan(items, [])
  const hats = p.issue.filter((x) => x.args.p_moment === 'nhl_hat_trick')
  assert.deepEqual(hats.map((x) => [x.no, x.args.p_game_day, x.args.p_event_key.split(':')[0]]), [[1, '2026-01-05', '9'], [2, '2026-01-05', '10'], [3, '2026-02-03', '30']])
  assert.equal(p.byMoment.nhl_hat_trick.proven, 3); assert.equal(p.byMoment.mlb_multi_hr.issue, 1)
  assert.ok(!p.byMoment.nba_40_points && !p.byMoment.long_shot_cashed)
  assert.deepEqual(p.outOfOrder, [])
})
await t('cards already numbered are kept and not planned again; new ones continue after them; an older day behind a newer number is flagged', () => {
  const first = plan(items, [])
  const have = first.issue.filter((x) => x.args.p_event_key.startsWith('30:')).map((x) => ({ card_id: x.args.p_card_id, slot_id: x.args.p_slot_id, moment: 'nhl_hat_trick', issue_no: 5, game_day: '2026-02-03' }))
  const p = plan(items, have)
  assert.equal(p.byMoment.nhl_hat_trick.already, 1); assert.equal(p.byMoment.nhl_hat_trick.issue, 2)
  assert.deepEqual(p.issue.filter((x) => x.args.p_moment === 'nhl_hat_trick').map((x) => x.no), [6, 7])
  assert.deepEqual(p.outOfOrder, ['nhl_hat_trick'])
})
await t('--min-tier drops the lower tiers', () => {
  assert.equal(plan(items, [], { minTier: 'legend' }).issue.length, 0)
  assert.equal(plan(items, [], { minTier: 'elite' }).issue.length, 4)
})
await t('applying issues the planned numbers in order, a second run issues nothing new, and the plan itself writes nothing', async () => {
  const db = fakeDb()
  const p = plan(items, [])
  assert.equal(db.rpcs, 0)
  const r = await applyPlan(db, p)
  assert.equal(r.issued, 4); assert.equal(r.drift, 0); assert.equal(db.rows.length, 4)
  assert.deepEqual(db.rows.filter((x) => x.moment === 'nhl_hat_trick').map((x) => [x.issue_no, x.game_day]), [[1, '2026-01-05'], [2, '2026-01-05'], [3, '2026-02-03']])
  await applyPlan(db, p)                                    // the same plan again: the function hands back the same rows
  assert.equal(db.rows.length, 4)
  assert.equal(plan(items, db.rows).issue.length, 0)        // and a fresh plan over what is stored has nothing left to issue
})
await t('the script is a dry run unless --apply is given, and refuses to apply when the table is missing', () => {
  const s = readFileSync(new URL('./backfill-card-issues.mjs', import.meta.url), 'utf8')
  assert.match(s, /const APPLY = args\.includes\('--apply'\)/); assert.match(s, /if \(!APPLY\) \{[^}]*process\.exit\(0\)/s); assert.match(s, /REFUSED: card_issues does not exist/)
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
