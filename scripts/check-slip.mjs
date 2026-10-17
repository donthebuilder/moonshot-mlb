#!/usr/bin/env node
// THE SLIP (2026-10-17). TEST DATA only: made-up names, prices and results, labelled TEST. No real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-slip.mjs
import { SLIP_KEYS, CALLED_CAP, readLegs, withLeg, withLegs, withoutLeg, toggledLeg, combined, calledLegs } from '../lib/slip/core.js'
import { landedTogether, LANDED_TOGETHER_START, MIN_NIGHTS } from '../lib/slip/landed.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const NOW = Date.parse('2026-10-20T18:00:00Z')

// STORE MIGRATION: the key shape PropCards always used, and a slip saved by the old PropCards (TEST legs)
eq('legacy keys are `${precisionKey}_slip_v1`', SLIP_KEYS, { mlb: 'moonshot_precision_v1_slip_v1', nfl: 'tuddy_precision_v1_slip_v1', nhl: 'lamp_precision_v1_slip_v1', nba: 'buckets_precision_v1_slip_v1' })
const legacy = JSON.stringify([
  { key: 'TEST1|TD', name: 'TEST Player One', market: 'ATD', price: 240, game: { key: 'AAA-BBB', label: 'AAA · BBB' }, at: NOW - 3600e3 },
  { key: 'TEST2|TD', name: 'TEST Player Two', market: 'ATD', price: 310, game: null, at: NOW - 25 * 3600e3 },   // over a day old: dropped, as before
])
const migrated = readLegs(legacy, NOW)
eq('a legacy slip reads back (old leg kept, stale leg dropped)', migrated.map((l) => [l.key, l.price]), [['TEST1|TD', 240]])
eq('garbage in storage is an empty slip, not a throw', [readLegs('{not json', NOW), readLegs(null, NOW), readLegs('{"a":1}', NOW)], [[], [], []])
eq('a price of 0 / blank is no price, never a number', readLegs(JSON.stringify([{ key: 'k', price: 0, at: NOW }, { key: 'j', price: '', at: NOW }]), NOW).map((l) => l.price), [null, null])
eq('a leg is added once', withLeg(withLeg([], { key: 'a|X', price: 100 }, NOW), { key: 'a|X', price: 100 }, NOW).length, 1)
eq('toggle adds then removes', [toggledLeg([], { key: 'a|X', price: 100 }, NOW).length, toggledLeg(toggledLeg([], { key: 'a|X', price: 100 }, NOW), { key: 'a|X' }, NOW).length], [1, 0])
eq('remove by key', withoutLeg(withLegs([], [{ key: 'a|X' }, { key: 'b|X' }], NOW), 'a|X').map((l) => l.key), ['b|X'])

// COMBINED PRICE: only when every leg has a real price
const two = [{ key: 'a', price: 100 }, { key: 'b', price: 200 }].map((l) => ({ ...l, at: NOW }))
eq('every leg priced -> a combined decimal (2.0 x 3.0)', combined(two), { allPriced: true, priced: 2, total: 2, decimal: 6 })
eq('one leg unpriced -> no combined price', combined([...two, { key: 'c', price: null, at: NOW }]), { allPriced: false, priced: 2, total: 3, decimal: null })
eq('an empty slip has no combined price', combined([]).allPriced, false)

// ADD TONIGHT'S CALLED PICKS: caps, the free example, hidden picks never reachable (TEST candidates, board order, a free four of the first four)
const cands = Array.from({ length: 9 }, (_, i) => ({ key: `T${i}`, free: i < 4, leg: { key: `T${i}|TD`, name: `TEST ${i}`, price: 200 + i } }))
const m = calledLegs(cands, 'member')
eq('member: the first six, in board order', [m.mode, m.legs.map((l) => l.key)], ['member', ['T0|TD', 'T1|TD', 'T2|TD', 'T3|TD', 'T4|TD', 'T5|TD']])
eq('member cap is 6', CALLED_CAP.member, 6)
const f = calledLegs(cands, 'free')
eq('free: an example of the free picks only, capped at 2', [f.mode, f.legs.map((l) => l.key)], ['example', ['T0|TD', 'T1|TD']])
eq('unknown membership behaves as a non-member', calledLegs(cands, 'unknown').legs.map((l) => l.key), ['T0|TD', 'T1|TD'])
eq('a non-member never gets a pick outside the free four, however many are asked', calledLegs(cands.map((c, i) => ({ ...c, free: i === 5 })), 'free').legs.map((l) => l.key), ['T5|TD'])
eq('the Join line counts all priced called picks, no names', f.total, 9)
eq('called legs are marked as such', m.legs.every((l) => l.source === 'called'), true)
eq('no priced called pick -> nothing added', calledLegs([], 'member').legs, [])

