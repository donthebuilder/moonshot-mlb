// lib/nfl/seasonWindow.js -- THIS SEASON | LAST SEASON | LAST 2 for the player card.
//
// Pure and server-safe. The game log (nfl_logs.json) is a flat list of games, each
// with `s` (season). "This season" is the slate's own season, "last season" the one
// before it, "last 2" those two together. An option is offered ONLY when the log
// really holds that season; with one season on file there is nothing to toggle and
// the card shows no toggle at all.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

export const SEASON_LABEL = { this: 'THIS SEASON', last: 'LAST SEASON', two: 'LAST 2' }

/** Which seasons the log holds, newest first. */
export function seasonsIn(log) {
  const set = new Set()
  for (const g of Array.isArray(log) ? log : []) { const s = num(g?.s); if (s) set.add(s) }
  return [...set].sort((a, b) => b - a)
}

/** The seasons each option stands for, or null when the log can't back it. */
function span(key, have, slateSeason) {
  const now = num(slateSeason) || have[0] || null
  if (!now) return null
  const want = key === 'this' ? [now] : key === 'last' ? [now - 1] : [now, now - 1]
  return want.every((s) => have.includes(s)) ? want : null
}

/** The options the log supports, in display order: [{ key, label, years }]. */
export function seasonOptions(log, slateSeason) {
  const have = seasonsIn(log)
  const opts = ['this', 'last', 'two']
    .map((key) => { const years = span(key, have, slateSeason); return years && { key, label: SEASON_LABEL[key], years } })
    .filter(Boolean)
  // a single season (or none) is not a choice
  return opts.length > 1 ? opts : []
}

/** The default: the widest window the log supports (what the card showed before the toggle). */
export function defaultSeason(opts) {
  return opts.find((o) => o.key === 'two')?.key || opts[0]?.key || ''
}

/** The log cut to one option. An unknown / unsupported key returns the log untouched. */
export function applySeason(log, key, slateSeason) {
  const rows = Array.isArray(log) ? log : []
  const years = span(key, seasonsIn(rows), slateSeason)
  return years ? rows.filter((g) => years.includes(num(g?.s))) : rows
}
