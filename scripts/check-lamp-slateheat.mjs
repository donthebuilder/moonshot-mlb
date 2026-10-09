#!/usr/bin/env node
// LAMP SLATE HEAT (2026-10-07, "5 goals" was not lit). The numbers below are TEST DATA, hand-written so
// the answers are known; they are not a night's real games.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-slateheat.mjs
import { heatOf, heatTier, dialInk, leagueHeat, HOT, COLD } from '../lib/nhl/slateHeat.js'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const T = { ice: 'ICE', text2: 'MID', text3: 'COLD' }

// three games, the top one 5.0 expected goals: it is the hottest and its dial is lit
const night = [5.0, 4.5, 4.4]
const lo = Math.min(...night); const hi = Math.max(...night)
check(heatOf(5.0, lo, hi) === 1, 'the 5.0-goal game is the top of the range (heat 1)')
check(heatTier(heatOf(5.0, lo, hi)) === 'hot', '5.0 reads hot')
check(dialInk(heatOf(5.0, lo, hi), T) === 'ICE', 'a hot dial wears the accent')
check(dialInk(heatOf(4.4, lo, hi), T) === 'COLD', 'the coldest dial is grey')
// a lone game: no range, so nothing is hot or cold (it used to read as the coldest game on the slate)
check(heatOf(5.0, 5.0, 5.0) === 0.5 && heatTier(0.5) === 'mid', 'one game, or all level: the middle, not cold')
check(heatOf(NaN, 1, 2) === 0, 'no number is 0')

// the selected card must not override the dial: LampSlate passes dial.col and SlateCard uses it before the accent
const slateCard = readFileSync(new URL('../components/slate/SlateCard.js', import.meta.url), 'utf8')
check(/col=\{c\.dial\.col \|\| col\}/.test(slateCard), 'SlateCard draws the dial in the card\'s own heat ink, selected or not')
const lampSlate = readFileSync(new URL('../components/lamp/LampSlate.js', import.meta.url), 'utf8')
check(/dial: \{[^}]*col: dialInk\(heat, C\)/.test(lampSlate), 'LampSlate hands every card its dial ink')

// THE LEAGUE'S SPREAD (2026-10-08, lamp-team-v1): heat from all games' totals, not tonight's range. TEST spread, hand-written.
const D = { p10: 5.8, p25: 5.95, p50: 6.1, p75: 6.3, p90: 6.4 }
check(leagueHeat(6.1, D) === 0.4, 'the league median reads 0.40 (mid)')
check(Math.abs(leagueHeat(5.95, D) - COLD) < 1e-9 && heatTier(leagueHeat(5.95, D)) === 'cold', 'the 25th percentile game is where cold starts')
check(Math.abs(leagueHeat(6.3, D) - HOT) < 1e-9 && heatTier(leagueHeat(6.3, D)) === 'hot', 'the 75th percentile game is where hot starts')
check(heatTier(leagueHeat(6.6, D)) === 'hot' && leagueHeat(7.5, D) === 1 && leagueHeat(5.0, D) === 0, 'above the 90th is the hottest, below the 10th the coldest')
check(heatTier(leagueHeat(6.5, D)) === 'hot' && dialInk(leagueHeat(6.5, D), T) === 'ICE', 'a lone hot game on a one-game slate IS lit (the league decides, not the night)')
check(heatTier(leagueHeat(5.85, D)) === 'cold', 'a lone cold game is cold, whatever else is on')
let mono = true; for (let v = 5.5; v < 7; v += 0.05) if (leagueHeat(v + 0.05, D) < leagueHeat(v, D)) mono = false
check(mono, 'heat never falls as the total rises')
check(leagueHeat(NaN, D) === null && leagueHeat(6, null) === null, 'no number or no spread: no heat')
check(/leagueHeat\(v, dist\)/.test(lampSlate) && !/xgOf|legs\?\.goalsPg/.test(lampSlate), 'LampSlate heats the dial from the league spread and no longer sums skaters')
check(/g\.proj\?\.total/.test(lampSlate) && /sideOf\(g, att\)/.test(lampSlate), 'LampSlate prints the board\'s own game.proj for the game and for each club')

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
