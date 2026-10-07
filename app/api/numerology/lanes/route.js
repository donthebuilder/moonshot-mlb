// NUMEROLOGY · WHICH LANES RUN HOT — GET /api/numerology/lanes?sport=nfl|nhl|mlb
//
// BATCH-NUMEROLOGY step 6. Per lane, over every GRADED night in
// numerology_lane_nights: nights, matched players and how many of them hit,
// against everyone who was eligible for that lane (the base rate), the
// difference and a two-proportion z. A lane is `shown` only from 30 graded
// nights (the plan's rule); before that it reports how many it has.
// Numerology never feeds a score, a board or a rank -- this is the check on
// whether any of it is more than chance.
import { adminClient } from '../../../../lib/supabase/admin'
import { laneTable, MIN_NIGHTS } from '../../../../lib/numerology/laneTable'
import { SPORT_KEYS } from '../../../../lib/routes'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const sport = String(new URL(request.url).searchParams.get('sport') || '').toLowerCase()
  if (!SPORT_KEYS.includes(sport)) return Response.json({ error: `sport must be one of ${SPORT_KEYS.join(', ')}` }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ sport, lanes: [], nights: 0, minNights: MIN_NIGHTS, configured: false })
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('numerology_lane_nights').select('lane, day, eligible, matched, eligible_hits, matched_hits, graded_at').eq('sport', sport)
      .order('day', { ascending: true }).order('lane', { ascending: true }).range(from, from + 999)
    if (error) return Response.json({ sport, error: error.message }, { status: 502 })
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const nights = new Set(rows.filter((r) => r.graded_at).map((r) => r.day)).size
  // RECORDED vs GRADED (2026-10-06, ledger audit P0-3): `nights` counts completed (every logged player graded)
  // nights; `recorded` also counts nights still in progress, so the page can say what is true.
  const recorded = new Set(rows.map((r) => r.day)).size
  return Response.json({ sport, nights, recorded, minNights: MIN_NIGHTS, lanes: laneTable(rows), configured: true }, { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=3600' } })
}
