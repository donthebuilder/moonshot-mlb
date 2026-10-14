#!/usr/bin/env node
// HEAD TO HEAD (2026-10-13, lib/h2h). TEST data only: every club code, score and date below is made up ("TEST") and exists to
// prove the arithmetic, the sample guard, the feed reducers on tiny hand-built samples, the rivalry list and the wording.
// Nothing real is read. (The live feeds were probed by hand; see the commit message.)
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-h2h.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeGame, meetings, summarize, recordText, bySeason, vsEveryone, seasonsFor, sideOf } from '../lib/h2h/core.js'
import { RIVALRIES, rivalryOf, MIN_MEETINGS, SPORT_RULES } from '../lib/h2h/config.js'
import { reduceMlb, reduceNhl, reduceEspn, nflCodeOf } from '../lib/h2h/feeds.js'
import { pairSection, clubSection } from '../lib/h2h/view.js'
import { neutralProblems, viewStrings } from '../lib/team/contract.js'
import { teamKey, isKnownTeam } from '../lib/mlbTeams.js'
import { NFL_TEAMS } from '../lib/nfl/teams.js'
import { NHL_TEAMS } from '../lib/nhl/teams.js'
import { NBA_TEAMS } from '../lib/nba/teams.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// TEST games: AAA vs BBB, three seasons. g(id, seasonKey, date, home, away, hs, as, ot?, type?)
const g = (id, k, date, home, away, hs, as, ot = null, type = 'R') => ({ id, season: String(k), seasonKey: k, date, type, home, away, hs, as, ot })
const GAMES = [
  g('t1', 2026, '2026-04-01', 'AAA', 'BBB', 5, 3), g('t2', 2026, '2026-04-02', 'AAA', 'BBB', 2, 4), g('t3', 2026, '2026-04-03', 'BBB', 'AAA', 1, 7),
  g('t4', 2025, '2025-05-01', 'BBB', 'AAA', 2, 3, 'OT'), g('t5', 2025, '2025-06-01', 'AAA', 'BBB', 2, 3, 'SO'),
  g('t6', 2024, '2024-06-01', 'AAA', 'BBB', 3, 3),                         // a tie (NFL-style)
  g('x1', 2026, '2026-04-09', 'AAA', 'CCC', 9, 0),                         // another opponent
  { id: 'bad', season: '2026', seasonKey: 2026, date: '2026-04-10', type: 'R', home: 'AAA', away: 'BBB', hs: null, as: null },   // unplayed: never a meeting
]

