// GET /api/buckets/player?id=ESPN athlete id -- one player: the card, this season
// and last season's lines, the game log, his shots on the floor (buckets_shots,
// packed [x, y, made, three, gameId]), and the model's rows on him. Gated.
import { athleteFor, reduceAthlete, gamelogFor, reduceGamelog, teamScheduleFor, reduceTeamSchedule } from '../../../../lib/nba/api'
import { nbaTeam } from '../../../../lib/nba/teams'
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { LIVE_VERSIONS } from '../../../../lib/nba/model'

export const dynamic = 'force-dynamic'
// Supabase answers at most 1,000 rows a read: page through (Doncic 2025-26 has 1,460)
async function shotsOf(db, id) {
  const data = []
  for (let from = 0; from < 8000; from += 1000) {
    const r = await db.from('buckets_shots').select('x, y, made, three, game_id, game_date').eq('player_id', id).order('game_date', { ascending: false }).order('event_id').range(from, from + 999)
    if (r.error) return { data, error: r.error }
    data.push(...r.data)
    if (r.data.length < 1000) break
  }
  return { data, error: null }
}
export const GET = bucketsRoute('player', async (q) => {
  const id = q.get('id') || ''
  if (!/^\d{2,10}$/.test(id)) return bad('id must be an ESPN athlete id')
  const sn = await nbaSeason()
  const db = adminClient()
  const [card, logCur, logPrev, sCur, sPrev, shots, calls] = await Promise.all([
    athleteFor(id).then(reduceAthlete),
    gamelogFor(id, sn.cur).then(reduceGamelog).catch(() => []),
    gamelogFor(id, sn.prev).then(reduceGamelog).catch(() => []),
    seasonStats(sn.cur), seasonStats(sn.prev),
    db ? shotsOf(db, id) : { data: [] },
    db ? db.from('buckets_log').select('game_date, market, status, role, score, hit, actual, opp').in('model_version', LIVE_VERSIONS).eq('player_id', id).order('game_date', { ascending: false }).limit(200) : { data: [] },
  ])
  // his club's next game (any season type), for "his games against them"
  const club = nbaTeam(card?.team)
  const sched = club ? await teamScheduleFor(club.id, sn.cur).then((j) => reduceTeamSchedule(j, club.abbrev)).catch(() => []) : []
  const nextGame = sched.find((g) => g.state !== 'final') || null
  return ok({
    nextGame: nextGame ? { id: nextGame.id, start: nextGame.start, opp: nextGame.opp, home: nextGame.home, seasonType: nextGame.seasonType } : null,
    card, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale,
    lines: { cur: sCur.athletes.get(id) || null, prev: sPrev.athletes.get(id) || null, curLabel: seasonLabel(sn.cur), prevLabel: seasonLabel(sn.prev) },
    log: logCur.length ? logCur : logPrev, logSeason: logCur.length ? seasonLabel(sn.cur) : seasonLabel(sn.prev),
    shots: (shots.error ? [] : shots.data || []).map((s) => [s.x, s.y, s.made ? 1 : 0, s.three ? 1 : 0, s.game_id]),
    shotsFrom: shots.data?.length ? shots.data[shots.data.length - 1].game_date : null,
    calls: calls.error ? [] : calls.data || [],
    fetchedAt: new Date().toISOString(),
  }, 600)
})
