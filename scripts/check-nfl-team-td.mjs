#!/usr/bin/env node
// THE TEAM TOUCHDOWN MODEL (lib/nfl/teamTdModel.js). All inputs below are TEST data, made up for this check only
// (clubs "AAA".."DDD", not real results); nothing here is a real game or a real number.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-team-td.mjs
import { teamGames, fitTeams, projectGame, slateTotals, sumTotals, leagueTotals, placeIn, PARAMS, TD_WORD } from '../lib/nfl/teamTdModel.js'
import { buildNflHeadlines } from '../lib/nfl/headlines.js'
import fs from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST logs: one "player" per club, so a club's touchdowns are that player's g_td.
// AAA scores a lot, BBB little, CCC/DDD in between; 2025 weeks 1-4, then 2026 week 1.
const E = (s, w, tm, opp, td) => ({ s, w, tm, opp, d: `${s}-09-${String(7 + w * 7).padStart(2, '0')}`, g_td: td, h: 0 })
const log = (tm, rows) => ({ log: rows.map(([s, w, opp, td]) => E(s, w, tm, opp, td)) })
const LOGS = { logs: {
  a: log('AAA', [[2025, 1, 'BBB', 4], [2025, 2, 'CCC', 3], [2025, 3, 'DDD', 4], [2025, 4, 'BBB', 3]]),
  b: log('BBB', [[2025, 1, 'AAA', 1], [2025, 2, 'DDD', 1], [2025, 3, 'CCC', 0], [2025, 4, 'AAA', 1]]),
  c: log('CCC', [[2025, 2, 'AAA', 2], [2025, 3, 'BBB', 2]]),
  d: log('DDD', [[2025, 2, 'BBB', 2], [2025, 3, 'AAA', 2]]),
  a2: log('AAA', [[2026, 1, 'BBB', 5]]), b2: log('BBB', [[2026, 1, 'AAA', 0]]),
} }

const rows = teamGames(LOGS)
check(rows.length === 14 && rows.find((r) => r.tm === 'AAA' && r.s === 2025 && r.w === 1)?.td === 4, 'teamGames: one row per club per game, touchdowns summed')

// 1. NO LEAK: a week is fit from games before it only
const m1 = fitTeams(rows, 2025, 3)
const m1b = fitTeams(rows.filter((r) => !(r.s === 2025 && r.w >= 3)).concat([{ s: 2026, w: 9, tm: 'AAA', opp: 'BBB', td: 99 }]), 2025, 3)
check(Math.abs(m1.off.get('AAA').rate - m1b.off.get('AAA').rate) < 1e-12, 'fitTeams(2025 w3) ignores week 3 and everything after it')

// 2. an offence above the league raises its number; a soft defence raises the opponent's
const g = projectGame(fitTeams(rows, 2026, 1), 'AAA', 'BBB')
const g2 = projectGame(fitTeams(rows, 2026, 1), 'BBB', 'AAA')
check(g.awayTd > g.homeTd, 'the high-scoring club (AAA) projects above the low one (BBB) at either address')
check(g.total > 0 && Math.abs(g.total - (g.awayTd + g.homeTd)) < 1e-12, 'a game total is both clubs')
check(Math.abs(g.total - g2.total) < 1e-9, 'home/away does not move the total (home field was tested and left out)')

// 3. shrinkage: after one game a club sits near the league, not at its one result
const early = fitTeams(rows.filter((r) => r.s === 2025 && r.w === 1), 2025, 2)
const mu = early.mu
check(Math.abs(early.off.get('AAA').rate - 4) > Math.abs(early.off.get('AAA').rate - mu), 'one game pulls a club toward the league average (shrink)')

// 4. no logs, no number (never a made-up one)
check(Object.keys(slateTotals({ season: 2026, week: 2, games: [{ game_id: 'x', away: 'AAA', home: 'BBB' }] }, null)).length === 0, 'no logs -> no totals')
check(Object.keys(slateTotals({ season: 2026, week: 2, games: [] }, LOGS)).length === 0, 'no games -> no totals')

// 5. slateTotals: one entry per game, heat is a place in the league distribution, cached per payload
const WEEK = { season: 2026, week: 2, games: [{ game_id: 'g1', away: 'AAA', home: 'BBB' }, { game_id: 'g2', away: 'CCC', home: 'DDD' }] }
const T = slateTotals(WEEK, LOGS)
check(Object.keys(T).length === 2 && T.g1.total > T.g2.total, 'slateTotals: two games, the AAA game is the bigger number')
check(T.g1.heat > T.g2.heat && T.g1.heat <= 1 && T.g2.heat >= 0, 'heat is the 0-1 place in the league distribution')
check(slateTotals(WEEK, LOGS) === T, 'same payload, same answer object (one fit, not one per component)')
check(Math.abs(sumTotals(T) - (T.g1.total + T.g2.total)) < 1e-12, 'sumTotals adds the games')
const sorted = leagueTotals(fitTeams(rows, 2026, 2))
check(sorted.every((v, i) => i === 0 || sorted[i - 1] <= v) && placeIn(sorted, sorted[sorted.length - 1]) === 1, 'leagueTotals sorted; the top pairing is at 1')
check(placeIn(sorted, -1) === 0, 'below every pairing is 0')

// 6. the headline pick reads the model, never a roster sum
const players = [{ player_id: '1', name: 'TEST Player', team: 'AAA', position: 'RB', scores: { TD: 70 }, stats: { xTD: 99 } }, { player_id: '2', name: 'TEST Other', team: 'CCC', position: 'WR', scores: { TD: 60 }, stats: { xTD: 0.1 } }]
const bitesNo = buildNflHeadlines({ players, games: WEEK.games, markets: [], matchup: null })
check(!bitesNo.some((b) => b.k === 'game'), 'no totals -> no GAME TO CIRCLE (a roster sum is never put in its place)')
const bites = buildNflHeadlines({ players, games: WEEK.games, markets: [], matchup: null, totals: T })
const gb = bites.find((b) => b.k === 'game')
check(gb && gb.name === 'AAA @ BBB' && gb.stat.startsWith(T.g1.total.toFixed(1)), 'GAME TO CIRCLE = the model\'s top total, not the 99 xTD one player carries')

// 7. words: one constant, and no printed probability anywhere in the model file
check(TD_WORD === 'expected touchdowns', 'wording constant is "expected touchdowns"')
const src = fs.readFileSync(new URL('../lib/nfl/teamTdModel.js', import.meta.url), 'utf8')
check(!/probab|chance of|%/.test(src.replace(/\/\/.*$/gm, '')), 'the model code prints no probability')
check(Object.keys(PARAMS).sort().join() === 'a,b,carry,cover,k', 'only the tested knobs exist (home, rest and yards were rejected)')

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
