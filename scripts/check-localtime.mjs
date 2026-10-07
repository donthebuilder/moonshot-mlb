// lib/localTime.js, deterministic (2026-10-07). Fixed TEST timestamps, three zones.
// Re-runs itself with TZ set, because the formatter reads the process zone (= the browser's).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ZONES = {
  'America/Phoenix': { t: '5:15 PM MST', d: 'Wed, 5:15 PM MST', stamp: 'Oct 6, 6:51 PM MST', odds: 'Oct 6, 9:00 PM MST', et1: '10:00 PM MST' },
  'America/New_York': { t: '8:15 PM EDT', d: 'Wed, 8:15 PM EDT', stamp: 'Oct 6, 9:51 PM EDT', odds: 'Oct 7, 12:00 AM EDT', et1: '1:00 AM EDT' },
  'Europe/London': { t: '1:15 AM GMT+1', d: 'Thu, 1:15 AM GMT+1', stamp: 'Oct 7, 2:51 AM GMT+1', odds: 'Oct 7, 5:00 AM GMT+1', et1: '6:00 AM GMT+1' },
}
const zone = process.env.CHECK_LT_ZONE
if (!zone) {
  let bad = 0
  for (const z of Object.keys(ZONES)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: z, CHECK_LT_ZONE: z, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' })
    process.stdout.write(r.stdout); if (r.status) bad++
  }
  console.log(bad ? `localTime: ${bad} zone(s) FAILED` : 'localTime: OK in 3 zones (Phoenix, New York, London)')
  process.exit(bad ? 1 : 0)
}
const { localTime, localDayTime, localStamp, etWallInstant } = await import('../lib/localTime.js')
const T = Date.UTC(2026, 9, 8, 0, 15)            // TEST: Oct 8 2026 00:15 UTC
const NOW = Date.UTC(2026, 9, 8)                 // TEST clock
const x = ZONES[zone]
const got = {
  t: localTime(T), d: localDayTime(T),
  stamp: localStamp('Oct 7, 1:51 AM UTC', { now: NOW }),
  odds: localStamp('07 Oct 2026 04:00 UTC', { now: NOW }),   // the Odds board's own form (TEST value)
  et1: localTime(etWallInstant(1, T)),
}
let bad = 0
for (const k of Object.keys(x)) { const ok = got[k] === x[k]; if (!ok) bad++; console.log(`  ${zone.padEnd(17)} ${k.padEnd(5)} ${ok ? 'ok  ' : 'FAIL'} ${got[k]}${ok ? '' : `   (want ${x[k]})`}`) }
// unusable input never throws and never prints a made-up time
for (const v of [null, undefined, 'junk', NaN]) if (localTime(v) !== '') { bad++; console.log('  FAIL bad input', v) }
if (localStamp('whenever') !== 'whenever') { bad++; console.log('  FAIL unparseable stamp must come back unchanged') }
// hydration: the server (no window) and the client's first render both use the fallback; see components/LocalAt.js
process.exit(bad ? 1 : 0)
