#!/usr/bin/env node
// The postseason X rules (X-POSTSEASON-POSTING-PLAN), checked on TEST DATA
// (made-up rows, labelled; no real player's line).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-postseason-x.mjs
import assert from 'node:assert/strict'
const { gameCalls, gameCallText, callProblem, callCase, callRole, PLAIN_BAR } = await import('../lib/dash/gameCall.js')
const { isRested } = await import('../lib/dash/xRest.js')
const { X_EVENTS } = await import('../lib/dash/xEvents.js')

let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }

// TEST DATA: one game, a TOP call, an HR call and a HIT call, lineups set
const game = (over = {}) => ({ game_pk: 1, team: 'AAA', opponent: 'BBB', game_time: '2026-10-01T23:08:00Z', lineup_confirmed: true, pitcher_name: 'Test Arm', pitcher_throws: 'R', bats: 'L', ...over })
const rows = [
  game({ player_id: 1, name: 'Test Hit', game_pick_role: 'HIT', hit_score: 90 }),
  game({ player_id: 2, name: 'Test Slugger', game_pick_role: 'HR', hr_score: 70, pitcher_hr9_vs_lhb: 1.6 }),
  game({ player_id: 3, name: 'Test Top', game_pick_role: 'TOP/HR', hr_score: 65, season_hr: 30, season_k_rate: 0.3 }),
  game({ player_id: 4, name: 'Test Bench', game_pick_role: '', hr_score: 99 }),
]

ok('the top CALLED hitter per game: TOP before HR before HIT', () => {
  const c = gameCalls(rows)
  assert.equal(c.length, 1); assert.equal(c[0].row.name, 'Test Top'); assert.equal(c[0].role, 'TOP')
})
ok('a game waits until BOTH lineups are confirmed', () => {
  assert.equal(gameCalls([...rows, game({ player_id: 5, name: 'Test Unposted', lineup_confirmed: false })])[0].confirmed, false)
  assert.equal(gameCalls(rows)[0].confirmed, true)
})
ok('no called hitter in a game -> no post for it', () => {
  assert.equal(gameCalls([game({ player_id: 9, game_pick_role: 'WATCH' })]).length, 0)
})
ok('the bar is plain words, never a bare code', () => {
  for (const r of ['TOP', 'HR', 'HRR', 'HIT', 'CONTACT']) assert.ok(!/\b(HRR|CONTACT)\b/.test(PLAIN_BAR[r]), r)
  assert.equal(callRole({ game_pick_role: 'HRR/HIT' }), 'HRR')
})
ok('the case is the one number on his row', () => {
  assert.match(callCase(rows[1], 'HR'), /1\.60 home runs per 9 innings to lefties/)
  assert.match(callCase(rows[2], 'TOP'), /30 home runs this season/)
})
ok('the problem comes from his row -- or there is none', () => {
  assert.match(callProblem(rows[2]), /strikes out 30%/)
  assert.equal(callProblem(game({ season_k_rate: 0.18, avg_vs_rhp: 0.28, lineup_spot: 3 })), null)
  assert.match(callProblem(game({ lineup_spot: 8 })), /bats 8th/)
})
ok('the post names the bar and says it is graded against it', () => {
  const t = gameCallText(gameCalls(rows)[0])
  assert.match(t, /TEST TOP — 1\+ home run/); assert.match(t, /The case: /); assert.match(t, /The problem: /); assert.match(t, /Graded against exactly that/)
  const quiet = gameCallText(gameCalls([game({ player_id: 7, name: 'Test Quiet', game_pick_role: 'HR', season_hr: 12 })])[0])
  assert.ok(!/The problem/.test(quiet))
})
ok('the claim kind passes widen_18 (call_<game_pk>)', () => {
  for (const c of gameCalls(rows)) assert.match(`call_${c.game_pk}`, /^call_[0-9]+$/)
})

ok('polls are back (2026-10-09): nothing is rested in code, the old vote kinds included', () => {
  for (const k of ['botpoll', 'community_pick', 'nfl_botpoll', 'nfl_community', 'poll_pick', 'pregame']) assert.equal(isRested(k), false, k)
})
ok('events: CALLED only unless X_EVENTS=all', () => { assert.equal(X_EVENTS, process.env.X_EVENTS === 'all' ? 'all' : 'called') })
console.log(`\n${n} checks passed`)
