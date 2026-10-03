// GET /api/buckets/access -> { open } -- can THIS visitor see BUCKETS? The
// client asks so the product switcher and /app#sport=nba show BUCKETS only to
// those who may see it (lib/nba/gate.js). Says nothing else: no email, no list.
import { bucketsAccess } from '../../../../lib/nba/gate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const a = await bucketsAccess()
  return Response.json({ open: a.ok }, { headers: { 'Cache-Control': 'private, no-store' } })
}
