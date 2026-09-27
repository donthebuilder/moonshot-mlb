// lib/nhl/boardRead.js readLocked: the second read of a night returns the same
// rows and pulls only the freshness probes from Supabase. Live, read only
// (production via .env.local); counts Supabase response bytes.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-log-cache.mjs [YYYY-MM-DD]
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })

let bytes = 0
const realFetch = globalThis.fetch
globalThis.fetch = async (...a) => {
  const res = await realFetch(...a)
  if (String(a[0]?.url || a[0]).includes('supabase')) bytes += (await res.clone().arrayBuffer()).byteLength
  return res
}
const { readLocked } = await import('../lib/nhl/boardRead.js')
const date = process.argv[2] || '2026-09-26'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
bytes = 0
const a = await readLocked(date)
const cold = bytes
bytes = 0
const b = await readLocked(date)
const warm = bytes
check(a.locked.length > 0 && a.locked === b.locked, `${date}: ${a.locked.length} log rows, warm read returns the cached rows`)
check(b.games.length === a.games.length, `games re-read every time (${b.games.length} rows)`)
check(warm < cold / 5, `Supabase bytes: cold ${(cold / 1024).toFixed(0)} KB -> warm ${(warm / 1024).toFixed(0)} KB (games only)`)
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
