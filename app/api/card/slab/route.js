// GET /api/card/slab?kind=card&sport=nhl|mlb|nfl&date=YYYY-MM-DD&lane=bot|donovan&product=straight|two_man|long_shot|double&slot=1..3[&w=360|540|720|1080]   (the Double: sport=all)
// GET /api/card/slab?kind=receipt&day=YYYY-MM-DD[&w=...]
// The GRADED result in a slab (PNG, 4:5): the side label states the real outcome words (CASHED / MISSED / VOID / DID NOT PLAY), the date, the product,
// the market and the lane's record "K of N"; no numeric grade. A miss is drawn like a hit. Drawn only from rows that are ALREADY graded (graded rows
// are public record); a row that is not graded yet, or a night with no stored receipt, is a 404. 404 for nba / unknown sports; no secrets in the response.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { slabCardImage, DATE_RE } from '../../../../lib/cards/cardImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const kind = q.get('kind') === 'receipt' ? 'receipt' : 'card'
  const sport = String(q.get('sport') || '').toLowerCase()
  const product = ['two_man', 'long_shot', 'double'].includes(q.get('product')) ? q.get('product') : 'straight'
  // the Double is the one cross-sport row (sport=all); every other product needs a Card sport
  if (kind === 'card' && (product === 'double' ? sport !== 'all' : !hasCards(sport))) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404, 'public, max-age=300')
  const date = q.get(kind === 'receipt' ? 'day' : 'date')
  if (!date || !DATE_RE.test(date)) return json({ error: 'BAD REQUEST', detail: 'a date is needed (YYYY-MM-DD)' }, 400)
  let db = null
  try { db = adminClient() } catch { db = null }
  if (!db) return json({ error: 'NOT CONFIGURED' }, 503)
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080
  const slot = Math.min(3, Math.max(1, Number(q.get('slot')) || 1))
  const r = await slabCardImage(kind === 'receipt'
    ? { kind, day: date, width, db }
    : { kind, sport, date, lane: q.get('lane') === 'donovan' ? 'donovan' : 'bot', product, slot, width, db })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : r.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: r.why }, r.status || 502, r.status === 404 ? 'public, max-age=60' : 'no-store')
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } })
}
