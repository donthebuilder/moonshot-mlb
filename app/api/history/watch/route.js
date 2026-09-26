// HISTORY WATCH — GET /api/history/watch?sport=mlb
//
// Tonight's hitters one homer short of a history rung, each with the claim
// reaching it would make and its proof (lib/history/watch.js): the last
// player to do it, the year, the number, every one since, and the source.
// Only when the board is today's (its own game times say so); otherwise an
// empty list with the reason. Cached an hour at the CDN.
import { easternToday, slateDateFromRows } from '../../../../lib/data'
import { fetchBoardFull } from '../../../../lib/dash/board'
import { mlbWatch, CREDIT } from '../../../../lib/history/watch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'mlb'
  const headers = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
  if (sport !== 'mlb') return Response.json({ sport, items: [], reason: 'not built yet for this sport', credit: null }, { headers })
  try {
    const day = easternToday()
    const rows = await fetchBoardFull('today').catch(() => null)
    if (!rows?.length || slateDateFromRows(rows) !== day) return Response.json({ sport, day, items: [], reason: 'no board for today yet', credit: CREDIT }, { headers })
    const items = await mlbWatch(rows, Number(day.slice(0, 4)))
    return Response.json({ sport, day, items, credit: CREDIT, builtAt: new Date().toISOString() }, { headers })
  } catch (e) {
    console.error(`[history watch] ${e?.message}`)
    return Response.json({ sport, items: [], error: 'LIVE DATA DELAYED' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
