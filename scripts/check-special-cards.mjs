// THE SPECIAL CARDS (lib/cards/moments.js, specialData.js, specialCard.js): every moment rule against TEST rows (every name says "Test"), the
// call word, the holo switch, the type floor, the banned words, and a real render of each card. No database, no network (a face / logo that
// cannot load is just no picture). Needs JSX, so run it through the card loader:
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-special-cards.mjs
import { readFileSync } from 'node:fs'
import { MOMENTS, MOMENT_KEYS, TIERS, evaluate, nhlGameLines, mlbGameLines, nflGameLines, nflYardRows, nflSides, nflHomeOf, LONG_PRICE, NHL_MILESTONES, periodShort, strengthCode } from '../lib/cards/moments.js'
import { buildSpecialModel, parseId, ID_SHAPE, idOf } from '../lib/cards/specialData.js'
import { specialDesign, renderSpecial } from '../lib/cards/specialCard.js'
import { lintType } from '../lib/cards/cardKit.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const tier = (k, row) => evaluate(k, row)?.tier ?? null
const trig = (k, row) => Boolean(MOMENTS[k].trigger(row))
const feed = F.testFeedRow

function walk(node, out = []) {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return walk(type(props), out)
  walk(props.children, out)
  return out
}

// ── the config itself ──
check(MOMENT_KEYS.length === 8, `8 moments are configured (${MOMENT_KEYS.join(', ')})`)
for (const k of MOMENT_KEYS) {
  const m = MOMENTS[k]
  check(m.key === k && typeof m.trigger === 'function' && typeof m.tierOf === 'function' && typeof m.print === 'function' && typeof m.statusOf === 'function' && Array.isArray(m.needs) && m.needs.length > 0 && typeof m.label === 'string' && 'holoFrom' in m && ID_SHAPE[k], `${k}: has key, sport, label, needs, trigger, tierOf, statusOf, print, holoFrom and an id shape`)
}

// ── NHL goal ──
check(trig('nhl_goal', F.TEST_GOAL), 'nhl_goal: a standing goal triggers')
check(!trig('nhl_goal', feed({ overturned_at: '2026-01-02T00:00:00Z' })), 'nhl_goal: an overturned goal does not')
check(!trig('nhl_goal', feed({ period_type: 'SO' })), 'nhl_goal: a shootout goal does not')
check(!trig('nhl_goal', feed({ name: '' })), 'nhl_goal: a goal with no scorer name does not')
check(tier('nhl_goal', F.TEST_GOAL) === 'common' && tier('nhl_goal', F.TEST_GOAL_OT) === 'rare', 'nhl_goal: common; an overtime goal is rare')
check(evaluate('nhl_goal', F.TEST_GOAL).status === 'called' && evaluate('nhl_goal', F.TEST_GOAL_OT).status === 'board', 'nhl_goal: the label is the stored one (called / board)')
check(evaluate('nhl_goal', F.TEST_GOAL_NOCALL).status === null && evaluate('nhl_goal', feed({ status: null })).status === null, 'nhl_goal: NOT on the board and a never-locked game carry NO call word')
check(strengthCode(feed({ strength: 'pp' })) === 'PP' && strengthCode(feed({ strength: 'sh' })) === 'SH' && strengthCode(feed({ empty_net: true })) === 'EN' && strengthCode(feed({ strength: 'ev' })) === 'EV', 'nhl_goal: strength words EV / PP / SH / EN')
check(periodShort(feed({ period: 1 })) === '1ST' && periodShort(feed({ period: 4, period_type: 'OT' })) === 'OT' && periodShort(feed({ period: 5, period_type: 'OT' })) === '2OT', 'nhl_goal: period words 1ST / OT / 2OT')
const gp = evaluate('nhl_goal', F.TEST_GOAL).print
check(gp.hero.value === '11:41' && gp.tiles.some((t) => t.label === 'ASSISTS' && /T\. Helper/.test(t.value)) && gp.tiles.some((t) => t.label === 'THIS SEASON' && t.value === '12'), 'nhl_goal: prints the clock, the assists and his season goal count from the feed row')
check(!evaluate('nhl_goal', feed({ assists: [] })).print.tiles.some((t) => t.label === 'ASSISTS'), 'nhl_goal: no assists on the row = no assists tile (never "unassisted")')

