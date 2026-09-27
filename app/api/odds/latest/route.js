// GET /api/odds/latest?sport=mlb[&date=YYYY-MM-DD] -- MOONSHOT's prices in
// the odds_latest.json shape every price reader on the site already takes
// (lib/odds/latest.js). Default date: the MLB slate's own day, which the bot
// rolls at midnight Phoenix (today.yml) -- so a 1am-ET page still gets the
// night it is showing, not tomorrow's. The bot's own file stays
// as the fallback in oddsPaths().
import { adminClient } from '../../../../lib/nhl/db'
import { validDate } from '../../../../lib/nhl/api'
import { mlbLatestOdds, nflLatestOdds } from '../../../../lib/odds/latest'

export const dynamic = 'force-dynamic'
// MLB reads the slate day; NFL the week around it.
const BUILD = { mlb: mlbLatestOdds, nfl: nflLatestOdds }

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const build = BUILD[q.get('sport')]
  if (!build) return Response.json({ error: 'sport must be mlb or nfl' }, { status: 400 })
  const phoenixDay = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)   // Phoenix is UTC-7 all year
  const date = validDate(q.get('date')) ? q.get('date') : phoenixDay
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await build(db, date)
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } })
  } catch (e) {
    console.error(`[odds latest] ${date}: ${e?.message}`)
    return Response.json({ error: 'odds delayed' }, { status: 502 })
  }
}
