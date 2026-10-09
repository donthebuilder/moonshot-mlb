#!/usr/bin/env node
// LINEUP GATING + THE CUT + PASSING TDs, on TEST data (2026-10-09). Made-up players ("Test ..."), clubs
// TST / EXA, a fake clock. Nothing is sent: these are pure producers.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-push-lineup-gating.mjs
import { pregameEventsFrom, mlbEventsFrom, nflEventsFrom, wants, audienceFrom, laneOf } from '../lib/dash/pushRules.js'

let failed = 0
const check = (c, l, x = '') => { if (c) console.log(`ok   ${l}`); else { failed += 1; console.log(`FAIL ${l} ${x}`) } }

const DAY = '2026-10-09'
const NOW = Date.parse('2026-10-09T22:35:00Z')            // 6:35pm ET
const at = (min) => new Date(NOW + min * 60000).toISOString()
const row = (id, name, pk, min) => ({ player_id: String(id), name, game_pk: pk, game_time: at(min), team: 'TST', opponent: 'EXA', hr_score: 70 - id })
const card = (ids) => ids.map((id, i) => ({ id: String(id), name: `Test Hitter ${id}`, slot: i + 1 }))
const rows = [row(1, 'Test Alpha', 100, 25), row(2, 'Test Bravo', 100, 25), row(3, 'Test Charlie', 100, 25), row(4, 'Test Delta', 200, 90)]
const audience = { mlb: new Set(['1', '2', '3', '4']) }
const game = (pk, over = {}) => ({ pk, state: 'Preview', lineupPosted: false, lineup: { home: [], away: [] }, homeId: 147, awayId: 139, ...over })
const run = (games, rs = rows, now = NOW) => pregameEventsFrom(rs, { games }, DAY, audience, now)
const by = (evs, cat) => evs.filter((e) => e.category === cat)
const text = (e) => `${e.title} ${e.body}`

// 1. no lineup posted -> board, first pitch and scratch say nothing
let ev = run([game(100), game(200)])
check(by(ev, 'boardup').length === 0 && by(ev, 'lastcall').length === 0 && by(ev, 'scratched').length === 0, 'no lineup posted: no board set, no first pitch, no scratch')

// 2. a lineup is posted with two of three picks in it
const g100 = game(100, { lineupPosted: true, lineup: { home: card([1, 2, 10, 11, 12, 13, 14, 15, 16]), away: card([20, 21, 22, 23, 24, 25, 26, 27, 28]) } })
ev = run([g100, game(200)])
const board = by(ev, 'boardup')[0]
check(board && /^2 picks · first pitch /.test(board.body), 'the board counts only picks IN the lineup (2, not 3)', board && board.body)
check(board && !board.playerIds.includes('3') && !board.playerIds.includes('4'), 'the man left out of the card and the man whose card is not up are not in the board event')
const sc = by(ev, 'scratched')
check(sc.length === 1 && sc[0].playerId === '3' && /Test Charlie is out/.test(sc[0].title), 'the man left out of a posted card is a scratch, named once, in the title')
check(!text(board).includes('Charlie') && !text(board).includes('Delta'), 'the board message names nobody who is not playing')
const lc = by(ev, 'lastcall')
check(lc.length === 1 && lc[0].title === '⏰ First pitch in 25 min' && /^2 of your picks are in the lineup/.test(lc[0].body), 'first pitch soon: 25 min, 2 picks in the lineup', lc[0] && `${lc[0].title} / ${lc[0].body}`)
check(by(ev, 'lastcall').every((e) => !e.playerIds.includes('3')), 'first pitch soon never counts the scratched man')

// 3. first pitch soon is one per start time, not one a day
const g200 = game(200, { lineupPosted: true, lineup: { home: card([4, 30, 31, 32, 33, 34, 35, 36, 37]), away: card([40, 41, 42, 43, 44, 45, 46, 47, 48]) } })
ev = run([g100, g200], rows, NOW + 65 * 60000)             // an hour later: game 200 (90 min out at NOW) is 25 min away
const late = by(ev, 'lastcall')
check(late.length === 1 && late[0].key.startsWith(`mlb:${DAY}:lastcall:`), 'a later game gets its own first-pitch event')
const both = run([g100, g200], rows.map((r) => (r.game_pk === 200 ? { ...r, game_time: at(25) } : r)))
const keys = by(both, 'lastcall').map((e) => e.key)
check(by(both, 'lastcall').length === 1 && by(both, 'lastcall')[0].body.startsWith('3 of your picks'), 'two games at the SAME start time make one event (3 picks)', JSON.stringify(by(both, 'lastcall').map((e) => e.body)))
const stag = run([g100, g200], rows.map((r) => (r.game_pk === 200 ? { ...r, game_time: at(28) } : r)))
check(by(stag, 'lastcall').length === 2 && new Set(by(stag, 'lastcall').map((e) => e.key)).size === 2, 'two different start times make two events with two keys')

// 4. delays
const delayed = (over) => game(100, { delayed: true, detail: 'Delayed: RAIN', ...over })
ev = by(run([delayed()]), 'gameoff')[0]
check(ev && ev.title === '⚠️ Rain delay' && ev.body === 'TB at NYY · lineups not posted', 'delay before a lineup: "Rain delay", says lineups are not posted, counts no one', ev && `${ev.title} / ${ev.body}`)
check(ev && !/Alpha|Bravo|Charlie/.test(text(ev)), 'the delay names no hitter')
ev = by(run([delayed({ lineupPosted: true, lineup: g100.lineup })]), 'gameoff')[0]
check(ev && ev.body === 'TB at NYY · 2 of your picks', 'delay after the lineup: counts only picks in it (2)', ev && ev.body)
const allOut = delayed({ lineupPosted: true, lineup: { home: card([50, 51, 52, 53, 54, 55, 56, 57, 58]), away: card([60, 61, 62, 63, 64, 65, 66, 67, 68]) } })
check(by(run([allOut]), 'gameoff').length === 0, 'delay after the lineup with none of your picks in it: no event')
ev = by(run([game(100, { postponed: true, detail: 'Postponed (rain)' })]), 'gameoff')[0]
check(ev && ev.title === '⚠️ Postponed (rain)' && ev.body === 'TB at NYY · 3 of your picks', 'postponed: counts the board\'s picks (no lineup will come)', ev && `${ev.title} / ${ev.body}`)

