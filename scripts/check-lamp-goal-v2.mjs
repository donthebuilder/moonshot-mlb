#!/usr/bin/env node
// lamp-goal-v2 (2026-10-01, BATCH-GAME-CALLS L3). TEST DATA only: made-up
// skaters and lines, no real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-goal-v2.mjs
import { scoreNight, MODEL_VERSION } from '../lib/nhl/goalModel.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const sk = (gameId, team, id, s) => ({ gameId, team, playerId: id, name: `Test ${id}`, legs: { ok: true, shotsPg: s, goalsPg: s / 10, toi: 900 + s * 10 } })
const off = (gameId, team, id) => ({ gameId, team, playerId: id, name: `Test ${id}`, legs: { ok: false, reason: 'test: fewer than 10 games' } })

eq('version', MODEL_VERSION, 'lamp-goal-v2')
// Game 1: club A is stronger top to bottom -- v1 would call three A skaters.
const night = [
  sk(1, 'AAA', 'a1', 4.0), sk(1, 'AAA', 'a2', 3.8), sk(1, 'AAA', 'a3', 3.6), sk(1, 'BBB', 'b1', 2.0), sk(1, 'BBB', 'b2', 1.0),
  // Game 2: club D has nobody scored (all fewer than 10 games)
  sk(2, 'CCC', 'c1', 3.0), sk(2, 'CCC', 'c2', 0.5), off(2, 'DDD', 'd1'),
]
const rows = scoreNight(night)
const by = Object.fromEntries(rows.map((r) => [r.playerId, r]))
eq('game 1: one call per team', rows.filter((r) => r.gameId === 1 && r.status === 'called').map((r) => r.team).sort(), ['AAA', 'BBB'])
eq('game 1: the higher call is TOP, the other GOAL', [by.a1.role, by.b1.role], ['TOP', 'GOAL'])
eq('a2 is not called even though he outscores b1', by.a2.status === 'called', false)
eq('game 2: a club with nobody scored gets no call', rows.filter((r) => r.gameId === 2 && r.status === 'called').map((r) => r.playerId), ['c1'])
eq('the unscored skater keeps his reason', [by.d1.status, by.d1.reason], ['off', 'test: fewer than 10 games'])
// 7 scored tonight -> top third = ceil(7/3) = 3 night ranks
eq('night board: 7 scored', by.a1.nightOf, 7)
const notCalled = rows.filter((r) => r.score != null && r.status !== 'called')
eq('top-third boundary: ON THE BOARD only at night rank <= 3', notCalled.every((r) => (r.status === 'board') === (r.nightRank <= 3)), true)
eq('below the cut reads NOT ON THE BOARD with the cut printed', notCalled.filter((r) => r.status === 'off').every((r) => /top third/.test(r.reason)), true)
eq('projection logged: 1 - exp(-goals/gp)', by.a1.goalGameProbability, Math.round((1 - Math.exp(-0.4)) * 1000) / 1000)
// ties: two skaters on one club, same score -> shots/GP breaks it (byScore), deterministic
const tie = scoreNight([sk(3, 'EEE', 'e1', 2.0), { ...sk(3, 'EEE', 'e2', 2.0) }, sk(3, 'FFF', 'f1', 1.0)])
eq('a tie still yields exactly one call for the club', tie.filter((r) => r.team === 'EEE' && r.status === 'called').length, 1)
console.log(fail ? `\n${fail} FAILED` : '\nall green')
process.exit(fail ? 1 : 0)
