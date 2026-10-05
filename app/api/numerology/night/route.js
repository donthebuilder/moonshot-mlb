// GET /api/numerology/night?sport=mlb&date=YYYY-MM-DD -- one night's ACTUAL homers
// and their numbers (lib/numerology/actualNight.js), for the Numerology page's
// Yesterday / Tonight boxes. Built from homer_feed (the homers tick writes each
// hitter's jersey and birth date onto it), so every visitor sees the same night
// from the first homer -- not a copy one browser kept. Date defaults to today ET.
import { adminClient } from '../../../../lib/supabase/admin'
import { actualNight } from '../../../../lib/numerology/actualNight'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'

// one reader per sport; MLB only for now (TUDDY / LAMP's Numerology pages have no days box yet)
const NIGHT = {
  mlb: (db, date) => db.from('homer_feed').select('player_id, name, team, hr_n, game_pk, stats').eq('day', date).limit(400),
}

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport') || 'mlb'
  const today = easternToday()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : today
  if (!NIGHT[sport]) return Response.json({ error: 'no actual-night reader for this sport yet' }, { status: 404 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  const { data, error } = await NIGHT[sport](db, date)
  if (error) return Response.json({ error: error.message }, { status: 502 })
  // tonight moves (2 min at the edge); a finished night doesn't (a day)
  const cache = date >= today ? 'public, s-maxage=120, stale-while-revalidate=60' : 'public, s-maxage=86400, stale-while-revalidate=3600'
  return Response.json({ sport, ...actualNight(data || [], date) }, { headers: { 'Cache-Control': cache } })
}
