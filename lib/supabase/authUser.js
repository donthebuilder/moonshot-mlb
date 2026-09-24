// WHO IS SIGNED IN, WITHOUT A ROUND TRIP (2026-09-24).
//
// auth.getUser() asks the Supabase Auth server every time. Every fantasy page
// render paid for it three times (proxy.js, the league layout, the page), and
// Auth was 44% of the project's egress on Sep 21 -- the free plan's 5 GB was
// exceeded this cycle.
//
// auth.getClaims() verifies the session JWT's signature locally against the
// project's published signing keys (fetched once and cached). On a project
// still on the legacy shared secret it falls back to getUser() inside the
// library, so it is never less safe than before -- only cheaper when it can be.
// Supabase's own SSR guide now uses it for exactly this.
//
// Pages read user.id; the state route also reads email and user_metadata,
// which the session JWT carries as claims.
// Server Actions that CHANGE data still call getUser() directly.
export async function signedInUser(supabase) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (!error) return data?.claims?.sub ? { id: data.claims.sub, email: data.claims.email ?? null, user_metadata: data.claims.user_metadata || {} } : null
  } catch {
    // fall through to the server check below
  }
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}
