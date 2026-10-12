// The admin hub's guarantees (2026-10-12). TEST data only: fake users, a fake database, a fake allow-list. No network, no account, no credential.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-admin-hub.mjs
import { readFileSync } from 'node:fs'

process.env.ADMIN_EMAILS = 'admin@test.invalid'
process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef0123456789abcdef0123456789abcdef01'

const { adminSurface, adminEntries, ADMIN_ENTRY_LIST, ADMIN_TOOLS, safeShaPrefix } = await import('../lib/adminHub.js')
const { cardLine, readHubStatus } = await import('../lib/adminHubStatus.js')
const { safeNext } = await import('../lib/safeNext.js')

let bad = 0
const ok = (c, m) => { if (!c) { console.log(`FAIL ${m}`); bad += 1 } }
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ── who sees the admin entries ────────────────────────────────────────────────────────────────────────────────────────
const users = {
  confirmedAdmin: { email: 'admin@test.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' },
  confirmedAdminCase: { email: 'ADMIN@Test.Invalid', confirmed_at: '2026-01-01T00:00:00Z' },
  unconfirmedAdmin: { email: 'admin@test.invalid', email_confirmed_at: null },
  nonAdmin: { email: 'someone@test.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' },
  noEmail: { id: 'x', email_confirmed_at: '2026-01-01T00:00:00Z' },
  signedOut: null,
}
ok(adminSurface(users.confirmedAdmin).admin === true, 'confirmed admin: admin true')
ok(adminSurface(users.confirmedAdminCase).admin === true, 'confirmed admin (case-insensitive email): admin true')
for (const k of ['unconfirmedAdmin', 'nonAdmin', 'noEmail', 'signedOut']) ok(adminSurface(users[k]).admin === false, `${k}: admin false`)
ok(adminEntries(users.confirmedAdmin).length === ADMIN_ENTRY_LIST.length && ADMIN_ENTRY_LIST.length >= 2, 'confirmed admin sees the entries (Admin, Two-Man)')
for (const k of ['unconfirmedAdmin', 'nonAdmin', 'noEmail', 'signedOut']) ok(adminEntries(users[k]).length === 0, `${k}: sees NO entries`)
{ const saved = process.env.ADMIN_EMAILS; process.env.ADMIN_EMAILS = ''; ok(adminSurface(users.confirmedAdmin).admin === false && adminEntries(users.confirmedAdmin).length === 0, 'allow-list env missing: fails closed'); process.env.ADMIN_EMAILS = saved }

