// GET /api/writeups/featured?sport=nfl -- this week's FEATURED games (the ones
// whose write-up goes to X) and their called players, for the screenshot job
// (MLB-HR-DASHBOARD-STREAMLIT .github/workflows/writeup-shots.yml), which
// photographs each player's live page before the post. Public: it repeats what
// the published nfl_game_calls.json already says, nothing more.
import { fetchNfl, nflGameCallsPaths, nflSlatePaths, nflSlateLooksReal } from '../../../../lib/nfl/dataSource'
import { nflFeatured } from '../../../../lib/writeups/featured'

export const revalidate = 300

const FEATURED = { nfl: async () => {
  const [calls, week] = await Promise.all([fetchNfl(nflGameCallsPaths()).catch(() => null), fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)])
  const slots = nflFeatured(calls?.games || [], week)
  return (calls?.games || []).filter((g) => slots.has(String(g.game_id))).map((g) => ({
    game_id: String(g.game_id), kickoff: g.kickoff, away: g.away, home: g.home, slot: slots.get(String(g.game_id)), state: g.state,
    players: (g.calls || []).map((c) => ({ player_id: String(c.player_id), name: c.name, role: c.role })),
  }))
} }

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'nfl'
  if (!FEATURED[sport]) return Response.json({ error: 'no write-ups for this sport yet' }, { status: 404 })
  const games = await FEATURED[sport]()
  return Response.json({ sport, games }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } })
}
