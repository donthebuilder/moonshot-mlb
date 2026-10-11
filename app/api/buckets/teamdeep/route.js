// GET /api/buckets/teamdeep?team=BOS -- the club page's league ranks, splits source (the read season's results), the next game's
// context and OUR graded calls on its players (lib/nba/teamRead.js). Gated like every BUCKETS route: a 404 to everyone but an
// admin until BUCKETS_PUBLIC=on, and the answer is private while it is gated (lib/nba/respond.js).
import { readNbaTeam } from '../../../../lib/nba/teamRead'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('team deep', async (q) => {
  const t = nbaTeam(q.get('team'))
  if (!t) return bad('team must be an NBA club code (BOS, NY, GS ...)')
  return ok(await readNbaTeam(t.abbrev), 600)
})
