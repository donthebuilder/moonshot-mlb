// GET /api/postseason/game?pk=<gamePk>
// Is this game a postseason game (schedule gameType F / D / L / W), and who are its key players: per club the three hitters with the most postseason
// home runs (then hits, then RBI) and the probable starter with his postseason line when he has one. { ok:true, postseason:false } for a regular-season game
// (the page draws nothing). Public stats only (lib/cards/postseasonData.js loadGameKeyPlayers), read-only, nothing written, no polling.
import { loadGameKeyPlayers } from '../../../../lib/cards/postseasonData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const r = await loadGameKeyPlayers({ gamePk: new URL(request.url).searchParams.get('pk') })
  if (!r.ok) return json({ error: r.status === 400 ? 'BAD REQUEST' : 'DELAYED', detail: r.why }, r.status || 502)
  return json(r, 200, 'public, s-maxage=120, stale-while-revalidate=300')
}
