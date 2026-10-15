#!/usr/bin/env node
// CARD ISSUANCE (lib/cards/issue.js) against a FAKE database (no network, no real table): the arguments the SQL function gets, idempotence, one card per achievement, the graceful
// answers while the SQL has not been run, and that nothing here can throw into a post. TEST rows only.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-card-issue.mjs
import assert from 'node:assert/strict'
import { issueCard, issueNoOf, issuePass, issueArgs, issueLabel, isMissing, _resetIssue, UNAVAILABLE_MS } from '../lib/cards/issue.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const t = async (what, fn) => { _resetIssue(); try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

// a fake that behaves like the SQL function: unique card id and slot, issue numbers 1, 2, 3 per moment
const fakeDb = ({ missing = false, failWith = null } = {}) => {
  const rows = []
  const calls = { rpc: 0, select: 0 }
  return {
    rows, calls,
    rpc: async (fn, a) => {
      calls.rpc += 1
      if (missing) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.issue_card in the schema cache' } }
      if (failWith) return { data: null, error: { code: 'XX000', message: failWith } }
      let r = rows.find((x) => x.card_id === a.p_card_id || x.slot_id === a.p_slot_id)
      if (!r) { r = { card_id: a.p_card_id, slot_id: a.p_slot_id, moment: a.p_moment, tier: a.p_tier, issue_no: rows.filter((x) => x.moment === a.p_moment).length + 1, status: 'issued', args: a }; rows.push(r) }
      return { data: r, error: null }
    },
    from: () => ({ select: () => ({ eq: (_c, id) => ({ limit: async () => { calls.select += 1; if (missing) return { data: null, error: { code: '42P01', message: 'relation "public.card_issues" does not exist' } }; return { data: rows.filter((x) => x.card_id === id), error: null } } }) }) }),
  }
}

