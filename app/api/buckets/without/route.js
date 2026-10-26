// GET /api/buckets/without?pid=<espn id> -- his teammates, each with the game ids he played and the ones he missed while
// on the club (lib/nba/without.js), every club-season buckets_box holds for him. The page joins them to his own game log.
// Small answer (ids, ~20 men a club); the CDN holds it 6 hours so a page view is not a Supabase read (egress). Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { matesFrom } from '../../../../lib/nba/without'

export const dynamic = 'force-dynamic'
const COLS = 'game_id, game_date, season, team, player_id, name, pts'

async function all(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await q().range(from, from + 999)
    if (r.error) throw new Error(r.error.message)
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}

export const GET = bucketsRoute('without', async (q) => {
  const pid = q.get('pid')
  if (!/^\d+$/.test(pid || '')) return bad('pid must be an ESPN player id')
  const db = adminClient()
  if (!db) return bad('no database')
  const mine = await all(() => db.from('buckets_box').select('season, team').eq('player_id', pid).eq('season_type', 2).order('game_id', { ascending: true }))
  const clubs = [...new Map(mine.map((r) => [`${r.season}|${r.team}`, r])).values()]
  const rows = (await Promise.all(clubs.map((c) => all(() => db.from('buckets_box').select(COLS).eq('season', c.season).eq('team', c.team).eq('season_type', 2).order('game_id', { ascending: true }).order('player_id', { ascending: true }))))).flat()
  const mateIds = [...new Set(rows.map((r) => String(r.player_id)).filter((x) => x !== pid))]
  const seasons = [...new Set(clubs.map((c) => c.season))]
  const otherRows = mateIds.length
    ? await all(() => db.from('buckets_box').select('player_id, season, team, game_date').in('player_id', mateIds).in('season', seasons).eq('season_type', 2).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
    : []
  return ok({ pid, mates: matesFrom(rows, otherRows, pid) }, 21600)
})
