#!/usr/bin/env node
// LINEUP GATING + THE CUT + PASSING TDs + NHL/NFL/NBA PREGAME NEWS, on TEST data (2026-10-09). Made-up players ("Test ..."), clubs
// TST / EXA, a fake clock. Nothing is sent: these are pure producers.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-push-lineup-gating.mjs
import { pregameEventsFrom, mlbEventsFrom, nflEventsFrom, nhlPregameEventsFrom, nflPregameEventsFrom, nbaPregameEventsFrom, wants, audienceFrom, laneOf } from '../lib/dash/pushRules.js'

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

// ── 8. NHL / NFL / NBA: the goalie, the injury report, the delay (2026-10-09). TEST data only: clubs TST / EXA / NEW,
//      made-up men, fake ids, a fake clock. The producers are pure; the snapshots below are what lib/dash/pregameSources.js hands them.
const NHL_DAY = '2026-10-10'
const PUCK = Date.parse('2026-10-10T23:00:00Z')               // 7:00 PM ET
const T = PUCK - 3 * 3600 * 1000                              // 4:00 PM ET, three hours out
const fol = (entries) => ({ u: { dash_follow_v1: Object.fromEntries(entries.map(([sport, id, name, team]) => [`${sport}:${id}`, { id, name, team }])) } })
const nhlAud = audienceFrom(fol([['nhl', '9001', 'Test Netminder', 'TST'], ['nhl', '9002', 'Test Skater', 'EXA'], ['nhl', '9003', 'Test Elsewhere', 'NEW']]))
const nhlGame = (over = {}) => ({ id: 2026020001, gameType: 2, date: NHL_DAY, startUtc: new Date(PUCK).toISOString(), state: 'pre', rawState: 'FUT', scheduleState: 'OK', away: { abbrev: 'TST' }, home: { abbrev: 'EXA' }, ...over })
const side = (id, name, confirmed = true) => ({ id, name, confirmed, source: 'espn', status: confirmed ? 'confirmed' : 'expected' })
const nhlSnap = (over = {}) => ({ ok: true, asOf: T, games: [nhlGame()], starters: { 2026020001: { away: side(9001, 'Test Netminder'), home: side(9100, 'Test Homegoalie') } }, ...over })
const nhlRun = (snap, aud = nhlAud, now = T, prior = {}) => nhlPregameEventsFrom(snap, NHL_DAY, aud, now, prior)

