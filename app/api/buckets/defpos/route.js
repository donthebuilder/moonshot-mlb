// GET /api/buckets/defpos?date=YYYY-MM-DD -- what each club gave up a game to guards / forwards / centers over its
// last 5, last 10 and the season, each with its rank of 30 (1 = gave up the most), plus that day's games.
// lib/nba/defPos.js; this season once every club has 5 games, else last season (said so). Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { scoreboardFor, reduceScoreboard } from '../../../../lib/nba/api'
import { readDefPos } from '../../../../lib/nba/defPosRead'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('defpos', async (q) => {
  const db = adminClient()
  if (!db) return bad('no database')
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const [d, board] = await Promise.all([readDefPos(db), scoreboardFor(date)])
  return ok({ date, season: d.season, seasonLabel: d.seasonLabel, stale: d.stale, byPos: d.ranked, games: reduceScoreboard(board) }, 900)
})
