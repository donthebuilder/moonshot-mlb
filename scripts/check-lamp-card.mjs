#!/usr/bin/env node
// LAMP PLAYER CARD -- goal tracking maths (lib/nhl/goalLog.js). Every row below
// is TEST DATA, written by hand so the expected answers are known in advance;
// none of it is a real player's line.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-card.mjs
import { windowRate, thresholdRow, GOAL_MARKETS, runRead, ribbonOf, rollingSeries, per60, toiSecs, rinkRecord, coldCase, goalShape, daysBetween, SHAPE_MIN_GOALS } from '../lib/nhl/goalLog.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const eq = (a, b, what) => check(JSON.stringify(a) === JSON.stringify(b), `${what}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`)

// TEST rows, NEWEST FIRST. goals / shots / points / assists / ppp per game.
const mk = (date, opp, home, g, shots, a = 0, ppp = 0, toi = '18:00', team = 'TST') => ({ gameId: Number(date.replace(/-/g, '')), date, team, opp, home, g, a, pts: g + a, ppp, shots, toi })
const log = [
  mk('2026-03-20', 'AAA', true, 0, 3), mk('2026-03-18', 'BBB', false, 0, 2), mk('2026-03-16', 'CCC', true, 1, 4, 1, 1),
  mk('2026-03-14', 'AAA', false, 1, 5), mk('2026-03-12', 'DDD', true, 0, 1),
  // a 20-day gap between these two (a missed stretch -- no rows, not misses)
  mk('2026-02-20', 'EEE', false, 2, 6, 0, 1), mk('2026-02-18', 'AAA', true, 0, 3), mk('2026-02-16', 'FFF', false, 0, 2),
  mk('2026-02-14', 'GGG', true, 1, 3), mk('2026-02-12', 'HHH', false, 0, 0),
]
// goals newest->oldest: 0 0 1 1 0 2 0 0 1 0

// 1. THRESHOLD RATES
const g1 = GOAL_MARKETS.find((m) => m.key === 'g')
const l5 = windowRate(log, 'g', 1, 5)
eq([l5.ok, l5.n, l5.full, l5.thin], [2, 5, true, false], 'L5 1+ goal = 2 of 5')
const l10 = windowRate(log, 'g', 1, 10)
eq([l10.ok, l10.n], [4, 10], 'L10 1+ goal = 4 of 10')
const l20 = windowRate(log, 'g', 1, 20)
eq([l20.ok, l20.n, l20.full], [4, 10, false], 'L20 over a 10-game log = the 10 he has, full:false')
eq(windowRate(log.slice(0, 3), 'g', 1, 5).thin, true, 'a 3-game window is thin')
eq(windowRate([], 'g', 1, 5), null, 'empty log -> null, not 0%')
eq(windowRate(log, 'g', 2, Infinity).ok, 1, '2+ goals over the season = 1 game')
eq(windowRate(log, 'shots', 3, 10).ok, 6, '3+ shots over 10 = 6 games (3,4,5,6,3,3)')
eq(windowRate(log, 'a', 1, 10).ok, 1, '1+ assist = 1 game')
eq(windowRate(log, 'ppp', 1, 10).ok, 2, '1+ PP point = 2 games')
eq(thresholdRow(log, g1, 1).cells.map((c) => `${c.ok}/${c.n}`), ['2/5', '4/10', '4/10', '4/10'], 'matrix row cells L5 L10 L20 Season')

