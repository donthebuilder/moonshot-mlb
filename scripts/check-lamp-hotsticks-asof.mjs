// node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-hotsticks-asof.mjs
// LAMP hot sticks "as of the board's date" (2026-10-06): form comes from games
// STRICTLY BEFORE the date, so tonight's own game never counts as "last game".
// ALL DATA BELOW IS TEST DATA (invented skaters and games), not real results.
import { hotSticksFrom } from '../lib/nhl/hotSticks.js'
let bad = 0
const t = (name, cond) => { if (!cond) { bad++; console.log(`FAIL ${name}`) } else console.log(`ok   ${name}`) }
const g = (playerId, gameDate, goals, gameId) => ({ playerId, skaterFullName: `TEST ${playerId}`, teamAbbrev: 'TST', positionCode: 'C', gameDate, goals, shots: 3, timeOnIcePerGame: 1000, ppGoals: 0, gameId })
const rows = [g(1, '2026-10-01', 0, 1), g(1, '2026-10-03', 1, 2), g(1, '2026-10-05', 1, 3), g(1, '2026-10-06', 0, 4), g(1, '2026-10-07', 1, 5)]
const asOf = (d) => hotSticksFrom(rows, [], d).find((r) => r.id === '1')
t('as of 10-06: last game is 10-05 (the 10-06 game does not count)', asOf('2026-10-06').last === '2026-10-05')
t('as of 10-06: spark newest first = 1,1,0', asOf('2026-10-06').spark.map((x) => x[0]).join() === '1,1,0')
t('as of 10-06: three games (10-06 and 10-07 excluded)', asOf('2026-10-06').gp5 === 3)
t('as of 10-07: 10-06 counts, 10-07 does not', asOf('2026-10-07').last === '2026-10-06' && asOf('2026-10-07').gp5 === 4)
t('as of 10-05: only two games -> under the three-game floor, no row', asOf('2026-10-05') === undefined)
t('no date = every game as before', asOf(null).last === '2026-10-07' && asOf(null).gp5 === 5)
// GoalWatch reads spark[0] = last game and spark[1] = the one before (goals > 0)
const goal = (d, i) => Number(asOf(d)?.spark?.[i]?.[0]) > 0
t('as of 10-06: scored last game and the one before -> "goal in 2+ straight"', goal('2026-10-06', 0) && goal('2026-10-06', 1))
t('as of 10-07: last game (10-06) was a blank -> neither list', !goal('2026-10-07', 0))
// the route bounds form only when ?date= is given; every other caller stays on "now"
import { readFileSync } from 'node:fs'
const route = readFileSync(new URL('../app/api/lamp/hotsticks/route.js', import.meta.url), 'utf8')
t('route: no ?date= -> readHotSticks gets no date (asOf null)', /asOf = [^\n]*: null/.test(route) && route.includes('date: asOf'))
process.exit(bad ? 1 : 0)
