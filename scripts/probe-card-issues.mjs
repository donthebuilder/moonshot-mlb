#!/usr/bin/env node
// PROBE: did supabase/migrations/202610141500_card_issues.sql run, and does it behave? Run it AFTER the SQL. Uses the server's own keys (read from an env file into process.env, never printed).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/probe-card-issues.mjs [--env <file>] [--keep]
// Every row it writes is under the moment key 'probe' with is_test = true (so it can never be a real card or be counted), and the probe deletes them at the start and the end (--keep leaves them).
// Expectations are the SQL file's own probes: RLS on and no policy (anon reads nothing), issue_no 1 then 2, the same card twice = the same number, the same achievement under a
// newer rules version = no second card, a tier correction keeps the id and number and is logged, a void is kept (never deleted).
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const { adminClient } = await import('../lib/supabase/admin.js')
const db = adminClient()
const anon = adminClient({ anon: true })
if (!db) { console.error('NOT CONFIGURED: no service client'); process.exit(2) }

let failed = 0
const t = async (what, fn) => { try { const note = await fn(); console.log(`ok   ${what}${note ? `  (${note})` : ''}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'expected'} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
const A = 'DN-PROBE0000A1', SA = 'DS-PROBE0000A1', B = 'DN-PROBE0000B2', SB = 'DS-PROBE0000B2', A3 = 'DN-PROBE0000A3'
const issue = (card, slot, o = {}) => db.rpc('issue_card', { p_card_id: card, p_slot_id: slot, p_moment: 'probe', p_sport: 'nhl', p_player_id: '0', p_season: '20262027', p_event_key: `probe:${slot}`, p_game_day: '2026-01-01', p_tier: o.tier || 'elite', p_rules_version: o.rules || 'r2', p_evidence: { probe: true }, p_portrait: {}, p_is_test: true })
const row = (r) => (Array.isArray(r.data) ? r.data[0] : r.data)
const clean = async () => {
  await db.from('card_issue_log').delete().like('card_id', 'DN-PROBE%')
  await db.from('card_issues').delete().eq('moment', 'probe')
}

await t('the table and the function exist (a select works for the service role)', async () => {
  const r = await db.from('card_issues').select('id').limit(1)
  if (r.error) throw new Error(`${r.error.code} ${r.error.message} -- has the SQL been run?`)
})
await clean()
await t('RLS: on, with no policy: the anon key reads and writes nothing', async () => {
  const r = await anon.from('card_issues').select('card_id').limit(1)
  const readsNothing = Boolean(r.error) || (r.data || []).length === 0
  if (!readsNothing) throw new Error('anon could read card_issues')
  const w = await anon.rpc('issue_card', { p_card_id: 'DN-PROBEANON', p_slot_id: 'DS-PROBEANON', p_moment: 'probe', p_sport: 'nhl', p_player_id: '0', p_season: 'x', p_event_key: 'x', p_game_day: '2026-01-01', p_tier: 'base', p_rules_version: 'r2' })
  if (!w.error) throw new Error('anon could call issue_card')
  return r.error ? `${r.error.code}` : 'empty'
})
await t('issue_card: the first card is issue 1', async () => { const r = await issue(A, SA); if (r.error) throw new Error(r.error.message); eq(row(r).issue_no, 1); eq(row(r).card_id, A) })
await t('issue_card is idempotent: the same card again is still issue 1', async () => { const r = await issue(A, SA); if (r.error) throw new Error(r.error.message); eq(row(r).issue_no, 1) })
await t('a second card is issue 2 (monotonic per moment)', async () => { const r = await issue(B, SB, { tier: 'star' }); if (r.error) throw new Error(r.error.message); eq(row(r).issue_no, 2) })
await t('the same achievement under a newer rules version returns the first card (no second card)', async () => {
  const r = await issue(A3, SA, { rules: 'r3' })
  if (r.error) throw new Error(r.error.message)
  eq(row(r).card_id, A); eq(row(r).issue_no, 1)
})
await t('unique keys: a duplicate card_id / slot_id / (moment, issue_no) cannot be inserted directly', async () => {
  const dupe = await db.from('card_issues').insert({ card_id: A, slot_id: 'DS-PROBEDUPE', moment: 'probe', sport: 'nhl', player_id: '0', season: 'x', event_key: 'x', game_day: '2026-01-01', tier: 'base', rules_version: 'r2', issue_no: 9, is_test: true })
  if (!dupe.error) throw new Error('a duplicate card_id was accepted')
  const dupe2 = await db.from('card_issues').insert({ card_id: 'DN-PROBEDUPE', slot_id: SA, moment: 'probe', sport: 'nhl', player_id: '0', season: 'x', event_key: 'x', game_day: '2026-01-01', tier: 'base', rules_version: 'r2', issue_no: 9, is_test: true })
  if (!dupe2.error) throw new Error('a duplicate slot_id was accepted')
  const dupe3 = await db.from('card_issues').insert({ card_id: 'DN-PROBEDUPE3', slot_id: 'DS-PROBEDUPE3', moment: 'probe', sport: 'nhl', player_id: '0', season: 'x', event_key: 'x', game_day: '2026-01-01', tier: 'base', rules_version: 'r2', issue_no: 1, is_test: true })
  if (!dupe3.error) throw new Error('a duplicate (moment, issue_no) was accepted')
})
await t('BUCKETS stays hidden: a real (non-test) NBA row is refused', async () => {
  const r = await db.from('card_issues').insert({ card_id: 'DN-PROBENBA', slot_id: 'DS-PROBENBA', moment: 'probe', sport: 'nba', player_id: '0', season: 'x', event_key: 'x', game_day: '2026-01-01', tier: 'base', rules_version: 'r2', issue_no: 50, is_test: false })
  if (!r.error) { await db.from('card_issues').delete().eq('card_id', 'DN-PROBENBA'); throw new Error('a real NBA card was accepted') }
})
await t('correct_card: a tier change keeps the id and the number and writes a log row', async () => {
  const r = await db.rpc('correct_card', { p_card_id: A, p_new_tier: 'legend', p_reason: 'probe', p_evidence: {} })
  if (r.error) throw new Error(r.error.message)
  eq(row(r).tier, 'legend'); eq(row(r).issue_no, 1)
  const log = await db.from('card_issue_log').select('action,old_tier,new_tier').eq('card_id', A).order('id')
  eq(log.data.map((x) => x.action).join(','), 'issue,tier_change')
})
await t('correct_card to null voids the card (kept, never deleted; its number is not reused)', async () => {
  const r = await db.rpc('correct_card', { p_card_id: B, p_new_tier: null, p_reason: 'probe', p_evidence: {} })
  if (r.error) throw new Error(r.error.message)
  eq(row(r).status, 'void'); eq(row(r).issue_no, 2)
  const next = await issue('DN-PROBE0000C3', 'DS-PROBE0000C3'); eq(row(next).issue_no, 3, 'the next number is')
})
if (!args.includes('--keep')) { await clean(); const left = await db.from('card_issues').select('id').eq('moment', 'probe'); console.log(`cleaned: ${(left.data || []).length} probe rows left`) }
console.log(failed ? `\n${failed} FAILED` : '\nall card_issues probes passed')
process.exit(failed ? 1 : 0)
