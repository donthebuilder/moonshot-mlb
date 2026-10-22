// LAMP · THE GAME'S EVENT TRAIL — GET /api/lamp/gameplay?id=2025020100
//
// Every located event of one game, in order (lib/nhl/events.js eventsFromPlayByPlay): the replay on the LAMP game page
// (components/lamp/GameReplay.js) plays it. Read from the league's play-by-play; nothing stored. A finished game is
// cached a day (it does not change); a live one for the game TTL.
import { nhlGet, GAME_ID_RE, TTL } from '../../../../lib/nhl/api'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'
import { eventsFromPlayByPlay } from '../../../../lib/nhl/events'

export const dynamic = 'force-dynamic'
const FINAL_TTL = 86400

export async function GET(request) {
  const id = String(new URL(request.url).searchParams.get('id') || '')
  if (!GAME_ID_RE.test(id)) return bad('id must be the 10-digit NHL game id')
  try {
    const pbp = await nhlGet(`/gamecenter/${id}/play-by-play`, TTL.game)
    const game = eventsFromPlayByPlay(pbp)
    if (!game) return delayed(`gameplay ${id}`, new Error('no plays in the feed'))
    const over = ['OFF', 'FINAL'].includes(String(pbp?.gameState || '').toUpperCase())
    return ok({ ...game, state: over ? 'final' : String(pbp?.gameState || '').toLowerCase() || null, fetchedAt: new Date().toISOString() }, over ? FINAL_TTL : TTL.game)
  } catch (e) {
    return delayed(`gameplay ${id}`, e)
  }
}
