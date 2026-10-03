// GET /api/buckets/standings[?season=2026] -- both conferences, gated. Before
// the season has a game the current table is all 0-0; the page says so and
// offers last season's.
import { standingsFor, reduceStandings } from '../../../../lib/nba/api'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('standings', async (q) => {
  const season = /^\d{4}$/.test(q.get('season') || '') ? q.get('season') : null
  const confs = reduceStandings(await standingsFor(season))
  const played = confs.some((c) => c.rows.some((r) => (r.w || 0) + (r.l || 0) > 0))
  return ok({ season: season ? Number(season) : null, played, confs, fetchedAt: new Date().toISOString() }, 600)
})
