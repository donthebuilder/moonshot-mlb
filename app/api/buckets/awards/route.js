// GET /api/buckets/awards -- BUCKETS' award races (lib/nba/awards.js): MVP, DPOY, ROY, MIP and Finals MVP, in the shared
// award-race file shape (lib/awards.js) the Home panel draws. Gated with every BUCKETS route; built at most every six hours.
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { readAwardRaces } from '../../../../lib/nba/awards'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('awards', async () => {
  const day = easternToday()
  const [y, m] = day.split('-').map(Number)
  const season = m >= 8 ? y + 1 : y   // the season's end year: 2026-27 is 2027
  return ok(await readAwardRaces(season, day), 1800)
})
