// TUDDY list posts: rules on TEST logs, then the live lists (dry run).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lists-nfl.mjs [--offline]
import { clubWeeks, tdEveryGameRows, hundredStreakRows, tdEveryGameList, hundredStreakList, recheckNflList } from '../lib/lists/nfl.js'
import { listText } from '../lib/lists/shape.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const week = { season: 2026, week: 3, players: [{ player_id: 'A', name: 'TEST A', team: 'TST' }, { player_id: 'B', name: 'TEST B', team: 'TST' }, { player_id: 'C', name: 'TEST C', team: 'TSX' }] }
const row = (w, tm, td, ruyd = 0) => ({ s: 2026, w, tm, g_td: td, g_ruyd: ruyd, g_recyd: 0 })
const logs = { logs: {
  A: { log: [row(1, 'TST', 1, 110), row(2, 'TST', 2, 105), row(3, 'TST', 1, 120)] },   // TD every game, 3 x 100 yds
  B: { log: [row(1, 'TST', 1), row(3, 'TST', 1)] },                                       // missed week 2 of TST's
  C: { log: [row(1, 'TSX', 1, 130), row(2, 'TSX', 0, 90), row(3, 'TSX', 1, 101)] },     // TD streak broken; 100-yd run broken
} }
check(clubWeeks(logs, 2026).get('TST').size === 3, 'TEST: a club\'s games = the weeks its players logged')
const td = tdEveryGameRows(week, logs)
check(td.length === 1 && td[0].id === 'A' && td[0].fact === '4 TD in 3 games', `TEST: TD in every game -- A yes; B missed a club game; C blanked week 2 (${td.map((r) => r.id).join()})`)
const hs = hundredStreakRows(week, logs)
check(hs.length === 1 && hs[0].id === 'A' && hs[0].check.streak === 3, 'TEST: 100+ yards 3 straight -- A yes, C broken at week 2')

if (!process.argv.includes('--offline')) {
  for (const l of [await tdEveryGameList(), await hundredStreakList()]) {
    const v = await recheckNflList(l)
    const t = listText(v)
    console.log(`--- ${l?.kind}: ${l?.rows.length} rows, ${v?.rows.length ?? 0} verified${t ? `, ${t.length} chars` : ' -- under 2 rows: does not post'} ---\n${t || ''}\n`)
    check(!t || t.length <= 280, `${l?.kind}: fits one post, or does not post`)
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
