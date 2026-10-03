// GET /api/buckets/leaders -- who leads the league per category (min 20 games), measured. Gated.
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
const CATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['tpm', 'Threes made'], ['min', 'Minutes']]
export const GET = bucketsRoute('leaders', async () => {
  const sn = await nbaSeason()
  const s = await seasonStats(sn.read)
  const all = [...s.athletes.values()]
  const minGp = all.some((a) => (a.gp || 0) >= 20) ? 20 : 1
  const pool = all.filter((a) => (a.gp || 0) >= minGp)
  const categories = CATS.map(([k, label]) => ({ key: k, label, leaders: pool.filter((a) => a[k] != null).sort((a, b) => b[k] - a[k]).slice(0, 10).map((a) => ({ id: a.id, name: a.name, team: a.team, value: a[k], gp: a.gp })) }))
  return ok({ season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale, minGames: minGp, categories }, 3600)
})
