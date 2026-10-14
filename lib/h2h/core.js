// HEAD TO HEAD, THE ARITHMETIC (2026-10-13). Pure: games in, numbers out. No fetch, no clock, no React.
//
// A GAME here is the one shape every feed is reduced to (lib/h2h/read.js builds it; this file never sees a feed):
//   { id, season, seasonKey, date, type: 'R' | 'P', home, away, hs, as, ot: null | 'OT' | 'SO' }
//   season     the label a person reads ("2026-27", "2026")        seasonKey  a sortable number (2026, 2025 ...)
//   type       R = regular season, P = playoffs                      ot         how a hockey game went past 60 minutes
//   hs / as    final score of the home / away club; a game with no final score is not a meeting and is dropped
//
// WHAT IS NOT HERE. A SPREAD. No closing spread is stored for results anywhere in this repo, so "who covers" cannot be
// answered, and this file never answers it: every figure is a plain margin (the final score difference from one club's
// side), labelled MARGIN wherever it is drawn. If a stored closing spread ever exists, a cover rate is a new function on
// the same meeting rows; nothing here would change.
import { MIN_MEETINGS, SPORT_RULES } from './config'

const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
const r1 = (x) => Math.round(x * 10) / 10

/** A feed's fields -> a game, or null when it is not a finished game between two named clubs. */
export function makeGame(g) {
  if (!g || !g.home || !g.away || g.home === g.away) return null
  if (!fin(g.hs) || !fin(g.as)) return null
  return {
    id: g.id != null ? String(g.id) : null, season: String(g.season ?? ''), seasonKey: Number(g.seasonKey) || 0, date: String(g.date || '').slice(0, 10),
    type: g.type === 'P' ? 'P' : 'R', home: String(g.home).toUpperCase(), away: String(g.away).toUpperCase(), hs: Number(g.hs), as: Number(g.as), ot: g.ot || null,
  }
}
const asGame = (raw) => makeGame(raw)   // always through makeGame: an unfinished game is never a meeting, however it was built

/** One game from `a`'s side: { for, against, margin, result: 'W'|'L'|'T', extra, home } or null when `a` did not play in it. extra = lost after 60 minutes (hockey). */
export function sideOf(game, a) {
  const A = String(a || '').toUpperCase()
  const mine = game.home === A ? game.hs : game.away === A ? game.as : null
  if (mine == null) return null
  const theirs = game.home === A ? game.as : game.hs
  const result = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T'
  return { for: mine, against: theirs, margin: mine - theirs, result, extra: result === 'L' && Boolean(game.ot), home: game.home === A }
}

/** Every finished meeting of `a` and `b`, newest first. A game id read twice (once from each club's schedule) counts once. */
export function meetings(games, a, b) {
  const A = String(a || '').toUpperCase(); const B = String(b || '').toUpperCase()
  const seen = new Set(); const out = []
  for (const raw of games || []) {
    const g = asGame(raw)
    if (!g) continue
    if (!((g.home === A && g.away === B) || (g.home === B && g.away === A))) continue
    const key = g.id || `${g.date}-${g.home}-${g.away}`
    if (seen.has(key)) continue
    seen.add(key); out.push(g)
  }
  return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}

/**
 * The record and averages of `a` over `games` (meetings with one other club). Averages are null under MIN_MEETINGS:
 * the caller says "not enough yet"; this file never fills a thin sample.
 */
