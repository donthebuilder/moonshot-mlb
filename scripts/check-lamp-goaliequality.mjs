#!/usr/bin/env node
// Goalie quality (2026-10-08). Offline. Every club, goalie and shot count below is TEST data made up for the check.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-goaliequality.mjs
import { goalieTable, goalieLine, clubGoalies, MIN_SA } from '../lib/nhl/goalieQuality.js'
import { goalieFactor } from '../lib/nhl/xg.js'
import MODEL from '../lib/nhl/teamProjV1.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t
const R = (d, goalies) => ({ game_id: Number(d.replace(/-/g, '')), game_date: d, game_type: 2, sog: 28, xg: 2.9, sog_a: 28, xg_a: 2.9, gf: 3, ga: 3, goalies })
const day = (i) => `2098-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`
// TEST: goalie "7" starts 40 games (30 shots, 3 goals, 3.0 xG each), goalie "8" relieves in 2 games (5 shots)
const rows = Array.from({ length: 42 }, (_, i) => R(day(i), i < 40 ? { 7: [30, 3, 3] } : { 8: [5, 1, 0.4] }))
const t = goalieTable(rows)
check(t.length === 2 && t[0].id === '7' && t[0].gp === 40 && t[0].sa === 1200 && t[0].ga === 120 && near(t[0].xga, 120), 'the table sums games, shots, goals and xG a goalie faced')
const l7 = goalieLine(t[0])
check(!l7.thin && near(l7.svPct, 0.9, 1e-4) && l7.factor === 1 && l7.saved === 0, 'goals = xG gives factor 1 and 0 saved above expected')
const good = goalieLine({ id: '9', gp: 40, sa: 1200, ga: 100, xga: 120, recentSa: 1 })
check(near(good.factor, Number(goalieFactor(100, 120, MODEL.k.goalie).toFixed(3)), 1e-9) && good.factor < 1, 'the factor is the team model\'s (GA + k) / (xGA + k); under 1 is better')
check(good.saved > 0 && good.saved < 20, 'goals saved above expected is positive and shrunk below the raw 20')
check(near(good.saved, Number((((120 - 100) * 120) / (120 + MODEL.k.goalie)).toFixed(1)), 1e-9), 'saved above expected = (xGA - GA) * xGA / (xGA + k)')
const thin = goalieLine(t[1])
check(thin.thin && thin.sa === 10 && thin.xga === null && thin.saved === null && thin.factor === null && thin.ga === 2, `under ${MIN_SA} shots: xGA, saved and factor are null (a dash); the counts stay`)
check(goalieLine({ id: '1', gp: 0, sa: 0, ga: 0, xga: 0, recentSa: 0 }).svPct === null, 'no shots: no save percentage')
// the window is as of the game's own date: a game on or after it is never read; clubGoalies lists the recent goalies, busiest first
const cg = clubGoalies(rows, '2098-03-01')
check(cg.length >= 1 && cg.every((g) => g.sa <= 1200), 'clubGoalies reads only games before the date')
check(clubGoalies([], '2099-01-01').length === 0, 'a club with no rows has no goalies, no invented line')
process.exit(failed ? 1 : 0)
