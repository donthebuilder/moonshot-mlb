// LAMP · GOALIE WEAK SPOTS -- GET /api/lamp/goalieweak?goalie=<7-digit id>[,id...]&season=<8-digit>[&shooters=<id,id,...>]
//
// Where each goalie is weak: his top zones above the league (lib/nhl/goalieWeak.js, the rules), the shots and goals
// behind each, and the sample ("n starts · n shots this season"). One goalie with ?shooters= also returns how many of
// each named skater's shots on goal this season came from those zones. Information only. { state: 'unavailable' }
// until the zone SQL has run. Cached an hour at the edge.
import { PLAYER_ID_RE } from '../../../../lib/nhl/api'
import { readWeakMany, readWeakWithShooters, MAX_GOALIES, MAX_SHOOTERS } from '../../../../lib/nhl/goalieWeakRead'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const goalies = String(q.get('goalie') || '').split(',').filter(Boolean)
  const season = q.get('season')
  if (!goalies.length || goalies.length > MAX_GOALIES || !goalies.every((g) => PLAYER_ID_RE.test(g))) return bad(`goalie must be 1-${MAX_GOALIES} comma-separated 7-digit NHL ids`)
  if (!/^\d{8}$/.test(String(season || ''))) return bad('season must be an 8-digit NHL season id')
  const shooters = String(q.get('shooters') || '').split(',').filter(Boolean)
  if (shooters.length > MAX_SHOOTERS || !shooters.every((s) => PLAYER_ID_RE.test(s))) return bad(`shooters must be up to ${MAX_SHOOTERS} comma-separated 7-digit NHL ids`)
  try {
    if (goalies.length === 1) {
      return ok({ ...(await readWeakWithShooters(goalies[0], season, shooters)), fetchedAt: new Date().toISOString() }, 3600)
    }
    return ok({ season: Number(season), goalies: await readWeakMany(goalies, season), fetchedAt: new Date().toISOString() }, 3600)
  } catch (e) {
    return delayed(`goalie weak ${goalies.join(',')}`, e)
  }
}
