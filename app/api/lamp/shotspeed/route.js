// LAMP · SHOT SPEED — GET /api/lamp/shotspeed?player=<7-digit id>&season=<8-digit> | ?team=<ABC>&season=
//
// His (or a club's) average and top shot speed and his ten hardest shots, from
// NHL EDGE (lib/nhl/shotSpeed.js). Asked only when a shot map opens; cached a
// day at the CDN and in the Data Cache. 204-style empty when EDGE has no row.
import { PLAYER_ID_RE, TEAM_RE } from '../../../../lib/nhl/api'
import { readShotSpeed } from '../../../../lib/nhl/shotSpeed'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const player = q.get('player'); const team = String(q.get('team') || '').toUpperCase(); const season = q.get('season')
  if (!/^\d{8}$/.test(String(season || ''))) return bad('season must be an 8-digit NHL season id')
  if (player && !PLAYER_ID_RE.test(player)) return bad('player must be a 7-digit NHL id')
  if (!player && !TEAM_RE.test(team)) return bad('give ?player=<id> or ?team=<ABC>')
  try {
    const data = await readShotSpeed({ player: player || null, team: player ? null : team, season: Number(season) })
    return ok({ speed: data, fetchedAt: new Date().toISOString() }, 86400)
  } catch (e) {
    return delayed(`shot speed ${player || team}`, e)
  }
}
