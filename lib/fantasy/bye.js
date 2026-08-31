import { NFL_TEAMS } from '../nfl/teams'

// ── WHO IS NOT PLAYING THIS WEEK ────────────────────────────────────────────
//
// From week 5 a third of the league sits out, and until now nothing on this
// site said so. A player on bye rendered exactly like a player whose game had
// not kicked off yet -- same row, same PROJ chip, same projected points -- and
// then scored nothing. That is not a missing label, it is an invitation to
// start him.
//
// The answer is already in nfl_week_games: the teams with a row for this week
// are playing, and the other thirty-two minus those are not.
//
// THE GUARD IS THE WHOLE DIFFICULTY. An empty or half-published week would
// make that arithmetic say every team is on bye, which is a far worse lie than
// saying nothing -- and it would say it loudest early in the week, exactly
// when people are setting lineups. So a slate has to look real before it is
// allowed to answer at all.
//
// THE FLOOR IS 13, NOT 8. Thirty-two teams is sixteen games, and the most the
// NFL has ever rested in one week is six -- which is three games missing, so a
// real published week is thirteen to sixteen. A slate of eight games is a feed
// halfway through publishing, and the arithmetic would answer "sixteen teams
// are on bye" with total confidence. Twelve leaves one game of slack under the
// real floor and rejects everything more partial than that.
export const MIN_GAMES_FOR_A_REAL_SLATE = 12

const ALL_TEAMS = NFL_TEAMS.map(([abbr]) => abbr)

/**
 * The teams on bye, or NULL when the slate is too thin to know.
 *
 * Null is not "nobody is on bye" and callers must not treat it as such -- it
 * means do not render a bye badge, do not zero a projection, say nothing.
 * Every caller here checks for it explicitly.
 *
 * Regular season only: preseason rows carry weeks 1-3 as well, so a caller
 * that passed them in would have every team "playing" in week 1 for the wrong
 * reason. Filtered here rather than trusted from the query.
 */
export function byeTeamsFor(games) {
  const real = (games || []).filter((game) => Number(game?.season_type ?? 2) === 2)
  if (real.length < MIN_GAMES_FOR_A_REAL_SLATE) return null
  const playing = new Set()
  for (const game of real) {
    for (const team of [game.home_team, game.away_team]) {
      if (team) playing.add(String(team).toUpperCase())
    }
  }
  return new Set(ALL_TEAMS.filter((team) => !playing.has(team)))
}

/** Is this player's team sitting out? False whenever we cannot tell. */
export function isOnBye(player, byeTeams) {
  if (!byeTeams || !player?.team) return false
  return byeTeams.has(String(player.team).toUpperCase())
}
