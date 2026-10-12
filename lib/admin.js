// Who may open /admin (ADMIN-PAGE-PLAN): an account whose email is in
// ADMIN_EMAILS (Vercel env, comma list, never committed). Server-only.
export function isAdminEmail(email) {
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return Boolean(email) && list.includes(String(email).toLowerCase())
}

// THE ADMIN GATE (security wave 2, audit M4): the allow-listed email AND a confirmed one.
// `user` must be the object auth.getUser() returns (it carries email_confirmed_at); the
// JWT-claims user from signedInUser() does not, so it never passes. Fails closed.
export function isAdminUser(user) {
  if (!user || !isAdminEmail(user.email)) return false
  return Boolean(user.email_confirmed_at || user.confirmed_at)
}

// WHY THE GATE SAID NO (a code for the SERVER LOG only; never sent to the browser, never an email or a value). The page and the API both answer 404
// whatever the reason, so "the page does not open" can be told apart in Vercel's logs: signed-out / allow-list-env-missing / email-not-listed /
// email-unconfirmed. null = let in.
export function adminDenyReason(user) {
  if (!user) return 'signed-out'
  if (!String(process.env.ADMIN_EMAILS || '').split(',').some((s) => s.trim())) return 'allow-list-env-missing'
  if (!isAdminEmail(user.email)) return 'email-not-listed'
  if (!(user.email_confirmed_at || user.confirmed_at)) return 'email-unconfirmed'
  return null
}

// CSRF for the admin POSTs: the session cookie rides along on a cross-site form post, so an admin write must be a same-origin JSON request. A request
// that names an Origin must name this host; one that names none (curl, a server) is not a browser form post and is judged by the session alone.
export function sameOriginJson(request) {
  const ct = String(request.headers.get('content-type') || '')
  if (!/^application\/json\b/i.test(ct)) return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try { return new URL(origin).host === (request.headers.get('x-forwarded-host') || request.headers.get('host')) } catch { return false }
}
