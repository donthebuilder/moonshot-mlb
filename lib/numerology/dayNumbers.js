// THE DAY'S NUMBERS, NAMED (2026-10-10, Donovan: "make it clear what the numbers are for the specific day ... and
// the numbers for the preceding day"). Pure. Rows for a TODAY'S NUMBERS / YESTERDAY table: each number with its
// name, the sum that makes it, and its reduction (master numbers 11 / 22 / 33 shown as themselves and flagged).
// The date is the GAME's own ("YYYY-MM-DD"); "yesterday" is the calendar day before THAT date -- never the wall clock.
// Information only: never part of a score, a board rank, a call or a status.
import { dateNumbers, universal, MASTER, digitRoot } from './core'
import { hottest, KIND_LABEL } from './hotNumbers'
import { LANES } from './lanes'
import { plural } from '../format'

/** The calendar day before a game date: '2026-10-01' -> '2026-09-30'. null for junk. */
export function dayBefore(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 864e5).toISOString().slice(0, 10)
}

/** 48 -> [48, 12, 3]; stops at a single digit or at a master number (29 -> [29, 11]). */
export function chain(n) {
  const out = [Number(n)]
  let v = Number(n)
  while (v > 9 && !MASTER.has(v)) { v = String(v).split('').reduce((a, c) => a + Number(c), 0); out.push(v) }
  return out
}

/**
 * The date's numbers as table rows: [{ key, label, value, how, reduces, master }]. First four are the ones the
 * lanes match against (Universal Day, FULL, SHORT, M+D); the rest are the root, day of the year and the universal
 * month and year.
 */
export function dateNumberRows(date) {
  const dn = dateNumbers(date); const u = universal(date)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!dn || !u || !m) return []
  const mo = Number(m[2]); const d = Number(m[3]); const ys = m[1].split('').join('+')
  const row = (key, label, value, how) => {
    const c = chain(value)
    return { key, label, value, how, reduces: c.length > 1 ? c.join(' → ') : String(value), master: c.some((x) => MASTER.has(x)) }
  }
  return [
    row('ud', 'Universal Day', u.day.value, `every digit of ${mo}/${d}/${m[1]}`),
    row('full', 'Full date', dn.full, `${mo} + ${d} + ${ys}`),
    row('short', 'Short date', dn.short, `${mo} + ${d} + ${m[1].slice(2)}`),
    row('md', 'Month + day', dn.md, `${mo} + ${d}`),
    row('root', 'Date root', dn.root, 'every digit, reduced'),
    row('doy', 'Day of the year', dn.dayOfYear, `${plural(dn.daysLeft, 'day')} left`),
    row('um', 'Universal Month', u.month.value, `month ${mo} + universal year ${u.year.root}`),
    row('uy', 'Universal Year', u.year.value, `every digit of ${m[1]}`),
  ]
}

const DATE_LANE = (l) => /^(gem_date|letters_date|personal_universal|path_universal|jersey_universal)/.test(l.key)
const LANE_LABEL = Object.fromEntries(LANES.map((l) => [l.key, l.label]))

/**
 * What a recorded day's numbers did -- REAL rows only. numberRows = numerology_numbers rows of that day, laneRows =
 * numerology_lane_nights rows of that day. Returns { graded, events, hot, udRows, lanes } or { graded: false } when
 * there is nothing recorded for the day (never a guess).
 *   udRows  every recorded value equal to the day's Universal Day root, per kind (jersey root 3 on a UD-3 day ...)
 *   lanes   the date lanes that matched somebody: matched, hits, and the eligible base rate
 */
export function dayRecap(day, numberRows, laneRows) {
  const nr = (numberRows || []).map((r) => ({ ...r, expected: Number(r.expected) }))
  const lr = (laneRows || []).filter((r) => r.graded_at && r.matched_hits != null)
  if (!nr.length && !lr.length) return { graded: false, day }
  const u = universal(day)
  const root = u ? String(u.day.root) : null
  const events = nr.length ? Math.max(...['jersey', 'jersey_root', 'name_root', 'first_letter'].map((k) => nr.filter((r) => r.kind === k).reduce((a, r) => a + (r.events || 0), 0)), 0) : 0
  const udRows = root ? nr.filter((r) => String(r.value) === root && ['jersey_root', 'life_path', 'personal_day', 'name_root'].includes(r.kind))
    .map((r) => ({ kind: r.kind, label: KIND_LABEL[r.kind] || r.kind, value: r.value, events: r.events, players: r.players, expected: Math.round(r.expected * 10) / 10 })) : []
  const lanes = lr.filter((r) => DATE_LANE({ key: r.lane }) && r.matched > 0)
    .map((r) => ({ lane: r.lane, label: LANE_LABEL[r.lane] || r.lane, matched: r.matched, hits: r.matched_hits, eligible: r.eligible, eligibleHits: r.eligible_hits }))
    .sort((a, b) => (b.matched - a.matched) || a.label.localeCompare(b.label))
  return { graded: true, day, events, hot: hottest(nr).map((r) => ({ ...r, label: KIND_LABEL[r.kind] || r.kind })), udRows, lanes }
}

export const NUMBERS_NOTE = 'Information only: never part of a score, never a call.'
export { digitRoot }
