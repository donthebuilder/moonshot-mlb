// THE /early/<code> DECISION, as a function (2026-10-12) so a test can run it without Next. Returns where to send the visitor:
//   { to: '/login?next=%2Fearly%2F<code>' }   signed out (the login page validates `next` with lib/safeNext.js and brings them back)
//   { to: '<feature landing>' }               redeemed (or already a holder)
//   { failed: true }                          ONE outcome for every failure: unknown, expired, used up, revoked, rate-limited, tables not created yet,
//                                             database error. The page shows the same generic words for all of them: no oracle.
// Rate limits (in memory, per server instance; the 160-bit code is the real defence): attempts per IP and per signed-in account.
import { featureByKey } from '../features.js'
import { safeNext } from '../safeNext.js'
import { normalizeCode, makeLimiter } from './codes.js'
import { redeem } from './store.js'
import { clearGrantCache } from './access.js'

export const ipLimiter = makeLimiter({ max: 12, windowMs: 10 * 60e3 })
export const userLimiter = makeLimiter({ max: 8, windowMs: 10 * 60e3 })

export async function early({ code, user, db, ip = 'unknown', now = Date.now(), log = () => {} }) {
  // every visit counts against the IP, signed in or not, valid shape or not
  if (!ipLimiter.hit(`ip:${ip}`)) { log('rate-limited-ip'); return { failed: true } }
  const norm = normalizeCode(code)
  if (!user) {
    // sign in first, then come straight back; anything that is not a clean path segment is not redirected with
    const raw = String(code || '')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return { failed: true }
    return { to: `/login?next=${encodeURIComponent(safeNext(`/early/${raw}`, '/'))}` }
  }
  if (!userLimiter.hit(`u:${user.id}`)) { log('rate-limited-user'); return { failed: true } }
  if (!norm) { log('shape'); return { failed: true } }
  const r = await redeem(db, { code: norm, userId: user.id, now })
  if (!r.ok) { log(r.why); return { failed: true } }
  clearGrantCache(user.id)
  const f = featureByKey(r.feature)
  return { to: safeNext(f?.landing || '/', '/'), feature: r.feature, already: Boolean(r.already) }
}
