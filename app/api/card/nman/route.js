// GET /api/card/nman?sport=nhl|mlb|nfl[&date=YYYY-MM-DD][&w=360|540|720|1080]
// HIS N-MAN (3 to 6 hand-picked players, all must land) as a collectible card (PNG, 4:5), drawn from the STORED card_calls row (lane 'donovan', product 'n_man').
// Public from his lock (the Card's own rule: lib/card/store.js readCard does not even return the row before it, so an open entry is a 404 here, the same as a day
// with none). Once the row is graded the same URL answers the GRADED card: each leg's mark and the ticket CASHED / MISSED / VOID, a miss drawn like a win.
// A LATE entry (lane 'donovan_late') is never read here, so it can never be drawn for the public. The bot's rows are not touched. No secrets in the response.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { nManCardImage, DATE_RE } from '../../../../lib/cards/cardImage'
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
  const r = await nManCardImage({ sport, date, width: WIDTHS.includes(w) ? w : 1080, db })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : 'CARD DELAYED', detail: r.why }, r.status || 502, r.status === 404 ? 'public, max-age=60' : 'no-store')
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } })
}
