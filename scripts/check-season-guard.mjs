// Offseason guard (lib/dash/seasonGuard.js): pure checks + two live statsapi
// asks (today should be ON in late September; mid-December OFF).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-season-guard.mjs [--offline]
import { seasonWindow, seasonVerdict, mlbSeasonActive } from '../lib/dash/seasonGuard.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }

const w = seasonWindow('2026-12-31')
check(w.start === '2026-12-28' && w.end === '2027-01-03', 'window: 3 back, 3 ahead, across a year end')
check(seasonVerdict(null, w).active === true, 'unreadable schedule -> fails open')
check(seasonVerdict({ totalGames: 0 }, w).active === false, 'zero games -> off')
check(seasonVerdict({ totalGames: 4 }, w).active === true, 'games -> on')
check(seasonVerdict({ dates: [{ games: [{}, {}] }] }, w).games === 2, 'no totalGames field -> counts dates[].games')
check(seasonVerdict({ totalGames: 'x' }, w).active === true, 'garbage count -> fails open')

if (!process.argv.includes('--offline')) {
  const on = await mlbSeasonActive('2026-09-27')
  check(on.active === true && on.games > 0, `live 2026-09-27: ${on.why}`)
  const off = await mlbSeasonActive('2025-12-15')
  check(off.active === false && off.games === 0, `live 2025-12-15: ${off.why}`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
