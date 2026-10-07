#!/usr/bin/env node
// BUCKETS player splits, season window and projected points -- offline checks.
// Every game row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nba-splits.mjs
import { buildGames, aggregate, splitRows, recentRows, filterGames, SPLIT_GROUPS, THIN_GP } from '../lib/nba/splits.js'
import { seasonOptions, defaultSeason, applySeason, seasonsIn, yearLabel } from '../lib/nba/seasonWindow.js'
import { projectPoints, xptsLine, seasonAverage, RECENT_N } from '../lib/nba/expectedPoints.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const grp = (k) => SPLIT_GROUPS.find((g) => g.key === k)

// TEST club schedule (TST, season 2027): final games by ET day. g3 is a game HE SAT OUT (not in his rows).
const club = { 2027: [['g1', '2026-10-22'], ['g2', '2026-10-23'], ['g3', '2026-10-24'], ['g4', '2026-10-25'], ['g5', '2026-10-28']].map(([id, date]) => ({ id, date })) }
// TEST log rows (reduceGamelog shape). A 7:30pm ET tip is the next UTC day, so the ISO day is AFTER the ET day.
const row = (id, etDay, atVs, opp, result, o = {}) => ({ id, s: 2027, seasonType: 2, date: `${etDay}T23:30:00Z`, atVs, opp, result, score: '100-90', min: 30, pts: 20, reb: 5, ast: 4, stl: 1, blk: 0, to: 2, fgm: 7, fga: 15, tpm: 2, tpa: 6, ftm: 4, fta: 5, ...o })
const rows = [
  row('g1', '2026-10-22', 'vs', 'AAA', 'W', { pts: 30, min: 36 }),
  row('g2', '2026-10-23', '@', 'BBB', 'L', { pts: 10, min: 18 }),
  row('g4', '2026-10-25', 'vs', 'AAA', 'W', { pts: 24, min: 32 }),
  row('g5', '2026-10-28', '@', 'CCC', 'W', { pts: 20, min: 30 }),
  row('gx', '2026-10-27', 'vs', 'DDD', 'W', { pts: 99, min: 0 }),            // 0 minutes: not a game he played
  row('gz', '2026-10-29', '@', 'EEE', 'L', { pts: 12, min: 25 }),            // not on TST's list: another club (traded) -> no rest value
]
const games = buildGames(rows, club)
const by = Object.fromEntries(games.map((x) => [x.id, x]))
check(games.length === 5 && !by.gx, '0-minute rows are not games he played')
check(by.g1.date === '2026-10-22' && by.g1.home === true && by.g2.home === false, 'ET day from the ISO tip time, home = "vs"')
check(by.g1.rest == null && by.g2.rest === 0, 'rest: season opener has no earlier game; next night is back-to-back (0)')
check(by.g4.rest === 0, 'MISSED GAME: he sat out g3, the club played it, so g4 is back-to-back (not 1 day since HIS last game)')
check(by.g5.rest === 2, 'rest: 10-25 -> 10-28 is 2 days off')
check(by.gz.rest === undefined, 'a game whose id is not on his club schedule has no rest value (not guessed)')
check(buildGames(rows, {}).every((g) => g.rest === undefined), 'no schedule read: rest left out')
const rest = Object.fromEntries(splitRows(games, grp('rest')).map((r) => [r.split, r]))
check(rest['Back-to-back'].gp === 2 && rest['2+ days rest'].gp === 1 && rest['No earlier game'].gp === 1 && !rest['1 day rest'] && Object.values(rest).reduce((t, r) => t + r.gp, 0) === 4, 'rest rows: B2B 2, 2+ 1, opener 1; the traded game is in none')

