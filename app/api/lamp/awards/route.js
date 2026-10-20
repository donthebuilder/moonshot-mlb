// GET /api/lamp/awards -- LAMP's award races (lib/nhl/awards.js): Hart, Vezina, Norris and Calder, in the shared award-race
// file shape (lib/awards.js) the Home panel draws. Built at most every six hours per day.
import { ok, delayed } from '../../../../lib/nhl/respond'
import { readAwardRaces } from '../../../../lib/nhl/awards'
import { seasonIdFor } from '../../../../lib/nhl/titleSim'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET() {
  try {
    const day = easternToday()
    return ok(await readAwardRaces(seasonIdFor(day), day), 1800)
  } catch (e) {
    return delayed('awards', e)
  }
}
