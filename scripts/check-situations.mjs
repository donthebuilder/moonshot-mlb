// SITUATION STAMPS (lib/cards/situations.js): every rule against TEST contexts (all values below are labelled test data, none is a real player's).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-situations.mjs
import { SITUATIONS, SITUATION_KEYS, stampsFor, MAX_STAMPS, BANNED, MILESTONES } from '../lib/cards/situations.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const one = (ctx, key) => stampsFor(ctx, { limit: 99 }).find((s) => s.key === key)?.text ?? null

// TEST data: a log newest first
const g = (day, o = {}) => ({ day, ...o })
const DAY = '2026-10-12'

// ── the config ──
check(SITUATIONS.length === 9, `9 situation types are configured (${SITUATION_KEYS.join(', ')})`)
check(SITUATIONS.every((s) => s.key && s.label && s.source && s.rule && s.explain && typeof s.stamp === 'function'), 'every type names its key, source, exact rule, tap explanation and function')
check(SITUATION_KEYS[0] === 'postseason' && SITUATION_KEYS.at(-1) === 'rest', 'priority order: postseason first, rest last')
check(MAX_STAMPS === 2, 'at most 2 stamps per card')

// ── POSTSEASON ──
check(one({ day: DAY, postseason: { type: 'D' } }, 'postseason') === 'Division Series', 'MLB gameType D -> Division Series')
check(one({ day: DAY, postseason: { type: 'W' } }, 'postseason') === 'World Series', 'MLB gameType W -> World Series')
check(one({ day: DAY, postseason: { type: 'P', roundName: 'Stanley Cup Final' } }, 'postseason') === 'Stanley Cup Final', 'NHL playoffs use the schedule\'s own round text')
check(one({ day: DAY, postseason: { type: 'P' } }, 'postseason') === null, 'a playoff game with no round text prints nothing')
check(one({ day: DAY, postseason: { type: 'R' } }, 'postseason') === null, 'a regular-season gameType prints nothing')
check(one({ day: DAY }, 'postseason') === null, 'no schedule data -> no stamp')

// ── MILESTONE ──
check(one({ day: DAY, totals: { stat: 'goals', before: 19, asOf: DAY } }, 'milestone') === '1 goal from 20', '19 goals -> "1 goal from 20"')
check(one({ day: DAY, totals: { stat: 'hr', before: 38, asOf: '2026-10-11' } }, 'milestone') === '2 HR from 40', '38 HR read the day before -> "2 HR from 40"')
check(one({ day: DAY, totals: { stat: 'hr', before: 37, asOf: DAY } }, 'milestone') === null, '3 away is not "from"')
check(one({ day: DAY, totals: { stat: 'hr', before: 38, asOf: '2026-10-09' } }, 'milestone') === null, 'a total read 3 days before the game is stale: skipped')
check(one({ day: DAY, totals: { stat: 'hr', before: 38, asOf: DAY, stale: true } }, 'milestone') === null, 'a source flagged stale is skipped (the homer feed season_hr)')
check(one({ day: DAY, totals: { stat: 'hr', before: 38, asOf: '2026-10-13' } }, 'milestone') === null, 'a total read after the game day is unsure: skipped')
check(one({ day: DAY, totals: { stat: 'goals', before: 20, asOf: DAY } }, 'milestone') === '5 goals from 25' ? false : true, 'at 20 the next mark is 25 (5 away): no stamp')
check(one({ day: DAY, totals: { stat: 'goals', before: 60, asOf: DAY } }, 'milestone') === null, 'past the last mark: nothing')
check(one({ day: DAY, totals: { stat: 'assists', before: 19, asOf: DAY } }, 'milestone') === null, 'an unlisted stat prints nothing')
check(one({ day: DAY, totals: { stat: 'goals', before: null, asOf: DAY } }, 'milestone') === null, 'no total -> nothing (unsure is skipped)')
check(Object.keys(MILESTONES).join() === 'goals,hr,td', 'milestones: goals, hr, td')

