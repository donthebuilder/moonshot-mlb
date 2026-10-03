// GET /api/buckets/players -- every player on ESPN's league stats read (this
// season, else last), for the directory and search. Gated.
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('players', async () => {
  const sn = await nbaSeason()
  const s = await seasonStats(sn.read)
  const players = [...s.athletes.values()].map((a) => ({ id: a.id, name: a.name, team: a.team, pos: a.pos, gp: a.gp, min: a.min, pts: a.pts, reb: a.reb, ast: a.ast, tpm: a.tpm }))
  return ok({ season: sn.read, seasonLabel: seasonLabel(sn.read), stale: sn.stale, players }, 3600)
})
