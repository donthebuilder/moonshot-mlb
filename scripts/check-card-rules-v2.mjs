#!/usr/bin/env node
// THE COLLECTIBLE CARD RULES v2 (lib/cards/rulesV2.js): every threshold of Donovan's 2026-10-14 brief at its boundary, the long-shot between-threshold rule, the
// deterministic card id, duplicate ingestion and one card per achievement. Every input is a TEST row (names say "Test"; no real event, no real price).
// It also proves the v2 table AGREES with the live rule (lib/cards/moments.js evaluate) at every boundary, so the two can never drift.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-card-rules-v2.mjs
import assert from 'node:assert/strict'
import { STEPS, SEASON_GOALS, RULES_VERSION, tierOf, tierFromSteps, longShotTier, cardIdOf, seasonOf, qualify, qualifyAll, issuePlan } from '../lib/cards/rulesV2.js'
import { evaluate, nhlGameLines, mlbGameLines, nflGameLines, LONG_SHOT, NHL_MILESTONES, NBA_MOMENT_KEYS } from '../lib/cards/moments.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const t = (what, fn) => { try { fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const feed = F.testFeedRow

// TEST row builders (counts only)
const goalsRow = (n, o = {}) => nhlGameLines(Array.from({ length: n }, (_, i) => feed({ goal_n: i + 1, period: 1 + (i % 3), time_in_period: `0${i}:10`, ...o }))).get('1:11')
const pointsRow = (g, a) => {
  const rows = []
  for (let i = 0; i < g; i += 1) rows.push(feed({ goal_n: i + 1, period: 1, time_in_period: `0${i}:10`, assists: [] }))
  for (let i = 0; i < a; i += 1) rows.push(feed({ player_id: 40 + i, name: `Test Mate ${i}`, goal_n: 1, period: 2, time_in_period: `0${i}:20`, assists: [{ id: 11, name: 'T. Skater', assistsToDate: 1 }] }))
  return nhlGameLines(rows).get('1:11')
}
const hrRow = (n) => mlbGameLines(Array.from({ length: n }, (_, i) => ({ day: '2026-06-02', player_id: '900', hr_n: i + 1, name: 'Test Slugger', team: 'TST', opponent: 'EXA', game_pk: '700', inning: 'top 2nd', home: true, role: null, on_board: false, board_rank: 12, stats: {} }))).get('700:900')
const tdRow = (n) => nflGameLines(Array.from({ length: n }, (_, i) => ({ day: '2026-10-04', game_id: '800', td_n: i + 1, team: 'TST', opponent: 'EXA', quarter: 1 + (i % 4), clock: '5:00', kind: 'rush', kind_word: 'RUSH TD', yards: 3, scorer_name: 'Test Runner', gsis_id: '00-TEST', on_bot: null, td_board: null }))).get('800:00-TEST')
const yardRow = (rush, rec = 0) => ({ ...F.TEST_100, rush_yds: rush, rec_yds: rec })
const shot = (best, o = {}) => ({ ...F.TEST_LONG_SHOT, best, books: 3, price_source: 'lock', ...o })

// agree(key, row, expected): the v2 table AND the live rule give the same answer
const agree = (key, row, want) => {
  assert.equal(tierOf(key, row), want, `v2 ${key}`)
  assert.equal(evaluate(key, row)?.tier ?? null, want, `moments.js ${key}`)
}

