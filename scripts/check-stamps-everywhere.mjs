// STAMPS EVERYWHERE (2026-10-13): the rules of where a situation stamp may go. TEST data only, no network.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-stamps-everywhere.mjs
import { readFileSync } from 'node:fs'
import { stampsFor, BANNED } from '../lib/cards/situations.js'
import { assets, stampPlan, posterStamps, PORTRAIT_W } from '../lib/cards/posterKit.js'
import { POSTSEASON_STAMP_KEYS } from '../lib/cards/postseasonCard.js'
import { stampsForCard } from '../lib/cards/situationData.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
await assets()

// ONE slot on a single-player poster: the first stamp that wraps into two lines at the 22px floor; a cut fact is never printed
const T = (text) => ({ key: 'streak', text })
const a = stampPlan([T('Goal in 5 straight')], PORTRAIT_W)
check(a && a.lines.length <= 2 && a.size >= 22 && a.w <= PORTRAIT_W - 2 - 28, 'poster stamp: "Goal in 5 straight" wraps inside the portrait at 22px or more')
check(stampPlan([], PORTRAIT_W) === null && stampPlan(null, PORTRAIT_W) === null, 'poster stamp: none = nothing drawn')
const long = 'First career postseason home run in a road game against a division rival'
check(stampPlan([T(long)], PORTRAIT_W) === null, 'poster stamp: a fact that cannot fit in two lines is skipped, never cut')
const b = stampPlan([T(long), T('2 HR from 30')], PORTRAIT_W)
check(b && b.text === '2 HR from 30', 'poster stamp: the next stamp is used when the first cannot fit')
check((await posterStamps({ stamps: [T('x')] })).length === 1 && (await posterStamps({ stamps: [] })).length === 0, 'poster stamp: a list the caller passes (a test, a preview) is used as is')
check((await posterStamps({ sport: 'mlb', playerId: '', day: '2026-10-12' })).length === 0 && (await posterStamps({})).length === 0, 'poster stamp: no player or no day = none, and no read is made')

// PICK CARDS AND POSTERS use PREGAME stamps only: never a season-high or a "first" (both are things a game DID)
const g = (day, o = {}) => ({ day, goals: 1, hr: 1, td: 1, shots: 8, ...o })
const log = [g('2026-10-10'), g('2026-10-08'), g('2026-10-06'), g('2026-10-04'), g('2026-10-02'), g('2026-09-28'), g('2026-09-26')]
const pre = stampsFor({ sport: 'nhl', day: '2026-10-12', phase: 'pre', log, firstOfSeason: { stat: 'goals', thisGame: 1, before: 0 }, firstPostseason: { stat: 'goals', thisGame: 1, careerBefore: 0 }, postseason: { type: 'P', roundName: 'First Round' } }, { limit: 99 })
check(pre.length > 0 && !pre.some((s) => s.key === 'high' || s.key === 'first'), `pregame: no season-high and no first (got ${pre.map((s) => s.key).join(', ')})`)
check(pre.some((s) => s.key === 'streak') && pre.some((s) => s.key === 'postseason'), 'pregame: the streak coming in and the round are allowed')
check(!pre.some((s) => BANNED.test(s.text)), 'pregame: no banned word')

// POSTSEASON CARDS: only NEW facts (first career postseason, streak, milestone), never the round
check(POSTSEASON_STAMP_KEYS.join() === 'first,streak,milestone' && !POSTSEASON_STAMP_KEYS.includes('postseason'), 'postseason cards: the allowed kinds are first, streak, milestone; never the round')
const ctx = { sport: 'mlb', day: '2026-10-12', phase: 'post', postseason: { type: 'D', roundName: 'Division Series' }, firstPostseason: { stat: 'hr', thisGame: 1, careerBefore: 0 } }
const ps = stampsFor(ctx, { only: POSTSEASON_STAMP_KEYS })
check(ps.length === 1 && ps[0].text === 'First career postseason HR', 'postseason card: his first career postseason HR is stamped, the round is not')
check(stampsFor(ctx).some((s) => s.key === 'postseason'), 'postseason card: without the filter the round would have been stamped (the filter is what keeps it off)')
check(stampsFor({ ...ctx, firstPostseason: { stat: 'hr', thisGame: 1, careerBefore: 3 } }, { only: POSTSEASON_STAMP_KEYS }).length === 0, 'postseason card: a man with career postseason homers has no "first" stamp')
check((await stampsForCard({ sport: 'zzz', playerId: '1', day: '2026-10-12', only: POSTSEASON_STAMP_KEYS })).length === 0, 'stampsForCard: an unknown sport reads nothing and answers none')

// LISTS get no stamp: a poster that lists several players does not draw a Portrait at all
const home = readFileSync(new URL('../lib/dash/homerCard.js', import.meta.url), 'utf8')
for (const fn of ['recapCard', 'pregameCard', 'pairsCard', 'statCard', 'numerologyCard']) {
  const i = home.indexOf(`export async function ${fn}(`)
  const j = home.indexOf('\nexport async function', i + 10)
  const body = home.slice(i, j < 0 ? undefined : j)
  check(i > 0 && !/<Portrait|stamps=|posterStamps/.test(body), `list poster ${fn}: no stamp`)
}

process.exit(failed ? 1 : 0)
