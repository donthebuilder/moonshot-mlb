// callsFromLock (lib/phone/todayCalls.js): pick_lock.json -> one card per man, first-pitch order. TEST data below, labelled.
import assert from 'node:assert/strict'
import { nflDeckItems, nhlDeckItems, nhlCalledFromLog, callsFromLock } from '../lib/phone/todayCalls.js'

const TEST_LOCK = { date: '2099-01-01', games: {
  g2: { first_pitch: '2099-01-01T23:00:00+00:00', cats: { TOP: { pid: 2, name: 'Test Bravo' }, HIT: { pid: 2, name: 'Test Bravo' }, HR: { pid: 3, name: 'Test Charlie' } } },
  g1: { first_pitch: '2099-01-01T18:00:00+00:00', cats: { TOP: { pid: 1, name: 'Test Alpha' }, JUNK: { pid: 9, name: 'Not A Role' } } },
} }
const out = callsFromLock(TEST_LOCK)
assert.deepEqual(out.items.map((i) => i.id), ['1', '2', '3'], 'first-pitch order, one entry per man')
assert.deepEqual(out.items[1].roles, ['TOP', 'HIT'], 'a man holding two calls is one card with both')
assert.ok(!out.items.some((i) => i.id === '9'), 'only the five roles count')
assert.equal(callsFromLock(null).items.length, 0)
assert.equal(callsFromLock({ games: {} }).items.length, 0)
console.log('ok   callsFromLock: one card per called man, first-pitch order, five roles only (TEST data)')

// TUDDY and LAMP decks (2026-10-18). TEST data, labelled.
const TEST_BOARD = { week: 99, label: 'Test week', items: [{ id: 'A', name: 'Test A', team: 'AAA', opp: 'BBB', position: 'RB' }, { id: 'B', name: 'Test B', team: 'ZZZ', opp: 'YYY', position: 'WR' }] }
const nfl = nflDeckItems(TEST_BOARD, [{ game_id: 'g9', home: 'AAA', away: 'BBB', kickoff: '2099-01-01T18:00:00Z' }])
assert.deepEqual(nfl.items.map((i) => [i.gameId, i.firstPitch, i.status]), [['g9', '2099-01-01T18:00:00Z', 'called'], [null, null, 'called']], 'NFL: game and kickoff by club; a club with no game keeps nulls')
assert.deepEqual(nfl.items.map((i) => i.id), ['A', 'B'], 'NFL: the bot\'s order is kept')
assert.equal(nflDeckItems({ items: [] }, []), null)
const TEST_ROWS = [{ player_id: 5, name: 'Test Five', team: 'AAA', opp: 'BBB', pos: 'C', game_id: 777, status: 'called', score: 60 }, { player_id: 6, name: 'Test Six', team: 'BBB', opp: 'AAA', pos: 'W', game_id: 777, status: 'board', score: 70 }]
const called = nhlCalledFromLog(TEST_ROWS, [{ game_id: 777, locked_at: 'x' }])
assert.deepEqual(called.items.map((i) => i.gameId), ['777'], 'NHL: the called row carries its game id')
const nhl = nhlDeckItems(called, [{ id: 777, startUtc: '2099-01-01T00:00:00Z' }])
assert.deepEqual(nhl.items.map((i) => [i.gameId, i.firstPitch, i.roles[0], i.status]), [['777', '2099-01-01T00:00:00Z', 'GOAL', 'called']])
console.log('ok   nflDeckItems / nhlDeckItems: each man carries game id, start time and the word called (TEST data)')
