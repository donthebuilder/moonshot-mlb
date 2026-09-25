// LAMP · PLAYER — GET /api/lamp/player?id=8478402
//
// The player file (player/{id}/landing: bio, the feed's own featured season,
// career totals, every season by league, last five, awards) and the game
// log for that featured season's regular season (player/{id}/game-log/
// {season}/2). A skater and a goalie come back through the same route with
// different lines — reducePlayer branches on `position` — and the page
// renders a different hierarchy for each (spec §10).
import { playerLanding, playerGameLog, PLAYER_ID_RE, TTL2 } from '../../../../lib/nhl/api'
import { reducePlayer, reduceGameLog } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { whichSeason } from '../../../../lib/nhl/whichSeason'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = String(searchParams.get('id') || '')
  if (!PLAYER_ID_RE.test(id)) return bad('id must be the 7-digit NHL player id')
  try {
    const [player, season] = await Promise.all([
      playerLanding(id).then(reducePlayer),
      whichSeason().catch(() => ({ current: null, opens: null })),
    ])
    // The log follows the feed's featured season. A season with no games yet
    // has no gameLog key; that is an empty log, not an error.
    let log = { season: player.featured.season, seasonLabel: player.featured.seasonLabel, gameType: 2, available: [], rows: [] }
    if (player.featured.season) {
      const raw = await playerGameLog(id, player.featured.season, 2).catch((e) => { console.error(`[lamp] game-log ${id}: ${e?.message}`); return null })
      if (raw) log = reduceGameLog(raw, player.goalie)
    }
    // `current` / `opens` let the page say "this is last season's line" the
    // same way Standings does; the feed's featuredStats never says so itself.
    return ok({ ...player, log, current: season.current, opens: season.opens, fetchedAt: new Date().toISOString() }, TTL2.player)
  } catch (e) {
    return delayed(`player ${id}`, e)
  }
}
