// EARLY-ACCESS STORE (2026-10-12): every read and write of early_access_grants / early_access_invites. SERVER ONLY, service-role client only
// (lib/supabase/admin.js adminClient): both tables have RLS on and NO policies, so the browser's anon / authenticated keys can neither read nor write them.
// `db` is passed in so a test can hand it a fake; no module state here except what the caller owns.
//
// Until supabase/migrations/202610121500_early_access.sql is run every function degrades safely:
//   activeGrantFeatures  -> []   (no grant: BUCKETS stays exactly as it was for non-admins)
//   createInvite         -> { ok:false, needs_sql:true } and stores nothing
//   redeem               -> { ok:false } (the page shows the one generic message)
//
// REDEEM IS ATOMIC WITHOUT A DATABASE FUNCTION: the invite's `uses` is incremented by a compare-and-swap UPDATE
//   update early_access_invites set uses = <read+1> where id = <id> and uses = <read> and revoked_at is null [and expires_at > now]
// Two simultaneous redeems of a 1-use code both read uses = 0; both try to write 1 where uses = 0; Postgres lets exactly one row-update match.
// The loser re-reads, sees uses = max_uses, and fails (or, if it is the same account, finds the grant the winner wrote and succeeds: idempotent).
import { isFeatureKey } from '../features.js'
import { newCode, hashCode, codeTail, normalizeCode, USES_OPTIONS, expiryAt, cleanNote, maskEmail } from './codes.js'

const missingTable = (e) => Boolean(e) && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204' || /does not exist|schema cache/i.test(String(e.message || '')))
export const GRANTS = 'early_access_grants'
export const INVITES = 'early_access_invites'
export const PENDING = 'early_access_pending'   // 202610121600_early_access_email.sql

const activeNow = (row, now) => row && !row.revoked_at && (!row.expires_at || Date.parse(row.expires_at) > now)

/** { ok, features:[key], missing } -- the feature keys this user holds an ACTIVE grant for (not revoked, not expired). Any error -> no grants. */
export async function activeGrantFeatures(db, userId, now = Date.now()) {
  if (!db || !userId) return { ok: false, features: [], missing: false }
  try {
    const { data, error } = await db.from(GRANTS).select('feature, expires_at, revoked_at').eq('user_id', userId)
    if (error) return { ok: false, features: [], missing: missingTable(error) }
    return { ok: true, features: [...new Set((data || []).filter((g) => activeNow(g, now) && isFeatureKey(g.feature)).map((g) => g.feature))], missing: false }
  } catch { return { ok: false, features: [], missing: false } }
}

/** Make an invite. Returns { ok, code, row } -- `code` is the ONLY time the plain code exists; the row stores its hash and last 4. */
export async function createInvite(db, { feature, uses = 1, expires = '7d', note = '', by = null, now = Date.now(), rng } = {}) {
  if (!db) return { ok: false, error: 'no database' }
  if (!isFeatureKey(feature)) return { ok: false, error: 'unknown feature' }
  if (!USES_OPTIONS.includes(Number(uses))) return { ok: false, error: 'uses must be 1, 5 or 25' }
  const exp = expiryAt(expires, now)
  if (exp === undefined) return { ok: false, error: 'expiry must be 24h, 7d, 30d or never' }
  const code = rng ? newCode(rng) : newCode()
  const row = { code_hash: hashCode(code), code_tail: codeTail(code), feature, created_at: new Date(now).toISOString(), created_by: by, expires_at: exp, max_uses: Number(uses), uses: 0, note: cleanNote(note), revoked_at: null }
  try {
    const { data, error } = await db.from(INVITES).insert(row).select('id').single()
    if (error) return missingTable(error) ? { ok: false, needs_sql: true } : { ok: false, error: 'could not save the invite' }
    return { ok: true, code, id: data?.id ?? null }
  } catch { return { ok: false, error: 'could not save the invite' } }
}

async function readInvite(db, hash) {
  const { data, error } = await db.from(INVITES).select('*').eq('code_hash', hash).maybeSingle()
  if (error) throw Object.assign(new Error('invite read failed'), { cause: error })
  return data || null
}
async function activeGrant(db, userId, feature, now) {
  const { data } = await db.from(GRANTS).select('id, expires_at, revoked_at').eq('user_id', userId).eq('feature', feature).maybeSingle()
  return activeNow(data, now) ? data : null
}

/**
 * Redeem a code for a signed-in user. { ok:true, feature, already } or { ok:false, why } -- `why` is for the SERVER LOG only (never an email, never the
 * code); the page shows ONE generic message whatever it is, so the response is no oracle for "wrong / expired / used / revoked".
 */
