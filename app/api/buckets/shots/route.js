// GET /api/buckets/shots?team=BOS | ?player=id [&season=2026] -- every field-goal
// attempt on file (buckets_shots: last season's backfill + this season's grades),
// packed by lib/nba/shots.js packShots: [x, y, made, three, game index, period, clock] + games [[id, date]]. Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { packShots } from '../../../../lib/nba/shots'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('shots', async (q) => {
  const db = adminClient()
  if (!db) return bad('no database')
  const team = q.get('team') ? nbaTeam(q.get('team')) : null
  const player = q.get('player')
  if (!team && !/^\d{2,10}$/.test(player || '')) return bad('team=CODE or player=id')
  const season = /^\d{4}$/.test(q.get('season') || '') ? Number(q.get('season')) : null
  // preseason is not a record (excluded unless ?pre=1): its game ids come out of buckets_games
  let skip = []
  if (q.get('pre') !== '1') {
    const pre = await db.from('buckets_games').select('game_id').eq('season_type', 1)
    if (pre.error) return bad(pre.error.message)
    skip = [...new Set((pre.data || []).map((r) => String(r.game_id)))].filter((x) => /^\d+$/.test(x))
  }
  // a fresh query per page, in a total order, so pages neither repeat nor skip. FIVE AT A TIME (2026-10-20: one after
  // another a club's 7,000+ attempts were 8 round trips, ~6.5 s on the Shot map); a short page ends the read.
  const page = (from) => {
    let qy = db.from('buckets_shots').select('x, y, made, three, game_id, game_date, period, clock')
    qy = team ? qy.eq('team_id', team.id) : qy.eq('player_id', player)
    if (skip.length) qy = qy.not('game_id', 'in', `(${skip.join(',')})`)
    if (season) qy = qy.gte('game_date', `${season - 1}-09-01`).lt('game_date', `${season}-09-01`)
    return qy.order('game_id').order('event_id').range(from, from + 999)
  }
  const rows = []
  const WAVE = 5
  read: for (let from = 0; from < 20000; from += 1000 * WAVE) {
    const wave = await Promise.all(Array.from({ length: WAVE }, (_, i) => page(from + i * 1000)))
    for (const { data, error } of wave) {
      if (error) return bad(error.message)
      rows.push(...data)
      if (data.length < 1000) break read
    }
  }
  // shots change only when a game is graded (a few a night): a 3-hour edge cache, served stale while it refreshes
  return ok({ team: team?.abbrev || null, player: player || null, season, ...packShots(rows) }, 10800)
})
