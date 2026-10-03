// GET /api/odds/past?date=YYYY-MM-DD -- one past MLB date's pregame prices
// in the bot's odds_<date>.json shape (lib/odds/pastPrices.js), for True Price.
// Only dates before today (ET): a slate still being played is never archived.
import { adminClient } from '../../../../lib/supabase/admin'
import { validDate } from '../../../../lib/nhl/api'
import { easternToday } from '../../../../lib/data'
import { mlbArchive } from '../../../../lib/odds/pastPrices'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const date = new URL(request.url).searchParams.get('date')
  if (!validDate(date) || date >= easternToday()) return Response.json({ error: 'date must be a past YYYY-MM-DD' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await mlbArchive(db, date)
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  } catch (e) {
    console.error(`[odds past] ${date}: ${e?.message}`)
    return Response.json({ error: 'odds delayed' }, { status: 502 })
  }
}