let e8 = nhlRun(nhlSnap())
let st = e8.filter((e) => e.category === 'starter')
check(st.length === 1 && st[0].playerId === '9001' && st[0].title === '\u{1F9E4} Test Netminder starts' && st[0].body === 'Confirmed · TST at EXA · 7:00 PM ET', 'NHL: a followed goalie CONFIRMED -> "starts", name once, clubs and puck drop', st[0] && `${st[0].title} / ${st[0].body}`)
check(!e8.some((e) => e.playerId === '9100'), 'NHL: the other goalie is not followed: no event for him')
check(nhlRun(nhlSnap({ starters: { 2026020001: { away: side(9001, 'Test Netminder', false), home: null } } })).length === 0, 'NHL: a PROBABLE (unconfirmed) goalie makes no push')
check(nhlRun(nhlSnap({ starters: { 2026020001: { away: side(null, 'Test Netminder'), home: null } } })).length === 0, 'NHL: a confirmed name the league id could not be matched to makes no push (never guess a man)')
check(nhlRun(nhlSnap({ asOf: T - 11 * 60 * 1000 })).length === 0 && nhlRun(nhlSnap({ ok: false })).length === 0 && nhlRun(null).length === 0, 'NHL: a stale (11 min), unanswered or missing snapshot makes nothing')
check(nhlRun(nhlSnap({ games: [nhlGame({ state: 'live', rawState: 'LIVE' })] })).length === 0, 'NHL: a game already under way has no goalie news')
check(nhlRun(nhlSnap({ games: [nhlGame({ gameType: 1 })] })).length === 0, 'NHL: preseason makes nothing')
check(nhlRun(nhlSnap(), audienceFrom({})).length === 0, 'NHL: nobody follows anybody: nothing')
check(nhlRun(nhlSnap())[0].key === nhlRun(nhlSnap())[0].key && /^nhl:2026-10-10:2026020001:starter:away:9001$/.test(nhlRun(nhlSnap())[0].key), 'NHL: the same fact twice is the same key (one event = one push)')
// changed: Netminder was confirmed (and pushed); now a backup is confirmed in his place
const swap = nhlSnap({ starters: { 2026020001: { away: side(9004, 'Test Backup'), home: side(9100, 'Test Homegoalie') } } })
const nhlAud2 = audienceFrom(fol([['nhl', '9001', 'Test Netminder', 'TST'], ['nhl', '9004', 'Test Backup', 'TST']]))
e8 = nhlRun(swap, nhlAud2, T, { '2026020001:away': [{ id: '9001', name: 'Test Netminder' }] })
const out8 = e8.find((e) => e.category === 'scratched')
check(out8 && out8.playerId === '9001' && out8.title === '⚠️ Test Netminder is out' && out8.body === 'Not starting · TST at EXA · 7:00 PM ET', 'NHL: the goalie who was confirmed and replaced is a SCRATCH for his followers', out8 && `${out8.title} / ${out8.body}`)
const in8 = e8.find((e) => e.category === 'starter')
check(in8 && in8.playerId === '9004' && in8.body.startsWith('Goalie change · TST at EXA'), 'NHL: his replacement\'s followers get "Goalie change"', in8 && in8.body)
check(!/Backup/.test(out8.title + out8.body) && !/Netminder/.test(in8.title + in8.body), 'NHL: a change names each man once, never both in one message')
check(out8.key !== in8.key && out8.key.endsWith(':9001:out:9004'), 'NHL: the out and the starts events have their own keys')
// the game is off
const lateGame = nhlGame({ startUtc: new Date(T - 25 * 60 * 1000).toISOString() })
ev = by(nhlRun(nhlSnap({ games: [lateGame], starters: {} })), 'gameoff')[0]
check(ev && ev.title === '⚠️ Puck drop delayed' && ev.body === 'TST at EXA · 2 of your players' && ev.playerIds.length === 2, 'NHL: still "pre" 25 min after puck drop (the league\'s own state) -> a delay for a club with a followed man', ev && `${ev.title} / ${ev.body}`)
check(by(nhlRun(nhlSnap({ games: [nhlGame({ startUtc: new Date(T - 8 * 60 * 1000).toISOString() })], starters: {} })), 'gameoff').length === 0, 'NHL: 8 minutes late is not a delay (the league starts a few minutes late all the time)')
check(by(nhlRun(nhlSnap({ games: [nhlGame({ startUtc: new Date(T - 5 * 3600 * 1000).toISOString() })], starters: {} })), 'gameoff').length === 0, 'NHL: five hours past the start is not a delay (a stale state, not news)')
ev = by(nhlRun(nhlSnap({ games: [nhlGame({ scheduleState: 'PPD' })], starters: {} })), 'gameoff')[0]
check(ev && ev.title === '⚠️ Postponed' && ev.key.endsWith(':off:postponed'), 'NHL: the league\'s PPD is "Postponed"', ev && ev.title)
check(by(nhlRun(nhlSnap({ games: [nhlGame({ scheduleState: 'PPD', away: { abbrev: 'NEW' }, home: { abbrev: 'AAA' } })], starters: {} }), audienceFrom(fol([['nhl', '9001', 'Test Netminder', 'TST']]))), 'gameoff').length === 0, 'NHL: a postponed game with none of your men in it makes nothing')
// wants(): the device's own follow list and switches
const nhlState = (events = {}) => ({ dash_follow_v1: { 'nhl:9001': { id: '9001', name: 'Test Netminder' } }, dash_alerts_v1: { events } })
const sEv = nhlRun(nhlSnap()).find((e) => e.category === 'starter')
check(wants(nhlState(), sEv) && !wants(nhlState({ starter: false }), sEv) && !wants({ dash_follow_v1: {}, dash_alerts_v1: {} }, sEv), 'NHL: starter reaches a device that follows him and has it on; not one that switched it off or follows nobody')
check(laneOf({ ...sEv }) === 'urgent', 'NHL: starter is never dropped by a lane window (once per man per game)')

