// HEAD TO HEAD -- GET /api/h2h?sport=mlb&a=NYY&b=BOS  (a pair: every finished meeting, three seasons)
//                 GET /api/h2h?sport=nhl&a=TOR           (one club: its finished games of the latest season, against everyone)
// Reads the leagues' public schedule feeds (lib/h2h/read.js); stores nothing, runs no cron. A finished game never changes,
// so the answer is held at the edge for hours. BUCKETS (nba) goes through the same gate as every /api/buckets/* route:
// a 404 to everyone but an admin until BUCKETS_PUBLIC=on, and the answer is private while it is gated.
import { readPair, readClub } from '../../../lib/h2h/read'
import { teamKey, isKnownTeam } from '../../../lib/mlbTeams'
import { NFL_TEAMS } from '../../../lib/nfl/teams'
import { nhlTeam } from '../../../lib/nhl/teams'
import { nbaTeam } from '../../../lib/nba/teams'
import { bucketsGuard, bucketsPublic } from '../../../lib/nba/gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const NFL = new Set(NFL_TEAMS.map((t) => t[0]))
const CLUB = {
  mlb: (c) => { const k = teamKey(c); return k && isKnownTeam(k) ? k : null },
  nfl: (c) => { const k = String(c || '').toUpperCase(); return NFL.has(k) ? k : null },
  nhl: (c) => nhlTeam(c)?.abbrev || null,
  nba: (c) => nbaTeam(c)?.abbrev || null,
}
const bad = (detail) => Response.json({ error: 'BAD REQUEST', detail }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  if (!CLUB[sport]) return bad('sport must be mlb, nfl, nhl or nba')
  if (sport === 'nba') { const no = await bucketsGuard(); if (no) return no }
  const a = CLUB[sport](q.get('a')); const rawB = q.get('b'); const b = rawB ? CLUB[sport](rawB) : null
  if (!a) return bad(`a must be a ${sport.toUpperCase()} club code`)
  if (rawB && !b) return bad(`b must be a ${sport.toUpperCase()} club code`)
  if (b && b === a) return bad('a and b are the same club')
  const cache = sport === 'nba' && !bucketsPublic() ? 'private, max-age=60' : 'public, s-maxage=3600, stale-while-revalidate=21600'
  try {
    return Response.json(b ? await readPair(sport, a, b) : await readClub(sport, a), { headers: { 'Cache-Control': cache } })
  } catch (e) {
    console.error(`[h2h] ${sport} ${a} ${b || ''}: ${e?.message}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'the league feed is not answering' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
