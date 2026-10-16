// WHO SEES THE CALLED PICKS (2026-10-16, Donovan: keep the site open and free, show a taste of the called picks, hide the rest unless you are a member).
// SERVER-ONLY. The hiding is done on the server: a visitor who is not a member never receives the hidden names in the page, they are not just visually covered.
//
// MEMBER = a signed-in account whose email is a member's AND confirmed (the same fail-closed rule as lib/admin.js: an unconfirmed address cannot claim a
// member's email). An admin is a member. A member's email comes from the site_members table (add a row the minute they pay, no redeploy;
// supabase/migrations/202610161900_site_members.sql) or from MEMBER_EMAILS (Vercel env, comma list). Checking Whop for an active membership replaces both
// later without changing any caller (they only call isMember).
import { unstable_cache } from 'next/cache'
import { isAdminUser } from '../admin'
import { adminClient } from '../supabase/admin'

/** Free visitors see this many called picks per sport; the rest are counted, not named. */
export const FREE_CALLS_PER_SPORT = 4
/** Members see up to this many on the front door (the full lists live on the boards). */
export const MEMBER_CALLS_ON_FRONT = 8

const envList = () => String(process.env.MEMBER_EMAILS || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)

// one small read per email per minute (a miss or an unreadable table is "not listed", never an error to the visitor)
const inTable = unstable_cache(async (email) => {
  const db = adminClient()
  if (!db) return false
  const { data, error } = await db.from('site_members').select('email').eq('email', email).maybeSingle()
  return !error && Boolean(data)
}, ['site-members-v1'], { revalidate: 60 })

/** `user` is the object auth.getUser() returns (it carries the confirmation stamp). Fails closed. */
export async function isMember(user) {
  if (!user || !user.email) return false
  if (isAdminUser(user)) return true
  if (!(user.email_confirmed_at || user.confirmed_at)) return false
  const email = String(user.email).toLowerCase()
  if (envList().includes(email)) return true
  try { return await inTable(email) } catch { return false }
}

/** What a viewer gets of a list: { shown, hidden }. `hidden` is only a count. */
export function previewOf(items, member, memberMax = MEMBER_CALLS_ON_FRONT, freeMax = FREE_CALLS_PER_SPORT) {
  const all = Array.isArray(items) ? items : []
  const max = member ? memberMax : freeMax
  return { shown: all.slice(0, max), hidden: Math.max(0, all.length - max) }
}
