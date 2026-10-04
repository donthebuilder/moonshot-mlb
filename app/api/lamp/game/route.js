// LAMP · GAME — GET /api/lamp/game?id=2026020053
//
// One game: gamecenter/{id}/landing (header, goals with assists and
// strength, penalties, three stars) joined with gamecenter/{id}/right-rail
// (linescore, shots by period, team stats, season series). Reduced by
// lib/nhl/reduce.js reduceGameDetail. The rail is optional — a game page
// without shots-by-period is still a game page; a game page without a
// header is not, so only the landing failure is a 502.
import { landingFor, rightRailFor, boxscoreFor, nhlGet, GAME_ID_RE, TTL } from '../../../../lib/nhl/api'
import { reduceGameDetail, idPenalties, reduceBoxPlayers } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { adminClient } from '../../../../lib/supabase/admin'
import { goalLabels, labelGoals, FEED_START } from '../../../../lib/nhl/goalFeed'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = String(searchParams.get('id') || '')
  if (!GAME_ID_RE.test(id)) return bad('id must be the 10-digit NHL game id')
  try {
    let [landing, rail, box] = await Promise.all([
      landingFor(id),
      rightRailFor(id).catch((e) => { console.error(`[lamp] right-rail ${id}: ${e?.message}`); return null }),
      // optional: the penalties' player ids, and the game's skater / goalie box
      boxscoreFor(id).catch(() => null),
    ])
    let game = reduceGameDetail(landing, rail)
    // A finished game with a box that isn't: the Data Cache serves its old copy
    // once while it refreshes, and that copy can be from mid-game (the same
    // stale read that mis-graded BUF@CHI). Re-read it straight from the league.
    const boxOver = ['OFF', 'FINAL'].includes(String(box?.gameState || '').toUpperCase())
    if (box && game.state === 'final' && !boxOver) box = await nhlGet(`/gamecenter/${id}/boxscore`, 0).catch(() => box)
    game = { ...game, penalties: idPenalties(game.penalties || [], box), box: reduceBoxPlayers(box) }
    // The same CALLED / ON THE BOARD labels as the scores list (lamp_goal_feed).
    if (game.date >= FEED_START && game.goals?.length) [game] = labelGoals([game], await goalLabels(adminClient(), [game.id]))
    return ok({ ...game, railMissing: !rail, fetchedAt: new Date().toISOString() }, TTL.game)
  } catch (e) {
    return delayed(`game ${id}`, e)
  }
}
