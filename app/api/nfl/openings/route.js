// GET /api/nfl/openings?season=both|this|last&where=all|home|away&last=10 -- TUDDY's OPENINGS research (2026-10-26): every club's
// got-the-ball and first-touchdown record, plays to the first TD, points in the first quarter, what the first touchdowns were (rush /
// pass / return) and what each defense allowed, and who scores first most -- counted from opening_games (sport 'nfl', written on the NFL
// tick, lib/nfl/openings.js). Counts only (lib/openings/teamAgg.js), never a chance. Also this week's games for the matchup.
import { adminClient } from '../../../../lib/supabase/admin'
import { readTeamOpenings } from '../../../../lib/openings/readTeamOpenings'

export const dynamic = 'force-dynamic'
const ABBR = { WSH: 'WAS', LAR: 'LA' }   // ESPN's club codes -> nflverse's, the same map lib/nfl/liveSlate.js keeps
const code = (x) => ABBR[String(x || '').toUpperCase()] || String(x || '').toUpperCase()
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const season = sp.get('season') || 'both', where = sp.get('where') || 'all', last = sp.get('last') ? Number(sp.get('last')) : null
  if (!['both', 'this', 'last'].includes(season) || !['all', 'home', 'away'].includes(where) || (last != null && !(last > 0 && last <= 20))) return Response.json({ error: 'season both|this|last, where all|home|away, last 1-20' }, { status: 400, headers: NO_STORE })
  const db = adminClient()
  if (!db) return Response.json({ available: false }, { status: 503, headers: NO_STORE })
  try {
    const [agg, sb] = await Promise.all([
      readTeamOpenings(db, 'nfl', { season, where, last }),
      fetch('https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', { next: { revalidate: 300 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    const tonight = (sb?.events || []).map((e) => {
      const c = e.competitions?.[0]?.competitors || []
      const away = code(c.find((x) => x.homeAway === 'away')?.team?.abbreviation), home = code(c.find((x) => x.homeAway === 'home')?.team?.abbreviation)
      return away && home ? { key: String(e.id), away, home, label: `${away} @ ${home}`, gameId: String(e.id) } : null
    }).filter(Boolean)
    return Response.json({ ...agg, tonight }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } })
  } catch (e) {
    console.error(`[nfl openings] ${e?.message || e}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'Waiting on the feed.' }, { status: 502, headers: NO_STORE })
  }
}
