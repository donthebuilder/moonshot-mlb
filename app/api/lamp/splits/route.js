// LAMP · SPLITS — GET /api/lamp/splits?id=8478402
//
// A skater's RAW per-game rows for the feed's featured season (regular season
// via game-log/{season}/2, and the playoffs via /3 when the player file lists
// a playoff run for that season), each stamped with what the browser can't
// know: the rink and the days of rest from his CLUB's own schedule
// (club-schedule-season/{team}/{season}, played games only). The browser groups
// the rows (lib/nhl/splits.js) -- the same idea as MOONSHOT's games_raw. Goalies
// get no splits. Preseason is not included. Cached like the sibling player
// route (TTL2.gameLog / TTL2.clubSchedule on the fetch, s-maxage on the response).
import { playerLanding, playerGameLog, nhlGet, PLAYER_ID_RE, TEAM_RE, TTL2 } from '../../../../lib/nhl/api'
import { reducePlayer, reduceGameLog } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { buildGames } from '../../../../lib/nhl/splits'
import { arenaOf } from '../../../../lib/nhl/arenas'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = String(searchParams.get('id') || '')
  if (!PLAYER_ID_RE.test(id)) return bad('id must be the 7-digit NHL player id')
  try {
    const player = reducePlayer(await playerLanding(id))
    const season = player.featured.season
    const base = { id: player.id, name: player.name, goalie: player.goalie, season, seasonLabel: player.featured.seasonLabel, games: [], fetchedAt: new Date().toISOString() }
    if (player.goalie || !season) return ok(base, TTL2.gameLog)
    const hasPlayoffs = player.seasons.some((s) => s.league === 'NHL' && s.gameType === 3 && s.season === season)
    const [reg, post] = await Promise.all([
      playerGameLog(id, season, 2).then((r) => reduceGameLog(r, false)).catch((e) => { if (e?.status === 404) return { rows: [] }; throw e }),   // a new season with no games yet: an empty log, not an error
      hasPlayoffs ? playerGameLog(id, season, 3).then((r) => reduceGameLog(r, false)).catch((e) => { console.error(`[lamp] splits playoffs ${id}: ${e?.message}`); return null }) : null,
    ])
    const rows = [...reg.rows.map((r) => ({ r, t: 2 })), ...(post?.rows || []).map((r) => ({ r, t: 3 }))]
    // every club he played for this season, one schedule each (played games only)
    const teams = [...new Set(rows.map((x) => x.r.team).filter((t) => TEAM_RE.test(t)))]
    const schedules = {}
    await Promise.all(teams.map(async (t) => {
      try {
        const j = await nhlGet(`/club-schedule-season/${t}/${season}`, TTL2.clubSchedule)
        schedules[t] = (j?.games || [])
          .filter((g) => (g.gameType === 2 || g.gameType === 3) && (g.gameState === 'FINAL' || g.gameState === 'OFF') && g.gameDate)
          .map((g) => ({ id: g.id, date: g.gameDate, venue: g.venue?.default || null }))
      } catch (e) { console.error(`[lamp] splits schedule ${t}: ${e?.message}`) }   // no schedule: rest and rink fall back, never invented
    }))
    const games = [...buildGames(reg.rows, 2, schedules, arenaOf), ...buildGames(post?.rows || [], 3, schedules, arenaOf)]
    games.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))   // newest first, like the log
    return ok({ ...base, games, fetchedAt: new Date().toISOString() }, TTL2.gameLog)
  } catch (e) {
    return delayed(`splits ${id}`, e)
  }
}
