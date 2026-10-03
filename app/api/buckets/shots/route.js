// GET /api/buckets/shots?team=BOS | ?player=id [&season=2026] -- every field-goal
// attempt on file (buckets_shots: last season's backfill + this season's grades),
// packed [x, y, made, three]. Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('shots', async (q) => {
  const db = adminClient()
  if (!db) return bad('no database')
  const team = q.get('team') ? nbaTeam(q.get('team')) : null
  const player = q.get('player')
  if (!team && !/^\d{2,10}$/.test(player || '')) return bad('team=CODE or player=id')
  const season = /^\d{4}$/.test(q.get('season') || '') ? Number(q.get('season')) : null
  // a fresh query per page, in a total order, so pages neither repeat nor skip
  const page = (from) => {
    let qy = db.from('buckets_shots').select('x, y, made, three')
    qy = team ? qy.eq('team_id', team.id) : qy.eq('player_id', player)
    if (season) qy = qy.gte('game_date', `${season - 1}-09-01`).lt('game_date', `${season}-09-01`)
    return qy.order('game_id').order('event_id').range(from, from + 999)
  }
  const rows = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await page(from)
    if (error) return bad(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return ok({ team: team?.abbrev || null, player: player || null, season, shots: rows.map((s) => [s.x, s.y, s.made ? 1 : 0, s.three ? 1 : 0]) }, 3600)
})
