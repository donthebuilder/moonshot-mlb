#!/usr/bin/env node
// 0c calling rule (2026-10-01). TEST DATA only -- made-up rows, no real players.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-call-status.mjs
import { callStatus, boardCut, CALL_ROLES, FOUR_ROLES, HR_CALL_ROLES, hasRoleIn, surfacedByRole } from '../lib/callStatus.js'
import { onBotFor, onBotWord } from '../lib/nfl/tdFeed.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// MLB
eq('cut of 282 is 94', boardCut(282), 94)
eq('a called role is CALLED wherever he ranks', callStatus({ role: 'HIT', board_rank: 250, stats: { board_of: 282 } }), 'called')
eq('no role, #94 of 282 -> ON THE BOARD', callStatus({ role: null, on_board: true, board_rank: 94, stats: { board_of: 282 } }), 'board')
eq('no role, #95 of 282 -> NOT ON THE BOARD', callStatus({ role: null, on_board: true, board_rank: 95, stats: { board_of: 282 } }), 'off')
eq('WATCH stays ON THE BOARD (a band)', callStatus({ role: 'WATCH', board_rank: 200, stats: { board_of: 282 } }), 'board')
eq('no board size stored -> old rule (rated = board)', callStatus({ role: null, on_board: true, board_rank: 200 }), 'board')
eq('never surfaced -> off', callStatus({ role: null, on_board: false }), 'off')

// THE ROLE SETS, NAMED ONCE (2026-10-10): subsets of CALL_ROLES; none changes which rows read CALLED
eq('FOUR_ROLES = the call roles without TOP', FOUR_ROLES, ['HR', 'HIT', 'HRR', 'CONTACT'])
eq('HR_CALL_ROLES and FOUR_ROLES are call roles', HR_CALL_ROLES.every((r) => CALL_ROLES.includes(r)) && FOUR_ROLES.every((r) => CALL_ROLES.includes(r)), true)
eq('hasRoleIn reads a slash list the way the old TOP|HR regex did', ['TOP', 'HR/CONTACT', 'HIT/HRR', 'WATCH', 'HRR', '', null, 'TOP15'].map((r) => hasRoleIn(r, HR_CALL_ROLES)), [true, true, false, false, false, false, false, false])
// surfacedByRole replaces Boolean(String(row.role).trim()) in the tick: any role at all; a rank or on_board alone is not a role
eq('surfacedByRole = has a role', [{ role: 'HR' }, { role: 'WATCH' }, { role: ' ' }, { role: null }, { role: '', board_rank: 3, on_board: true }, {}].map(surfacedByRole), [true, true, false, false, false, false])
eq('CALLED is still decided by callStatus alone (the tweet line "had him for N of his last M" counts these)', ['HR', 'HIT/CONTACT', 'WATCH', 'TOP15', null].map((r) => callStatus({ role: r }) === 'called'), [true, true, false, false, false])

// NFL (test card + test game calls)
const card = { TD: { rungs: [{ player_id: 'T1', rank: 1, score: 80, grade: 'A+' }] }, REC_YDS: { label: 'Receiving yards', rungs: [{ player_id: 'T2', rank: 3, score: 70, grade: 'A' }] } }
const gc = { games: [{ game_id: 'G1', locked: true, calls: [{ role: 'TOP', player_id: 'T3', slate_rank: 4, of: 300, score: 72 }] }, { game_id: 'G2', locked: false, calls: [{ role: 'TD', player_id: 'T4', slate_rank: 9, of: 300, score: 66 }] }] }
eq('TD ladder first', onBotFor(card, 'T1', { gameCalls: gc, gameId: 'G1' })?.market, 'TD')
eq('another market counts', onBotWord(onBotFor(card, 'T2')), '#3 Receiving yards pick')
eq('his game\'s locked game call counts', onBotWord(onBotFor(card, 'T3', { gameCalls: gc, gameId: 'G1' })), 'TOP game call')
eq('a game call in a DIFFERENT game does not', onBotFor(card, 'T3', { gameCalls: gc, gameId: 'G2' }), null)
eq('an unlocked game call does not', onBotFor(card, 'T4', { gameCalls: gc, gameId: 'G2' }), null)
eq('nobody', onBotFor(card, 'X'), null)
console.log(fail ? `\n${fail} FAILED` : '\nall green')
process.exit(fail ? 1 : 0)
