// GET /api/injuries?sport=nfl|nhl|mlb|nba -- the shared injury layer (lib/injuries) for the pages. Read only.
// One cached read per sport per 20 minutes (Next's data cache + the instance memo); the CDN holds the answer for the same window,
// so a page full of viewers is one fetch. NO cron. A source that is down answers { unavailable: true, entries: [] } with 200 so
// the page can say "Injury report unavailable" -- never an empty list that reads as "nobody is out".
// NBA (BUCKETS) answers 404 to everyone but an admin until BUCKETS_PUBLIC is on (lib/nba/gate).
import { readInjuries, SPORTS, TTL_S } from '../../../lib/injuries/read'
import { bucketsGuard } from '../../../lib/nba/gate'

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport')
  if (!SPORTS.includes(sport)) return Response.json({ error: 'sport must be nfl, nhl, mlb or nba' }, { status: 400 })
  if (sport === 'nba') {
    const blocked = await bucketsGuard()
    if (blocked) return blocked
  }
  const snap = await readInjuries(sport)
  const shared = sport !== 'nba'
  return Response.json(snap, {
    headers: { 'Cache-Control': shared && !snap.unavailable ? `public, s-maxage=${TTL_S}, stale-while-revalidate=${TTL_S / 2}` : 'private, no-store' },
  })
}
