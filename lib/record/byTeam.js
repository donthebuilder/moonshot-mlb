// CALLED PICKS, THIS WEEK AND BY CLUB (2026-10-12, Donovan: "track calls by team to see how accurate we get ... THIS WEEK'S
// called percent accuracy, in each sport's respective record"). Pure and client-safe: no fetch, no clock, no React.
//
// THE ROWS are the graded called rows each sport's ledger already reads, as /api/record/calls lists them (MLB: the locked
// TOP / HR calls; NFL: the weekly card's TD calls; NHL: CALLED goal-board skaters; NBA: every market's CALLED players, only
// the markets past the public-number floor). Nothing is stored for this and nothing is graded here: every figure is a count
// of the rows handed in, and every rate carries its n and a 95% Wilson range.
//
// WHAT COUNTS. A row is a call that was graded hit or miss. A `void` (did not play / no line) and a row with no grade are
// in no n: set aside, never a miss (the ladder's rule). A club is the one STORED ON THE CALL (the roster the day's board
// was locked with), so a traded player counts for the club he was on that game day; it is never today's club. A row with
// no club stored is counted in `noClub`, said in words, and left out of the club table (never guessed).
//
// THE WEEK. Each row is assigned to a week by its OWN game date (never the ET wall clock). NFL: the NFL week (the row's
// `week`). Every other sport: the 7-day week ending `today` (the anchor the route stamps), and the 7 days before it. The
// window is always stated with the number.
//
// THE FLOOR. A figure under LADDER_MIN_N (30) graded calls prints counts and the word "tracking", no rate (the ladder's
// rule, which is also the BUCKETS public-number floor). The club table prints every club's counts and a rate with its range,
// a club under TEAM_THIN_N graded calls says "n=3" in plain text and sits dimmed: it never sets a scale or a label.
import { wilson } from '../interval'
import { canonTeam } from '../injuries/teams'
import { LADDER_MIN_N } from './ladder'

export const CALLED_MIN_N = LADDER_MIN_N
/** A club with fewer graded calls than this prints "n=K" beside its rate and does not set the table's colour scale. */
export const TEAM_THIN_N = 10

