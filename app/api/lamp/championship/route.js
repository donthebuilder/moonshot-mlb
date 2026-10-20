// GET /api/lamp/championship -- LAMP's Stanley Cup odds (lib/nhl/titleSim.js), in the shared championship file shape (lib/championship.js),
// so the Cup odds panel draws it as it draws MOONSHOT's October odds. Built at most every six hours per day.
import { ok, delayed } from '../../../../lib/nhl/respond'
import { readTitleOdds, seasonIdFor } from '../../../../lib/nhl/titleSim'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET() {
  try {
    const day = easternToday()
    return ok(await readTitleOdds(seasonIdFor(day), day), 1800)
  } catch (e) {
    return delayed('championship', e)
  }
}