// 2. THE RUN (signed, from the newest game; a gap in dates is not a miss)
let r = runRead(log, 'g', 1)
eq([r.run, r.sinceLast, r.bestHit, r.bestMiss], [-2, 2, 2, 2], 'goals: drought of 2 (since last goal 2), best run 2, longest drought 2')
eq(r.lastRow.date, '2026-03-16', 'last goal was 03-16')
const hot = [mk('2026-03-20', 'A', true, 1, 2), mk('2026-03-18', 'B', true, 2, 3), mk('2026-03-16', 'C', true, 1, 4), mk('2026-03-14', 'D', true, 0, 1), mk('2026-03-12', 'E', true, 1, 1), mk('2026-03-10', 'F', true, 0, 1)]
r = runRead(hot, 'g', 1)
eq([r.run, r.bestHit, r.prevBestHit, r.atBest], [3, 3, 1, true], 'hot 3: longest, past a previous best of 1')
// the missed-game gap: dates 20 days apart do not break or extend the run
const gap = [mk('2026-03-20', 'A', true, 1, 2), mk('2026-02-28', 'B', true, 1, 3), mk('2026-02-26', 'C', true, 0, 1)]
eq(runRead(gap, 'g', 1).run, 2, 'a 20-day gap between two goal games: still a run of 2 games he played')
eq(daysBetween('2026-02-28', '2026-03-20'), 20, 'daysBetween reports the gap in days (20)')
const none = [mk('2026-03-20', 'A', true, 0, 2), mk('2026-03-18', 'B', true, 0, 3)]
r = runRead(none, 'g', 1)
eq([r.run, r.never, r.sinceLast], [-2, true, 2], 'no goal in the log: drought 2, never=true, sinceLast = games on file')
eq(runRead([], 'g', 1), null, 'empty -> null')
eq(runRead(log, 'shots', 3).run, 1, '3+ shots: newest game 3 shots clears, the next (2) does not -> run 1')
eq(ribbonOf(log, 'g', 1).current.len, 2, 'MOONSHOT streakRuns agrees: current run length 2')
eq(ribbonOf(log, 'g', 1).current.ok, false, 'and it is a miss run')

// 3. ROLLING FORM (win 3 over 5 TEST games, goals oldest->newest 1 0 2 0 3)
const five = [mk('5', 'A', true, 3, 1), mk('4', 'A', true, 0, 1), mk('3', 'A', true, 2, 1), mk('2', 'A', true, 0, 1), mk('1', 'A', true, 1, 1)]
const roll = rollingSeries(five, 'g', 3)
eq(roll.map((p) => p.v), [null, null, 1, 2 / 3, 5 / 3], 'rolling 3: first two games carry no line, then 3-game means')
eq(rollingSeries(five, 'g', 5).map((p) => p.v), [null, null, null, null, 6 / 5], 'window = whole log: one point')
eq(rollingSeries(five, 'g', 6).every((p) => p.v == null), true, 'window longer than the log: no line at all')
eq(rollingSeries([], 'g', 3), [], 'empty log -> empty series')

// 4. PER 60 (a game with no TOI is left out and counted)
const p60 = per60([mk('3', 'A', true, 1, 3, 0, 0, '20:00'), mk('2', 'A', true, 0, 2, 0, 0, '10:00'), { ...mk('1', 'A', true, 5, 9), toi: null }])
eq([p60.gp, p60.of, p60.minutes, p60.goals, p60.shots], [2, 3, 30, 1, 5], 'per60 uses only the games with a TOI')
check(Math.abs(p60.g60 - 2) < 1e-9 && Math.abs(p60.gps - 0.2) < 1e-9, 'G/60 = 1 goal in 30 min = 2.00; goals per shot = 0.200')
eq(p60.thin, true, '2 games is a thin per-60 sample')
eq(per60([]), null, 'no rows -> null')
eq(toiSecs('18:32'), 1112, 'toi 18:32 = 1112 s')
eq(toiSecs(null), null, 'null toi stays null')

