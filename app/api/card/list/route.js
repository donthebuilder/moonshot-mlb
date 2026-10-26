// GET /api/card/list?sport=nfl|nhl|mlb|nba[&date=YYYY-MM-DD]
// THE CALLED LIST (batch member-requests 2A, 2026-10-25): the day's locked Card, one entry per leg, as a table's rows (lib/card/listRows.js).
// WHO SEES WHAT is the Card's own rule, decided HERE and never by the caller (lib/card/reveal.js, the same one the images and the posts use):
//   a confirmed MEMBER (lib/members/viewer.js, fails closed) reads the whole Card;
//   everyone else reads the lead straight, the Long Shot and Donovan's rows until a row of the Card is graded, then everything, and is told only
//   HOW MANY plays are held ("held"), never who. Per viewer: never cached by the CDN.
// `date` defaults to the sport's latest locked card (a Tuesday shows Monday's graded card); `live` says it is the day's own.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards } from '../../../../lib/cards/registry'
import { readCard, latestCardDate } from '../../../../lib/card/store'
import { listEntries, listCounts } from '../../../../lib/card/listRows'
import { viewerIsMember } from '../../../../lib/members/viewer'
import { easternToday } from '../../../../lib/data'
import { hiddenCardGate } from '../../../../lib/cards/hiddenGate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!hasCards(sport)) return json({ error: 'NOT FOUND', detail: 'no card for that sport' }, 404)
  // a hidden sport (BUCKETS before its switch) answers exactly the 404 a sport without cards gets
  const gate = await hiddenCardGate(sport)
  if (gate.no) return gate.no
  const want = q.get('date')
  if (want && !DATE_RE.test(want)) return json({ error: 'BAD REQUEST', detail: 'bad date' }, 400)
  let db = null
  try { db = adminClient() } catch { db = null }
  if (!db) return json({ error: 'NOT CONFIGURED' }, 503)
  try {
    const date = want || await latestCardDate(db, sport)
    if (!date) return json({ available: true, sport, date: null, live: false, member: false, entries: [], held: 0, counts: {} })
    const member = await viewerIsMember()
    const now = Date.now()
    const card = await readCard(db, sport, date, { now, audience: member ? 'members' : 'public' })
    const entries = listEntries(card.rows, { now })
    // a count of plays held back, never a name (the Two-Man counts as one play)
    const held = (card.held?.straights || 0) + (card.held?.two_man || 0)
    return json({ available: true, sport, date, live: date === easternToday(), member, entries, held, counts: listCounts(entries) })
  } catch (e) {
    // a failed read is "delayed", never an empty list that looks like "nothing was called"
    console.error(`[card/list] ${sport}: ${e?.message}`)
    return json({ error: 'LIST DELAYED' }, 502)
  }
}
