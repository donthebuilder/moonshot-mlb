// Deterministic test of the Splits tab's season-window aggregation (lib/splitWindow.js).
// TEST DATA ONLY: the numbers below are made up for the arithmetic and stand for no player.
//   node --import ./scripts/_esm-resolve.mjs scripts/test-split-window.mjs
import assert from 'node:assert/strict'
import {
  defaultWindow, countsFromStat, combineLive, rowFromCounts, sumCounts, tablesFromGames, gameFromFlat, offeredWindows,
} from '../lib/splitWindow.js'

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`)

// two seasons of ONE situation (TEST): different at-bats, so averaging the rates would be wrong
const y1 = { gamesPlayed: 50, plateAppearances: 220, atBats: 200, hits: 60, homeRuns: 10, doubles: 10, triples: 1, baseOnBalls: 15, hitByPitch: 3, sacFlies: 2, strikeOuts: 50, rbi: 30, totalBases: 103 }
const y2 = { gamesPlayed: 30, plateAppearances: 110, atBats: 100, hits: 40, homeRuns: 6, doubles: 5, triples: 0, baseOnBalls: 8, hitByPitch: 1, sacFlies: 1, strikeOuts: 20, rbi: 20, totalBases: 63 }
const rows = combineLive([
  [{ code: 'vl', split: 'vs LHP', counts: countsFromStat(y1) }, { code: 'only1', split: 'x', counts: countsFromStat(y1) }],
  [{ code: 'vl', split: 'vs LHP', counts: countsFromStat(y2) }],
])
const vl = rows.find((r) => r.code === 'vl')
assert.equal(vl.g, 80); assert.equal(vl.pa, 330); assert.equal(vl.h, 100); assert.equal(vl.hr, 16)
near(vl.avg, 100 / 300, 'AVG is summed H / summed AB')
assert.notEqual(Math.round(vl.avg * 1e6), Math.round(((60 / 200 + 40 / 100) / 2) * 1e6), 'not the mean of the two AVGs')
near(vl.obp, (100 + 23 + 4) / (300 + 23 + 4 + 3), 'OBP counts HBP in the numerator and SF in the denominator')
near(vl.slg, 166 / 300, 'SLG = TB / AB'); near(vl.ops, vl.obp + vl.slg, 'OPS'); near(vl.iso, vl.slg - vl.avg, 'ISO')
near(vl.hrPa, 100 * 16 / 330, 'HR/PA%'); near(vl.kPct, 100 * 70 / 330, 'K%'); near(vl.bbPct, 100 * 23 / 330, 'BB%')
assert.equal(vl.xbh, 15 + 1 + 16, 'XBH = 2B + 3B + HR, summed')
const only1 = rows.find((r) => r.code === 'only1')
near(only1.avg, 60 / 200, 'a situation present in one season only is that season alone')
assert.equal(only1.g, 50)

// the single-season row from counts matches the league's own rate for the same counts (TEST: 60/200 = .300)
near(rowFromCounts('k', 'k', countsFromStat(y1)).avg, 0.3, 'one season: H / AB')

// the home/away, win/loss, day-of-week tables rebuilt from a game log (TEST rows, 4 games)
const flat = [
  { date: '2025-04-07', home: true, win: true, pa: 4, ab: 4, h: 2, hr: 1, d2: 0, d3: 0, bb: 0, k: 1, rbi: 2, r: 1, tb: 5, hbp: 0, sf: 0 }, // Mon
  { date: '2025-04-08', home: true, win: false, pa: 5, ab: 4, h: 0, hr: 0, d2: 0, d3: 0, bb: 1, k: 2, rbi: 0, r: 0, tb: 0, hbp: 0, sf: 0 }, // Tue
  { date: '2025-04-12', home: false, win: true, pa: 4, ab: 3, h: 1, hr: 0, d2: 1, d3: 0, bb: 0, k: 0, rbi: 1, r: 1, tb: 2, hbp: 1, sf: 0 }, // Sat
  { date: '2025-04-13', home: false, win: null, pa: 4, ab: 4, h: 1, hr: 0, d2: 0, d3: 0, bb: 0, k: 1, rbi: 0, r: 0, tb: 1, hbp: 0, sf: 0 }, // Sun
]
const games = flat.map(gameFromFlat)
assert.deepEqual(games.map((g) => g.dow), ['Mon', 'Tue', 'Sat', 'Sun'], 'weekday from the game\'s own date, not a clock')
assert.ok(games.every((g) => g.dn === null), 'day/night is never rebuilt')
const t = tablesFromGames(games)
assert.deepEqual(t.home_away.map((r) => r.split), ['Home', 'Away'])
const home = t.home_away[0]; assert.equal(home.g, 2); assert.equal(home.pa, 9); assert.equal(home.h, 2)
near(home.avg, 2 / 8, 'home AVG')
const away = t.home_away[1]; near(away.obp, (2 + 0 + 1) / (7 + 0 + 1 + 0), 'away OBP includes the HBP')
assert.deepEqual(t.win_loss.map((r) => r.split), ['Win', 'Loss'], 'a game with no result is in neither bucket')
assert.equal(t.win_loss[0].g + t.win_loss[1].g, 3)
assert.deepEqual(t.day_of_week.map((r) => r.split), ['Mon', 'Tue', 'Sat', 'Sun'], 'calendar order, empty days left out')
assert.equal(sumCounts([]).pa, 0)

// the default window: THIS SEASON unless under 100 PA this season AND last season is on offer
assert.equal(defaultWindow({ thisPa: 99, lastAvailable: true }), 'both')
assert.equal(defaultWindow({ thisPa: 100, lastAvailable: true }), 'this')
assert.equal(defaultWindow({ thisPa: 618, lastAvailable: true }), 'this')
assert.equal(defaultWindow({ thisPa: 40, lastAvailable: false }), 'this', 'no last season, nothing to widen to')
assert.equal(defaultWindow({ thisPa: null, lastAvailable: true }), 'this', 'unknown PA is not thin')
assert.equal(offeredWindows({ lastAvailable: false }).length, 0, 'no toggle without last-season data')
assert.equal(offeredWindows({ lastAvailable: true }).length, 3)

console.log('OK: split-window aggregation (summed counts, recomputed rates) on TEST data')
