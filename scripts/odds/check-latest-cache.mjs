// lib/odds/latest.js cache: the second call for the same day returns the same
// body and pulls only the freshness probes, not the snapshot rows. Live, read
// only (production Supabase via .env.local); counts response bytes.
//   node --import ./scripts/_esm-resolve.mjs scripts/odds/check-latest-cache.mjs [YYYY-MM-DD]
import { createRequire } from 'node:module'
import { mlbLatestOdds, nflLatestOdds } from '../../lib/odds/latest.js'

const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
let bytes = 0
const counting = async (...a) => {
  const res = await fetch(...a)
  const buf = await res.clone().arrayBuffer()
  bytes += buf.byteLength
  return res
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: counting } })
const day = process.argv[2] || new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
for (const [name, fn] of [['mlb', mlbLatestOdds], ['nfl', nflLatestOdds]]) {
  bytes = 0
  const a = await fn(db, day)
  const cold = bytes
  bytes = 0
  const b = await fn(db, day)
  const warm = bytes
  check(a === b && JSON.stringify(a) === JSON.stringify(b), `${name} ${day}: warm call returns the cached body (${Object.keys(a.by_player_id).length} players)`)
  check(warm < 2048 && warm < cold, `${name}: cold ${(cold / 1024).toFixed(0)} KB -> warm ${(warm / 1024).toFixed(1)} KB from Supabase`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