// ── hat trick / 3+ points ──
check(trig('nhl_hat_trick', F.TEST_HAT) && tier('nhl_hat_trick', F.TEST_HAT) === 'epic', 'nhl_hat_trick: 3 goals = epic')
check(!trig('nhl_hat_trick', nhlGameLines(F.TEST_HAT_ROWS.slice(0, 2)).get('1:11')), 'nhl_hat_trick: 2 goals does not')
check(!trig('nhl_hat_trick', nhlGameLines([...F.TEST_HAT_ROWS.slice(0, 2), { ...F.TEST_HAT_ROWS[2], overturned_at: 'x' }]).get('1:11')), 'nhl_hat_trick: an overturned third goal does not make one')
check(!trig('nhl_hat_trick', nhlGameLines([...F.TEST_HAT_ROWS.slice(0, 2), { ...F.TEST_HAT_ROWS[2], period_type: 'SO' }]).get('1:11')), 'nhl_hat_trick: a shootout goal does not count')
check(tier('nhl_hat_trick', { ...F.TEST_HAT, goals: [...F.TEST_HAT.goals, F.TEST_HAT.goals[2]] }) === 'legendary', 'nhl_hat_trick: 4 goals = legendary')
check(!trig('nhl_hat_trick', nhlGameLines(F.TEST_HAT_ROWS).get('1:21')), 'nhl_hat_trick: a man who only assisted never triggers it (scorer flag)')
check(trig('nhl_three_points', F.TEST_POINTS) && F.TEST_POINTS.goals.length === 1 && F.TEST_POINTS.assists.length === 2 && tier('nhl_three_points', F.TEST_POINTS) === 'rare', 'nhl_three_points: 1 goal + 2 assists = 3 points, rare')
check(!trig('nhl_three_points', F.TEST_HAT), 'nhl_three_points: a hat trick has its own card (not repeated here)')
check(!trig('nhl_three_points', { ...F.TEST_POINTS, assists: F.TEST_POINTS.assists.slice(0, 1) }), 'nhl_three_points: 2 points does not')
check(tier('nhl_three_points', { ...F.TEST_POINTS, assists: [...F.TEST_POINTS.assists, ...F.TEST_POINTS.assists] }) === 'epic', 'nhl_three_points: 5+ points = epic')
{
  const assistOnly = nhlGameLines(F.TEST_HAT_ROWS).get('1:21')
  check(assistOnly && assistOnly.assists.length >= 1 && assistOnly.status === null && evaluate('nhl_three_points', { ...assistOnly, assists: [...assistOnly.assists, ...assistOnly.assists, ...assistOnly.assists] }).status === null, 'nhl_three_points: an assist-only man carries no status (no call word)')
}

// ── milestone ──
check(trig('nhl_season_goal_milestone', F.TEST_MILESTONE) && tier('nhl_season_goal_milestone', F.TEST_MILESTONE) === 'legendary', 'nhl_season_goal_milestone: his 50th is legendary')
check(!trig('nhl_season_goal_milestone', feed({ season_goals: 49 })) && !trig('nhl_season_goal_milestone', feed({ season_goals: null })), 'nhl_season_goal_milestone: 49 and a missing count do not trigger')
check(NHL_MILESTONES.every((n) => trig('nhl_season_goal_milestone', feed({ season_goals: n }))), `nhl_season_goal_milestone: every milestone ${NHL_MILESTONES.join('/')} triggers`)
check(!trig('nhl_season_goal_milestone', feed({ season_goals: 50, overturned_at: 'x' })), 'nhl_season_goal_milestone: an overturned goal never counts')

// ── MLB ──
check(trig('mlb_multi_hr', F.TEST_MULTI_HR) && tier('mlb_multi_hr', F.TEST_MULTI_HR) === 'epic' && tier('mlb_multi_hr', F.TEST_MULTI_HR_2) === 'rare', 'mlb_multi_hr: 2 = rare, 3 = epic')
check(!trig('mlb_multi_hr', mlbGameLines([{ day: 'x', player_id: '1', hr_n: 1, name: 'Test', team: 'T', opponent: 'O', game_pk: '9' }, { day: 'x', player_id: '1', hr_n: 1, name: 'Test', team: 'T', opponent: 'O', game_pk: '9' }]).get('9:1')), 'mlb_multi_hr: a repeated hr_n is ONE home run, not two')
check(tier('mlb_multi_hr', { ...F.TEST_MULTI_HR, hrs: [...F.TEST_MULTI_HR.hrs, F.TEST_MULTI_HR.hrs[0]] }) === 'legendary', 'mlb_multi_hr: 4 = legendary')
check(evaluate('mlb_multi_hr', F.TEST_MULTI_HR).status === 'called' && evaluate('mlb_multi_hr', F.TEST_MULTI_HR_2).status === null, 'mlb_multi_hr: the label is lib/callStatus over the stored role (a rank outside the top third = no call word)')

