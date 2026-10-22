// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-nba-pos5.mjs [--season 2027] [--dry]
//
// Fills buckets_box.pos5 (PG..C, lib/nba/depth.js) on a season's rows the tick graded before the pos5 tag shipped
// (2026-10-21: the 2026-27 opening week). Reads each club's depth chart TODAY, so run it only for the season under way
// and only in its first days; never for an old season (a man traded since would get his new club's slot). Writes only
// rows whose pos5 is null; a man today's chart doesn't list stays null.
import { createClient } from '@supabase/supabase-js'
import { pos5For } from '../lib/nba/depth.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const season = Number(arg('--season', '2027'))
const dry = process.argv.includes('--dry')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const r = await db.from('buckets_box').select('game_id, player_id, team').eq('season', season).is('pos5', null).limit(5000)
if (r.error) throw new Error(r.error.message)
const rows = r.data || []
const clubs = [...new Set(rows.map((x) => x.team))]
let set = 0, none = 0
for (const team of clubs) {
  const map = await pos5For(team)
  for (const x of rows.filter((y) => y.team === team)) {
    const pos5 = map.get(String(x.player_id))
    if (!pos5) { none += 1; continue }
    if (!dry) {
      const u = await db.from('buckets_box').update({ pos5 }).eq('game_id', x.game_id).eq('player_id', x.player_id).is('pos5', null)
      if (u.error) throw new Error(`${x.game_id}/${x.player_id}: ${u.error.message}`)
    }
    set += 1
  }
}
console.log(`season ${season}: ${rows.length} untagged rows, ${clubs.length} clubs; ${dry ? 'would tag' : 'tagged'} ${set}, not on a chart ${none}`)