// ── STREAK (counts only) ──
const goals = (...vs) => vs.map((v, i) => g(`2026-10-${String(12 - i).padStart(2, '0')}`, { goals: v }))
check(one({ day: DAY, log: goals(1, 2, 1, 1, 1, 0) }, 'streak') === 'Goal in 5 straight', 'goals 1,2,1,1,1 then 0 -> "Goal in 5 straight"')
check(one({ day: DAY, log: goals(1, 1, 0) }, 'streak') === null, '2 straight is below the minimum')
check(one({ day: DAY, log: goals(0, 1, 1, 1) }, 'streak') === null, 'a game without the stat today breaks it (no streak)')
check(one({ day: DAY, log: [g('2026-10-11', { goals: 1 }), g('2026-10-10', { goals: 1 }), g('2026-10-09', { goals: 1 })] }, 'streak') === null, 'a log that does not include this game is skipped')
check(one({ day: DAY, log: [g(DAY, { hr: 1 }), g('2026-10-11', { hr: 2 }), g('2026-10-10', { hr: 1 })] }, 'streak') === 'HR in 3 straight', 'HR in 3 straight')
check(one({ day: DAY, log: [g(DAY, { td: 1 }), g('2026-10-05', { td: 2 }), g('2026-09-28', { td: 1 }), g('2026-09-21', { td: 1 })] }, 'streak') === 'TD in 4 straight', 'TD in 4 straight')
check(one({ day: DAY, log: [g(DAY, { goals: 1 }), g('2026-10-11', { goals: undefined }), g('2026-10-10', { goals: 1 })] }, 'streak') === null, 'a missing stat breaks the run (never assumed)')

// ── SEASON HIGH ──
const shots = (v, ...prior) => [g(DAY, { shots: v }), ...prior.map((p, i) => g(`2026-10-${String(11 - i).padStart(2, '0')}`, { shots: p }))]
check(one({ day: DAY, log: shots(9, 4, 5, 6, 3, 7) }, 'high') === 'Season-high 9 shots', '9 shots over 4,5,6,3,7 -> "Season-high 9 shots"')
check(one({ day: DAY, log: shots(7, 4, 5, 6, 3, 7) }, 'high') === null, 'a tie is not a season high')
check(one({ day: DAY, log: shots(4, 1, 2, 2, 3, 1) }, 'high') === null, 'under the floor (5 shots) is not a stamp')
check(one({ day: DAY, log: shots(9, 4, 5, 6) }, 'high') === null, 'fewer than 5 earlier games: unsure, skipped')
check(one({ day: DAY, log: [g(DAY, { shots: 9 }), g('2026-10-11', { shots: 4 }), g('2026-10-10', {}), g('2026-10-09', { shots: 5 }), g('2026-10-08', { shots: 6 }), g('2026-10-07', { shots: 3 })] }, 'high') === null, 'an earlier game missing the stat makes it unsure: skipped')
check(one({ day: DAY, log: [g(DAY, { rec_yds: 151 }), g('2026-10-05', { rec_yds: 90 }), g('2026-09-28', { rec_yds: 70 }), g('2026-09-21', { rec_yds: 120 }), g('2026-09-14', { rec_yds: 40 })] }, 'high') === 'Season-high 151 rec yds', 'receiving yards season high')

// ── BIRTHDAY ──
check(one({ day: DAY, birth: '1998-10-12' }, 'birthday') === 'Birthday: turns 28', 'birthday on the game date -> "Birthday: turns 28"')
check(one({ day: DAY, birth: '1998-10-13' }, 'birthday') === null, 'a birthday tomorrow prints nothing')
check(one({ day: DAY, birth: 'not a date' }, 'birthday') === null, 'a missing / bad birth date prints nothing')
check(one({ day: '2025-02-28', birth: '2000-02-29' }, 'birthday') === 'Birthday: turns 25', 'Feb 29 is observed on Feb 28 in a non-leap year (lib/birthday.js)')

