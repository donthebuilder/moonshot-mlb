// THE SESSION COOKIE, LOCKED (security wave 2, audit M1). @supabase/ssr hands setAll()
// httpOnly:false by default, so page scripts could read the session. Nothing in the
// browser reads it: the bundle has no Supabase client (scripts/check-session-cookie.mjs
// greps for one), every read is the server's, through lib/supabase/server.js and proxy.js.
// So every write goes through here: httpOnly, SameSite=Lax, Secure in production.
// A removal (maxAge 0 / past expires) keeps its own maxAge, only the flags are forced.
export function hardenCookie(options = {}) {
  return {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
}
