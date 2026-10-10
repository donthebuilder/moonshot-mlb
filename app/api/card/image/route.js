// GET /api/card/image?sport=nhl|mlb|nfl&id=<player id>&side=front|back[&date=YYYY-MM-DD][&w=360|540|720|1080]
// A player's card as a PNG (4:5, 1080x1350 by default), drawn by lib/cards from the sport's real board and stats (the SAME renderer the live
// CALLED alerts use). Read-only: nothing is written, no secret is in the response. 404 with a JSON reason (never an empty or invented card)
// when the sport has no cards (BUCKETS / nba has none, hidden or not), the id is not on a card window, or the data is not real; 400 for a
// malformed id / date; 502 when the render fails. Public data: every number is already on the site's boards.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { playerCardImage } from '../../../../lib/cards/cardImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]    // the design is 1080 wide; the rest are scaled copies. Anything else is 1080.
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!hasCards(sport)) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404, 'public, max-age=300')
  const side = q.get('side') === 'back' ? 'back' : 'front'
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080
  let db = null
  try { db = adminClient() } catch { db = null }       // no database = no stored price: the card still draws, the price slot does not
  const r = await playerCardImage({ sport, id: String(q.get('id') || ''), side, date: q.get('date') || null, width, db })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : r.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: r.why }, r.status, r.status === 404 ? 'public, max-age=60' : 'no-store')
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
