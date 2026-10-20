// GET /api/buckets/championship -- BUCKETS' title odds (lib/nba/titleSim.js), in the shared championship file shape (lib/championship.js),
// so the Title odds panel draws it as it draws MOONSHOT's October odds. Gated with every BUCKETS route; built at most every six hours.
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { readTitleOdds } from '../../../../lib/nba/titleSim'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('championship', async () => {
  const day = easternToday()
  const [y, m] = day.split('-').map(Number)
  const season = m >= 8 ? y + 1 : y   // the season's end year: 2026-27 is 2027
  return ok(await readTitleOdds(season, day), 1800)
})
