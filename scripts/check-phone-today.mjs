// callsFromLock (lib/phone/todayCalls.js): pick_lock.json -> one card per man, first-pitch order. TEST data below, labelled.
import assert from 'node:assert/strict'
import { callsFromLock } from '../lib/phone/todayCalls.js'

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
