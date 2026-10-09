#!/usr/bin/env node
// LEAK CHECK for the free Discord server (Stage 1 audit, 2026-10-09).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-members-no-leak.mjs
//
// The rule: a MEMBERS post with no members webhook sends NOTHING, anywhere. It must not fall back to the
// homer feed, the sport channels, #called-it or the alerts list.
//
// ALL DATA HERE IS TEST DATA. Every webhook is a TEST placeholder and the network is
// replaced: global fetch records the URL it was asked for and answers 204. Nothing is ever sent.
//
// A  members webhook unset / blank / "," / whitespace  -> zero network calls  (REQUIRED)
// B  members webhook set                               -> exactly one call, to the members URL only  (REQUIRED)
// C  the only readers of DISCORD_MEMBERS_WEBHOOK are lib/dash/membersPost.js and the /admin page  (REQUIRED)
// D  a members URL that is ALSO a public hook (a paste mistake) is refused: nothing posts, nothing is claimed  (REQUIRED)
// E  separator-only / non-URL members values never claim the day's row nor report "posted"  (REQUIRED)
// F  a members-kind post given no usable hook never falls through to the public feed (postOnce)  (REQUIRED)
// G  discord_sends logging: one row per hook attempt, key name only, never a URL; a missing table never throws  (REQUIRED)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// TEST placeholders shaped like real hooks (discord.com, numeric id); fetch is replaced below, nothing is sent
const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const PUBLIC_ENV = {
  DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_NFL_WEBHOOKS: U('1003'),
  DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_NBA_WEBHOOKS: U('1005'), DISCORD_RECEIPTS_WEBHOOK: U('1006'),
  DISCORD_ALERTS_WEBHOOKS: U('1007'), DISCORD_LIVE_WEBHOOKS: U('1008'),
}
const ENV_KEYS = [...Object.keys(PUBLIC_ENV), 'DISCORD_MEMBERS_WEBHOOK', 'DISCORD_OPS_WEBHOOK', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'POST_KINDS_ON', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']
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
const run = async (members, extra = {}) => {
  setEnv(members === undefined ? { ...extra } : { DISCORD_MEMBERS_WEBHOOK: members, ...extra })
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
  const M = U('2001')
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

// D. a "wrong" members URL equal to ANY public hook is refused: nothing posts, nothing is claimed.
{
  const errs = []; const orig = console.error; console.error = (...a) => errs.push(a.join(' '))
  for (const key of [...Object.keys(PUBLIC_ENV), 'DISCORD_OPS_WEBHOOK']) {
    const url = PUBLIC_ENV[key] || U('1009')
    const r = await run(url, key === 'DISCORD_OPS_WEBHOOK' ? { DISCORD_OPS_WEBHOOK: url } : {})
    check(`D. members URL equal to ${key} is refused`, r.calls.length === 0 && r.claimed === 0, `${r.calls.length} call(s), ${r.claimed} claim(s), result "${r.out}"`)
  }
  { // a list: one good URL plus one that equals a public hook -> only the good one is tried
    const good = U('2001')
    const r = await run(`${good},${PUBLIC_ENV.DISCORD_HOMER_WEBHOOK}`)
    check('D. [good, public-equal] -> only the good URL is tried', r.calls.length === 1 && r.calls[0] === good, `${r.calls.length} call(s)`)
  }
  console.error = orig
  const all = errs.join('\n')
  check('D. the refusal is logged by key name', /DISCORD_MLB_WEBHOOKS/.test(all) && /REFUSED/.test(all))
  check('D. ...and no log line carries a URL or token', !/https?:|TEST-TOKEN|webhooks\/\d/.test(all))
}

// E. a value that parses to no valid https Discord URL never claims and never says "posted"
for (const [label, v] of [[',', ','], ['", ,\n,"', ', ,\n,'], ['not a URL', 'hello'], ['http (not https)', 'http://discord.com/api/webhooks/1/x'], ['a non-Discord https URL', 'https://example.invalid/api/webhooks/1/x']]) {
  const r = await run(v)
  check(`E. members value ${label} -> no claim, no call, not "posted"`, r.claimed === 0 && r.calls.length === 0 && r.out !== 'posted', `result "${r.out}"`)
}

// F. postOnce itself: a members-kind post handed an empty/unusable hook list never reaches the public feed
{
  const { postOnce } = await import('../lib/dash/longshotsPost.js')
  for (const w of ['', ',', '  ']) {
    setEnv(); calls.length = 0; n += 1
    const db = fakeDb()
    const out = await postOnce(db, { day: `2099-03-${String(n).padStart(2, '0')}`, kind: 'mlb_members_board', build: async () => ({ text: 'TEST', payload: {} }), webhooks: w, toX: false })
    check(`F. postOnce webhooks=${JSON.stringify(w)} -> nothing sent, nothing claimed`, calls.length === 0 && db.rows.length === 0, `result "${out}"`)
  }
  setEnv(); calls.length = 0
  const out = await postOnce(fakeDb(), { day: '2099-03-31', kind: 'pregame', build: async () => ({ text: 'TEST', payload: {} }) })
  check('F. a normal public post (webhooks left out) still goes to the public feed', calls.length > 0 && out === 'posted', `${calls.length} call(s), "${out}"`)
}

// G. discord_sends logging (fetch replaced: the Supabase REST insert is captured, not sent)
{
  const { postToDiscord } = await import('../lib/dash/xPost.js')
  const { _resetDiscordSends } = await import('../lib/dash/discordSends.js')
  const inserts = []
  let tableMissing = false
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('/rest/v1/discord_sends')) {
      inserts.push(JSON.parse(init.body))
      return tableMissing
        ? { ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null }, text: async () => JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.discord_sends' in the schema cache" }), json: async () => ({ code: 'PGRST205', message: 'Could not find the table' }) }
        : { ok: true, status: 201, statusText: 'Created', headers: { get: () => null }, text: async () => '', json: async () => null }
    }
    calls.push(u)
    return u.includes('1003') ? { ok: false, status: 404, statusText: 'Not Found', headers: { get: () => null }, json: async () => ({}) } : { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) }
  }
  setEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.invalid', SUPABASE_SERVICE_ROLE_KEY: 'TEST-SERVICE-KEY' })
  _resetDiscordSends(); calls.length = 0
  const hooks = [PUBLIC_ENV.DISCORD_HOMER_WEBHOOK, PUBLIC_ENV.DISCORD_NFL_WEBHOOKS].join(',')
  const r = await postToDiscord('TEST POST', { kind: 'pregame', sportKey: 'nfl' }, hooks)
  check('G. the send still succeeds when one hook 404s (ok = any)', r.ok === true && calls.length === 2)
  check('G. exactly one insert per hook attempt', inserts.length === 2, `${inserts.length}`)
  const rows = inserts.flat()
  check('G. rows carry the env KEY NAME, hook index, kind, sport, status', rows[0].channel_key === 'DISCORD_HOMER_WEBHOOK' && rows[1].channel_key === 'DISCORD_NFL_WEBHOOKS' && rows[0].hook_index === 0 && rows[1].hook_index === 1 && rows[0].kind === 'pregame' && rows[0].sport === 'nfl' && rows[0].ok === true && rows[0].http_status === 204 && rows[1].ok === false && rows[1].http_status === 404)
  const blob = JSON.stringify(rows)
  check('G. no URL, id or token is ever stored', !/https?:|TEST-TOKEN|\/webhooks|100[0-9]/.test(blob), blob.length ? 'checked' : '')
  // table missing -> no throw, send unaffected, and the instance stops trying
  tableMissing = true; _resetDiscordSends(); inserts.length = 0; calls.length = 0
  let threw = false; let r2
  try { r2 = await postToDiscord('TEST POST', { kind: 'pregame' }, hooks); await postToDiscord('TEST POST', { kind: 'pregame' }, hooks) } catch { threw = true }
  check('G. table missing -> never throws, send result unchanged', !threw && r2?.ok === true)
  check('G. ...and stops inserting after the first miss', inserts.length <= 2, `${inserts.length} insert attempt(s) over two posts`)
  // no service key -> no insert at all
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; _resetDiscordSends(); inserts.length = 0
  await postToDiscord('TEST POST', { kind: 'pregame' }, hooks)
  check('G. no Supabase config -> no insert, no throw', inserts.length === 0)
}

