// ONE CLUB'S USAGE, FROM THE GAME LOGS (2026-10-19, the team page's treemap, components/charts/UsageTreemap.js).
// nfl_logs.json carries every board player's games: catches (g_rec), carries (g_car), touchdowns (g_td) by week and
// club. This gathers one club's QBs, RBs, WRs and TEs for one season into the treemap's shape. Counts only; the
// logs have catches, not targets, so "touches" here is catches + carries. Names, positions and depth come from the
// week file; a log with no row there is left out (never named by guess).

export const USAGE_METRICS = [
  { key: 'tch', label: 'Touches', unit: 'touches' },
  { key: 'rec', label: 'Catches', unit: 'catches' },
  { key: 'car', label: 'Carries', unit: 'carries' },
  { key: 'td', label: 'TDs', unit: 'TDs' },
]
export const USAGE_GROUPS = ['RB', 'WR', 'TE', 'QB']

/** -> { season, weeks, late (the club's last 3 weeks), players: [{ id, name, group, role, weeks: { w: { tch, rec, car, td } } }] } or null */
export function teamUsage({ logs, players = [], team, season = null }) {
  const L = logs?.logs
  if (!L || !team) return null
  const meta = new Map((players || []).map((p) => [String(p.player_id), p]))
  // the season: the one asked for if the club has games in it, else the club's latest
  const seasons = new Set()
  for (const v of Object.values(L)) for (const g of v?.log || []) if (g.tm === team) seasons.add(g.s)
  if (!seasons.size) return null
  const s = season != null && seasons.has(season) ? season : Math.max(...seasons)
  const weeks = new Set(), out = []
  for (const [pid, v] of Object.entries(L)) {
    const m = meta.get(String(pid))
    if (!m || !USAGE_GROUPS.includes(m.position)) continue
    const wk = {}
    for (const g of v?.log || []) {
      if (g.s !== s || g.tm !== team) continue
      weeks.add(g.w)
      const rec = Math.round(Number(g.g_rec) || 0), car = Math.round(Number(g.g_car) || 0)
      wk[g.w] = { rec, car, tch: rec + car, td: Math.round(Number(g.g_td) || 0) }
    }
    if (Object.keys(wk).length) out.push({ id: String(pid), name: m.name, group: m.position, role: m.depth || m.position, weeks: wk, _raw: m })
  }
  if (!out.length) return null
  const ws = [...weeks].sort((a, b) => a - b)
  return { season: s, weeks: ws, late: ws.slice(-3), players: out }
}