ok('a game with no final score is not a game', () => { assert.equal(makeGame(GAMES[GAMES.length - 1]), null); assert.equal(makeGame({ home: 'AAA', away: 'AAA', hs: 1, as: 0 }), null) })
ok('meetings: only the pair, newest first, a duplicate id counts once', () => {
  const m = meetings([...GAMES, GAMES[0]], 'AAA', 'BBB')
  assert.equal(m.length, 6); assert.deepEqual(m.map((x) => x.id), ['t3', 't2', 't1', 't5', 't4', 't6'])
  assert.equal(meetings(GAMES, 'BBB', 'AAA').length, 6)   // order of the two codes does not matter
})
ok('sideOf: scores, margin and result from either side', () => {
  const s = sideOf(GAMES[0], 'BBB'); assert.deepEqual([s.for, s.against, s.margin, s.result, s.home], [3, 5, -2, 'L', false])
  assert.equal(sideOf(GAMES[0], 'ZZZ'), null)
})
ok('summarize (MLB-style): record, win %, averages once there are three meetings', () => {
  const s = summarize(meetings(GAMES.slice(0, 3), 'AAA', 'BBB'), 'AAA', 'mlb')
  assert.deepEqual([s.gp, s.w, s.l, s.t], [3, 2, 1, 0]); assert.equal(s.winPct, 0.667)
  assert.equal(s.avgFor, 4.7); assert.equal(s.avgAgainst, 2.7); assert.equal(s.avgMargin, 2); assert.equal(s.avgTotal, 7.3)
  assert.equal(recordText(s, 'mlb'), '2-1')
})
ok('SAMPLE GUARD: under three meetings no average is printed (null), the record still is', () => {
  assert.equal(MIN_MEETINGS, 3)
  const s = summarize(meetings(GAMES.slice(3, 5), 'AAA', 'BBB'), 'AAA', 'nhl')
  assert.equal(s.gp, 2); assert.equal(s.enough, false)
  for (const k of ['avgFor', 'avgAgainst', 'avgMargin', 'avgTotal']) assert.equal(s[k], null, k)
  assert.equal(recordText(s, 'nhl'), '1-0-1')
})
ok('NHL: a loss after 60 minutes is an overtime loss, not a plain loss; the other sports have no such column', () => {
  const m = meetings(GAMES.slice(3, 5), 'AAA', 'BBB')
  const h = summarize(m, 'AAA', 'nhl'); assert.deepEqual([h.w, h.l, h.otl], [1, 0, 1])
  const b = summarize(m, 'BBB', 'nhl'); assert.deepEqual([b.w, b.l, b.otl], [1, 0, 1])
  const mlb = summarize(m, 'AAA', 'mlb'); assert.deepEqual([mlb.w, mlb.l, mlb.otl], [1, 1, 0])
})
ok('NFL: a tie is a tie, counts half a win, and prints as the third number', () => {
  const s = summarize(meetings(GAMES.filter((x) => x.id === 't6'), 'AAA', 'BBB'), 'AAA', 'nfl')
  assert.deepEqual([s.w, s.l, s.t], [0, 0, 1]); assert.equal(s.winPct, 0.5); assert.equal(recordText(s, 'nfl'), '0-0-1')
})
ok('bySeason: one row per season that has a meeting, newest first, plus a Total; no made-up 0-0 season', () => {
  const r = bySeason(GAMES, 'AAA', 'BBB', 'mlb')
  assert.deepEqual(r.rows.map((x) => x.key), ['2026', '2025', '2024']); assert.equal(r.all.label, 'Total'); assert.equal(r.all.gp, 6)
  assert.equal(bySeason([], 'AAA', 'BBB', 'mlb').all, null)
  assert.equal(bySeason(GAMES.filter((x) => x.seasonKey === 2026), 'AAA', 'BBB', 'mlb').rows.length, 1)
})
ok('vsEveryone: one row per opponent from the club\'s own games', () => {
  const v = vsEveryone(GAMES, 'AAA', 'mlb'); assert.deepEqual(v.map((x) => x.opp), ['BBB', 'CCC']); assert.equal(v[1].gp, 1); assert.equal(v[1].avgMargin, null)
})
ok('seasonsFor: the season each sport is in on a date, three back', () => {
  assert.deepEqual(seasonsFor('mlb', '2026-10-13').map((s) => s.label), ['2026', '2025', '2024'])
  assert.deepEqual(seasonsFor('nfl', '2027-01-20').map((s) => s.label), ['2026', '2025', '2024'])
  assert.deepEqual(seasonsFor('nhl', '2026-10-13').map((s) => [s.label, s.feed]), [['2026-27', '20262027'], ['2025-26', '20252026'], ['2024-25', '20242025']])
  assert.deepEqual(seasonsFor('nhl', '2027-03-01').map((s) => s.label)[0], '2026-27')
  assert.deepEqual(seasonsFor('nba', '2026-10-13').map((s) => [s.label, s.feed]), [['2026-27', 2027], ['2025-26', 2026], ['2024-25', 2025]])
})

