// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/audit-homer-feed.mjs [--since 2026-08-22] [--void]
// THE HOME-RUN AUDIT (2026-10-31): every homer_feed man-game since a day against the league's FINAL box score of HIS GAME (the row's game_pk, never the date).
// Prints the rows above his box-score home runs (the feed read a homer that was overturned or corrected). With --void each is copied to homer_feed_voids and
// removed (lib/dash/homerVoid.js; needs supabase/migrations/202610311600_homer_feed_voids.sql). A game not Final or unreadable is never judged. Read-only without --void.
import { createClient } from '@supabase/supabase-js'
import { falseRows, gameBoxes, voidFalseHomers } from '../lib/dash/homerVoid.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SINCE = arg('--since', '2026-08-22'), DO = process.argv.includes('--void')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('homer_feed').select('day,game_pk,player_id,name,hr_n,role,on_board').gte('day', SINCE).not('game_pk', 'is', null).order('day').order('player_id').order('hr_n').range(from, from + 999)
  if (error) throw new Error(error.message)
  rows.push(...data)
  if (data.length < 1000) break
}
const pks = [...new Set(rows.map((r) => r.game_pk))]
const boxes = {}
for (let i = 0; i < pks.length; i += 8) Object.assign(boxes, await gameBoxes(pks.slice(i, i + 8)))
const judged = new Set(Object.entries(boxes).filter(([, b]) => b.final).map(([pk]) => pk))
const bad = falseRows(rows, boxes)
console.log(`${rows.length} feed rows, ${pks.length} games (${pks.length - judged.size} not final / unreadable, never judged): ${bad.length} false`)
for (const r of bad) console.log(`  ${r.day} ${r.name} hr #${r.hr_n} (game ${r.game_pk}, role ${r.role || '-'}, on board ${r.on_board}): his game's box score has ${r._box}`)
if (DO) {
  for (const d of [...new Set(bad.map((r) => r.day))]) { const out = await voidFalseHomers(db, d, boxes); console.log(`  ${d}: voided ${out.voided.length}${out.error ? ` (${out.error})` : ''}`) }
}
