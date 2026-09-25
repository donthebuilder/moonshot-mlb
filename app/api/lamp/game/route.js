// LAMP · GAME — GET /api/lamp/game?id=2026020053
//
// One game: gamecenter/{id}/landing (header, goals with assists and
// strength, penalties, three stars) joined with gamecenter/{id}/right-rail
// (linescore, shots by period, team stats, season series). Reduced by
// lib/nhl/reduce.js reduceGameDetail. The rail is optional — a game page
// without shots-by-period is still a game page; a game page without a
// header is not, so only the landing failure is a 502.
import { landingFor, rightRailFor, GAME_ID_RE, TTL } from '../../../../lib/nhl/api'
import { reduceGameDetail } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = String(searchParams.get('id') || '')
  if (!GAME_ID_RE.test(id)) return bad('id must be the 10-digit NHL game id')
  try {
    const [landing, rail] = await Promise.all([
      landingFor(id),
      rightRailFor(id).catch((e) => { console.error(`[lamp] right-rail ${id}: ${e?.message}`); return null }),
    ])
    return ok({ ...reduceGameDetail(landing, rail), railMissing: !rail, fetchedAt: new Date().toISOString() }, TTL.game)
  } catch (e) {
    return delayed(`game ${id}`, e)
  }
}
