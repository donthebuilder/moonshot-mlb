#!/usr/bin/env node
// AN X-ONLY POST WHOSE X SEND WAS REFUSED KEEPS ITS SLOT OPEN (batch 3, 2026-10-26). postOnce claims the (day, kind) row before it sends. LONGSHOT TUESDAY is
// X-only (skipDiscord), so when X answered 429 / 5xx NOTHING went out anywhere, yet the claim stayed, the tick reported 'posted' and the day's post was lost.
// A transient refusal now releases the claim a few times (lib/dash/xFail.js mayRetryPost), the way the Slate and the receipt already do. TEST data, fake db, fake fetch.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-x-only-retry.mjs
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST', X_GUARDS_OFF: 'on', X_SCHEDULE_OFF: 'on', X_TEXT_LIMIT: '900' })
for (const k of ['X_POSTS_PAUSE', 'POST_KINDS_ON', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]
let status = 429
const tweets = []
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('api.x.com/2/tweets')) { if (status >= 400) return { ok: false, status, json: async () => ({ title: 'test refusal' }), headers: { get: () => null } }; tweets.push(1); return { ok: true, status: 200, json: async () => ({ data: { id: '9001' } }), headers: { get: () => null } } }
  return { ok: true, status: 200, json: async () => ({}), headers: { get: () => null } }
}
const rows = []
const db = { rows, calls: { delete: 0 }, from: () => ({
  select: () => ({ match: (m) => ({ maybeSingle: async () => ({ data: rows.find((r) => Object.entries(m).every(([k, v]) => r[k] === v)) || null, error: null }) }), eq: () => ({ in: () => ({ not: async () => ({ data: [], error: null }) }) }) }),
  upsert: (arr) => ({ select: async () => { const r = arr[0]; if (rows.some((x) => x.day === r.day && x.kind === r.kind)) return { data: [], error: null }; rows.push({ ...r }); return { data: [{ day: r.day }], error: null } } }),
  update: (patch) => ({ match: async (m) => { const r = rows.find((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (r) Object.assign(r, patch); return { error: null } } }),
  delete: () => ({ match: async (m) => { db.calls.delete += 1; const i = rows.findIndex((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (i >= 0) rows.splice(i, 1); return { error: null } } }),
}) }
const { postOnce } = await import('../lib/dash/longshotsPost.js')
const FX = await import('../lib/dash/xFail.js')
const PC = await import('../lib/dash/postClaim.js')
const reset = () => { FX._resetXFail(); PC._resetTakenForTests() }
const DAY = '2026-10-27', KIND = 'card_ls_tuesday'
const build = async () => ({ text: 'TEST long shot post', payload: {}, skipDiscord: true })

let n = 0, bad = 0
const t = async (name, fn) => { n += 1; try { await fn(); console.log(`PASS  ${name}`) } catch (e) { bad += 1; console.log(`FAIL  ${name}\n     ${e.message.split('\n')[0]}`) } }

await t('X answers 429 on an X-only post: the claim is released for another try, never left spent with nothing posted', async () => {
  reset()
  const r1 = await postOnce(db, { day: DAY, kind: KIND, build, toX: true, sport: 'nhl', envGate: false })
  assert.ok(/^retry/.test(String(r1)), `first try reports a retry, not 'posted' (${r1})`)
  assert.equal(rows.filter((r) => r.kind === KIND).length, 0, 'no spent claim row')
})
await t('and when X answers, an X-only post goes out once and its row carries the tweet id (the retry itself waits 10 minutes, postOnce\'s own NOT_YET_MS)', async () => {
  status = 200; FX._resetXFail()   // the 2-minute pause a 429 opens has passed
  const r2 = await postOnce(db, { day: '2026-10-28', kind: KIND, build, toX: true, sport: 'nhl', envGate: false })
  assert.equal(r2, 'posted'); assert.equal(tweets.length, 1)
  assert.equal(rows.find((r) => r.kind === KIND && r.day === '2026-10-28')?.x_post_id, '9001')
})
await t('a refusal that never clears is retried only a few times, then the slot stays spent (no endless loop)', async () => {
  rows.length = 0; tweets.length = 0; status = 503
  reset()
  let last = ''
  for (let i = 0; i < 8; i++) { last = await postOnce(db, { day: DAY, kind: KIND, build, toX: true, sport: 'nhl', envGate: false }) }
  assert.ok(db.calls.delete >= 1 && db.calls.delete <= 4, `a few releases only (${db.calls.delete})`)
  assert.equal(tweets.length, 0)
})
console.log(bad ? `\n${bad}/${n} FAILED` : `\ncheck-x-only-retry: ${n} checks passed`)
process.exit(bad ? 1 : 0)