// ── FIRST ──
check(one({ day: DAY, firstOfSeason: { stat: 'goals', thisGame: 1, before: 0 } }, 'first') === 'First goal of the season', 'first goal of the season')
check(one({ day: DAY, firstOfSeason: { stat: 'goals', thisGame: 1, before: 2 } }, 'first') === null, 'not his first: nothing')
check(one({ day: DAY, firstOfSeason: { stat: 'goals', thisGame: 0, before: 0 } }, 'first') === null, 'no goal in the game: nothing')
check(one({ day: DAY, postseason: { type: 'D' }, firstPostseason: { stat: 'hr', thisGame: 1, careerBefore: 0 } }, 'first') === 'First career postseason HR', 'first career postseason HR')
check(one({ day: DAY, postseason: { type: 'D' }, firstPostseason: { stat: 'hr', thisGame: 1, careerBefore: 3 } }, 'first') === null, 'a postseason HR that is not his first prints nothing')
check(one({ day: DAY, firstPostseason: { stat: 'hr', thisGame: 1, careerBefore: 0 } }, 'first') === null, 'a "postseason first" in a regular-season game is skipped')
check(one({ day: DAY, postseason: { type: 'D' }, firstOfSeason: { stat: 'goals', thisGame: 1, before: 0 } }, 'first') === null, 'the season-first stamp is not used in the postseason')

// ── FORMER CLUB / RETURN: only from stored data ──
check(one({ day: DAY, opp: 'TOR', prevClubs: ['BOS', 'TOR'] }, 'former') === 'Against his former club: TOR', 'opponent on the stored previous-club list')
check(one({ day: DAY, opp: 'TOR', prevClubs: ['BOS'] }, 'former') === null, 'not on the list: nothing')
check(one({ day: DAY, opp: 'TOR' }, 'former') === null, 'no stored list (today\'s truth): nothing is printed')
check(one({ day: DAY, returnFromInjury: { missed: 6 } }, 'return') === 'Back after 6 games out', 'return after 6 games')
check(one({ day: DAY, returnFromInjury: { missed: 1 } }, 'return') === 'Back after 1 game out', 'singular')
check(one({ day: DAY }, 'return') === null, 'no stored injury listing: nothing')

// ── REST (a number only) ──
check(one({ day: DAY, log: [g(DAY, {}), g('2026-10-07', {})] }, 'rest') === '5 days since his last game', '5 days since his last game')
check(one({ day: DAY, log: [g(DAY, {}), g('2026-10-10', {})] }, 'rest') === null, '2 days is ordinary: nothing')
check(one({ day: DAY, log: [g(DAY, {})] }, 'rest') === null, 'no earlier game on the log: nothing')

// ── the PREGAME phase (the player front is drawn before the game) ──
{
  const pre = (o) => ({ day: DAY, phase: 'pre', ...o })
  const before = [g('2026-10-11', { goals: 1 }), g('2026-10-10', { goals: 2 }), g('2026-10-08', { goals: 1 })]
  check(one(pre({ log: before }), 'streak') === 'Goal in 3 straight', 'pre: a streak he is coming in with (his last games, none of them today)')
  check(one(pre({ log: [g(DAY, { goals: 1 }), ...before] }), 'streak') === null, 'pre: a log that already holds the game is not a pregame log (skipped)')
  check(one(pre({ log: [g('2026-10-05', {}), g('2026-10-01', {})] }), 'rest') === '7 days since his last game', 'pre: days since his last game, counted to the game date')
  check(one(pre({ log: [g('2026-10-10', {})] }), 'rest') === null, 'pre: 2 days is ordinary')
  check(one(pre({ log: shots(9, 4, 5, 6, 3, 7) }), 'high') === null, 'pre: a season-high is something a game DID: never in the pregame phase')
  check(one(pre({ firstOfSeason: { stat: 'goals', thisGame: 1, before: 0 } }), 'first') === null, 'pre: "first of the season" is never printed before the game')
  check(one(pre({ totals: { stat: 'goals', before: 19, asOf: '2026-10-11' } }), 'milestone') === '1 goal from 20', 'pre: a milestone going into the game')
  check(one(pre({ postseason: { type: 'D' }, birth: '1998-10-12' }), 'postseason') === 'Division Series' && one(pre({ birth: '1998-10-12' }), 'birthday') === 'Birthday: turns 28', 'pre: the round and the birthday')
}

