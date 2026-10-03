// WHO CAN SEE BUCKETS (2026-10-02, Donovan: "only for admin" until it opens).
// Server only. Every /api/buckets/* route and /admin/buckets ask this one
// function. Open = BUCKETS_PUBLIC=on in Vercel (the launch switch: one setting,
// no redeploy of code); until then only a signed-in ADMIN_EMAILS account.
// Anyone else gets a 404, so nothing about BUCKETS is visible from outside.
import { hasSupabaseConfig } from '../supabase/config'
import { createSupabaseServerClient } from '../supabase/server'
import { isAdminEmail } from '../admin'

export const bucketsPublic = () => String(process.env.BUCKETS_PUBLIC || '').toLowerCase() === 'on'

/** { ok, admin, public } for the current request. */
export async function bucketsAccess() {
  if (bucketsPublic()) return { ok: true, public: true, admin: false }
  if (!hasSupabaseConfig()) return { ok: false, public: false, admin: false }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const admin = Boolean(user && isAdminEmail(user.email))
    return { ok: admin, public: false, admin }
  } catch {
    return { ok: false, public: false, admin: false }
  }
}

/** For a route: null when allowed, else the 404 to return. */
export async function bucketsGuard() {
  const a = await bucketsAccess()
  return a.ok ? null : Response.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}
