// GET /api/ledger/first?sport=mlb|nfl|nhl[&day=YYYY-MM-DD] -- the FIRST scorer
// of every recent game (first homer / first TD / first goal) with the board's
// status, plus the season line (how many first scorers the board had) and the
// season's most frequent first scorers. lib/ledger/firstScorers.js; read from
// the event tables, nothing stored, no prediction. Cached five minutes.
import { adminClient } from '../../../../lib/supabase/admin'
import { SPORT_KEYS } from '../../../../lib/routes'
import { easternToday } from '../../../../lib/data'
import { readFirstScorers } from '../../../../lib/ledger/firstScorers'

export const dynamic = 'force-dynamic'
// How far back "recent" reaches, and where each season's count starts.
const WINDOW_DAYS = { mlb: 2, nfl: 7, nhl: 2 }
const SEASON_START = { mlb: '-03-01', nfl: '-09-01', nhl: '-09-01' }
const shift = (ymd, d) => new Date(Date.parse(`${ymd}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!SPORT_KEYS.includes(sport)) return Response.json({ error: `sport must be one of ${SPORT_KEYS.join(', ')}` }, { status: 400 })
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') || '') ? q.get('day') : easternToday()
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await readFirstScorers(db, sport, { day, since: shift(day, -WINDOW_DAYS[sport]), seasonSince: `${day.slice(0, 4)}${SEASON_START[sport]}` })
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (e) {
    console.error(`[ledger first] ${sport} ${day}: ${e?.message}`)
    return Response.json({ error: 'first scorers delayed' }, { status: 502 })
  }
}
