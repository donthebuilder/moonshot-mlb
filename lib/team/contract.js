// THE TEAM-PAGE CONTRACT (2026-10-10, Donovan: "build out the team pages, showing all their data").
// One shape for every sport's team page, pure (no fetch, no clock, no React) so a node check can hold it.
//
//   view   = { header, sections: [section] }                 built per sport by lib/team/<sport>.js
//   header = { code, name, eyebrow, logo, note, stats[], standing, splits, streak, next, last, last5[] }
//   section = { id, label, window, n, state: 'ok' | 'empty', empty: { title, note }, blocks: [block] }
//   block   = { type: 'table' | 'note' | 'weak', ... }       components/team/SectionView.js draws them
//
// The section LIST is a registry per sport (lib/team/registry.js), never a ternary. A section is only
// 'ok' when real data stands behind it; otherwise it is 'empty' and says which data is missing.
// Nothing here invents a number.
import { wilson } from '../interval'

/** Section ids, the same words on every sport (a sport may leave one out; none is renamed). */
export const SECTION_IDS = ['roster', 'schedule', 'stats', 'splits', 'calls', 'matchup', 'trends', 'special']
/** Ids a sport may add LATER without touching the shared page (NFL's Defense = defensive player stats, Tags = the
 *  fumble / interception / corner / pass-rush tags). Reserved here, absent from every registry list until built. */
export const RESERVED_SECTION_IDS = ['defense', 'tags']

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

/**
 * Where `value` sits among `values` (every club's number for one stat).
 * higherBetter=false flips it (goals against: fewest = rank 1). Ties share the better rank.
 * @returns {{ rank:number, of:number, pct:number }|null}  pct = share of the other clubs this club is better than (0-100)
 */
export function leagueRank(values, value, { higherBetter = true } = {}) {
  if (!fin(value)) return null
  const all = (values || []).filter(fin).map(Number)
  if (all.length < 2) return null
  const v = Number(value)
  const better = all.filter((x) => (higherBetter ? x > v : x < v)).length
  const worse = all.filter((x) => (higherBetter ? x < v : x > v)).length
  return { rank: better + 1, of: all.length, pct: Math.round((100 * worse) / (all.length - 1)) }
}

/** "3rd" -- the rank as a word. */
export function rankWord(r) {
  if (!r) return '—'
  const n = r.rank
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'
  return `${n}${s}`
}

/**
 * OUR CALLS on one club: n graded, hits, the rate and its 95% range. A row that did not play is "did not play"
 * and is not in n; a row with no grade yet is pending and is not in n.
 * @param rows [{ result: 'hit'|'miss'|'void'|null }]
 */
export function callsSummary(rows) {
  const hit = rows.filter((r) => r.result === 'hit').length
  const miss = rows.filter((r) => r.result === 'miss').length
  const dnp = rows.filter((r) => r.result === 'void').length
  const pending = rows.filter((r) => !r.result).length
  const n = hit + miss
  const range = n ? wilson(hit, n) : null
  return { n, hit, miss, dnp, pending, rate: n ? Math.round((1000 * hit) / n) / 10 : null, range: range ? [Math.round(range[0] * 10) / 10, Math.round(range[1] * 10) / 10] : null }
}

/** The words for a graded call result. */
export const RESULT_WORD = { hit: 'HIT', miss: 'MISSED', void: 'DID NOT PLAY' }
export const resultWord = (r) => RESULT_WORD[r] || 'PENDING'

// NEUTRAL WORDING (the "due / owed" decision, 2026-10-09): no sentence on a team page tells you a result is
// coming. This is the lint the check runs over every string a view produces.
export const BANNED_WORDS = /\b(due|owed|overdue|bound to|guaranteed|lock of|can't miss|cannot miss|sure thing|will score|will win|bet on)\b/i
export function neutralProblems(texts) {
  return (texts || []).filter((t) => typeof t === 'string' && BANNED_WORDS.test(t))
}

/** Every string in a view (headers, labels, notes) for the lint. Functions are skipped. */
export function viewStrings(view) {
  const out = []
  const walk = (v) => {
    if (v == null) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object') for (const x of Object.values(v)) if (typeof x !== 'function') walk(x)
  }
  walk(view)
  return out
}

/** A window label that says the season, the part of it and the sample. "2026-27 regular season (LAST SEASON) · 4 games". */
export function windowLabel({ seasonLabel, stale = false, part = 'regular season', n = null, unit = 'games' }) {
  const s = seasonLabel ? `${seasonLabel} ${part}${stale ? ' (LAST SEASON)' : ''}` : part
  return n == null ? s : `${s} · ${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`
}

/** An empty section: honest, names the data that is missing. */
export const emptySection = (id, label, title, note, window = null) => ({ id, label, window, n: 0, state: 'empty', empty: { title, note }, blocks: [] })
