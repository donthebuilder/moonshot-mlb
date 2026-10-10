// GET /api/card/day?sport=nhl|mlb|nfl[&date=YYYY-MM-DD][&w=360|540|720|1080]
// The Card's day lineup as a PNG, drawn from the STORED rows (card_calls). WHAT IT SHOWS depends on the Card's state, decided here and never by the
// caller: before the games, straight #1 (and Inside Line Two-Man once his lock has passed) ONLY, which is what the free posts may name; once every row
// is graded or every game has started the Card is public record and the whole lineup is drawn. The members image (the whole Card, pregame)
// is never served by a URL: the members poster draws it in-process and sends it to the members webhook only. 404 with a reason when nothing is
// locked for the day (or the sport has no cards); no secrets in the response.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { dayCardImage, DATE_RE } from '../../../../lib/cards/cardImage'
import { latestCardDate } from '../../../../lib/card/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!hasCards(sport)) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404, 'public, max-age=300')
  let db = null
  try { db = adminClient() } catch { db = null }
  if (!db) return json({ error: 'NOT CONFIGURED' }, 503)
  const want = q.get('date')
  if (want && !DATE_RE.test(want)) return json({ error: 'BAD REQUEST', detail: 'bad date' }, 400)
  const date = want || await latestCardDate(db, sport)
  if (!date) return json({ error: 'NOT FOUND', detail: 'no card locked yet' }, 404, 'public, max-age=60')
  const w = Number(q.get('w'))
  const r = await dayCardImage({ sport, date, scope: 'auto', width: WIDTHS.includes(w) ? w : 1080, db })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : 'CARD DELAYED', detail: r.why }, r.status || 502, r.status === 404 ? 'public, max-age=60' : 'no-store')
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', 'X-Card-Scope': r.scope } })
}