t('THE TABLE IS THE BRIEF: every step as Donovan wrote it', () => {
  assert.deepEqual(STEPS.nhl_hat_trick, [[3, 'elite'], [4, 'legend']])
  assert.deepEqual(STEPS.nhl_three_points, [[3, 'star'], [5, 'elite'], [7, 'legend']])
  assert.deepEqual(STEPS.mlb_multi_hr, [[2, 'star'], [3, 'elite'], [4, 'legend']])
  assert.deepEqual(STEPS.nfl_multi_td, [[2, 'star'], [3, 'elite'], [4, 'legend']])
  assert.deepEqual(STEPS.nfl_100_yards, [[100, 'star'], [150, 'elite'], [200, 'legend']])
  assert.deepEqual(STEPS.long_shot_cashed, [[750, 'star'], [1200, 'elite'], [2000, 'legend']])
  assert.deepEqual({ ...SEASON_GOALS }, { 20: 'star', 25: 'star', 30: 'star', 40: 'elite', 50: 'legend', 60: 'legend' })
  // and the live config says the same numbers
  assert.deepEqual([LONG_SHOT.floor, LONG_SHOT.elite, LONG_SHOT.legend], [750, 1200, 2000])
  assert.deepEqual(NHL_MILESTONES, [20, 25, 30, 40, 50, 60])
  assert.ok(Object.isFrozen(STEPS) && Object.isFrozen(SEASON_GOALS))
})

t('NHL goal: an overtime goal is STAR, a standing goal BASE, a shootout / overturned goal is nothing', () => {
  agree('nhl_goal', feed(), 'base')
  agree('nhl_goal', feed({ period: 4, period_type: 'OT', time_in_period: '02:10' }), 'star')
  agree('nhl_goal', feed({ period: 5, period_type: 'OT', time_in_period: '02:10' }), 'star')   // 2OT
  agree('nhl_goal', feed({ period: 5, period_type: 'SO' }), null)
  agree('nhl_goal', feed({ overturned_at: '2026-01-02T00:00:00Z' }), null)
})

t('NHL hat trick: 2 none, 3 ELITE, 4 LEGEND, 6 LEGEND', () => {
  for (const [n, want] of [[2, null], [3, 'elite'], [4, 'legend'], [6, 'legend']]) assert.equal(tierOf('nhl_hat_trick', goalsRow(n)), want, `${n} goals`)
  for (const [n, want] of [[3, 'elite'], [4, 'legend']]) assert.equal(evaluate('nhl_hat_trick', goalsRow(n))?.tier, want)
  assert.equal(evaluate('nhl_hat_trick', goalsRow(2)), null)
})

t('NHL 3+ point night: 2 none, 3 and 4 STAR, 5 and 6 ELITE, 7 and 8 LEGEND (goals + assists, fewer than 3 goals)', () => {
  const cases = [[0, 2, null], [1, 2, 'star'], [2, 2, 'star'], [2, 3, 'elite'], [1, 5, 'elite'], [2, 5, 'legend'], [1, 7, 'legend'], [0, 8, 'legend']]
  for (const [g, a, want] of cases) agree('nhl_three_points', pointsRow(g, a), want)
  // the 3-point rule at exactly 3, 4, 5, 6, 7 from the table alone
  for (const [n, want] of [[2, null], [3, 'star'], [4, 'star'], [5, 'elite'], [6, 'elite'], [7, 'legend'], [8, 'legend']]) assert.equal(tierFromSteps(STEPS.nhl_three_points, n), want, `${n} points`)
  // a 3-goal night is the hat trick's, not counted twice (DECISION FLAGGED: Donovan to confirm)
  agree('nhl_three_points', pointsRow(3, 0), null)
  agree('nhl_three_points', pointsRow(4, 2), null)
})

t('NHL season goals: only 20 / 25 / 30 STAR, 40 ELITE, 50 / 60 LEGEND; 19, 21, 35, 45, 55, 61 earn nothing', () => {
  for (let n = 0; n <= 70; n += 1) agree('nhl_season_goal_milestone', feed({ season_goals: n }), Object.hasOwn(SEASON_GOALS, n) ? SEASON_GOALS[n] : null)
  for (const n of [19, 21, 24, 26, 29, 31, 35, 39, 41, 45, 49, 51, 55, 59, 61]) assert.equal(tierOf('nhl_season_goal_milestone', feed({ season_goals: n })), null, `${n}`)
  // a shootout or overturned goal never counts toward a milestone
  assert.equal(tierOf('nhl_season_goal_milestone', feed({ season_goals: 20, period_type: 'SO' })), null)
  assert.equal(tierOf('nhl_season_goal_milestone', feed({ season_goals: 20, overturned_at: 'x' })), null)
})

