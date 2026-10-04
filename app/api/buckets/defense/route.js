// GET /api/buckets/defense?date=YYYY-MM-DD -- what each club ALLOWS a game
// (ESPN byteam's Opponent block: points, rebounds, assists, threes, FG%), each
// with its rank among the 30 (1 = gives up the most), plus that day's games so
// the page can set each side's attack against the other's defence. The season
// is the one BUCKETS reads (last season's until this one has games, said so). Gated.
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { scoreboardFor, reduceScoreboard } from '../../../../lib/nba/api'
import { nbaTeam } from '../../../../lib/nba/teams'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
const KEYS = ['oppPts', 'oppReb', 'oppAst', 'oppTpm', 'oppFgPct']
export const GET = bucketsRoute('defense', async (q) => {
  // the slate still being played, not the ET calendar day (2026-10-04 day rule; LAMP 3bde1ca)
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const sn = await nbaSeason()
  const [s, board] = await Promise.all([seasonStats(sn.read), scoreboardFor(date)])
  const teams = [...s.teams.values()].map((t) => {
    const tm = nbaTeam(t.abbrev)
    return { abbrev: t.abbrev, name: tm ? `${tm.place} ${tm.nick}` : t.abbrev, oppPts: t.oppPts, oppReb: t.oppReb, oppAst: t.oppAst, oppTpm: t.oppTpm, oppFgPct: t.oppFga ? t.oppFgm / t.oppFga : null }
  })
  // rank 1 = allows the most (the softest defence for that stat)
  for (const k of KEYS) {
    const order = teams.filter((t) => t[k] != null).sort((a, b) => b[k] - a[k])
    order.forEach((t, i) => { (t.ranks ||= {})[k] = i + 1 })
  }
  return ok({ date, season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale, teams, games: reduceScoreboard(board), fetchedAt: new Date().toISOString() }, 900)
})
