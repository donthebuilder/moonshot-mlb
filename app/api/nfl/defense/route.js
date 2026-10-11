// GET /api/nfl/defense                      -> the league's offensive turnover lines (what the Fumble-prone and
//                                              Interception-prone tags read), this season, finished games only
// GET /api/nfl/defense?team=ATL[,DAL]       -> those clubs' DEFENDERS: season sums and a game log per man
//
// Read-only. ESPN's public box scores (site.web.api.espn.com, the host lib/nfl/liveSlate.js uses), summed over the
// season's FINISHED games by lib/nfl/defStats.js. No table, no cron, no write: lib/nfl/defenseFeed.js caches each
// finished game for a day in Next's data cache and the answer for six hours at the edge. A pull that could not read
// every finished game says so (`partial: true`, `missing: N`); it is never presented as a whole season.
import { loadSeasonBook } from '../../../../lib/nfl/defenseFeed'
import { turnoverPlayers, defenderPlayers } from '../../../../lib/nfl/defStats'
import { leagueRates } from '../../../../lib/nfl/tags'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CODE = /^[A-Z0-9]{2,4}$/

export async function GET(request) {
  const q = new URL(request.url).searchParams
  // no season = the one ESPN is in now (lib/nfl/defenseFeed.js reads it off the dateless scoreboard)
  const asked = q.get('season')
  const season = asked == null || asked === '' ? null : Number(asked)
  if (season != null && (!Number.isInteger(season) || season < 2020 || season > 2100)) return Response.json({ error: 'season' }, { status: 400 })
  const teams = String(q.get('team') || '').toUpperCase().split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4)
  if (teams.some((t) => !CODE.test(t))) return Response.json({ error: 'team' }, { status: 400 })
  const got = await loadSeasonBook({ season })
  if (!got) return Response.json({ available: false, season, note: 'ESPN schedule unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const meta = { available: true, season: got.season, through_week: got.week, games: got.read, expected: got.expected, partial: got.partial, missing: got.missing, source: 'ESPN box scores, finished games' }
  // a partial pull is not cached for long: the next visit tries again
  const cache = got.partial ? 'public, s-maxage=120, stale-while-revalidate=600' : 'public, s-maxage=21600, stale-while-revalidate=86400'
  if (teams.length) {
    return Response.json({ ...meta, teams, team_games: Object.fromEntries(teams.map((t) => [t, got.teamGames[t] ?? null])), players: defenderPlayers(got.book, teams) }, { headers: { 'Cache-Control': cache } })
  }
  const players = turnoverPlayers(got.book)
  return Response.json({ ...meta, team_games: got.teamGames, league: leagueRates(Object.values(players)), players }, { headers: { 'Cache-Control': cache } })
}
