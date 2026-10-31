// GET /api/lamp/without?pid=<NHL player id> -- his teammates, each with the game ids he dressed for and the ones he missed while on the club
// (lib/nba/without.js matesFrom, the same function BUCKETS runs), every club-season lamp_box holds for him. The page joins them to his own
// splits rows by game id. lamp_box = one row per dressed player per game (supabase/migrations/202610252200_lamp_box.sql), so "his club played
// and he has no row" = he did not dress (a healthy scratch counts, same as a BUCKETS DNP). Goalies are left out of the teammates: a backup is
// "out" most nights and that is not news. Small answer (ids, ~25 men a club); the CDN holds it 6 hours (egress). No table yet = an empty list.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad } from '../../../../lib/nhl/respond'
import { matesFrom } from '../../../../lib/nba/without'

export const dynamic = 'force-dynamic'
const COLS = 'game_id, game_date, season, team, player_id, name, points, pos'
const TYPES = [2, 3]      // regular season + playoffs, like his splits rows

async function all(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await q().range(from, from + 999)
    if (r.error) throw new Error(r.error.message)
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}

export async function GET(request) {
  const pid = new URL(request.url).searchParams.get('pid') || ''
  if (!/^\d{7}$/.test(pid)) return bad('pid must be the 7-digit NHL player id')
  const db = adminClient()
  if (!db) return bad('no database')
  try {
    const mine = await all(() => db.from('lamp_box').select('season, team').eq('player_id', pid).in('game_type', TYPES).order('game_id', { ascending: true }))
    const clubs = [...new Map(mine.map((r) => [`${r.season}|${r.team}`, r])).values()]
    const rows = (await Promise.all(clubs.map((c) => all(() => db.from('lamp_box').select(COLS).eq('season', c.season).eq('team', c.team).in('game_type', TYPES)
      .order('game_id', { ascending: true }).order('player_id', { ascending: true }))))).flat()
    const skaters = rows.filter((r) => r.pos !== 'G')
    const mateIds = [...new Set(skaters.map((r) => String(r.player_id)).filter((x) => x !== pid))]
    const seasons = [...new Set(clubs.map((c) => c.season))]
    const otherRows = mateIds.length
      ? await all(() => db.from('lamp_box').select('player_id, season, team, game_date').in('player_id', mateIds).in('season', seasons).in('game_type', TYPES)
        .order('game_id', { ascending: true }).order('player_id', { ascending: true }))
      : []
    return ok({ pid, mates: matesFrom(skaters, otherRows, pid, { val: (r) => r.points }) }, 21600)
  } catch (e) {
    const missing = /lamp_box/.test(String(e?.message))
    return ok({ pid, mates: [], why: missing ? 'LAMP’s box scores are not on file yet' : 'the box scores are delayed' }, 60)
  }
}
