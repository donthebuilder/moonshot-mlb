// THE ADMIN SIDE OF EARLY ACCESS (2026-10-12): what /api/admin/early-access does, as plain functions so a test can run them on a fake database.
// The ROUTE does the gate (lib/admin.js isAdminUser, 404 for anyone else, same-origin JSON on POST, no-store); everything here assumes the caller is the admin.
//
//   overview(db)                 -> { status, json }  the features, the invites (code LAST 4 only, status, who redeemed MASKED), the grant holders (MASKED), counts
//   act(db, body, ctx)           -> { status, json }  create_invite | revoke_invite | revoke_grant
//
// What a response may contain: the plain code and full link appear ONCE, in the create_invite response. Never a code hash, never a full email (masked
// j***@gmail.com), never a user id of a holder (the grant's own row id only).
import { FEATURES, featureByKey } from '../features.js'
import { maskEmail } from './codes.js'
import { createInvite, revokeInvite, revokeGrant, listAll } from './store.js'
import { clearGrantCache } from './access.js'

const SQL_FILE = 'supabase/migrations/202610121500_early_access.sql'
const NEEDS_SQL = { status: 409, json: { needs_sql: true, error: 'Run the early-access update first (it adds the two private tables).', file: SQL_FILE } }

function inviteStatus(r, now) {
  if (r.revoked_at) return 'revoked'
  if (r.expires_at && Date.parse(r.expires_at) <= now) return 'expired'
  if (Number(r.uses) >= Number(r.max_uses)) return 'used up'
  return 'active'
}
function grantStatus(r, now) {
  if (r.revoked_at) return 'revoked'
  if (r.expires_at && Date.parse(r.expires_at) <= now) return 'expired'
  return 'active'
}

/** user id -> masked email, via the auth admin API (service role). A lookup that fails is 'unknown'. */
async function maskedEmails(db, ids) {
  const out = new Map()
  await Promise.all([...new Set(ids)].slice(0, 150).map(async (id) => {
    try { const r = await db.auth.admin.getUserById(id); out.set(id, maskEmail(r?.data?.user?.email)) } catch { out.set(id, 'unknown') }
  }))
  return out
}

export async function overview(db, now = Date.now()) {
  const features = FEATURES.map((f) => ({ key: f.key, label: f.label, public: Boolean(f.publicSwitch()), surfaces: f.surfaces }))
  if (!db) return { status: 200, json: { installed: false, features, invites: [], grants: [], counts: {}, note: 'No database key is configured.' } }
  const all = await listAll(db)
  if (!all.ok) return { status: 200, json: { installed: false, missing: all.missing, features, invites: [], grants: [], counts: {} } }
  const emails = await maskedEmails(db, all.grants.map((g) => g.user_id))
  const redeemedBy = new Map()
  for (const g of all.grants) if (g.invite_id) redeemedBy.set(g.invite_id, [...(redeemedBy.get(g.invite_id) || []), emails.get(g.user_id) || 'unknown'])
  const invites = all.invites.map((r) => ({
    id: r.id, tail: r.code_tail, feature: r.feature, label: featureByKey(r.feature)?.label || r.feature, created_at: r.created_at, expires_at: r.expires_at,
    max_uses: r.max_uses, uses: r.uses, note: r.note || null, status: inviteStatus(r, now), redeemed_by: redeemedBy.get(r.id) || [],
  }))
  const grants = all.grants.map((g) => ({
    id: g.id, feature: g.feature, label: featureByKey(g.feature)?.label || g.feature, who: emails.get(g.user_id) || 'unknown',
    granted_at: g.granted_at, expires_at: g.expires_at, note: g.note || null, status: grantStatus(g, now),
  }))
  const counts = { active_invites: invites.filter((i) => i.status === 'active').length, active_grants: grants.filter((g) => g.status === 'active').length, by_feature: {} }
  for (const f of FEATURES) counts.by_feature[f.key] = grants.filter((g) => g.feature === f.key && g.status === 'active').length
  return { status: 200, json: { installed: true, features, invites, grants, counts } }
}

export async function act(db, body, { origin = '', by = null, now = Date.now(), rng } = {}) {
  if (!db) return { status: 503, json: { error: 'No database key is configured.' } }
  const action = String(body?.action || '')
  if (action === 'create_invite') {
    const r = await createInvite(db, { feature: body.feature, uses: Number(body.uses), expires: body.expires, note: body.note, by, now, rng })
    if (r.needs_sql) return NEEDS_SQL
    if (!r.ok) return { status: 400, json: { error: r.error || 'could not create the invite' } }
    // the ONE time the plain code leaves the server
    return { status: 200, json: { ok: true, link: `${String(origin).replace(/\/+$/, '')}/early/${r.code}`, feature: body.feature, label: featureByKey(body.feature)?.label, uses: Number(body.uses), expires: body.expires, shown_once: true } }
  }
  if (action === 'revoke_invite') {
    const r = await revokeInvite(db, String(body.id || ''), now)
    if (r.needs_sql) return NEEDS_SQL
    return r.ok ? { status: 200, json: { ok: true, changed: r.changed } } : { status: 400, json: { error: 'could not revoke' } }
  }
  if (action === 'revoke_grant') {
    const r = await revokeGrant(db, String(body.id || ''), now)
    if (r.needs_sql) return NEEDS_SQL
    if (r.ok) for (const u of r.userIds || []) clearGrantCache(u)   // this instance stops honouring it at once; others within 60 s
    return r.ok ? { status: 200, json: { ok: true, changed: r.changed } } : { status: 400, json: { error: 'could not revoke' } }
  }
  return { status: 400, json: { error: 'unknown action' } }
}
