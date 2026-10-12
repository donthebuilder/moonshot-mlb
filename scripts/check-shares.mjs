#!/usr/bin/env node
// SHARE OF TEAM (lib/shares.js, lib/nfl/usageShares.js, the share columns). All data below is TEST data, made up for this check only
// (clubs "T01"/"T02", players "p1".."p9"); nothing here is a real player or a real number.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-shares.mjs
import { sharePct, roundShare, fmtShare, fmtPoints, clubShares, trendGlyph } from '../lib/shares.js'
import { usageOf, withUsageShares, nflShareRows } from '../lib/nfl/usageShares.js'
import { nflBoardRow, nflBoardColumns, withNflFullSet } from '../lib/nfl/boardColumns.js'
import { nhlBoardRow, withNhlFullSet, nhlShareRows } from '../lib/nhl/boardColumns.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// 1. the math
check(sharePct(25, 100) === 25 && sharePct(1, 3) > 33.33 && sharePct(1, 3) < 33.34, 'part over whole, as a percent')
check(sharePct(0, 400) === 0, 'a real zero stays a zero (0 shots on a club that took 400)')
check(sharePct(5, 0) === null && sharePct(5, -3) === null && sharePct(5, null) === null && sharePct(5, undefined) === null && sharePct(5, '') === null, 'zero / negative / missing whole is BLANK, never 0 or Infinity')
check(sharePct(null, 100) === null && sharePct(undefined, 100) === null && sharePct('', 100) === null && sharePct(-1, 100) === null && sharePct(NaN, 100) === null, 'missing part is BLANK, never 0')
check(roundShare(4.64) === 4.6 && roundShare(9.96) === 10 && roundShare(10.4) === 10 && roundShare(27.5) === 28 && roundShare(0) === 0 && roundShare(null) === null, 'under 10 one decimal, else whole; 9.96 rounds to 10')
check(fmtShare(4.64) === '4.6%' && fmtShare(27.4) === '27%' && fmtShare(0) === '0.0%' && fmtShare(null) === '—' && fmtShare(undefined) === '—' && fmtShare('x') === '—', 'display: "4.6%", "27%", "0.0%", "—"')
check(fmtPoints(1.34) === '+1.3' && fmtPoints(-0.44) === '-0.4' && fmtPoints(0) === '0.0' && fmtPoints(null) === '—', 'snap change in points')
check(trendGlyph(1) === '▲' && trendGlyph(-2.5) === '▼' && trendGlyph(0.4) === '▬' && trendGlyph(null) === '', 'trend glyph: a point or more up / down, else flat, blank when missing')

// 2. a club's shares: sums to 100 for every measure
const club = [
  { id: 'p1', gp: 10, toi: 1200, shots: 40, g: 6 },    // 12000 s
  { id: 'p2', gp: 10, toi: 600, shots: 20, g: 4 },     // 6000 s
  { id: 'p3', gp: 5, toi: 800, shots: 0, g: 0 },       // 4000 s
  { id: 'p4', gp: 0, toi: null, shots: null, g: null },  // on the page, never played
]
const cs = clubShares(club)
const sum = (k) => ['p1', 'p2', 'p3'].reduce((a, id) => a + cs.get(id)[k], 0)
check(Math.abs(sum('toi') - 100) < 1e-9 && Math.abs(sum('shots') - 100) < 1e-9 && Math.abs(sum('goals') - 100) < 1e-9, 'ice time, shot and goal shares each sum to 100 over the skaters who played')
check(Math.abs(cs.get('p1').toi - (12000 / 22000) * 100) < 1e-9, 'ice-time share is toi x gp over the club total (not toi over toi)')
check(cs.get('p3').shots === 0 && cs.get('p3').goals === 0, 'a skater with no shots has a 0 share, not blank')
check(cs.get('p4').toi === null && cs.get('p4').shots === null && cs.get('p4').goals === null, 'a man who did not play has blank shares')
// zero team total / hole in the total
const none = clubShares([{ id: 'a', gp: 3, toi: 900, shots: 0, g: 0 }, { id: 'b', gp: 3, toi: 900, shots: 0, g: 0 }])
check(none.get('a').shots === null && none.get('a').goals === null && none.get('a').toi === 50, 'zero team shots / goals -> blank, ice time still shares')
const hole = clubShares([{ id: 'a', gp: 3, toi: 900, shots: 5, g: 1 }, { id: 'b', gp: 3, toi: null, shots: 5, g: 1 }])
check(hole.get('a').toi === null && hole.get('b').toi === null && hole.get('a').shots === 50, 'a played man missing ice time makes the club total unknown: blank for everyone, other measures untouched')
check(clubShares([]).size === 0 && clubShares(null).size === 0, 'no lines -> no shares')

