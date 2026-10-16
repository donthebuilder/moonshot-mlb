// WHO SEES THE CALLED PICKS (2026-10-16, Donovan: keep the site open and free, show a taste of the called picks, hide the rest unless you are a member).
// SERVER-ONLY. The hiding is done on the server: a visitor who is not a member never receives the hidden names in the page, they are not just visually covered.
//
// MEMBER = a signed-in account whose email is on the MEMBER_EMAILS list (Vercel env, comma list, never committed) AND confirmed (the same fail-closed rule as
// lib/admin.js: an unconfirmed address cannot claim a member's email). An admin is a member. The list is manual for the first members; checking Whop for an
// active membership replaces it later without changing any caller (they only call isMember).
import { isAdminUser } from '../admin'

/** Free visitors see this many called picks per sport; the rest are counted, not named. */
export const FREE_CALLS_PER_SPORT = 4
/** Members see up to this many on the front door (the full lists live on the boards). */
export const MEMBER_CALLS_ON_FRONT = 8

const list = () => String(process.env.MEMBER_EMAILS || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)

/** `user` is the object auth.getUser() returns (it carries the confirmation stamp). Fails closed. */
export function isMember(user) {
  if (!user || !user.email) return false
  if (isAdminUser(user)) return true
  if (!list().includes(String(user.email).toLowerCase())) return false
  return Boolean(user.email_confirmed_at || user.confirmed_at)
}

/** What a viewer gets of a list: { shown, hidden }. `hidden` is only a count. */
export function previewOf(items, member, memberMax = MEMBER_CALLS_ON_FRONT, freeMax = FREE_CALLS_PER_SPORT) {
  const all = Array.isArray(items) ? items : []
  const max = member ? memberMax : freeMax
  return { shown: all.slice(0, max), hidden: Math.max(0, all.length - max) }
}
