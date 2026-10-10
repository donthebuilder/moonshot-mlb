#!/usr/bin/env node
// lamp-goalw-v1 (2026-10-10, .claude-notes/LAMP-GOALW-DEFINITION.md). TEST DATA only: made-up skaters and
// lines, no real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-goalw.mjs
import { readFileSync } from 'node:fs'
import { scoreGoalWeightedNight, goalWeightedP, gradeGoalWeightedRows, toGoalWeightedRow, MODEL_VERSION, MARKET } from '../lib/nhl/goalWeightedModel.js'
import { scoreNight, MODEL_VERSION as LIVE } from '../lib/nhl/goalModel.js'
import MODEL from '../lib/nhl/goalWeightedV1.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const t = (name, ok) => eq(name, Boolean(ok), true)
const sk = (gameId, team, id, s, pos = 'C', toi = 900 + s * 100) => ({ gameId, team, opp: team === 'AAA' ? 'BBB' : 'AAA', home: team === 'AAA', playerId: id, name: `Test ${id}`, pos, legs: { ok: true, shotsPg: s, goalsPg: s / 10, toi, gpPooled: 82, gpCur: 0, gpPrev: 82, prevWeight: 1 }, context: {} })
const off = (gameId, team, id) => ({ gameId, team, playerId: id, name: `Test ${id}`, pos: 'C', legs: { ok: false, reason: 'test: fewer than 3 games' }, context: {} })

eq('version', [MODEL_VERSION, MODEL.version, MARKET], ['lamp-goalw-v1', 'lamp-goalw-v1', 'GOAL'])
t('a shadow, beside the live version (not the live one)', MODEL_VERSION !== LIVE)
eq('the fitted features are the definition\'s four', MODEL.features, ['goalsPg', 'shotsPg', 'toiMin', 'isD'])
t('the fit window ends before this model existed (no later data in the weights)', MODEL.fitted_on.to < '2026-10-01')
t('every coefficient, mean and sd is a finite number', MODEL.features.every((k) => [MODEL.weights[k], MODEL.mean[k], MODEL.sd[k]].every(Number.isFinite)) && Number.isFinite(MODEL.intercept))

// P: monotone in each leg, lower for a defenceman at equal numbers, always inside (0, 1)
const base = { ok: true, shotsPg: 2, goalsPg: 0.2, toi: 1000 }
const p0 = goalWeightedP(base, 'C')
t('more shots raises P', goalWeightedP({ ...base, shotsPg: 3 }, 'C') > p0)
t('more goals a game raises P', goalWeightedP({ ...base, goalsPg: 0.4 }, 'C') > p0)
t('more ice time raises P', goalWeightedP({ ...base, toi: 1200 }, 'C') > p0)
t('a defenceman at the same numbers is lower', goalWeightedP(base, 'D') < p0)
t('P stays inside (0, 1)', [goalWeightedP({ ok: true, shotsPg: 0, goalsPg: 0, toi: 0 }, 'D'), goalWeightedP({ ok: true, shotsPg: 9, goalsPg: 2, toi: 2400 }, 'C')].every((p) => p > 0 && p < 1))

