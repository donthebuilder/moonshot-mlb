// THE BRAKE ON THE NOISE (2026-10-13; Donovan approved "Brake the noise" and "Permission and settings UX" from the notifications audit).
// PURE: no I/O, no 'use client'. Imported by the sender (app/api/dash/push/tick), the producers (lib/dash/pushRules.js) and the panel (lib/dash/alerts.js),
// so the three agree on every word of it.
//
//   1. THE DAILY SOFT CAP. Two ceilings per DEVICE per push-day: NON-URGENT pushes (a bar cleared, the nightly recap, a receipt, a puck-drop heads-up, an injury
//      status ...) stop at DAILY_CAP (8); URGENT ones (a homer or goal or touchdown, a scratch, a delay, a card earned, lineups-are-in, a CALLED goal) are exempt
//      from that one and have their own ceiling, URGENT_CAP (15). A held event is logged `dropped` (detail 'daily cap'), exactly as a lane drop is.
//      "Push-day" starts at 6 am ET, not midnight: a late West Coast game belongs to the night it started.
//   2. THE OLD KEYS STILL COUNT. hrr / multihit / bigbases were merged into ONE category, `barcleared`, and finalline into the nightly recap `recap`. A person whose
//      saved settings only know the old keys keeps what they chose: resolveEvents() carries "any of the three was on" into barcleared and finalline into recap. A saved
//      value for the NEW key always wins over the old ones (their latest word).
//
// Flags: PUSH_BRAKE=off turns the daily caps off (nothing else); PUSH_DAILY_CAP / PUSH_URGENT_CAP change the numbers. Unset = on, 8 and 15.

export const DAILY_CAP = 8
export const URGENT_CAP = 15

/** The old per-bar and per-hitter keys, and the key that replaced them (a saved value for any of them still counts). */
export const LEGACY_OF = {
  barcleared: ['hrr', 'multihit', 'bigbases'],
  recap: ['finalline'],
}

/** Categories that ride the URGENT lane for the cap: the news you act on or the reason you follow. Priority 0 events are urgent whatever their category. */
export const URGENT_CATEGORIES = new Set([
  'cardearned', 'starter', 'lineupin', 'dropout', 'boardup', 'lastcall', 'scratched', 'gameoff', 'nhlcalled', 'nbacalled', 'homer', 'slam', 'nfltd', 'nflkick', 'nhlgoal', 'nba30',
])
/** Is this event in the urgent class (exempt from the daily soft cap)? */
export function isUrgentClass(e) {
  if (!e) return false
  if (Number.isFinite(e.priority) && e.priority === 0) return true
  return URGENT_CATEGORIES.has(String(e.category || ''))
}

const intOr = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 ? n : d }
/** { on, daily, urgent } from the environment. `PUSH_BRAKE=off` is the kill switch (caps only). */
export function brakeConfig(env = (typeof process !== 'undefined' ? process.env : {})) {
  return {
    on: String(env?.PUSH_BRAKE || '').toLowerCase() !== 'off',
    daily: intOr(env?.PUSH_DAILY_CAP, DAILY_CAP),
    urgent: intOr(env?.PUSH_URGENT_CAP, URGENT_CAP),
  }
}

// ── Eastern time, by hand (no library; DST by checking the wall clock) ───────
const ET = 'America/New_York'
function etParts(ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: ET, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const o = {}
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour), mi: Number(o.minute) }
}
/** The UTC ms of `hour`:00 Eastern on the calendar day y-m-d (DST-safe). */
function etWall(y, m, d, hour) {
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, hour + off)
    const p = etParts(t)
    if (p.y === y && p.m === m && p.d === d && p.h === hour) return t
  }
  return Date.UTC(y, m - 1, d, hour + 5)
}
const dayShift = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n, 12)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()] }

/** The most recent 6:00 am Eastern at or before `now`: the start of a push-day (the cap's window). */
export function pushDayStart(now = Date.now()) {
  const p = etParts(now)
  const today6 = etWall(p.y, p.m, p.d, 6)
  if (today6 <= now) return today6
  const [y, m, d] = dayShift(p.y, p.m, p.d, -1)
  return etWall(y, m, d, 6)
}
/** The Eastern calendar day of an instant, YYYY-MM-DD. */
export function etDayOf(ms) {
  const p = etParts(ms)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}
