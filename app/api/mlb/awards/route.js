// GET /api/mlb/awards -- MOONSHOT's award races (lib/mlb/awards.js): MVP, Cy Young and ROY, AL and NL, in the shared
// award-race file shape (lib/awards.js) Leaders draws. Public and read-only; built at most every six hours a day.
import { readAwardRaces, awardSeason } from '../../../../lib/mlb/awards'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }

export async function GET() {
  const day = easternToday()
  try {
    return Response.json(await readAwardRaces(awardSeason(day), day), { headers: CACHE })
  } catch (e) {
    return Response.json({ error: 'awards', races: [] }, { status: 502 })
  }
}
