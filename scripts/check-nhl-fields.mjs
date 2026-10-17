#!/usr/bin/env node
// NHL SKATER FIELDS: nothing real is dropped between the source and the cell (2026-10-17, Donovan: "make sure all the data for each
// skater is there; some players are missing a ton of data, like season goals"). TEST DATA only: made-up skaters, clubs and games.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nhl-fields.mjs
// Runs the PURE shaping steps over one fixture per edge case: a real 0, a traded man (one league line, two clubs), a rookie, a
// goalie, a locked row (lamp_goal_log shape) against a preview row, a started game, a skater the club page does not list.
// `GAP` lines are known holes that live in files another workflow owns; they print but do not fail, and flip to asserts once fixed.
import { sznOf, joinLines, formFrom } from '../lib/nhl/seasonLine.js'
import { nhlBoardRow, withNhlFullSet, nhlShareRows } from '../lib/nhl/boardColumns.js'
import { shapeRow } from '../lib/nhl/boardRead.js'
import { sznFromLeagueRow, nhlSeasonRows, nhlSeasonFacts } from '../lib/nhl/sznRow.js'
import { skaterRows, goalieRows } from '../lib/nhl/seasonStats.js'
import { reducePlayer } from '../lib/nhl/reduce.js'
import { nhlStatRow } from '../components/player/nhlAdapter.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const gap = (name, ok) => console.log(`${ok ? 'ok  ' : 'GAP '} ${name}${ok ? '' : '  (known; owned elsewhere, see the audit report)'}`)

// ── TEST season lines (leagueSkaterLines shape). 910 has a real 0 goals; 911 was traded (ONE line, two clubs); 912 has no games. ──
const lines = new Map([
  [910, { id: 910, gp: 8, g: 0, a: 0, pts: 0, shots: 0, shPct: 0, toi: 900, ppg: 0, clubs: 'AAA' }],
  [911, { id: 911, gp: 14, g: 6, a: 4, pts: 10, shots: 40, shPct: 0.15, toi: 1100, ppg: 2, clubs: 'AAA,BBB' }],
  [912, { id: 912, gp: 0, g: 0, a: 0, pts: 0, shots: 0, shPct: null, toi: null, clubs: 'AAA' }],
])
const rows = [
  { playerId: 910, gameDate: '2099-01-09', goals: 0, gameId: 3 }, { playerId: 910, gameDate: '2099-01-08', goals: 0, gameId: 2 },
  { playerId: 911, gameDate: '2099-01-09', goals: 1, gameId: 3 },
]
const form = formFrom(rows, '2099-01-10')

// 1. a real zero is a zero all the way to the cell's field
const z = joinLines('910', { lines, form, started: false })   // playerId as a STRING, as a row can carry it
eq('szn: a man with 0 goals keeps szn.g = 0 (not null)', z.szn?.g, 0)
const r0 = nhlBoardRow({ szn: z.szn, form: z.form })
eq('nhlBoardRow: 0 goals / 0 assists / 0 shots / 0% / 0 L5 / drought 2 all present', [r0.szn_g, r0.szn_a, r0.szn_pts, r0.szn_s, r0.szn_shpct, r0.l5g, r0.drought], [0, 0, 0, 0, 0, 0, 2])
eq('withNhlFullSet: a Szn G column whose every value is 0 is still a column', withNhlFullSet([{ id: 1, _row: { szn: z.szn } }], []).columns.some((c) => c.key === 'szn_g'), true)
eq('nhlShareRows: a 0% goal share is listed as 0.0%', nhlShareRows({ share: { gp: 5, toi: 10, shots: 3, goals: 0 } }).map((x) => x.value), ['10%', '3.0%', '0.0%'])
eq('card back: zero season goals / drought 0 are rows, not gaps', nhlSeasonRows({ szn: z.szn, form: { l5: 0, gp5: 5, l10: 0, gp10: 8, drought: 0, droughtPlus: false } }).map((x) => `${x.label}=${x.value}`).slice(0, 3), ['Season goals (8 GP)=0', 'Season assists=0', 'Season points=0'])
eq('props chips: 0 G · 0 PTS · 8 GP, then L5 / drought', nhlSeasonFacts({ szn: z.szn, form: { l5: 0, drought: 3, droughtPlus: true } }), ['0 G · 0 PTS · 8 GP', 'L5 0 G · drought 3+'])
eq('card back: early season says how many games L10 holds', nhlSeasonRows({ form: { l5: 1, gp5: 3, l10: 1, gp10: 3, drought: 0 } }).map((x) => x.value), ['1 in 3 games', '1 in 3 games', '0'])

