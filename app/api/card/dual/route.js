// GET /api/card/dual?sport=nhl|mlb|nfl[&date=YYYY-MM-DD][&lane=bot|donovan][&w=360|540|720|1080]
// The Two-Man as a dual collectible card (PNG, 4:5), drawn from the STORED card_calls row. The bot's Two-Man is members content until the Card is
// public record (every row graded or every game started): before that this answers 404, so the route can never show a free reader the Two-Man early.
// Donovan's Two-Man (lane=donovan) is public from its lock (the Card's own rule: it is not even readable before). The sequence number on the card
// is its real place among the lane's locked Two-Men (card_calls). 404 with a reason for nba / unknown sports / no row; no secrets in the response.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { dualCardImage, DATE_RE } from '../../../../lib/cards/cardImage'
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
  const r = await dualCardImage({ sport, date, lane: q.get('lane') === 'donovan' ? 'donovan' : 'bot', width: WIDTHS.includes(w) ? w : 1080, db, publicOnly: true })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : 'CARD DELAYED', detail: r.why }, r.status || 502, r.status === 404 ? 'public, max-age=60' : 'no-store')
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
