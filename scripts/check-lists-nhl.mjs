// LAMP list posts: pure rules on TEST data, then the live IRON MAN list (dry run).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lists-nhl.mjs [--offline]
import { seasonIdFor, everyGameSkaters, byPlayerGames, runFromEnd, ironManList, pointEveryGameList, goalStreakList } from '../lib/lists/nhl.js'
import { listText } from '../lib/lists/shape.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
check(seasonIdFor('2026-09-27') === '20262027' && seasonIdFor('2027-04-10') === '20262027' && seasonIdFor('2026-08-01') === '20252026', 'season id: a new season from September')
const tg = new Map([['TST', 82], ['TSX', 82]])
const e = everyGameSkaters([{ playerId: 1, skaterFullName: 'TEST A', teamAbbrevs: 'TST', gamesPlayed: 82 }, { playerId: 2, skaterFullName: 'TEST B', teamAbbrevs: 'TST,TSX', gamesPlayed: 82 }, { playerId: 3, skaterFullName: 'TEST C', teamAbbrevs: 'TSX', gamesPlayed: 81 }], tg)
check(e.has(1) && !e.has(2) && !e.has(3), 'TEST: every game of one club counts; a traded season or a missed game does not')
check(JSON.stringify(runFromEnd([1, 2, 3, 4], new Set([1, 3, 4]))) === '{"run":2,"whole":false}', 'TEST: run from the end stops at the first missed game')
const pg = byPlayerGames([
  { playerId: 7, skaterFullName: 'TEST G', teamAbbrev: 'TST', gameId: 11, gameDate: '2026-10-01', goals: 1, points: 1 },
  { playerId: 7, skaterFullName: 'TEST G', teamAbbrev: 'TST', gameId: 12, gameDate: '2026-10-03', goals: 0, points: 2 },
])
check(pg.players.get(7).games.length === 2 && pg.teams.get('TST').join() === '11,12', 'TEST: per-game rows -> his games in order, his club\'s games in order')

const { nhlListOrder } = await import('../lib/lists/post.js')
check(nhlListOrder('2026-10-05').join() === 'iron_man' && nhlListOrder('2026-10-06').join() === 'goal_streak,point_every_game', 'Mondays IRON MAN; other days goal streaks, else a point in every game')
if (!process.argv.includes('--offline')) {
  const { nhlSeasonStarted } = await import('../lib/lists/nhl.js')
  check((await nhlSeasonStarted('2026-09-27')) === false, 'before opening night: the season has not started -> no NHL list posts')
  const t0 = Date.now()
  const iron = await ironManList('2026-09-27')
  const t = listText(iron)
  console.log(`   iron man built in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  check(Boolean(t) && t.length <= 280, `IRON MAN (before opening night: through 2025-26): ${iron?.rows.length} rows, ${t?.length} chars`)
  console.log(`--- IRON MAN (dry run) ---\n${t}\n`)
  const [pe, gs] = await Promise.all([pointEveryGameList('2026-09-27'), goalStreakList('2026-09-27')])
  check(pe && pe.rows.length === 0 && gs && gs.rows.length === 0, 'no games yet in 2026-27: point-every-game and goal-streak lists are empty (nothing posts)')
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
