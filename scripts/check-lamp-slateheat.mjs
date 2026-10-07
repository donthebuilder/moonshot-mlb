#!/usr/bin/env node
// LAMP SLATE HEAT (2026-10-07, "5 goals" was not lit). The numbers below are TEST DATA, hand-written so
// the answers are known; they are not a night's real games.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-slateheat.mjs
import { heatOf, heatTier, dialInk } from '../lib/nhl/slateHeat.js'
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

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