// NFL: a followed player ruled Out, a delay, a moved kickoff
const KICK = Date.parse('2026-10-11T17:00:00Z')               // Sunday 1:00 PM ET
const NT = Date.parse('2026-10-10T20:00:00Z')                 // Saturday 4:00 PM ET, 21 hours out
const nflAud = audienceFrom(fol([['nfl', 'r', 'Test Receiver', 'TST'], ['nfl', 'q', 'Test Passer', 'EXA'], ['nfl', 'z', 'Test Elsewhere', 'NEW']]))
const ng = (over = {}) => ({ game_id: 'E1', away: 'TST', home: 'EXA', kickoff: new Date(KICK).toISOString(), plannedKickoff: new Date(KICK).toISOString(), state: 'pre', status_name: 'STATUS_SCHEDULED', detail: '', period: 0, away_score: 0, home_score: 0, ...over })
const nflSnapOf = (over = {}) => ({ ok: true, asOf: NT, games: [ng()], outs: [{ name: 'Test Receiver', team: 'TST', gameId: 'E1', reportedAt: new Date(NT - 3600 * 1000).toISOString() }], ...over })
const nflRun = (snap, aud = nflAud, now = NT) => nflPregameEventsFrom(snap, '2026-10-10', aud, now, null)
let nf = nflRun(nflSnapOf())
ev = by(nf, 'scratched')[0]
check(nf.length === 1 && ev && ev.playerName === 'Test Receiver' && ev.title === '\u{1F3C8} Test Receiver is out' && ev.body === 'Ruled out · TST at EXA · Sun 1:00 PM ET', 'NFL: a followed player Out on the injury report -> "is out", name once, clubs and kickoff with the day', ev && `${ev.title} / ${ev.body}`)
check(/^nfl:2026-10-11:/.test(ev.key) && ev.key.endsWith(':out:E1'), 'NFL: keyed on the game\'s own date and the game, one push per man per game', ev && ev.key)
check(nflRun(nflSnapOf({ outs: [{ name: 'Test Stranger', team: 'TST', gameId: 'E1', reportedAt: null }] })).length === 0, 'NFL: a man nobody follows is not pushed')
check(nflRun(nflSnapOf({ outs: [{ name: 'Test Receiver', team: 'TST', gameId: 'E1', reportedAt: new Date(NT - 6 * 24 * 3600 * 1000).toISOString() }] })).length === 0, 'NFL: an injury-report line six days old is not news')
check(nflRun(nflSnapOf({ games: [ng({ state: 'in', status_name: 'STATUS_IN_PROGRESS' })] })).length === 0, 'NFL: once the game is on, "ruled out" is not pushed')
check(nflRun(nflSnapOf({ asOf: NT - 12 * 60 * 1000 })).length === 0 && nflRun(nflSnapOf({ ok: false })).length === 0 && nflRun(null).length === 0, 'NFL: a stale or missing snapshot makes nothing')
check(nflRun(nflSnapOf(), audienceFrom({})).length === 0, 'NFL: nobody follows anybody: nothing')
// questionable / doubtful never reach here (the source reducer keeps Out only); prove the reducer
const SRC = await import('../lib/dash/pregameSources.js')
const espnInj = { injuries: [{ team: { abbreviation: 'TST' }, injuries: [
  { status: 'Out', date: '2026-10-10T18:00Z', athlete: { displayName: 'Test Receiver' } },
  { status: 'Questionable', date: '2026-10-10T18:00Z', athlete: { displayName: 'Test Passer' } },
  { status: 'Doubtful', date: '2026-10-10T18:00Z', athlete: { displayName: 'Test Doubtful' } }] }] }
