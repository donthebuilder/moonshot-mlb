// The team model for a game's expected HR (lib/teamHr.js). All data below is TEST DATA (invented
// clubs of round numbers), never a real club or a real night. Run:
//   node --import ./scripts/_esm-resolve.mjs scripts/check-team-hr.mjs
import { clubTable, sideExpHr, gameExpHr, slateExpHr, clubExpHr, byGame, spreadOf, zOf, TEAM_HR } from '../lib/teamHr.js'

let bad = 0
const ok = (c, m) => { if (!c) { bad++; console.error('FAIL', m) } }
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e

// TEST league: 30 clubs, each 100 HR in 1000 PA over 25 games (lgRate .1, 40 PA/G, 4 HR/G ... scaled test numbers)
const splits = []; const abbrs = {}
for (let i = 1; i <= 30; i++) { abbrs[i] = 'T' + i; splits.push({ team: { id: i }, stat: { homeRuns: 100, plateAppearances: 1000, gamesPlayed: 25 } }) }
const table = clubTable(splits, abbrs)
ok(table && near(table.lgRate, 0.1) && near(table.paG, 40) && near(table.lg9, 4), 'clubTable league numbers')
ok(clubTable(splits.slice(0, 5), abbrs) === null, 'a half-loaded response is not a league')
ok(clubTable([], {}) === null, 'empty response is null')

const row = (team, opp, extra = {}) => ({ game_pk: 1, team, opponent: opp, ...extra })
// 1. an average club, average arm, neutral park and air = the league rate x PA
const neutralArm = { pitcher_hr9: 4, pitcher_hr_allowed: 40 }   // 4 HR/9 over 90 IP = the TEST league's 4/9 per IP
const v0 = sideExpHr('T1', [row('T1', 'T2', neutralArm)], table)
ok(near(v0, 0.1 * 40, 1e-6), `league club, league arm, neutral = ${v0} (want 4)`)

// 2. a club with a tiny sample is the league average (shrink)
const tiny = clubTable([{ team: { id: 1 }, stat: { homeRuns: 5, plateAppearances: 10, gamesPlayed: 1 } }, ...splits.slice(1)], abbrs)
const vTiny = sideExpHr('T1', [row('T1', 'T2', neutralArm)], tiny)
ok(Math.abs(vTiny - 4) < 0.1, `a 10-PA club stays near the league average, got ${vTiny}`)

// 3. monotone: a hotter club, a leakier starter, a better park and better air each raise it
const hot = clubTable([{ team: { id: 1 }, stat: { homeRuns: 200, plateAppearances: 1000, gamesPlayed: 25 } }, ...splits.slice(1)], abbrs)
ok(sideExpHr('T1', [row('T1', 'T2', neutralArm)], hot) > v0, 'a hotter club projects more')
ok(sideExpHr('T1', [row('T1', 'T2', { pitcher_hr9: 8, pitcher_hr_allowed: 80 })], table) > v0, 'a leakier starter projects more')
ok(sideExpHr('T1', [row('T1', 'T2', { ...neutralArm, park_hr_factor: 1.2 })], table) > v0, 'a hitters park projects more')
ok(sideExpHr('T1', [row('T1', 'T2', { ...neutralArm, weather_hr_effect_pct: 8 })], table) > v0, 'good air projects more')
ok(near(sideExpHr('T1', [row('T1', 'T2', { ...neutralArm, weather_hr_effect_pct: 8, weather_has_data: false })], table), v0), 'weather ignored when the row says it has no data')

// 4. a starter with almost no innings is mostly the league (his rate is shrunk)
const fluke = sideExpHr('T1', [row('T1', 'T2', { pitcher_hr9: 27, pitcher_hr_allowed: 3 })], table)   // 3 HR in 1 IP
ok(fluke < 4 * 1.12, `a one-inning starter is shrunk toward the league, got ${fluke}`)

// 5. a game is both clubs; sides sum to the total; a missing side is still a club
const g = [row('T1', 'T2', neutralArm), row('T2', 'T1', neutralArm)]
const gm = gameExpHr(g, table)
ok(near(gm.total, gm.sides.T1 + gm.sides.T2) && Object.keys(gm.sides).length === 2, 'game total = both clubs')
ok(near(gm.total, 8, 1e-6), `two league clubs project 2 x 4, got ${gm.total}`)
const oneSided = gameExpHr([row('T1', 'T2', neutralArm)], table)
ok(Object.keys(oneSided.sides).length === 2, 'a game with one lineup posted still counts both clubs')

// 6. it does not depend on how many hitters are on the sheet
const crowd = gameExpHr([...g, ...g, ...g], table)
ok(near(crowd.total, gm.total, 1e-9), 'adding or dropping hitter rows does not move the number')

// 7. slate + club + doubleheader; byGame
const two = [row('T1', 'T2', neutralArm), row('T2', 'T1', neutralArm), { ...row('T3', 'T4', neutralArm), game_pk: 2 }, { ...row('T4', 'T3', neutralArm), game_pk: 2 }]
ok(near(slateExpHr(two, table), 16, 1e-6) && byGame(two).size === 2, 'slate = every game, both clubs')
ok(near(clubExpHr('T3', two, table), 4, 1e-6), 'a club in one game')
const dh = [...two, { ...row('T1', 'T2', neutralArm), game_pk: 3 }]
ok(near(clubExpHr('T1', dh, table), 8, 1e-6), 'a doubleheader club sums its two games')

// 8. the opposing pen: a leaky pen raises Adj, a stingy one lowers it, none = league average relief
const pens = new Map([['T2', { hr: 120, ip: '900.0' }]])      // 1.2 HR/9 against a 4/9 league: stingy
const stingy = gameExpHr(g, table, { pens }).sides.T1
ok(stingy < gm.sides.T1, 'a stingy pen lowers the figure')
const leaky = gameExpHr(g, table, { pens: new Map([['T2', { hr: 1200, ip: '900.0' }]]) }).sides.T1
ok(leaky > gm.sides.T1, 'a leaky pen raises the figure')
ok(near(gameExpHr(g, table, { pens: new Map() }).total, gm.total), 'no pen data = the plain figure')

// 9. no table: nothing printed
ok(gameExpHr(g, null) === null && slateExpHr(two, null) === null && sideExpHr('T1', g, null) === null, 'without the league table the answer is null, not a guess')

// 10. distribution helpers
const sp = spreadOf([2, 2.2, 2.4, 2.6, 2.8])
ok(near(sp.mean, 2.4) && sp.n === 5 && sp.sd > 0, 'spreadOf')
ok(zOf(2.8, sp) > 1 && zOf(2.0, sp) < -1 && zOf(2.4, sp) === 0, 'zOf')
ok(zOf(2.4, spreadOf([2.4, 2.4])) === null, 'a slate too small to have a spread has no z')

// 11. constants are the ones the held-out run chose
ok(TEAM_HR.SHRINK_PA === 4000 && TEAM_HR.STARTER_SHARE === 0.65 && TEAM_HR.PARK_POW === 0.5 && TEAM_HR.WX_POW === 1, 'constants unchanged (re-run scripts/backtest-team-hr.mjs before moving them)')

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1) }
console.log('team HR model: all checks passed')
