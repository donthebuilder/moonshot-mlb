#!/usr/bin/env node
// LAMP PLAYER SPLITS -- offline checks of lib/nhl/splits.js.
// Every game row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-splits.mjs
import { buildGames, aggregate, splitRows, strengthRows, filterGames, restBefore, dowOf, monthOf, SPLIT_GROUPS, THIN_GP } from '../lib/nhl/splits.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const grp = (k) => SPLIT_GROUPS.find((g) => g.key === k)

// TEST club schedule (TST): played games on these days. Oct 13 is a game HE SAT OUT (not in his rows).
const sched = { TST: ['2026-10-10', '2026-10-11', '2026-10-13', '2026-10-14', '2026-10-17', '2026-10-20'].map((d, i) => ({ id: 100 + i, date: d, venue: i % 2 ? 'TEST Arena B' : 'TEST Arena A' })) }
// TEST log rows (reduceGameLog shape). 10-13 is missing: he sat it out.
const row = (gameId, date, home, opp, o = {}) => ({ gameId, date, team: 'TST', opp, home, g: 0, a: 0, pts: 0, plusMinus: 0, pim: 0, ppg: 0, ppp: 0, shg: 0, gwg: 0, shots: 0, toi: '18:00', ...o })
const reg = [
  row(100, '2026-10-10', true, 'AAA', { g: 2, a: 1, pts: 3, shots: 5, ppg: 1, plusMinus: 2, toi: '20:00' }),   // Sat
  row(101, '2026-10-11', false, 'BBB', { g: 0, a: 1, pts: 1, shots: 2, plusMinus: -1, toi: '16:00' }),       // Sun, back-to-back
  row(103, '2026-10-14', true, 'AAA', { g: 1, a: 0, pts: 1, shots: 3, shg: 1, toi: '18:00' }),               // Wed, club played 10-13 (he sat it) -> back-to-back
  row(104, '2026-10-17', false, 'CCC', { g: 1, a: 1, pts: 2, shots: 4, plusMinus: 1, toi: '19:00' }),        // Sat, 2 days rest
]
const post = [row(105, '2026-10-20', true, 'BBB', { g: 3, pts: 3, shots: 6, ppg: 2, plusMinus: 3, toi: '22:00' })] // Tue, playoffs, 2 days rest
const games = [...buildGames(reg, 2, sched), ...buildGames(post, 3, sched)]

// ── helpers
check(dowOf('2026-10-10') === 'Sat' && dowOf('2026-10-11') === 'Sun' && monthOf('2026-10-10') === 'Oct', 'day of week and month key on the game date')
check(restBefore(['2026-10-10', '2026-10-11'], '2026-10-11') === 0 && restBefore(['2026-10-10'], '2026-10-13') === 2 && restBefore(['2026-10-10'], '2026-10-10') == null, 'restBefore: yesterday = 0, same day is not "before", no earlier game = null')

// ── rest / back-to-back, and the missed game
const byId = Object.fromEntries(games.map((x) => [x.gameId, x]))
check(byId[100].rest == null && byId[101].rest === 0, 'rest: season opener has no earlier game; the next night is back-to-back (0)')
check(byId[103].rest === 0, 'MISSED GAME: he sat out 10-13, the club played it, so 10-14 is back-to-back (not 2 days since HIS last game)')
check(byId[104].rest === 2 && byId[105].rest === 2, 'rest: 10-14 -> 10-17 is 2 days off, 10-17 -> 10-20 is 2 days off')
const noSched = buildGames(reg, 2, {})
check(noSched.every((x) => x.rest === undefined) && splitRows(noSched, grp('rest')).length === 0, 'no schedule read: rest is left out, not guessed')
const restRows = splitRows(games, grp('rest'))
const R = Object.fromEntries(restRows.map((r) => [r.split, r]))
check(R['Back-to-back'].gp === 2 && R['2+ days rest'].gp === 2 && R['No earlier game'].gp === 1, `rest rows: B2B ${R['Back-to-back'].gp} GP, 2+ ${R['2+ days rest'].gp} GP, opener ${R['No earlier game'].gp} GP`)

