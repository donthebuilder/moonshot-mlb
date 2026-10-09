// THE X GATE: the one check every SCHEDULED X post goes through before it is sent
// (X overhaul stage 3 piece 1, 2026-10-09). The rules are lib/dash/xPolicy.js;
// this is the part that reads the database. Live CALLED alerts and the board
// posts are exempt and never come here for the cap (the repeat guard exempts them
// too); everything else does: lists, longshots, 2+ club, hardest shot, facts,
// polls, numerology, write-ups, the slate, NFL call-sheet replies.
//
//   admit(db, { day, kind, ids, pending, startMs })
//     -> { state: 'go' }
//      | { state: 'held',    reason }            a naming check is pending; retry next tick
//      | { state: 'dropped', reason }            a pending check ran out of time
//      | { state: 'repeat',  repeats, reason }   a player was named in this kind too recently
//      | { state: 'capped',  reason }            the day's cap (or the pause) holds this tier
//
// The order is cheapest first: naming (memory), pause, repeat (one read), cap
// (a few counts). HELD / DROPPED are written to the posting log (xPostLog).
import { EXEMPT_KINDS, familyLike, familyOf, guardOff, holdOrDrop, inFamily, isCapExempt, isRepeatExempt, postsPaused, recentNamedIds, repeatsOf, repeatWindowDays, sportOfKind, tierOf } from './xPolicy'
import { xDailyAllows } from './xBudget'
import { recordPost } from './xPostLog'

const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

// The per-minute ticks ask this before every post attempt; the answer changes at
// most when a post goes out, so a warm instance keeps it a few minutes (egress).
const RECENT_TTL_MS = 5 * 60e3
const _recent = new Map()   // `${day}|${family}` -> { at, set }
export const _resetRecentCache = () => _recent.clear()

/** Players this kind's family named in the last `window` days that reached X (or are posting). */
export async function recentNamed(db, { kind, day, ttlMs = RECENT_TTL_MS, windowDays = null }) {
  const ck = `${day}|${familyOf(kind)}|${windowDays || ''}`
  const hit = _recent.get(ck)
  if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.set
  const set = await readRecentNamed(db, { kind, day, windowDays })
  if (_recent.size > 500) _recent.clear()
  if (set) _recent.set(ck, { at: Date.now(), set })
  return set || new Set()
}
async function readRecentNamed(db, { kind, day, windowDays: w = null }) {
  const windowDays = w || repeatWindowDays(kind)
  const like = familyLike(kind)
  let q = db.from('homer_feed_posts').select('day, kind, payload')
    .gte('day', shiftDay(day, -(windowDays - 1))).lte('day', day)
    .not('x_post_id', 'is', null).not('x_post_id', 'in', '("skipped","backfill","dry")')
  q = like ? q.like('kind', like) : q.eq('kind', familyOf(kind))
  const { data, error } = await q
  if (error) { console.error(`[xgate] recent-named read failed for ${kind}: ${error.message}`); return null }   // a failed read lets the post through, like the cap's own rule (and is not cached)
  const family = familyOf(kind)
  return recentNamedIds((data || []).filter((r) => inFamily(family, r.kind)), { day, windowDays })
}

/** Which of `ids` this kind named too recently. [] for the exempt kinds and when ids is empty. */
export async function repeatCheck(db, { day, kind, ids }) {
  if (guardOff('repeat') || isRepeatExempt(kind) || !(ids || []).length) return []
  return repeatsOf(ids, await recentNamed(db, { kind, day }))
}

export async function admit(db, { day, kind, ids = [], pending = [], startMs = NaN, now = Date.now(), repeat = true, sport = null } = {}) {
  const base = { day, kind, sport: sport || sportOfKind(kind) }
  // 1. the pre-naming checks: hold, then drop
  if (pending.length && !guardOff('naming')) {
    const h = holdOrDrop({ pending, startMs, now })
    if (h.state === 'held') { recordPost({ ...base, state: 'HELD', reason: h.reason, ids: pending.map((p) => p.id) }); return { state: 'held', reason: h.reason } }
    if (h.state === 'dropped') { recordPost({ ...base, state: 'DROPPED', reason: `${h.reason} (30 min to start)`, ids: pending.map((p) => p.id) }); return { state: 'dropped', reason: h.reason } }
  }
  if (isCapExempt(kind) && !repeat) return { state: 'go' }
  // 2. the pause, then the repeat guard
  if (!isCapExempt(kind) && postsPaused()) {
    recordPost({ ...base, state: 'DROPPED', reason: 'X_POSTS_PAUSE is on' })
    return { state: 'capped', reason: 'paused' }
  }
  if (repeat) {
    const repeats = await repeatCheck(db, { day, kind, ids })
    if (repeats.length) return { state: 'repeat', repeats, reason: `named within ${repeatWindowDays(kind)} days: ${repeats.slice(0, 4).join(', ')}` }
  }
  // 3. the daily cap, by tier
  if (!isCapExempt(kind) && !guardOff('cap') && !(await xDailyAllows(db, day, kind))) {
    recordPost({ ...base, state: 'DROPPED', reason: `daily cap (${tierOf(kind)} tier)` })
    return { state: 'capped', reason: `daily cap (${tierOf(kind)} tier)` }
  }
  return { state: 'go' }
}

/** True when the gate lets a scheduled post of `kind` go to X now (cap + pause + repeat). */
export const xOk = async (db, args) => (await admit(db, args)).state === 'go'

/** Log a repeat that stayed a repeat after a rebuild, or a post that went out. */
export const logDroppedRepeat = (base, reason) => recordPost({ ...base, state: 'DROPPED', reason: `repeat: ${reason}` })
export const logPosted = ({ day, kind, ids = [], tweetId = null, text = null }) => recordPost({ day, kind, sport: sportOfKind(kind), state: 'POSTED', ids, tweetId, text })
export { EXEMPT_KINDS }
