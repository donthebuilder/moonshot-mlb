// GET /api/buckets/posvs?opp=BOS&pos=G -- every starter at that position who played that club, newest first, each with
// his own averages in his OTHER games that season (buckets_posvs; lib/nba/defPos.js). The season defense vs position
// reads (this season once every club has 5 games, else last season). Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { nbaTeam } from '../../../../lib/nba/teams'
import { readDefPos } from '../../../../lib/nba/defPosRead'
import { POSITIONS } from '../../../../lib/nba/defPos'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('posvs', async (q) => {
  const db = adminClient()
  if (!db) return bad('no database')
  const opp = nbaTeam(q.get('opp')) ? String(q.get('opp')).toUpperCase() : null
  const pos = POSITIONS.includes(q.get('pos')) ? q.get('pos') : null
  if (!opp || !pos) return bad('opp=CODE and pos=G|F|C')
  const d = await readDefPos(db)
  if (!d.season) return ok({ opp, pos, season: null, rows: [] }, 900)
  const r = await db.rpc('buckets_posvs', { p_season: d.season, p_opp: opp, p_pos: pos })
  if (r.error) throw new Error(`buckets_posvs: ${r.error.message}`)
  return ok({ opp, pos, season: d.season, seasonLabel: d.seasonLabel, stale: d.stale, rows: r.data || [] }, 900)
})
