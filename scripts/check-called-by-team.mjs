#!/usr/bin/env node
// CALLED ACCURACY THIS WEEK AND BY CLUB (2026-10-12). TEST DATA only: every row below is made up ("TEST"), shaped to exercise
// the arithmetic; nothing real is read and nothing here is shown on the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-called-by-team.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { weekWindows, inWindow, accuracyOf, calledAccuracy, byTeamFrom, teamFigures, stripLines, figureLine, teamCells, normalizeCalls, CALLED_WORDS, CALLED_MIN_N, TEAM_THIN_N } from '../lib/record/byTeam.js'
import { LADDER_MIN_N } from '../lib/record/ladder.js'
import { NBA_MIN_NIGHTS } from '../lib/record/nbaFloor.js'
import { wilson } from '../lib/interval.js'
import { ALL_SPORT_KEYS } from '../lib/routes.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const row = (date, team, opp, result, extra = {}) => ({ date, team, opp, result, name: `TEST ${team} ${date}`, player_id: `${team}${date}`, week: null, ...extra })
const TODAY = '2026-10-12'   // a Monday; the 7-day week is Oct 6 to Oct 12, the one before is Sep 29 to Oct 5

ok('the floor is the ladder’s and the BUCKETS floor is the same constant', () => { assert.equal(CALLED_MIN_N, LADDER_MIN_N); assert.equal(NBA_MIN_NIGHTS, LADDER_MIN_N); assert.equal(CALLED_MIN_N, 30) })
ok('registry: every sport has its words and a week kind', () => { for (const s of ALL_SPORT_KEYS) assert.ok(CALLED_WORDS[s]?.what && CALLED_WORDS[s].weekKind, s); assert.equal(CALLED_WORDS.nfl.weekKind, 'nfl') })

ok('7-day window ends today and says its dates; the previous one is the 7 days before', () => {
  const w = weekWindows('mlb', { today: TODAY })
  assert.deepEqual([w.this.from, w.this.to, w.prev.from, w.prev.to], ['2026-10-06', '2026-10-12', '2026-09-29', '2026-10-05'])
  assert.equal(w.this.label, 'Oct 6 to Oct 12')
})
ok('a row is assigned by its OWN date: the edges are in, the day after is out, the clock is not read', () => {
  const w = weekWindows('nhl', { today: TODAY })
  assert.ok(inWindow(row('2026-10-06', 'A', 'B', 'hit'), w.this, w.kind))
  assert.ok(inWindow(row('2026-10-12', 'A', 'B', 'hit'), w.this, w.kind))
  assert.ok(!inWindow(row('2026-10-05', 'A', 'B', 'hit'), w.this, w.kind))
  assert.ok(inWindow(row('2026-10-05', 'A', 'B', 'hit'), w.prev, w.kind))
  assert.ok(!inWindow(row('2026-10-13', 'A', 'B', 'hit'), w.this, w.kind))
  assert.ok(!inWindow({ result: 'hit' }, w.this, w.kind), 'no date, no week')
})
ok('NFL: the week is the NFL week by the row’s `week`, not by a date', () => {
  const w = weekWindows('nfl', { today: TODAY, nflWeek: 5 })
  assert.equal(w.this.label, 'NFL week 5'); assert.equal(w.prev.week, 4)
  assert.ok(inWindow({ week: 5, date: '2020-01-01' }, w.this, 'nfl'))
  assert.ok(!inWindow({ week: 4 }, w.this, 'nfl'))
  assert.equal(weekWindows('nfl', { nflWeek: 1 }).prev, null)
  assert.equal(weekWindows('nfl', {}).this, null)
})

