#!/usr/bin/env node
// THE NFL SEASON RULE (lib/nfl/seasonRule.js and everything that prints a season). All data below is TEST data, made up for this check only
// (clubs "T01".."T10", players "p1"/"p2"); nothing here is a real game or a real number.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-nfl-season.mjs   (the JSX loader: the card adapter and the player modal are imported)
import { defenseSeason, teamGames, thinTeams, needsPrev, blendMatchup, MIN_GAMES_THIS } from '../lib/nfl/seasonRule.js'
import { softRole, softLine, matchupTag, whenOf, earlyNote } from '../lib/nfl/dvpSignal.js'
import { tdEmbed } from '../lib/nfl/tdFeed.js'
import { nflDepth } from '../lib/writeups/nfl.js'
import { seasonOptions, defaultSeason, applySeason, seasonNote } from '../lib/nfl/seasonWindow.js'
import { seriesFor, currentSeason, streakBoard } from '../lib/nfl/streaks.js'
import { backFromLog } from '../lib/cards/adapters/nfl.js'
import { ratesFor } from '../components/nfl/NflPlayerModal.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── TEST payloads: ten clubs, WR1 cell with a td count that rises with the club number ──
const TEAMS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10']
const cell = (td, g, rank) => ({ td, td_rank: rank, recyd_g: 30 + td * 4, recyd_g_rank: rank, g })
const table = (tds, gamesOf) => Object.fromEntries(TEAMS.map((t, i) => [t, { WR1: cell(tds[i], gamesOf[t], i + 1) }]))
const CUR_G = Object.fromEntries(TEAMS.map((t) => [t, 4]))
const CUR = { season: 2026, alt_season: 2025, dvp: { season: table([9, 8, 7, 6, 5, 4, 3, 2, 1, 0], CUR_G), l3: table([3, 3, 3, 3, 3, 3, 3, 3, 3, 3], CUR_G) } }
const PREV = { season: 2025, dvp: { season: table([40, 35, 30, 25, 20, 15, 10, 5, 3, 1], Object.fromEntries(TEAMS.map((t) => [t, 17]))) } }
const thin = (g2) => ({ ...CUR, dvp: { ...CUR.dvp, season: table([9, 8, 7, 6, 5, 4, 3, 2, 1, 0], { ...CUR_G, T01: g2 }) } })

// 1. a team with 4 games -> this season, labelled with the count
const a = defenseSeason(CUR, 'T02', 2026)
check(a.current && a.season === 2026 && a.games === 4 && a.label === '4 games this season' && !a.small, '4 games -> 2026, labelled "4 games this season"')
check(defenseSeason(thin(3), 'T01', 2026).label === '3 games this season', '3 games is the floor: still this season, "3 games this season"')
check(MIN_GAMES_THIS === 3, 'the floor is 3 games')
check(needsPrev(CUR, 2026) === false && blendMatchup(CUR, PREV, 2026) === CUR, 'a healthy payload needs no last-season file and is returned untouched (same object)')

// 2. a team with < 3 games -> last season, labelled
const T = thin(2)
check(thinTeams(T, 2026).join() === 'T01' && needsPrev(T, 2026) === true, 'a team with 2 games is thin; the page asks for last season')
const B = blendMatchup(T, PREV, 2026)
const b1 = defenseSeason(B, 'T01', 2026)
check(!b1.current && b1.season === 2025 && /^last season \(2025\), 17 games$/.test(b1.label), '2 games -> 2025, labelled "last season (2025), 17 games"')
check(B.dvp_team_season.T01 === 2025 && Object.keys(B.dvp_team_season).length === 1, 'only the thin team is swapped')
check(defenseSeason(B, 'T02', 2026).label === '4 games this season', 'the other teams stay this season')
// the thin team has no trailing windows from this season
check(!B.dvp.l3.T01 && B.dvp.l3.T02, 'a swapped team carries no this-season l3 window')