// ── NFL ──
check(trig('nfl_multi_td', F.TEST_MULTI_TD) && tier('nfl_multi_td', F.TEST_MULTI_TD) === 'epic', 'nfl_multi_td: 3 TDs = epic')
check(!trig('nfl_multi_td', nflGameLines([{ game_id: '8', gsis_id: 'g', td_n: 1, scorer_name: 'Test', team: 'T', opponent: 'O' }]).get('8:g')), 'nfl_multi_td: 1 TD does not')
check(!trig('nfl_multi_td', nflGameLines([{ game_id: '8', gsis_id: 'g', td_n: 1 }, { game_id: '8', gsis_id: 'g', td_n: 1 }]).get('8:g')), 'nfl_multi_td: a repeated td_n is ONE touchdown')
check(trig('nfl_multi_td', { ...F.TEST_MULTI_TD, tds: F.TEST_MULTI_TD.tds.slice(0, 2) }) && tier('nfl_multi_td', { ...F.TEST_MULTI_TD, tds: F.TEST_MULTI_TD.tds.slice(0, 2) }) === 'rare', 'nfl_multi_td: 2 TDs = rare')
{
  const rs = [{ game_id: '8', td_n: 1, team: 'AAA', away_score: 0, home_score: 7 }, { game_id: '8', td_n: 2, team: 'BBB', away_score: 7, home_score: 7 }, { game_id: '8', td_n: 3, team: 'BBB', away_score: 14, home_score: 7 }]
  const sides = nflSides(rs)
  check(nflHomeOf(sides, '8', 'AAA') === true && nflHomeOf(sides, '8', 'BBB') === false && nflHomeOf(sides, '9', 'AAA') === null, 'nfl sides: the side whose score moved on a club\'s TD is that club\'s side (unknown game = no vs / @)')
}
check(evaluate('nfl_multi_td', F.TEST_MULTI_TD).status === 'called', 'nfl_multi_td: called when the stored on_bot says so (lib/callStatus tdCallStatus)')
check(trig('nfl_100_yards', F.TEST_100) && tier('nfl_100_yards', F.TEST_100) === 'epic' && tier('nfl_100_yards', F.TEST_200) === 'legendary' && tier('nfl_100_yards', { ...F.TEST_100, rush_yds: 100 }) === 'rare', 'nfl_100_yards: 100 rare, 150 epic, 200 legendary')
check(!trig('nfl_100_yards', { ...F.TEST_100, rush_yds: 99, rec_yds: 99 }), 'nfl_100_yards: 99 does not')
check(trig('nfl_100_yards', { ...F.TEST_100, rush_yds: 4, rec_yds: 100 }) && /RECEIVING/.test(evaluate('nfl_100_yards', { ...F.TEST_100, rush_yds: 4, rec_yds: 100 }).print.kicker), 'nfl_100_yards: receiving 100 prints RECEIVING')
check(evaluate('nfl_100_yards', F.TEST_100).status === null, 'nfl_100_yards: no call word (the yardage file does not carry one)')
{
  const rows = nflYardRows({ results: { season: 2026, week: 5, names: { a: 'Test A', b: 'Test B' }, lines: { a: { RUSH_YDS: 101, RUSH_ATT: 20 }, b: {}, c: { KICK_PTS: 5 } } }, players: [{ player_id: 'a', team: 'TST' }], games: [{ home: 'TST', away: 'EXA', kickoff: '2026-01-02T18:00Z' }] })
  check(rows.length === 1 && rows[0].opp === 'EXA' && rows[0].rush_yds === 101, 'nfl_100_yards: yard rows come only from lines that carry rush / rec yards, team and opponent from the week file')
}

// ── long shot ──
const LS = F.TEST_LONG_SHOT
check(trig('long_shot_cashed', LS) && tier('long_shot_cashed', LS) === 'legendary' && tier('long_shot_cashed', { ...LS, best: 300 }) === 'rare' && tier('long_shot_cashed', { ...LS, best: 600 }) === 'epic', `long_shot_cashed: +${LONG_PRICE} rare, +600 epic, +1000 legendary`)
check(!trig('long_shot_cashed', { ...LS, best: 299 }), 'long_shot_cashed: +299 does not')
check(!trig('long_shot_cashed', { ...LS, books: 0 }) && !trig('long_shot_cashed', { ...LS, books: null }), 'long_shot_cashed: a price with no book count does not')
check(!trig('long_shot_cashed', { ...LS, status: 'board' }) && !trig('long_shot_cashed', { ...LS, status: null }), 'long_shot_cashed: only a CALLED pick (never "on the board")')
check(!trig('long_shot_cashed', { ...LS, hit: false }) && !trig('long_shot_cashed', { ...LS, hit: undefined }), 'long_shot_cashed: only when it cashed')
check(!trig('long_shot_cashed', { ...LS, best: -150 }), 'long_shot_cashed: a minus price does not')