// ── limit, priority, words ──
const all = { day: DAY, birth: '1998-10-12', postseason: { type: 'L' }, totals: { stat: 'hr', before: 39, asOf: DAY }, log: [g(DAY, { hr: 1 }), g('2026-10-11', { hr: 1 }), g('2026-10-10', { hr: 1 })] }
const got = stampsFor(all)
check(got.length === 2, 'six stamps are true, only 2 are returned')
check(got[0].key === 'postseason' && got[1].key === 'milestone', 'priority order: postseason, then milestone (streak and birthday dropped)')
check(stampsFor(all, { limit: 1 }).length === 1, 'limit option')
check(stampsFor({}).length === 0 && stampsFor(null).length === 0, 'an empty context prints nothing')
check(got.every((s) => s.explain && s.label), 'every stamp carries its tap explanation')
const texts = stampsFor({ ...all, firstOfSeason: { stat: 'goals', thisGame: 1, before: 0 }, opp: 'TOR', prevClubs: ['TOR'], returnFromInjury: { missed: 3 }, log: [g(DAY, { goals: 1, hr: 1, shots: 9 }), g('2026-10-11', { goals: 1, hr: 1, shots: 1 }), g('2026-10-10', { goals: 1, hr: 1, shots: 1 }), g('2026-10-09', { shots: 1 }), g('2026-10-08', { shots: 1 }), g('2026-10-07', { shots: 1 }), g('2026-10-01', { shots: 1 })] }, { limit: 99 }).map((s) => s.text)
check(texts.length >= 6, `${texts.length} stamps with everything true`)
check(texts.every((t) => !BANNED.test(t)), 'no stamp text contains hot / due / lock / guaranteed / bounce-back')
check(BANNED.test('He is due') && BANNED.test('a lock') && BANNED.test('bounce-back') && BANNED.test('hot streak') && !BANNED.test('Season-high 9 shots'), 'the banned-word guard bites')

// ── the strip's text fit (lib/cards/stampLayout.js) ──
{
  const { layoutStamps, FLOOR, SIZES } = await import('../lib/cards/stampLayout.js')
  const two = layoutStamps([{ text: 'Goal in 5 straight' }, { text: 'Division Series' }], { maxW: 940 })
  check(two.length === 2 && two.every((c) => c.size >= FLOOR) && two[0].size === SIZES[0], 'strip: two short stamps fit one row at the largest size')
  const tight = layoutStamps([{ text: 'Against his former club: TOR and a very long line of words' }, { text: 'Season-high 151 rec yds' }], { maxW: 600 })
  check(tight.every((c) => c.size >= FLOOR) && tight.reduce((a, c) => a + c.w, 0) + 12 <= 600, 'strip: never below the 22px floor, never wider than the box (cut with an ellipsis instead)')
  check(tight.some((c) => c.cut) && tight.find((c) => c.cut).text.endsWith('…'), 'strip: the cut chip says so with an ellipsis')
  check(layoutStamps([], { maxW: 900 }).length === 0 && layoutStamps(null, { maxW: 900 }).length === 0, 'strip: no stamps, no strip')
  check(layoutStamps([{ text: 'a' }, { text: 'b' }, { text: 'c' }], { maxW: 900 }).length === 2, 'strip: at most 2 chips')
}

console.log(failed ? `\n${failed} FAILED` : '\nall situation checks passed')
process.exit(failed ? 1 : 0)
