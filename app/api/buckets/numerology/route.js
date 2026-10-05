// GET /api/buckets/numerology?date=YYYY-MM-DD -- BUCKETS' numerology (LAMP's
// /api/lamp/numerology, basketball's): the night's players whose jersey, birth
// day or life path reduces to the date's own number (lib/nba/numerology.js),
// with the count chance alone would give beside it. For fun: not a
// prediction, not graded, never in the score. Gated.
import { readNbaNumerology } from '../../../../lib/nba/numerology'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = bucketsRoute('numerology', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok({ ...(await readNbaNumerology(date)), fetchedAt: new Date().toISOString() }, 300)
})