// H. PER-GAME WRITE-UPS (free / members split, 2026-10-09). TEST text only. The members copy of a write-up reaches ONLY the
//    members hook; the free copy goes out only for a featured game and never to the members hook; X is never touched.
{
  const { sendMembers, sendFree } = await import('../lib/writeups/discordRoute.js')
  const M = U('2001')
  const seen = []   // [url, body]
  globalThis.fetch = async (url, init) => { seen.push([String(url), String(init?.body ?? '')]); return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}), text: async () => '' } }
  const SECRET = 'TEST MEMBERS-ONLY WRITE-UP LINE (test data)'
  const publicHooks = Object.values(PUBLIC_ENV)

  setEnv(); seen.length = 0
  check('H. sendMembers with no members webhook sends nothing', (await sendMembers(SECRET, { sport: 'nfl', kind: 'writeup_nfl_T1' })) === false && seen.length === 0)
  for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
    setEnv({ DISCORD_MEMBERS_WEBHOOK: M }); seen.length = 0
    const ok = await sendMembers(SECRET, { sport, kind: `writeup_${sport}_T1` })
    check(`H. ${sport}: sendMembers -> exactly the members URL, nothing public`, ok === true && seen.length === 1 && seen[0][0] === M && !publicHooks.includes(seen[0][0]))
  }
  { // a members URL that is also a public hook (paste mistake): refused, nothing sent anywhere
    setEnv({ DISCORD_MEMBERS_WEBHOOK: PUBLIC_ENV.DISCORD_NFL_WEBHOOKS }); seen.length = 0
    const errs = console.error; console.error = () => {}
    const ok = await sendMembers(SECRET, { sport: 'nfl', kind: 'writeup_nfl_T1' }); console.error = errs
    check('H. sendMembers with a members URL equal to a public hook sends nothing', ok === false && seen.length === 0)
  }
  { // the free path: a game that is NOT featured sends nothing; a featured one goes to the hooks it was given and never to members
    setEnv({ DISCORD_MEMBERS_WEBHOOK: M }); seen.length = 0
    const none = await sendFree(SECRET, { sport: 'nfl', kind: 'writeup_nfl_T2', featured: false, hooks: PUBLIC_ENV.DISCORD_NFL_WEBHOOKS })
    check('H. sendFree for a non-featured game sends nothing', none === null && seen.length === 0)
    const nohook = await sendFree(SECRET, { sport: 'nba', kind: 'writeup_nba_T2', featured: true, hooks: '' })
    check('H. sendFree with no free hook (BUCKETS before launch) sends nothing', nohook === null && seen.length === 0)
    const yes = await sendFree(SECRET, { sport: 'nfl', kind: 'writeup_nfl_T3', featured: true, hooks: PUBLIC_ENV.DISCORD_NFL_WEBHOOKS })
    check('H. sendFree for the featured game -> the free hook only, never the members URL', yes?.ok === true && seen.length === 1 && seen[0][0] === PUBLIC_ENV.DISCORD_NFL_WEBHOOKS && seen[0][0] !== M)
  }
  { // the free channel lists (what the runners pass to sendFree) can never contain the members URL
    const { sportHooks, feedHooks, nbaOwnHooks } = await import('../lib/dash/discordChannels.js')
    setEnv({ DISCORD_MEMBERS_WEBHOOK: M })
    const lists = ['mlb', 'nfl', 'nhl', 'nba'].flatMap((s) => [sportHooks(s).join(','), feedHooks(s)]).concat(nbaOwnHooks().join(','))
    check('H. no free-channel hook list (sport / feed / BUCKETS) ever contains the members URL', lists.every((l) => !l.includes(M)))
  }
  // X: the members text never reaches an X host, and the write-up module has no X import for the members path
  check('H. no request went to X from any members / free send', seen.every(([u]) => !/x\.com|twitter\.com/.test(u)))
  const route = readFileSync(new URL('../lib/writeups/discordRoute.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  check('H. discordRoute.js imports no X poster and reads no webhook variable itself', !/postToX|uploadImageToX|process\.env/.test(route))
  // storage: members copies live on the write-up's own row; the board/grade kinds all carry the RLS pattern (kind not like '%\_members\_%')
  const { MEMBERS_KINDS } = await import('../lib/dash/membersPost.js')
  check("H. every members-only row kind matches the anon-read RLS pattern '%_members_%'", Object.values(MEMBERS_KINDS).every((k) => /_members_/.test(k)), Object.values(MEMBERS_KINDS).join(', '))
  check('H. discordRoute.js writes no row of its own except the write-up row\'s payload flags (no new kinds, so nothing public can hold members text)', !/upsert|insert\(/.test(route))
  const post = readFileSync(new URL('../lib/writeups/post.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  check('H. a write-up row\'s kind never contains "members" (the site shows write-ups; members copies are a flag, not a row)', !/kind[^\n]*members/i.test(post.replace(/members_sent|sendMembers|retryMembers|members only|members \$\{/g, '')))
}

console.log(fail ? `\n${fail} FAILED` : '\nall required checks passed')
process.exit(fail ? 1 : 0)
