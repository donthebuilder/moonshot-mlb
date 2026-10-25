// GET /api/trending -- TRENDING ACROSS THE NETWORK (2026-10-25, Donovan: "look at all the sports and show what's trending";
// "5 good props from different sports"). Every product's Hit Rater rows in one list, the same core (lib/hitRater.js):
//   BUCKETS  /api/buckets/trending (its own route, gated like every BUCKETS read: a hidden product answers nothing here)
//   TUDDY    lib/nfl/trending.js over the week file, the bot's game logs and the fresh NFL odds (the TUDDY page's own rows)
//   LAMP     /api/lamp/trending (lamp_box; empty until the table exists)
// MOONSHOT in spring. Each row keeps its sport, so the page adds it to that product's
// slip. A hit rate is a count of games, never a chance: no implied % is sent. The CDN holds the answer 15 minutes.
import { tuddyTrendingRows } from '../../../lib/nfl/trending'
import { fetchNfl, nflSlatePaths, nflLogPaths } from '../../../lib/nfl/dataSource'
import { liveOdds } from '../../../lib/oddsFreshness'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const origin = new URL(request.url).origin
  const getJSON = (u) => fetch(`${origin}${u}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [nba, nhl, nflOdds, week, logs] = await Promise.all([
    getJSON('/api/buckets/trending'),
    getJSON('/api/lamp/trending'),
    getJSON('/api/odds/latest?sport=nfl'),
    fetchNfl(nflSlatePaths()).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
  ])
  const nfl = week && logs ? tuddyTrendingRows({ data: week, logs, odds: liveOdds(nflOdds) }) : []
  const rows = [...(nba?.rows || []), ...(nhl?.rows || []), ...nfl]
  const sports = { nba: (nba?.rows || []).length, nhl: (nhl?.rows || []).length, nfl: nfl.length }
  return Response.json({ rows, sports, nbaSince: nba?.since ?? null }, { headers: { 'Cache-Control': rows.length ? 'public, s-maxage=900, stale-while-revalidate=1800' : 'public, s-maxage=30' } })
}
