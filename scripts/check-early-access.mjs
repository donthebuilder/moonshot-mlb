#!/usr/bin/env node
// EARLY ACCESS (2026-10-12). TEST data only: fake users, a fake database, a fake allow-list. No network, no account, no credential, no real code is ever made live.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-early-access.mjs
// Holds: the registry, the access rule (public OR admin OR active grant), grant / revoke / expiry (and the 60 s cache), hashed invite storage (no plain code in any
// stored row or any later response), atomic redemption (a 1-use code redeemed twice at once: one winner), the one generic failure, safeNext on the redirect,
// BUCKETS routes 404 for a non-holder and open for a holder, admin tools never granted, admin routes gated, the limiter, no secrets in responses, and that no
// poster path can see a grant.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

process.env.ADMIN_EMAILS = 'admin@test.invalid'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'TEST'
delete process.env.BUCKETS_PUBLIC; delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
let n = 0
const ok = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`) }

const F = await import('../lib/features.js')
const C = await import('../lib/earlyAccess/codes.js')
const S = await import('../lib/earlyAccess/store.js')
const A = await import('../lib/earlyAccess/access.js')
const AD = await import('../lib/earlyAccess/admin.js')
const RF = await import('../lib/earlyAccess/redeemFlow.js')
const G = await import('../lib/nba/gate.js')
const SW = await import('../lib/openSwitch.js')
const { safeNext } = await import('../lib/safeNext.js')
const { adminEntries, adminSurface } = await import('../lib/adminHub.js')

// ── a fake Supabase: just the calls lib/earlyAccess uses ───────────────────────────────────────────────────────────────────
function fakeDb({ missing = false, failGrantWrite = false, noPending = false } = {}) {
  const t = { early_access_invites: [], early_access_grants: [], early_access_pending: [] }
  const users = new Map()
  let seq = 0
  const db = { t, users, missing, failGrantWrite, rows: [] }
  db.addUser = (id, email, confirmed = true) => { users.set(id, email); db.rows.push({ id, email, email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null }) }
  db.from = (table) => {
    const st = { op: 'select', filters: [], patch: null, row: null, conflict: null, ret: false }
    const match = (r) => st.filters.every(([k, col, v]) => {
      if (k === 'eq') return r[col] === v
      if (k === 'is') return r[col] == null
      if (k === 'gt') return r[col] != null && Date.parse(r[col]) > Date.parse(v)
      return false
    })
    const run = async () => {
      await Promise.resolve()                                     // yield, so two callers really interleave
      if (db.missing || (noPending && table === 'early_access_pending')) return { data: null, error: { code: '42P01', message: 'relation does not exist' } }
      const rows = t[table]
      if (st.op === 'select') return { data: rows.filter(match).map((r) => ({ ...r })), error: null }
      if (st.op === 'insert') {
        if (table === 'early_access_invites' && rows.some((r) => r.code_hash === st.row.code_hash)) return { data: null, error: { code: '23505', message: 'dup' } }
        const r = { id: `id${++seq}`, ...st.row }; rows.push(r); return { data: [{ ...r }], error: null }
      }
      if (st.op === 'update') {
        const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, st.patch)); return { data: hit.map((r) => ({ ...r })), error: null }
      }
      if (st.op === 'upsert') {
        if (db.failGrantWrite) return { data: null, error: { code: 'XX000', message: 'boom' } }
        const keys = st.conflict.split(',')
        const ex = rows.find((r) => keys.every((k) => r[k] === st.row[k]))
        if (ex) { Object.assign(ex, st.row); return { data: [{ ...ex }], error: null } }
        const r = { id: `id${++seq}`, ...st.row }; rows.push(r); return { data: [{ ...r }], error: null }
      }
      return { data: null, error: { message: 'unsupported' } }
    }
    const b = {
      select() { if (st.op !== 'select') st.ret = true; return b },
      insert(row) { st.op = 'insert'; st.row = row; return b },
      update(p) { st.op = 'update'; st.patch = p; return b },
      upsert(row, o) { st.op = 'upsert'; st.row = row; st.conflict = o.onConflict; return b },
      eq(c, v) { st.filters.push(['eq', c, v]); return b },
      is(c, v) { assert.equal(v, null); st.filters.push(['is', c, null]); return b },
      gt(c, v) { st.filters.push(['gt', c, v]); return b },
      order() { return b }, limit() { return b },
      async maybeSingle() { const r = await run(); return r.error ? r : { data: r.data[0] || null, error: null } },
      async single() { const r = await run(); return r.error ? r : { data: r.data[0] || null, error: null } },
      then(res, rej) { return run().then(res, rej) },
    }
    return b
  }
  db.auth = { admin: { listUsers: async ({ page, perPage }) => ({ data: { users: db.rows.slice((page - 1) * perPage, page * perPage) }, error: null }), getUserById: async (id) => ({ data: { user: users.get(id) ? { id, email: users.get(id) } : null } }) } }
  return db
}
const user = (id, email = `${id}@test.invalid`) => ({ id, email, email_confirmed_at: '2026-01-01T00:00:00Z' })
const adminU = user('adm', 'admin@test.invalid')
const T0 = Date.parse('2026-10-12T12:00:00Z')

// ── 1. codes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('codes: 32 base32 characters = 160 bits (floor 80), url-safe, never repeating, normalised, hashed', () => {
  assert.equal(C.CODE_LEN, 32); assert.ok(C.CODE_BITS >= 80)
  const seen = new Set()
  for (let i = 0; i < 2000; i += 1) { const c = C.newCode(); assert.match(c, /^[A-Z2-7]{32}$/); seen.add(c) }
  assert.equal(seen.size, 2000)
  const c = C.newCode()
  assert.equal(C.normalizeCode(c.toLowerCase()), c); assert.equal(C.normalizeCode(` ${c} `), c)
  for (const bad of ['', 'short', c.slice(1), `${c}A`, c.replace(/./, '0'), c.replace(/./, '/'), null, undefined]) assert.equal(C.normalizeCode(bad), null)
  assert.match(C.hashCode(c), /^[0-9a-f]{64}$/); assert.notEqual(C.hashCode(c), c)
  assert.equal(C.codeTail(c), c.slice(-4))
  // every bit position is used: the first character takes all 32 values over enough draws
  const firsts = new Set(); for (let i = 0; i < 4000; i += 1) firsts.add(C.newCode()[0]); assert.equal(firsts.size, 32)
})
await ok('codes: expiry options, masked email, clean note', () => {
  assert.equal(C.expiryAt('never', T0), null); assert.equal(C.expiryAt('24h', T0), new Date(T0 + 86400e3).toISOString())
  assert.equal(C.expiryAt('7d', T0), new Date(T0 + 7 * 86400e3).toISOString()); assert.equal(C.expiryAt('30d', T0), new Date(T0 + 30 * 86400e3).toISOString())
  assert.equal(C.expiryAt('1y', T0), undefined)
  assert.equal(C.maskEmail('jane@gmail.com'), 'j***@gmail.com'); assert.equal(C.maskEmail(''), 'unknown'); assert.equal(C.maskEmail('nope'), 'unknown')
  assert.equal(C.cleanNote('  for @sam\n\t'), 'for @sam'); assert.equal(C.cleanNote(''), null); assert.equal(C.cleanNote('x'.repeat(500)).length, 120)
})

// ── 2. the registry ─────────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('registry: buckets is one line; its switch is the SAME function the posters read; an unknown feature is never public or grantable', () => {
  const f = F.featureByKey('buckets')
  assert.equal(f.label, 'BUCKETS (NBA)'); assert.equal(f.landing, '/app#sport=nba'); assert.equal(f.sport, 'nba')
  assert.equal(f.publicSwitch(), false); process.env.BUCKETS_PUBLIC = 'on'; assert.equal(f.publicSwitch(), true); assert.equal(F.featureIsPublic('buckets'), true); delete process.env.BUCKETS_PUBLIC
  assert.equal(F.isFeatureKey('nope'), false); assert.equal(F.featureIsPublic('nope'), false); assert.equal(F.featureOfSport('nba').key, 'buckets'); assert.equal(F.featureOfSport('mlb'), null)
  assert.match(code(read('lib/features.js')), /publicSwitch: \(\) => bucketsOpen\(\)/)
})

// ── 3. invites are stored hashed ────────────────────────────────────────────────────────────────────────────────────────────
let db = fakeDb()
await ok('invite: the table keeps sha256(code) and the last 4 only; the plain code is in no stored row', async () => {
  const r = await S.createInvite(db, { feature: 'buckets', uses: 5, expires: '7d', note: 'for @sam', by: 'adm', now: T0 })
  assert.equal(r.ok, true); assert.match(r.code, /^[A-Z2-7]{32}$/)
  const row = db.t.early_access_invites[0]
  assert.equal(row.code_hash, C.hashCode(r.code)); assert.equal(row.code_tail, r.code.slice(-4)); assert.equal(row.max_uses, 5); assert.equal(row.uses, 0)
  assert.equal(row.expires_at, new Date(T0 + 7 * 86400e3).toISOString()); assert.equal(row.note, 'for @sam')
  assert.ok(!JSON.stringify(db.t).includes(r.code), 'the plain code is nowhere in the stored rows')
  assert.ok(!('code' in row))
})
await ok('invite: bad feature / uses / expiry are refused and store nothing; the tables missing -> needs_sql and nothing stored', async () => {
  const d = fakeDb()
  for (const bad of [{ feature: 'nope' }, { feature: 'buckets', uses: 2 }, { feature: 'buckets', uses: 1, expires: '1y' }]) assert.equal((await S.createInvite(d, { uses: 1, expires: '7d', ...bad })).ok, false)
  assert.equal(d.t.early_access_invites.length, 0)
  const m = fakeDb({ missing: true })
  const r = await S.createInvite(m, { feature: 'buckets', uses: 1, expires: '7d' }); assert.deepEqual(r, { ok: false, needs_sql: true }); assert.equal(m.t.early_access_invites.length, 0)
  const a = await AD.act(m, { action: 'create_invite', feature: 'buckets', uses: 1, expires: '7d' }, { origin: 'https://x.test' }); assert.equal(a.status, 409); assert.equal(a.json.needs_sql, true); assert.ok(!('link' in a.json))
})

// ── 4. redemption ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const mk = async (d, o = {}) => (await S.createInvite(d, { feature: 'buckets', uses: 1, expires: '7d', by: 'adm', now: T0, ...o })).code
await ok('redeem: a good code grants the feature, uses go to 1, and the same account redeeming again is idempotent (nothing consumed)', async () => {
  db = fakeDb(); const c = await mk(db, { uses: 5 })
  const a = await S.redeem(db, { code: c, userId: 'u1', now: T0 + 1000 }); assert.deepEqual(a, { ok: true, feature: 'buckets', already: false })
  assert.equal(db.t.early_access_invites[0].uses, 1); assert.equal(db.t.early_access_grants.length, 1)
  assert.equal(db.t.early_access_grants[0].user_id, 'u1'); assert.equal(db.t.early_access_grants[0].invite_id, db.t.early_access_invites[0].id)
  const b = await S.redeem(db, { code: c.toLowerCase(), userId: 'u1', now: T0 + 2000 }); assert.deepEqual(b, { ok: true, feature: 'buckets', already: true })
  assert.equal(db.t.early_access_invites[0].uses, 1); assert.equal(db.t.early_access_grants.length, 1)
})
await ok('redeem: a 1-use code is used up for a second account; expiry, revoke, unknown, wrong shape all fail', async () => {
  db = fakeDb(); const c = await mk(db)
  assert.equal((await S.redeem(db, { code: c, userId: 'u1', now: T0 + 1 })).ok, true)
  assert.equal((await S.redeem(db, { code: c, userId: 'u2', now: T0 + 2 })).why, 'used-up')
  const e = await mk(db, { expires: '24h' }); assert.equal((await S.redeem(db, { code: e, userId: 'u3', now: T0 + 25 * 3600e3 })).why, 'expired')
  const r = await mk(db); db.t.early_access_invites.at(-1).revoked_at = new Date(T0).toISOString(); assert.equal((await S.redeem(db, { code: r, userId: 'u4', now: T0 + 1 })).why, 'revoked')
  assert.equal((await S.redeem(db, { code: C.newCode(), userId: 'u5', now: T0 + 1 })).why, 'unknown')
  assert.equal((await S.redeem(db, { code: 'short', userId: 'u5', now: T0 + 1 })).why, 'shape')
  assert.equal(db.t.early_access_grants.length, 1)
})
await ok('redeem: THE RACE -- a 1-use code redeemed by two accounts at the same moment has exactly one winner', async () => {
  for (let round = 0; round < 25; round += 1) {
    db = fakeDb(); const c = await mk(db)
    const res = await Promise.all([S.redeem(db, { code: c, userId: 'a', now: T0 + 1 }), S.redeem(db, { code: c, userId: 'b', now: T0 + 1 }), S.redeem(db, { code: c, userId: 'c', now: T0 + 1 })])
    assert.equal(res.filter((r) => r.ok).length, 1, JSON.stringify(res)); assert.equal(db.t.early_access_invites[0].uses, 1); assert.equal(db.t.early_access_grants.length, 1)
  }
})
await ok('redeem: a 5-use code under 8 simultaneous accounts grants exactly 5; one account double-tapping gets one grant and one use', async () => {
  db = fakeDb(); const c = await mk(db, { uses: 5 })
  const res = await Promise.all('abcdefgh'.split('').map((u) => S.redeem(db, { code: c, userId: u, now: T0 + 1 })))
  assert.equal(res.filter((r) => r.ok).length, 5); assert.equal(db.t.early_access_invites[0].uses, 5); assert.equal(db.t.early_access_grants.length, 5)
  db = fakeDb(); const d = await mk(db)
  const two = await Promise.all([S.redeem(db, { code: d, userId: 'same', now: T0 + 1 }), S.redeem(db, { code: d, userId: 'same', now: T0 + 1 })])
  assert.ok(two.every((r) => r.ok)); assert.equal(db.t.early_access_invites[0].uses, 1); assert.equal(db.t.early_access_grants.length, 1)
})
await ok('redeem: a failed grant write gives the use back; tables missing -> failure and nothing stored', async () => {
  db = fakeDb({ failGrantWrite: true }); const c = await mk(db)
  assert.equal((await S.redeem(db, { code: c, userId: 'u', now: T0 + 1 })).ok, false); assert.equal(db.t.early_access_invites[0].uses, 0)
  const m = fakeDb({ missing: true }); const r = await S.redeem(m, { code: C.newCode(), userId: 'u' }); assert.equal(r.ok, false)
})

// ── 5. the access rule ─────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('access: not public + no grant = no; admin = yes; an active grant = yes (early, not admin); a revoked or expired grant = no', async () => {
  A.clearGrantCache(); db = fakeDb()
  const holder = user('h1')
  assert.deepEqual(await A.featureAccess('buckets', { user: holder, db, now: T0 }), { ok: false, public: false, admin: false, early: false })
  assert.deepEqual(await A.featureAccess('buckets', { user: null, db, now: T0 }), { ok: false, public: false, admin: false, early: false })
  assert.equal((await A.featureAccess('buckets', { user: adminU, db, now: T0 })).admin, true)
  db.t.early_access_grants.push({ id: 'g1', user_id: 'h1', feature: 'buckets', granted_at: new Date(T0).toISOString(), expires_at: null, revoked_at: null })
  assert.deepEqual(await A.featureAccess('buckets', { user: holder, db, now: T0 + 61e3 }), { ok: true, public: false, admin: false, early: true })
  // another account has nothing
  assert.equal((await A.featureAccess('buckets', { user: user('h2'), db, now: T0 + 61e3 })).ok, false)
  // revoked: honoured for at most 60 s (cache), then gone
  db.t.early_access_grants[0].revoked_at = new Date(T0 + 70e3).toISOString()
  assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 100e3 })).ok, true, 'still inside the 60 s cache')
  assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 61e3 + 61e3 })).ok, false, 'gone once the cache ages out')
  // the instance that handled the revoke stops at once
  db.t.early_access_grants[0].revoked_at = null; A.clearGrantCache(); assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 200e3 })).ok, true)
  const rv = await AD.act(db, { action: 'revoke_grant', id: 'g1' }, { now: T0 + 201e3 }); assert.equal(rv.status, 200)
  assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 202e3 })).ok, false)
  // expiry
  A.clearGrantCache(); db.t.early_access_grants[0].revoked_at = null; db.t.early_access_grants[0].expires_at = new Date(T0 + 500e3).toISOString()
  assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 400e3 })).ok, true)
  assert.equal((await A.featureAccess('buckets', { user: holder, db, now: T0 + 600e3 })).ok, false)
})
await ok('access: BUCKETS public -> everyone, early is false and grants are no-ops (rows kept); closed again -> the grant works again', async () => {
  A.clearGrantCache(); db = fakeDb(); db.t.early_access_grants.push({ id: 'g', user_id: 'h1', feature: 'buckets', granted_at: new Date(T0).toISOString(), expires_at: null, revoked_at: null })
  process.env.BUCKETS_PUBLIC = 'on'
  assert.deepEqual(await A.featureAccess('buckets', { user: user('h1'), db, now: T0 }), { ok: true, public: true, admin: false, early: false })
  assert.deepEqual(await A.featureAccess('buckets', { user: null, db: null, now: T0 }), { ok: true, public: true, admin: false, early: false })
  assert.equal(db.t.early_access_grants.length, 1)
  assert.deepEqual(await A.ownFeatures(db, 'h1', T0), [], 'a public feature is not listed as an early one')
  delete process.env.BUCKETS_PUBLIC; A.clearGrantCache()
  assert.equal((await A.featureAccess('buckets', { user: user('h1'), db, now: T0 })).early, true)
})
await ok('access: before the SQL runs every check answers "no grant" and BUCKETS is exactly as before (admin only)', async () => {
  A.clearGrantCache(); const m = fakeDb({ missing: true })
  assert.equal((await A.featureAccess('buckets', { user: user('h1'), db: m, now: T0 })).ok, false)
  assert.equal((await A.featureAccess('buckets', { user: adminU, db: m, now: T0 })).admin, true)
  assert.equal((await A.featureAccess('buckets', { user: user('h1'), db: null, now: T0 })).ok, false)
})

// ── 6. BUCKETS routes through the real gate ─────────────────────────────────────────────────────────────────────────────────
await ok('gate: bucketsGuard is a 404 for a non-holder and signed-out, open for a holder and an admin; /admin/buckets stays admin-only', async () => {
  A.clearGrantCache(); db = fakeDb(); db.t.early_access_grants.push({ id: 'g', user_id: 'h1', feature: 'buckets', granted_at: new Date(T0).toISOString(), expires_at: null, revoked_at: null })
  const as = (u) => ({ getUser: async () => u, db })
  const non = await G.bucketsGuard(as(user('stranger'))); assert.equal(non.status, 404); assert.equal((await non.json()).error, 'not found'); assert.equal(non.headers.get('Cache-Control'), 'no-store')
  assert.equal((await G.bucketsGuard(as(null))).status, 404)
  assert.equal(await G.bucketsGuard(as(user('h1'))), null)
  assert.equal(await G.bucketsGuard(as(adminU)), null)
  const h = await G.bucketsAccess(as(user('h1'))); assert.equal(h.early, true); assert.equal(h.admin, false)
  assert.equal(await G.bucketsAdminAccess(as(user('h1'))), false, 'a holder does not open /admin/buckets')
  assert.equal(await G.bucketsAdminAccess(as(adminU)), true)
  assert.equal(G.bucketsPublic(), false, 'a grant never turns the public switch on')
  assert.match(read('app/admin/buckets/page.js'), /bucketsAdminAccess\(\)/); assert.ok(!/bucketsAccess\(\)\)\.ok/.test(read('app/admin/buckets/page.js')))
  // the access route: a holder gets { open, early }, everyone else exactly { open:false }
  const src = code(read('app/api/buckets/access/route.js'))
  assert.match(src, /a\.early \? \{ open: true, early: true \} : \{ open: a\.ok \}/); assert.match(src, /private, no-store/)
})
await ok('gate: the signed-in grant check is by auth user id from the session, never from a request value', () => {
  const g = code(read('lib/nba/gate.js')) + code(read('lib/earlyAccess/access.js'))
  assert.match(g, /user\?\.id/); assert.ok(!/searchParams|request\.|headers\(\)|cookies\(\)\.get/.test(g))
})

// ── 7. the /early/<code> decision ──────────────────────────────────────────────────────────────────────────────────────────
await ok('/early: signed out goes to /login with next=/early/<code>, and the login page\'s safeNext keeps it; a hostile code is never put in a redirect', async () => {
  RF.ipLimiter._reset(); RF.userLimiter._reset(); db = fakeDb(); const c = await mk(db)
  const r = await RF.early({ code: c, user: null, db: null, ip: '1.1.1.1' })
  assert.equal(r.to, `/login?next=${encodeURIComponent(`/early/${c}`)}`)
  const next = new URL(r.to, 'https://x.test').searchParams.get('next'); assert.equal(safeNext(next), `/early/${c}`)
  for (const bad of ['//evil.com', '/\\evil.com', 'a/../../x', 'a b', 'x'.repeat(65), '']) assert.deepEqual(await RF.early({ code: bad, user: null, db: null, ip: '1.1.1.2' }), { failed: true })
})
await ok('/early: signed in + good code -> redeemed and sent to the feature landing (safeNext-clean); again -> same landing', async () => {
  RF.ipLimiter._reset(); RF.userLimiter._reset(); A.clearGrantCache(); db = fakeDb(); const c = await mk(db)
  const r = await RF.early({ code: c, user: user('u9'), db, ip: '2.2.2.2', now: T0 + 1 }); assert.deepEqual(r, { to: '/app#sport=nba', feature: 'buckets', already: false })
  assert.equal(safeNext(r.to), r.to)
  const again = await RF.early({ code: c, user: user('u9'), db, ip: '2.2.2.2', now: T0 + 2 }); assert.equal(again.to, '/app#sport=nba'); assert.equal(again.already, true)
  assert.equal((await A.featureAccess('buckets', { user: user('u9'), db, now: T0 + 3 })).early, true, 'redeeming opens BUCKETS for that account')
})
await ok('/early: every failure reason gives the IDENTICAL result (no oracle): unknown, wrong shape, expired, used up, revoked, tables missing, rate-limited', async () => {
  RF.ipLimiter._reset(); RF.userLimiter._reset(); db = fakeDb()
  const used = await mk(db); await S.redeem(db, { code: used, userId: 'first', now: T0 + 1 })
  const exp = await mk(db, { expires: '24h' }); const rev = await mk(db); db.t.early_access_invites.at(-1).revoked_at = new Date(T0).toISOString()
  const results = []
  const go = async (o) => results.push(JSON.stringify(await RF.early({ user: user('victim'), ip: `9.9.9.${results.length}`, now: T0 + 25 * 3600e3, ...o })))
  await go({ code: C.newCode(), db }); await go({ code: 'garbage', db }); await go({ code: exp, db }); await go({ code: used, db }); await go({ code: rev, db })
  await go({ code: C.newCode(), db: fakeDb({ missing: true }) }); await go({ code: used, db: null })
  assert.equal(new Set(results).size, 1, results.join(' | ')); assert.equal(results[0], '{"failed":true}')
  // the page itself renders one fixed message and never a reason
  const page = code(read('app/early/[code]/page.js'))
  assert.ok(!/result\.why|\.why\b/.test(page)); assert.match(read('app/early/[code]/page.js'), /This invite link is not working/)
  assert.match(read('app/early/[code]/page.js'), /robots: \{ index: false/); assert.match(read('app/early/[code]/page.js'), /referrer: 'no-referrer'/)
})
await ok('/early: brute force is slowed -- the per-IP and per-account limits answer the same generic failure, even for a good code', async () => {
  RF.ipLimiter._reset(); RF.userLimiter._reset(); db = fakeDb(); const good = await mk(db)
  for (let i = 0; i < 8; i += 1) assert.deepEqual(await RF.early({ code: C.newCode(), user: user('guesser'), db, ip: '5.5.5.5', now: T0 + 1 }), { failed: true })
  assert.deepEqual(await RF.early({ code: good, user: user('guesser'), db, ip: '5.5.5.5', now: T0 + 1 }), { failed: true }, 'account limit hit')
  RF.userLimiter._reset()
  for (let i = 0; i < 12; i += 1) await RF.early({ code: C.newCode(), user: user(`g${i}`), db, ip: '6.6.6.6', now: T0 + 1 })
  assert.deepEqual(await RF.early({ code: good, user: user('fresh'), db, ip: '6.6.6.6', now: T0 + 1 }), { failed: true }, 'IP limit hit')
  assert.equal((await RF.early({ code: good, user: user('fresh'), db, ip: '7.7.7.7', now: T0 + 1 })).to, '/app#sport=nba', 'another IP is not affected')
  assert.equal(db.t.early_access_grants.length, 1)
  const lim = C.makeLimiter({ max: 2, windowMs: 1000, now: (() => { let t = 0; return () => t })() }); assert.ok(lim.hit('k') && lim.hit('k') && !lim.hit('k') && lim.hit('other'))
})

// ── 8. the admin side ──────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('admin: create returns the link ONCE; the overview shows the last 4 only, masked emails, counts; no hash, no code, no full email, no holder user id', async () => {
  A.clearGrantCache(); db = fakeDb(); db.users.set('u1', 'jane@gmail.com'); db.users.set('u2', 'sam@proton.me')
  const made = await AD.act(db, { action: 'create_invite', feature: 'buckets', uses: 5, expires: '30d', note: 'for @jane' }, { origin: 'https://site.test/', by: 'adm', now: T0 })
  assert.equal(made.status, 200); assert.match(made.json.link, /^https:\/\/site\.test\/early\/[A-Z2-7]{32}$/)
  const plain = made.json.link.split('/').pop()
  await S.redeem(db, { code: plain, userId: 'u1', now: T0 + 1 }); await S.redeem(db, { code: plain, userId: 'u2', now: T0 + 2 })
  const ov = await AD.overview(db, T0 + 3); const text = JSON.stringify(ov.json)
  assert.ok(!text.includes(plain), 'the plain code is not in the overview'); assert.ok(!text.includes(C.hashCode(plain)), 'the hash is not either')
  assert.ok(!/jane@|sam@/.test(text)); assert.ok(text.includes('j***@gmail.com') && text.includes('s***@proton.me'))
  assert.ok(!/"user_id"|"code_hash"|"created_by"/.test(text))
  const inv = ov.json.invites[0]; assert.equal(inv.tail, plain.slice(-4)); assert.equal(inv.uses, 2); assert.equal(inv.max_uses, 5); assert.equal(inv.status, 'active'); assert.deepEqual(inv.redeemed_by.sort(), ['j***@gmail.com', 's***@proton.me'])
  assert.equal(ov.json.counts.active_grants, 2); assert.equal(ov.json.counts.by_feature.buckets, 2); assert.equal(ov.json.counts.active_invites, 1)
  assert.equal(ov.json.grants.length, 2); assert.equal(ov.json.grants[0].label, 'BUCKETS (NBA)')
  // revoke the invite and a grant
  assert.equal((await AD.act(db, { action: 'revoke_invite', id: inv.id }, { now: T0 + 4 })).status, 200)
  assert.equal((await AD.overview(db, T0 + 5)).json.invites[0].status, 'revoked')
  assert.equal((await S.redeem(db, { code: plain, userId: 'u3', now: T0 + 6 })).ok, false, 'a revoked invite stops working')
  const gid = ov.json.grants[0].id; assert.equal((await AD.act(db, { action: 'revoke_grant', id: gid }, { now: T0 + 7 })).status, 200)
  assert.equal((await AD.overview(db, T0 + 8)).json.counts.active_grants, 1)
  assert.equal((await AD.act(db, { action: 'wat' })).status, 400)
  assert.equal((await AD.act(db, { action: 'create_invite', feature: 'buckets', uses: 7, expires: '7d' })).status, 400)
})
await ok('admin: before the SQL the overview says installed:false and nothing throws', async () => {
  const ov = await AD.overview(fakeDb({ missing: true }), T0); assert.equal(ov.status, 200); assert.equal(ov.json.installed, false); assert.ok(ov.json.features.length >= 1)
  assert.equal((await AD.overview(null, T0)).json.installed, false)
})
await ok('admin routes: gated by isAdminUser, 404 for anyone else, same-origin JSON on POST, no-store; the hub card sits behind the admin page', () => {
  const r = code(read('app/api/admin/early-access/route.js'))
  assert.match(r, /isAdminUser\(user\)/); assert.match(r, /status: 404/); assert.match(r, /sameOriginJson\(request\)/); assert.match(r, /private, no-store/); assert.match(r, /force-dynamic/)
  assert.match(r, /if \(!\(await admin\(\)\)\) return no\(\)/); assert.match(r, /if \(!user\) return no\(\)/)
  const m = code(read('app/api/early-access/mine/route.js')); assert.match(m, /user\.id/); assert.match(m, /private, no-store/)
  assert.ok(!/searchParams|request/.test(m), 'mine answers for the session\'s own account only')
  assert.match(read('components/admin/AdminHub.js'), /<EarlyAccess \/>/)
  assert.match(read('lib/adminHub.js'), /id: 'early'/)
})
await ok('admin: a grant holder is not an admin -- no admin surface, no admin entries; a non-admin sees nothing of the admin side', () => {
  const holder = user('h1', 'holder@test.invalid')
  assert.equal(adminSurface(holder).admin, false); assert.deepEqual(adminEntries(holder), [])
  assert.ok(!/early/i.test(JSON.stringify(adminEntries(adminU))), 'the header/More/search entry points are unchanged')
  const accessSrc = code(read('lib/earlyAccess/access.js')) + code(read('lib/nba/gate.js'))
  assert.ok(!/ADMIN_EMAILS|adminEntries|adminSurface/.test(accessSrc.replace(/isAdminUser/g, '')), 'no grant path widens the admin gate')
  assert.equal(read('lib/admin.js').includes('early'), false, 'lib/admin.js is untouched by early access')
})


// ── 8b. GRANT BY EMAIL ────────────────────────────────────────────────────────────────────────────────────────────────────
await ok('by email: an existing confirmed account is granted at once (case-insensitive exact match, idempotent); output is masked only', async () => {
  A.clearGrantCache(); A._resetPendingFlag(); db = fakeDb(); db.addUser('u1', 'Jane.Doe@Gmail.com'); db.addUser('u2', 'jane.doe@gmail.com.evil.test')
  const r = await AD.act(db, { action: 'grant_email', email: '  JANE.doe@gmail.COM ', feature: 'buckets', expires: '7d', note: 'for @jane' }, { by: 'adm', now: T0 })
  assert.equal(r.status, 200); assert.equal(r.json.status, 'granted'); assert.equal(r.json.who, 'J***@gmail.COM'.replace('J', 'J').replace('COM', 'COM')); assert.ok(!/Doe|doe/.test(JSON.stringify(r.json)), 'the typed address is not echoed')
  assert.equal(db.t.early_access_grants.length, 1); assert.equal(db.t.early_access_grants[0].user_id, 'u1'); assert.equal(db.t.early_access_grants[0].expires_at, new Date(T0 + 7 * 86400e3).toISOString())
  const again = await AD.act(db, { action: 'grant_email', email: 'jane.doe@gmail.com', feature: 'buckets' }, { by: 'adm', now: T0 + 5 }); assert.equal(again.json.status, 'granted'); assert.equal(db.t.early_access_grants.length, 1, 'idempotent: one row')
  assert.equal(db.t.early_access_pending.length, 0)
  assert.equal((await A.featureAccess('buckets', { user: { id: 'u1', email: 'Jane.Doe@Gmail.com', email_confirmed_at: 'x' }, db, now: T0 + 6 })).early, true)
  assert.equal((await A.featureAccess('buckets', { user: { id: 'u2', email: 'jane.doe@gmail.com.evil.test', email_confirmed_at: 'x' }, db, now: T0 + 6 })).ok, false, 'a lookalike address gets nothing')
})
await ok('by email: no account yet -> a PENDING grant under sha256(lowercase email); no plain email stored; it activates on the first CONFIRMED sign-in only', async () => {
  A.clearGrantCache(); A._resetPendingFlag(); db = fakeDb()
  const r = await AD.act(db, { action: 'grant_email', email: 'New.Person@Example.com', feature: 'buckets', expires: 'never', note: 'x' }, { by: 'adm', now: T0 })
  assert.equal(r.json.status, 'pending'); assert.equal(r.json.who, 'N***@Example.com'); assert.equal(db.t.early_access_grants.length, 0)
  const row = db.t.early_access_pending[0]; assert.equal(row.email_hash, S.emailHash('new.person@example.com')); assert.match(row.email_hash, /^[0-9a-f]{64}$/)
  assert.ok(!/new\.person/i.test(JSON.stringify(db.t)), 'the plain email is nowhere in the stored rows')
  // an UNCONFIRMED sign-up with that email never activates
  const unconf = { id: 'n1', email: 'new.person@example.com', email_confirmed_at: null }
  assert.equal((await A.featureAccess('buckets', { user: unconf, db, now: T0 + 1 })).ok, false); assert.equal(db.t.early_access_grants.length, 0); assert.equal(db.t.early_access_pending[0].activated_at ?? null, null)
  // a confirmed one does (case differs from what the admin typed)
  A.clearGrantCache()
  const conf = { id: 'n1', email: 'NEW.person@EXAMPLE.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
  assert.equal((await A.featureAccess('buckets', { user: conf, db, now: T0 + 2 })).early, true)
  assert.equal(db.t.early_access_grants.length, 1); assert.equal(db.t.early_access_grants[0].user_id, 'n1'); assert.ok(db.t.early_access_pending[0].activated_at)
  // someone else's email never matches
  A.clearGrantCache(); assert.equal((await A.featureAccess('buckets', { user: { id: 'z', email: 'someone@example.com', email_confirmed_at: 'x' }, db, now: T0 + 3 })).ok, false)
})
await ok('by email: an existing but UNCONFIRMED account is pending, not granted; confirming later activates it', async () => {
  A.clearGrantCache(); A._resetPendingFlag(); db = fakeDb(); db.addUser('u9', 'late@example.com', false)
  const r = await AD.act(db, { action: 'grant_email', email: 'late@example.com', feature: 'buckets' }, { now: T0 }); assert.equal(r.json.status, 'pending'); assert.equal(db.t.early_access_grants.length, 0)
  assert.equal((await A.featureAccess('buckets', { user: { id: 'u9', email: 'late@example.com', email_confirmed_at: null }, db, now: T0 + 1 })).ok, false)
  A.clearGrantCache(); assert.equal((await A.featureAccess('buckets', { user: { id: 'u9', email: 'late@example.com', email_confirmed_at: 'now' }, db, now: T0 + 2 })).early, true)
})
await ok('by email: revoke a pending grant (never activates), expired pending never activates, the list shows masked pending only', async () => {
  A.clearGrantCache(); A._resetPendingFlag(); db = fakeDb()
  await AD.act(db, { action: 'grant_email', email: 'gone@example.com', feature: 'buckets' }, { now: T0 })
  await AD.act(db, { action: 'grant_email', email: 'old@example.com', feature: 'buckets', expires: '24h' }, { now: T0 })
  const ov = await AD.overview(db, T0 + 1); assert.equal(ov.json.pending.length, 2); assert.equal(ov.json.counts.pending, 2); assert.equal(ov.json.email_installed, true)
  const txt = JSON.stringify(ov.json); assert.ok(!/gone@|old@|"email_hash"/.test(txt)); assert.ok(txt.includes('g***@example.com'))
  const gone = ov.json.pending.find((p) => p.who === 'g***@example.com')
  assert.equal((await AD.act(db, { action: 'revoke_pending', id: gone.id }, { now: T0 + 2 })).status, 200)
  assert.equal((await A.featureAccess('buckets', { user: { id: 'g', email: 'gone@example.com', email_confirmed_at: 'x' }, db, now: T0 + 3 })).ok, false, 'revoked pending')
  A.clearGrantCache(); assert.equal((await A.featureAccess('buckets', { user: { id: 'o', email: 'old@example.com', email_confirmed_at: 'x' }, db, now: T0 + 25 * 3600e3 })).ok, false, 'expired pending')
  assert.equal((await AD.overview(db, T0 + 25 * 3600e3)).json.counts.pending, 0)
})
await ok('by email: bad input refused; before the second migration it says run the update, stores nothing, and the access path still works', async () => {
  db = fakeDb(); db.addUser('u1', 'a@example.com')
  for (const bad of ['', 'nope', 'a@b', '@x.com', 'a b@x.com']) assert.equal((await AD.act(db, { action: 'grant_email', email: bad, feature: 'buckets' }, {})).status, 400)
  assert.equal((await AD.act(db, { action: 'grant_email', email: 'a@example.com', feature: 'nope' }, {})).status, 400)
  const np = fakeDb({ noPending: true }); np.addUser('u1', 'a@example.com')
  const r = await AD.act(np, { action: 'grant_email', email: 'a@example.com', feature: 'buckets' }, {}); assert.equal(r.status, 409); assert.equal(r.json.needs_sql, true); assert.match(r.json.file, /202610121600_early_access_email\.sql/)
  assert.equal(np.t.early_access_grants.length, 0); assert.equal(np.t.early_access_pending.length, 0)
  assert.equal((await AD.act(np, { action: 'revoke_pending', id: 'x' }, {})).status, 409)
  A.clearGrantCache(); A._resetPendingFlag(); np.t.early_access_grants.push({ id: 'g', user_id: 'u1', feature: 'buckets', granted_at: new Date(T0).toISOString(), expires_at: null, revoked_at: null })
  assert.equal((await A.featureAccess('buckets', { user: { id: 'u1', email: 'a@example.com', email_confirmed_at: 'x' }, db: np, now: T0 + 1 })).early, true, 'existing grants unaffected')
  assert.equal((await AD.overview(np, T0)).json.email_installed, false)
})
await ok('by email: paginated lookup finds a user beyond the first page; the route stays admin-only and the card never echoes the typed address', async () => {
  db = fakeDb(); for (let i = 0; i < 450; i += 1) db.addUser(`p${i}`, `user${i}@example.com`)
  assert.equal((await S.findUserByEmail(db, 'USER433@example.com')).id, 'p433'); assert.equal(await S.findUserByEmail(db, 'nobody@example.com'), null)
  const r = code(read('app/api/admin/early-access/route.js')); assert.match(r, /isAdminUser\(user\)/); assert.match(r, /sameOriginJson/)
  const ui = read('components/admin/EarlyAccess.js'); assert.match(ui, /setGEmail\(''\)/); assert.ok(!/supabase/i.test(code(ui).replace(/\{j\.file[^}]*\}/g, '')) , 'no "supabase" in browser-bundled code')
  assert.match(read('components/admin/EarlyAccess.js'), /Grant access/)
})
await ok('migration 2: a second idempotent file, RLS on, no policies, privileges revoked, no plain email column, byte-identical .txt; the first file is untouched', () => {
  const sql = read('supabase/migrations/202610121600_early_access_email.sql')
  assert.match(sql, /create table if not exists public\.early_access_pending/); assert.match(sql, /enable row level security/); assert.match(sql, /revoke all on table public\.early_access_pending from anon, authenticated/)
  assert.ok(!/create policy/i.test(sql)); assert.ok(!/\bemail\s+text/.test(sql)); assert.match(sql, /email_hash\s+text not null/); assert.match(sql, /unique \(email_hash, feature\)/)
  assert.ok(!/\bset role\b/i.test(sql.replace(/--.*$/gm, '')))
  try { assert.equal(readFileSync('/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/EARLY-ACCESS/early_access_email_SQL.txt', 'utf8'), sql) } catch (e) { if (e.code !== 'ENOENT') throw e }
  assert.ok(!/early_access_pending/.test(read('supabase/migrations/202610121500_early_access.sql')), 'the first migration was not changed')
})

// ── 9. public surfaces and posting ──────────────────────────────────────────────────────────────────────────────────────────
const walk = (dir, out = []) => { for (const e of readdirSync(new URL(`../${dir}`, import.meta.url))) { if (['node_modules', '.next'].includes(e)) continue; const p = `${dir}/${e}`; (statSync(new URL(`../${p}`, import.meta.url)).isDirectory()) ? walk(p, out) : /\.(js|mjs)$/.test(e) && out.push(p) } return out }
await ok('public surfaces never mention BUCKETS: robots, sitemap, manifest, the invite page before sign-in, the login line', () => {
  for (const f of ['app/robots.js', 'app/sitemap.js']) assert.ok(!/buckets|nba/i.test(code(read(f))), `${f} names BUCKETS`)
  for (const f of walk('public').concat(['app/layout.js'])) if (/manifest|\.webmanifest|\.json$/.test(f)) assert.ok(!/buckets/i.test(read(f)), `${f} names BUCKETS`)
  const login = read('app/login/page.js'); assert.match(login, /You&apos;ve been invited to early access/); assert.ok(!/buckets/i.test(login.slice(login.indexOf("startsWith('/early/')") - 200, login.indexOf("startsWith('/early/')") + 500)))
  const pg = code(read('app/early/[code]/page.js')); assert.ok(!/buckets|nba/i.test(pg))
  assert.match(read('app/robots.js'), /'\/early\/'/)
})
await ok('posting is untouched: no poster / push / member module imports early access, features, or the gate; mayPost reads the PUBLIC switch only', async () => {
  const EA = /earlyAccess|lib\/features|from ['"]\.\.?\/features|nba\/gate|featureAccess|grantsOf/
  const POSTS = /\b(postToX|postToDiscord|sendMembers|sendFree|postOnce|postMembers|webpush|sendNotification|sendPush)\b/
  const bad = []
  for (const f of walk('lib').concat(walk('app/api'))) {
    if (f.startsWith('lib/earlyAccess/') || f === 'lib/features.js') continue
    const c = code(read(f))
    if (POSTS.test(c) && EA.test(c.replace(/nba\/gate/g, (m, off) => (/bucketsPublic|bucketsGuard/.test(c) ? '' : m)))) bad.push(f)
  }
  // the gate is allowed in a poster only for bucketsPublic (the PUBLIC switch) -- never bucketsAccess / featureAccess
  const gateUsers = walk('lib').concat(walk('app')).filter((f) => !f.startsWith('lib/earlyAccess/') && /bucketsAccess|featureAccess|grantsOf|ownFeatures/.test(code(read(f))))
  const allowed = new Set(['lib/nba/gate.js', 'app/api/buckets/access/route.js', 'app/api/early-access/mine/route.js'])
  assert.deepEqual(gateUsers.filter((f) => !allowed.has(f)), [], 'only the gate and the access routes read access')
  assert.deepEqual(bad, [], `a poster path reaches early access: ${bad.join(', ')}`)
  const sw = code(read('lib/openSwitch.js')); assert.ok(!/import /.test(sw), 'openSwitch.js stays import-free'); assert.ok(!/grant|early/i.test(sw))
  // behaviour: a grant holder in the fake db, switch closed -> mayPost still refuses every NBA post
  A.clearGrantCache(); db = fakeDb(); db.t.early_access_grants.push({ id: 'g', user_id: 'h1', feature: 'buckets', granted_at: new Date(T0).toISOString(), expires_at: null, revoked_at: null })
  assert.equal((await G.bucketsAccess({ getUser: async () => user('h1'), db })).early, true)
  for (const a of [{ sport: 'nba' }, { sportKey: 'nba' }, { kind: 'nba30' }, { kind: 'writeup_nba_401810001' }, { kind: 'card_members_nba' }, { kind: 'nba_poll_x' }]) assert.equal(SW.mayPost(a), false, JSON.stringify(a))
  assert.equal(SW.isSportOpen('nba'), false); assert.equal(G.bucketsPublic(), false)
})
await ok('the 30-night floor still applies to a holder: the floor is applied where the numbers are made, with no early-access branch', () => {
  const fl = code(read('lib/record/nbaFloor.js')); assert.ok(!/early|grant|bucketsAccess/i.test(fl)); assert.match(fl, /NBA_MIN_NIGHTS = LADDER_MIN_N/)
  for (const f of ['app/api/buckets/record/route.js', 'app/api/record/calls/route.js']) assert.ok(!/\.early\b|early:/.test(code(read(f))), `${f} must not branch on early access`)
  assert.match(read('lib/features.js'), /30 graded nights/)
})
await ok('no secrets or ids in any early-access response: the sources never put an env value, a service key, a hash or a raw email in a body', () => {
  for (const f of ['app/api/admin/early-access/route.js', 'app/api/early-access/mine/route.js', 'app/api/buckets/access/route.js', 'lib/earlyAccess/admin.js']) {
    const c = code(read(f))
    assert.ok(!/SERVICE_ROLE|process\.env\.(?!NEXT_PUBLIC_SITE_URL)/.test(c), `${f} reads an env value into a response`)
    assert.ok(!/code_hash/.test(c.replace(/select\([^)]*\)/g, '')), `${f} mentions the hash outside a select`)
  }
  assert.ok(!/\.email\b/.test(code(read('lib/earlyAccess/admin.js')).replace(/user\?\.email/g, '').replace(/body\.email/g, '')), 'the admin module only ever passes an email through maskEmail')
  const secretsInStore = code(read('lib/earlyAccess/store.js')); assert.ok(!/console\./.test(secretsInStore), 'the store never logs')
  assert.ok(!/console\.[a-z]+\([^)]*code/.test(code(read('app/early/[code]/page.js'))), 'the page never logs the code')
})
await ok('migration: idempotent, RLS on with no policies, browser roles revoked, hashed column, byte-identical plain .txt', () => {
  const sql = read('supabase/migrations/202610121500_early_access.sql')
  assert.ok(sql.includes('create table if not exists public.early_access_grants') && sql.includes('create table if not exists public.early_access_invites'))
  assert.match(sql, /alter table public\.early_access_grants\s+enable row level security/); assert.match(sql, /alter table public\.early_access_invites enable row level security/)
  assert.match(sql, /revoke all on table public\.early_access_invites from anon, authenticated/); assert.match(sql, /revoke all on table public\.early_access_grants\s+from anon, authenticated/)
  assert.ok(!/create policy/i.test(sql)); assert.ok(!/\bset role\b/i.test(code(sql.replace(/--.*$/gm, ''))))
  assert.match(sql, /code_hash\s+text not null/); assert.ok(!/\bcode\s+text/.test(sql)); assert.match(sql, /unique \(user_id, feature\)/)
  assert.ok(!/security definer/i.test(sql))
  try {
    const txt = readFileSync('/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/EARLY-ACCESS/early_access_SQL.txt', 'utf8')
    assert.equal(txt, sql, 'the plain .txt is byte-identical to the migration')
  } catch (e) { if (e.code !== 'ENOENT') throw e; console.log('    (plain .txt not found on this machine: skipped)') }
})

console.log(`\n${n} checks passed`)