// LANDED TOGETHER (TEST nights). A night: score decides the order; each row carries its result.
const night = (date, results) => results.map((r, i) => ({ date, name: `TEST ${date} ${i}`, score: 90 - i, result: r }))
const NEVER_BEFORE = [...night('2026-10-12', ['hit', 'hit', 'hit']), ...night('2026-10-18', ['hit', 'hit'])]   // before the start date: must not count
eq('the start is one constant', LANDED_TOGETHER_START, '2026-10-19')
const before = landedTogether(NEVER_BEFORE, { today: '2026-10-18' })
eq('before the start: "Starts Monday, Oct 19" and no rate', before.rows.map((r) => r.message), Array(5).fill("Starts Monday, Oct 19: counting from tonight's locked picks"))
const afterEmpty = landedTogether(NEVER_BEFORE, { today: '2026-10-20' })
eq('nothing dated before the start counts, even after it', afterEmpty.rows.map((r) => r.nights), [0, 0, 0, 0, 0])
eq('after the start, under 5 nights: "k of 5 nights so far"', afterEmpty.rows[0].message, 'Counting since Oct 19: 0 of 5 nights so far')

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
const rows = []
days.slice(0, 5).forEach((d, i) => rows.push(...night(d, i < 2 ? ['hit', 'hit', 'hit', 'miss'] : ['hit', 'miss', 'hit', 'hit'])))
const four = landedTogether(rows, { today: '2026-10-24' })
eq('five nights: 2-leg all-hit 2 of 5, rate shown with n', [four.rows[0].message, four.rows[0].detail], ['2 of 5 nights', 'n = 5 nights'])
eq('3 legs: nights 3-5 miss on the 2nd pick', four.rows[1].message, '2 of 5 nights')
eq('4 legs: the 4th pick missed on nights 1-2, hit on 3-5 but the 2nd missed', four.rows[2].allHit, 0)
eq('a night with fewer than 5 calls does not count for N=5 or 6', [four.rows[3].nights, four.rows[4].nights, four.rows[3].message], [0, 0, 'Counting since Oct 19: 0 of 5 nights so far'])
eq('a night is graded only on a date before the feed\'s own today', landedTogether(rows, { today: '2026-10-23' }).rows[0].nights, 4)

// the locked list wins: a list changed after first pitch (locked:false) never counts
const withLate = [...rows, ...night('2026-10-19', ['hit', 'hit']).map((c) => ({ ...c, name: `LATE ${c.name}`, score: 99, locked: false, result: 'miss' }))]
eq('a late-changed list uses the locked list (late rows ignored)', landedTogether(withLate, { today: '2026-10-24' }).rows[0], four.rows[0])

// a postponed / voided leg: the night is NOT COUNTED for that N, and the page says how many
const voided = [...rows.filter((c) => c.date !== '2026-10-22'), ...night('2026-10-22', ['hit', 'void', 'hit', 'hit'])]
const v = landedTogether(voided, { today: '2026-10-24' })
eq('void in the top 2 -> not counted for N=2', [v.rows[0].nights, v.rows[0].notCounted], [4, 1])
eq('the page says how many nights were not counted', v.rows[0].detail, 'n = 4 nights; 1 night not counted (a game was voided or postponed)')
eq('under the minimum after a not-counted night: still "k of 5"', v.rows[0].message, 'Counting since Oct 19: 4 of 5 nights so far')
// a void OUTSIDE the top N does not matter to that N
const voidFar = [...rows.filter((c) => c.date !== '2026-10-22'), ...night('2026-10-22', ['hit', 'hit', 'hit', 'void'])]
eq('a void below the top N leaves N=2 counted', landedTogether(voidFar, { today: '2026-10-24' }).rows[0].notCounted, 0)
// order is the locked score, best first, not the order rows arrive in
const shuffled = [...rows].reverse()
eq('the night\'s order is its score, whatever the row order', landedTogether(shuffled, { today: '2026-10-24' }).rows.map((r) => r.allHit), four.rows.map((r) => r.allHit))
eq('calls with no score cannot be ordered, so that night is not used', landedTogether(rows.map((c) => ({ ...c, score: null })), { today: '2026-10-24' }).rows[0].nights, 0)
eq('MIN_NIGHTS is 5', MIN_NIGHTS, 5)
eq('no model probability is printed anywhere in the messages', JSON.stringify(four).includes('%'), false)

if (fail) { console.error(`\n${fail} FAILED`); process.exit(1) }
console.log('\nall ok')
