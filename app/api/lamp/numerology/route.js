// LAMP · NUMEROLOGY — GET /api/lamp/numerology?date=YYYY-MM-DD
//
// For fun: tonight's dressed skaters whose jersey, birth day or life path
// reduces to the night's own number (lib/nhl/numerology.js), with the count
// chance alone would give beside it. Not a prediction, not graded, never in
// the score.
import { slateNight } from '../../../../lib/slateNight'
import { validDate } from '../../../../lib/nhl/api'
import { readNumerology } from '../../../../lib/nhl/numerology'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const date = q.get('date') || await slateNight('nhl')
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    // ?preview=1 is the Numerology page's read: a game with no lineup yet shows its rosters (marked there), as BUCKETS does. Home and
    // the Ledger read without it -- dressed skaters only, as before -- because they don't mark a roster row (PR review 2026-10-21:
    // scratched / IR men were in Home's aligned list, unmarked). The record never previews.
    return ok({ ...(await readNumerology(date, { rosterPreview: q.get('preview') === '1' })), fetchedAt: new Date().toISOString() }, 300)
  } catch (e) {
    return delayed(`numerology ${date}`, e)
  }
}