const HA = Object.fromEntries(splitRows(games, grp('home_away')).map((r) => [r.split, r]))
check(HA.Home.gp === 2 && HA.Away.gp === 3 && HA.Home.pts === 27, `home/away: Home 2 GP avg 27.0 (got ${HA.Home.pts})`)
const WL = Object.fromEntries(splitRows(games, grp('result')).map((r) => [r.split, r]))
check(WL.Win.gp === 3 && WL.Loss.gp === 2 && WL.Win.wins === 3, 'win/loss rows')
const MN = Object.fromEntries(splitRows(games, grp('minutes')).map((r) => [r.split, r]))
check(MN['Under 20 min'].gp === 1 && MN['20-29 min'].gp === 1 && MN['30-35 min'].gp === 2 && MN['36+ min'].gp === 1, 'minutes buckets: <20, 20-29, 30-35, 36+')
const OPP = splitRows(games, grp('opp'))
check(OPP[0].split === 'AAA' && OPP[0].gp === 2, 'vs opponent: most-met club first')
const t = aggregate(games)
check(t.gp === 5 && Math.abs(t.pts - (30 + 10 + 24 + 20 + 12) / 5) < 1e-9 && t.thin === (5 < THIN_GP), 'aggregate: per-game points from the sums; 5 games is THIN')
check(Math.abs(aggregate([by.g1]).fgPct - 7 / 15) < 1e-9 && Math.abs(aggregate([by.g1]).ptsPer36 - 30) < 1e-9, 'FG% from makes/attempts; pts/36 from points and minutes')
const rec = recentRows(games)
check(rec.length === 1 && rec[0].split === 'Last 5' && rec[0].thin === false, 'Last 5 exists with 5 games, Last 10 absent with 5; Last N rows are not THIN-flagged')
check(filterGames(games, { ha: 'home', result: 'W' }).length === 2 && filterGames(games, { opp: 'AAA', mins: '30' }).length === 1 && filterGames(games, { rest: '0' }).length === 2, 'AND combo filters')

// season window: TEST seasons 2027 / 2026
const lg = [...Array(12).fill(0).map(() => ({ s: 2027 })), ...Array(30).fill(0).map(() => ({ s: 2026 }))]
const opts = seasonOptions(lg, 2027)
check(opts.map((o) => o.key).join() === 'this,last,two' && opts[2].label === 'LAST 2 SEASONS', 'three options when both seasons are on file')
check(seasonOptions(lg.filter((g) => g.s === 2027), 2027).length === 0, 'one season on file: no toggle')
check(seasonOptions(lg.filter((g) => g.s === 2026), 2027).length === 0, 'only last season on file: no THIS SEASON / no toggle')
check(applySeason(lg, 'this', 2027).length === 12 && applySeason(lg, 'last', 2027).length === 30 && applySeason(lg, 'two', 2027).length === 42, 'applySeason cuts the log')
check(defaultSeason(opts, lg, 2027) === 'this' && defaultSeason(opts, lg.slice(5), 2027) === 'two' && yearLabel(2027) === '2026-27' && seasonsIn(lg).join() === '2027,2026', 'default: this season once he has 10 games, else the widest window')

// projected points (TEST numbers)
const flat = (min, pts, n = 8) => Array.from({ length: n }, () => ({ min, pts }))
const p0 = projectPoints({ recent: flat(30, 15), season: { min: 3000, pts: 1500 }, opp: { allowed: 110, league: 110 } })
check(p0.ok && Math.abs(p0.xpts - 15) < 1e-9 && p0.oppFactor === 1, 'a steady 30 min x 0.5 pts/min, average defence = 15.0')
const pOpp = projectPoints({ recent: flat(30, 15), season: { min: 3000, pts: 1500 }, opp: { allowed: 121, league: 110 } })
check(Math.abs(pOpp.oppFactor - 1.075) < 1e-9 && pOpp.xpts > p0.xpts, 'a defence 10% worse than the league lifts it by BETA x 10%')
check(projectPoints({ recent: flat(30, 15), season: { min: 3000, pts: 1500 }, opp: null }).oppFactor === 1 && !projectPoints({ recent: flat(30, 15), season: { min: 3000, pts: 1500 } }).oppKnown, 'no opponent number: factor 1, said so')
check(!projectPoints({ recent: flat(30, 15, 3), season: null }).ok, 'under 5 recent games: not projected, with the reason')
const rise = projectPoints({ recent: flat(36, 18), season: { min: 3000, pts: 1500 } })
check(rise.minRecent === 36 && rise.xpts > p0.xpts, 'more recent minutes -> more points (a role change shows)')
check(rise.rate >= 0.5 && rise.rate < 0.5 + 1e-6, 'the recent rate is shrunk toward his season rate (equal here: 0.5)')
const hot = projectPoints({ recent: flat(30, 21), season: { min: 3000, pts: 1500 } })
check(hot.rate > 0.5 && hot.rate < 0.7, 'a hot recent rate (0.7) moves the rate only part of the way to it')
check(projectPoints({ recent: [...flat(30, 15, 8), ...flat(5, 50, 20)], season: null }).n === RECENT_N, 'only the newest RECENT_N games are read')
check(/not a probability/.test(xptsLine(p0)) && seasonAverage(flat(30, 15, 9)) == null && seasonAverage(flat(30, 15, 10)) === 15, 'the line says what it is; the baseline needs 10 games')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
