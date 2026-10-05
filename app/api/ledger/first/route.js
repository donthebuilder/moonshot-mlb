// GET /api/ledger/first?sport=mlb|nfl|nhl[&day=YYYY-MM-DD] -- the FIRST scorer
// of every recent game (first homer / first TD / first goal) with the board's
// status, plus the season line (how many first scorers the board had) and the
// season's most frequent first scorers. lib/ledger/firstScorers.js; read from
// the event tables, nothing stored, no prediction. Cached five minutes.
import { adminClient } from '../../../../lib/supabase/admin'
import { SPORT_KEYS, ALL_SPORT_KEYS } from '../../../../lib/routes'
import { bucketsGuard, bucketsPublic } from '../../../../lib/nba/gate'
import { easternToday } from '../../../../lib/data'
import { readFirstScorers } from '../../../../lib/ledger/firstScorers'

export const dynamic = 'force-dynamic'
// How far back "recent" reaches, and where each season's count starts.
const WINDOW_DAYS = { mlb: 2, nfl: 7, nhl: 2, nba: 2 }
const SEASON_START = { mlb: '-03-01', nfl: '-09-01', nhl: '-09-01', nba: '-09-01' }
// the season a day belongs to starts in the year before when the day is before that start
// (10-05: a January NFL / NHL day counted from the coming September -- an empty season line)
const seasonSince = (day, start) => (day >= `${day.slice(0, 4)}${start}` ? `${day.slice(0, 4)}${start}` : `${Number(day.slice(0, 4)) - 1}${start}`)
const shift = (ymd, d) => new Date(Date.parse(`${ymd}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  // BUCKETS answers here behind its own gate (admin-only until BUCKETS_PUBLIC=on), never on the shared CDN while gated
  const nba = sport === 'nba' && ALL_SPORT_KEYS.includes('nba')
  if (!SPORT_KEYS.includes(sport) && !nba) return Response.json({ error: `sport must be one of ${SPORT_KEYS.join(', ')}` }, { status: 400 })
  if (nba) { const no = await bucketsGuard(); if (no) return no }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') || '') ? q.get('day') : easternToday()
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const body = await readFirstScorers(db, sport, { day, since: shift(day, -WINDOW_DAYS[sport]), seasonSince: seasonSince(day, SEASON_START[sport]) })
    return Response.json(body, { headers: { 'Cache-Control': nba && !bucketsPublic() ? 'private, max-age=60' : 'public, s-maxage=300, stale-while-revalidate=900' } })
  } catch (e) {
    console.error(`[ledger first] ${sport} ${day}: ${e?.message}`)
    return Response.json({ error: 'first scorers delayed' }, { status: 502 })
  }
}
