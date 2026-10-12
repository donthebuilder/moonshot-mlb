#!/usr/bin/env node
// THE SLIM LOG INDEX reads the same as the full log (teamTdModel.teamGames / slateTotals), on TEST data -- invented clubs and players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-log-index.mjs
import { teamGames, slateTotals } from '../lib/nfl/teamTdModel.js'
import { nflPlayerLogPaths, nflLogIndexLooksReal } from '../lib/nfl/dataSource.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const g = (s, w, tm, opp, td, h = 1) => ({ s, w, tm, opp, g_td: td, h, d: '2099-01-01' })
// TEST: three clubs over four weeks; two tracked players each, summed per club per game.
const logs = { logs: {} }
const clubs = ['AAA', 'BBB', 'CCC']
let n = 0
for (let w = 1; w <= 4; w += 1) for (let i = 0; i < 3; i += 1) for (const k of [0, 1]) {
  const tm = clubs[i]; const opp = clubs[(i + w) % 3 === i ? (i + 1) % 3 : (i + w) % 3]
  const id = `p${i}${k}`
  ;(logs.logs[id] ||= { log: [] }).log.push(g(2099, w, tm, opp, (w + i + k) % 3))
  n += 1
}
const rows = teamGames(logs)
const index = { team_games: rows.map((r) => ({ ...r })), players: 6 }
const fromIndex = teamGames(index)
check(JSON.stringify(fromIndex) === JSON.stringify(rows), 'teamGames(index) returns exactly the rows teamGames(full log) builds')
const week = { season: 2099, week: 5, mode: 'week', games: [{ game_id: 'g1', away: 'AAA', home: 'BBB' }, { game_id: 'g2', away: 'CCC', home: 'AAA' }] }
const a = slateTotals(week, logs); const b = slateTotals(week, index)
check(Object.keys(a).length === 2 && JSON.stringify(a) === JSON.stringify(b), 'slateTotals gives the same totals and heat from the index as from the full log')
check(teamGames({ team_games: [{ s: 2099, w: 1, tm: 'AAA' }, null, { s: 2099, w: 2, tm: 'AAA', opp: 'BBB', td: 'x' }] }).length === 1, 'a malformed index row is dropped, a non-numeric td counts 0')
check(nflLogIndexLooksReal(index) && !nflLogIndexLooksReal({ team_games: [] }) && !nflLogIndexLooksReal(null), 'an empty or missing index is not "real" (the full file is used)')
check(nflPlayerLogPaths('00-0033280')[0].endsWith('/nfl_logs/00-0033280.json') && nflPlayerLogPaths('../x').length === 0, "a player's log path is his id under nfl_logs/; an unsafe id gets no path")
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
