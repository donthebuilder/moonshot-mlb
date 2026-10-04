// GET /api/buckets/scores?date=YYYY-MM-DD -- a day's games (ESPN scoreboard), gated.
import { scoreboardFor, reduceScoreboard } from '../../../../lib/nba/api'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('scores', async (q) => {
  // the slate still being played, not the ET calendar day (2026-10-04 day rule; LAMP 3bde1ca)
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date))
  return ok({ date, games, live: games.filter((g) => g.state === 'live').length, fetchedAt: new Date().toISOString() }, 15)
})
