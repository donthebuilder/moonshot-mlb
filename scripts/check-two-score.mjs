#!/usr/bin/env node
// TWO-SCORE (2026-10-11). TEST data only: made-up players, labelled TEST.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-two-score.mjs
// Proves: the ranking is monotone in every input; the trigger (-300 stays anytime, -301 checks 2+; goals -150 stays,
// -151 checks 2+; no 2+ price = no Card straight, still tracked; floor +120; top third); grading arithmetic for 2+ TDs
// (rushing + receiving, tdsIn); the board is a registry entry (no sport ternary); nothing prints a probability.
import { readFileSync } from 'node:fs'
import { twoScore, twoBoard, rawInputs, twoTds, twoResult, TWO_INPUTS, TWO_MODEL } from '../lib/nfl/twoScore.js'
import { twoPlusDecision, shorterThanCut } from '../lib/twoPlus/trigger.js'
import { TWO_PLUS } from '../lib/twoPlus/rules.js'
import { tdResult2 } from '../lib/boardLock.js'
import { scoreGoal2Night, goal2Legs, gradeGoal2Rows, WEIGHTS as G2W } from '../lib/nhl/goal2Model.js'

let fail = 0
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : `: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`) }

// TEST pool: ten made-up players with spread inputs
const mk = (i) => ({ xtd: i * 0.2, gl: i * 0.5, rz: i, team: 40 + i * 4, snap: 50 + i * 4, dvp: i * 10 })
const pool = Array.from({ length: 10 }, (_, i) => mk(i + 1))
const base = mk(5)
const s0 = twoScore(base, pool).score
for (const i of TWO_INPUTS) {
  const up = { ...base, [i.key]: base[i.key] * 1.6 }
  const p2 = pool.map((r) => (r === pool[4] ? up : r))
  const s1 = twoScore(up, p2).score
  eq(`TEST: raising ${i.key} never lowers the score`, s1 >= s0, true)
}
eq('TEST: a missing input is left out, the rest re-weighted (score still 0-100)', (() => { const r = twoScore({ ...base, dvp: null }, pool); return r.score >= 0 && r.score <= 100 && r.missing.join() === 'dvp' })(), true)
eq('TEST: no inputs = no score', twoScore({}, pool).score, null)

