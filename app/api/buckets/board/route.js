// GET /api/buckets/board?date&market=pts|reb|ast|3pm|pra|first -- the board, gated.
import { readNbaBoard } from '../../../../lib/nba/boardRead'
import { NBA_MARKETS } from '../../../../lib/nba/model'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('board', async (q) => {
  // the slate still being played, not the ET calendar day (2026-10-04 day rule; LAMP 3bde1ca)
  const date = q.get('date') || await slateNight('nba')
  const market = q.get('market') || 'pts'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  if (!NBA_MARKETS[market]) return bad(`market must be one of ${Object.keys(NBA_MARKETS).join(', ')}`)
  return ok(await readNbaBoard(date, market), 60)
})
