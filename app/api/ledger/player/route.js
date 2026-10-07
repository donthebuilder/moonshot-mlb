// GET /api/ledger/player?sport=mlb|nfl|nhl&id=<player id> -- one player's rows in the Called table this
// season: every home run / touchdown / goal night of his, tagged CALLED / ON THE BOARD / NOT ON THE BOARD as
// the event tables froze it (lib/ledger/playerRows.js). What "In the ledger" on his card reads. Cached five
// minutes; one indexed select by player id, only when a card is opened.
import { adminClient } from '../../../../lib/supabase/admin'
import { easternToday } from '../../../../lib/data'
import { readPlayerLedger, ID_OK, UNIT } from '../../../../lib/ledger/playerRows'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const id = String(q.get('id') || '')
  if (!ID_OK[sport]) return Response.json({ error: 'sport must be mlb, nfl or nhl' }, { status: 400 })
  if (!ID_OK[sport].test(id)) return Response.json({ error: 'not a player id for that sport' }, { status: 400 })
  const db = adminClient({ anon: true })
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await readPlayerLedger(db, sport, id, easternToday())
    return Response.json({ sport, id, unit: UNIT[sport], ...body }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (e) {
    console.error(`[ledger player] ${sport} ${id}: ${e?.message}`)
    return Response.json({ error: 'his ledger rows are delayed' }, { status: 502 })
  }
}
