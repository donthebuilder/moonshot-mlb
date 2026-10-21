// THE HIDDEN-SPORT GATE FOR A CARD ROUTE (audit 2026-10-20). /api/card, /api/card/dual and /api/card/slab served sport=nba with no
// BUCKETS gate once nba joined CARD_SPORTS (10-20, BUCKETS public). Harmless while BUCKETS is open; if the switch goes back off
// they would hand its cards to anyone, and cache them on the shared CDN. Server only.
//   const g = await hiddenCardGate(sport); if (g.no) return g.no; ... 'Cache-Control': g.cache(publicHeader)
import { HIDDEN_SPORTS, isSportOpen } from '../openSwitch'

export async function hiddenCardGate(sport) {
  const open = { no: null, cache: (pub) => pub }
  if (!HIDDEN_SPORTS.includes(String(sport))) return open
  const { bucketsGuard } = await import('../nba/gate')
  // anyone the gate turns away gets exactly the 404 a sport without cards gets
  if (await bucketsGuard()) return { no: Response.json({ error: 'NOT FOUND', detail: 'no cards for that sport' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }), cache: () => 'no-store' }
  // let in while still hidden (admin, early access): never the shared CDN
  return isSportOpen(String(sport)) ? open : { no: null, cache: () => 'private, max-age=60' }
}
