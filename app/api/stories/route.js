// STORYLINES — GET /api/stories?sport=mlb|nfl|nhl[&date=YYYY-MM-DD (nhl)]
//
// BATCH-STORYLINES-PAGE step 2: every story the product's engine
// (lib/stories/{mlb,nfl,nhl}.js) finds for tonight, tied to its game and
// carrying the player's CALLED / ON THE BOARD / NOT ON THE BOARD chip
// (lib/stories/index.js). Games in start order. A game under way or final
// shows the stories frozen at its start, with their grade (step 3), and
// `summary` is HOW STORIES DID. The engines read the league
// APIs and the published files, so the answer is cached: 5 minutes at the
// CDN (one build serves every visitor) and in this instance.
import { loadStoriesPage, STORY_SPORTS } from '../../../lib/stories'
import { adminClient } from '../../../lib/supabase/admin'
import { validDate } from '../../../lib/nhl/api'
import { isHiddenSport } from '../../../lib/routes'
import { bucketsGuard } from '../../../lib/nba/gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const TTL_MS = 5 * 60 * 1000
const _memo = new Map()

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!STORY_SPORTS[sport]) return Response.json({ error: `sport must be one of ${Object.keys(STORY_SPORTS).join(', ')}` }, { status: 400 })
  // a hidden product's stories answer only to those who may see it (BUCKETS: lib/nba/gate.js)
  if (isHiddenSport(sport)) { const no = await bucketsGuard(); if (no) return no }
  const date = validDate(q.get('date')) ? q.get('date') : null
  const key = `${sport}|${date || ''}`
  const hit = _memo.get(key)
  const headers = { 'Cache-Control': isHiddenSport(sport) ? 'private, max-age=60' : 'public, s-maxage=300, stale-while-revalidate=900' }
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.body, { headers })
  try {
    // Started games show what was frozen at their start, graded once final (lib/stories/record.js).
    const body = { ...(await loadStoriesPage(sport, { date, db: adminClient() })), builtAt: new Date().toISOString() }
    _memo.set(key, { at: Date.now(), body })
    return Response.json(body, { headers })
  } catch (e) {
    console.error(`[stories] ${sport}: ${e?.message}`)
    return Response.json({ sport, games: [], stories: [], error: 'LIVE DATA DELAYED' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
