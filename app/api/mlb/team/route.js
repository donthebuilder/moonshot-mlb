// MOONSHOT · TEAM -- GET /api/mlb/team?team=NYY
// The club's standing and record splits, season schedule, league ranks, ESPN + MLB team splits, ballpark roof and surface,
// the next game's starters, our locked home-run calls on its hitters and the stored Top Totals row (lib/mlb/teamRead.js).
// The board's hitters ride the page's own slate; this adds what it could not show. Cached ten minutes at the edge; the
// splits feeds are held six hours upstream. No cron.
import { readMlbTeam } from '../../../../lib/mlb/teamRead'
import { teamKey, isKnownTeam } from '../../../../lib/mlbTeams'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('team')
  const team = teamKey(raw)
  if (!team || !isKnownTeam(team)) return Response.json({ error: 'BAD REQUEST', detail: 'team must be one of the 30 MLB clubs' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  try {
    return Response.json(await readMlbTeam(team), { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } })
  } catch (e) {
    console.error(`[mlb team] ${team}: ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'the club feed is not answering' }, { status: e?.status === 400 ? 400 : 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
