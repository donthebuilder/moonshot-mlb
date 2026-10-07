// GET /api/buckets/player?id=ESPN athlete id -- one player: the card, this season
// and last season's lines, the game log, his shots on the floor (buckets_shots,
// packed [x, y, made, three, gameId]), and the model's rows on him. Gated.
import { athleteFor, birthDateFor, reduceAthlete, gamelogFor, reduceGamelog, teamScheduleFor, reduceTeamSchedule } from '../../../../lib/nba/api'
import { nbaTeam } from '../../../../lib/nba/teams'
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { LIVE_VERSIONS } from '../../../../lib/nba/model'
import { projectFromLog, oppAllowance } from '../../../../lib/nba/expectedRead'
import { dayOf } from '../../../../lib/nba/splits'

const real = (log) => log.filter((g) => g.seasonType === 2 || g.seasonType === 3)

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
  const [card0, birthDate, logCur, logPrev, sCur, sPrev, shots, calls] = await Promise.all([
    athleteFor(id).then(reduceAthlete),
    birthDateFor(id),
    // regular season + playoffs only, as lib/nba/hot.js reads: preseason games are not his "last games"
    gamelogFor(id, sn.cur).then(reduceGamelog).then(real).catch(() => []),
    gamelogFor(id, sn.prev).then(reduceGamelog).then(real).catch(() => []),
    seasonStats(sn.cur), seasonStats(sn.prev),
    db ? shotsOf(db, id) : { data: [] },
    db ? db.from('buckets_log').select('game_date, market, status, role, score, hit, actual, opp, void_reason').in('model_version', LIVE_VERSIONS).eq('player_id', id).order('game_date', { ascending: false }).limit(200) : { data: [] },
  ])
  const card = card0 ? { ...card0, birthDate } : card0
  // his club's schedule, both seasons: the next game (any season type) for "his games against them", and every FINAL
  // game the club played, by ET day, for the rest-days split (a game he sat out still counts as a day the club played)
  const club = nbaTeam(card?.team)
  const [schedCur, schedPrev] = club ? await Promise.all([sn.cur, sn.prev].map((y) => teamScheduleFor(club.id, y).then((j) => reduceTeamSchedule(j, club.abbrev)).catch(() => null))) : [null, null]
  const nextGame = (schedCur || []).find((g) => g.state !== 'final') || null
  const clubGames = Object.fromEntries([[sn.cur, schedCur], [sn.prev, schedPrev]].filter(([, v]) => v).map(([y, v]) => [y, v.filter((g) => g.state === 'final').map((g) => ({ id: g.id, date: dayOf(g.start) }))]))
  const tag = (log, s) => log.map((g) => ({ ...g, s }))
  // PROJECTED POINTS for his next game (lib/nba/expectedPoints.js), from the same games the page shows
  const proj = nextGame ? projectFromLog([...logCur, ...logPrev], oppAllowance(sCur, sPrev, nextGame.opp)) : null
  return ok({
    nextGame: nextGame ? { id: nextGame.id, start: nextGame.start, opp: nextGame.opp, home: nextGame.home, seasonType: nextGame.seasonType } : null,
    card, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale,
    lines: { cur: sCur.athletes.get(id) || null, prev: sPrev.athletes.get(id) || null, curLabel: seasonLabel(sn.cur), prevLabel: seasonLabel(sn.prev) },
    // BOTH SEASONS, each game tagged `s` (ESPN's year), for the season toggle and the splits; `log` stays the one the page opens on
    logs: [...tag(logCur, sn.cur), ...tag(logPrev, sn.prev)], clubGames, nowSeason: sn.cur, seasonYears: { cur: seasonLabel(sn.cur), prev: seasonLabel(sn.prev) },
    xpts: proj?.ok ? { xpts: Math.round(proj.xpts * 10) / 10, minRecent: Math.round(proj.minRecent * 10) / 10, rate: Math.round(proj.rate * 1000) / 1000, oppFactor: Math.round(proj.oppFactor * 1000) / 1000, oppKnown: proj.oppKnown, n: proj.n, line: proj.line, opp: nextGame.opp, start: nextGame.start } : (proj ? { xpts: null, reason: proj.reason } : null),
    log: logCur.length ? logCur : logPrev, logSeason: logCur.length ? seasonLabel(sn.cur) : seasonLabel(sn.prev),
    shots: (shots.error ? [] : shots.data || []).map((s) => [s.x, s.y, s.made ? 1 : 0, s.three ? 1 : 0, s.game_id]),
    shotsFrom: shots.data?.length ? shots.data[shots.data.length - 1].game_date : null,
    calls: calls.error ? [] : calls.data || [],
    fetchedAt: new Date().toISOString(),
  }, 600)
})
