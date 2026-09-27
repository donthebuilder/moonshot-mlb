// October homer counts: an October homer is counted in the postseason, never
// added to the regular-season total (BATCH-LIST-POSTS step 6). TEST rows only
// (made-up players), plus the live postseason start date.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-postseason-counts.mjs [--offline]
import { hooksFor, numerologyMoment } from '../lib/dash/homerFeed.js'
import { firstDate, postseasonOn } from '../lib/dash/seasonGuard.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
// A thin history (hist < majority called) so the season-count hook branch runs.
const ctx = { history: [{ role: null }, { role: null }, { role: null }], jersey: 39 }
const ev = (stats) => ({ player_id: '900001', name: 'TEST Hitter', hr_n: 1, role: null, stats: { season_hr: 38, ...stats } })

const reg = hooksFor(ev({}), ctx)
check(reg.some((h) => h === '⚾ His 39th homer of the season'), `regular season: "His 39th homer of the season" (${reg.join(' | ')})`)
check(reg.some((h) => /HR #39 in jersey #39/.test(h)), 'regular season: the jersey digit-root line still fires')
const oct = hooksFor(ev({ postseason: true, post_nth: 2 }), ctx)
check(oct.includes('⚾ His 2nd homer this postseason'), `postseason: "His 2nd homer this postseason" (${oct.join(' | ')})`)
check(!oct.some((h) => /of the season|HR #\d+/.test(h)), 'postseason: no "of the season" / "HR #N" line built from 38 + 1')
const ev40 = { ...ev({ postseason: true, post_nth: 1 }), stats: { season_hr: 39, postseason: true, post_nth: 1 } }
check(!hooksFor(ev40, ctx).some((h) => /HR #40/.test(h)), 'postseason: a 39-HR hitter\'s October homer is not "HR #40 of the season"')
const unk = hooksFor(ev({ postseason: null }), ctx)
check(!unk.some((h) => /of the season|this postseason|HR #\d+/.test(h)), `season unknown: no count line at all (${unk.join(' | ') || 'none'})`)

const m = numerologyMoment([{ player_id: '1', name: 'TEST A', hr_n: 1, stats: { season_hr: 38, jersey: 39, postseason: true, post_nth: 1 } }])
check(!m || m.nth == null || m.nth !== 39, 'numerology moment: an October homer is not the season\'s 39th')

check(firstDate({ dates: [{ date: '2026-10-03' }, { date: '2026-09-29' }] }) === '2026-09-29' && firstDate({ dates: [] }) === null, 'firstDate: earliest scheduled postseason date')
if (!process.argv.includes('--offline')) {
  const [sun, tue, oct5] = await Promise.all([postseasonOn('2026-09-27'), postseasonOn('2026-09-29'), postseasonOn('2026-10-05')])
  check(sun.postseason === false && tue.postseason === true && oct5.postseason === true && tue.start === '2026-09-29', `live: 09-27 regular (${sun.postseason}), 09-29 postseason (${tue.postseason}, starts ${tue.start}), 10-05 postseason (${oct5.postseason})`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
