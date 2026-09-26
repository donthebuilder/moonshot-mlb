// LAMP · NUMEROLOGY — GET /api/lamp/numerology?date=YYYY-MM-DD
//
// For fun: tonight's dressed skaters whose jersey, birth day or life path
// reduces to the night's own number (lib/nhl/numerology.js), with the count
// chance alone would give beside it. Not a prediction, not graded, never in
// the score.
import { easternToday } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { readNumerology } from '../../../../lib/nhl/numerology'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const date = new URL(request.url).searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    return ok({ ...(await readNumerology(date)), fetchedAt: new Date().toISOString() }, 300)
  } catch (e) {
    return delayed(`numerology ${date}`, e)
  }
}
