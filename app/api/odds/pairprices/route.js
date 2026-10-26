// GET /api/odds/pairprices?sport=mlb|nfl|nhl[&date=YYYY-MM-DD] -- each priced man's best price for the next slate with a game still to
// start (lib/odds/pairPrices.js), for the pair tables' value columns. Default date: the first date with a priced game still to start.
// Read-only; the prices are our own odds_snap rows. Shares the longshots page's cached read, so it adds no new database load.
import { adminClient } from '../../../../lib/supabase/admin'
import { validDate } from '../../../../lib/nhl/api'
import { readPairPrices } from '../../../../lib/odds/pairPrices'

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
    return Response.json(await readPairPrices(db, sport, { date }), { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } })
  } catch (e) {
    console.error(`[pairprices] ${sport}: ${e?.message}`)
    return Response.json({ error: 'odds delayed', sport }, { status: 502 })
  }
}
