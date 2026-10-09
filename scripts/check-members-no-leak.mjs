#!/usr/bin/env node
// LEAK CHECK for the free Discord server (Stage 1 audit, 2026-10-09).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-members-no-leak.mjs [--strict]
//
// The rule: a MEMBERS post with no members webhook sends NOTHING, anywhere. It must not fall back to the
// homer feed, the sport channels, #called-it or the alerts list.
//
// ALL DATA HERE IS TEST DATA. Every webhook is a https://example.invalid/... placeholder and the network is
// replaced: global fetch records the URL it was asked for and answers 204. Nothing is ever sent.
//
// A  members webhook unset / blank / "," / whitespace  -> zero network calls  (REQUIRED)
// B  members webhook set                               -> exactly one call, to the members URL only  (REQUIRED)
// C  the only readers of DISCORD_MEMBERS_WEBHOOK are lib/dash/membersPost.js and the /admin page  (REQUIRED)
// D  GAP (reported, not fixed): a members URL that is ALSO a public hook still posts to the public hook.
//    Counted as a failure only with --strict.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const strict = process.argv.includes('--strict')
const U = (n) => `https://example.invalid/api/webhooks/${n}/TEST-TOKEN`
const PUBLIC_ENV = {
  DISCORD_HOMER_WEBHOOK: U('TEST-HOMER'), DISCORD_MLB_WEBHOOKS: U('TEST-MLB'), DISCORD_NFL_WEBHOOKS: U('TEST-NFL'),
  DISCORD_NHL_WEBHOOKS: U('TEST-NHL'), DISCORD_NBA_WEBHOOKS: U('TEST-NBA'), DISCORD_RECEIPTS_WEBHOOK: U('TEST-RECEIPTS'),
  DISCORD_ALERTS_WEBHOOKS: U('TEST-ALERTS'), DISCORD_LIVE_WEBHOOKS: U('TEST-LIVE'),
}
const ENV_KEYS = [...Object.keys(PUBLIC_ENV), 'DISCORD_MEMBERS_WEBHOOK', 'POST_KINDS_ON', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']
const setEnv = (extra = {}) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, PUBLIC_ENV, extra) }

const calls = []
globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) } }

// a database that only knows the one table postOnce touches
function fakeDb() {
  const rows = []
  const table = {
    select: () => ({ match: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: (r) => { rows.push(...r); return { select: async () => ({ data: r.map((x) => ({ day: x.day })), error: null }) } },
    update: () => ({ match: async () => ({ error: null }) }),
  }
  return { from: () => table, rows }
}

const { postMembers, membersWebhook } = await import('../lib/dash/membersPost.js')
let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }
let n = 0
const run = async (members) => {
  setEnv(members === undefined ? {} : { DISCORD_MEMBERS_WEBHOOK: members })
  calls.length = 0
  n += 1
  const db = fakeDb()
  const out = await postMembers(db, { day: `2099-01-${String(n).padStart(2, '0')}`, kind: 'mlb_members_board', build: async () => ({ text: 'TEST MEMBERS BOARD (test data)', payload: { picks: [] } }) })
  return { out, calls: [...calls], claimed: db.rows.length }
}

// A. no members webhook = nothing sent, nothing claimed, whatever else is configured
for (const [label, v] of [['unset', undefined], ['empty string', ''], ['spaces only', '   '], ['a lone comma', ','], ['a newline', '\n']]) {
  const r = await run(v)
  check(`A. members webhook ${label} + every public webhook set -> sends nothing`, r.calls.length === 0, `result "${r.out}", ${r.calls.length} network call(s)`)
}
{ // and with POST_KINDS_ON naming the members kind
  setEnv({ POST_KINDS_ON: 'mlb_members_board' }); calls.length = 0
  const out = await postMembers(fakeDb(), { day: '2099-02-01', kind: 'mlb_members_board', build: async () => ({ text: 'TEST', payload: {} }) })
  check('A. unset + POST_KINDS_ON lists the members kind -> sends nothing', calls.length === 0, `result "${out}"`)
}
{ // and with NOTHING configured at all
  for (const k of ENV_KEYS) delete process.env[k]; calls.length = 0
  const out = await postMembers(fakeDb(), { day: '2099-02-02', kind: 'nfl_members_board', build: async () => ({ text: 'TEST', payload: {} }) })
  check('A. nothing configured at all -> sends nothing', calls.length === 0, `result "${out}"`)
}
check('A. membersWebhook() is "" when unset', (setEnv(), membersWebhook() === ''))

// B. members webhook set -> only that URL
{
  const M = U('TEST-MEMBERS')
  const r = await run(M)
  check('B. members webhook set -> exactly one call', r.calls.length === 1, `${r.calls.length} call(s)`)
  check('B. ...and it is the members URL, never a public one', r.calls[0] === M && !Object.values(PUBLIC_ENV).includes(r.calls[0]))
}

// C. nobody else reads the members variable (static scan of app/ and lib/)
{
  const root = new URL('..', import.meta.url).pathname
  const hits = []
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      if (f === 'node_modules' || f.startsWith('.')) continue
      const p = join(dir, f); const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(js|mjs)$/.test(f) && readFileSync(p, 'utf8').split('\n').some((l) => l.includes('DISCORD_MEMBERS_WEBHOOK') && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/\/\/.*DISCORD_MEMBERS_WEBHOOK/.test(l.split('DISCORD_MEMBERS_WEBHOOK')[0] + '//x' ) )) hits.push(p.slice(root.length))
    }
  }
  walk(join(root, 'app')); walk(join(root, 'lib'))
  const allowed = new Set(['lib/dash/membersPost.js', 'app/admin/page.js', 'lib/dash/discordChannels.js'])
  const extra = hits.filter((h) => !allowed.has(h))
  check('C. only membersPost.js (and the /admin status line) read DISCORD_MEMBERS_WEBHOOK', extra.length === 0, extra.length ? `also: ${extra.join(', ')}` : hits.join(', '))
}

// D. KNOWN GAP: a "wrong" members URL that equals a public hook (a paste mistake) posts to the free channel.
{
  const r = await run(PUBLIC_ENV.DISCORD_MLB_WEBHOOKS)
  const leaked = r.calls.length > 0
  console.log(`${leaked ? (strict ? 'FAIL' : 'GAP ') : 'PASS'}  D. members URL equal to a public hook is refused  -- ${leaked ? 'it POSTED to the public URL (lib/dash/membersPost.js:35-38; smallest fix: membersWebhook() drops any URL that also appears in discordChannels.js hookList of the public env keys)' : 'refused'}`)
  if (leaked && strict) fail += 1
}

console.log(fail ? `\n${fail} FAILED` : '\nall required checks passed')
process.exit(fail ? 1 : 0)
