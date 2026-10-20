// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/check-defpos.mjs
// DEFENSE VS POSITION, PROVED (2026-10-19): buckets_defpos / buckets_posvs over buckets_box (2025-26) give the numbers
// the mock was built from (scratch pull of the same 1,231 ESPN box scores): UTAH gave guards the most points, 64.6 a
// game; every window has 30 clubs ranked 1..30; posvs rows carry an average from the player's OTHER games. One small
// read each (the org is at its egress limit: no raw rows).
import { createClient } from '@supabase/supabase-js'
import { rankDefPos, fewestGames, vsRows, beatShare, POSITIONS, WINDOWS, DEF_STATS } from '../lib/nba/defPos.js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
let bad = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) bad++ }

const d = await db.rpc('buckets_defpos', { p_season: 2026 })
ok(!d.error, `buckets_defpos(2026) answers${d.error ? `: ${d.error.message}` : ` (${d.data.length} rows)`}`)
const R = rankDefPos(d.data || [])
for (const p of POSITIONS) for (const [w] of WINDOWS) {
  const t = R[p]?.[w] || {}
  ok(Object.keys(t).length === 30, `${p} ${w}: 30 clubs (${Object.keys(t).length})`)
  for (const [k] of DEF_STATS) { const rs = Object.values(t).map((x) => x.r[k]); if (Math.min(...rs) !== 1 || Math.max(...rs) > 30) ok(false, `${p} ${w} ${k} ranks run 1..30`) }
}
const utah = R.G?.Season?.UTAH
ok(utah?.v.pts === 64.6 && utah?.r.pts === 1, `UTAH gave guards the most points 2025-26: ${utah?.v.pts} (#${utah?.r.pts}), mock 64.6 (#1)`)
ok(R.G?.L5?.BOS?.gp === 5 && R.G?.L10?.BOS?.gp === 10, 'L5 / L10 windows hold 5 / 10 games')
ok(fewestGames(R) >= 80, `every club has its season (fewest ${fewestGames(R)} games)`)

const v = await db.rpc('buckets_posvs', { p_season: 2026, p_opp: 'BOS', p_pos: 'G' })
ok(!v.error, `buckets_posvs(2026, BOS, G) answers${v.error ? `: ${v.error.message}` : ` (${v.data.length} rows)`}`)
const rows = vsRows(v.data || [], 'pts')
ok(rows.length > 100 && rows.every((r) => r.gp >= 5 && r.avg != null), `starting guards vs BOS, each with his own average (${rows.length})`)
const s = beatShare(rows)
ok(s.of === rows.length, `beat-share counts every row (${s.beat} of ${s.of})`)
console.log(bad ? `\n${bad} FAILED` : '\nall green')
process.exit(bad ? 1 : 0)
