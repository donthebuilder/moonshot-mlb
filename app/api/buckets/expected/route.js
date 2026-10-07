// GET /api/buckets/expected?date=YYYY-MM-DD -- BUCKETS' PROJECTED POINTS for a day's rotation players
// (lib/nba/expectedRead.js): recent minutes x per-minute rate (pulled toward his season) x the opponent's
// real points allowed. A measured projection of a box-score count, not a probability; ESPN reads only,
// nothing stored. Gated.
import { expectedRows } from '../../../../lib/nba/expectedRead'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('expected', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok({ ...(await expectedRows(date)), fetchedAt: new Date().toISOString() }, 900)
})
