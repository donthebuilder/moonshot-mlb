// The free taste, in ONE client-safe file (2026-10-16). lib/members/access.js is server-only (it reads Supabase), so the browser-side gate
// (lib/members/gate.js) cannot import it; access.js re-exports these, so the number is still written once and "access.js" stays the place to read it.
/** Free visitors see this many called picks per sport; the rest are counted, not named. */
export const FREE_CALLS_PER_SPORT = 4
/** Members see up to this many on the front door (the full lists live on the boards). */
export const MEMBER_CALLS_ON_FRONT = 8
