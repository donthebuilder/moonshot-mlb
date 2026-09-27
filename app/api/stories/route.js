// STORYLINES — GET /api/stories?sport=mlb|nfl|nhl[&date=YYYY-MM-DD (nhl)]
//
// BATCH-STORYLINES-PAGE step 2: every story the product's engine
// (lib/stories/{mlb,nfl,nhl}.js) finds for tonight, tied to its game and
// carrying the player's CALLED / ON THE BOARD / NOT ON THE BOARD chip
// (lib/stories/index.js). Games in start order. The engines read the league
// APIs and the published files, so the answer is cached: 5 minutes at the
// CDN (one build serves every visitor) and in this instance.
import { loadStories, STORY_SPORTS } from '../../../lib/stories'
import { validDate } from '../../../lib/nhl/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const TTL_MS = 5 * 60 * 1000
const _memo = new Map()

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!STORY_SPORTS[sport]) return Response.json({ error: `sport must be one of ${Object.keys(STORY_SPORTS).join(', ')}` }, { status: 400 })
  const date = validDate(q.get('date')) ? q.get('date') : null
  const key = `${sport}|${date || ''}`
  const hit = _memo.get(key)
  const headers = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' }
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.body, { headers })
  try {
    const body = { ...(await loadStories(sport, { date })), builtAt: new Date().toISOString() }
    _memo.set(key, { at: Date.now(), body })
    return Response.json(body, { headers })
  } catch (e) {
    console.error(`[stories] ${sport}: ${e?.message}`)
    return Response.json({ sport, games: [], stories: [], error: 'LIVE DATA DELAYED' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
