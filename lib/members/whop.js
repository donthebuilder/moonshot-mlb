// WHOP -> SITE MEMBERS (2026-10-17, Donovan: "handle that"). The Founding membership is sold on Whop ($10/mo or $2.50/wk, 14-day free trial).
// A paying member becomes a row in site_members within seconds (webhook) and a lapsed one loses it (webhook + daily reconcile), so nobody types emails.
// lib/members/access.js is untouched: it still only asks "is this email in site_members (or MEMBER_EMAILS, or an admin)".
//
// OWNERSHIP RULE: rows this module writes carry source='whop'. It NEVER updates or deletes any other row (hand-added rows, MEMBER_EMAILS is env anyway).
// If the source column is not there yet (SQL owed: supabase/migrations/202610171200_site_members_whop.sql) it writes the basic row and removes NOTHING.
//
// SERVER-ONLY. Pure functions first (tested by scripts/check-whop-sync.mjs), then the db functions that take the client as an argument.
// Docs used (docs.whop.com): developer/guides/webhooks (Standard Webhooks headers), api-reference/memberships/membership-activated + membership-deactivated,
// api-reference/memberships/list-memberships (GET /api/v1/memberships, company_id, statuses, first/after), developer/guides/memberships.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

export const WHOP_API = 'https://api.whop.com/api/v1'
const TOLERANCE_SEC = 5 * 60

// ---- 1. signature (Standard Webhooks: signed text = `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256, header "v1,<base64>" (space separated list)) ----
function keyCandidates(secret) {
  const s = String(secret || '').trim()
  if (!s) return []
  const out = []
  const stripped = s.replace(/^whsec_/, '')
  try { const b = Buffer.from(stripped, 'base64'); if (b.length) out.push(b) } catch {}
  out.push(Buffer.from(s, 'utf8')) // Whop's SDK is handed the secret itself (base64-encoded by the SDK): the raw text is the key too
  return out
}

/** True only for a fresh, correctly signed delivery. `headers` is a Headers or a plain object. Never throws. */
export function verifyWhopSignature(rawBody, headers, secret, { now = Date.now() } = {}) {
  try {
    const get = (k) => (typeof headers?.get === 'function' ? headers.get(k) : headers?.[k]) || ''
    const id = get('webhook-id'); const ts = get('webhook-timestamp'); const sigHeader = get('webhook-signature')
    if (!id || !ts || !sigHeader || typeof rawBody !== 'string') return false
    const t = Number(ts)
    if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_SEC) return false
    const signed = `${id}.${ts}.${rawBody}`
    const supplied = String(sigHeader).split(/\s+/).map((p) => p.split(',')).filter((p) => p[0] === 'v1' && p[1]).map((p) => Buffer.from(p[1]))
    for (const key of keyCandidates(secret)) {
      const want = Buffer.from(createHmac('sha256', key).update(signed).digest('base64'))
      if (supplied.some((got) => got.length === want.length && timingSafeEqual(got, want))) return true
    }
    return false
  } catch { return false }
}

// ---- 2. mapping + decision ----
// statuses per docs list-memberships: trialing, active, past_due, completed, canceled, expired, unresolved, drafted, canceling.
// trialing and canceling still have access (docs, memberships guide). past_due does not.
const VALID_STATUS = new Set(['active', 'trialing', 'canceling'])
const toIso = (v) => {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const emailOf = (m) => {
  const e = m?.user?.email || m?.member?.user?.email || m?.email || ''
  const s = String(e).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''
}

/** A Whop membership object (webhook `data`, or one list row) -> { email, status, plan, valid_until, whop_membership_id, cancel_at_period_end } (email '' when none). */
export function mapMembership(m) {
  const plan = m?.plan?.id || m?.plan_id || (typeof m?.plan === 'string' ? m.plan : '') || null
  return {
    email: emailOf(m),
    status: String(m?.status || '').toLowerCase() || null,
    plan,
    valid_until: toIso(m?.renewal_period_end ?? m?.expires_at ?? null),
    whop_membership_id: m?.id || null,
    cancel_at_period_end: Boolean(m?.cancel_at_period_end),
  }
}

/** Member yes/no: valid or trialing = yes; canceled at period end stays yes until the period ends; everything else no. */
export function isValidMapped(x, { now = Date.now() } = {}) {
  if (!x || !x.status) return false
  const endMs = x.valid_until ? Date.parse(x.valid_until) : null
  if (VALID_STATUS.has(x.status)) {
    if (x.cancel_at_period_end && endMs != null && endMs < now) return false
    return true
  }
  return false
}

/** A webhook body -> { event, mapped, valid } or null when it is not a membership event we act on. */
export function decideFromEvent(body, { now = Date.now() } = {}) {
  const event = String(body?.type || body?.action || body?.event || '')
  if (!/^membership[._]/.test(event)) return null
  const mapped = mapMembership(body?.data)
  let valid = isValidMapped(mapped, { now })
  if (/deactivated|went_invalid/.test(event)) valid = false
  return { event, mapped, valid }
}

/** Log-safe tag for an email: never the address. */
export const emailTag = (email) => (email ? createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 8) : 'none')

// ---- 3. site_members writes (db = a supabase service client) ----
const isMissingColumn = (error) => Boolean(error) && /column|schema cache/i.test(`${error.message || ''} ${error.code || ''}`)