// 2. a traded man: one league line carries both clubs
eq('traded: the season line is the whole 14 games, not one club', joinLines(911, { lines, form, started: false }).szn.gp, 14)
eq('sznFromLeagueRow (a skater with no board row tonight) = sznOf of the same line', sznFromLeagueRow({ gp: 14, g: 6, a: 4, pts: 10, sog: 40, shPct: 0.15, toi: 1100 }), sznOf(lines.get(911)))
eq('sznFromLeagueRow: no games = null, a real 0 = a line', [sznFromLeagueRow({ gp: 0, g: 0 }), sznFromLeagueRow({ gp: 3, g: 0, a: 0, pts: 0, sog: 2, shPct: 0, toi: 800 })?.g], [null, 0])
eq('league report: last club named is his club; 0 goals stays 0', skaterRows([{ playerId: 911, skaterFullName: 'Test Traded', teamAbbrevs: 'AAA,BBB', positionCode: 'C', gamesPlayed: 14, goals: 0, assists: 0, points: 0, shots: 0 }]).map((r) => [r.team, r.g, r.sog]), [['BBB', 0, 0]])
eq('league report: a goalie keeps 0 wins', goalieRows([{ playerId: 913, goalieFullName: 'Test G', teamAbbrevs: 'AAA', gamesPlayed: 1, wins: 0 }])[0].w, 0)

// 3. no games / unknown player: nothing invented
eq('no games: no season line, and the board row has no szn keys', [joinLines(912, { lines, form, started: false }).szn, Object.keys(nhlBoardRow({ szn: null })).filter((k) => k.startsWith('szn_'))], [null, []])
eq('a skater the league report does not name: null, not zeros', joinLines(999, { lines, form, started: false }).szn, null)

// 4. the shaping step: a LOCKED row (lamp_goal_log columns) carries what the PREVIEW row does
const legs = { shotsPg: 2.5, goalsPg: 0.3, toi: 1100, gpPooled: 60, gpCur: 8, gpPrev: 52, prevWeight: 1 }
const pct = { shotsPg: 80, goalsPg: 60, toi: 70 }
const ctx = { oppGaPg: 3.1, oppGoalie: { name: 'Test Goalie' } }
const preview = shapeRow({ playerId: 910, name: 'Test A', pos: 'C', team: 'AAA', opp: 'BBB', home: true, score: 71, rank: 3, status: 'called', legs: { ok: true, ...legs }, pct, context: ctx, role: 'Shooter', nightRank: 4, nightOf: 190, goalGameProbability: 0.2 }, true)
const locked = shapeRow({ player_id: 910, name: 'Test A', pos: 'C', team: 'AAA', opp: 'BBB', home: true, score: 71, rank_in_game: 3, status: 'called', legs, pct, context: { ...ctx, role: 'Shooter', nightRank: 4, nightOf: 190 }, goals: 0, hit: false }, false)
const fp = nhlBoardRow({ ...preview, szn: z.szn, form: z.form }), fl = nhlBoardRow({ ...locked, szn: z.szn, form: z.form })
eq('locked row: every field of the full set the preview row has', Object.keys(fl).sort(), Object.keys(fp).sort())
eq('locked row: goals = 0 and hit = false survive the shape (a graded 0 is a result)', [locked.goals, locked.hit], [0, false])
eq('locked row: the player id is the log\'s player_id, so id joins hold', locked.playerId, 910)

