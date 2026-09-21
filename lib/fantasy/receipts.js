// ── THE RECEIPTS (2026-09-20) ───────────────────────────────────────────────
//
// Donovan: "recipts for sure and drama." A head-to-head page that prints only
// this week's two numbers has no memory, so nothing on it can be thrown in
// anyone's face. These helpers read the league's own finished matchups and
// answer the four questions people actually argue about:
//
//   what is your record          seasonRecord()
//   what have you done lately    streakOf() / recentForm()
//   have we played before        seriesBetween()
//   what did you do last week    lastResultFor()
//
// EVERY NUMBER HERE IS A SUM OF SCORES THIS LEAGUE ALREADY PLAYED. Nothing is
// modelled, projected or invented (project rule #16). A league in week 1 has
// no receipts and these return empty -- which the page says out loud rather
// than filling with a placeholder.
//
// `finals` is the caller's list of matchup rows it has already decided are
// final. That decision belongs to matchupState.js, not here: this file must
// never read row.status, which lies until migration 202609140300 lands.

/** One team's side of a finished matchup, or null if it wasn't in it. */
export function sideOf(row, teamId) {
  if (!row) return null
  const home = row.home_team_id === teamId
  const away = row.away_team_id === teamId
  if (!home && !away) return null
  const pf = Number(home ? row.home_score : row.away_score) || 0
  const pa = Number(home ? row.away_score : row.home_score) || 0
  return {
    week: Number(row.week),
    pf,
    pa,
    margin: Math.round((pf - pa) * 100) / 100,
    opponentId: home ? row.away_team_id : row.home_team_id,
    outcome: pf > pa ? 'W' : pf < pa ? 'L' : 'T',
  }
}

/** Every finished game a team played, newest week first. */
export function gamesFor(finals, teamId) {
  return (finals || [])
    .map((row) => sideOf(row, teamId))
    .filter(Boolean)
    .sort((a, b) => b.week - a.week)
}

export function seasonRecord(finals, teamId) {
  const games = gamesFor(finals, teamId)
  const record = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: games.length, best: null, worst: null }
  for (const game of games) {
    if (game.outcome === 'W') record.wins += 1
    else if (game.outcome === 'L') record.losses += 1
    else record.ties += 1
    record.pointsFor += game.pf
    record.pointsAgainst += game.pa
    if (!record.best || game.pf > record.best.pf) record.best = game
    if (!record.worst || game.pf < record.worst.pf) record.worst = game
  }
  record.label = record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`
  record.average = games.length ? Math.round((record.pointsFor / games.length) * 10) / 10 : null
  return record
}

/** The current run: three straight wins is "W3". Ties end a streak. */
export function streakOf(finals, teamId) {
  const games = gamesFor(finals, teamId)
  if (!games.length) return null
  const kind = games[0].outcome
  if (kind === 'T') return { kind, length: 1, label: 'T1' }
  let length = 0
  for (const game of games) {
    if (game.outcome !== kind) break
    length += 1
  }
  return { kind, length, label: `${kind}${length}` }
}

/** Newest-first W/L letters, for the little form strip. */
export function recentForm(finals, teamId, limit = 5) {
  return gamesFor(finals, teamId).slice(0, limit)
}

export function lastResultFor(finals, teamId) {
  return gamesFor(finals, teamId)[0] || null
}

/**
 * Every finished meeting between two teams, newest first, plus the tally.
 * A 14-week round robin in a small league pairs the same two teams more than
 * once, so this is a series and not a single game.
 */
export function seriesBetween(finals, aId, bId) {
  const games = (finals || [])
    .filter((row) =>
      (row.home_team_id === aId && row.away_team_id === bId) ||
      (row.home_team_id === bId && row.away_team_id === aId))
    .map((row) => {
      const a = sideOf(row, aId)
      return { week: a.week, aScore: a.pf, bScore: a.pa, margin: Math.abs(a.margin), winnerId: a.pf === a.pa ? null : (a.pf > a.pa ? aId : bId) }
    })
    .sort((x, y) => y.week - x.week)
  return {
    games,
    aWins: games.filter((game) => game.winnerId === aId).length,
    bWins: games.filter((game) => game.winnerId === bId).length,
    ties: games.filter((game) => !game.winnerId).length,
    last: games[0] || null,
  }
}
