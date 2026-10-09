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
export async function recentNamed(db, { kind, day, ttlMs = RECENT_TTL_MS, windowDays = null, sport = null }) {
  const ck = `${day}|${familyOf(kind)}|${windowDays || ''}|${sport || ''}`
  const hit = _recent.get(ck)
  if (ttlMs > 0 && hit && Date.now() - hit.at < ttlMs) return hit.set
  const set = await readRecentNamed(db, { kind, day, windowDays, sport })
  if (_recent.size > 500) _recent.clear()
  if (set) _recent.set(ck, { at: Date.now(), set })
  return set || new Set()
}
// `sport`: a cross-sport post (the Slate) stores `named_by_sport`; the ids of ONE sport are read from it, so a
// football id and a baseball id that happen to match cannot hold each other out. A row without the map is
// MOONSHOT's (the old pregame / call-of-the-night rows), so it counts for 'mlb' only.
const forSport = (payload, sport) => {
  if (!sport) return payload
  const m = payload && typeof payload === 'object' ? payload.named_by_sport : null
  if (m && typeof m === 'object') return { named: Array.isArray(m[sport]) ? m[sport] : [], picks: [] }
  return sport === 'mlb' ? payload : { named: [], picks: [] }
}
async function readRecentNamed(db, { kind, day, windowDays: w = null, sport = null }) {
  const windowDays = w || repeatWindowDays(kind)
  const like = familyLike(kind)
  let q = db.from('homer_feed_posts').select('day, kind, payload')
    .gte('day', shiftDay(day, -(windowDays - 1))).lte('day', day)
    .not('x_post_id', 'is', null).not('x_post_id', 'in', '("skipped","backfill","dry")')
  q = like ? q.like('kind', like) : q.eq('kind', familyOf(kind))
  const { data, error } = await q
  if (error) { console.error(`[xgate] recent-named read failed for ${kind}: ${error.message}`); return null }   // a failed read lets the post through, like the cap's own rule (and is not cached)
  const family = familyOf(kind)
  return recentNamedIds((data || []).filter((r) => inFamily(family, r.kind)).map((r) => ({ ...r, payload: forSport(r.payload, sport) })), { day, windowDays })
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
export const logPosted = ({ day, kind, ids = [], tweetId = null, text = null, now = Date.now() }) => (notePosted(kind, now), recordPost({ day, kind, sport: sportOfKind(kind), state: 'POSTED', ids, tweetId, text }))
export { EXEMPT_KINDS }

// ── THE SCHEDULE HOOK (X overhaul stage 3 piece 4, lib/dash/xSchedule.js). The ONE "may I post
// now?" every scheduled kind asks BEFORE it builds and claims its slot (held = nothing claimed,
// the tick asks again next minute). Reads today's counted posts (Phoenix day) from the database,
// kept 90 s per instance (egress) and topped up when this instance posts.
//   scheduleGate(db, { kind, day, sport, games, postseason, startMs, legacyHour, now })
//     -> mayPostNow's { ok, reason, nextWindow, drop, ... }; HELD / DROPPED go to the posting log.
import { kindInfo, mayPostNow, phxDayWindow, scheduleOff } from './xSchedule'

const POSTED_TTL_MS = 90e3
const NOT_REAL = '("posting","skipped","backfill","dry")'
let _posted = null   // { day, at, rows: [{ kind, at, sport? }] }
export const _resetPostedCache = () => { _posted = null }

/** Today's counted X posts (not CALLED, not the boards), as [{ kind, at }]. A failed read answers [] and is not cached. */
export async function postedToday(db, now = Date.now(), ttlMs = POSTED_TTL_MS) {
  const w = phxDayWindow(now)
  if (ttlMs > 0 && _posted && _posted.day === w.day && now - _posted.at < ttlMs) return _posted.rows
  const from = new Date(w.startMs).toISOString()
  const to = new Date(w.endMs).toISOString()
  try {
    const real = (q) => q.not('x_post_id', 'is', null).not('x_post_id', 'in', NOT_REAL)
    const [posts, facts] = await Promise.all([
      real(db.from('homer_feed_posts').select('kind, seen_at')).gte('seen_at', from).lt('seen_at', to).not('kind', 'in', `(${EXEMPT_KINDS.join(',')})`),
      real(db.from('fact_posts').select('posted_at')).gte('posted_at', from).lt('posted_at', to),
    ])
    if (posts.error) { console.error(`[xsched] posted read failed: ${posts.error.message}`); return [] }
    const rows = [
      ...(posts.data || []).map((r) => ({ kind: r.kind, at: Date.parse(r.seen_at) })),
      ...(facts.error ? [] : (facts.data || []).map((r) => ({ kind: 'facts', at: Date.parse(r.posted_at) }))),
    ].filter((r) => Number.isFinite(r.at))
    _posted = { day: w.day, at: now, rows }
    return rows
  } catch (e) { console.error(`[xsched] posted read threw: ${e?.message}`); return [] }
}
/** This instance just posted `kind`: the cached list knows at once (the 45-minute gap must see it). */
export function notePosted(kind, now = Date.now()) {
  const w = phxDayWindow(now)
  if (_posted && _posted.day === w.day) _posted.rows = [..._posted.rows, { kind, at: now }]
}

// The tick sets the day's context once per run (the games on the slate, the MLB postseason flag);
// every gate in that run (claimAndPostStat, postOnce) reads it, so no builder passes it around.
let _ctx = { games: [], postseason: false }
export const setScheduleContext = (ctx) => { _ctx = { games: Array.isArray(ctx?.games) ? ctx.games : [], postseason: ctx?.postseason === true } }
export const scheduleContext = () => _ctx

export async function scheduleGate(db, { kind, day = '', sport = null, games = _ctx.games, postseason = _ctx.postseason, startMs = NaN, legacyHour = null, tag = null, now = Date.now() } = {}) {
  // a SCHEDULED kind reads the list fresh (TTL 0): the 45-minute gap and the slot fill must see a post another
  // instance made inside the 90 s cache. Event kinds ignore the windows, so they keep the cached read.
  const posted = scheduleOff() ? [] : await postedToday(db, now, kindInfo(kind)?.mode === 'scheduled' ? 0 : POSTED_TTL_MS)
  const r = mayPostNow({ kind, sport, now, games, tag, posted, postseason, startMs, legacyHour })
  if (!r.ok) recordPost({ day, kind, sport: sport || sportOfKind(kind), state: r.drop ? 'DROPPED' : 'HELD', reason: r.reason })
  return r
}