t('MLB multi-HR: 1 none, 2 STAR, 3 ELITE, 4 LEGEND, 5 LEGEND', () => {
  for (const [n, want] of [[1, null], [2, 'star'], [3, 'elite'], [4, 'legend'], [5, 'legend']]) agree('mlb_multi_hr', hrRow(n), want)
  // the same home run logged twice (a repeated hr_n) is one home run
  const dup = mlbGameLines([1, 1, 2].map((n) => ({ day: '2026-06-02', player_id: '900', hr_n: n, name: 'Test Slugger', team: 'TST', opponent: 'EXA', game_pk: '700', inning: 'top 2nd', home: true }))).get('700:900')
  assert.equal(dup.hrs.length, 2); assert.equal(tierOf('mlb_multi_hr', dup), 'star')
})

t('NFL multi-TD: 1 none, 2 STAR, 3 ELITE, 4 LEGEND', () => {
  for (const [n, want] of [[1, null], [2, 'star'], [3, 'elite'], [4, 'legend'], [5, 'legend']]) agree('nfl_multi_td', tdRow(n), want)
})

t('NFL 100-yard: 99 none, 100 / 149 STAR, 150 / 199 ELITE, 200 / 201 LEGEND; rushing or receiving, the larger one', () => {
  for (const [y, want] of [[99, null], [100, 'star'], [149, 'star'], [150, 'elite'], [199, 'elite'], [200, 'legend'], [201, 'legend'], [0, null]]) {
    agree('nfl_100_yards', yardRow(y), want)
    agree('nfl_100_yards', yardRow(0, y), want)
  }
  agree('nfl_100_yards', yardRow(99, 99), null)            // 198 combined is NOT a 100-yard game
  agree('nfl_100_yards', yardRow(120, 190), 'elite')       // the larger of the two decides (FLAGGED: both >= 100 is ONE card today)
})

t('LONG SHOT: +749 none, +750 STAR, +1199 STAR, +1200 ELITE, +1999 ELITE, +2000 LEGEND, +2001 LEGEND', () => {
  for (const [p, want] of [[749, null], [750, 'star'], [751, 'star'], [1199, 'star'], [1200, 'elite'], [1999, 'elite'], [2000, 'legend'], [2001, 'legend'], [5000, 'legend']]) {
    assert.equal(tierOf('long_shot_cashed', shot(p)), want, `+${p} (v2)`)
    assert.equal(evaluate('long_shot_cashed', shot(p))?.tier ?? null, want, `+${p} (moments.js)`)
  }
})

t('LONG SHOT, the rest of the rule: called + happened + a stored LOCK price with books; never inferred after the event', () => {
  assert.equal(tierOf('long_shot_cashed', shot(1500, { status: 'board' })), null, 'a BOARD pick is not a called pick')
  assert.equal(tierOf('long_shot_cashed', shot(1500, { status: 'off' })), null)
  assert.equal(tierOf('long_shot_cashed', shot(1500, { hit: false })), null, 'a miss is no card')
  assert.equal(tierOf('long_shot_cashed', shot(1500, { hit: null })), null)
  assert.equal(tierOf('long_shot_cashed', shot(1500, { books: 0 })), null, 'no book count, no price')
  assert.equal(tierOf('long_shot_cashed', shot(1500, { price_source: 'latest' })), null, 'a price that is not the lock snapshot may be after the event')
  assert.equal(tierOf('long_shot_cashed', shot(1500, { price_source: undefined })), null)
  assert.equal(tierOf('long_shot_cashed', shot(null)), null, 'no stored price, no card')
  assert.equal(tierOf('long_shot_cashed', shot(undefined)), null)
  assert.equal(tierOf('long_shot_cashed', shot('+1500')), null, 'a string is not a stored number')
  assert.equal(tierOf('long_shot_cashed', shot(749.5)), null, 'between 749 and 750 is not a price a book posts: rejected, not rounded up')
  assert.equal(tierOf('long_shot_cashed', shot(1199.5)), null)
  assert.equal(tierOf('long_shot_cashed', shot(-150)), null, 'a favourite is not a long shot')
  assert.equal(longShotTier(null), null)
})