export async function redeem(db, { code, userId, now = Date.now() } = {}) {
  if (!db || !userId) return { ok: false, why: 'no-db-or-user' }
  const norm = normalizeCode(code)
  if (!norm) return { ok: false, why: 'shape' }
  try {
    const hash = hashCode(norm)
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const inv = await readInvite(db, hash)
      if (!inv) return { ok: false, why: 'unknown' }
      if (!isFeatureKey(inv.feature)) return { ok: false, why: 'feature-gone' }
      // already a holder of this feature: success, nothing consumed (idempotent)
      if (await activeGrant(db, userId, inv.feature, now)) return { ok: true, feature: inv.feature, already: true }
      if (inv.revoked_at) return { ok: false, why: 'revoked' }
      if (inv.expires_at && Date.parse(inv.expires_at) <= now) return { ok: false, why: 'expired' }
      if (!(Number(inv.uses) < Number(inv.max_uses))) return { ok: false, why: 'used-up' }
      let q = db.from(INVITES).update({ uses: Number(inv.uses) + 1 }).eq('id', inv.id).eq('uses', inv.uses).is('revoked_at', null)
      if (inv.expires_at) q = q.gt('expires_at', new Date(now).toISOString())
      const { data: won, error: casErr } = await q.select('id')
      if (casErr) return { ok: false, why: 'cas-error' }
      if (!won || won.length !== 1) continue            // lost the race: re-read and decide again
      const { error: gErr } = await db.from(GRANTS).upsert({
        user_id: userId, feature: inv.feature, granted_at: new Date(now).toISOString(), granted_by: inv.created_by || null,
        expires_at: null, revoked_at: null, note: inv.note || null, invite_id: inv.id,
      }, { onConflict: 'user_id,feature' }).select('id')
      if (gErr) {
        // give the use back (compare-and-swap again) so a failed write does not burn the invite
        await db.from(INVITES).update({ uses: Number(inv.uses) }).eq('id', inv.id).eq('uses', Number(inv.uses) + 1).select('id')
        return { ok: false, why: missingTable(gErr) ? 'no-table' : 'grant-write' }
      }
      return { ok: true, feature: inv.feature, already: false }
    }
    return { ok: false, why: 'contended' }
  } catch (e) {
    return { ok: false, why: missingTable(e?.cause) ? 'no-table' : 'error' }
  }
}

export async function revokeInvite(db, id, now = Date.now()) {
  if (!db || !id) return { ok: false }
  try {
    const { data, error } = await db.from(INVITES).update({ revoked_at: new Date(now).toISOString() }).eq('id', id).is('revoked_at', null).select('id')
    return error ? { ok: false, needs_sql: missingTable(error) } : { ok: true, changed: (data || []).length }
  } catch { return { ok: false } }
}
export async function revokeGrant(db, id, now = Date.now()) {
  if (!db || !id) return { ok: false }
  try {
    const { data, error } = await db.from(GRANTS).update({ revoked_at: new Date(now).toISOString() }).eq('id', id).is('revoked_at', null).select('id, user_id')
    return error ? { ok: false, needs_sql: missingTable(error) } : { ok: true, changed: (data || []).length, userIds: (data || []).map((r) => r.user_id) }
  } catch { return { ok: false } }
}

/** Everything the admin card draws, raw (the admin handler masks it): { ok, missing, invites, grants }. */
export async function listAll(db) {
  if (!db) return { ok: false, missing: false, invites: [], grants: [] }
  try {
    const [i, g] = await Promise.all([
      db.from(INVITES).select('id, code_tail, feature, created_at, expires_at, max_uses, uses, note, revoked_at').order('created_at', { ascending: false }).limit(100),
      db.from(GRANTS).select('id, user_id, feature, granted_at, expires_at, revoked_at, note, invite_id').order('granted_at', { ascending: false }).limit(300),
    ])
    const err = i.error || g.error
    if (err) return { ok: false, missing: missingTable(err), invites: [], grants: [] }
    return { ok: true, missing: false, invites: i.data || [], grants: g.data || [] }
  } catch { return { ok: false, missing: false, invites: [], grants: [] } }
}

// ── GRANT BY EMAIL (2026-10-12, Donovan: "grant by email is cool, by button click") ─────────────────────────────────────────
// The admin types an email. If an account with that email exists AND its email is confirmed, the grant is made at once (idempotent). Otherwise a PENDING
// grant is stored under sha256(lowercase email) (plus the masked address for the admin list; the plain email is never stored) and it activates the first
// time that email signs in with a CONFIRMED address (activatePending, called from the access path). An unconfirmed email never activates anything.
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/
export const emailHash = (email) => hashCode(`email:${String(email || '').trim().toLowerCase()}`)

