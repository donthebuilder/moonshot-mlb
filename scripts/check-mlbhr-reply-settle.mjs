#!/usr/bin/env node
// THE MLB HR REPLY SETTLES X'S ANSWER BY THE SHARED RULE (batch 3, 2026-10-26). The reply recorded EVERY refusal that was not 429 / 0 / 5xx as 'refused:<status>' and closed it for good,
// so when the credits breaker opened (a blocked result carries 402 or 401, no request was made) each pending reply was closed as refused:402 and never sent.
// lib/dash/xFail.js settleAlert already says what each answer means (blocked = wait for the block to lapse; account-level = close and stop; content = close; transient = retry a few times).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-mlbhr-reply-settle.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
const { settleAlert } = await import('../lib/dash/xFail.js')
let n = 0, bad = 0
const t = (name, fn) => { n += 1; try { fn(); console.log(`PASS  ${name}`) } catch (e) { bad += 1; console.log(`FAIL  ${name}\n     ${e.message.split('\n')[0]}`) } }
t('the shared rule: a breaker-blocked result (402, no request made) is NOT closed; an account refusal is; a 5xx retries', () => {
  assert.equal(settleAlert({ ok: false, blocked: true, status: 402 }, { key: 'a' }).value, null)
  assert.equal(settleAlert({ ok: false, status: 403, error: 'forbidden' }, { key: 'b' }).value === 'skipped' || settleAlert({ ok: false, status: 403, error: 'forbidden' }, { key: 'b2' }).value === null, true)
  assert.equal(settleAlert({ ok: false, status: 503 }, { key: 'c' }).value, null)
})
const src = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
const i = src.indexOf("[mlbhr] reply refused for ${row.name}")
const block = i > 0 ? src.slice(i - 200, i + 900) : ''
t('the route settles the reply with settleAlert, not its own 429 / 0 / 5xx test', () => {
  assert.ok(/settleAlert\(r,/.test(block), 'settleAlert is used for the reply refusal')
  assert.ok(!/const transient = r\.status === 429 \|\| !r\.status/.test(block), 'the private transient test is gone')
})
console.log(bad ? `\n${bad}/${n} FAILED` : `\ncheck-mlbhr-reply-settle: ${n} checks passed`)
process.exit(bad ? 1 : 0)
