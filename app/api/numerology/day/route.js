// NUMEROLOGY · ONE DAY'S RECORD — GET /api/numerology/day?sport=mlb|nfl|nhl&day=YYYY-MM-DD
//
// What a given game day's numbers did, from rows already written by the nightly graders: numerology_numbers (hot
// numbers) and numerology_lane_nights (lane records). Read only; nothing is computed from the wall clock or invented.
// A day with no graded rows answers { graded: false }.
import { adminClient } from '../../../../lib/supabase/admin'
import { SPORT_KEYS } from '../../../../lib/routes'
import { dayRecap } from '../../../../lib/numerology/dayNumbers'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const day = String(q.get('day') || '')
  if (!SPORT_KEYS.includes(sport)) return Response.json({ error: `sport must be one of ${SPORT_KEYS.join(', ')}` }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ sport, day, graded: false, configured: false })
  const [a, b] = await Promise.all([
    db.from('numerology_numbers').select('*').eq('sport', sport).eq('day', day).limit(2000),
    db.from('numerology_lane_nights').select('lane, day, eligible, matched, eligible_hits, matched_hits, graded_at').eq('sport', sport).eq('day', day).limit(500),
  ])
  if (a.error || b.error) return Response.json({ sport, day, error: (a.error || b.error).message }, { status: 502 })
  return Response.json({ sport, ...dayRecap(day, a.data, b.data), configured: true }, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } })
}
