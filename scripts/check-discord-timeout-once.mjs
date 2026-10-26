#!/usr/bin/env node
// A TIMED-OUT DISCORD SEND IS SENT ONCE (batch 3, 2026-10-26, the rest of the status-0 class: postOnce, the recap and the no-cash receipt).
// postToDiscord answers status 0 when its 8 s request aborts and says Discord MAY have delivered it; releasing the claim on 0 re-sends a post that is already out.
// Only a real 429 / 5xx proves nothing was posted. TEST data, fake db, a fetch that aborts.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-discord-timeout-once.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
process.env.DISCORD_MLB_WEBHOOKS = 'https://discord.com/api/webhooks/333333/TEST_FEED'
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN', 'DISCORD_HOMER_WEBHOOK', 'POST_KINDS_ON']) delete process.env[k]
Object.assign(process.env, { X_GUARDS_OFF: 'on', X_SCHEDULE_OFF: 'on' })
let sends = 0
globalThis.fetch = async (url) => { if (String(url).includes('discord.com')) { sends += 1; throw new Error('The operation was aborted due to timeout') } return { ok: true, status: 200, json: async () => ({}), headers: { get: () => null } } }
const rows = []
const db = { calls: { delete: 0 }, from: () => ({
  select: () => ({ match: (m) => ({ maybeSingle: async () => ({ data: rows.find((r) => Object.entries(m).every(([k, v]) => r[k] === v)) || null, error: null }) }) }),
  upsert: (arr) => ({ select: async () => { const r = arr[0]; if (rows.some((x) => x.day === r.day && x.kind === r.kind)) return { data: [], error: null }; rows.push({ ...r }); return { data: [{ day: r.day }], error: null } } }),
  update: (patch) => ({ match: async (m) => { const r = rows.find((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (r) Object.assign(r, patch); return { error: null } } }),
  delete: () => ({ match: async (m) => { db.calls.delete += 1; const i = rows.findIndex((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (i >= 0) rows.splice(i, 1); return { error: null } } }),
}) }
const { postOnce } = await import('../lib/dash/longshotsPost.js')
const PC = await import('../lib/dash/postClaim.js'), FX = await import('../lib/dash/xFail.js')
let n = 0, bad = 0
const t = async (name, fn) => { n += 1; try { await fn(); console.log(`PASS  ${name}`) } catch (e) { bad += 1; console.log(`FAIL  ${name}\n     ${e.message.split('\n')[0]}`) } }

await t('postOnce: a Discord send that timed out (status 0) is sent ONCE and the claim is kept', async () => {
  PC._resetTakenForTests(); FX._resetXFail()
  const build = async () => ({ text: 'TEST list post', payload: {} })
  for (let i = 0; i < 4; i++) { PC._resetTakenForTests(); await postOnce(db, { day: '2026-10-26', kind: 'list_mlb', build, toX: false, webhooks: 'https://discord.com/api/webhooks/333333/TEST_FEED', sport: 'mlb', envGate: false }) }
  assert.equal(sends, 1, `one send (${sends})`); assert.equal(db.calls.delete, 0, 'no release')
  assert.ok(rows.some((r) => r.kind === 'list_mlb'), 'the claim row survives')
})
await t('the recap and the no-cash receipt release only on a real 429 / 5xx too', async () => {
  for (const f of ['lib/posts/recapPost.js', 'lib/posts/receipt.js']) {
    const src = fs.readFileSync(f, 'utf8')
    assert.ok(!/d\.status === 0 \|\| d\.status === 429/.test(src), `${f} still treats status 0 as transient`)
    assert.ok(/d\.status === 429 \|\| d\.status >= 500/.test(src), `${f} keeps the real transient test`)
  }
})
console.log(bad ? `\n${bad}/${n} FAILED` : `\ncheck-discord-timeout-once: ${n} checks passed`)
process.exit(bad ? 1 : 0)
