// GET /api/buckets/teammodel?date=YYYY-MM-DD -- BUCKETS' TEAM MODEL: expected points for each game of a day
// (lib/nba/teamModelRead.js): each club's points scored and allowed a game, shrunk toward last season early in
// the year, home court and the back-to-back. A measured projection of a box-score count, not a probability;
// ESPN reads only, nothing stored. Gated.
import { teamModelRows } from '../../../../lib/nba/teamModelRead'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('teammodel', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok({ ...(await teamModelRows(date)), fetchedAt: new Date().toISOString() }, 900)
})
