// ── WHO IS WINNING, DECIDED IN ONE PLACE (2026-09-14) ───────────────────────
//
// Three pages answer "is this matchup over, and who won" -- Matchup, League
// (standings) and the feed -- and each used to read fantasy_matchups.status
// straight off the row. That column is written by the scoring SQL and, until
// migration 202609140300 runs, says 'scheduled' on a Sunday night with
// fifteen finals. A page must not depend on a migration to print a winner,
// so the state is derived here from the NFL games of that week, which every
// page already loads, and the row's own status is only a fallback.
//
//   final      every regular-season game of the week is final
//   live       at least one game has started and not all are final
//   scheduled  nothing has kicked off (or no games synced yet)

export function weekStateFromGames(games) {
  const rows = (games || []).filter((g) => Number(g?.season_type ?? 2) === 2)
  if (!rows.length) return 'scheduled'
  if (rows.every((g) => g.status === 'final')) return 'final'
  if (rows.some((g) => g.status === 'final' || g.status === 'live')) return 'live'
  return 'scheduled'
}

/** { [week]: state } for a season's worth of nfl_week_games rows. */
export function weekStates(games) {
  const byWeek = new Map()
  for (const g of games || []) {
    const w = Number(g?.week)
    if (!byWeek.has(w)) byWeek.set(w, [])
    byWeek.get(w).push(g)
  }
  const out = {}
  for (const [w, rows] of byWeek) out[w] = weekStateFromGames(rows)
  return out
}

/** The state of one matchup row, given its week's derived state. The row's
 *  own status is trusted only when it says MORE than the games do (a
 *  commissioner can hand-finalize a game). */
export function matchupState(row, weekState) {
  if (row?.status === 'final') return 'final'
  return weekState || row?.status || 'scheduled'
}

/**
 * The result of a matchup. `winnerId` is null for a tie or a game that has
 * not started. `leaderId` is who is ahead right now, whatever the state.
 */
export function matchupResult(row, state) {
  const home = Number(row?.home_score) || 0
  const away = Number(row?.away_score) || 0
  const margin = Math.round(Math.abs(home - away) * 100) / 100
  const leaderId = state === 'scheduled' || home === away ? null : (home > away ? row.home_team_id : row.away_team_id)
  const winnerId = state === 'final' ? leaderId : null
  return { home, away, margin, leaderId, winnerId, tie: state !== 'scheduled' && home === away }
}
