// GET /api/buckets/access -> { open } or { open:true, early:true } -- can THIS visitor see BUCKETS? The
// client asks so the product switcher and /app#sport=nba show BUCKETS only to
// those who may see it (lib/nba/gate.js). `early` is true ONLY for a signed-in
// EARLY-ACCESS grant holder (not an admin, not once BUCKETS is public): the client
// draws the quiet EARLY ACCESS tag from it. A non-holder gets exactly { open:false }.
// Says nothing else: no email, no list, no who.
import { bucketsAccess } from '../../../../lib/nba/gate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const a = await bucketsAccess()
  const body = a.early ? { open: true, early: true } : { open: a.ok }
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}
