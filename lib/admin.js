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
