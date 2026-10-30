// THE WHOLE DEFENSE ROW of the "what they allow" grids (2026-10-29, Donovan: receptions, rush attempts, "the total that the team
// has given up and where they rank"). The bot publishes it under dvp_total (nfl_dvp.build_total): every pass catcher and rusher
// against the club, per game, with the league rank of 32 (1 = allows the most). It is NOT a role, so it never goes inside dvp.
// Nothing here is computed: a team with no dvp_total cell gets no row, never a dashed one.
const fin = (v) => Number.isFinite(Number(v)) && v !== null && v !== ''

export const dvpTotalCell = (data, team, win = 'season') => {
  const c = data?.dvp_total?.[win]?.[team]
  return c && fin(c.yds_g) && fin(c.yds_g_rank) ? c : null
}

// rows / stats / labels as the grids build them, plus the Total row first and the TOT YDS/G column last.
export function withTotalRow(data, team, win, rows, stats, labels) {
  const c = dvpTotalCell(data, team, win)
  if (!c) return { rows, stats, labels }
  const all = [...stats.filter((st) => fin(c[st])), 'yds_g']
  const o = { _id: 'TOTAL', role: 'Total', isTotal: true }
  for (const st of all) { o[st] = fin(c[`${st}_rank`]) ? 33 - c[`${st}_rank`] : null; o[`${st}__v`] = c[st]; o[`${st}__r`] = c[`${st}_rank`] }
  return {
    rows: [o, ...rows],
    stats: [...stats, ...(stats.includes('yds_g') ? [] : ['yds_g'])],
    labels: { ...labels, ...(data?.dvp_total_labels || {}), yds_g: data?.dvp_total_labels?.yds_g || 'TOT YDS/G' },
  }
}
