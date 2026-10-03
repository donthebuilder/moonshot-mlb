// GET /api/buckets/standings[?season=2026] -- both conferences, gated. With
// no season asked, the season the rest of BUCKETS reads (lib/nba/season.js:
// last season's until this one has regular-season games), labelled, with the
// other one named so the page can offer it.
import { standingsFor, reduceStandings } from '../../../../lib/nba/api'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('standings', async (q) => {
  const sn = await nbaSeason()
  const asked = /^\d{4}$/.test(q.get('season') || '') ? Number(q.get('season')) : null
  const season = asked || sn.read
  const confs = reduceStandings(await standingsFor(String(season)))
  const played = confs.some((c) => c.rows.some((r) => (r.w || 0) + (r.l || 0) > 0))
  return ok({ season, seasonLabel: seasonLabel(season), current: sn.cur, stale: season !== sn.cur, other: season === sn.cur ? sn.prev : sn.cur, otherLabel: seasonLabel(season === sn.cur ? sn.prev : sn.cur), played, confs, fetchedAt: new Date().toISOString() }, 600)
})
