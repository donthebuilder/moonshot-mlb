// GET /api/buckets/player?id=ESPN athlete id -- one player: the card, this season
// and last season's lines, the game log, his shots on the floor (buckets_shots,
// packed [x, y, made, three, gameId]), and the model's rows on him. Gated.
import { pos5For } from '../../../../lib/nba/depth'
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
// PRESEASON IS NOT A RECORD (2026-10-20, as /api/buckets/shots): his shots from preseason games (buckets_games season_type 1) are left out
async function shotsOf(db, id) {
  const pre = await db.from('buckets_games').select('game_id').eq('season_type', 1)
  if (pre.error) return { data: [], error: pre.error }
  const skip = [...new Set((pre.data || []).map((r) => String(r.game_id)))].filter((x) => /^\d+$/.test(x))
  const data = []
  for (let from = 0; from < 8000; from += 1000) {
    let qy = db.from('buckets_shots').select('x, y, made, three, game_id, game_date, period').eq('player_id', id)
    if (skip.length) qy = qy.not('game_id', 'in', `(${skip.join(',')})`)
    const r = await qy.order('game_date', { ascending: false }).order('game_id').order('event_id').range(from, from + 999)
    if (r.error) return { data, error: r.error }
    data.push(...r.data)
    if (r.data.length < 1000) break
  }
  return { data, error: null }
}
import { packShots } from '../../../../lib/nba/shots'
import { readNbaFloor, trackingOf } from '../../../../lib/record/nbaFloorRead'
export const GET = bucketsRoute('player', async (q) => {
  const id = q.get('id') || ''
  if (!/^\d{2,10}$/.test(id)) return bad('id must be an ESPN athlete id')
  const sn = await nbaSeason()
  const db = adminClient()
  const [card0, birthDate, logCur, logPrev, sCur, sPrev, shots, calls, qrows] = await Promise.all([
    athleteFor(id).then(reduceAthlete),
    birthDateFor(id),
    // regular season + playoffs only, as lib/nba/hot.js reads: preseason games are not his "last games"
    gamelogFor(id, sn.cur).then(reduceGamelog).then(real).catch(() => []),
    gamelogFor(id, sn.prev).then(reduceGamelog).then(real).catch(() => []),
    seasonStats(sn.cur), seasonStats(sn.prev),
    db ? shotsOf(db, id) : { data: [] },
    db ? db.from('buckets_log').select('game_id, game_date, market, model_version, status, role, score, hit, actual, opp, void_reason, season_type').in('model_version', LIVE_VERSIONS).eq('player_id', id).order('game_date', { ascending: false }).limit(200) : { data: [] },
    // QUARTER SPLITS (lib/nba/quarters.js, buckets_quarters): his period lines, both seasons, for the bars' Q1..2H chips
    db ? db.from('buckets_quarters').select('game_id, period, pts, reb, ast, tpm, tpa').eq('player_id', id).order('game_date', { ascending: false }).limit(1500) : { data: [] },
  ])
  const card = card0 ? { ...card0, birthDate } : card0
  const floor = db ? await readNbaFloor(db).catch(() => null) : null
  // his club's schedule, both seasons: the next game (any season type) for "his games against them", and every FINAL
  // game the club played, by ET day, for the rest-days split (a game he sat out still counts as a day the club played)
  const club = nbaTeam(card?.team)
  const [schedCur, schedPrev, depth] = club ? await Promise.all([...[sn.cur, sn.prev].map((y) => teamScheduleFor(club.id, y).then((j) => reduceTeamSchedule(j, club.abbrev)).catch(() => null)), pos5For(club.abbrev)]) : [null, null, null]
  // his depth-chart slot today (lib/nba/depth.js), for the five-position defence table; null when the chart doesn't list him
  if (card) card.pos5 = depth?.get(String(id)) || null
  const nextGame = (schedCur || []).find((g) => g.state !== 'final') || null
  const clubGames = Object.fromEntries([[sn.cur, schedCur], [sn.prev, schedPrev]].filter(([, v]) => v).map(([y, v]) => [y, v.filter((g) => g.state === 'final').map((g) => ({ id: g.id, date: dayOf(g.start) }))]))
  const tag = (log, s) => log.map((g) => ({ ...g, s }))
  // PROJECTED POINTS for his next game (lib/nba/expectedPoints.js), from the same games the page shows
  const proj = nextGame ? projectFromLog([...logCur, ...logPrev], oppAllowance(sCur, sPrev, nextGame.opp)) : null
  // a failed read is a failure (audit 2026-10-20), not a player with no shots and no record
  if (shots.error || calls.error) throw new Error((shots.error || calls.error).message)
  return ok({
    nextGame: nextGame ? { id: nextGame.id, start: nextGame.start, opp: nextGame.opp, home: nextGame.home, seasonType: nextGame.seasonType } : null,
    card, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale,
    lines: { cur: sCur.athletes.get(id) || null, prev: sPrev.athletes.get(id) || null, curLabel: seasonLabel(sn.cur), prevLabel: seasonLabel(sn.prev) },
    // BOTH SEASONS, each game tagged `s` (ESPN's year), for the season toggle and the splits; `log` stays the one the page opens on
    logs: [...tag(logCur, sn.cur), ...tag(logPrev, sn.prev)], clubGames, nowSeason: sn.cur, seasonYears: { cur: seasonLabel(sn.cur), prev: seasonLabel(sn.prev) },
    xpts: proj?.ok ? { xpts: Math.round(proj.xpts * 10) / 10, minRecent: Math.round(proj.minRecent * 10) / 10, rate: Math.round(proj.rate * 1000) / 1000, oppFactor: Math.round(proj.oppFactor * 1000) / 1000, oppKnown: proj.oppKnown, n: proj.n, line: proj.line, opp: nextGame.opp, start: nextGame.start } : (proj ? { xpts: null, reason: proj.reason } : null),
    log: logCur.length ? logCur : logPrev, logSeason: logCur.length ? seasonLabel(sn.cur) : seasonLabel(sn.prev),
    // { gameId: [[period, pts, reb, ast, tpm, tpa], ...] }; null when the read failed (the chips then don't draw -- never a zero line)
    quarters: qrows.error ? null : (qrows.data || []).reduce((o, r) => { (o[r.game_id] ||= []).push([r.period, r.pts, r.reb, r.ast, r.tpm, r.tpa]); return o }, {}),
    // packed as the shots route packs them (lib/nba/shots.js): [x, y, made, three, game index, period] + shotGames [[id, date]]
    ...(() => { const p = packShots(shots.data || []); return { shots: p.shots, shotGames: p.games } })(),
    shotsFrom: shots.data?.length ? shots.data[shots.data.length - 1].game_date : null,
    // THE PUBLIC-NUMBER FLOOR ON HIS PAGE (10-19, before BUCKETS opens): his record lines, last week and the on-him table are
    // results, so they carry only what the record may count -- no preseason row, and no market still under its 30 graded
    // regular-season nights (lib/record/nbaFloor.js; the same floor as /api/buckets/record, the ledger and the posts)
    calls: (calls.data || []).filter((r) => r.season_type !== 1 && !trackingOf(floor, r.market)),
    fetchedAt: new Date().toISOString(),
  }, 600)
})