// 5. THE RINK (tonight at AAA, he plays for TST)
let rk = rinkRecord(log, { host: 'AAA', team: 'TST' })
eq([rk.homeTonight, rk.games, rk.goals, rk.shots], [false, 1, 1, 5], 'road at AAA: only 03-14 was AT AAA (03-20 and 02-18 were at home vs AAA)')
const homeLog = [mk('3', 'X', true, 1, 2), mk('2', 'AAA', true, 0, 3, 0, 0, '18:00', 'TST'), mk('1', 'X', false, 4, 4)]
rk = rinkRecord(homeLog, { host: 'TST', team: 'TST' })
eq([rk.homeTonight, rk.games, rk.goals], [true, 2, 1], 'at his own home: his 2 home games')
eq(rinkRecord(log, { host: null, team: 'TST' }), null, 'no host (not playing tonight) -> null')
eq(rinkRecord(log, { host: 'ZZZ', team: 'TST' }).games, 0, 'a building he has not played in: 0 games, not a guess')

// 6. THE COLD CASE
eq(coldCase(log.slice(0, 7), {}), null, 'under 8 games: no case')
const cc = coldCase(log, { opp: 'AAA', home: false, today: '2026-04-05', oppRows: log.filter((x) => x.opp === 'AAA'), b2b: true, oppGaPg: 2.4, oppRank: 2, oppN: 12 })
eq(cc.items.find((i) => i.key === 'base').n, 10, 'base line stands on 10 games')
check(/6 of 10/.test(cc.items.find((i) => i.key === 'base').text), 'goalless in 6 of 10 games')
check(cc.items.some((i) => i.key === 'drought' && /2 games without a goal/.test(i.text)), 'drought line says 2 games')
check(cc.items.some((i) => i.key === 'opp' && /1 goal in 3 games against AAA/.test(i.text) && /thin/.test(i.text)), 'vs AAA: 1 goal in 3 games, flagged thin')
check(cc.items.some((i) => i.key === 'gap' && /16 days ago/.test(i.text)), 'time off: 16 days since 03-20 -> 04-05')
check(cc.items.some((i) => i.key === 'def' && /2\.40/.test(i.text)), 'tough defence line (top quarter)')
check(cc.items.some((i) => i.key === 'b2b'), 'back to back line')
check(!coldCase(log, { opp: 'AAA', home: false, today: '2026-03-21' }).items.some((i) => i.key === 'gap'), 'no time-off line for a 1-day gap')

// 7. GOAL SHAPE
const Z = [{ key: 'slot', label: 'Slot', def: 'd', test: ([x, y]) => x >= 69 && x <= 89 && Math.abs(y) <= 22 }, { key: 'point', label: 'Point', def: 'd', test: ([x]) => x < 54 }]
const gsh = goalShape({ goals: 3, distGoal: 14, types: { wrist: { att: 20, sog: 10, g: 2 }, slap: { att: 5, sog: 2, g: 1 }, snap: { att: 4, sog: 1, g: 0 } } },
  [[80, 3, 'goal', 'wrist', 'ev'], [75, -2, 'goal', 'wrist', 'pp'], [40, 0, 'goal', 'slap', 'ev'], [80, 3, 'sog', 'wrist', 'ev']], Z)
eq([gsh.n, gsh.thin, gsh.typed, gsh.byType.map((t) => `${t.key}:${t.goals}`)], [3, true, 3, ['wrist:2', 'slap:1']], '3 goals: thin (<4), mix wrist 2 / slap 1, snap (0 goals) left out')
eq([gsh.zoneN, gsh.zoneRows.map((z) => `${z.key}:${z.goals}`), gsh.strength.pp], [3, ['slot:2', 'point:1'], 1], 'zones read from goals only; the non-goal shot is ignored')
eq(goalShape({ goals: 0, types: {} }, [], Z), null, 'no goals -> null')
eq(SHAPE_MIN_GOALS, 4, 'MOONSHOT SHAPE_MIN_N rule: four')

check(coldCase(log, { today: '2026-03-21' }).items.find((i) => i.key === 'drought') != null, 'drought line present')
const one = [mk('2026-03-20', 'A', true, 1, 2), ...log.slice(1)]
check(coldCase(one, {}).items.some((i) => i.key === 'run' && /^A goal in his last game;/.test(i.text)), 'run of 1 reads "A goal in his last game" (no "1 games")')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