t('NBA (BUCKETS) is hidden: v2 mints no card for any BUCKETS moment', () => {
  for (const k of NBA_MOMENT_KEYS) assert.equal(tierOf(k, { player_id: '1', name: 'Test', pts: 60, tpm: 20, tens: 3 }), null, k)
  assert.equal(qualify('nba_40_points', { player_id: '1', name: 'Test', pts: 60, game_id: '1', day: '2026-01-01' }), null)
})

t('THE CARD ID: same inputs, same id; every one of event / player / achievement / season / rules version changes it; no wall clock', () => {
  const row = F.TEST_HAT
  const a = cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row })
  const realNow = Date.now
  Date.now = () => 0
  const b = cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row: structuredClone(row) })
  Date.now = realNow
  assert.equal(a.cardId, b.cardId); assert.match(a.cardId, /^DN-[0-9A-F]{12}$/); assert.match(a.slotId, /^DS-[0-9A-F]{12}$/)
  const ids = new Set([a.cardId])
  const add = (x) => { assert.ok(x?.cardId); assert.ok(!ids.has(x.cardId), `collision: ${x.canonical}`); ids.add(x.cardId) }
  add(cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row: { ...row, game_id: 2 } }))                  // another game
  add(cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row: { ...row, player_id: 12 } }))               // another player
  add(cardIdOf({ sport: 'nhl', key: 'nhl_three_points', row }))                                       // another achievement, same game and player
  add(cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row: { ...row, day: '2027-01-02' } }))           // another season (day drives it)
  add(cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row, rulesVersion: 'r3' }))                      // another rules version
  const r3 = cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row, rulesVersion: 'r3' })
  assert.equal(r3.slotId, a.slotId, 'the slot ignores the rules version, so a rules change cannot re-issue the same achievement')
  assert.equal(cardIdOf({ sport: 'nhl', key: 'nhl_hat_trick', row: { ...row, day: 'not a day' } }), null, 'no season, no id')
  assert.equal(cardIdOf({ sport: 'nhl', key: 'nope', row }), null)
  assert.equal(a.rulesVersion, RULES_VERSION)
})

t('SEASON comes from the game\'s own date: NHL 20262027 for Oct 2026 and Apr 2027; MLB the year; NFL the start year', () => {
  assert.equal(seasonOf('nhl', '2026-10-13'), '20262027'); assert.equal(seasonOf('nhl', '2027-04-10'), '20262027'); assert.equal(seasonOf('nhl', '2026-07-31'), '20252026')
  assert.equal(seasonOf('mlb', '2026-06-02'), '2026'); assert.equal(seasonOf('nfl', '2027-01-10'), '2026'); assert.equal(seasonOf('nfl', '2026-09-10'), '2026')
  assert.equal(seasonOf('nhl', '2026-10-13', 20262027), '20262027'); assert.equal(seasonOf('nhl', ''), null)
})

t('ONE CARD PER ACHIEVEMENT: a night that is an OT goal, a hat trick and goal #20 is three cards, not one "best" card', () => {
  const rows = [
    feed({ goal_n: 1, period: 1, time_in_period: '03:12', season_goals: 18, score_after: 'EXA 0 · TST 1' }),
    feed({ goal_n: 2, period: 3, time_in_period: '18:00', season_goals: 19, score_after: 'EXA 2 · TST 2' }),
    feed({ goal_n: 3, period: 4, period_type: 'OT', time_in_period: '01:30', season_goals: 20, score_after: 'EXA 2 · TST 3' }),
  ]
  const lines = nhlGameLines(rows).get('1:11')
  const cands = [
    ...rows.flatMap((r) => [{ key: 'nhl_goal', row: r }, { key: 'nhl_season_goal_milestone', row: r }]),
    { key: 'nhl_hat_trick', row: lines }, { key: 'nhl_three_points', row: lines },
  ]
  const got = qualifyAll(cands)
  const by = (k) => got.filter((c) => c.key === k)
  assert.equal(by('nhl_hat_trick').length, 1); assert.equal(by('nhl_hat_trick')[0].tier, 'elite')
  assert.equal(by('nhl_season_goal_milestone').length, 1); assert.equal(by('nhl_season_goal_milestone')[0].tier, 'star')   // goal #20
  assert.equal(by('nhl_goal').length, 3)                       // three standing goals: BASE, BASE, STAR (overtime)
  assert.deepEqual(by('nhl_goal').map((c) => c.tier).sort(), ['base', 'base', 'star'])
  assert.equal(by('nhl_three_points').length, 0)               // a 3-goal night is the hat trick's
  assert.equal(got.length, 5)
  assert.equal(new Set(got.map((c) => c.cardId)).size, got.length, 'every card has its own id')
})