/** What a call is, per sport: words only, keyed by lib/routes.js sportKey. `week` = the sport's week is its own (NFL). */
export const CALLED_WORDS = {
  mlb: { what: 'home-run calls', one: 'home-run call', unit: 'day', weekKind: 'days' },
  nfl: { what: 'touchdown calls', one: 'touchdown call', unit: 'week', weekKind: 'nfl' },
  nhl: { what: 'goal calls', one: 'goal call', unit: 'day', weekKind: 'days' },
  nba: { what: 'calls', one: 'call', unit: 'day', weekKind: 'days' },
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const md = (ymd) => { const [, m, d] = String(ymd || '').split('-'); return m && d ? `${MONTH[Number(m) - 1]} ${Number(d)}` : '' }
const shift = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const nf = (n) => Number(n).toLocaleString('en-US')
const pct1 = (h, n) => (n > 0 ? Math.round((1000 * h) / n) / 10 : null)
const settled = (r) => r?.result === 'hit' || r?.result === 'miss'

/** { n, hits, rate, ci, void, tracking } for a list of rows. `tracking` = under the floor: a rate is not printed. */
export function accuracyOf(rows, minN = CALLED_MIN_N) {
  const list = (rows || []).filter(settled)
  const hits = list.filter((r) => r.result === 'hit').length
  const n = list.length
  return { n, hits, rate: pct1(hits, n), ci: n ? wilson(hits, n) : null, void: (rows || []).filter((r) => r?.result === 'void').length, tracking: n < minN, minN }
}

/**
 * The two weeks. NFL: { kind:'nfl', this:{ week, label }, prev:{ week, label } }; others: { kind:'days', this:{ from, to, label },
 * prev:{ from, to, label } }. `nflWeek` is the live NFL week (the route reads nfl_week.json); `today` is the route's day key.
 */
export function weekWindows(sport, { today, nflWeek = null } = {}) {
  const words = CALLED_WORDS[sport] || CALLED_WORDS.mlb
  if (words.weekKind === 'nfl') {
    const w = Number(nflWeek)
    if (!Number.isFinite(w) || w < 1) return { kind: 'nfl', this: null, prev: null }
    return { kind: 'nfl', this: { week: w, label: `NFL week ${w}` }, prev: w > 1 ? { week: w - 1, label: `NFL week ${w - 1}` } : null }
  }
  if (!today) return { kind: 'days', this: null, prev: null }
  const win = (to) => { const from = shift(to, -6); return { from, to, label: `${md(from)} to ${md(to)}` } }
  return { kind: 'days', this: win(today), prev: win(shift(today, -7)) }
}

/** Is this row in that window? By the row's own game date (days) or its own week (NFL). */
export function inWindow(row, win, kind) {
  if (!win) return false
  if (kind === 'nfl') return Number(row?.week) === win.week
  const d = String(row?.date || '')
  return Boolean(d) && d >= win.from && d <= win.to
}

/** A call row as this module reads it: clubs canonical for the sport (WSH / WAS, LA / LAK ...), nothing else changed. */
export function normalizeCalls(calls, sport) {
  return (calls || []).map((c) => ({ ...c, team: c.team ? canonTeam(sport, c.team) : null, opp: c.opp ? canonTeam(sport, c.opp) : null }))
}

const orderKey = (r, kind) => (kind === 'nfl' ? `${String(Number(r.week) || 0).padStart(3, '0')}` : String(r.date || ''))

/**
 * The strip: this week, last week and the whole season, each with its window and its n.
 * { sport, kind, season, thisWeek, prevWeek, windows, noGrade }  each figure = accuracyOf(...) + { label }.
 */
export function calledAccuracy(calls, sport, ctx = {}) {
  const minN = ctx.minN ?? CALLED_MIN_N
  const rows = normalizeCalls(calls, sport)
  const w = weekWindows(sport, ctx)
  const mine = (win) => accuracyOf(rows.filter((r) => inWindow(r, win, w.kind)), minN)
  return {
    sport, kind: w.kind, windows: w, minN,
    season: accuracyOf(rows, minN),
    thisWeek: w.this ? { ...mine(w.this), label: w.this.label } : null,
    prevWeek: w.prev ? { ...mine(w.prev), label: w.prev.label } : null,
  }
}

/**
 * Called picks by club. `by`: 'team' (the club the called player belongs to) or 'opp' (the club he faced).
 * Rows sorted by graded calls, most first, then club code: an ordering by volume, never by rate.
 * { by, rows:[{ team, n, hits, rate, ci, thin, week:{n,hits}, last10:{n,hits}, dnp }], noClub, clubs }
 */
export function byTeamFrom(calls, sport, ctx = {}, { by = 'team' } = {}) {
  const rows = normalizeCalls(calls, sport)
  const w = weekWindows(sport, ctx)
  const key = by === 'opp' ? 'opp' : 'team'
  const noClub = rows.filter((r) => !r[key] && settled(r)).length
  const groups = new Map()
  for (const r of rows) {
    if (!r[key]) continue
    if (!groups.has(r[key])) groups.set(r[key], [])
    groups.get(r[key]).push(r)
  }
  const out = [...groups.entries()].map(([team, list]) => {
    const acc = accuracyOf(list, 0)
    const inWk = list.filter((r) => inWindow(r, w.this, w.kind))
    const wk = accuracyOf(inWk, 0)
    const recent = list.filter(settled).sort((a, b) => orderKey(b, w.kind).localeCompare(orderKey(a, w.kind)) || String(a.name).localeCompare(String(b.name))).slice(0, 10)
    return {
      team, n: acc.n, hits: acc.hits, rate: acc.rate, ci: acc.ci, thin: acc.n < TEAM_THIN_N, dnp: acc.void,
      week: { n: wk.n, hits: wk.hits },
      last10: { n: recent.length, hits: recent.filter((r) => r.result === 'hit').length },
    }
  }).filter((r) => r.n > 0 || r.dnp > 0).sort((a, b) => b.n - a.n || a.team.localeCompare(b.team))
  return { by, rows: out, noClub, clubs: out.filter((r) => r.n > 0).length }
}

/** One club's figures for its team page: the same rows, the same arithmetic as the record's club table. */
export function teamFigures(calls, sport, team, ctx = {}) {
  const t = canonTeam(sport, team)
  const mineRows = normalizeCalls(calls, sport).filter((r) => r.team === t)
  return calledAccuracy(mineRows, sport, { ...ctx, minN: 0 })
}

// ── WORDS ─────────────────────────────────────────────────────────────────────
const range = (c) => (c?.ci ? `${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}%` : null)

/** "This week (Oct 6 to Oct 12): 3 of 7 called cleared, tracking (a rate waits for 30 graded calls)." One template for every figure. */
export function figureLine(lead, f, { what = 'called picks' } = {}) {
  const win = f?.label ? ` (${f.label})` : ''
  if (!f || f.n === 0) return `${lead}${win}: no ${what} graded in this window.${f?.void ? ` ${f.void} did not play, not counted.` : ''}`
  const base = `${lead}${win}: ${nf(f.hits)} of ${nf(f.n)} called cleared`
  const dnp = f.void ? ` ${f.void} did not play, not counted.` : ''
  if (f.tracking) return `${base} · tracking (n=${nf(f.n)}, a rate waits for ${f.minN} graded calls).${dnp}`
  return `${base} · ${f.rate.toFixed(1)}%, 95% range ${range(f)} (n=${nf(f.n)}).${dnp}`
}

/** The three strip lines, in print order. */
export function stripLines(acc, { what = 'called picks' } = {}) {
  if (!acc) return []
  const out = []
  out.push({ key: 'week', text: acc.thisWeek ? figureLine('This week', acc.thisWeek, { what }) : 'This week: the week is not known yet.', f: acc.thisWeek })
  if (acc.prevWeek) out.push({ key: 'prev', text: figureLine('Last week', acc.prevWeek, { what }), f: acc.prevWeek })
  out.push({ key: 'season', text: figureLine('All season', { ...acc.season, label: null }, { what }), f: acc.season })
  return out
}

/** A club row's cells as printed. */
export function teamCells(r) {
  return {
    cleared: `${nf(r.hits)}`,
    rate: r.rate == null ? '—' : `${r.rate.toFixed(1)}%`,
    range: r.ci ? range(r) : '—',
    thin: r.thin ? `n=${r.n}` : null,
    week: r.week.n ? `${r.week.hits} of ${r.week.n}` : '—',
    last10: r.last10.n ? `${r.last10.hits} of ${r.last10.n}` : '—',
  }
}
