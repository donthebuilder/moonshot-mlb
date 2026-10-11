// TUDDY · TEAM -- GET /api/nfl/team?team=BUF
// The club's season schedule and results, the stored Top Totals row of each game and the touchdowns its players
// scored with what the board said before each (lib/nfl/teamGames.js). The week file, the matchup file, standings and
// the graded weeks are read in the browser, as every other TUDDY page does. Cached ten minutes at the edge.
import { readNflTeam } from '../../../../lib/nfl/teamGames'
import { NFL_TEAMS } from '../../../../lib/nfl/teams'

export const dynamic = 'force-dynamic'
const CODES = new Set(NFL_TEAMS.map((t) => t[0]))

export async function GET(request) {
  const team = String(new URL(request.url).searchParams.get('team') || '').toUpperCase()
  if (!CODES.has(team)) return Response.json({ error: 'BAD REQUEST', detail: 'team must be one of the 32 NFL abbreviations' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  try {
    return Response.json(await readNflTeam(team), { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } })
  } catch (e) {
    console.error(`[tuddy team] ${team}: ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'the club feed is not answering' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