ok('void and ungraded rows are in no n; a miss and a hit are; the range is Wilson over the settled rows', () => {
  const a = accuracyOf([row('d', 'A', 'B', 'hit'), row('d', 'A', 'B', 'miss'), row('d', 'A', 'B', 'void'), row('d', 'A', 'B', null)], 0)
  assert.deepEqual([a.n, a.hits, a.void, a.rate], [2, 1, 1, 50])
  assert.deepEqual(a.ci, wilson(1, 2))
  assert.equal(accuracyOf([]).ci, null)
})
ok('under the floor: tracking, counts only; at the floor: a rate', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => row('2026-10-10', 'A', 'B', i % 2 ? 'hit' : 'miss'))
  assert.equal(accuracyOf(make(29)).tracking, true)
  assert.equal(accuracyOf(make(30)).tracking, false)
  const under = figureLine('This week', { ...accuracyOf(make(10)), label: 'Oct 6 to Oct 12' })
  assert.match(under, /5 of 10 called cleared/); assert.match(under, /tracking/); assert.ok(!/%/.test(under.replace('30 graded', '')), under)
  const over = figureLine('This week', { ...accuracyOf(make(40)), label: 'Oct 6 to Oct 12' })
  assert.match(over, /20 of 40 called cleared · 50\.0%, 95% range \d+–\d+% \(n=40\)/)
})
ok('a week with no graded calls says so in words, and notes who did not play', () => {
  assert.match(figureLine('This week', { ...accuracyOf([]), label: 'Oct 6 to Oct 12' }), /no called picks graded in this window/)
  assert.match(figureLine('This week', { ...accuracyOf([row('d', 'A', 'B', 'void')]), label: 'x' }), /1 did not play, not counted/)
})

