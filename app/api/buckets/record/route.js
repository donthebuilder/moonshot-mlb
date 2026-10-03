// GET /api/buckets/record?days=60 -- every graded night: per market, the calls
// and how many hit, plus every scorer of 25+ and where the board had him.
// Regular season only unless ?pre=1. Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday, shiftDay } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('record', async (q) => {
  const db = adminClient()
  const days = Math.min(200, Math.max(1, Number(q.get('days')) || 60))
  const pre = q.get('pre') === '1'
  const since = shiftDay(easternToday(), -days)
  if (!db) return ok({ dbReady: false, nights: [] }, 60)
  const rows = []
  for (let from = 0; from < 100000; from += 1000) {
    let qy = db.from('buckets_log').select('game_date, game_id, player_id, name, team, opp, market, status, role, score, rank_in_game, actual, hit, season_type').gte('game_date', since).not('graded_at', 'is', null)
    if (!pre) qy = qy.neq('season_type', 1)
    const { data, error } = await qy.order('game_date').order('game_id').order('player_id').order('market').range(from, from + 999)
    if (error) return ok({ dbReady: false, nights: [], note: error.message }, 60)
    rows.push(...data)
    if (data.length < 1000) break
  }
  const by = new Map()
  for (const r of rows) {
    const n = by.get(r.game_date) || { date: r.game_date, markets: {}, called: [], away: [] }
    const m = n.markets[r.market] ||= { n: 0, hit: 0 }
    if (r.status === 'called' && r.hit != null) { m.n += 1; if (r.hit) m.hit += 1; if (r.hit) n.called.push(r) }
    if (r.market === 'pts' && r.hit === true && r.status !== 'called') n.away.push(r)
    by.set(r.game_date, n)
  }
  return ok({ dbReady: true, since, nights: [...by.values()].sort((a, b) => a.date.localeCompare(b.date)), fetchedAt: new Date().toISOString() }, 300)
})
