// THE LEAGUE TABLE THE MLB TEAM MODEL READS, FOR THE SERVER (lib/teamHr.js clubTable; the browser twin is lib/clubHr.js). Server only: the share card of a game
// (lib/cards/shareData.js) prints the model's expected home runs for each club, so it needs the same table the page reads. Kept ten minutes per instance;
// null when StatsAPI is down or the table is not whole, and the card then draws no expected band (a number is never guessed).
import { clubTable } from './teamHr'
import { teamAbbrs, seasonYear } from './gamelogs'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
let _hit = null

export async function mlbClubTable() {
  if (_hit && Date.now() - _hit.at < 10 * 60e3) return _hit.table
  const [j, abbrs] = await Promise.all([
    fetch(`${MLB_API}/teams/stats?season=${seasonYear()}&group=hitting&stats=season&sportIds=1&fields=stats,splits,team,id,stat,homeRuns,plateAppearances,gamesPlayed`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    teamAbbrs().catch(() => null),
  ])
  const table = clubTable(j?.stats?.[0]?.splits || [], abbrs || {})
  if (table) _hit = { at: Date.now(), table }
  return table || _hit?.table || null
}
