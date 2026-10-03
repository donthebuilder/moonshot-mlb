// GET /api/multi/tick -- the 2+ Club's daily refresh (Vercel cron, once a
// day, 11:10am ET). Re-reads the league for what finished since yesterday
// and upserts multi_games / multi_gp (lib/multi/build.js). Idempotent: the
// same game upserts onto its own row. Cron-secret only.
//   MLB  the last 3 slate days (a late final or a resumed game lands)
//   NFL  the season's weekly file (one download; nflverse updates it daily)
//   NHL  the current season (one report call + the season summary)
import { adminClient, cronAuthorized } from '../../../../lib/supabase/admin'
import { whichSeason } from '../../../../lib/nhl/whichSeason'
import { buildMlb, buildNfl, buildNhl, storeMulti } from '../../../../lib/multi/build'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const phoenixDay = (offset = 0) => new Date(Date.now() - 7 * 3600e3 + offset * 864e5).toISOString().slice(0, 10)

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const out = {}
  const run = async (sport, fn) => {
    try { out[sport] = await storeMulti(db, await fn()) } catch (e) {
      console.error(`[multi tick] ${sport}: ${e?.message}`)
      out[sport] = { error: e?.message }
    }
  }
  await run('mlb', () => buildMlb(db, { from: phoenixDay(-3), to: phoenixDay(-1), season: Number(phoenixDay(-1).slice(0, 4)) }))
  // An NFL season runs into February: Jan-Feb belong to last year's season.
  const [y, m] = phoenixDay().split('-').map(Number)
  await run('nfl', () => buildNfl(db, { season: m <= 2 ? y - 1 : y }))
  await run('nhl', async () => {
    const s = await whichSeason()
    return buildNhl(db, { seasonId: s.current || s.id })
  })
  console.log(`[multi tick] ${JSON.stringify(out)}`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