// ── /api/admin/me never echoes who ───────────────────────────────────────────────────────────────────────────────────
for (const [k, u] of Object.entries(users)) {
  const body = adminSurface(u)
  ok(JSON.stringify(Object.keys(body)) === '["admin"]', `${k}: /api/admin/me body is exactly { admin }`)
  ok(!/@|test\.invalid|confirmed/i.test(JSON.stringify(body)), `${k}: body carries no email or user field`)
}
const route = read('app/api/admin/me/route.js')
ok(/private, no-store/.test(route), 'me route: Cache-Control private, no-store')
ok(!/user\.email|user\.id|\.email\b/.test(route.replace(/\/\/.*$/gm, '')), 'me route: never reads the email into the response')
ok(!/\b(insert|update|upsert|delete)\s*\(/.test(route), 'me route: read-only')

// ── the open redirect (a bookmarked /login?next=/admin must work; nothing else may leave the site) ──────────────────────────
ok(safeNext('/admin') === '/admin', 'next=/admin is honoured')
ok(safeNext('/admin#facts') === '/admin#facts', 'next=/admin#facts is honoured')
ok(safeNext('/app#sport=nba&tab=home') === '/app#sport=nba&tab=home', 'next=/app#... is honoured')
for (const evil of ['//evil.test', '///evil.test', '/\\evil.test', 'https://evil.test', 'http://evil.test/admin', 'javascript:alert(1)', 'admin', '', null, undefined, '/ad min', '/a\nb', '\\\\evil.test', '/\t/evil.test', 'data:text/html,x', '//\\evil.test'])
  ok(safeNext(evil) === '/', `next=${JSON.stringify(evil)} falls back to /`)
ok(/safeNext\(params\.next\)/.test(read('app/login/page.js')), 'login page validates ?next with safeNext')
ok(/const next = safeNext\(formData/.test(read('app/(front)/actions.js')) || /safeNext\(/.test(read('app/(front)/actions.js')), 'sign-in actions validate next with safeNext')

// ── the entry points draw only on the server's yes ───────────────────────────────────────────────────────────────────────
for (const f of ['components/header/MoreAccount.js', 'components/SignUpPill.js', 'components/QuickSearch.js']) {
  const src = read(f)
  ok(/useIsAdmin\(\)/.test(src), `${f}: asks useIsAdmin (the server's answer)`)
}
ok(/isAdmin \? <a href=\{ADMIN_ENTRY_LIST/.test(read('components/header/MoreAccount.js')), 'More drawer: the Admin row is gated on isAdmin')
ok(/isAdmin \? <MenuLink[^>]*href="\/admin"/.test(read('components/SignUpPill.js')), 'header menu: the Admin item is gated on isAdmin')
ok(/isAdmin && t\.length >= 2/.test(read('components/QuickSearch.js')), 'QuickSearch: admin commands are gated on isAdmin')
const hook = read('lib/useIsAdmin.js')
ok(/signedIn/.test(hook) && /\/api\/admin\/me/.test(hook) && /j\?\.admin === true/.test(hook), 'useIsAdmin: signed-in only, asks the server, true only on admin === true')
ok(!/localStorage|sessionStorage|document\.cookie/.test(hook), 'useIsAdmin: never decides from client storage')

// ── the hub's data ─────────────────────────────────────────────────────────────────────────────────────────────────────
ok(safeShaPrefix(process.env.VERCEL_GIT_COMMIT_SHA) === 'abcdef0', 'build shows the first 7 characters only')
ok(safeShaPrefix('not a sha') === null && safeShaPrefix('') === null && safeShaPrefix(undefined) === null, 'a bad sha shows nothing')
ok(ADMIN_TOOLS.every((t) => /^\/(?!\/)/.test(t.href)), 'every tool is a relative path')
ok(ADMIN_TOOLS.some((t) => t.href === '/admin/two-man') && ADMIN_TOOLS.some((t) => t.href === '/app#sport=nba') && ADMIN_TOOLS.some((t) => t.href === '/admin/buckets'), 'hub lists Two-Man, BUCKETS admin and the NBA app view')
ok(ADMIN_TOOLS.every((t) => !/learning|audit|SECURITY/i.test(`${t.title} ${t.hint} ${t.href}`)), 'no private notes are linked')

// card line, TEST rows
const rows = [
  { sport: 'nhl', card_date: '2026-10-12', lane: 'bot', product: 'straight', result: null },
  { sport: 'nhl', card_date: '2026-10-12', lane: 'donovan', product: 'two_man', result: null },
  { sport: 'mlb', card_date: '2026-10-12', lane: 'bot', product: 'straight', result: 'hit' },
  { sport: 'mlb', card_date: '2026-10-12', lane: 'donovan_late', product: 'two_man', result: null },
  { sport: 'nfl', card_date: '2026-10-11', lane: 'bot', product: 'straight', result: null },
]
const posts = [{ day: '2026-10-12', kind: 'card_nhl', x_post_id: '1234567890' }, { day: '2026-10-12', kind: 'card_mlb', x_post_id: 'skipped' }]
const nhl = cardLine('nhl', rows, posts); const mlb = cardLine('mlb', rows, posts); const nfl = cardLine('nfl', rows, posts); const none = cardLine('nhl', [], [])
ok(nhl.locked && nhl.posted && nhl.reveal === 'held' && nhl.donovan === 'verified' && !nhl.donovan_posted, 'NHL: locked, posted, held, his entry verified')
ok(mlb.locked && !mlb.posted && mlb.reveal === 'revealed' && mlb.donovan === 'LATE', 'MLB: locked, not posted (a skipped marker is not a post), revealed, his entry LATE')
ok(nfl.donovan === 'none' && nfl.card_date === '2026-10-11', 'NFL: his entry none')
ok(none.card_date === null && none.donovan === 'none' && !none.locked, 'no Card: empty line')
ok(!/x_post_id|1234567890/.test(JSON.stringify(nhl)), 'a Card line never carries an X post id')

// the status reader is read-only and carries no secrets (a fake database that records every call)
const calls = []
const MUTATORS = new Set(['insert', 'update', 'upsert', 'delete', 'rpc'])
const builder = (table) => {
  const b = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (res) => res({ data: [], error: null, count: 0 })
      if (MUTATORS.has(prop)) return () => { calls.push(`${table}.${String(prop)}`); throw new Error(`mutation ${String(prop)}`) }
      return () => b
    },
  })
  return b
}
const fake = { from: (t) => builder(t), rpc: () => { calls.push('rpc'); throw new Error('rpc') } }
const status = await readHubStatus(fake)
ok(calls.length === 0, `the status reader made no writes (${calls.join(',')})`)
ok(Array.isArray(status.cards) && status.cards.length === 3, 'status: three Card lines')
ok(status.build === 'abcdef0', 'status: build is 7 characters')
const flat = JSON.stringify(status)
ok(!/https?:|@|eyJ|sk_|Bearer|service_role|webhook|SUPABASE|password/i.test(flat), 'status carries no URL, email, token or env name')
const src = read('lib/adminHubStatus.js').replace(/\/\/.*$/gm, '')
ok(!/\.(insert|update|upsert|delete|rpc)\s*\(/.test(src), 'adminHubStatus.js source has no write call')
ok(!/process\.env\.(?!VERCEL_GIT_COMMIT_SHA)/.test(src), 'adminHubStatus.js reads no env value but the commit sha')

// ── the hub page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const page = read('app/admin/page.js')
ok(/if \(!user \|\| !isAdminUser\(user\)\) notFound\(\)/.test(page), '/admin: the gate is unchanged (404 for anyone else)')
ok(page.indexOf('notFound()') < page.indexOf('readHubStatus('), '/admin: the hub is read only after the gate')
const hubSrc = read('components/admin/AdminHub.js')
ok(!/#[0-9a-fA-F]{3,8}\b/.test(hubSrc.replace(/\/\/.*$/gm, '')), 'hub: no hex literals')
ok(/minHeight: 64/.test(hubSrc) && /minHeight: 48/.test(hubSrc), 'hub: tap targets are 48px or more')
const manifest = ['public/manifest.json', 'public/manifest.webmanifest', 'app/manifest.js', 'app/manifest.json'].map((f) => { try { return read(f) } catch { return '' } }).join('')
ok(!/admin/i.test(manifest), 'the public manifest does not name the admin area')

console.log(bad ? `\n${bad} FAIL` : 'ok: admin hub guarantees hold')
process.exit(bad ? 1 : 0)
