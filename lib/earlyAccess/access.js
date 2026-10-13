// THE ACCESS RULE (2026-10-12): a visitor may use a gated feature when
//     the feature is PUBLIC   (its registry switch is on)          -> everyone; grants are then no-ops (rows kept)
//  OR the visitor is an ADMIN (lib/admin.js isAdminUser)           -> as it has always been
//  OR the visitor holds an ACTIVE GRANT for it                     -> a signed-in account (user id), not revoked, not expired.
// SERVER ONLY. Judged from the session; the client never decides. Grants are looked up by auth user id and cached 60 s per user in memory, so a revoked
// or expired grant stops working within 60 s (and at once on the instance that handled the revoke: clearGrantCache).
//
// WHAT A GRANT NEVER DOES: it is not an admin (no /admin, no /admin/*, no admin entry points) and it never reaches a poster: posting asks
// lib/openSwitch.js mayPost, which reads the PUBLIC switch only and imports nothing from here (scripts/check-buckets-no-leak.mjs).
import { featureByKey, featureIsPublic } from '../features.js'
import { isAdminUser } from '../admin.js'
import { activeGrantFeatures } from './store.js'

const TTL_MS = 60_000
const cache = new Map()   // userId -> { at, features }
export const clearGrantCache = (userId) => { if (userId) cache.delete(String(userId)); else cache.clear() }

/** The feature keys this user holds active grants for (60 s cache). `db` may be null (no service key): no grants. */
export async function grantsOf(db, userId, now = Date.now()) {
  if (!db || !userId) return []
  const hit = cache.get(String(userId))
  if (hit && now - hit.at < TTL_MS) return hit.features
  const r = await activeGrantFeatures(db, userId, now)
  if (cache.size > 2000) cache.clear()
  cache.set(String(userId), { at: now, features: r.features })
  return r.features
}

/**
 * { ok, public, admin, early } for one feature. `user` is the full auth user (auth.getUser()), or null.
 * `early` is true only for a grant holder who is neither admin nor looking at a public feature.
 */
export async function featureAccess(key, { user = null, db = null, now = Date.now() } = {}) {
  const f = featureByKey(key)
  if (!f) return { ok: false, public: false, admin: false, early: false }
  if (featureIsPublic(key)) return { ok: true, public: true, admin: false, early: false }
  if (user && isAdminUser(user)) return { ok: true, public: false, admin: true, early: false }
  if (user?.id && (await grantsOf(db, user.id, now)).includes(f.key)) return { ok: true, public: false, admin: false, early: true }
  return { ok: false, public: false, admin: false, early: false }
}

/** Every gated feature key this user may use right now and is not public (for /api/early-access/mine). Own grants only. */
export async function ownFeatures(db, userId, now = Date.now()) {
  return (await grantsOf(db, userId, now)).filter((k) => !featureIsPublic(k))
}
