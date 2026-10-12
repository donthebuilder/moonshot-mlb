// Security wave 2 (audit M1 cookie, M4 admin gate, L3 no-store, F-07 headers + CSP report-only).
// TEST DATA: fake users, no network, no account. Run: node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-security-wave2.mjs
// If a build exists (.next or NEXT_DIST_DIR) it also scans the browser chunks for any Supabase client code.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { hardenCookie } from '../lib/supabase/cookieOptions.js'
import { isAdminUser, isAdminEmail } from '../lib/admin.js'

const require = createRequire(import.meta.url)
let failed = 0
const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) failed += 1 }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!['node_modules', '.next', 'ARCHIVE'].includes(e.name)) walk(p, out) } else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}
const root = new URL('..', import.meta.url).pathname

console.log('session cookie (M1)')
const prev = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
const c = hardenCookie({ name: 'x', maxAge: 400, path: '/', httpOnly: false, sameSite: 'none' })
ok('httpOnly forced on', c.httpOnly === true)
ok('SameSite=Lax forced', c.sameSite === 'lax')
ok('Secure in production', c.secure === true)
ok('maxAge and path kept', c.maxAge === 400 && c.path === '/')
ok('a removal keeps maxAge 0', hardenCookie({ maxAge: 0 }).maxAge === 0)
process.env.NODE_ENV = 'development'
ok('not Secure in dev (plain http)', hardenCookie({}).secure === false)
process.env.NODE_ENV = prev
ok('server.js writes cookies through hardenCookie', /hardenCookie\(options\)/.test(read('lib/supabase/server.js')))
ok('proxy.js writes cookies through hardenCookie', /hardenCookie\(options\)/.test(read('proxy.js')))
const sources = ['app', 'lib', 'components'].flatMap((d) => walk(path.join(root, d))).concat([path.join(root, 'proxy.js')])
const setters = sources.filter((f) => /cookies\.set\(|cookieStore\.set\(/.test(fs.readFileSync(f, 'utf8')))
ok(`every cookie write is hardened (${setters.map((f) => path.relative(root, f)).join(', ')})`, setters.length > 0 && setters.every((f) => /hardenCookie/.test(fs.readFileSync(f, 'utf8'))))
const clientReaders = sources.filter((f) => { const s = fs.readFileSync(f, 'utf8'); return /^\s*['"]use client['"]/m.test(s.slice(0, 400)) && (/document\.cookie/.test(s) || /@supabase\//.test(s)) })
ok(`no client component reads document.cookie or imports Supabase (${clientReaders.length})`, clientReaders.length === 0)
const dist = path.join(root, process.env.NEXT_DIST_DIR || '.next', 'static')
if (fs.existsSync(dist)) {
  const chunks = walk(dist)
  const hit = chunks.filter((f) => /supabase|createBrowserClient|sb-[a-z0-9]+-auth-token/.test(fs.readFileSync(f, 'utf8')))
  ok(`built browser bundle: ${chunks.length} chunks, ${hit.length} mention Supabase`, hit.length === 0)
} else console.log('   skip  no build dir: bundle scan not run')

console.log('admin gate (M4)')
process.env.ADMIN_EMAILS = 'boss@test.invalid, Other@Test.invalid'
ok('allow-listed + confirmed passes', isAdminUser({ email: 'boss@test.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' }))
ok('case-insensitive list', isAdminUser({ email: 'OTHER@test.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' }))
ok('allow-listed but UNCONFIRMED fails', !isAdminUser({ email: 'boss@test.invalid', email_confirmed_at: null }))
ok('allow-listed, field missing (JWT-claims user) fails closed', !isAdminUser({ id: 'u', email: 'boss@test.invalid' }))
ok('confirmed but not listed fails', !isAdminUser({ email: 'rando@test.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' }))
ok('null / no email fails', !isAdminUser(null) && !isAdminUser({ email_confirmed_at: 'x' }))
process.env.ADMIN_EMAILS = ''
ok('empty ADMIN_EMAILS: nobody', !isAdminUser({ email: 'boss@test.invalid', email_confirmed_at: 'x' }) && !isAdminEmail('boss@test.invalid'))
const gated = ['app/admin/page.js', 'app/admin/two-man/page.js', 'app/api/admin/facts/route.js', 'app/api/admin/two-man/route.js', 'lib/nba/gate.js', 'app/account/page.js']
ok('every admin entry point uses isAdminUser', gated.every((f) => /isAdminUser\(user\)/.test(read(f)) && !/isAdminEmail/.test(read(f))))
ok('every one reads the full user from auth.getUser()', gated.every((f) => /auth\.getUser\(\)/.test(read(f))))

console.log('response headers (F-07, L3)')
const cfg = require('../next.config.js')
const rules = await cfg.headers()
const all = rules.find((r) => r.source === '/:path*')?.headers || []
const h = (k) => all.find((x) => x.key === k)?.value
ok('nosniff', h('X-Content-Type-Options') === 'nosniff')
ok('Referrer-Policy', h('Referrer-Policy') === 'strict-origin-when-cross-origin')
ok('X-Frame-Options SAMEORIGIN', h('X-Frame-Options') === 'SAMEORIGIN')
const pp = h('Permissions-Policy') || ''
ok('Permissions-Policy denies camera, microphone, geolocation', /camera=\(\)/.test(pp) && /microphone=\(\)/.test(pp) && /geolocation=\(\)/.test(pp))
const csp = h('Content-Security-Policy-Report-Only') || ''
ok('CSP is REPORT-ONLY, not enforced', Boolean(csp) && !all.some((x) => x.key === 'Content-Security-Policy'))
ok('CSP has no unsafe-eval and no wildcard source', !/unsafe-eval/.test(csp) && !/(^|[\s;])\*(\s|;|$)/.test(csp))
ok("CSP: default-src 'self', object-src 'none', frame-ancestors 'self'", /default-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp))
for (const host of ['statsapi.mlb.com', 'a.espncdn.com', 'img.mlbstatic.com', 'assets.nhle.com', 'api-web.nhle.com', 'site.web.api.espn.com']) ok(`CSP allows ${host}`, csp.includes(host))
for (const s of ['/api/dash/state', '/api/dash/push/:path*', '/api/admin/:path*']) ok(`${s}: private, no-store`, rules.find((r) => r.source === s)?.headers.some((x) => x.key === 'Cache-Control' && x.value === 'private, no-store'))

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
