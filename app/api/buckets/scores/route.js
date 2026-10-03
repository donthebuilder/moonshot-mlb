// GET /api/buckets/scores?date=YYYY-MM-DD -- a day's games (ESPN scoreboard), gated.
import { scoreboardFor, reduceScoreboard } from '../../../../lib/nba/api'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('scores', async (q) => {
  const date = q.get('date') || easternToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date))
  return ok({ date, games, live: games.filter((g) => g.state === 'live').length, fetchedAt: new Date().toISOString() }, 15)
})
