// GET /api/nfl/championship -- TUDDY's Super Bowl odds (lib/nfl/titleSim.js), in the shared championship file shape (lib/championship.js),
// so the Super Bowl odds panel draws it as it draws MOONSHOT's October odds. Built at most every six hours per day.
import { readTitleOdds, seasonFor } from '../../../../lib/nfl/titleSim'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET() {
  try {
    const day = easternToday()
    return Response.json(await readTitleOdds(seasonFor(day), day), { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } })
  } catch (e) {
    console.error(`[tuddy championship] ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'the league feed is not answering' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
