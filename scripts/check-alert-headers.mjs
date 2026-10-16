#!/usr/bin/env node
// ALERT HEADERS FROM THE CALL STATUS (X-BETTER step 1). Offline, TEST ROWS only.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-alert-headers.mjs
// Only a CALLED homer / touchdown opens "🤖 CALLED IT"; ON THE BOARD and NOT ON
// THE BOARD lead with the event itself and never say CALLED IT anywhere.
import { postText } from '../lib/dash/homerFeed.js'
import { tdPostText } from '../lib/nfl/tdFeed.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const first = (t) => t.split('\n')[0]

const hr = (o) => ({ name: 'Test Slugger', hr_n: 1, team: 'TST', opponent: 'OPP', ...o })
const called = postText(hr({ role: 'TOP', board_rank: 3, hr_score: 90 }))
const board = postText(hr({ role: '', on_board: true, board_rank: 260, stats: { season_hr: 12, season_iso: 0.2 } }))
const off = postText(hr({ role: '', on_board: false }))
console.log(`MLB called: ${first(called)} | board: ${first(board)} | off: ${first(off)}`)
check(first(called) === '🤖 CALLED IT', 'MLB CALLED opens 🤖 CALLED IT')
check(first(board) === '💥 TEST SLUGGER GOES DEEP.' && !board.includes('CALLED IT') && board.includes('#260 on the Moonshot board'), 'MLB ON THE BOARD: 💥 header, #N proof line, no CALLED IT')
check(first(off) === '💥 TEST SLUGGER GOES DEEP.' && !off.includes('CALLED IT') && off.includes('Not on the Moonshot board.'), 'MLB NOT ON THE BOARD: 💥 header, no CALLED IT')

// 2026-10-04 (Donovan: CALLED IT only when earned): a HIT pick's homer names its market
const hitCalled = postText(hr({ role: 'HIT', board_rank: 12, hr_score: 60 }))
check(first(hitCalled) === '🤖 CALLED IT · HIT PICK' && !hitCalled.includes('The call is in.'), 'MLB HIT-pick homer: header names the market, no "The call is in."')
check(called.includes('The call is in.'), 'MLB TOP-pick homer keeps "The call is in."')

const td = (o) => ({ scorerName: 'Test Runner', team: 'TST', opponent: 'OPP', day: '2026-09-27', ...o })
const tc = tdPostText(td({ onBot: { rank: 2, grade: 'A' } }))
const tb = tdPostText(td({ tdBoard: { rank: 14, of: 300 } }))
const to = tdPostText(td({}))
console.log(`NFL called: ${first(tc)} | board: ${first(tb)} | off: ${first(to)}`)
check(first(tc) === '🤖 CALLED IT', 'NFL CALLED opens 🤖 CALLED IT')
check(first(tb) === '🏈 TEST RUNNER FINDS THE END ZONE.' && !tb.includes('CALLED IT'), 'NFL ON THE BOARD: 🏈 header, no CALLED IT')
check(first(to) === '🏈 TEST RUNNER FINDS THE END ZONE.' && !to.includes('CALLED IT'), 'NFL NOT ON THE BOARD: 🏈 header, no CALLED IT')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