// ── each grouping
const HA = Object.fromEntries(splitRows(games, grp('home_away')).map((r) => [r.split, r]))
check(HA.Home.gp === 3 && HA.Away.gp === 2 && HA.Home.g === 6 && HA.Away.g === 1, 'home/away: Home 3 GP 6 G, Away 2 GP 1 G')
const DW = Object.fromEntries(splitRows(games, grp('day_of_week')).map((r) => [r.split, r]))
check(DW.Sat.gp === 2 && DW.Sat.g === 3 && DW.Sun.gp === 1 && DW.Wed.gp === 1 && DW.Tue.gp === 1 && !DW.Mon, 'day of week: Sat 2 GP, Sun/Wed/Tue 1 each, empty days omitted')
check(splitRows(games, grp('day_of_week')).map((r) => r.split).join() === 'Tue,Wed,Sat,Sun', 'day of week rows in week order')
const MO = splitRows(games, grp('month'))
check(MO.length === 1 && MO[0].split === 'Oct' && MO[0].gp === 5, 'month: Oct 5 GP')
const GT = Object.fromEntries(splitRows(games, grp('game_type')).map((r) => [r.split, r]))
check(GT['Regular season'].gp === 4 && GT.Playoffs.gp === 1 && GT.Playoffs.g === 3, 'game type: regular 4 GP, playoffs 1 GP 3 G')
const OP = Object.fromEntries(splitRows(games, grp('opp')).map((r) => [r.split, r]))
check(OP.AAA.gp === 2 && OP.AAA.g === 3 && OP.BBB.gp === 2 && OP.CCC.gp === 1, 'opponent: AAA 2 GP 3 G, BBB 2 GP, CCC 1 GP')
const VE = Object.fromEntries(splitRows(games, grp('venue')).map((r) => [r.split, r]))
check(VE['TEST Arena A'].gp === 2 && VE['TEST Arena B'].gp === 3, 'rink: from the schedule venue by game id (A 2 GP, B 3 GP)')
const arena = (t) => ({ AAA: { name: 'TEST Home of AAA' }, TST: { name: 'TEST Home of TST' } }[t] || null)
const fb = buildGames([row(999, '2026-10-12', false, 'AAA')], 2, { TST: [] }, arena)[0]
check(fb.venue === 'TEST Home of AAA', 'rink fallback: an away game with no schedule row is the opponent’s arena')

// ── the table line: sums, rates, EV = G - PP - SH, THIN
const t = aggregate(games)
check(t.gp === 5 && t.g === 7 && t.a === 3 && t.pts === 10 && t.shots === 20 && t.ppg === 3 && t.shg === 1 && t.pm === 5, 'totals: 5 GP 7 G 3 A 10 PTS 20 S 3 PPG 1 SHG +5')
check(Math.abs(t.shPct - 7 / 20) < 1e-12 && Math.abs(t.gPg - 7 / 5) < 1e-12 && Math.abs(t.ptsPg - 2) < 1e-12, 'rates: S% 35%, G/GP 1.40, PTS/GP 2.00 from the sums')
check(Math.abs(t.toi - (1200 + 960 + 1080 + 1140 + 1320) / 5) < 1e-9, 'TOI/GP is the mean of the game TOIs (mm:ss parsed)')
const st = Object.fromEntries(strengthRows(games).map((r) => [r.split, r]))
check(st['Even strength'].g === 7 - 3 - 1 && st['Power play'].g === 3 && st['Short-handed'].g === 1 && st['Even strength'].g + st['Power play'].g + st['Short-handed'].g === t.g, 'EV = G - PP - SH (3 = 7 - 3 - 1) and the three sum to G')
check(Math.abs(st['Power play'].share - 3 / 7) < 1e-12 && st['Even strength'].gp === 5, 'strength share of goals, GP on every row')
check(aggregate([]).gp === 0 && aggregate([]).shPct === null && aggregate([]).gPg === null, 'empty split: no divide-by-zero, rates are null')
check(aggregate(games.slice(0, 1)).thin === true && t.thin === true, `THIN: ${THIN_GP - 1} GP is thin`)
const many = Array.from({ length: THIN_GP }, (_, i) => ({ ...games[0], gameId: 500 + i }))
check(aggregate(many).thin === false && aggregate(many.slice(1)).thin === true, `THIN threshold: ${THIN_GP} GP is not thin, ${THIN_GP - 1} is`)
check(splitRows(games, grp('home_away')).every((r) => typeof r.gp === 'number'), 'GP is on every row')

// ── the AND-combo
const f1 = filterGames(games, { ha: 'home', dow: 'Sat', rest: '0' })
check(f1.length === 0, 'combo home + Saturday + back-to-back: none (the Saturday home game was the opener)')
const f2 = filterGames(games, { ha: 'home', rest: '0' })
check(f2.length === 1 && f2[0].gameId === 103, 'combo home + back-to-back: the 10-14 game only (the missed-game rest)')
const f3 = filterGames(games, { dow: 'Sat', ha: 'away' })
check(f3.length === 1 && f3[0].gameId === 104 && aggregate(f3).g === 1, 'combo Saturday + away: 10-17 only')
const f4 = filterGames(games, { rest: '2+', type: '3' })
check(f4.length === 1 && f4[0].gameId === 105, 'combo 2+ days rest + playoffs: the playoff game')
check(filterGames(games, { opp: 'AAA', ha: 'home' }).length === 2 && filterGames(games, {}).length === 5, 'combo opponent + home; no filter = every game')
check(aggregate(filterGames(games, { ha: 'home', dow: 'Sat', rest: '0' })).gp === 0, 'combo with no games is an empty line (the page says so)')

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
