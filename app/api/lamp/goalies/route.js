// LAMP · GOALIES — GET /api/lamp/goalies?season=<8-digit>
//
// One season's goalie lines (name, club, games, shots against) from the
// league's stats reports (lib/nhl/seasonStats.js goaliesForSeason): the shot
// map's goalie picker, for the season the map is drawn from. Cached a day.
import { goaliesForSeason } from '../../../../lib/nhl/seasonStats'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const season = new URL(request.url).searchParams.get('season')
  if (!/^\d{8}$/.test(String(season || ''))) return bad('season must be an 8-digit NHL season id')
  try {
    const goalies = (await goaliesForSeason(Number(season))).filter((g) => g.sa > 0).sort((a, b) => b.sa - a.sa)
    return ok({ season: Number(season), goalies, fetchedAt: new Date().toISOString() }, 86400)
  } catch (e) {
    return delayed('goalies', e)
  }
}
