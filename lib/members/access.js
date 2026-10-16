// WHO SEES THE CALLED PICKS (2026-10-16, Donovan: keep the site open and free, show a taste of the called picks, hide the rest unless you are a member).
// SERVER-ONLY. The hiding is done on the server: a visitor who is not a member never receives the hidden names in the page, they are not just visually covered.
//
// MEMBER = a signed-in account whose email is a member's AND confirmed (the same fail-closed rule as lib/admin.js: an unconfirmed address cannot claim a
// member's email). An admin is a member. A member's email comes from the site_members table (add a row the minute they pay, no redeploy;
// supabase/migrations/202610161900_site_members.sql) or from MEMBER_EMAILS (Vercel env, comma list). Checking Whop for an active membership replaces both
// later without changing any caller (they only call isMember).
import { unstable_cache } from 'next/cache'
import { isAdminUser, isAdminEmail } from '../admin'
import { adminClient } from '../supabase/admin'

import { FREE_CALLS_PER_SPORT, MEMBER_CALLS_ON_FRONT } from './limits'
// the numbers live in ./limits (client-safe); re-exported so callers keep importing them from here
export { FREE_CALLS_PER_SPORT, MEMBER_CALLS_ON_FRONT }

const envList = () => String(process.env.MEMBER_EMAILS || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)

// one small read per email per minute (a miss or an unreadable table is "not listed", never an error to the visitor)
const inTable = unstable_cache(async (email) => {
  const db = adminClient()
  if (!db) return false
  const { data, error } = await db.from('site_members').select('email').eq('email', email).maybeSingle()
  return !error && Boolean(data)
}, ['site-members-v1'], { revalidate: 60 })

/** Is this email on a member list (or an admin's)? NOT proof of membership: the account must also have confirmed it (isMember). Cheap pre-check for callers that only hold JWT claims. */
export async function couldBeMember(email) {
  if (!email) return false
  const e = String(email).toLowerCase()
  if (isAdminEmail(e) || envList().includes(e)) return true
  try { return await inTable(e) } catch { return false }
}

/** `user` is the object auth.getUser() returns (it carries the confirmation stamp). Fails closed. */
export async function isMember(user) {
  if (!user || !user.email) return false
  if (isAdminUser(user)) return true
  if (!(user.email_confirmed_at || user.confirmed_at)) return false
  return couldBeMember(user.email)
}

/** What a viewer gets of a list: { shown, hidden }. `hidden` is only a count. */
export function previewOf(items, member, memberMax = MEMBER_CALLS_ON_FRONT, freeMax = FREE_CALLS_PER_SPORT) {
  const all = Array.isArray(items) ? items : []
  const max = member ? memberMax : freeMax
  return { shown: all.slice(0, max), hidden: Math.max(0, all.length - max) }
}
