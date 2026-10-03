#!/usr/bin/env node
// THE VALUE CALL, CHECKED (BATCH-MODEL-V2 M4). lib/model/valueCall.js and
// lib/shadowRecord.js gradeValueCalls on made-up games -- TEST DATA, every
// name and price below is invented. The real read is hand-checked separately
// (the commit names the games).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-value-call.mjs
import { valueCalls } from '../lib/model/valueCall.js'
import { gradeValueCalls, beforeStart, boxLines, mlbRecordsFromPor } from '../lib/shadowRecord.js'
import { priceKey } from '../lib/odds/priceAtLock.js'
import { tdBoardRows, tdResult } from '../lib/boardLock.js'
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

// NFL BOARD AT LOCK (TEST DATA): one week file, two games; the event is AAA at BBB.
const wk = {
  week: 9, built_at: 'TEST', games: [
    { game_id: 'G1', home: 'BBB', away: 'AAA', kickoff: '2099-01-01T18:00Z' },
    { game_id: 'G2', home: 'DDD', away: 'CCC', kickoff: '2099-01-01T18:00Z' },
  ],
  players: [
    { player_id: 'a1', name: 'Test A1', team: 'AAA', opp: 'BBB', position: 'RB', scores: { TD: 90 } },
    { player_id: 'a2', name: 'Test A2', team: 'AAA', opp: 'BBB', position: 'WR', scores: { TD: 50 } },
    { player_id: 'b1', name: 'Test B1', team: 'BBB', opp: 'AAA', position: 'TE', scores: { TD: 10 } },
    { player_id: 'b2', name: 'Test B2', team: 'BBB', opp: 'AAA', position: 'QB', scores: {} },              // no TD score: not rated
    { player_id: 'c1', name: 'Test C1', team: 'CCC', opp: 'DDD', position: 'RB', scores: { TD: 80 } },
    { player_id: 'd1', name: 'Test D1', team: 'DDD', opp: 'CCC', position: 'RB', scores: { TD: 70 } },
  ],
}
const picks = { card: { TD: { rungs: [{ player_id: 'a2', rank: 1 }] } } }
const lock = (over = {}) => tdBoardRows({ pricedIds: ['a1', 'a2', 'b1'], week: wk, picks, gameCalls: null, eventId: 'EV', gameDate: '2099-01-01', startsAt: '2099-01-01T18:00:00Z', takenAt: '2099-01-01T17:00:00Z', ...over })
const L = lock()
eq('only this game\'s rated players', L.rows.map((r) => r.player_id).join(','), 'a1,a2,b1')
eq('a TD pick is CALLED', L.rows.find((r) => r.player_id === 'a2').status, 'called')
eq('called_by names the market', L.rows.find((r) => r.player_id === 'a2').called_by, 'TD')
// week board: a1 90, c1 80, d1 70, a2 50, b1 10 -> of 5, top third = rank <= 2
eq('a1 rank 1 of 5 -> ON THE BOARD', L.rows.find((r) => r.player_id === 'a1').status, 'board')
eq('a1 board_of', L.rows.find((r) => r.player_id === 'a1').board_of, 5)
eq('b1 rank 5 -> off', L.rows.find((r) => r.player_id === 'b1').status, 'off')
eq('stale week file (kickoff a week off) writes nothing', lock({ startsAt: '2099-01-08T18:00:00Z' }).rows.length, 0)
eq('no priced player on the file writes nothing', lock({ pricedIds: ['zz'] }).rows.length, 0)

// grading (TEST DATA)
const logs = { logs: {
  a1: { log: [{ s: 2099, w: 9, tm: 'AAA', g_td: 2 }] },
  a2: { log: [{ s: 2099, w: 9, tm: 'AAA', g_td: 0 }] },
} }
eq('a TD = hit', tdResult({ player_id: 'a1', week: 9, team: 'AAA' }, logs, 2099)?.result, 'hit')
eq('no TD = miss', tdResult({ player_id: 'a2', week: 9, team: 'AAA' }, logs, 2099)?.result, 'miss')
eq('no row, his team logged = void', tdResult({ player_id: 'a3', week: 9, team: 'AAA' }, logs, 2099)?.result, 'void')
eq('team not logged yet = wait', tdResult({ player_id: 'b1', week: 9, team: 'BBB' }, logs, 2099), null)

// MLB (TEST DATA): por_rows -> records, graded off a made-up final box
const feed = (state, players) => ({ gameData: { status: { abstractGameState: state } }, liveData: { boxscore: { teams: { away: { players }, home: { players: {} } } } } })
const fin = boxLines(feed('Final', { ID1: { person: { id: 1 }, stats: { batting: { plateAppearances: 4, homeRuns: 1 } } }, ID2: { person: { id: 2 }, stats: { batting: { plateAppearances: 3, homeRuns: 0 } } }, ID3: { person: { id: 3 }, stats: { batting: {} } } }))
eq('box final', fin.final, true)
eq('box hr', fin.byId.get('1').hr, 1)
const por = (id, pk, role, rank, of) => ({ prediction_date: '2099-01-01', player_id: id, player: `Test ${id}`, game_pk: pk, team: 'TST', game_pick_role: role, scores: { hr: 50, board_rank: rank, board_of: of } })
const boxes = new Map([['100', fin], ['200', boxLines(feed('Live', {}))]])
const recs2 = mlbRecordsFromPor([
  por(1, 100, 'HR', 40, 90),        // a call: CALLED, homered -> hit
  por(2, 100, '', 10, 90),          // rank 10 of 90 (cut 30): ON THE BOARD, no HR -> miss
  por(3, 100, '', 50, 90),          // rank 50: NOT ON THE BOARD, 0 PA -> void
  por(4, 100, '', 5, null),         // no n and no role: out, never guessed
  por(1, 100, 'HR', 40, 90),        // the same row twice: once
  por(5, 200, 'TOP', 1, 90),        // game not final: not graded
  por(6, 100, '', 20, 90),          // not in the box at all -> void
], boxes)
eq('mlb rows kept', recs2.map((r) => r.player_id).join(','), '1,2,3,6')
eq('role -> CALLED', recs2[0].status, 'called'); eq('called homered', recs2[0].result, 'hit')
eq('rank 10/90 -> board', recs2[1].status, 'board'); eq('no HR -> miss', recs2[1].result, 'miss')
eq('rank 50/90 -> off', recs2[2].status, 'off'); eq('0 PA -> void', recs2[2].result, 'void')
eq('not in the box -> void', recs2[3].result, 'void')

console.log(`${n - bad}/${n} value-call checks pass`)
process.exit(bad ? 1 : 0)
