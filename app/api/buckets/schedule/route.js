// GET /api/buckets/schedule?date=YYYY-MM-DD -- seven days of NBA games from
// that day (default the slate still being played, lib/slateNight), gated. Seven reads of the same ESPN scoreboard
// /api/buckets/scores makes, each cached by lib/nba/api.js, so a week costs
// what seven day-pages would and no more. The prev / next week's first day ride along.
import { scoreboardFor, reduceScoreboard } from '../../../../lib/nba/api'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { shiftDay } from '../../../../lib/data'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('schedule', async (q) => {
  const start = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return bad('date must be YYYY-MM-DD')
  const dates = Array.from({ length: 7 }, (_, i) => shiftDay(start, i))
  const days = await Promise.all(dates.map(async (date) => ({ date, games: reduceScoreboard(await scoreboardFor(date)) })))
  return ok({ start, days, prevStart: shiftDay(start, -7), nextStart: shiftDay(start, 7), fetchedAt: new Date().toISOString() }, 300)
})