/** Apply one decision. Idempotent. Returns { action: 'added'|'updated'|'removed'|'kept-manual'|'noop'|'no-email', columns: boolean }. */
export async function applyDecision(db, { mapped, valid }, { now = new Date() } = {}) {
  const email = mapped?.email
  if (!email) return { action: 'no-email' }
  const stamp = now.toISOString()
  let sel = await db.from('site_members').select('email, source').eq('email', email).maybeSingle()
  let columns = true
  if (sel.error && isMissingColumn(sel.error)) { columns = false; sel = await db.from('site_members').select('email').eq('email', email).maybeSingle() }
  if (sel.error) throw new Error(`site_members read failed: ${sel.error.code || 'error'}`)
  const row = sel.data
  if (valid) {
    if (row && columns && row.source !== 'whop') return { action: 'kept-manual', columns }
    if (row && !columns) return { action: 'noop', columns } // cannot tell whose row it is; it already grants access
    const full = { email, note: 'whop', source: 'whop', whop_membership_id: mapped.whop_membership_id, plan: mapped.plan, status: mapped.status, valid_until: mapped.valid_until, synced_at: stamp }
    let up = columns ? await db.from('site_members').upsert(full, { onConflict: 'email' }) : { error: null }
    if (up.error && isMissingColumn(up.error)) { columns = false; up = { error: null } }
    if (up.error) throw new Error(`site_members write failed: ${up.error.code || 'error'}`)
    if (!columns) {
      const basic = await db.from('site_members').upsert({ email, note: 'whop' }, { onConflict: 'email' })
      if (basic.error) throw new Error(`site_members write failed: ${basic.error.code || 'error'}`)
    }
    return { action: row ? 'updated' : 'added', columns }
  }
  // not valid: only ever remove a row this sync owns
  if (!row || !columns) return { action: 'noop', columns }
  if (row.source !== 'whop') return { action: 'kept-manual', columns }
  const del = await db.from('site_members').delete().eq('email', email).eq('source', 'whop')
  if (del.error) throw new Error(`site_members delete failed: ${del.error.code || 'error'}`)
  return { action: 'removed', columns }
}

// ---- 4. reconcile (daily drift fix) ----
/** Pure: given Whop's valid emails and the whop-owned rows, what to add and what to remove. Manual rows never appear in `whopRows`. */
export function planReconcile(validMapped, whopRows, existingEmails = new Set()) {
  const validByEmail = new Map()
  for (const m of validMapped) if (m.email) validByEmail.set(m.email, m)
  const owned = new Set(whopRows.map((r) => r.email))
  const add = [...validByEmail.values()].filter((m) => !owned.has(m.email) && !existingEmails.has(m.email))
  const refresh = [...validByEmail.values()].filter((m) => owned.has(m.email))
  const remove = whopRows.filter((r) => !validByEmail.has(r.email)).map((r) => r.email)
  return { add, refresh, remove }
}

/** Page through Whop's memberships that are valid. Returns { ok, list } and ok=false if any page failed (then nothing may be removed). */
export async function fetchValidMemberships({ apiKey, companyId, fetchImpl = fetch, maxPages = 50 }) {
  const list = []
  let after = null
  for (let i = 0; i < maxPages; i++) {
    const u = new URL(`${WHOP_API}/memberships`)
    u.searchParams.set('company_id', companyId)
    u.searchParams.set('first', '100')
    for (const s of ['trialing', 'active', 'canceling']) u.searchParams.append('statuses[]', s)
    if (after) u.searchParams.set('after', after)
    const res = await fetchImpl(u, { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' })
    if (!res.ok) return { ok: false, list, error: `whop list ${res.status}` }
    const json = await res.json()
    for (const row of json?.data || []) list.push(mapMembership(row))
    const pi = json?.page_info
    if (!pi?.has_next_page || !pi?.end_cursor) return { ok: true, list }
    after = pi.end_cursor
  }
  return { ok: false, list, error: 'whop list too long' }
}

/** Fix drift. Adds missing paying members, removes whop-owned rows Whop no longer calls valid. Never touches other rows. Returns counts, never emails. */
export async function reconcileWhop(db, { apiKey, companyId, fetchImpl = fetch, now = new Date() } = {}) {
  if (!db) return { ok: false, error: 'no database' }
  if (!apiKey || !companyId) return { ok: false, error: 'WHOP_API_KEY / WHOP_COMPANY_ID not set' }
  const got = await fetchValidMemberships({ apiKey, companyId, fetchImpl })
  if (!got.ok) return { ok: false, error: got.error } // an incomplete list must never remove anyone
  const valid = got.list.filter((m) => m.email && isValidMapped(m, { now: now.getTime() }))
  const owned = await db.from('site_members').select('email').eq('source', 'whop')
  if (owned.error) {
    if (!isMissingColumn(owned.error)) return { ok: false, error: 'site_members read failed' }
    let added = 0
    for (const m of valid) { const r = await applyDecision(db, { mapped: m, valid: true }, { now }); if (r.action === 'added') added++ }
    return { ok: true, added, removed: 0, refreshed: 0, note: 'source column missing: add-only until the SQL is run' }
  }
  const allRes = await db.from('site_members').select('email')
  const existing = new Set((allRes.data || []).map((r) => r.email))
  const plan = planReconcile(valid, owned.data || [], existing)
  // a whole-list wipe is far more likely a bad key/company than every member lapsing at once: refuse
  if (valid.length === 0 && (owned.data || []).length > 0) return { ok: false, error: 'Whop returned zero valid memberships; removing nobody', wouldRemove: plan.remove.length }
  for (const m of [...plan.add, ...plan.refresh]) await applyDecision(db, { mapped: m, valid: true }, { now })
  for (const email of plan.remove) await applyDecision(db, { mapped: { email }, valid: false }, { now })
  return { ok: true, added: plan.add.length, refreshed: plan.refresh.length, removed: plan.remove.length }
}
