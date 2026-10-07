// lib/nba/seasonWindow.js -- THIS SEASON | LAST SEASON | LAST 2 SEASONS for BUCKETS' player page.
//
// Mirrors lib/nfl/seasonWindow.js (the NFL card's toggle), for ESPN's season years
// (2027 = 2026-27). Pure and server-safe. The player route sends his games from both
// seasons, each row tagged `s`. An option is offered ONLY when his log really holds that
// season: with one season on file there is nothing to toggle and the page shows none.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

export const SEASON_LABEL = { this: 'THIS SEASON', last: 'LAST SEASON', two: 'LAST 2 SEASONS' }
/** 2027 -> "2026-27" */
export const yearLabel = (s) => `${s - 1}-${String(s).slice(2)}`

/** Which seasons the log holds, newest first. */
export function seasonsIn(log) {
  const set = new Set()
  for (const g of Array.isArray(log) ? log : []) { const s = num(g?.s); if (s) set.add(s) }
  return [...set].sort((a, b) => b - a)
}

function span(key, have, nowSeason) {
  const now = num(nowSeason) || have[0] || null
  if (!now) return null
  const want = key === 'this' ? [now] : key === 'last' ? [now - 1] : [now, now - 1]
  return want.every((s) => have.includes(s)) ? want : null
}

/** [{ key, label, years }] the log can back, display order. One season (or none) is not a choice: []. */
export function seasonOptions(log, nowSeason) {
  const have = seasonsIn(log)
  const opts = ['this', 'last', 'two']
    .map((key) => { const years = span(key, have, nowSeason); return years && { key, label: SEASON_LABEL[key], years } })
    .filter(Boolean)
  return opts.length > 1 ? opts : []
}

/** The default: the season in play when it has real games (>= 10), else the widest window. */
export function defaultSeason(opts, log = [], nowSeason = null) {
  if (!opts.length) return ''
  const now = num(nowSeason)
  const nowGames = (Array.isArray(log) ? log : []).filter((g) => num(g?.s) === now).length
  if (nowGames >= 10 && opts.some((o) => o.key === 'this')) return 'this'
  return opts.find((o) => o.key === 'two')?.key || opts[0].key
}

/** The log cut to one option. An unknown / unsupported key returns the log untouched. */
export function applySeason(log, key, nowSeason) {
  const rows = Array.isArray(log) ? log : []
  const years = span(key, seasonsIn(rows), nowSeason)
  return years ? rows.filter((g) => years.includes(num(g?.s))) : rows
}
