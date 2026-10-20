// GET /api/nfl/awards -- TUDDY's award races (lib/nfl/awards.js): MVP, OPOY, DPOY, OROY and DROY, in the shared award-race file
// shape (lib/awards.js) the Home panel draws. Built at most every six hours per day.
import { readAwardRaces } from '../../../../lib/nfl/awards'
import { seasonFor } from '../../../../lib/nfl/titleSim'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET() {
  try {
    const day = easternToday()
    return Response.json(await readAwardRaces(seasonFor(day), day), { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } })
  } catch (e) {
    console.error(`[tuddy awards] ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'the stats feed is not answering' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
