// LAMP · GOALIE ZONES — GET /api/lamp/goaliezones?goalie=<7-digit id>&season=<8-digit>
//
// One goalie's shots on goal and goals against per named zone, beside the
// league's (lib/nhl/goalieZones.js). { available: false } until the SQL in
// 202610020200_lamp_goalie_zones.sql has run. Cached a day.
import { PLAYER_ID_RE } from '../../../../lib/nhl/api'
import { readGoalieZones } from '../../../../lib/nhl/goalieZones'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const goalie = q.get('goalie'); const season = q.get('season')
  if (!PLAYER_ID_RE.test(String(goalie || ''))) return bad('goalie must be a 7-digit NHL id')
  if (!/^\d{8}$/.test(String(season || ''))) return bad('season must be an 8-digit NHL season id')
  try {
    return ok({ ...(await readGoalieZones(goalie, season)), fetchedAt: new Date().toISOString() }, 86400)
  } catch (e) {
    return delayed(`goalie zones ${goalie}`, e)
  }
}
