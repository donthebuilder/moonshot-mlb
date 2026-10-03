// GET /api/odds/latest?sport=mlb|nfl|nhl[&date=YYYY-MM-DD][&detail=1] -- MOONSHOT's prices in
// the odds_latest.json shape every price reader on the site already takes
// (lib/odds/latest.js). Default date: the MLB slate's own day, which the bot
// rolls at midnight Phoenix (today.yml) -- so a 1am-ET page still gets the
// night it is showing, not tomorrow's. The bot's own file stays
// as the fallback in oddsPaths().
import { adminClient } from '../../../../lib/supabase/admin'
import { validDate } from '../../../../lib/nhl/api'
import { latestOdds, leanOdds, ODDS_SPORTS } from '../../../../lib/odds/latest'

export const dynamic = 'force-dynamic'
// MLB reads the slate day, NFL the week around it, NHL the night (lib/odds/latest.js SPORTS).

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport')
  if (!ODDS_SPORTS.includes(sport)) return Response.json({ error: `sport must be one of ${ODDS_SPORTS.join(', ')}` }, { status: 400 })
  const phoenixDay = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)   // Phoenix is UTC-7 all year
  const date = validDate(q.get('date')) ? q.get('date') : phoenixDay
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    // detail=1: with each quote's trail (movement.history, by_book) -- the Odds page's Moves / Line shop
    const full = await latestOdds(sport, db, date)
    const body = q.get('detail') === '1' ? { ...full, detail: true } : leanOdds(full)
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } })
  } catch (e) {
    console.error(`[odds latest] ${date}: ${e?.message}`)
    return Response.json({ error: 'odds delayed' }, { status: 502 })
  }
}
