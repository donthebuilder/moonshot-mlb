// GET /api/card/share?kind=ranked|game|pitcher|pick|record|postseason|series&sport=mlb|nfl|nhl|nba[&market=&type=&ids=&game=&id=&date=&season=&week=&mode=][&w=360|540|720|1080]
// The 📸 DOWNLOADS (MOONSHOT, TUDDY, LAMP, BUCKETS) as one PNG (4:5, 1080x1350 by default) in the baseball-card look, drawn by lib/cards/shareCards.js from
// the same real boards the pages read (lib/cards/shareData.js): the ranking, one game with its team-model count, a starter, a TUDDY pick (pregame or graded),
// MOONSHOT's season record. Read-only: nothing is written, no secret is in the response, no polling. Public data only (every number is already on a public
// board). 404 with a JSON reason (never an empty or invented card) when the sport / market has no card, the day has no data or the source is down; 400 for a
// malformed parameter (postseason: sport=mlb&id=<MLB id>&side=front|back[&group=hitting|pitching][&season=]; series: sport=mlb&team=NYY[&season=]: the postseason editions, MLB StatsAPI gameType=P, lib/cards/postseasonData.js); 502 when the render fails. BUCKETS (nba) answers like any missing page until it is public (lib/nba/gate.js).
// POSTSEASON ART: the postseason / series editions use MLB's ACTION photos (img.mlbstatic.com .../people/{id}/action/vertical/current) as card art, at the
// owner's decision (Donovan, 2026-10-12). They are MLB-owned images (almost certainly licensed photography); MLB serves no credit field for them. A photo that
// is missing or slow (4 s) is left out and the silo headshot is drawn instead; the card never waits on it twice (lib/cards/postseasonData.js).
import { shareCardImage } from '../../../../lib/cards/cardImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const kind = String(q.get('kind') || '')
  let priv = false
  if (sport === 'nba') {
    const { bucketsGuard, bucketsPublic } = await import('../../../../lib/nba/gate')
    const no = await bucketsGuard()
    if (no) return no
    priv = !bucketsPublic()
  }
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080
  const r = await shareCardImage({ kind, sport, q: Object.fromEntries(q.entries()), width })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : r.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: r.why }, r.status || 502, r.status === 404 && !priv ? 'public, max-age=60' : 'no-store')
  // the boards move through the day: five minutes fresh at the edge, then served stale for up to 30 minutes while one request redraws it, so a visitor from an X post
  // almost never waits on a cold render (2026-10-16: was 2 + 5 minutes and the first visitor of each window paid the full draw)
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': priv ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=1800' } })
}