// 3. TUDDY: snap share and the team shares the files hold
const M = {
  snaps: {
    p1: { team: 'T01', side: 'offense', games: 4, snap_pct: 62.4, recent_pct: 70.2, trend: 7.8 },
    p2: { team: 'T01', side: 'offense', games: 3, snap_pct: 4, recent_pct: 5.3, trend: 1.3 },
    p3: { team: 'T01', side: 'defense', games: 4, snap_pct: 90, recent_pct: 90, trend: 0 },
  },
  usage: { T01: { p1: { car_share: 31.26, rz_tgt_share: 8.04, rz_car_share: 0 } } },
}
const u1 = usageOf(M, 'p1', 'T01')
check(u1.snap === 62 && u1.snapRecent === 70 && u1.snapTrend === 7.8 && u1.snapGames === 4, 'snap % (whole above 10), last-3 and trend in points, with the n')
check(u1.carShare === 31 && u1.rzTgtShare === 8 && u1.rzCarShare === 0, 'carry / red-zone shares only from usage[team][id]; a real 0 stays 0')
check(usageOf(M, 'p2', 'T01').snap === 4 && usageOf(M, 'p2', 'T01').carShare === undefined, 'under 10 keeps one decimal; no usage row -> no carry share')
check(usageOf(M, 'p3', 'T01') === null, 'a defensive snap row is never read as an offence share')
check(usageOf(M, 'nobody', 'T01') === null && usageOf(null, 'p1', 'T01') === null && usageOf({}, 'p1', 'T01') === null, 'no data -> null')
check(usageOf(M, 'p1', 'T02').carShare === undefined && usageOf(M, 'p1', 'T02').snap === 62, 'the usage row is read for his own club only')
const slate = { players: [{ player_id: 'p1', team: 'T01' }, { player_id: 'p9', team: 'T01' }] }
const ws = withUsageShares(slate, M)
check(ws.players[0].usage.snap === 62 && ws.players[1].usage === undefined && withUsageShares(slate, null) === slate, 'withUsageShares puts usage on the men the file holds, the rest untouched')

// 4. TUDDY columns: shown only when a row has them, in the Role & usage group, short list carries Snap %
const rowsN = [{ _raw: { player_id: 'p1', usage: u1, stats: { 'TGT%': 0.294 } } }, { _raw: { player_id: 'p9', stats: {} } }]
const full = withNflFullSet(rowsN, [])
const byKey = Object.fromEntries(full.columns.map((c) => [c.key, c]))
check(byKey.sh_snap && byKey.sh_snap3 && byKey.sh_snap_d && byKey.sh_snap_n && byKey.sh_car && byKey.sh_rztgt && byKey.sh_rzcar && byKey['st_TGT%'], 'every share column appears when some row has it')
check([byKey.sh_snap, byKey.sh_snap3, byKey.sh_snap_d, byKey.sh_car, byKey['st_TGT%']].every((c) => c.group?.key === 'usage' && c.group.label === 'Role & usage'), 'all in the Role & usage group')
check(byKey.sh_snap.cset === 'lean' && byKey.sh_snap3.cset !== 'lean', 'Short list keeps Snap % only')
check(byKey.sh_snap.fmt(62) === '62%' && byKey.sh_snap.fmt(4) === '4.0%' && byKey['st_TGT%'].fmt(0.294) === '29%' && byKey['st_TGT%'].fmt(0.094) === '9.4%', 'cells: "62%", "4.0%", target share 29% / 9.4%')
check(byKey.sh_snap_d.fmt(7.8) === '▲ +7.8' && byKey.sh_snap_d.fmt(null) === '—', 'trend cell has an arrow and signed points')
check(/Snap GP/.test(byKey.sh_snap.explain) && /defensive snap/i.test(byKey.sh_snap.explain), 'the explainer names the n column and says defence is not published')
check(!nflBoardColumns([{ x: 1 }]).some((c) => c.key.startsWith('sh_')), 'no row has a share -> no share column (a kicker table grows none)')
const twin = withNflFullSet([{ _raw: { player_id: 'p1', usage: u1 }, snap: 62 }], [{ key: 'snap', label: 'Snap %' }])
check(!twin.columns.some((c) => c.key === 'sh_snap') && twin.columns.some((c) => c.key === 'sh_snap3'), 'a table that shows its own `snap` does not get the twin column')
check(nflBoardRow({ usage: { snap: 4, snapGames: 3 } }).sh_snap === 4, 'nflBoardRow flattens usage')
const rows = nflShareRows({ usage: u1, stats: { 'TGT%': 0.294 } }).map((r) => `${r.label}=${r.value}`)
check(rows[0] === 'SNAP SHARE (4 G)=62%' && rows.some((r) => r === 'TARGET SHARE=29%') && rows.some((r) => r === 'CARRY SHARE=31%'), 'the card back rows say the same numbers')
check(nflShareRows({}).length === 0, 'no usage -> no back rows')

// 5. LAMP: the board row's share, the columns, the card back
const nrow = { name: 'T', share: { gp: 12, toi: 6.2, shots: 4.4, goals: 0 } }
const f = nhlBoardRow(nrow)
check(f.sh_toi === 6.2 && f.sh_shots === 4.4 && f.sh_goals === 0 && f.sh_gp === 12, 'nhlBoardRow flattens share (a 0 goal share stays 0)')
const nf = withNhlFullSet([{ _row: nrow }, { _row: { name: 'U' } }], [])
const nk = Object.fromEntries(nf.columns.map((c) => [c.key, c]))
check(nk.sh_toi && nk.sh_shots && nk.sh_goals && nk.sh_gp && nk.sh_toi.group.label === 'Role & usage' && nk.sh_toi.cset === 'lean' && nk.sh_shots.cset !== 'lean', 'NHL share columns, grouped, TOI % on the short list')
check(nk.sh_toi.fmt(6.2) === '6.2%' && nk.sh_toi.fmt(18.4) === '18%' && nk.sh_toi.fmt(null) === '—', 'NHL cell format')
check(/not published/.test(nk.sh_toi.explain) && /Share GP/.test(nk.sh_toi.explain), 'TOI % says PP time / line are not published and names the n column')
check(withNhlFullSet([{ _row: { name: 'U' } }], []).columns.every((c) => !c.key.startsWith('sh_')), 'no share on the board row (started game / no club line) -> no column')
check(nhlShareRows(nrow).map((r) => `${r.label}=${r.value}`).join('|') === 'Ice-time share (12 GP)=6.2%|Shot share (12 GP)=4.4%|Goal share (12 GP)=0.0%' && nhlShareRows({}).length === 0, 'NHL card back rows')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
