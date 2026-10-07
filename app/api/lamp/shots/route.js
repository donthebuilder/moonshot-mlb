// LAMP · SHOTS — GET /api/lamp/shots?player=<7-digit id> | ?team=<ABC> | ?against=<ABC> (shots the club allowed) [&season=this|last|both]
//
// Where a player (or a club) shoots from: a zone grid, the slot share, the
// totals and the most recent ~200 attempts, season and last 10 games, from
// lamp_shots (lib/nhl/shotMap.js). Aggregates only -- the table itself never
// reaches a browser. Cached a day at the CDN: a shot map moves one game at a
// time, and a day-old one costs nothing to be wrong about.
import { PLAYER_ID_RE, TEAM_RE } from '../../../../lib/nhl/api'
import { readShotMap } from '../../../../lib/nhl/shotMap'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const player = q.get('player'); const team = String(q.get('team') || '').toUpperCase(); const against = String(q.get('against') || '').toUpperCase()
  if (player && !PLAYER_ID_RE.test(player)) return bad('player must be a 7-digit NHL id')
  if (!player && !TEAM_RE.test(team) && !TEAM_RE.test(against)) return bad('give ?player=<id>, ?team=<ABC> or ?against=<ABC>')
  const pickRaw = String(q.get('season') || '').toLowerCase()
  const opts = ['this', 'last', 'both'].includes(pickRaw) ? { season: pickRaw } : {}
  try {
    const data = player ? await readShotMap('player', Number(player), opts) : TEAM_RE.test(against) && !team ? await readShotMap('against', against, opts) : await readShotMap('team', team, opts)
    return ok({ ...data, fetchedAt: new Date().toISOString() }, 86400)
  } catch (e) {
    return delayed(`shots ${player || team || `against ${against}`}`, e)
  }
}
