#!/usr/bin/env node
// THE MEMBERS LOCK, CHECKED (2026-10-16). lib/members/gate.js decides which of tonight's CALLED labels a non-member sees as the lock.
// Plain node, TEST DATA only (the names and times below are made up for this check and are labelled as test data).
//   node scripts/check-member-gate.mjs
import './_esm-resolve.mjs'
import { readFileSync } from 'node:fs'

const { memberStateOf, startedAt, freeCalledKeys, lockedFor } = await import('../lib/members/gate.js')
const { FREE_CALLS_PER_SPORT } = await import('../lib/members/limits.js')
const access = readFileSync(new URL('../lib/members/access.js', import.meta.url), 'utf8')

const fails = []
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${msg}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }
const ok = (cond, msg) => { if (!cond) fails.push(msg) }

// TEST DATA: one sport's board, 7 called + others, all before first pitch
const NOW = Date.parse('2030-01-01T20:00:00Z')
const LATER = '2030-01-01T23:00:00Z'
const EARLIER = '2030-01-01T18:00:00Z'
const mk = (id, status, time = LATER, rank = id) => ({ id: `test-${id}`, status, time, rank })
const board = [mk(1, 'called'), mk(2, 'called'), mk(3, 'board'), mk(4, 'called'), mk(5, 'called'), mk(6, 'called'), mk(7, 'called'), mk(8, 'off'), mk(9, 'called')]
const opts = { keyOf: (r) => r.id, startedOf: (r) => startedAt(r.time, { now: NOW }), statusOf: (r) => r.status, rankOf: (r) => r.rank }

// 0. the number is Donovan's, written once (access.js re-exports it)
eq(FREE_CALLS_PER_SPORT, 4, 'FREE_CALLS_PER_SPORT')
ok(/export \{[^}]*FREE_CALLS_PER_SPORT/.test(access), 'lib/members/access.js no longer re-exports FREE_CALLS_PER_SPORT')

// 1. free gets exactly 4 per sport, in the board's own order, then locks
const free = freeCalledKeys(board, opts)
eq([...free], ['test-1', 'test-2', 'test-4', 'test-5'], 'the free four are the first four CALLED rows')
const lockedIds = board.filter((r) => lockedFor({ status: r.status, started: false, graded: false, key: r.id, free, memberState: 'free' })).map((r) => r.id)
eq(lockedIds, ['test-6', 'test-7', 'test-9'], 'the rest of the CALLED rows lock')
// another sport is its own count
eq(freeCalledKeys([mk(21, 'called'), mk(22, 'called')], opts).size, 2, 'a second sport has its own four')

// 2. member / unknown are never locked; ON THE BOARD / NOT ON THE BOARD never lock
const lockedWith = (over) => lockedFor({ status: 'called', started: false, graded: false, key: 'test-9', free, memberState: 'free', ...over })
eq(lockedWith({}), true, 'baseline: a fifth called pick locks for a free viewer')
eq(lockedWith({ memberState: 'member' }), false, 'member is never locked')
eq(lockedWith({ memberState: 'unknown' }), false, 'unknown fails open')
eq(lockedWith({ status: 'board' }), false, 'ON THE BOARD is never locked')
eq(lockedWith({ status: 'off' }), false, 'NOT ON THE BOARD is never locked')
eq(lockedWith({ status: null }), false, 'no status is never locked')

// 3. started / graded show the real label for everyone
eq(lockedWith({ started: true }), false, 'a started game shows the real label')
eq(lockedWith({ graded: true }), false, 'a graded pick shows the real label')
const mixed = [mk(31, 'called', EARLIER), mk(32, 'called'), mk(33, 'called'), mk(34, 'called'), mk(35, 'called'), mk(36, 'called')]
eq([...freeCalledKeys(mixed, opts)], ['test-32', 'test-33', 'test-34', 'test-35'], 'a started pick does not use up a free slot')

// 4. a past slate is never locked (no usable time: not started only on today's slate)
eq(startedAt(null, { now: NOW, slateIsToday: true }), false, 'no time, today: not started')
eq(startedAt(null, { now: NOW, slateIsToday: false }), true, 'no time, a past slate: started')
eq(startedAt('', { now: NOW, slateIsToday: false }), true, 'empty time, a past slate: started')
eq(startedAt('not a date', { now: NOW, slateIsToday: false }), true, 'unreadable time, a past slate: started')
eq(startedAt(Date.parse(LATER), { now: NOW }), false, 'ms time in the future: not started')
eq(startedAt(LATER, { now: NOW }), false, 'ISO time in the future: not started')
eq(startedAt(EARLIER, { now: NOW }), true, 'ISO time in the past: started')
const past = board.map((r) => ({ ...r, time: null }))
const pastFree = freeCalledKeys(past, { ...opts, startedOf: (r) => startedAt(r.time, { now: NOW, slateIsToday: false }) })
eq(pastFree.size, 0, 'a past slate has no tonight picks to ration')

// 5. ranking tie order is stable (ties and missing places keep the order given; the same four every time)
const ties = [mk(41, 'called', LATER, 1), mk(42, 'called', LATER, 1), mk(43, 'called', LATER, 1), mk(44, 'called', LATER, 1), mk(45, 'called', LATER, 1), mk(46, 'called', LATER, 1)]
eq([...freeCalledKeys(ties, opts)], ['test-41', 'test-42', 'test-43', 'test-44'], 'tied ranks keep the given order')
eq([...freeCalledKeys([...ties].reverse(), opts)], ['test-46', 'test-45', 'test-44', 'test-43'], 'the given order is the tiebreak, both ways')
const unranked = [{ id: 'test-51', status: 'called', time: LATER }, mk(52, 'called', LATER, 1), { id: 'test-53', status: 'called', time: LATER }, mk(54, 'called', LATER, 2), mk(55, 'called', LATER, 3), mk(56, 'called', LATER, 4)]
eq([...freeCalledKeys(unranked, opts)], ['test-52', 'test-54', 'test-55', 'test-56'], 'a row with no place sorts after the placed ones')
eq([...freeCalledKeys(board, opts)], [...freeCalledKeys(board, opts)], 'the same board gives the same four twice')
eq([...freeCalledKeys([...board].sort((a, b) => b.rank - a.rank), opts)], ['test-1', 'test-2', 'test-4', 'test-5'], 'the rank, not the list order, sets the free four')

// 6. who is a member (the account state the sync layer holds)
eq(memberStateOf(null), 'unknown', 'no account state yet')
eq(memberStateOf({ ready: false, signedIn: false, configured: true }), 'unknown', 'still loading')
eq(memberStateOf({ ready: true, signedIn: false, configured: false }), 'unknown', 'server without accounts: fail open')
eq(memberStateOf({ ready: true, signedIn: false, configured: true }), 'free', 'signed out is a non-member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: { member: true } }), 'member', 'member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: { member: false } }), 'free', 'signed in, not a member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: null }), 'unknown', 'signed in, no answer about membership: fail open')

if (fails.length) { console.error('check-member-gate FAILED:\n - ' + fails.join('\n - ')); process.exit(1) }
console.log('check-member-gate: ok')
