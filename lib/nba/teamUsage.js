// ONE BUCKETS CLUB'S USAGE (2026-10-19, Donovan: "handle" the BUCKETS treemap). The shared treemap
// (components/charts/UsageTreemap.js) on the club page, from the roster payload it already loads (/api/buckets/team):
// each player's season line is a per-game average and his games, so his season count is average x games, rounded.
// Grouped guards / forwards / centres by the position ESPN lists (a "G-F" is a guard: the first one). There are no
// game-by-game logs on this page, so there is no "lately" trend: every box is neutral (the treemap says so by
// leaving the key off). Counts only; nothing modelled.

export const NBA_USAGE_METRICS = [
  { key: 'pts', label: 'PTS', unit: 'points' },
  { key: 'reb', label: 'REB', unit: 'rebounds' },
  { key: 'ast', label: 'AST', unit: 'assists' },
  { key: 'tpm', label: '3PM', unit: 'threes' },
  { key: 'min', label: 'MIN', unit: 'minutes' },
]
export const NBA_USAGE_GROUPS = ['G', 'F', 'C']
const groupOf = (pos) => { const p = String(pos || '').toUpperCase().split('-')[0]; return p.includes('C') ? 'C' : p.includes('F') ? 'F' : p.includes('G') ? 'G' : null }

/** payload: /api/buckets/team -> the treemap's usage ({ season, weeks: [], late: [], players }) or null */
export function nbaTeamUsage(payload) {
  const ps = (payload?.players || []).filter((p) => p.onStats && Number(p.gp) > 0 && groupOf(p.pos))
  if (!ps.length) return null
  const tot = (p, k) => Math.round((Number(p[k]) || 0) * Number(p.gp))
  return {
    season: payload.seasonLabel || '', weeks: [], late: [],
    players: ps.map((p) => ({ id: String(p.id), name: p.name, group: groupOf(p.pos), role: p.pos, weeks: { season: { pts: tot(p, 'pts'), reb: tot(p, 'reb'), ast: tot(p, 'ast'), tpm: tot(p, 'tpm'), min: tot(p, 'min') } } })),
  }
}