t('DUPLICATE INGESTION: the same feed twice, reordered, or re-read as copies, issues each card once', () => {
  const cands = [{ key: 'nhl_hat_trick', row: F.TEST_HAT }, { key: 'nhl_goal', row: F.TEST_GOAL_OT }, { key: 'nhl_season_goal_milestone', row: F.TEST_MILESTONE }]
  const first = qualifyAll(cands)
  assert.equal(first.length, 3)
  assert.equal(qualifyAll([...cands, ...cands]).length, 3, 'the same rows twice in one batch')
  assert.equal(qualifyAll(structuredClone([...cands].reverse())).length, 3, 'copies, in another order')
  const p1 = issuePlan(first, [])
  assert.equal(p1.issue.length, 3); assert.equal(p1.skip.length, 0)
  const issued = p1.issue.map((c) => ({ card_id: c.cardId, slot_id: c.slotId }))
  const p2 = issuePlan(qualifyAll(structuredClone(cands)), issued)
  assert.equal(p2.issue.length, 0, 'a second run over the same feed issues nothing'); assert.equal(p2.skip.length, 3)
  // a candidate list that names the same card twice issues it once
  assert.equal(issuePlan([first[0], first[0]], []).issue.length, 1)
  // a NEW rules version re-reads the same achievement: the slot blocks a second card
  const v3 = qualifyAll(cands, { rulesVersion: 'r3' })
  assert.notEqual(v3[0].cardId, first[0].cardId)
  const p3 = issuePlan(v3, issued)
  assert.equal(p3.issue.length, 0); assert.match(p3.skip[0].why, /earlier rules version/)
})

t('A CORRECTED STAT never mints a second card: the id ignores the tier; a 3rd goal later struck leaves the slot as it was', () => {
  const issued = qualifyAll([{ key: 'nhl_hat_trick', row: F.TEST_HAT }]).map((c) => ({ card_id: c.cardId, slot_id: c.slotId }))
  // the league re-credits a 4th goal to him: the same event, same player, same achievement, same id (the tier would rise to LEGEND; the audit trail records that, no new card)
  const four = goalsRow(4)
  const re = qualifyAll([{ key: 'nhl_hat_trick', row: { ...four, game_id: F.TEST_HAT.game_id, player_id: F.TEST_HAT.player_id, day: F.TEST_HAT.day } }])
  assert.equal(re.length, 1); assert.equal(re[0].tier, 'legend'); assert.equal(re[0].cardId, issued[0].card_id)
  assert.equal(issuePlan(re, issued).issue.length, 0)
})

t('TEST ROWS ARE LABELLED: every fixture name says Test', () => {
  for (const r of [F.TEST_GOAL, F.TEST_GOAL_OT, F.TEST_MILESTONE, F.TEST_LONG_SHOT]) assert.match(r.name, /^Test /)
  assert.match(F.TEST_HAT.name, /^Test /); assert.match(F.TEST_MULTI_HR.name, /^Test /); assert.match(F.TEST_100.name, /^Test /)
})

console.log(failed ? `\n${failed} FAILED` : '\nall card-rules-v2 checks passed')
process.exit(failed ? 1 : 0)