// 3. no response mixes seasons: every role row of a team has ONE season tag; ranks stay the row's own
const seasonsOf = (m, t) => new Set(Object.values(m.dvp.season[t]).map((r) => r.s))
check(TEAMS.every((t) => seasonsOf(B, t).size === 1), 'every team\'s role map is exactly one season')
check(B.dvp.season.T01.WR1.td === 40 && B.dvp.season.T01.WR1.td_rank === 1 && B.dvp.season.T01.WR1.g === 17, 'the swapped team\'s numbers (value, rank, games) are all 2025\'s')
check(B.dvp.season.T02.WR1.td === 8 && B.dvp.season.T02.WR1.g === 4, 'a kept team\'s numbers are all 2026\'s')
// the league mean a row is judged against is its OWN season's whole table
const sr = softRole({ ...B, slate_season: 2026 }, 'T01', 'season', ['WR1'], ['recyd_g'])
const prevMean = [40, 35, 30, 25, 20, 15, 10, 5, 3, 1].map((t) => 30 + t * 4).reduce((x, y) => x + y) / 10
check(sr && Math.abs(sr.leagueAvg - prevMean) < 1e-9, 'the swapped team is judged against last season\'s whole league (mean of the 2025 table), not a mix')
const skY = softRole({ ...B, slate_season: 2026 }, 'T02', 'season', ['WR1'], ['recyd_g'])
check(skY && Math.abs(skY.leagueAvg - [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].filter((_, i) => i !== 0).map((t) => 30 + t * 4).reduce((x, y) => x + y) / 9) < 1e-9, 'a kept team is judged against this season\'s nine kept teams only (no 2025 row in its mean)')
const sk = softRole({ ...B, slate_season: 2026 }, 'T02', 'season', ['WR1'])
check(sk && sk.when === 'this season', 'a kept team says "this season"')
check(sr && sr.when === 'last season', 'the swapped team says "last season"')
check(/ · 17 games last season$/.test(softLine({ ...sr, thin: false })) || /last season/.test(softLine(sr) + earlyNote(sr)), 'softLine for last season names it')
check(/3 games this season$|4 games this season$/.test(softLine({ ...sk, thin: false })), 'softLine for this season ends with the count and "this season"')

// no thin team and no prev: this season with a small-sample label, never blank
const noPrev = defenseSeason(thin(2), 'T01', 2026)
check(noPrev.current && noPrev.small && /2 games this season, small sample/.test(noPrev.label), 'no last-season table to fall back on -> "2 games this season, small sample"')
check(blendMatchup(T, null, 2026) === T, 'blend without a last-season file leaves the payload as it is')
// a file that is itself last season's (nothing 2026 yet): every team is "last season"
const old = defenseSeason({ ...PREV }, 'T03', 2026)
check(!old.current && /^last season \(2025\)/.test(old.label), 'a 2025 file under a 2026 slate is labelled last season')

// 4. every label says which season
const labels = [...TEAMS.map((t) => defenseSeason(B, t, 2026).label), noPrev.label, old.label]
check(labels.every((l) => /this season|last season/.test(l)), 'every label says this season or last season')
check(labels.every((l) => !(/this season/.test(l) && /last season/.test(l))), 'no label says both seasons')

// 5. the Discord line: rank from matchupTag carries games + season
const mt = (m, t) => matchupTag({ ...m, slate_season: 2026, roles: { p1: 'WR1' } }, { opp: t, player_id: 'p1' }, 'TD')
const tagKept = mt(B, 'T02'); const tagSwap = mt(B, 'T01')
check(tagKept.games === 4 && tagKept.season === 2026 && /4 games this season/.test(tagKept.detail), 'matchupTag (kept team): 4 games, 2026, detail says "4 games this season"')
check(tagSwap.games === 17 && tagSwap.season === 2025 && /last season/.test(tagSwap.detail), 'matchupTag (swapped team): 17 games, 2025, detail says "last season"')
const ev = (d) => ({ gameId: 'g', team: 'T05', opponent: d.opp, scorerName: 'Test Player', text: 'x', onBot: { market: 'TD', rank: 1 }, defense: d, quarter: 1, clock: '10:00', parsed: { yards: 12, kind: 'run' }, seasonToDate: { td: 3, games: 4 } })
const line2 = (d) => tdEmbed(ev({ role: 'WR1', opp: 'T02', tag: 'TARGET', rank: 3, ...d })).description.split('\n')[1]
check(line2({ season: 2026, current_season: 2026, games: 3 }) === 'T02 gives up the 3rd-most touchdowns in the league to WR1s in 3 games this season.', 'the TD line with 2026 and 3 games says "in 3 games this season"')
check(line2({ season: 2025, current_season: 2026, games: 17 }) === 'T02 gave up the 3rd-most touchdowns in the league to WR1s last season.', 'the TD line with 2025 says "last season", no 2026 count')
check(line2({ season: 2026, current_season: 2026 }) === 'T02 gives up the 3rd-most touchdowns in the league to WR1s.', 'the TD line with no game count stays as before')

// 6. the write-up: each source line says its season; charting is last season while stats are this season
const P = { player_id: 'p1', name: 'Test Receiver', position: 'WR', opp: 'T02', stats: { 'TGT%': 0.3, TGT: 10, RZ: 3, GL: 1 } }
const M = { season: 2026, chart_season: 2025, roles: { p1: 'WR1' }, snaps: { p1: { snap_pct: 80, games: 4 } },
  coverage_player: { p1: { zone: { tgts: 40, ypt: 8.9, catch_pct: 70 }, man: { tgts: 20, ypt: 6.1, catch_pct: 60 } } }, coverage_team: { T02: { man_pct: 30, zone_pct: 70 } },
  red_zone: { p1: { touches: 8, tds: 2 } }, dvp: B.dvp }