// ── the feed reducers, on tiny TEST samples shaped like each feed ───────────────────────────────────────────────
const S = { label: '2025-26', key: 2025 }
ok('MLB reducer: finals only, playoffs flagged, the club code from the id map', () => {
  const j = { dates: [{ games: [
    { gamePk: 1, gameType: 'R', officialDate: '2025-05-01', status: { abstractGameState: 'Final' }, teams: { home: { team: { id: 1 }, score: 4 }, away: { team: { id: 2 }, score: 2 } } },
    { gamePk: 2, gameType: 'D', officialDate: '2025-10-01', status: { abstractGameState: 'Final' }, teams: { home: { team: { id: 2 }, score: 1 }, away: { team: { id: 1 }, score: 0 } } },
    { gamePk: 3, gameType: 'R', officialDate: '2025-10-05', status: { abstractGameState: 'Preview' }, teams: { home: { team: { id: 1 } }, away: { team: { id: 2 } } } },
  ] }] }
  const r = reduceMlb(j, S, (id) => ({ 1: 'AAA', 2: 'BBB' }[id])); assert.deepEqual(r.map((x) => [x.id, x.type, x.home, x.hs]), [['1', 'R', 'AAA', 4], ['2', 'P', 'BBB', 1]])
})
ok('NHL reducer: regular season and playoffs only, finals only, OT/SO kept', () => {
  const t = (abbrev, score) => ({ abbrev, score })
  const j = { games: [
    { id: 1, gameType: 1, gameState: 'OFF', gameDate: '2025-09-25', homeTeam: t('AAA', 2), awayTeam: t('BBB', 1) },
    { id: 2, gameType: 2, gameState: 'OFF', gameDate: '2025-11-01', homeTeam: t('AAA', 3), awayTeam: t('BBB', 4), gameOutcome: { lastPeriodType: 'SO' } },
    { id: 3, gameType: 3, gameState: 'FINAL', gameDate: '2026-05-01', homeTeam: t('BBB', 1), awayTeam: t('AAA', 0), gameOutcome: { lastPeriodType: 'REG' } },
    { id: 4, gameType: 2, gameState: 'FUT', gameDate: '2026-12-01', homeTeam: t('AAA'), awayTeam: t('BBB') },
  ] }
  const r = reduceNhl(j, S); assert.deepEqual(r.map((x) => [x.id, x.type, x.ot]), [['2', 'R', 'SO'], ['3', 'P', null]])
})
ok('ESPN reducer (NFL / NBA): finals only, the Commissioner\'s Cup final and preseason left out, WSH/LAR mapped', () => {
  const ev = (id, st, state, ab, a, b, cc = null) => ({ id, date: '2025-12-01T00:00Z', seasonType: { type: st }, competitions: [{ type: cc ? { abbreviation: cc } : { abbreviation: 'STD' }, status: { type: { state } },
    competitors: [{ homeAway: 'home', team: { abbreviation: a, id: '1' }, score: { value: 20 } }, { homeAway: 'away', team: { abbreviation: b, id: '2' }, score: '17' }] }] })
  const j = { events: [ev('1', 2, 'post', 0, 'WSH', 'LAR'), ev('2', 1, 'post', 0, 'WSH', 'LAR'), ev('3', 2, 'pre', 0, 'WSH', 'LAR'), ev('4', 2, 'post', 0, 'WSH', 'LAR', 'CC'), ev('5', 3, 'post', 0, 'WSH', 'LAR')] }
  const r = reduceEspn(j, S, nflCodeOf); assert.deepEqual(r.map((x) => [x.id, x.type, x.home, x.away, x.hs, x.as]), [['1', 'R', 'WAS', 'LA', 20, 17], ['5', 'P', 'WAS', 'LA', 20, 17]])
})

// ── the rivalry list: explicit, real-club codes only ────────────────────────────────────────────────────────────
ok('every rivalry names two real, different clubs of its own sport, once', () => {
  const codes = { mlb: (c) => isKnownTeam(teamKey(c)) && teamKey(c) === c, nfl: (c) => NFL_TEAMS.some((t) => t[0] === c), nhl: (c) => NHL_TEAMS.some((t) => t[0] === c), nba: (c) => NBA_TEAMS.some((t) => t[0] === c) }
  for (const [sport, list] of Object.entries(RIVALRIES)) {
    const seen = new Set()
    for (const r of list) {
      assert.ok(codes[sport](r.a) && codes[sport](r.b), `${sport}: ${r.a}-${r.b} is not two clubs`); assert.notEqual(r.a, r.b)
      const k = [r.a, r.b].sort().join('-'); assert.ok(!seen.has(k), `${sport}: ${k} listed twice`); seen.add(k)
    }
  }
  assert.deepEqual(Object.keys(RIVALRIES).sort(), Object.keys(SPORT_RULES).sort())
})
ok('rivalryOf: either order, a named series says its name, no list entry = no tag', () => {
  assert.equal(rivalryOf('mlb', 'NYM', 'NYY').tag, 'Subway Series'); assert.equal(rivalryOf('mlb', 'NYY', 'BOS').tag, 'RIVALS')
  assert.equal(rivalryOf('mlb', 'NYY', 'SEA'), null); assert.equal(rivalryOf('nhl', 'TOR', 'TOR'), null); assert.equal(rivalryOf('nfl', 'WAS', 'DAL').tag, 'RIVALS')
})

