// LAMP · LEADERS — GET /api/lamp/leaders
//
// Skater and goalie leaders for the ACTIVE season, regular season only,
// ten deep per category, from the league's own leader endpoints — measured,
// not modelled (the same rule TUDDY's Leaders page states). The dated form
// always: `/current` carries no season and is last season's in preseason.
// A 404 for the active season (no games yet, e.g. the afternoon of opening
// night) falls back to last season and says so with `stale`.
import { readLeaders } from '../../../../lib/nhl/readers'
import { TTL2 } from '../../../../lib/nhl/api'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await readLeaders()
    return ok({ ...data, fetchedAt: new Date().toISOString() }, TTL2.leaders)
  } catch (e) {
    return delayed('leaders', e)
  }
}