// board ordering: better inputs rank higher
const P = (id, i) => ({ player_id: id, name: `TEST ${id}`, team: 'AAA', opp: 'BBB', position: 'RB', scores: { TD: 50 + i }, stats: { xTD: i * 0.2, GL: i * 0.5, RZ: i }, components: { TD: { implied_total: 40 + i * 4, f_snap_pct: 50 + i * 4 } } })
const slate = { markets: [{ key: 'TD', positions: ['RB', 'WR', 'TE'] }], players: Array.from({ length: 9 }, (_, i) => P(`t${i + 1}`, i + 1)).concat([{ ...P('bye', 9), on_bye: true }]) }
const b = twoBoard(slate)
eq('TEST: board is in descending input order, bye excluded', b.rows.map((r) => r.player_id), ['t9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 't1'])
eq('TEST: top third can score two (3 of 9)', b.rows.filter((r) => r.can_two).map((r) => r.player_id), ['t9', 't8', 't7'])
eq('TEST: his own TD score is untouched', b.rows[0].scores.TD, 59)
eq('TEST: model version is its own', TWO_MODEL.model_version, 'td2_site_v1')
eq('TEST: a QB is not on the board when the file does not list QB', twoBoard({ ...slate, players: [{ ...P('qb', 3), position: 'QB' }] }).rows.length, 0)

// TRIGGER (Donovan 10-11: -300 NFL/MLB, -150 NHL)
eq('NFL -300 stays anytime', twoPlusDecision({ sport: 'nfl', anytime: -300, twoPrice: 400, rank: 1, of: 30 }).check2, false)
eq('NFL -301 checks 2+', twoPlusDecision({ sport: 'nfl', anytime: -301, twoPrice: 400, rank: 1, of: 30 }).check2, true)
eq('MLB -300 stays, -301 checks', [shorterThanCut('mlb', -300), shorterThanCut('mlb', -301)], [false, true])
eq('NHL -150 stays anytime', shorterThanCut('nhl', -150), false)
eq('NHL -151 checks 2+ goals', twoPlusDecision({ sport: 'nhl', anytime: -151, twoPrice: 300, rank: 1, of: 30 }).check2, true)
eq('NHL checked but tracked, not carded by default (goals exempt from the floor)', (({ card, tracked }) => [card, tracked])(twoPlusDecision({ sport: 'nhl', anytime: -151, twoPrice: 300, rank: 1, of: 30 })), [false, true])
eq('a plus-money anytime price never checks', shorterThanCut('nfl', 150), false)
eq('no 2+ price = no Card straight, still tracked', (({ card, tracked }) => [card, tracked])(twoPlusDecision({ sport: 'nfl', anytime: -400, twoPrice: null, rank: 1, of: 30 })), [false, true])
eq('2+ price under +120 = tracked', twoPlusDecision({ sport: 'nfl', anytime: -400, twoPrice: 110, rank: 1, of: 30 }).card, false)
eq('2+ price +120 at rank 10 of 30 = Card straight', twoPlusDecision({ sport: 'nfl', anytime: -400, twoPrice: 120, rank: 10, of: 30 }).card, true)
eq('2+ price clears but rank 11 of 30 (outside the top third) = tracked', twoPlusDecision({ sport: 'nfl', anytime: -400, twoPrice: 500, rank: 11, of: 30 }).card, false)
eq('a custom floor from the Card rules config is honoured', twoPlusDecision({ sport: 'nfl', anytime: -400, twoPrice: 150, rank: 1, of: 30, floor: 200 }).card, false)
eq('thresholds live in one table', [TWO_PLUS.nfl.trigger, TWO_PLUS.mlb.trigger, TWO_PLUS.nhl.trigger], [-300, -300, -150])

// GRADING
eq('TEST: 1 rush + 1 rec TD = 2 = hit', [twoTds({ rushing_tds: 1, receiving_tds: 1 }), twoResult(twoTds({ rushing_tds: 1, receiving_tds: 1 }))], [2, 'hit'])
eq('TEST: a passing TD is not counted', twoTds({ passing_tds: 3, rushing_tds: 1 }), 1)
eq('TEST: one TD is a miss', twoResult(1), 'miss')
const logs = { logs: { a: { log: [{ s: 2026, w: 5, tm: 'AAA', g_td: 2 }] }, b: { log: [{ s: 2026, w: 5, tm: 'AAA', g_td: 1 }] }, c: { log: [{ s: 2026, w: 5, tm: 'AAA', g_td: 0 }] } } }
const row = (id) => ({ player_id: id, week: 5, team: 'AAA' })
eq('TEST: grade from the game log: 2 hit, 1 miss, 0 miss, absent-with-team-logged void', [tdResult2(row('a'), logs, 2026), tdResult2(row('b'), logs, 2026), tdResult2(row('c'), logs, 2026), tdResult2(row('z'), logs, 2026)], [{ result: 'hit', actual: 2 }, { result: 'miss', actual: 1 }, { result: 'miss', actual: 0 }, { result: 'void', actual: null }])

// NHL 2+ GOALS (TEST skaters)
const L = (i) => goal2Legs({ ok: true, shotsPg: 1 + i * 0.3, goalsPg: 0.1 + i * 0.05, toi: 900 + i * 60 })
const cands = Array.from({ length: 9 }, (_, i) => ({ gameId: 1, playerId: i + 1, name: `TEST ${i + 1}`, team: i % 2 ? 'AAA' : 'BBB', opp: 'X', pos: 'C', legs: L(i + 1) }))
const g2 = scoreGoal2Night(cands)
eq('TEST: goals board orders by input strength', g2.filter((r) => r.score != null).sort((a, b) => a.nightRank - b.nightRank).map((r) => r.playerId), [9, 8, 7, 6, 5, 4, 3, 2, 1])
eq('TEST: nothing is CALLED on the 2+ goals board (tracked, not carded)', g2.some((r) => r.status === 'called'), false)
eq('TEST: ON THE BOARD is the top third (3 of 9)', g2.filter((r) => r.status === 'board').length, 3)
eq('TEST: weights are positive (monotone)', Object.values(G2W).every((w) => w > 0), true)
eq('TEST: no shots line = not scored', goal2Legs({ ok: true, shotsPg: 0, goalsPg: 0, toi: 900 }).ok, false)
const pbgs = { awayTeam: { forwards: [{ playerId: 1, goals: 2 }, { playerId: 2, goals: 1 }], defense: [] }, homeTeam: { forwards: [], defense: [] } }
eq('TEST: 2 goals = hit, 1 = miss, not dressed = void', gradeGoal2Rows([{ playerId: 1 }, { playerId: 2 }, { playerId: 3 }], pbgs).map((r) => r.hit), [true, false, null])

// REGISTRY + NO PRINTED PROBABILITY
const hub = readFileSync(new URL('../components/nfl/tabs/BoardHub.js', import.meta.url), 'utf8')
const reg = readFileSync(new URL('../lib/nfl/boardMarkets.js', import.meta.url), 'utf8')
eq('board is a registry entry (TD2 in HUB_MARKETS, no sport ternary in the hub)', [/'TD2'/.test(reg), /sport === 'nfl' \?/.test(hub)], [true, false])
const files = ['lib/nhl/goal2Model.js', 'lib/nfl/twoScore.js', 'components/nfl/tabs/TwoTouchdowns.js', 'lib/twoPlus/trigger.js']
eq('no printed percent in the two-score files', files.some((f) => /%\s*chance|probabilit(y|ies)\s*of|\bchance of\b/i.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/NOT a probability[^\n]*/g, ''))), false)

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
