// GET /api/buckets/hot?date=YYYY-MM-DD -- HOT HANDS (LAMP's Hot sticks, the NBA
// way), computed once per day by lib/nba/hot.js (shared with the story
// engine): the rotation players in that day's games, last 5 / last 10 beside
// the season, from each player's own ESPN game log -- ESPN, not Supabase.
// Regular season and playoffs only; last season's logs until this one has
// games, said so. Gated.
import { hotRows } from '../../../../lib/nba/hot'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('hot', async (q) => {
  const date = q.get('date') || easternToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok({ ...(await hotRows(date)), fetchedAt: new Date().toISOString() }, 900)
})
