// CALLED LAST NIGHT -- the pure half (plain node safe, no React, no fetch).
//
// WHAT IT IS: a view over rows that are already stored. Every player the bot CALLED at lock on the previous
// slate, with what he did and one result word. It changes no record and writes nothing.
//   CALLED  is the one definition: MLB lib/callStatus.js isCalledRole (callRolesOf in the calibration reader),
//           NHL lamp_goal_log status 'called' (goalModel scoreNight), NFL board_lock status 'called'
//           (callStatus tdCallStatus), NBA buckets_log status 'called'. Nothing is re-derived here.
//   RESULT  hit | miss | void | pending, as each sport's own grader stored it. A player who did not play is
//           VOID (shown as DID NOT PLAY), never a miss. No stored result yet is PENDING, never a miss.
//   DATE    the game's own date (MLB officialDate, NHL/NBA game_date, NFL game_date), never the ET wall clock.
// WORDING: information only ("what happened to last night's calls"). No forecast, no probability.
// scripts/check-called-last.mjs lints this file's strings.
import { STATUS_WORD } from '../callStatus'

export const SECTION_TITLE = 'Called last night'
export const RESULTS = ['hit', 'miss', 'void', 'pending']
// the RESULT words (the call's own status word, CALLED, always comes from callStatus STATUS_WORD)
export const RESULT_WORD = { hit: 'HIT', miss: 'MISSED', void: 'DID NOT PLAY', pending: 'PENDING' }
export const RESULT_LOWER = { hit: 'hit', miss: 'missed', void: 'did not play', pending: 'pending' }
export const CALLED_WORD = STATUS_WORD.called

// the filter's address value (#cln=) and its sub-options. Default = everyone called (all). Off = no key.
export const MODES = [
  { key: 'all', label: 'Everyone called', results: RESULTS },
  { key: 'miss', label: 'Missed', results: ['miss'] },
  { key: 'hit', label: 'Hit', results: ['hit'] },
  { key: 'void', label: "Didn't play", results: ['void'] },
]
export const FILTER_KEY = 'cln'
export const modeOf = (raw) => (MODES.some((m) => m.key === raw) ? raw : '')

const DAY = /^\d{4}-\d{2}-\d{2}$/
export const isDay = (d) => DAY.test(String(d || ''))
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** 'Fri' for a game's own date (a calendar date: no time zone, no wall clock). */
export const weekdayOf = (date) => (isDay(date) ? WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()] : '')
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const dayWord = (date) => (isDay(date) ? `${weekdayOf(date)} ${MONTH[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}` : '')
export const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10)

/** The latest day strictly before `slateDate` that is in `dates` (the previous slate), or null. */
export function previousDay(dates, slateDate) {
  return [...new Set((dates || []).filter(isDay))].filter((d) => d < slateDate).sort().pop() || null
}

