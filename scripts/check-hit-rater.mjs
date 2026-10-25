#!/usr/bin/env node
// THE HIT RATER CORE (lib/hitRater.js) -- offline checks. Every game row below is TEST DATA (made up, labelled TEST); no network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-hit-rater.mjs
import { hitCount, hitWindows, gameKeep, hitRaterRow, trending } from '../lib/hitRater.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

check(JSON.stringify(hitCount([20, 18.5, 17, null], 18.5)) === JSON.stringify({ ok: 1, n: 3, pct: 33 }), 'over is strictly above the line; a missing value is not a game')
check(hitCount([10, 12], 11, 'under').ok === 1, 'under counts below the line')

// TEST log, newest first: 12 games, points; home on even i; vs AAA on i % 4 === 0; minutes 20 on i >= 8
const games = Array.from({ length: 12 }, (_, i) => ({ date: `2026-11-${String(30 - i).padStart(2, '0')}`, opp: i % 4 === 0 ? 'AAA' : 'BBB', home: i % 2 === 0, min: i >= 8 ? 20 : 34, fga: i >= 8 ? 6 : 15, pts: i < 5 ? 25 : 15 }))
const stat = (g) => g.pts
const w = hitWindows(games, stat, 19.5, { next: { opp: 'AAA', home: true } })
check(w.L5.pct === 100 && w.L10.ok === 5 && w.Season.n === 12, 'L5 / L10 / Season count the newest N')
check(w.HA.n === 6 && w.H2H.n === 3, 'HM/AW = tonight\'s side only; H2H = tonight\'s club only')
const k = gameKeep({ minMin: 30 })
check(hitWindows(games, stat, 19.5, { keep: k }).Season.n === 8, 'a minutes filter drops his short games before counting')
check(gameKeep({}) === null, 'no filter picked = no predicate')

const lane = { key: 'pts', word: 'PTS', stat }
const row = hitRaterRow({ p: { sport: 'nba', id: '1', name: 'Test One', team: 'TST' }, lane, line: 19.5, games, next: { opp: 'AAA', home: true }, dvp: [22, 18, 25, 30, 10] })
check(row.own.L10.pct === 50 && row.dvp.L5.ok === 3 && row.avg === 19.2, 'a row: his windows, the DVP windows, his average')

const mk = (id, l10ok, sOk, n = 10) => ({ own: { L10: { ok: l10ok, n, pct: Math.round((100 * l10ok) / n) }, Season: { ok: sOk, n: 20, pct: Math.round((100 * sOk) / 20) } }, id })
const t = trending([mk('a', 6, 12), mk('b', 9, 10), mk('c', 9, 15), mk('thin', 3, 3, 3)])
check(t.map((r) => r.id).join(',') === 'c,b,a', 'trending: L10 % first, season % breaks the tie, thin rows left out')

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall hit rater checks ok')
