// MLB list posts: the walk-back rule on TEST games, then this season's
// PLAYED EVERY GAME list printed with each player's games + team games and
// the streak math for the top one (the plan's test, before any post).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lists-mlb.mjs [--offline]
import { walkBack, playedEveryGameList } from '../lib/lists/mlb.js'
import { listText } from '../lib/lists/shape.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const G = (ids) => ids.map((gamePk) => ({ gamePk }))
check(JSON.stringify(walkBack(G([1, 2, 3, 4]), new Set([1, 2, 3, 4]))) === '{"run":4,"whole":true}', 'TEST: played all 4 -> run 4, whole season')
check(JSON.stringify(walkBack(G([1, 2, 3, 4]), new Set([1, 3, 4]))) === '{"run":2,"whole":false}', 'TEST: missed game 2 -> run 2 back from the end')
check(listText({ title: 'T:', rows: [{ name: 'A', fact: 'x' }] }) === null, 'a list under 2 rows does not post')

if (!process.argv.includes('--offline')) {
  const t0 = Date.now()
  const list = await playedEveryGameList(2026)
  console.log(`   built in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  check(list && list.rows.length >= 2, `2026: ${list?.rows.length} players played every game`)
  for (const d of list.detail) {
    const s = d.streak
    console.log(`   ${d.name.padEnd(22)} ${String(d.team).padEnd(7)} GP ${d.gp} / team ${d.teamGp}  streak ${s?.total ?? '?'}${s && !s.complete ? '+' : ''}  [${(s?.seasons || []).map((x) => `${x.season}:${x.run}/${x.of}`).join(' ')}]`)
  }
  const top = list.detail.slice().sort((a, b) => (b.streak?.total || 0) - (a.streak?.total || 0))[0]
  console.log(`   top streak math: ${top.name} = ${top.streak.seasons.map((x) => `${x.run} (${x.season}${x.run === x.of ? ', every game' : `, back to his last missed game`})`).join(' + ')} = ${top.streak.total}`)
  const text = listText(list)
  console.log('\n--- the post ---\n' + text + `\n--- ${text.length} chars ---`)
  check(text && text.length <= 280, 'fits one post')

  // The rest of the wrap, built + re-checked + printed (no post).
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
  const { createClient } = req('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { hrClubList, powerSpeedList, calledSeasonList, recheckMlbList } = await import('../lib/lists/mlb.js')
  const again = await recheckMlbList(list)
  check(again && again.rows.length === list.rows.length, `every-game list re-checked at post time: ${again?.rows.length} of ${list.rows.length} rows verified`)
  for (const [label, l] of [['40-HR club', await hrClubList(2026)], ['30-30', await powerSpeedList(2026)], ['CALLED IT season', await calledSeasonList(db, 2026, '2026-09-27')]]) {
    const v = await recheckMlbList(l, { db, lastRegularDay: '2026-09-27' })
    const t = listText(v)
    check(Boolean(t) && t.length <= 280, `${label}: ${v?.rows.length ?? 0} verified rows, ${t?.length ?? 0} chars`)
    console.log(`--- ${label} ---\n${t}\n`)
  }
}
const { regularSeasonEnd, nextInRotation } = await import('../lib/lists/post.js')
const end = regularSeasonEnd({ dates: [{ date: '2026-09-26', games: [{ status: { abstractGameState: 'Final', detailedState: 'Final' } }] }, { date: '2026-09-27', games: [{ status: { abstractGameState: 'Final', detailedState: 'Final' } }, { status: { abstractGameState: 'Final', detailedState: 'Cancelled' } }] }] })
check(end.last === '2026-09-27' && end.settled, 'TEST: season end = the last played date; a canceled game counts as settled')
check(regularSeasonEnd({ dates: [{ date: '2026-09-27', games: [{ status: { abstractGameState: 'Live', detailedState: 'In Progress' } }] }] }).settled === false, 'TEST: a game still in progress -> the season is not over, nothing posts')
check(nextInRotation(['a', 'b', 'c'], new Set(['a'])).join() === 'b,c', 'rotation: the lists not yet posted, in order')
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