// a night: game 1 has a strong club AAA and a weak BBB (with a high-minute defenceman); game 2 has an unscored club
const night = [
  sk(1, 'AAA', 'a1', 4.0), sk(1, 'AAA', 'a2', 3.8), sk(1, 'AAA', 'a3', 3.6), sk(1, 'BBB', 'b1', 2.0), sk(1, 'BBB', 'b2', 1.0), sk(1, 'BBB', 'bd', 2.2, 'D', 1500),
  sk(2, 'CCC', 'c1', 3.0), sk(2, 'CCC', 'c2', 0.5), off(2, 'DDD', 'd1'),
]
const rows = scoreGoalWeightedNight(night)
const by = Object.fromEntries(rows.map((r) => [r.playerId, r]))
eq('one row out for every candidate in', rows.length, night.length)
eq('game 1: one call per team', rows.filter((r) => r.gameId === 1 && r.status === 'called').map((r) => r.team).sort(), ['AAA', 'BBB'])
eq('game 1: the higher call is TOP, the other GOAL', [by.a1.role, by.b1.role], ['TOP', 'GOAL'])
t('the defenceman with more minutes does not take his club\'s call from the forward', by.bd.status !== 'called' && by.b1.status === 'called')
eq('game 2: a club with nobody scored gets no call, the other keeps his', rows.filter((r) => r.gameId === 2 && r.status === 'called').map((r) => r.playerId), ['c1'])
eq('the unscored skater keeps his reason', [by.d1.status, by.d1.reason, by.d1.score], ['off', 'test: fewer than 3 games', null])
const scored = rows.filter((r) => r.score != null)
eq('night board: 8 scored', by.a1.nightOf, 8)
t('score is a 0-100 percentile', scored.every((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= 100))
const notCalled = scored.filter((r) => r.status !== 'called')
t('top third = ceil(8/3) = 3 night ranks: ON THE BOARD only at night rank <= 3', notCalled.every((r) => (r.status === 'board') === (r.nightRank <= 3)))
t('below the cut reads NOT ON THE BOARD with the cut printed', notCalled.filter((r) => r.status === 'off').every((r) => /top third/.test(r.reason)))
t('night rank follows P, best first', scored.slice().sort((a, b) => a.nightRank - b.nightRank).every((r, i, a) => i === 0 || a[i - 1].p >= r.p))
t('P is logged in the row\'s context and rides nowhere else visible', scored.every((r) => typeof r.context.modelP === 'number' && r.context.modelP > 0 && r.context.modelP < 1))
// ties: two skaters with identical lines are ordered by name, deterministic, exactly one call for the club
const tie = scoreGoalWeightedNight([sk(3, 'EEE', 'e1', 2.0), sk(3, 'EEE', 'e2', 2.0), sk(3, 'FFF', 'f1', 1.0)])
eq('a tie still yields exactly one call for the club, by name', tie.filter((r) => r.team === 'EEE' && r.status === 'called').map((r) => r.playerId), ['e1'])
// same status vocabulary as the live board (lib/callStatus.js reads these three words)
t('statuses are only called / board / off', rows.every((r) => ['called', 'board', 'off'].includes(r.status)))
// the live scorer is untouched by this file: the same input gives the same live output as before
eq('the live board still scores the same night with its own rule (called per team)', scoreNight(night).filter((r) => r.gameId === 1 && r.status === 'called').length, 2)

// the lamp_prop_log row and its grade
const g = { id: 2026029999, season: 20262027, gameType: 2, startUtc: '2026-10-11T23:00:00Z' }
const row = toGoalWeightedRow(by.a1, g, { date: '2026-10-11' }, '2026-10-11T22:50:00Z')
eq('row identity', [row.market, row.model_version, row.bar, row.game_id, row.player_id], ['GOAL', 'lamp-goalw-v1', 1, 2026029999, 'a1'])
eq('row carries the status the lock decided', row.status, by.a1.status)
const pbgs = { awayTeam: { forwards: [{ playerId: 101, goals: 2 }, { playerId: 102, goals: 0 }], defense: [] }, homeTeam: { forwards: [], defense: [] } }
const gr = gradeGoalWeightedRows([{ player_id: 101 }, { player_id: 102 }, { player_id: 999 }], pbgs)
eq('graded: scorer hit, dressed blank a miss, not dressed void (never a miss)', gr.map((r) => [r.dressed, r.value, r.hit]), [[true, 2, true], [true, 0, false], [false, null, null]])

// the lock rule lives in the tick: the shadow is in its list, and the list's loop refuses a write at or after puck drop
const tick = readFileSync(new URL('../app/api/lamp/tick/route.js', import.meta.url), 'utf8')
t('the tick writes the shadow through the SHADOW list', /market: GOALW, key: 'goalw', byGame: 'goalWByGame'/.test(tick))
t('the shadow loop re-reads the clock and refuses a write at or after puck drop', /if \(Date\.now\(\) >= start\) \{ out\.skipped\.push\(\{ game: g\.id, why: `\$\{m\.market\}: puck dropped before its write` \}\); continue \}/.test(tick))
t('the board returns the shadow rows', /goalWByGame/.test(readFileSync(new URL('../lib/nhl/goalBoard.js', import.meta.url), 'utf8')))
console.log(fail ? `\n${fail} FAILED` : '\nall green')
process.exit(fail ? 1 : 0)