await t('the RPC arguments are the card the rules v2 prove: id, slot, moment, sport, player, season, game day, tier, rules version, evidence', () => {
  const a = issueArgs('nhl_hat_trick', F.TEST_HAT)
  assert.match(a.p_card_id, /^DN-[0-9A-F]{12}$/); assert.match(a.p_slot_id, /^DS-[0-9A-F]{12}$/)
  assert.equal(a.p_moment, 'nhl_hat_trick'); assert.equal(a.p_sport, 'nhl'); assert.equal(a.p_tier, 'elite'); assert.equal(a.p_game_day, '2026-01-02'); assert.equal(a.p_season, '20252026')
  assert.equal(a.p_rules_version, 'r2'); assert.equal(a.p_is_test, false); assert.equal(a.p_evidence.kicker, 'HAT TRICK')
})
await t('a row that earns nothing, a BUCKETS moment and a long shot priced after the lock are never issued', async () => {
  assert.equal(issueArgs('nhl_hat_trick', { ...F.TEST_HAT, goals: F.TEST_HAT.goals.slice(0, 2) }), null)
  assert.equal(issueArgs('nba_40_points', { player_id: '1', name: 'Test', pts: 45, game_id: '1', day: '2026-01-01' }), null)
  assert.equal(issueArgs('long_shot_cashed', { ...F.TEST_LONG_SHOT, price_source: 'latest' }), null)
  assert.ok(issueArgs('long_shot_cashed', { ...F.TEST_LONG_SHOT, price_source: 'lock' }))
  const db = fakeDb()
  assert.equal((await issueCard(db, 'nba_40_points', { player_id: '1' })).status, 'skipped'); assert.equal(db.calls.rpc, 0)
})
await t('issueCard: the first card is 1, the second 2; asking again returns the same number and costs no second call', async () => {
  const db = fakeDb()
  const a = await issueCard(db, 'nhl_hat_trick', F.TEST_HAT)
  assert.deepEqual([a.status, a.issueNo], ['issued', 1])
  const b = await issueCard(db, 'nhl_goal', F.TEST_GOAL_OT)
  assert.deepEqual([b.status, b.issueNo], ['issued', 1], 'issue numbers count per MOMENT: the first goal card is goal #1')
  const c = await issueCard(db, 'nhl_hat_trick', { ...F.TEST_HAT, player_id: 12 })
  assert.equal(c.issueNo, 2)
  const again = await issueCard(db, 'nhl_hat_trick', F.TEST_HAT)
  assert.deepEqual([again.status, again.issueNo], ['existing', 1]); assert.equal(db.calls.rpc, 3)
  assert.equal(db.rows.length, 3)
})
await t('issuePass: every event once; a goal event stands for its goal card AND its milestone card; the same feed again issues nothing new', async () => {
  const db = fakeDb()
  const events = [{ moment: 'nhl_goal', row: F.TEST_MILESTONE }, { moment: 'nhl_hat_trick', row: F.TEST_HAT }, { moment: 'mlb_multi_hr', row: F.TEST_MULTI_HR }]
  const r1 = await issuePass(db, events)
  assert.equal(r1.issued, 4); assert.equal(r1.unavailable, false)   // goal + milestone (goal #50), hat trick, multi-HR
  assert.deepEqual(db.rows.map((x) => x.moment).sort(), ['mlb_multi_hr', 'nhl_goal', 'nhl_hat_trick', 'nhl_season_goal_milestone'])
  const r2 = await issuePass(db, events)
  assert.equal(r2.issued, 0); assert.equal(r2.existing, 4); assert.equal(db.rows.length, 4)
})
await t('GRACEFUL: until the SQL has run every call answers unavailable (no throw), is remembered, and the label is PREVIEW', async () => {
  const db = fakeDb({ missing: true })
  const r = await issueCard(db, 'nhl_hat_trick', F.TEST_HAT)
  assert.deepEqual([r.status, r.why], ['unavailable', 'card_issues is not set up yet'])
  await issueCard(db, 'nhl_goal', F.TEST_GOAL_OT)
  assert.equal(db.calls.rpc, 1, 'the second ask did not call the database again')
  assert.equal((await issueNoOf(db, 'DN-XXXXXXXXXXXX')).status, 'unavailable'); assert.equal(db.calls.select, 0)
  assert.equal(issueLabel(r), 'PREVIEW'); assert.equal(issueLabel(await issueNoOf(db, 'x')), 'PREVIEW')
  const p = await issuePass(db, [{ moment: 'nhl_hat_trick', row: F.TEST_HAT }])
  assert.equal(p.unavailable, true); assert.equal(p.issued, 0)
  // the answer is not remembered forever: after UNAVAILABLE_MS it asks again
  const later = await issueCard(db, 'nhl_hat_trick', F.TEST_HAT, { now: Date.now() + UNAVAILABLE_MS + 1000 })
  assert.equal(later.status, 'unavailable'); assert.equal(db.calls.rpc, 2)
})
await t('issueNoOf: a number when the row exists, "none" (the line is left off) when the table has no row, unavailable when there is no table', async () => {
  const db = fakeDb()
  const c = await issueCard(db, 'nhl_hat_trick', F.TEST_HAT)
  _resetIssue()
  assert.deepEqual(await issueNoOf(db, c.cardId), { status: 'issued', issueNo: 1 })
  assert.equal((await issueNoOf(db, 'DN-NOROWNOROW00')).status, 'none')
  assert.equal(issueLabel({ status: 'none' }), ''); assert.equal(issueLabel({ status: 'issued', issueNo: 7 }), '7')
  assert.equal((await issueNoOf(null, 'x')).status, 'unavailable')
})
await t('NEVER THROWS: a database error, a null database and a thrown error are answers, not exceptions', async () => {
  assert.equal((await issueCard(fakeDb({ failWith: 'boom' }), 'nhl_hat_trick', F.TEST_HAT)).status, 'error')
  assert.equal((await issueCard(null, 'nhl_hat_trick', F.TEST_HAT)).status, 'unavailable')
  const throwing = { rpc: async () => { throw new Error('network down') }, from: () => { throw new Error('network down') } }
  assert.equal((await issueCard(throwing, 'nhl_hat_trick', F.TEST_HAT)).status, 'error')
  assert.equal((await issueNoOf(throwing, 'x')).status, 'unavailable')
  const p = await issuePass(throwing, [{ moment: 'nhl_hat_trick', row: F.TEST_HAT }]); assert.equal(p.errors, 1)
  assert.equal(isMissing({ code: '42883' }), true); assert.equal(isMissing({ code: '23505', message: 'duplicate key' }), false)
})

console.log(failed ? `\n${failed} FAILED` : '\nall card-issue checks passed')
process.exit(failed ? 1 : 0)
