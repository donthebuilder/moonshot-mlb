// ONE place for a player's birthday (every sport: MLB, NFL, NHL, NBA).
//
// A birth date is a CALENDAR date: 'YYYY-MM-DD' is read as a plain
// year/month/day and never passed through `new Date(string)` (which shifts a
// day in some timezones). "Today" is the date the caller hands in (the game's
// own date); with none given it falls back to the ET baseball day, same as the
// rest of the site.
//
// A player with no usable date gets null from every function here: callers
// print nothing (no placeholder, no guess). A date that cannot be a pro
// athlete's (future, or an age outside 14..65) is treated as missing too.
//
// Feb 29: in a non-leap year the birthday is observed on Feb 28 (age and the
// chip both move on that day, so they never disagree).
//
// Numerology reads birth dates through its own paths; this file does not feed
// any lane, score, call or ledger.
import { etToday } from './freshness'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YMD = /^(\d{4})-(\d{2})-(\d{2})/

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
const utc = (y, m, d) => Date.UTC(y, m - 1, d)

/** { y, m, d } from 'YYYY-MM-DD' (extra time text ignored), or null when not a real calendar date. */
export function parseYmd(s) {
  const k = YMD.exec(String(s || ''))
  if (!k) return null
  const y = +k[1], m = +k[2], d = +k[3]
  if (m < 1 || m > 12 || d < 1 || d > dim(y, m)) return null
  return { y, m, d }
}

// the day this birthday falls on in year `y` (Feb 29 -> Feb 28 in a non-leap year)
const observed = (b, y) => (b.m === 2 && b.d === 29 && !isLeap(y) ? { m: 2, d: 28 } : { m: b.m, d: b.d })

/** Whole years on `on` (a YYYY-MM-DD), or null when the date is missing, in the future, or implausible. */
export function ageOn(birth, on) {
  const b = parseYmd(birth)
  const t = parseYmd(on || etToday())
  if (!b || !t) return null
  const o = observed(b, t.y)
  let age = t.y - b.y
  if (t.m < o.m || (t.m === o.m && t.d < o.d)) age -= 1
  return age >= 14 && age <= 65 ? age : null
}

/** 'Mar 14, 1998' or null. */
export function formatBorn(birth) {
  const b = parseYmd(birth)
  return b ? `${MON[b.m - 1]} ${b.d}, ${b.y}` : null
}

/** Days from `on` to his next birthday (0 = today), or null. Year boundary and Feb 29 handled. */
export function daysToBirthday(birth, on) {
  const b = parseYmd(birth)
  const t = parseYmd(on || etToday())
  if (!b || !t || ageOn(birth, on) == null) return null
  const now = utc(t.y, t.m, t.d)
  for (const y of [t.y, t.y + 1]) {
    const o = observed(b, y)
    const diff = Math.round((utc(y, o.m, o.d) - now) / 864e5)
    if (diff >= 0) return diff
  }
  return null
}

export const isBirthdayToday = (birth, on) => daysToBirthday(birth, on) === 0
/** Today or in the next 6 days. */
export const isBirthdayWeek = (birth, on) => { const n = daysToBirthday(birth, on); return n != null && n <= 6 }

/** 'birthday today' / 'birthday tomorrow' / 'birthday in 3 days', or null outside the week. */
export function birthdayChip(birth, on) {
  const n = daysToBirthday(birth, on)
  if (n == null || n > 6) return null
  return n === 0 ? 'birthday today' : n === 1 ? 'birthday tomorrow' : `birthday in ${n} days`
}

/** 'Born Mar 14, 1998 · age 27' or null (nothing to print when the date is unknown). */
export function bornLine(birth, on) {
  const f = formatBorn(birth)
  const a = ageOn(birth, on)
  if (!f || a == null) return null
  return `Born ${f} · age ${a}`
}
