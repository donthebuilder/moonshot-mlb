// GET /api/nfl/depth?teams=DAL,ARI -- each club's offense depth chart (lib/nfl/depthChart.js parseDepth), read from ESPN's own depthcharts feed: { depth: { DAL: { wr1: [...], ... } } }.
// Two clubs a call (one game's Out list), ESPN's team ids from its teams list (held in this instance). The CDN holds an answer 3 hours; a club ESPN does not answer for is left out.
import { parseDepth } from '../../../../lib/nfl/depthChart'
import { canonTeam } from '../../../../lib/injuries/teams'

export const dynamic = 'force-dynamic'
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const get = (u) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
let ids = null
async function teamIds() {
  if (ids) return ids
  const j = await get(`${BASE}/teams`)
  const list = j?.sports?.[0]?.leagues?.[0]?.teams || []
  if (!list.length) return {}
  ids = {}
  for (const { team } of list) if (team?.abbreviation && team?.id) ids[canonTeam('nfl', team.abbreviation)] = team.id
  return ids
}

export async function GET(request) {
  const want = [...new Set(String(new URL(request.url).searchParams.get('teams') || '').split(',').map((t) => canonTeam('nfl', t)).filter((t) => /^[A-Z]{2,3}$/.test(t)))].slice(0, 4)
  if (!want.length) return Response.json({ error: 'teams=DAL,ARI (up to four club codes)' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const map = await teamIds()
  const depth = {}
  await Promise.all(want.map(async (t) => {
    if (!map[t]) return
    const parsed = parseDepth(await get(`${BASE}/teams/${map[t]}/depthcharts`))
    if (Object.keys(parsed).length) depth[t] = parsed
  }))
  return Response.json({ depth, source: 'ESPN depth chart' }, { headers: { 'Cache-Control': Object.keys(depth).length ? 'public, s-maxage=10800, stale-while-revalidate=21600' : 'public, s-maxage=60' } })
}
