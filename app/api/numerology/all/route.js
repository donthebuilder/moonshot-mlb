// NUMEROLOGY · EVERY SPORT TODAY — GET /api/numerology/all
//
// One search over every open product's slate (lib/numerology/allSports.js): each player's jersey, birth day, life path
// and next HR / TD / goal, reduced, beside his own game's number. For fun: never graded, never in a score. A hidden
// product (BUCKETS before it opens) is left out server-side. The CDN holds it 5 minutes, so the whole site shares one
// build of it; the products' own reads underneath keep their own caches. Nothing is stored.
import { readAllSports } from '../../../../lib/numerology/allSports'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const body = await readAllSports()
    return Response.json({ ...body, fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
  } catch (e) {
    console.error(`[numerology all] ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', sports: [], rows: [] }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