const secs = nflDepth(P, { ...M, dvp: B.dvp }, 2026)
const lines = secs.flatMap((s) => s.lines)
const find = (re) => lines.find((l) => re.test(l.src))
check(/\(this season\)$/.test(find(/^snaps/).t) && /\(this season\)$/.test(find(/^red_zone/).t), 'write-up: snaps and red-zone lines say "(this season)"')
check(/\(last season\)$/.test(find(/^coverage_player/).t) && /\(last season\)$/.test(find(/^coverage_team/).t), 'write-up: coverage lines (charting, 2025) say "(last season)"')
check(/\(this season\)$/.test(find(/^dvp\.season\./).t), 'write-up: the defense-vs-position line says "(this season)"')
const swapDepth = nflDepth({ ...P, opp: 'T01' }, { ...M, dvp: B.dvp }, 2026).flatMap((s) => s.lines).find((l) => /^dvp\.season\./.test(l.src))
check(swapDepth && /\(last season\)$/.test(swapDepth.t), 'write-up: a swapped defense says "(last season)"')
check(!nflDepth(P, M, null).flatMap((s) => s.lines).some((l) => /\((this|last) season\)/.test(l.t)), 'write-up: with no slate season it adds no tag (nothing to compare to)')

// 7. the player window: this season is the default, last season an explicit switch
const G = (s, w, td) => ({ s, w, opp: 'T02', tm: 'T01', g_td: td, g_recyd: td * 20, g_rec: 3, g_car: 1, g_ruyd: 2, g_payd: 0, g_kick: 0 })
const LOG = [...[1, 2, 3, 4, 5, 6].map((w) => G(2025, w, 1)), ...[1, 2, 3, 4].map((w) => G(2026, w, 0))]
const opts = seasonOptions(LOG, 2026)
check(opts.map((o) => o.key).join() === 'this,last,two' && defaultSeason(opts) === 'this', 'player window: THIS SEASON is the default; LAST SEASON and LAST 2 are switches')
check(applySeason(LOG, defaultSeason(opts), 2026).every((g) => g.s === 2026) && applySeason(LOG, 'this', 2026).length === 4, 'the default window holds only this season\'s games')
check(defaultSeason([{ key: 'last' }, { key: 'two' }]) === 'last', 'with no this-season option the fallback is last season')
check(seasonNote(LOG, 2026) === null && /No 2026 games on file yet; these are 2025 games \(last season\)\./.test(seasonNote(LOG.filter((g) => g.s === 2025), 2026)), 'a player with no 2026 game is told so, and which season he is shown')
const rates = ratesFor({ scores: { TD: 70 } }, [{ key: 'TD', bar: 1 }], LOG)[0]
check(rates.l10[1] === 4 && rates.l5[1] === 4 && rates.season[1] === 4 && rates.seasonYear === 2026, 'L5 / L10 stay inside this season (4 games, not 10 across two seasons)')
check(rates.l10[0] === 0 && rates.season[0] === 0, 'and count only this season\'s hits')

// 8. streaks: this season's games only
const LOGS = { logs: { p1: { log: LOG }, p2: { log: LOG.filter((g) => g.s === 2025) } }, bars: { TD: ['g_td', 1] } }
check(currentSeason(LOGS) === 2026, 'the newest season on the file is 2026')
check(seriesFor(LOGS, 'p1', 'g_td').length === 4 && seriesFor(LOGS, 'p1', 'g_td').every((r) => r.s === 2026), 'a streak series is this season\'s games')
check(seriesFor(LOGS, 'p2', 'g_td').length === 0, 'a player with no 2026 game has no active streak series')
check(seriesFor(LOGS, 'p1', 'g_td', 30, 0).length === 10, 'season 0 is the explicit "every season" switch')
const sb = streakBoard(LOGS, [{ player_id: 'p1' }, { player_id: 'p2' }], 'g_td', 1, 'under', 30)
check(sb.length === 1 && sb[0].games === 4 && sb[0].streak === 4, 'streak board: 4 straight under, over 4 games this season (not 10 over two seasons)')

// 9. the player back card: the current season row is named
const back = backFromLog({ pos: 'WR', team: 'T01', number: 1 }, LOG, null, 2026)
check(back.rows.map((r) => r.season).join() === '2025,2026' && /2026 is this season: 4 games so far\./.test(back.note), 'back card: 2026 is a row and the note names it ("4 games so far")')
check(/No 2026 games on file yet\./.test(backFromLog({ pos: 'WR', team: 'T01' }, LOG.filter((g) => g.s === 2025), null, 2026).note), 'back card for a player with no 2026 game says so')

// whenOf basics
check(whenOf({ season: 2026, slate_season: 2026 }, {}) === 'this season' && whenOf({ season: 2025, slate_season: 2026 }, {}) === 'last season' && whenOf({ season: 2026 }, {}) === '', 'whenOf: this / last / unknown')
check(teamGames(CUR, 'T01') === 4 && teamGames(CUR, 'ZZZ') === null, 'teamGames reads the row count, null for an unknown club')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
