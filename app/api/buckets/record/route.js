// GET /api/buckets/record?days=60 -- every graded night: per market, the calls
// and how many hit, plus every scorer of 25+ and where the board had him.
// Regular season only unless ?pre=1. Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday, shiftDay } from '../../../../lib/data'
import { LIVE_VERSIONS } from '../../../../lib/nba/model'
import { foldBucketsNights, NBA_MIN_NIGHTS } from '../../../../lib/record/nbaFloor'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('record', async (q) => {
  const db = adminClient()
  const days = Math.min(200, Math.max(1, Number(q.get('days')) || 60))
  const pre = q.get('pre') === '1'
  const since = shiftDay(easternToday(), -days)
  if (!db) return ok({ dbReady: false, nights: [] }, 60)
  const rows = []
  for (let from = 0; from < 100000; from += 1000) {
    let qy = db.from('buckets_log').select('game_date, game_id, player_id, name, team, opp, market, status, role, score, rank_in_game, actual, hit, season_type').in('model_version', LIVE_VERSIONS).gte('game_date', since).not('graded_at', 'is', null)
    if (!pre) qy = qy.neq('season_type', 1)
    const { data, error } = await qy.order('game_date').order('game_id').order('player_id').order('market').range(from, from + 999)
    if (error) return ok({ dbReady: false, nights: [], note: error.message }, 60)
    rows.push(...data)
    if (data.length < 1000) break
  }
  // THE PUBLIC-NUMBER FLOOR (lib/record/nbaFloor.js foldBucketsNights): a market with fewer than NBA_MIN_NIGHTS graded REGULAR-SEASON nights is
  // TRACKING -- its calls are counted (n) but its hits, its "called that hit" rows and (points) the 25-point scorers it missed are
  // not sent, preseason included. This holds when BUCKETS is public: the number is simply not made.
  const { nights, tracking } = foldBucketsNights(rows)
  return ok({ dbReady: true, since, minNights: NBA_MIN_NIGHTS, tracking, nights, fetchedAt: new Date().toISOString() }, 300)
})