// ── tiers, holo, ids ──
check(TIERS.join() === 'common,rare,epic,legendary', 'tiers are common, rare, epic, legendary')
check(evaluate('nhl_goal', F.TEST_GOAL).holo === false && evaluate('nhl_hat_trick', F.TEST_HAT).holo === true && evaluate('nhl_three_points', F.TEST_POINTS).holo === false && evaluate('mlb_multi_hr', F.TEST_MULTI_HR_2).holo === false && evaluate('nfl_100_yards', F.TEST_100).holo === true, 'holo = the moment is epic or legendary (a goal / 2-HR game / 3-point night is not)')
check(parseId('nhl_goal', '2026020085:8478498:1')?.length === 3 && parseId('nfl_100_yards', '00-0031408')?.length === 1 && parseId('long_shot_cashed', 'nfl:00-0033106:2026-10-11')?.length === 3, 'ids parse by their shape')
check(parseId('nhl_goal', '1:2') === null && parseId('nhl_goal', '1:2:../x') === null && parseId('nope', 'x') === null && parseId('nfl_100_yards', '') === null, 'a malformed id is refused')
check(idOf.nhl_goal(F.TEST_GOAL) === '1:11:1' && idOf.nfl_100_yards(F.TEST_100) === '00-TEST' && idOf.long_shot_cashed(LS) === 'nhl:11:2026-01-02', 'idOf round-trips through parseId')

// ── the models, the type floor, the call word, the banned words, a real render ──
const TEST_MODELS = {
  nhl_goal: F.TEST_GOAL, nhl_hat_trick: F.TEST_HAT, nhl_three_points: F.TEST_POINTS, nhl_season_goal_milestone: F.TEST_MILESTONE,
  mlb_multi_hr: F.TEST_MULTI_HR, nfl_multi_td: F.TEST_MULTI_TD, nfl_100_yards: F.TEST_100, long_shot_cashed: LS,
}
const BANNED = /\b(lock(ed|s)?|due|owed|guarantee[sd]?|sure thing|can't miss|probab|chance|odds of)\b|\d\s?%/i
const extra = [['nhl_goal-nocall', 'nhl_goal', F.TEST_GOAL_NOCALL], ['nhl_goal-overtime', 'nhl_goal', F.TEST_GOAL_OT], ['mlb_multi_hr-2', 'mlb_multi_hr', F.TEST_MULTI_HR_2], ['nfl_100-200', 'nfl_100_yards', F.TEST_200]]
for (const [name, k, row] of [...MOMENT_KEYS.map((k) => [k, k, TEST_MODELS[k]]), ...extra]) {
  const m = buildSpecialModel(k, row, { test: true })
  check(m && m.test === true, `${name}: model builds, marked TEST`)
  const el = specialDesign(m, '')
  const text = walk(el).join(' | ')
  check(lintType(el).length === 0, `${name}: every text is at or above the 22px type floor`)
  check(/TEST DATA/.test(text), `${name}: the face says TEST DATA`)
  check(!BANNED.test(text), `${name}: no lock / due / guarantee / probability wording`)
  const hasWord = /CALLED|ON THE BOARD/.test(text)
  check(hasWord === Boolean(m.status), `${name}: CALLED / ON THE BOARD appear exactly when the source status says so (${m.status || 'none'})`)
  check(!/NOT ON THE BOARD/.test(text), `${name}: never prints NOT ON THE BOARD (no call word instead)`)
  const png = await renderSpecial(m)
  check(png.length > 50e3 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, `${name}: renders a PNG (${png.length} bytes)`)
}

// ── the sources: no hex literals in the new files, nothing writes ──
for (const f of ['lib/cards/moments.js', 'lib/cards/specialCard.js', 'lib/cards/specialData.js', 'lib/cards/specialFixtures.js', 'app/api/card/special/route.js']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  check(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/.test(src.replace(/\/\/.*$/gm, '').replace(/`[^`]*#\$\{[^`]*`/g, '')), `${f}: no hex literal`)
  check(!/\.(insert|update|upsert|delete|rpc)\s*\(/.test(src), `${f}: no database write`)
}
const routeSrc = readFileSync(new URL('../app/api/card/special/route.js', import.meta.url), 'utf8')
check(!/setInterval|setTimeout|cron/i.test(routeSrc), 'the route does no polling and sets no cron')

console.log(failed ? `\n${failed} FAILED` : '\nall special-card checks passed')
process.exit(failed ? 1 : 0)