// 5. a started or final game: the season line is blank BY DESIGN today (joinLines `started`)
gap('started game still shows his season line (joinLines blanks it; the lead is fixing seasonLine.js)', joinLines(910, { lines, form, started: true }).szn != null)

// 6. a rookie (under the model's minimum games): the board's legs are null, but his games played are real
const rookie = shapeRow({ playerId: 920, name: 'Test Rookie', pos: 'L', team: 'AAA', opp: 'BBB', home: false, status: 'off', reason: 'fewer than 3 NHL games on file (1)', legs: { ok: false, gpPooled: 1, gpCur: 1, gpPrev: 0, prevWeight: 0 } }, true)
gap('rookie / off-board row keeps GP and GP used (shapeRow nulls the whole legs object)', nhlBoardRow(rookie).gp === 1)
eq('rookie: the reason is carried so the row says why it is not scored', rookie.reason, 'fewer than 3 NHL games on file (1)')

// 7. the player file: a traded man's blank ice time / a traded goalie's counts come from his club rows
const sk = (team, gp, toi, g) => ({ season: 20252026, gameTypeId: 2, leagueAbbrev: 'NHL', teamCommonName: { default: team }, gamesPlayed: gp, goals: g, avgToi: toi })
const traded = reducePlayer({ playerId: 930, position: 'C', firstName: 'Test', lastName: 'Skater', featuredStats: { season: 20252026, regularSeason: { subSeason: { gamesPlayed: 30, goals: 0, assists: 2, points: 2 } } },
  seasonTotals: [sk('A', 10, '15:00', 0), sk('B', 20, '18:00', 0)] })
eq('traded skater: avg ice time = games-weighted mean of his clubs (17:00), goals 0 kept', [traded.featured.regular.toi, traded.featured.regular.g], [1020, 0])
const gl = (team, gp, gs, sa, ga) => ({ season: 20252026, gameTypeId: 2, leagueAbbrev: 'NHL', teamCommonName: { default: team }, gamesPlayed: gp, gamesStarted: gs, shotsAgainst: sa, goalsAgainst: ga })
const tg = reducePlayer({ playerId: 931, position: 'G', firstName: 'Test', lastName: 'Goalie', featuredStats: { season: 20252026, regularSeason: { subSeason: { gamesPlayed: 12, wins: 5 } } }, seasonTotals: [gl('A', 5, 4, 100, 10), gl('B', 7, 7, 200, 0)] })
eq('traded goalie: starts, shots against and goals against are the sums; 0 GA on a club still sums', [tg.featured.regular.gs, tg.featured.regular.sa, tg.featured.regular.ga], [11, 300, 10])
const oneClub = reducePlayer({ playerId: 932, position: 'C', firstName: 'Test', lastName: 'One', featuredStats: { season: 20252026, regularSeason: { subSeason: { gamesPlayed: 5, goals: 1 } } }, seasonTotals: [sk('A', 5, '16:00', 1)] })
eq('one club: filled from his single row, as before', oneClub.featured.regular.toi, 960)

// 8. the strip on the player page: early season L10 over the games he has; zero goals / zero drought shown
const fr = { gp: 6, g: 0, shots: 12, shPct: 0, toi: 1000 }
const strip = nhlStatRow({ goalie: false, fr, board: null, row: null, l10: 0, l10n: 6, drought: 0, seasonLabel: '2099-00', stale: false })
eq('strip: L10 G = 0 and DRT = 0 are shown (a 0 is not a dash), L10 says it holds 6 games', [strip.find((s) => s.id === 'l10')?.text, strip.find((s) => s.id === 'drt')?.text, /6 games/.test(strip.find((s) => s.id === 'l10')?.title)], ['0', '0', true])
eq('strip: G/GP is 0.00 for a man with 0 goals', strip.find((s) => s.id === 'gpg')?.text, '0.00')

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
