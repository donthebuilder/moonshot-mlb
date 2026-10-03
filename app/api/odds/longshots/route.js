// GET /api/odds/longshots?sport=mlb|nfl|nhl[&date=YYYY-MM-DD]
// Long-priced players beside our model (lib/odds/longshots.js). Default date:
// the first date with a priced game still to start. Read-only; the key never
// leaves the server (prices come from our own odds_snap rows).
import { adminClient } from '../../../../lib/supabase/admin'
import { validDate } from '../../../../lib/nhl/api'
import { readLongshots } from '../../../../lib/odds/longshots'

export const dynamic = 'force-dynamic'
const SPORTS = new Set(['mlb', 'nfl', 'nhl'])

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport')
  if (!SPORTS.has(sport)) return Response.json({ error: 'sport must be mlb, nfl or nhl' }, { status: 400 })
  const date = validDate(q.get('date')) ? q.get('date') : null
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await readLongshots(db, { sport, date })
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } })
  } catch (e) {
    console.error(`[longshots] ${sport}: ${e?.message}`)
    return Response.json({ error: 'odds delayed', sport }, { status: 502 })
  }
}