const CALLS = [
  row('2026-10-12', 'WSH', 'NYY', 'hit'), row('2026-10-11', 'WAS', 'NYY', 'miss'), row('2026-10-07', 'NYY', 'WSH', 'hit'),
  row('2026-10-03', 'NYY', 'BOS', 'miss'), row('2026-10-03', 'NYY', 'BOS', 'void'), row('2026-09-20', 'BOS', 'NYY', 'hit'),
  row('2026-10-09', 'LAD', null, 'hit'), row('2026-10-09', null, 'LAD', 'miss'),
]
ok('the strip: this week, last week and the season are counts of the rows by their own date', () => {
  const a = calledAccuracy(CALLS, 'mlb', { today: TODAY })
  assert.deepEqual([a.thisWeek.n, a.thisWeek.hits], [5, 3])   // 10-12 hit, 10-11 miss, 10-07 hit, 10-09 hit, 10-09 miss (no club stored: still a graded call)
  assert.deepEqual([a.prevWeek.n, a.prevWeek.hits], [1, 0])   // 10-03 NYY miss; its void is out
  assert.deepEqual([a.season.n, a.season.hits, a.season.void], [7, 4, 1])
})
ok('club table: clubs are canonical (WSH = WAS), voids are not in n, sorted by calls then code, no rate ordering', () => {
  const t = byTeamFrom(CALLS, 'mlb', { today: TODAY })
  const by = Object.fromEntries(t.rows.map((r) => [r.team, r]))
  assert.deepEqual([by.WSH.n, by.WSH.hits], [2, 1], 'WSH and WAS are one club')
  assert.deepEqual([by.NYY.n, by.NYY.hits, by.NYY.dnp], [2, 1, 1])
  assert.deepEqual(t.rows.map((r) => r.team), ['NYY', 'WSH', 'BOS', 'LAD'])
  assert.equal(t.noClub, 1, 'a settled call with no club stored is counted aloud and left out')
  assert.equal(by.WSH.thin, true); assert.equal(teamCells(by.WSH).thin, 'n=2')
  assert.deepEqual(by.WSH.week, { n: 2, hits: 1 })
  assert.deepEqual(by.BOS.week, { n: 0, hits: 0 }); assert.equal(teamCells(by.BOS).week, '—')
})
ok('the club the called player FACED is the same arithmetic on the other key', () => {
  const t = byTeamFrom(CALLS, 'mlb', { today: TODAY }, { by: 'opp' })
  const by = Object.fromEntries(t.rows.map((r) => [r.team, r]))
  assert.deepEqual([by.NYY.n, by.NYY.hits], [3, 2])   // faced by WSH hit, WAS miss, BOS hit
  assert.equal(t.noClub, 1)
})
ok('last 10 is the ten most recent settled calls', () => {
  const many = Array.from({ length: 14 }, (_, i) => row(`2026-09-${String(10 + i).padStart(2, '0')}`, 'TST', 'XXX', i < 4 ? 'hit' : 'miss'))
  const r = byTeamFrom(many, 'mlb', { today: TODAY }).rows[0]
  assert.deepEqual(r.last10, { n: 10, hits: 0 }, 'the four hits are the four oldest, so the newest ten are all misses')
  assert.deepEqual([r.n, r.hits], [14, 4])
})
ok('team grouping uses the club stored on the call at game time, never today’s', () => {
  const traded = [row('2026-09-01', 'AAA', 'ZZZ', 'hit', { player_id: 'p1' }), row('2026-10-08', 'BBB', 'ZZZ', 'miss', { player_id: 'p1' })]
  const t = byTeamFrom(traded, 'mlb', { today: TODAY })
  assert.deepEqual(t.rows.map((r) => [r.team, r.n, r.hits]).sort(), [['AAA', 1, 1], ['BBB', 1, 0]])
})
ok('NFL week vs 7-day week: the NFL strip reads weeks, the others read days', () => {
  const nfl = [row(null, 'KC', 'LV', 'hit', { week: 5 }), row(null, 'KC', 'LV', 'miss', { week: 5 }), row(null, 'LA', 'SF', 'hit', { week: 4 }), row(null, 'WSH', 'SF', 'hit', { week: 3 })]
  const a = calledAccuracy(nfl, 'nfl', { today: TODAY, nflWeek: 5 })
  assert.deepEqual([a.thisWeek.n, a.thisWeek.hits, a.prevWeek.n, a.season.n], [2, 1, 1, 4])
  assert.equal(a.thisWeek.label, 'NFL week 5')
  assert.ok(byTeamFrom(nfl, 'nfl', { today: TODAY, nflWeek: 5 }).rows.some((r) => r.team === 'WAS'), 'WSH reads as WAS for football')
})
ok('team pages: teamFigures is the same arithmetic as the club table, with no floor (its own n is on it)', () => {
  const f = teamFigures(CALLS, 'mlb', 'WAS', { today: TODAY })
  assert.deepEqual([f.season.n, f.season.hits, f.thisWeek.n], [2, 1, 2]); assert.equal(f.season.tracking, false)
  const t = byTeamFrom(CALLS, 'mlb', { today: TODAY }).rows.find((r) => r.team === 'WSH')
  assert.deepEqual([t.n, t.hits], [f.season.n, f.season.hits])
})
ok('empty input: no rows, no throw, an empty week', () => {
  const a = calledAccuracy([], 'nhl', { today: TODAY })
  assert.equal(a.season.n, 0); assert.equal(a.thisWeek.n, 0)
  assert.equal(byTeamFrom([], 'nhl', { today: TODAY }).rows.length, 0)
  assert.ok(stripLines(a).length >= 2)
})
ok('neutral words: no printed probability, no due/lock/guarantee wording anywhere the module prints', () => {
  const text = [...stripLines(calledAccuracy(CALLS, 'mlb', { today: TODAY })).map((l) => l.text), figureLine('This week', accuracyOf(CALLS, 0))].join(' ')
  assert.ok(!/\b(due|lock of|guarantee|probab|chance|hot|cold|best|worst)\b/i.test(text), text)
  const src = readFileSync(new URL('../lib/record/byTeam.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.ok(!/sport\s*===?\s*['"](mlb|nfl|nhl|nba)['"]/.test(src), 'no sport ternary')
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(src), 'no hex')
})
ok('the thin threshold is stated once', () => { assert.equal(TEAM_THIN_N, 10) })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall green')
