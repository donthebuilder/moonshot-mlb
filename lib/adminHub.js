// THE ADMIN HUB, PURE PART (2026-10-12, Donovan: "i need a better way to get to the admin side of things").
// No I/O, no env values beyond ADMIN_EMAILS (read inside lib/admin.js). The gate is lib/admin.js isAdminUser and is not changed here.
//
//   adminSurface(user)    what /api/admin/me answers: { admin: boolean } and NOTHING else (no email, no id, no name).
//   adminEntries(user)    the admin-only entry points the site draws (header menu, More drawer, QuickSearch commands): [] for everyone else.
//   safeShaPrefix(sha)    the deployed commit as its first 7 characters (or null): the only build fact the hub shows.
//   ADMIN_TOOLS           every admin tool, in the order the hub draws them. Only the hub page (itself behind the gate) renders this list.
import { isAdminUser } from './admin.js'

/** What /api/admin/me returns: a yes/no, never who. */
export function adminSurface(user) {
  return { admin: Boolean(user && isAdminUser(user)) }
}

/** The one place the site's admin entry points are defined. Anyone but a confirmed, allow-listed admin gets none. */
export const ADMIN_ENTRY_LIST = Object.freeze([
  Object.freeze({ id: 'admin', label: 'Admin', href: '/admin', words: 'admin hub dashboard' }),
  Object.freeze({ id: 'two-man', label: 'Two-Man', href: '/admin/two-man', words: 'two-man two man donovan entry card' }),
])
export function adminEntries(user) {
  return user && isAdminUser(user) ? ADMIN_ENTRY_LIST : []
}

/** First 7 hex characters of a git sha, else null. */
export function safeShaPrefix(sha) {
  const s = String(sha || '').trim()
  return /^[0-9a-f]{7,40}$/i.test(s) ? s.slice(0, 7).toLowerCase() : null
}

/** Every admin tool. `href` is always a relative path. `hint` is a plain sentence. */
export const ADMIN_TOOLS = Object.freeze([
  Object.freeze({ id: 'two-man', title: 'Two-Man entry', hint: 'Enter his two players and a note. Always open; late entries are marked LATE.', href: '/admin/two-man' }),
  Object.freeze({ id: 'early', title: 'Early access', hint: 'Make an invite link for BUCKETS or any held-back feature; see and revoke who has it.', href: '/admin#early' }),
  Object.freeze({ id: 'buckets', title: 'BUCKETS (NBA) admin', hint: 'The BUCKETS board and shot chart. Admin-only while the sport is hidden.', href: '/admin/buckets' }),
  Object.freeze({ id: 'nba', title: 'NBA in the app', hint: 'The NBA view inside the main app (an admin sees it while it is hidden).', href: '/app#sport=nba' }),
  Object.freeze({ id: 'facts', title: 'Fact posts', hint: 'The autopost switch, today’s spend and the last posts.', href: '/admin#facts' }),
  Object.freeze({ id: 'writeups', title: 'Game write-ups', hint: 'The write-up autopost switch and the last days’ posts.', href: '/admin#writeups' }),
  Object.freeze({ id: 'numbers', title: 'The numbers', hint: 'Accounts, push, watchlists, X, odds, shadow models.', href: '/admin#numbers' }),
  Object.freeze({ id: 'account', title: 'Account', hint: 'Name, email, password, sign out everywhere.', href: '/account' }),
])