export function summarize(games, a, sport) {
  const rules = SPORT_RULES[sport] || SPORT_RULES.mlb
  const sides = (games || []).map((g) => ({ g, s: sideOf(g, a) })).filter((x) => x.s)
  const gp = sides.length
  const w = sides.filter((x) => x.s.result === 'W').length
  const t = sides.filter((x) => x.s.result === 'T').length
  const otl = rules.lossExtra ? sides.filter((x) => x.s.extra).length : 0
  const l = sides.filter((x) => x.s.result === 'L').length - otl
  const enough = gp >= MIN_MEETINGS
  const mean = (f) => (enough ? r1(sides.reduce((acc, x) => acc + f(x.s), 0) / gp) : null)
  const last = sides.length ? sides.reduce((best, x) => (x.g.date > best.g.date ? x : best)) : null
  return {
    gp, w, l, otl, t, enough,
    winPct: gp ? Math.round(((w + t / 2) / gp) * 1000) / 1000 : null,
    avgFor: mean((s) => s.for), avgAgainst: mean((s) => s.against), avgMargin: mean((s) => s.margin),
    avgTotal: enough ? r1(sides.reduce((acc, x) => acc + x.s.for + x.s.against, 0) / gp) : null,
    last: last ? { id: last.g.id, date: last.g.date, for: last.s.for, against: last.s.against, result: last.s.result, extra: last.s.extra, home: last.s.home, type: last.g.type, ot: last.g.ot } : null,
  }
}

/** "7-3", "7-3-1" (NFL tie / NHL OT loss). The third number is printed only when the sport has one and it is not zero. */
export function recordText(s, sport) {
  if (!s || !s.gp) return '—'
  const rules = SPORT_RULES[sport] || SPORT_RULES.mlb
  const third = rules.third === 'OTL' ? s.otl : rules.third === 'T' ? s.t : 0
  return third ? `${s.w}-${s.l}-${third}` : `${s.w}-${s.l}`
}

/** One row per season for the pair, newest first, plus the all-seasons row. A season with no finished meeting has no row (never a made-up 0-0). */
export function bySeason(games, a, b, sport) {
  const ms = meetings(games, a, b)
  const keys = [...new Set(ms.map((g) => g.seasonKey))].sort((x, y) => y - x)
  const rows = keys.map((k) => {
    const list = ms.filter((g) => g.seasonKey === k)
    return { key: String(k), label: list[0].season, ...summarize(list, a, sport) }
  })
  const all = ms.length ? { key: 'all', label: 'Total', ...summarize(ms, a, sport) } : null
  return { rows, all, meetings: ms }
}

/** A club's games against every opponent in `games` (that club's own schedule): one summary per opponent, by opponent code. */
export function vsEveryone(games, a, sport) {
  const A = String(a || '').toUpperCase()
  const byOpp = new Map()
  for (const raw of games || []) {
    const g = asGame(raw)
    if (!g || (g.home !== A && g.away !== A)) continue
    const opp = g.home === A ? g.away : g.home
    if (!byOpp.has(opp)) byOpp.set(opp, [])
    byOpp.get(opp).push(g)
  }
  return [...byOpp.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([opp, list]) => ({ opp, ...summarize(meetings(list, A, opp), A, sport) }))
}

const calendarYear = (y, m) => (m < 3 ? y - 1 : y)     // MLB and the NFL name a season by the year it starts in
const winterYear = (y, m) => (m >= 9 ? y : y - 1)      // the NHL and the NBA start in the autumn
const SEASON_START = { mlb: calendarYear, nfl: calendarYear, nhl: winterYear, nba: winterYear }
const two = (s) => `${s}-${String(s + 1).slice(-2)}`
const SEASON_LABEL = { mlb: String, nfl: String, nhl: two, nba: two }
const SEASON_FEED = { mlb: (s) => s, nfl: (s) => s, nhl: (s) => `${s}${s + 1}`, nba: (s) => s + 1 }   // ESPN names an NBA season by the year it ends

/** The seasons a sport reads for a date (YYYY-MM-DD): this one and the ones before it, newest first. `feed` is what that sport's feed calls the season. */
export function seasonsFor(sport, today, n = 3) {
  const [y, m] = String(today).slice(0, 7).split('-').map(Number)
  const out = []
  const cur = SEASON_START[sport](y, m)
  for (let i = 0; i < n; i += 1) {
    const s = cur - i
    out.push({ key: s, label: SEASON_LABEL[sport](s), feed: SEASON_FEED[sport](s) })
  }
  return out
}
