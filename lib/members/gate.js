// THE DISPLAY GATE ON TONIGHT'S CALLED LABELS (2026-10-16, Donovan: no new page; in the app, a visitor who is not a member sees a taste of
// tonight's CALLED picks and a grey "Members" lock on the rest; everything graded stays public).
//
// COSMETIC BY DESIGN: the browser already downloads the board, so this only changes what is drawn. The real hiding is server-side on the front page
// (lib/members/access.js). So it FAILS OPEN: unknown membership (loading, or the state call failed) draws the label exactly as before.
//
// Pure functions only (no React, no clock of its own): components/MemberGate.js wires them, scripts/check-member-gate.mjs tests them.
import { FREE_CALLS_PER_SPORT } from './limits'

/** 'member' | 'free' | 'unknown', from lib/dash/sync getAccount()/useDashAccount(). Only a CONFIRMED non-member is 'free'. */
export function memberStateOf(account) {
  if (!account || !account.ready || !account.configured) return 'unknown'
  if (!account.signedIn) return 'free'                       // a signed-out visitor is a non-member
  if (account.who?.member === true) return 'member'          // members and admins (the route folds admins into member)
  if (account.who?.member === false) return 'free'
  return 'unknown'                                           // signed in but the state call did not say: never show a member a lock
}

/** Has the game started? `time` is the row's own game time (ISO string or ms). No usable time: not started only on today's slate, else started. */
export function startedAt(time, { now = Date.now(), slateIsToday = true } = {}) {
  const t = time == null || time === '' ? NaN : typeof time === 'number' ? time : Date.parse(time)
  if (Number.isFinite(t)) return now >= t
  return !slateIsToday
}

/**
 * The keys that stay visible to a free viewer: the first FREE_CALLS_PER_SPORT rows that are CALLED and not yet started, in the board's own order.
 * `rows` is ONE sport's whole board (not a filtered view). `rankOf` (optional) orders them by the board's place; ties and missing places keep the
 * order given, so the same 4 stay free from one render to the next.
 */
export function freeCalledKeys(rows, { keyOf, startedOf, statusOf = (r) => r?.status, rankOf = null, max = FREE_CALLS_PER_SPORT } = {}) {
  const list = (Array.isArray(rows) ? rows : []).map((r, i) => ({ r, i }))
  if (rankOf) {
    const rk = (x) => { const n = Number(rankOf(x.r)); return Number.isFinite(n) ? n : Infinity }
    list.sort((a, b) => (rk(a) - rk(b)) || (a.i - b.i) || 0)
  }
  const out = new Set()
  for (const { r } of list) {
    if (out.size >= max) break
    if (statusOf(r) !== 'called' || startedOf(r)) continue
    out.add(keyOf(r))
  }
  return out
}

/** Is this label drawn as the lock? Only a CALLED, not-started, not-graded pick of a non-member, outside the free taste. */
export function lockedFor({ status, started = false, graded = false, key, free, memberState }) {
  if (memberState !== 'free') return false
  if (status !== 'called') return false                      // ON THE BOARD / NOT ON THE BOARD are never locked
  if (started || graded) return false                        // public proof: once it is under way or graded the real label shows
  return !(free && free.has(key))
}