const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`

// ── THE STAT LINES, from stored numbers only ─────────────────────────────────
/** MLB: '0-for-4', '1-for-4 · HR · 2 RBI'. Without at-bats (an older row) it says hits, not a guess. */
export function lineMlb(l) {
  if (!l) return ''
  const ab = l.ab == null ? null : n0(l.ab)
  const head = ab != null && ab > 0 ? `${n0(l.hits)}-for-${ab}` : plural(n0(l.hits), 'hit', 'hits')
  const bits = [head]
  if (n0(l.hr) > 0) bits.push(n0(l.hr) > 1 ? `${n0(l.hr)} HR` : 'HR')
  if (n0(l.rbi) > 0) bits.push(`${n0(l.rbi)} RBI`)
  if (n0(l.runs) > 0) bits.push(`${n0(l.runs)} R`)
  return bits.join(' · ')
}
/** NHL: '0 G, 3 shots' (shots only when the archive has the game; ice time is not stored, so never printed). */
export function lineNhl(l) {
  if (!l) return ''
  const bits = [`${n0(l.goals)} G`]
  if (l.shots != null) bits.push(plural(n0(l.shots), 'shot', 'shots'))
  return bits.join(', ')
}
/** NFL: the touchdown count and whatever else the game log stored for him, zeros left out. */
export function lineNfl(l) {
  if (!l) return ''
  const bits = [`${n0(l.td)} TD`]
  if (n0(l.car) > 0) bits.push(`${n0(l.car)} car, ${n0(l.ruyd)} rush yds`)
  if (n0(l.rec) > 0 || n0(l.recyd) > 0) bits.push(`${n0(l.rec)} rec, ${n0(l.recyd)} rec yds`)
  if (n0(l.payd) > 0) bits.push(`${n0(l.payd)} pass yds`)
  return bits.join(' · ')
}
/** NBA: the stored figure for the market that was called. */
export function lineNba(l) {
  if (!l || l.actual == null) return ''
  return `${n0(l.actual)} ${l.stat || 'pts'}`
}
const LINE_BY_SPORT = { mlb: lineMlb, nhl: lineNhl, nfl: lineNfl, nba: lineNba }

/** One CalledRow, the shape every adapter returns and every surface reads. */
export function makeRow({ sport, date, pid, name, team, opp = null, gameId = null, result, calledAs = null, bar = null, stat = null }) {
  const res = RESULTS.includes(result) ? result : 'pending'
  const line = res === 'void' ? 'did not play' : res === 'pending' ? 'not graded yet' : (LINE_BY_SPORT[sport]?.(stat) || '')
  return { sport, date, pid: String(pid), name: name || '', team: team || '', opp: opp || '', gameId: gameId == null ? null : String(gameId), result: res, called: CALLED_WORD, calledAs, bar, line }
}

// misses first, then did-not-play, pending, hits (the order the section prints)
const ORDER = { miss: 0, void: 1, pending: 2, hit: 3 }
export const sectionOrder = (a, b) => ORDER[a.result] - ORDER[b.result] || String(a.name).localeCompare(String(b.name))

/** { called, hit, miss, void, pending } */
export function summarize(rows) {
  const out = { called: 0, hit: 0, miss: 0, void: 0, pending: 0 }
  for (const r of rows || []) { out.called += 1; out[r.result] += 1 }
  return out
}

/** The filter test: does this row pass `mode`? A player who was not called last night never does. */
export function passes(mode, row) {
  const m = MODES.find((x) => x.key === mode)
  if (!m) return true
  return Boolean(row) && m.results.includes(row.result)
}

/** 'Called Fri · missed' -- yesterday's call and result, labelled as yesterday's, never tonight's status word. */
export const yesterdayLabel = (row) => `Called ${weekdayOf(row.date)} · ${RESULT_LOWER[row.result]}`
/** The column cell: 'Called Fri · missed · 0-for-4' */
export const cellText = (row) => (row ? `${yesterdayLabel(row)}${row.line && row.result !== 'void' && row.result !== 'pending' ? ` · ${row.line}` : ''}` : '')

/** The honest sentence under the section when nothing is shown. */
export function emptyNote({ date, state, mode = 'all' }) {
  const d = dayWord(date)
  if (state === 'none') return date ? `No calls were stored for ${d}.` : 'No earlier slate with stored calls yet.'
  if (state === 'pending') return `Nothing graded yet for ${d}.`
  if (mode === 'miss') return `No calls from ${d} missed.`
  if (mode === 'hit') return `No calls from ${d} hit.`
  if (mode === 'void') return `Everyone called on ${d} played.`
  return `No calls from ${d}.`
}

/** A one-line count, neutral: '9 called Fri Oct 9 · 4 hit · 3 missed · 1 did not play · 1 pending' */
export function summaryLine(date, s) {
  const bits = [`${s.called} called ${dayWord(date)}`]
  if (s.hit) bits.push(`${s.hit} hit`)
  if (s.miss) bits.push(`${s.miss} missed`)
  if (s.void) bits.push(`${s.void} did not play`)
  if (s.pending) bits.push(`${s.pending} pending`)
  return bits.join(' · ')
}
