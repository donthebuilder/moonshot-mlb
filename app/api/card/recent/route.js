// GET /api/card/recent?sport=nhl|mlb|nfl     (ALL CARDS in the binder, and a club's Cards section)
// Every special card (lib/cards/moments.js) the stored feeds prove for one sport in the last 30 days, the rarest per player per game day, at most 200: STAR and up first,
// plain goals (BASE) only fill what is left. Real stored history only; read-only selects (lib/cards/specialData.js recentCards), no db writes, no new tables, no polling.
// Kept five minutes on the instance and on the CDN. BUCKETS (nba, hidden) answers only a visitor its gate lets in (lib/nba/gate.js), privately and from the service client
// (the NBA rows are closed to the public key); anyone else gets the same empty list a sport with no cards gets.
import { adminClient } from '../../../../lib/supabase/admin'
import { recentCards } from '../../../../lib/cards/specialData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body, status = 200, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })
const HIDDEN_SPORT = 'nba'   // BUCKETS: behind its gate

export async function GET(request) {
  const sport = String(new URL(request.url).searchParams.get('sport') || '').toLowerCase()
  let hidden = false
  if (sport === HIDDEN_SPORT) {
    const { bucketsGuard } = await import('../../../../lib/nba/gate')
    if (await bucketsGuard()) return json({ total: 0, counts: {}, cards: [] })
    hidden = true
  } else if (!['mlb', 'nfl', 'nhl'].includes(sport)) return json({ total: 0, counts: {}, cards: [] })
  let db = null
  try { db = adminClient(hidden ? {} : { anon: true }) } catch { db = null }
  if (!db) return json({ total: 0, counts: {}, cards: [] })
  try {
    return json(await recentCards({ sport, db }), 200, hidden ? 'private, max-age=60' : 'public, s-maxage=300, stale-while-revalidate=600')
  } catch (e) {
    console.error(`[cards] recent ${sport}: ${e?.message || e}`)
    return json({ total: 0, counts: {}, cards: [] })
  }
}
