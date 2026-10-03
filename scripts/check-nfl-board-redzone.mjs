#!/usr/bin/env node
// The room's red zone comes from the TUDDY board (2026-10-02). TEST DATA only -- made-up names.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-board-redzone.mjs
import { nflEventsFrom, followNameKey, wants } from '../lib/dash/pushRules.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(got)}`}`) }

const mk = (over = {}) => ({
  games: [{ game_id: 'G1', state: 'in', redZone: true, possession: 'AAA', period: 2, downDistance: '2nd & 6', clock: '4:12', home: 'AAA', away: 'BBB', ...over }],
  lines: new Map([
    ['t1', { game_id: 'G1', name: 'Test Wideout', team: 'AAA' }],
    ['t2', { game_id: 'G1', name: 'Test Tightend', team: 'AAA' }],
    ['t3', { game_id: 'G1', name: 'Other Runner', team: 'BBB' }],
    ['t4', { game_id: 'G1', name: 'Nobody Special', team: 'AAA' }],
  ]),
})
const board = new Map([
  [followNameKey('Test Wideout'), { name: 'Test Wideout', rank: 2, of: 120, status: 'called' }],
  [followNameKey('Test Tightend'), { name: 'Test Tightend', rank: 9, of: 120, status: 'board' }],
  [followNameKey('Other Runner'), { name: 'Other Runner', rank: 4, of: 120, status: 'board' }],
])
const red = (snap, aud, b) => nflEventsFrom(snap, '2026-10-04', aud, b).filter((e) => e.category === 'nflboardred')

// no one follows anybody: the room still hears it
const one = red(mk(), { nfl: new Set() }, board)
eq('one board red-zone event', one.length, 1)
eq('names the offence\'s board men by rank, best first', one[0]?.body.startsWith('AAA is inside the 20 · Wideout (#2 on the TD board, CALLED) · Tightend (#9 on the TD board)'), true)
eq('carries down, distance and clock', /2nd & 6 · 4:12$/.test(one[0]?.body || ''), true)
eq('defence\'s board man is not named', /Runner/.test(one[0]?.body || ''), false)
eq('room flags', [one[0]?.everyone, one[0]?.boardHit, one[0]?.priority], [true, true, 4])

// quiet cases
eq('no board -> no event', red(mk(), { nfl: new Set() }, null).length, 0)
eq('empty board -> no event', red(mk(), { nfl: new Set() }, new Map()).length, 0)
eq('not in the red zone -> no event', red(mk({ redZone: false }), { nfl: new Set() }, board).length, 0)
eq('game not live -> no event', red(mk({ state: 'pre' }), { nfl: new Set() }, board).length, 0)
eq('offence has no board man -> no event', red(mk({ possession: 'CCC' }), { nfl: new Set() }, board).length, 0)

// one per team per quarter (same key), new key next quarter
const k = (p) => red(mk({ period: p }), { nfl: new Set() }, board)[0]?.key
eq('same quarter, same key', k(2) === k(2), true)
eq('next quarter, new key', k(2) === k(3), false)

// phones never get it by default (a channel story, not a personal alert)
eq('phone default is off', wants({}, one[0]), false)

// the followed-only red zone is unchanged
const aud = { nfl: new Set([followNameKey('Nobody Special')]) }
const followed = nflEventsFrom(mk(), '2026-10-04', aud, board).filter((e) => e.category === 'nflred')
eq('followed man still gets his own red zone', followed.length, 1)
console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