// ── the sections ────────────────────────────────────────────────────────────────────────────────────────────────
const payload = { sport: 'mlb', mode: 'pair', a: 'AAA', b: 'BBB', seasons: [{ label: '2026', key: 2026, ok: true, n: 3 }, { label: '2025', key: 2025, ok: false, n: 0 }], games: GAMES }
ok('pair section: tables lead, every column grouped, the thin row says not enough yet, a feed that missed a season is named', () => {
  const s = pairSection(payload, { open: false })
  assert.equal(s.state, 'ok'); assert.equal(s.blocks[0].type, 'table'); assert.equal(s.blocks[0].rows[s.blocks[0].rows.length - 1].label, 'Total')
  for (const b of s.blocks.filter((x) => x.type === 'table')) for (const c of b.columns) assert.ok(c.group, `${b.id}/${c.key}: no group`)
  const text = viewStrings(s).join(' | ')
  assert.match(text, /Not enough yet/); assert.match(text, /did not answer for 2025/)
  const thin = s.blocks[0].rows.find((r) => r.label === '2025'); assert.equal(thin.avgMargin, null)
})
ok('pair section: the rivalry tag rides the section; no meetings = a named empty state, not a zero row', () => {
  assert.equal(pairSection({ ...payload, a: 'NYY', b: 'BOS', games: [] }).state, 'empty')
  const s = pairSection({ ...payload, a: 'NYY', b: 'BOS', games: GAMES.map((x) => ({ ...x, home: x.home === 'AAA' ? 'NYY' : x.home === 'BBB' ? 'BOS' : x.home, away: x.away === 'AAA' ? 'NYY' : x.away === 'BBB' ? 'BOS' : x.away })) })
  assert.equal(s.rivalry, 'RIVALS')
})
ok('MARGIN, NEVER SPREAD: nothing claims who covered, and the page says there is no stored spread', () => {
  const s = pairSection(payload); const c = clubSection({ sport: 'mlb', mode: 'club', a: 'AAA', seasons: [{ label: '2026', key: 2026, ok: true, n: 7 }], stale: false, games: GAMES })
  for (const v of [s, c]) {
    const text = viewStrings(v).join(' | ')
    assert.match(text, /not a betting spread/); assert.doesNotMatch(text, /\bcover(s|ed)?\b.*\b(won|beat|hit)\b/i); assert.doesNotMatch(text, /ATS|against the spread/i)
    for (const col of v.blocks.filter((b) => b.type === 'table').flatMap((b) => b.columns)) assert.doesNotMatch(String(col.label), /spread/i, `column ${col.key}`)
  }
})
ok('club section: rivals first; neutral wording; an empty feed is a named empty state', () => {
  const c = clubSection({ sport: 'nba', mode: 'club', a: 'LAL', seasons: [{ label: '2025-26', key: 2025, ok: true, n: 2 }], stale: true, games: [g('a', 2025, '2025-11-01', 'LAL', 'GS', 100, 90), g('b', 2025, '2025-11-02', 'LAL', 'MEM', 100, 90)] })
  assert.deepEqual(c.blocks[0].rows.map((r) => r.opp), ['GS', 'MEM']); assert.match(c.window, /LAST SEASON/)
  assert.deepEqual(neutralProblems(viewStrings(c)), []); assert.deepEqual(neutralProblems(viewStrings(pairSection(payload))), [])
  assert.equal(clubSection({ sport: 'nba', mode: 'club', a: 'LAL', seasons: [{ label: '2025-26', key: 2025, ok: false, n: 0 }], games: [] }).state, 'empty')
})

// ── the wiring ──────────────────────────────────────────────────────────────────────────────────────────────────
ok('the route gates BUCKETS (nba) before it reads, and reads nothing for a bad code', () => {
  const r = read('app/api/h2h/route.js')
  assert.ok(r.indexOf('bucketsGuard()') > 0 && r.indexOf("sport === 'nba'") > 0 && r.indexOf('bucketsGuard()') < r.indexOf('readPair('))
  assert.match(r, /private, max-age=60/)
})
ok('each product mounts it: the game page and the team page', () => {
  for (const [f, t] of [['components/tabs/Games.js', '<MlbH2H'], ['components/nfl/NflSlate.js', '<NflH2H'], ['components/lamp/LampSlate.js', '<NhlH2H'], ['components/lamp/tabs/Game.js', '<NhlH2H'], ['components/buckets/tabs/Game.js', '<NbaH2H']]) assert.ok(read(f).includes(t), `${f}: ${t}`)
  for (const f of ['components/tabs/Team.js', 'components/nfl/tabs/Team.js', 'components/lamp/tabs/Team.js', 'components/buckets/tabs/Team.js']) assert.ok(read(f).includes('<HeadToHead'), f)
  for (const sp of ['mlb', 'nfl', 'nhl', 'nba']) assert.ok(read(`lib/team/${sp}.js`).includes('h2hTeamSection(SPORT'), sp)
})
ok('nothing in the MLB / NFL / NHL bundle imports the BUCKETS binding', () => {
  for (const f of ['components/tabs/Games.js', 'components/nfl/NflSlate.js', 'components/lamp/LampSlate.js', 'components/lamp/tabs/Game.js', 'components/tabs/Team.js', 'components/nfl/tabs/Team.js', 'components/lamp/tabs/Team.js']) assert.ok(!read(f).includes('NbaH2H'), f)
})

if (fail) { console.log(`\n${fail} FAILED`); process.exit(1) }
console.log('\nall head-to-head checks passed')
