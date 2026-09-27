// GET /api/multi?sport=mlb|nfl|nhl[&player=ID[&season=YYYY]] -- the 2+ Club (lib/multi/read.js):
// the season table, recent 2+ games, header numbers, NFL QBs; with &player=,
// one player's 2+ games (his player page line). Read-only, CDN-cached.
import { adminClient } from '../../../lib/nhl/db'
import { readMulti, readPlayerMulti } from '../../../lib/multi/read'

export const dynamic = 'force-dynamic'
const SPORTS = new Set(['mlb', 'nfl', 'nhl'])

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport')
  if (!SPORTS.has(sport)) return Response.json({ error: 'sport must be mlb, nfl or nhl' }, { status: 400 })
  const player = q.get('player')
  if (player != null && !/^[\w-]{1,20}$/.test(player)) return Response.json({ error: 'bad player id' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  try {
    const season = /^\d{4}$/.test(q.get('season') || '') ? Number(q.get('season')) : null
    const body = player ? await readPlayerMulti(db, sport, player, season) : await readMulti(db, sport)
    return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch (e) {
    console.error(`[multi] ${sport}: ${e?.message}`)
    return Response.json({ error: 'delayed' }, { status: 502 })
  }
}
