// WHO CAN SEE BUCKETS (2026-10-02, Donovan: "only for admin" until it opens).
// Server only. Every /api/buckets/* route and /admin/buckets ask this one
// function. Open = BUCKETS_PUBLIC=on in Vercel (the launch switch: one setting,
// no redeploy of code); until then a signed-in ADMIN_EMAILS account, or (2026-10-12,
// EARLY ACCESS) a signed-in account holding an active 'buckets' grant (lib/features.js,
// lib/earlyAccess/access.js). Anyone else gets a 404, so nothing about BUCKETS is
// visible from outside. A grant opens the BUCKETS READS only: it is not an admin
// (/admin/buckets stays admin-only, see below) and it never opens a POSTER, which
// asks the public switch alone (lib/openSwitch.js).
import { hasSupabaseConfig } from '../supabase/config'
import { createSupabaseServerClient } from '../supabase/server'
import { adminClient } from '../supabase/admin'
import { bucketsOpen } from '../openSwitch'
import { featureAccess } from '../earlyAccess/access'

// the one switch: lib/openSwitch.js (every poster reads the same function)
export const bucketsPublic = () => bucketsOpen()

/** { ok, admin, public, early } for the current request. `early` = a grant holder who is not an admin. */
export async function bucketsAccess(deps = {}) {
  // `deps` ({ getUser, db }) exists so a test can hand in a fake session and a fake database; the site passes nothing
  if (bucketsPublic()) return { ok: true, public: true, admin: false, early: false }
  if (!hasSupabaseConfig()) return { ok: false, public: false, admin: false, early: false }
  try {
    let user
    if (deps.getUser) user = await deps.getUser()
    else { const supabase = await createSupabaseServerClient(); user = (await supabase.auth.getUser()).data.user }
    return await featureAccess('buckets', { user, db: user ? (deps.db !== undefined ? deps.db : adminClient()) : null, now: deps.now })
  } catch {
    return { ok: false, public: false, admin: false, early: false }
  }
}

/** For a route: null when allowed, else the 404 to return. */
export async function bucketsGuard(deps) {
  const a = await bucketsAccess(deps)
  return a.ok ? null : Response.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

/** For an ADMIN-ONLY BUCKETS page (/admin/buckets): open once BUCKETS is public or for an admin; a grant holder does NOT pass. */
export async function bucketsAdminAccess(deps) {
  const a = await bucketsAccess(deps)
  return a.public || a.admin
}
