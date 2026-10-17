// GET /api/card/image?sport=nhl|mlb|nfl&id=<player id>&side=front|back[&date=YYYY-MM-DD][&w=360|540|720|1080]
// A player's card as a PNG (4:5, 1080x1350 by default), drawn by lib/cards from the sport's real board and stats (the SAME renderer the live
// CALLED alerts use). Read-only: nothing is written, no secret is in the response. 404 with a JSON reason (never an empty or invented card)
// when the sport has no cards (BUCKETS / nba has none, hidden or not), the id is not on a card window, or the data is not real; 400 for a
// malformed id / date; 502 when the render fails. Public data: every number is already on the site's boards.
import { adminClient } from '../../../../lib/supabase/admin'
import { hasCards, hasPreviewCards } from '../../../../lib/cards/registry'
import { loadPlayerModel, renderModel } from '../../../../lib/cards/cardImage'
import { viewerIsMember } from '../../../../lib/members/viewer'
import { freeFourIds } from '../../../../lib/members/freeFour'
import { isOpenCall, boardCardModel } from '../../../../lib/members/hide'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]    // the design is 1080 wide; the rest are scaled copies. Anything else is 1080.
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  // BUCKETS (nba) is a PREVIEW sport: its card answers only a visitor the BUCKETS gate lets in (admin, early access, or everyone once it is public); anyone else gets
  // exactly the 404 every sport without cards gets, so the route says nothing about it
  let preview = false
  if (hasPreviewCards(sport)) {
    const { bucketsGuard, bucketsPublic } = await import('../../../../lib/nba/gate')
    if (await bucketsGuard()) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404, 'no-store')   // not cached: the same URL answers a signed-in holder
    preview = !bucketsPublic()
  } else if (!hasCards(sport)) return json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, 404, 'public, max-age=300')
  const side = q.get('side') === 'back' ? 'back' : 'front'
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080
  let db = null
  try { db = adminClient() } catch { db = null }       // no database = no stored price: the card still draws, the price slot does not
  // THE MEMBER GATE ON THE PICTURE (2026-10-17). A CALLED pick of tonight whose game has not started is the members'. A non-member (not one of the front door's
  // free four) is handed the same man as a plain ON THE BOARD card: no CALLED, score, why, price or accent. Because that makes the picture per-viewer, such a
  // card is never put on the shared cache. Started / graded / ON THE BOARD / NOT ON THE BOARD cards are public and cached exactly as before.
  let r
  let perViewer = false
  try {
    const loaded = await loadPlayerModel({ sport, id: String(q.get('id') || ''), date: q.get('date') || null, db, allowPreview: hasPreviewCards(sport) })
    if (!loaded.ok) r = loaded
    else {
      let model = loaded.model
      if (isOpenCall({ status: model.status, startMs: model.startMs })) {
        perViewer = true
        const member = await viewerIsMember()
        if (!member && !(await freeFourIds(sport)).has(String(model.playerId))) model = boardCardModel(model)
      }
      r = await renderModel(model, loaded.adapter, { side, width })
    }
  } catch (e) {
    console.error(`[cards] ${sport}/${side}: ${e?.message || e}`)
    r = { ok: false, status: 502, why: 'render failed' }
  }
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : r.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: r.why }, r.status, r.status === 404 && !preview ? 'public, max-age=60' : 'no-store')
  // a preview card is one visitor's: never on the shared CDN
  return new Response(r.png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': preview || perViewer ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=600' } })
}