/** Exact, case-insensitive match over the auth admin API, paged (200 a page, at most 50 pages). null when none. */
export async function findUserByEmail(db, email) {
  const want = String(email || '').trim().toLowerCase()
  if (!db?.auth?.admin?.listUsers || !want) return null
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('user lookup failed')
    const users = data?.users || []
    const hit = users.find((u) => String(u.email || '').toLowerCase() === want)
    if (hit) return hit
    if (users.length < 200) return null
  }
  return null
}

/** { ok, status:'granted'|'pending', who } | { ok:false, needs_sql } | { ok:false, error }. Stores nothing until the pending table exists. */
export async function grantByEmail(db, { email, feature, expires = 'never', note = '', by = null, now = Date.now() } = {}) {
  if (!db) return { ok: false, error: 'no database' }
  const em = String(email || '').trim()
  if (!EMAIL_RE.test(em)) return { ok: false, error: 'That does not look like an email address.' }
  if (!isFeatureKey(feature)) return { ok: false, error: 'unknown feature' }
  const exp = expiryAt(expires, now)
  if (exp === undefined) return { ok: false, error: 'expiry must be 24h, 7d, 30d or never' }
  try {
    const probe = await db.from(PENDING).select('id').limit(1)
    if (probe.error) return missingTable(probe.error) ? { ok: false, needs_sql: true } : { ok: false, error: 'could not read early access' }
    const who = maskEmail(em)
    const u = await findUserByEmail(db, em)
    if (u && (u.email_confirmed_at || u.confirmed_at)) {
      const { error } = await db.from(GRANTS).upsert({ user_id: u.id, feature, granted_at: new Date(now).toISOString(), granted_by: by, expires_at: exp, revoked_at: null, note: cleanNote(note), invite_id: null }, { onConflict: 'user_id,feature' }).select('id')
      if (error) return missingTable(error) ? { ok: false, needs_sql: true } : { ok: false, error: 'could not save the grant' }
      return { ok: true, status: 'granted', who, userId: u.id }
    }
    // no account yet, or the account's email is not confirmed: wait for the first CONFIRMED sign-in
    const { error } = await db.from(PENDING).upsert({ email_hash: emailHash(em), email_tail: who, feature, expires_at: exp, note: cleanNote(note), created_at: new Date(now).toISOString(), created_by: by, revoked_at: null, activated_at: null }, { onConflict: 'email_hash,feature' }).select('id')
    if (error) return { ok: false, error: 'could not save the pending grant' }
    return { ok: true, status: 'pending', who }
  } catch { return { ok: false, error: 'could not look the account up' } }
}

/**
 * Called from the access path for a signed-in user: turns matching pending grants into real ones, ONLY when the user's email is confirmed.
 * Returns the feature keys activated (usually []). Any error or a missing table -> [] (and `missing` tells the caller to stop asking for a while).
 */
export async function activatePending(db, user, now = Date.now()) {
  const none = { features: [], missing: false }
  if (!db || !user?.id || !user.email || !(user.email_confirmed_at || user.confirmed_at)) return none
  try {
    const { data, error } = await db.from(PENDING).select('id, feature, expires_at, note, created_by').eq('email_hash', emailHash(user.email)).is('revoked_at', null).is('activated_at', null)
    if (error) return { features: [], missing: missingTable(error) }
    const out = []
    for (const p of data || []) {
      if (!isFeatureKey(p.feature) || (p.expires_at && Date.parse(p.expires_at) <= now)) continue
      const g = await db.from(GRANTS).upsert({ user_id: user.id, feature: p.feature, granted_at: new Date(now).toISOString(), granted_by: p.created_by || null, expires_at: p.expires_at || null, revoked_at: null, note: p.note || null, invite_id: null }, { onConflict: 'user_id,feature' }).select('id')
      if (g.error) continue
      await db.from(PENDING).update({ activated_at: new Date(now).toISOString() }).eq('id', p.id).is('activated_at', null).select('id')
      out.push(p.feature)
    }
    return { features: out, missing: false }
  } catch { return none }
}

export async function revokePending(db, id, now = Date.now()) {
  if (!db || !id) return { ok: false }
  try {
    const { data, error } = await db.from(PENDING).update({ revoked_at: new Date(now).toISOString() }).eq('id', id).is('revoked_at', null).select('id')
    return error ? { ok: false, needs_sql: missingTable(error) } : { ok: true, changed: (data || []).length }
  } catch { return { ok: false } }
}

/** The pending grants for the admin list (masked tail only), or { ok:false, missing } before the second migration. */
export async function listPending(db) {
  if (!db) return { ok: false, missing: false, pending: [] }
  try {
    const { data, error } = await db.from(PENDING).select('id, email_tail, feature, expires_at, note, created_at, revoked_at, activated_at').order('created_at', { ascending: false }).limit(100)
    return error ? { ok: false, missing: missingTable(error), pending: [] } : { ok: true, missing: false, pending: data || [] }
  } catch { return { ok: false, missing: false, pending: [] } }
}
