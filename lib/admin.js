// Who may open /admin (ADMIN-PAGE-PLAN): an account whose email is in
// ADMIN_EMAILS (Vercel env, comma list, never committed). Server-only.
export function isAdminEmail(email) {
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return Boolean(email) && list.includes(String(email).toLowerCase())
}
