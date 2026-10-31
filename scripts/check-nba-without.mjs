#!/usr/bin/env node
// BUCKETS WITHOUT (lib/nba/without.js) -- offline checks. Every row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-without.mjs
import { matesFrom, withoutLines, withoutScan } from '../lib/nba/without.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST club TST, season 2027, games g1..g6. HIM = 1. STAR = 2 hurt after g2 for the season. TRADED = 3 plays g1..g2, then
// for OTH from a later date. LATE = 4 joins at g4. Nobody else.
const day = (i) => `2026-11-0${i}`
const box = (g, p, name, pts = 10) => ({ game_id: `g${g}`, game_date: day(g), season: 2027, team: 'TST', player_id: p, name, pts })
const rows = [
  ...[1, 2, 3, 4, 5, 6].map((g) => box(g, 1, 'HIM')),
  box(1, 2, 'STAR', 30), box(2, 2, 'STAR', 30),
  box(1, 3, 'TRADED', 8), box(2, 3, 'TRADED', 8),
  box(4, 4, 'LATE', 5), box(5, 4, 'LATE', 5), box(6, 4, 'LATE', 5),
]
const other = [{ player_id: 3, season: 2027, team: 'OTH', game_date: day(5) }]
const mates = matesFrom(rows, other, 1)
const by = Object.fromEntries(mates.map((m) => [m.name, m]))
check(!by.HIM, 'he is not his own teammate')
check(mates[0].name === 'STAR' && by.STAR.ppg === 30, 'most points a game first')
check(by.STAR.out.length === 4, 'season-ending injury: out through the club\'s last game (g3..g6)')
check(by.TRADED.out.length === 0, 'traded: the window ends at his last game here, the gap is not counted')
check(by.LATE.out.length === 0 && by.LATE.on.length === 3, 'a man who joined late is not out before his first game')

// TEST his game rows (buildGames shape): 20 points with STAR, 26 without
const g = (i, pts) => ({ id: `g${i}`, s: 2027, date: day(i), min: 30, pts, reb: 5, ast: 4, stl: 1, blk: 0, to: 2, fgm: 7, fga: 15, tpm: 2, tpa: 6, ftm: 4, fta: 5 })
const games = [g(1, 20), g(2, 20), g(3, 26), g(4, 26), g(5, 26), g(6, 26)]
const l = withoutLines(games, [by.STAR])
check(l.with.gp === 2 && l.with.pts === 20 && l.without.gp === 4 && l.without.pts === 26, 'with / without STAR')
const two = withoutLines(games, [by.STAR, by.LATE])
check(two.without.gp === 0 && two.with.gp === 0, 'two men: only games BOTH missed / BOTH played (none here)')
const scan = withoutScan(games, mates)
check(scan.length === 1 && scan[0].m.name === 'STAR', 'scan lists only men he has games both with and without')

// LAMP runs the same functions over lamp_box rows (TEST data): the value averaged is his own pick (points), and an aggregate of the caller's own
const lrows = [1, 2, 3, 4].map((g) => ({ game_id: `g${g}`, game_date: day(g), season: 2027, team: 'TST', player_id: 1, name: 'HIM', points: 1 }))
  .concat([1, 2].map((g) => ({ game_id: `g${g}`, game_date: day(g), season: 2027, team: 'TST', player_id: 2, name: 'STAR', points: 2 })))
const lm = matesFrom(lrows, [], 1, { val: (r) => r.points })
check(lm[0].ppg === 2 && lm[0].team === 'TST' && lm[0].out.length === 2, 'LAMP: val picks the averaged column; the teammate carries his club')
const agg = (gs) => ({ gp: gs.length, sum: gs.reduce((a, x) => a + x.p, 0) })
const lg = [1, 2, 3, 4].map((i) => ({ id: `g${i}`, p: i }))
const ll = withoutLines(lg, [lm[0]], agg)
check(ll.with.gp === 2 && ll.without.sum === 7 && withoutScan(lg, lm, { agg }).length === 1, 'LAMP: the caller\'s own aggregate builds the with / without lines')

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall without checks ok')
