// Shared current-week resolver for Franchise.
// Team, Coach and Matchup MUST agree on the week or lineups get written for a
// week nobody scores. Mirrors the logic that previously lived only in
// app/fantasy/league/[leagueId]/matchup/page.js.

export const FANTASY_SEASON = 2026
export const FANTASY_LAST_WEEK = 14

export function normalizeWeek(value) {
  const week = Number(value)
  if (!Number.isInteger(week)) return null
  if (week < 1 || week > FANTASY_LAST_WEEK) return null
  return week
}

export async function resolveFantasyWeek(supabase, requested, season = FANTASY_SEASON) {
  const explicit = normalizeWeek(requested)
  if (explicit) return explicit
  if (!supabase) return 1
  // REGULAR SEASON ONLY. Preseason weeks are numbered 1, 2 and 3 as well, and
  // those rows are in this table -- so without this predicate a preseason game
  // the bot last saw in progress and never republished as final wins the
  // `status === 'live'` search below and pins every Franchise page to a
  // preseason week for the rest of the year. Nothing would have looked broken;
  // the week number would simply have been wrong everywhere at once.
  const { data } = await supabase
    .from('nfl_week_games')
    .select('week,kickoff,status')
    .eq('season', season)
    .eq('season_type', 2)
    .lte('week', FANTASY_LAST_WEEK)
    .order('kickoff')
  const games = data || []
  const live = games.find((game) => game.status === 'live')
  const next = games.find((game) => game.status === 'scheduled' && new Date(game.kickoff).getTime() >= Date.now())
  return normalizeWeek(live?.week || next?.week || games.at(-1)?.week) || 1
}
