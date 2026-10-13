// GET /api/card/earned?sport=nhl|mlb|nfl|nba&id=<player id>   (the "Cards earned" shelf on a player's page)
// The special cards (lib/cards/moments.js) a player has earned, from REAL STORED HISTORY only: goals / hat tricks / 3-point nights (lamp_goal_feed), multi-homer
// games (homer_feed), multi-touchdown games (nfl_td_feed) and 100-yard games (the player game logs the site publishes, every week of the season), and a CALLED pick
// that cashed at +750 or longer (the stored call, odds_snap). One card per game day (his rarest), RAREST FIRST then newest. A player with none, or a sport with
// no moments (BUCKETS), answers { total: 0, cards: [] } and the page draws no section. Read-only (selects), no db writes, no polling, public data only.
// The pictures are /api/card/special?moment=&id= (lib/cards/specialCard.js).
import { adminClient } from '../../../../lib/supabase/admin'
import { earnedFor } from '../../../../lib/cards/specialData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body, status = 200, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const id = String(q.get('id') || '')
  if (!/^[a-z]{3}$/.test(sport) || !/^[A-Za-z0-9_.-]{1,24}$/.test(id)) return json({ error: 'BAD REQUEST', detail: 'sport and id are needed' }, 400)
  let db = null
  try { db = adminClient({ anon: true }) } catch { db = null }
  if (!db) return json({ total: 0, cards: [] })
  try {
    const shelf = await earnedFor({ sport, id, db, limit: 60 })
    return json(shelf, 200, 'public, s-maxage=300, stale-while-revalidate=600')
  } catch (e) {
    console.error(`[cards] earned ${sport}/${id}: ${e?.message || e}`)
    return json({ total: 0, cards: [] })
  }
}
