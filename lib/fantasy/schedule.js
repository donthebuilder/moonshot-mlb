// WHO EACH CLUB PLAYS THIS WEEK, AND WHEN.
//
// The single most-read fact on a fantasy row -- ESPN puts "@PIT  Sun 10:00 AM"
// on every player in the league -- and Franchise showed neither the opponent
// nor the kickoff anywhere. The data was already in nfl_week_games; nothing had
// ever turned those rows inside out from "a game has two clubs" into "a club
// has a game", which is the shape a player row needs.
//
// Regular season only, for byeTeamsFor's reason: preseason rows also carry
// weeks 1-3, and a caller that let them through would show a week 1 opponent
// that is really an August friendly.
//
// LA AND LAR ARE THE SAME CLUB. The published slate uses both spellings (see
// NFL_TEAM_TONES, which carries both), so a Rams player whose row says LA must
// still find a game filed under LAR, and the reverse. Aliased here rather than
// at every call site.

const RAMS = [['LA', 'LAR'], ['LAR', 'LA']]

/** Map of CLUB -> { opponent, home, kickoff, status }. Empty when the slate is. */
export function teamScheduleFor(games) {
  const schedule = new Map()
  for (const game of games || []) {
    if (Number(game?.season_type ?? 2) !== 2) continue
    const home = String(game?.home_team || '').toUpperCase()
    const away = String(game?.away_team || '').toUpperCase()
    if (!home || !away) continue
    const status = String(game?.status || 'scheduled')
    schedule.set(home, { opponent: away, home: true, kickoff: game?.kickoff || null, status })
    schedule.set(away, { opponent: home, home: false, kickoff: game?.kickoff || null, status })
  }
  for (const [from, to] of RAMS) {
    if (schedule.has(from) && !schedule.has(to)) schedule.set(to, schedule.get(from))
  }
  return schedule
}

/** This player's game, or null when his club is not on the slate (a bye). */
export function gameForPlayer(schedule, player) {
  const team = String(player?.team || '').toUpperCase()
  if (!team || !schedule) return null
  return schedule.get(team) || null
}

/** "@PIT" or "vs TB" -- the form every fantasy site has used for twenty years. */
export function matchupLabel(game) {
  if (!game?.opponent) return null
  return `${game.home ? 'vs' : '@'} ${game.opponent}`
}