const outs = SRC.reduceNflOuts(espnInj, 'E1')
check(outs.length === 1 && outs[0].name === 'Test Receiver' && outs[0].team === 'TST' && outs[0].gameId === 'E1', 'NFL source: only "Out" lines are kept (Questionable and Doubtful are not "out")')
// delays and a moved kickoff
ev = by(nflRun(nflSnapOf({ games: [ng({ state: 'in', status_name: 'STATUS_RAIN_DELAY', detail: 'Rain Delay', period: 2, away_score: 17, home_score: 20 })], outs: [], asOf: KICK + 3600 * 1000 }), nflAud, KICK + 3600 * 1000), 'gameoff')[0]
check(ev && ev.title === '⚠️ Rain delay' && ev.body === 'Q2 · EXA 20, TST 17 · 2 of your players', 'NFL: ESPN\'s own delay flag, in game: the period and the score (leader first), the count of your players', ev && `${ev.title} / ${ev.body}`)
ev = by(nflRun(nflSnapOf({ games: [ng({ kickoff: new Date(KICK + 3 * 3600 * 1000).toISOString() })], outs: [] })), 'gameoff')[0]
check(ev && ev.title === '⚠️ Kickoff moved' && ev.body === 'TST at EXA · now Sun 4:00 PM ET', 'NFL: ESPN\'s kickoff differs from the published one by 3 hours -> "Kickoff moved", the new time', ev && `${ev.title} / ${ev.body}`)
check(by(nflRun(nflSnapOf({ games: [ng({ kickoff: new Date(KICK + 4 * 60 * 1000).toISOString() })], outs: [] })), 'gameoff').length === 0, 'NFL: a 4-minute difference is not a move')
check(by(nflRun(nflSnapOf({ games: [ng({ plannedKickoff: null, kickoff: new Date(KICK + 3 * 3600 * 1000).toISOString() })], outs: [] })), 'gameoff').length === 0, 'NFL: with no published kickoff to compare against, no "moved" is invented')
check(by(nflRun(nflSnapOf({ games: [ng({ away: 'AAA', home: 'BBB', status_name: 'STATUS_DELAYED' })], outs: [] })), 'gameoff').length === 0, 'NFL: a delay in a game with none of your players makes nothing')
check(by(nflRun(nflSnapOf({ games: [ng({ status_name: 'STATUS_POSTPONED', state: 'post' })], outs: [] })), 'gameoff')[0]?.title === '⚠️ Postponed', 'NFL: ESPN\'s postponed flag is "Postponed"')
const nflState = (events = {}) => ({ dash_follow_v1: { 'nfl:r': { id: 'r', name: 'Test Receiver' } }, dash_alerts_v1: { events } })
check(nflRun(nflSnapOf()).every((e) => wants(nflState(), e)) && !wants(nflState({ scratched: false }), nflRun(nflSnapOf())[0]), 'NFL: reaches a device that follows him; the Scratch switch turns it off')
const t1 = nflRun(nflSnapOf()); const t2 = nflRun(nflSnapOf())
check(t1[0].key === t2[0].key, 'NFL: the same fact twice is the same key')

