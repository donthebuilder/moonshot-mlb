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
  const K = ['pts', 'reb', 'ast', 'tpm', 'min']
  // the club's last three games (the route reads the rotation's game logs): the season splits into earlier + last3, so
  // the treemap can say who has had more of it lately. A man outside the ten read has no last-3 row: all of his is earlier.
  const recent = payload.recent || null
  return {
    season: payload.seasonLabel || '', weeks: [], late: recent ? ['last3'] : [],
    players: ps.map((p) => {
      const r = recent?.[String(p.id)] || null
      const all = Object.fromEntries(K.map((k) => [k, tot(p, k)]))
      const last3 = r ? Object.fromEntries(K.map((k) => [k, Number(r[k]) || 0])) : null
      const earlier = last3 ? Object.fromEntries(K.map((k) => [k, Math.max(0, all[k] - last3[k])])) : all
      return { id: String(p.id), name: p.name, group: groupOf(p.pos), role: p.pos, weeks: last3 ? { earlier, last3 } : { earlier } }
    }),
  }
}
