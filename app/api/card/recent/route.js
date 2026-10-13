// GET /api/card/recent?sport=nhl|mlb|nfl     (ALL CARDS in the binder, and a club's Cards section)
// Every special card (lib/cards/moments.js) the stored feeds prove for one sport in the last 30 days, the rarest per player per game day, at most 200: STAR and up first,
// plain goals (BASE) only fill what is left. Real stored history only; read-only selects (lib/cards/specialData.js recentCards), no db writes, no new tables, no polling.
// Kept five minutes on the instance and on the CDN. A sport with no moments (BUCKETS) answers an empty list.
import { adminClient } from '../../../../lib/supabase/admin'
import { recentCards } from '../../../../lib/cards/specialData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body, status = 200, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const sport = String(new URL(request.url).searchParams.get('sport') || '').toLowerCase()
  if (!['mlb', 'nfl', 'nhl'].includes(sport)) return json({ total: 0, counts: {}, cards: [] })
  let db = null
  try { db = adminClient({ anon: true }) } catch { db = null }
  if (!db) return json({ total: 0, counts: {}, cards: [] })
  try {
    return json(await recentCards({ sport, db }), 200, 'public, s-maxage=300, stale-while-revalidate=600')
  } catch (e) {
    console.error(`[cards] recent ${sport}: ${e?.message || e}`)
    return json({ total: 0, counts: {}, cards: [] })
  }
}