// 5. in-game: a CALLED homer says so (status from lib/callStatus.js), others do not
const live = {
  games: [{ pk: 100, state: 'Live', gameDate: DAY, homeId: 147, awayId: 139, homeScore: 3, awayScore: 2, inning: 7, half: 'Bottom', outs: 1, lineup: g100.lineup, lineupPosted: true }],
  lines: { 1: { pk: 100, name: 'Test Alpha', state: 'Live', hr: 1, h: 2, ab: 3, tb: 5, r: 1, rbi: 1, d2: 0, d3: 0, k: 0 } },
}
const boardInfo = { ids: new Set(['1', '2']), of: new Map([['1', { rank: 1, score: 70, role: 'TOP' }], ['2', { rank: 2, score: 60, role: '' }]]) }
let hr = mlbEventsFrom(live, DAY, audience, null, boardInfo).find((e) => e.category === 'homer')
check(hr && hr.title === '\u{1F4A5} Test Alpha goes deep' && hr.body === 'CALLED · HR · 2-for-3 · ▼7 · NYY 3, TB 2', 'a CALLED homer: name once in the title, status word first, stat, ▼7, score', hr && `${hr.title} / ${hr.body}`)
hr = mlbEventsFrom(live, DAY, audience, null, null).find((e) => e.category === 'homer')
check(hr && !/CALLED/.test(hr.body), 'no board in hand: no status word')
const wasLoaded = mlbEventsFrom({ ...live, games: [{ ...live.games[0], upBatter: 2, upBatterName: 'Test Bravo', on1: 'a', on2: 'b', on3: 'c' }] }, DAY, audience, null, boardInfo)
check(wasLoaded.some((e) => e.category === 'slam' && e.title.includes('bases loaded')) && !wasLoaded.some((e) => e.category === 'ondeck'), 'bases loaded + a pick up -> the slam alert; no on-deck event unless one is on deck')
check(!wasLoaded.some((e) => /ON DECK/i.test(e.title)), 'the title never says ON DECK')

// 6. the cut
const stateFor = (events = {}) => ({ dash_follow_v1: { 'mlb:1': { id: '1', name: 'Test Alpha' } }, dash_alerts_v1: { events } })
const mk = (category) => ({ category, sport: 'mlb', playerId: '1', priority: 2 })
check(wants(stateFor(), mk('homer')) && wants(stateFor(), mk('slam')) && wants(stateFor(), mk('hrr')), 'kept categories reach a phone by default')
check(!wants(stateFor({ ondeck: true }), mk('ondeck')) && !wants(stateFor({ lineup: true }), mk('lineup')), 'a CUT category reaches no phone even when switched on')
process.env.PUSH_CUT_CATEGORIES = 'on'
check(wants(stateFor({ ondeck: true }), mk('ondeck')), 'PUSH_CUT_CATEGORIES=on brings it back (the code is still there)')
delete process.env.PUSH_CUT_CATEGORIES
check(['boardup', 'lastcall', 'dropout', 'finalline', 'hrr', 'bigbases', 'multihit'].every((c) => laneOf({ category: c, priority: 3 }) === 'urgent'), 'the kept categories can never be dropped by a lane window')

// 7. football: a passing touchdown is counted and said as a throw; rushing/receiving still say "scores"
const aud = audienceFrom({ u: { dash_follow_v1: { 'nfl:q': { id: 'q', name: 'Test Passer' }, 'nfl:r': { id: 'r', name: 'Test Receiver' } } } })
const nflSnap = {
  games: [{ game_id: 'G1', state: 'in', period: 3, away: 'TST', home: 'EXA', away_score: 17, home_score: 20, kickoff: '2026-10-09T20:00:00Z' }],
  lines: new Map([
    ['q', { game_id: 'G1', name: 'Test Passer', team: 'TST', passing_tds: 2, passing_yards: 212, receiving_tds: 0, rushing_tds: 0 }],
    ['r', { game_id: 'G1', name: 'Test Receiver', team: 'TST', receptions: 6, receiving_yards: 112, receiving_tds: 1, rushing_tds: 0, passing_tds: 0 }],
  ]),
}
const nflEv = nflEventsFrom(nflSnap, DAY, aud, new Map([['test receiver', { name: 'Test Receiver', rank: 1, of: 100, status: 'called' }]]), null)
const td = nflEv.filter((e) => e.category === 'nfltd')
const thrown = td.find((e) => /throws a TD/.test(e.title))
const scored = td.find((e) => /scores/.test(e.title))
check(thrown && thrown.body.startsWith('TD pass 2 · Q3 · EXA 20, TST 17'), 'a followed QB\'s passing TDs make a "throws a TD" push (count 2)', thrown && thrown.body)
check(scored && scored.title === '\u{1F3C8} Test Receiver scores', 'a receiving TD still says "scores"', scored && scored.title)
check(td.length === 2 && new Set(td.map((e) => e.key)).size === 2, 'two touchdown events, two keys')

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1) }
console.log('\nall green')