/** The Eastern weekday of an instant: 0 = Sunday ... 1 = Monday. */
export function etWeekday(ms) {
  const [y, m, d] = etDayOf(ms).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}
export const etHour = (ms) => etParts(ms).h

// ── settings resolution ──────────────────────────────────────────────────────
/**
 * One category's on/off for a person: their saved value for the key itself, else (for a merged key) "any old key was on" when they saved any old key, else the
 * default. `saved` = their dash_alerts_v1.events (or undefined). Pure; never mutates.
 */
export function categoryOn(saved, key, defaults) {
  const s = saved && typeof saved === 'object' ? saved : null
  if (s && key in s) return Boolean(s[key])
  const legacy = LEGACY_OF[key]
  if (s && legacy) {
    const seen = legacy.filter((k) => k in s)
    if (seen.length) return seen.some((k) => Boolean(s[k]))
  }
  return Boolean(defaults?.[key])
}
/** The whole events object with every merged key resolved (for the panel): defaults, then saved, then the merged keys carried over. */
export function resolveEvents(saved, defaults) {
  const out = { ...(defaults || {}), ...(saved && typeof saved === 'object' ? saved : {}) }
  for (const key of Object.keys(LEGACY_OF)) out[key] = categoryOn(saved, key, defaults)
  return out
}

// ── the cap ──────────────────────────────────────────────────────────────────
/**
 * Decide which of a device's events go out, given what it has already been sent today.
 * @param events  the device's events, already filtered by wants(), in the order they should be spent (loudest first)
 * @param sentToday { soft, urgent }  events already sent today to this device (outcome sent / bundled), by class
 * @returns { send: Event[], held: Event[] }
 */
export function applyDailyCaps(events, sentToday = {}, cfg = brakeConfig()) {
  if (!cfg.on) return { send: [...events], held: [] }
  let soft = Number(sentToday.soft) || 0
  let urgent = Number(sentToday.urgent) || 0
  const send = []
  const held = []
  for (const e of events) {
    if (isUrgentClass(e)) {
      if (urgent >= cfg.urgent) { held.push(e); continue }
      urgent += 1
    } else {
      if (soft >= cfg.daily) { held.push(e); continue }
      soft += 1
    }
    send.push(e)
  }
  return { send, held }
}

/** Tally dash_push_log rows ({ category, priority }) into { soft, urgent }. */
export function tallyLog(rows) {
  const t = { soft: 0, urgent: 0 }
  for (const r of rows || []) {
    if (isUrgentClass({ category: r.category, priority: r.priority })) t.urgent += 1
    else t.soft += 1
  }
  return t
}

// ── the bar a hitter cleared (ONE bar-cleared push per hitter per night) ──────
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
/**
 * The highest bar this batting line has cleared, or null. A homer is the homer push's business, so a line is only a "bar" when it clears one the homer does not say:
 *   bases  4+ total bases with no homer (a homer alone is 4)
 *   hits   2+ hits (3+ outranks 2); a homer may ride along as an extra
 *   hrr    hits + runs + RBI reach 2 with no homer
 * Order: bases > 3 hits > 2 hits > HRR. Pure; `line` = { h, r, rbi, hr, tb }.
 */
export function topBar(line) {
  const h = num(line?.h); const hr = num(line?.hr); const tb = num(line?.tb)
  const hrr = h + num(line?.r) + num(line?.rbi)
  if (tb >= 4 && hr < 1) return { kind: 'bases', n: tb, rank: 4 }
  if (h >= 3) return { kind: 'hits', n: h, rank: 3 }
  if (h >= 2) return { kind: 'hits', n: h, rank: 2 }
  if (hrr >= 2 && hr < 1) return { kind: 'hrr', n: hrr, rank: 1 }
  return null
}
/** Did the night clear anything at all (a homer counts)? Used by the recap's tally, which is the same yardstick the pushes use. */
export const clearedNight = (line) => num(line?.hr) >= 1 || topBar(line) != null
