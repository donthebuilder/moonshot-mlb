// GET /api/buckets/lineups?date=YYYY-MM-DD -- who ESPN lists as STARTING tonight, per game (gated). ESPN's core roster carries `starter`
// once the lineups are in (lib/nba/api startersFor); before that a side is empty and the game says lineup EXPECTED, not confirmed.
// Read by the Openings tab's first-basket matchup (its "Lineup confirmed / expected" tag and the confirmed-starters filter). Cached 60 s.
import { scoreboardFor, reduceScoreboard, startersFor } from '../../../../lib/nba/api'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('lineups', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date)).filter((g) => g.state === 'pre' || g.state === 'live')
  const out = {}
  await Promise.all(games.map(async (g) => {
    const side = async (s) => [...(await startersFor(g.id, g[s].id).catch(() => new Set()))]
    const [away, home] = await Promise.all([side('away'), side('home')])
    out[g.id] = { away, home, known: away.length >= 5 && home.length >= 5 }
  }))
  return ok({ date, games: out, fetchedAt: new Date().toISOString() }, 60)
})