// NBA (BUCKETS): nothing until BUCKETS is public; then Out, the five, a delay
const TIP = Date.parse('2026-10-10T23:30:00Z')
const BT = TIP - 40 * 60 * 1000
// BUCKETS is hidden here (NEXT_PUBLIC_BUCKETS_PUBLIC is off), so audienceFrom() keeps no NBA set: the second gate.
const hiddenAud = audienceFrom(fol([['nba', '4001', 'Test Guard', 'TST']]))
check(hiddenAud.nba === undefined, 'NBA: while BUCKETS is hidden the registry keeps no NBA audience at all')
const nbaAud = { nba: new Set(['4001', '4002']), nameOf: new Map([['4001', 'Test Guard'], ['4002', 'Test Center']]), teamOfId: new Map([['nba:4001', 'TST'], ['nba:4002', 'EXA']]) }
const nbaGame = (over = {}) => ({ id: '401000001', start: new Date(TIP).toISOString(), seasonType: 2, state: 'pre', statusName: 'STATUS_SCHEDULED', detail: '', away: { id: '1', abbrev: 'TST' }, home: { id: '2', abbrev: 'EXA' }, ...over })
const nbaSnapOf = (over = {}) => ({ ok: true, asOf: BT, games: [nbaGame()], outs: [], starters: {}, ...over })
const nbaRun = (snap, opts = { public: true }, aud = nbaAud) => nbaPregameEventsFrom(snap, '2026-10-10', aud, BT, opts)
const nbaFull = nbaSnapOf({ outs: [{ id: '4002', name: 'Test Center', team: 'EXA' }], starters: { 401000001: ['4001'] } })
check(nbaRun(nbaFull, {}).length === 0 && nbaRun(nbaFull, { public: false }).length === 0, 'NBA: BUCKETS not public -> no event at all, so no push deep link to a BUCKETS page')
check(nbaRun(nbaFull).length === 2, 'NBA: public -> a followed man in the five and a followed man Out')
check(nbaRun(nbaFull).every((e) => /^\/app#sport=nba/.test(e.url)), 'NBA: when public the links go to the BUCKETS player page')
let nb = nbaRun(nbaFull)
check(nb.find((e) => e.category === 'starter')?.title === '\u{1F3C0} Test Guard starts' && nb.find((e) => e.category === 'starter')?.body === 'Starting five · TST at EXA · 7:30 PM ET', 'NBA: a followed man in the posted five -> "starts"', nb.find((e) => e.category === 'starter')?.body)
check(nb.find((e) => e.category === 'scratched')?.title === '\u{1F3C0} Test Center is out' && nb.find((e) => e.category === 'scratched')?.body === 'Ruled out · TST at EXA · 7:30 PM ET', 'NBA: a followed man on the Out list -> "is out"', nb.find((e) => e.category === 'scratched')?.body)
check(nbaRun(nbaSnapOf({ outs: [{ id: '4002', name: 'Test Center', team: 'EXA' }], starters: {}, asOf: BT - 11 * 60 * 1000 })).length === 0, 'NBA: a stale snapshot makes nothing')
check(nbaRun(nbaSnapOf({ outs: [{ id: '4002', name: 'Test Center', team: 'NEW' }] })).length === 0, 'NBA: an Out line for a man on another club than his follow does not match (never a wrong man)')
check(nbaRun(nbaSnapOf({ games: [nbaGame({ seasonType: 1 })], outs: [{ id: '4002', name: 'Test Center', team: 'EXA' }] })).length === 0, 'NBA: preseason makes nothing')
ev = by(nbaRun(nbaSnapOf({ games: [nbaGame({ statusName: 'STATUS_DELAYED', detail: 'Delayed' })] })), 'gameoff')[0]
check(ev && ev.title === '⚠️ Delay' && ev.body === 'TST at EXA · 2 of your players', 'NBA: ESPN\'s delay flag -> a delay for a game with your players', ev && `${ev.title} / ${ev.body}`)
check(by(nbaRun(nbaSnapOf({ games: [nbaGame({ state: 'postponed', statusName: 'STATUS_POSTPONED' })] })), 'gameoff')[0]?.title === '⚠️ Postponed', 'NBA: postponed')
// the SOURCES, with the network replaced (lib/dash/pregameSources.js): a failed fetch is null, never an empty slate
const rawNhl = { games: [
  { id: 1, gameType: 2, gameDate: NHL_DAY, startTimeUTC: new Date(PUCK).toISOString(), gameState: 'FUT', gameScheduleState: 'OK', awayTeam: { abbrev: 'TST' }, homeTeam: { abbrev: 'EXA' } },
  { id: 2, gameType: 2, gameDate: NHL_DAY, startTimeUTC: new Date(PUCK).toISOString(), gameState: 'FUT', gameScheduleState: 'OK', awayTeam: { abbrev: 'AAA' }, homeTeam: { abbrev: 'BBB' } }] }
let asked = []
const nhlS = await SRC.nhlPregameSnap(NHL_DAY, nhlAud, { now: T, scoreImpl: async () => rawNhl, starterImpl: async (d, gs) => { asked = gs.map((g) => g.id); return { 1: { gameId: 1, away: side(9001, 'Test Netminder'), home: null } } } })
check(nhlS && nhlS.ok && nhlS.asOf === T && nhlS.games.length === 2 && JSON.stringify(asked) === '[1]', 'NHL source: ESPN is asked only about games with a followed club in them', JSON.stringify(asked))
check(await SRC.nhlPregameSnap(NHL_DAY, nhlAud, { now: T, scoreImpl: async () => { throw new Error('500') } }) === null, 'NHL source: the league failing is null, not an empty slate')
check((await SRC.nhlPregameSnap(NHL_DAY, nhlAud, { now: T, scoreImpl: async () => rawNhl, starterImpl: async () => { throw new Error('espn 403') } })).ok === true, 'NHL source: ESPN failing costs the goalie news only (the delay check still has the league\'s state)')
const nflLive = { at: NT, games: [ng({ game_id: 'E1' }), ng({ game_id: 'E2', away: 'AAA', home: 'BBB' }), ng({ game_id: 'E3', kickoff: new Date(NT + 40 * 3600 * 1000).toISOString() })] }
let fetched = []
const nflS = await SRC.nflPregameSnap(nflAud, { now: NT, liveImpl: async () => nflLive, planImpl: async () => new Map([['TST@EXA', new Date(KICK + 3 * 3600 * 1000).toISOString()]]), getJSON: async (u) => { fetched.push(u.split('=').pop()); return espnInj } })
check(nflS && nflS.ok && nflS.asOf === NT && nflS.games.find((g) => g.game_id === 'E1').plannedKickoff === new Date(KICK + 3 * 3600 * 1000).toISOString(), 'NFL source: each game carries the published kickoff beside ESPN\'s')
check(JSON.stringify(fetched) === '["E1"]' && nflS.outs.length === 1, 'NFL source: the injury report is read only for games within 30 hours with a followed club in them', JSON.stringify(fetched))
const nflS2 = await SRC.nflPregameSnap(nflAud, { now: NT + 11 * 60 * 1000, liveImpl: async () => nflLive, planImpl: async () => new Map(), getJSON: async () => { throw new Error('503') } })
check(nflS2 && nflS2.ok && nflS2.outs.length === 0, 'NFL source: a failed injury read is no outs, not a made-up one')
check(await SRC.nflPregameSnap(nflAud, { now: NT, liveImpl: async () => null }) === null, 'NFL source: no scoreboard is null')
check(await SRC.nbaPregameSnap('2026-10-10', nbaAud, { isPublic: () => false, boardImpl: async () => { throw new Error('must not be called') } }) === null, 'NBA source: asked about nothing while BUCKETS is hidden')
const nbaS = await SRC.nbaPregameSnap('2026-10-10', nbaAud, { now: BT, isPublic: () => true,
  boardImpl: async () => ({ events: [{ id: '401000001', date: new Date(TIP).toISOString(), season: { year: 2027, type: 2 }, status: { type: { name: 'STATUS_SCHEDULED' } }, competitions: [{ competitors: [{ homeAway: 'away', team: { id: '1', abbreviation: 'TST' } }, { homeAway: 'home', team: { id: '2', abbreviation: 'EXA' } }] }] }] }),
  injuriesImpl: async () => ({ injuries: [{ id: '2', injuries: [{ status: 'Out', athlete: { id: '4002', displayName: 'Test Center' } }, { status: 'Day-To-Day', athlete: { id: '4003', displayName: 'Test Maybe' } }] }] }),
  startersImpl: async (g, t) => new Set(t === '1' ? ['4001'] : []) })
check(nbaS && nbaS.ok && nbaS.games.length === 1 && nbaS.games[0].statusName === 'STATUS_SCHEDULED' && JSON.stringify(nbaS.starters) === '{"401000001":["4001"]}', 'NBA source: the five comes from the posted roster, the status name rides the game', JSON.stringify(nbaS && nbaS.starters))
check(nbaS.outs.length === 1 && nbaS.outs[0].id === '4002' && nbaS.outs[0].team === 'BOS', 'NBA source: only Out is kept (Day-To-Day is not out); the club is the league\'s own code for ESPN team id 2')

// every new event's words obey the limits
const allNew = [...nhlRun(nhlSnap()), ...e8, ...nflRun(nflSnapOf()), ...nb, ...by(nhlRun(nhlSnap({ games: [lateGame], starters: {} })), 'gameoff')]
check(allNew.length >= 6 && allNew.every((e) => [...e.title].length <= 26 && [...e.body].length <= 48 && !e.body.includes('\n') && !/DASH|https?:|probab|chance|odds/i.test(`${e.title} ${e.body}`)), 'all the new messages: title <= 26, body <= 48, one line, no DASH, no link, no probability word', allNew.map((e) => `${[...e.title].length}/${[...e.body].length}`).join(' '))
check(allNew.every((e) => !/Delta|Charlie/.test(`${e.title} ${e.body}`)), 'all the new messages name nobody who is not the subject')

// the category plan: starter is kept, the others were already
const CP = await import('../lib/copy/notifications.js')
check(CP.categoryAllowed('starter') && CP.categoryAllowed('scratched') && CP.categoryAllowed('gameoff'), 'starter / scratched / gameoff are inside the kept categories (no PUSH_CUT_CATEGORIES needed)')
const AL = await import('../lib/dash/alerts.js').catch(() => null)
if (AL) check(AL.PUSHABLE.includes('starter'), 'the settings panel offers the Starter switch')
// the claim-table memory the route reads back
check(JSON.stringify(SRC.priorStartersFrom(['nhl:2026-10-10:2026020001:starter:away:9001', 'nhl:2026-10-10:2026020001:starter:away:9001:out:9004', 'mlb:x'], new Map([['9001', 'Test Netminder']]))) === JSON.stringify({ '2026020001:away': [{ id: '9001', name: 'Test Netminder' }] }), 'the route\'s memory of who was confirmed reads only the confirmed key, not the "out" key')

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1) }
console.log('\nall green')
