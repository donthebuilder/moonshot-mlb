#!/usr/bin/env node
// THE VALUE CALL, CHECKED (BATCH-MODEL-V2 M4). lib/model/valueCall.js and
// lib/shadowRecord.js gradeValueCalls on made-up games -- TEST DATA, every
// name and price below is invented. The real read is hand-checked separately
// (the commit names the games).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-value-call.mjs
import { valueCalls } from '../lib/model/valueCall.js'
import { gradeValueCalls, beforeStart } from '../lib/shadowRecord.js'
import { priceKey } from '../lib/odds/priceAtLock.js'
let bad = 0, n = 0
const eq = (name, got, want) => { n++; if (got !== want && !(Number.isFinite(got) && Math.abs(got - want) < 1e-9)) { bad++; console.log('  FAIL', name, 'got', got, 'want', want) } }

// TEST DATA: one game, six priced players. Scores rise with the id; implied chances don't.
const P = (id, score, implied, status = 'board') => ({ player_id: `T${id}`, score, implied, status })
const base = [P(1, 10, 0.30, 'off'), P(2, 20, 0.25, 'off'), P(3, 30, 0.20), P(4, 40, 0.05), P(5, 50, 0.35), P(6, 60, 0.40, 'called')]
// m: T1 0, T2 .2, T3 .4, T4 .6, T5 .8, T6 1. b: T4 0, T3 .2, T2 .4, T1 .6, T5 .8, T6 1.
// gaps: T3 .2, T4 .6, T5 0, T6 0 (T1/T2 are off)
let [g] = valueCalls([{ game_id: 1, players: base }])
eq('the biggest gap among board/called wins', g.pick?.player_id, 'T4')
eq('its model percentile', g.pick?.m, 0.6)
eq('its book percentile', g.pick?.b, 0)
eq('priced count', g.priced, 6)

// an OFF player with a bigger gap is never the call. T2..T7: T7 (off) gap 1.0, T4 gap .2 -> minGap .1
;[g] = valueCalls([{ game_id: 1, players: [...base.slice(1), P(7, 70, 0.01, 'off')] }], { minGap: 0.1 })
eq('off never picked', g.pick?.player_id, 'T4')

// fewer than six priced players: no call
;[g] = valueCalls([{ game_id: 1, players: [...base.slice(0, 5), { ...P(6, 60, NaN, 'called') }] }])
eq('5 priced -> no call', g.pick, null)
eq('5 priced counted', g.priced, 5)

// nobody clears the gap: no call
;[g] = valueCalls([{ game_id: 1, players: base.map((p, i) => ({ ...p, implied: 0.05 * (i + 1) })) }])
eq('all priced in model order -> no call', g.pick, null)

// gap exactly at the threshold counts
;[g] = valueCalls([{ game_id: 1, players: base }], { minGap: 0.6 })
eq('gap == minGap is eligible', g.pick?.player_id, 'T4')
;[g] = valueCalls([{ game_id: 1, players: base }], { minGap: 0.61 })
eq('gap < minGap is not', g.pick, null)

// a tie on the gap goes to the higher score
const tie = [P(1, 10, 0.50, 'off'), P(2, 20, 0.45, 'off'), P(3, 30, 0.02), P(4, 40, 0.01), P(5, 50, 0.60), P(6, 60, 0.70)]
// m: T3 .4, T4 .6; b: T4 0, T3 .2 -> gaps .2 and .6 -- make them tie by moving T3's price below T4's tie point
const tie2 = tie.map((p) => (p.player_id === 'T3' ? { ...p, implied: 0.005 } : p))
// now b: T3 0, T4 .2 -> T3 gap .4, T4 gap .4: tie, T4 has the higher score
;[g] = valueCalls([{ game_id: 1, players: tie2 }])
eq('tie -> higher score', g.pick?.player_id, 'T4')

// GRADING (TEST DATA): one game, prices keyed like odds_snap's lock read
const recs = [
  ['T1', 10, 'off', 'miss', -150], ['T2', 20, 'off', 'miss', 200], ['T3', 30, 'board', 'miss', 300],
  ['T4', 40, 'board', 'hit', 900], ['T5', 50, 'board', 'miss', 180], ['T6', 60, 'called', 'hit', 150],
  ['T7', 70, 'called', 'void', 120],          // didn't dress: out of every count
].map(([id, score, status, result, odds]) => ({ id, rec: { game_id: 9, game_date: '2099-01-01', player_id: id, score, status, result, pos: id === 'T4' ? 'D' : 'C' }, odds }))
const prices = new Map(recs.map(({ id, odds }) => [priceKey('nhl', '2099-01-01', id), { median: odds, best: odds + 50 }]))
const gr = gradeValueCalls(recs.map((r) => r.rec), prices)
eq('one game graded (void left out)', gr.games, 1)
eq('value call T4', gr.picks[0]?.player_id, 'T4')
eq('value n', gr.value.n, 1)
eq('value hit', gr.value.hit, 1)
eq('value ROI at median (+900 -> +900%)', gr.value.roiMed, 900)
eq('value ROI at best (+950)', gr.value.roiBest, 950)
eq('value implied (+900 = 10%)', gr.value.implied, 10)
eq('called n (void T7 out)', gr.called.n, 1)
eq('called ROI at median (+150)', gr.called.roiMed, 150)

// a price read at or after the start never counts (TEST DATA)
const kept = beforeStart([
  { id: 'a', taken_at: '2099-01-01T23:50:00Z', starts_at: '2099-01-02T00:00:00Z' },
  { id: 'b', taken_at: '2099-01-02T00:00:00Z', starts_at: '2099-01-02T00:00:00Z' },
  { id: 'c', taken_at: '2099-01-02T00:05:00Z', starts_at: '2099-01-02T00:00:00Z' },
  { id: 'd', taken_at: '2099-01-01T23:50:00Z', starts_at: null },
]).map((r) => r.id).join(',')
eq('only prices read before the start', kept, 'a')

console.log(`${n - bad}/${n} value-call checks pass`)
process.exit(bad ? 1 : 0)
