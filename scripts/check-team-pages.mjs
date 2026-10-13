#!/usr/bin/env node
// THE TEAM PAGES (2026-10-10). TEST data only: every club, number, name and game below is made up ("TEST ...") and
// exists to prove the contract (lib/team/*) -- nothing real is read and nothing here reaches the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-team-pages.mjs
// Holds: the section registry per sport; every club in the registry builds with the real files ABSENT (an honest empty
// state per section, a header with a name and a logo); the sections fill from a TEST payload and carry their season and
// sample; ranks and the Wilson range; our-calls counts against lib/callStatus; the board's words pass through;
// neutral wording (no due / owed); the section rides the address; no probability is printed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NHL_TEAMS } from '../lib/nhl/teams.js'
import { TEAM_SECTIONS, sectionsOf, firstSection, resolveSection } from '../lib/team/registry.js'
import { leagueRank, rankWord, callsSummary, resultWord, neutralProblems, viewStrings, windowLabel, SECTION_IDS } from '../lib/team/contract.js'
import { buildNhlTeam, NHL_CLUBS } from '../lib/team/nhl.js'
import { statRows, clubLines, summaryByClub, xgByClub, goalieGsax } from '../lib/nhl/teamDeepCore.js'
import { callsBlock } from '../lib/nhl/teamDeep.js'
import { toRecord } from '../lib/record/nhl.js'
import { STATUS_WORD } from '../lib/callStatus.js'
import { wilson } from '../lib/interval.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }

// ── the registry ────────────────────────────────────────────────────────────
ok('registry: NHL lists the eight sections, in order, first = roster', () => {
  assert.deepEqual(sectionsOf('nhl').map((s) => s.id), ['roster', 'schedule', 'stats', 'calls', 'matchup', 'trends', 'goalies', 'special', 'cards'])
  assert.equal(firstSection('nhl'), 'roster')
  for (const s of sectionsOf('nhl')) { assert.ok(SECTION_IDS.includes(s.id), s.id); assert.ok(s.label && s.needs, `${s.id} needs a label and a named data source`) }
})
ok('registry: an unknown section falls back to the first; an unknown sport has none', () => {
  assert.equal(resolveSection('nhl', 'stats'), 'stats')
  assert.equal(resolveSection('nhl', 'nope'), 'roster')
  assert.equal(resolveSection('nhl', null), 'roster')
  assert.deepEqual(sectionsOf('curling'), [])
  assert.equal(firstSection('curling'), null)
})
ok('registry: only sports that have a built page are listed (NFL / MLB / NBA come in their own commits)', () => {
  assert.ok(Object.keys(TEAM_SECTIONS).every((k) => ['nhl', 'nfl', 'mlb', 'nba'].includes(k)))
})

// ── the contract's arithmetic ───────────────────────────────────────────────
ok('leagueRank: best = 1st, ties share the better rank, percentile counts the clubs beaten', () => {
  const v = [5, 4, 3, 3, 1]
  assert.deepEqual(leagueRank(v, 5), { rank: 1, of: 5, pct: 100 })
  assert.deepEqual(leagueRank(v, 3), { rank: 3, of: 5, pct: 25 })
  assert.deepEqual(leagueRank(v, 1, { higherBetter: false }), { rank: 1, of: 5, pct: 100 })   // fewest against is best
  assert.equal(leagueRank(v, null), null)
  assert.equal(leagueRank([5], 5), null)
  assert.equal(rankWord({ rank: 1 }), '1st'); assert.equal(rankWord({ rank: 12 }), '12th'); assert.equal(rankWord({ rank: 22 }), '22nd'); assert.equal(rankWord(null), '—')
})
ok('callsSummary: did-not-play and pending are not in n; the range is the Wilson 95%', () => {
  const rows = [{ result: 'hit' }, { result: 'hit' }, { result: 'miss' }, { result: 'miss' }, { result: 'miss' }, { result: 'void' }, { result: null }]
  const s = callsSummary(rows)
  assert.equal(s.n, 5); assert.equal(s.hit, 2); assert.equal(s.dnp, 1); assert.equal(s.pending, 1); assert.equal(s.rate, 40)
  const w = wilson(2, 5)
  assert.equal(s.range[0], Math.round(w[0] * 10) / 10); assert.equal(s.range[1], Math.round(w[1] * 10) / 10)
  assert.equal(callsSummary([]).rate, null); assert.equal(callsSummary([]).range, null)
  assert.equal(resultWord('hit'), 'HIT'); assert.equal(resultWord('void'), 'DID NOT PLAY'); assert.equal(resultWord(null), 'PENDING')
})
ok('windowLabel names the season, the part, and the sample; last season says so', () => {
  assert.match(windowLabel({ seasonLabel: '2026-27', n: 4 }), /2026-27 regular season · 4 games/)
  assert.match(windowLabel({ seasonLabel: '2025-26', stale: true, n: 1 }), /LAST SEASON.*1 game$/)
})
ok('neutral wording: due / owed / guaranteed are caught, plain words are not', () => {
  assert.equal(neutralProblems(['he is due for a goal', 'owed one', 'a guaranteed hit']).length, 3)
  assert.equal(neutralProblems(['The line stored before puck drop', 'Residue is residue', 'overdue']).length, 1)
})

// ── TEST fixtures ───────────────────────────────────────────────────────────
const CLUBS = NHL_TEAMS.map((t) => t[0])
const mkSummary = () => ({ data: CLUBS.map((c, i) => ({ teamId: NHL_TEAMS[i][1], gamesPlayed: 4, goalsForPerGame: 2 + i / 16, goalsAgainstPerGame: 4 - i / 16, shotsForPerGame: 25 + i / 4, shotsAgainstPerGame: 33 - i / 4, faceoffWinPct: 0.45 + i / 400, powerPlayPct: 0.1 + i / 150, penaltyKillPct: 0.7 + i / 200, pointPct: 0.2 + i / 60, points: i })) })
const mkSpecials = () => Object.fromEntries(CLUBS.map((c, i) => [c, { ppOppPg: 2 + i / 20, ppGpg: 0.3 + i / 80, shPg: 3 - i / 40 }]))
const mkXg = () => CLUBS.flatMap((c, i) => [1, 2, 3, 4].map((g) => ({ team: c, game_id: 2026020000 + g, gf: 3, ga: 2, sog: 28, xg: 2.5 + i / 40, sog_a: 30, xg_a: 3 - i / 40, goalies: { 8470001: [30, 2, 2.6] } })))
const SEASON = '2026-27'
const mkGames = (team) => {
  const opps = CLUBS.filter((c) => c !== team)
  return Array.from({ length: 8 }, (_, k) => {
    const done = k < 5
    const opp = opps[k]
    const o = NHL_TEAMS.find((t) => t[0] === opp)
    return { id: 2026020100 + k, season: 20262027, seasonLabel: SEASON, gameType: 2, date: `2026-10-${String(2 + k).padStart(2, '0')}`, startUtc: `2026-10-${String(2 + k).padStart(2, '0')}T23:00:00Z`, venue: `TEST Arena ${k}`, state: done ? 'final' : 'pre', scheduleState: 'OK', home: k % 2 === 0,
      opponent: { abbrev: opp, score: done ? 2 : null, id: o[1] }, us: { score: done ? (k % 3 === 0 ? 1 : 3) : null }, result: done ? (k % 3 === 0 ? 'L' : 'W') : null, outcome: done ? 'REG' : null }
  })
}
const mkPayload = (team) => {
  const t = NHL_TEAMS.find((x) => x[0] === team)
  return {
    team: { abbrev: team, name: `${t[2]} ${t[3]}` },
    standing: { w: 3, l: 1, otl: 1, pts: 7, diff: 3, divRank: 2, confRank: 4, divName: 'Atlantic', confName: 'Eastern', home: { w: 2, l: 0, otl: 0 }, road: { w: 1, l: 1, otl: 1 }, l10: { w: 3, l: 1, otl: 1 }, streak: 'W2', gf: 14, ga: 11 },
    standingSeason: SEASON, standingStale: false,
    roster: [{ id: 8470001, name: 'TEST Goalie', pos: 'G', group: 'goalies', number: 31, birthDate: '1995-05-05' }, { id: 8470002, name: 'TEST Skater A', pos: 'C', group: 'forwards', number: 9, birthDate: '1999-01-01' }, { id: 8470003, name: 'TEST Skater B', pos: 'D', group: 'defensemen', number: 4, birthDate: '2000-01-01' }],
    stats: { seasonLabel: SEASON, skaters: [{ id: 8470002, gp: 4, g: 2, a: 1, pts: 3, plusMinus: 1, pim: 0, shots: 12, shPct: 0.166, toi: 1100, ppg: 1, gwg: 0 }, { id: 8470003, gp: 4, g: 0, a: 2, pts: 2 }], goalies: [{ id: 8470001, gp: 4, gs: 4, w: 3, l: 1, otl: 0, gaa: 2.5, svPct: 0.915, so: 0, sa: 100 }] },
    statsStale: false, season: { id: 20262027 }, schedule: { seasonLabel: SEASON, games: mkGames(team) },
  }
}
const mkRecords = () => [
  { game_id: 1, game_date: '2026-10-07', game_type: 2, season: 20262027, player_id: 8470002, model_version: 'lamp-goal-v3', team: 'TOR', opp: 'BOS', name: 'TEST Skater A', pos: 'C', rank_in_game: 1, status: 'called', dressed: true, goals: 1, hit: true, locked_at: 'x', graded_at: 'x' },
  { game_id: 2, game_date: '2026-10-05', game_type: 2, season: 20262027, player_id: 8470002, model_version: 'lamp-goal-v3', team: 'TOR', opp: 'MTL', name: 'TEST Skater A', pos: 'C', rank_in_game: 1, status: 'called', dressed: true, goals: 0, hit: false, locked_at: 'x', graded_at: 'x' },
  { game_id: 3, game_date: '2026-10-03', game_type: 2, season: 20262027, player_id: 8470003, model_version: 'lamp-goal-v3', team: 'TOR', opp: 'OTT', name: 'TEST Skater B', pos: 'D', rank_in_game: 1, status: 'called', dressed: false, goals: 0, hit: null, locked_at: 'x', graded_at: 'x' },
  { game_id: 4, game_date: '2026-10-08', game_type: 2, season: 20262027, player_id: 8470002, model_version: 'lamp-goal-v3', team: 'TOR', opp: 'DET', name: 'TEST Skater A', pos: 'C', rank_in_game: 1, status: 'called', dressed: null, goals: null, hit: null, locked_at: 'x', graded_at: null },
].map(toRecord).sort((a, b) => (a.game_date < b.game_date ? 1 : -1))
const mkDeep = (team) => {
  const rows = statRows({ summary: summaryByClub(mkSummary()), specials: mkSpecials(), xg: xgByClub(mkXg()) })
  const opp = CLUBS.find((c) => c !== team)
  const g = mkGames(team).find((x) => x.state !== 'final')
  return {
    team: { abbrev: team }, season: { id: 20262027, label: SEASON, stale: false, current: 20262027 }, gp: 4,
    lines: clubLines(rows, team), xg: { available: true, games: 4 },
    goalies: [{ id: 8470001, ...goalieGsax(xgByClub(mkXg())[team], 8470001) }],
    calls: { available: true, ...callsBlock(mkRecords()) },
    next: { game: { id: g.id, date: g.date, startUtc: g.startUtc, venue: g.venue, home: g.home, opp: g.opponent.abbrev, away: g.home ? g.opponent.abbrev : team, homeAbbrev: g.home ? team : g.opponent.abbrev, season: 20262027, state: 'pre' },
      proj: { total: 5.9, source: 'xg', version: 'TEST', home: { team: g.home ? team : opp, goals: 3.1, shots: 30.2, games: 4 }, away: { team: g.home ? opp : team, goals: 2.8, shots: 28.1, games: 4 } }, book: { line: 6, source: 'book' }, oppLines: clubLines(rows, g.opponent.abbrev) },
  }
}
const board = (team) => ({ games: [{ rows: [{ playerId: 8470002, team, status: 'called', rank: 1 }, { playerId: 8470003, team, status: 'board', rank: 4 }] }] })

// ── every club in the registry, files absent ────────────────────────────────
ok('every NHL club builds with the real files absent: a header with name + logo, eight sections, each an honest empty state', () => {
  assert.equal(NHL_CLUBS.length, 32)
  for (const c of NHL_CLUBS) {
    const v = buildNhlTeam({ team: c })
    assert.ok(v.header.name && v.header.known, `${c}: header name`)
    assert.match(v.header.logo, /^https:\/\/assets\.nhle\.com\/logos\/nhl\/svg\/[A-Z]{3}_light\.svg$/)
    assert.ok(v.header.eyebrow.startsWith('LAMP · TEAM ·'), `${c}: eyebrow`)
    assert.deepEqual(v.sections.map((s) => s.id), sectionsOf('nhl').map((s) => s.id), `${c}: section order`)
    for (const s of v.sections) {
      if (s.id === 'cards') { assert.equal(s.state, 'ok', `${c}/cards`); assert.equal(s.blocks[0].slot, 'teamCards'); continue }   // the Cards section is a slot (components/binder/TeamCards.js): always ok, reads /api/card/recent itself
      assert.equal(s.state, 'empty', `${c}/${s.id}`)
      assert.ok(s.empty.title && s.empty.note, `${c}/${s.id}: names what is missing`)
      assert.deepEqual(s.blocks, [])
    }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
})
ok('an unknown club code is a header with no name, never a crash', () => {
  const v = buildNhlTeam({ team: 'ZZZ' })
  assert.equal(v.header.known, false); assert.equal(v.header.logo, null)
  assert.equal(v.sections.length, 9)
})
ok('every club fills all eight sections from a TEST payload; each carries its season and sample; wording is neutral', () => {
  for (const c of CLUBS) {
    const v = buildNhlTeam({ team: c, payload: mkPayload(c), deep: mkDeep(c), board: board(c), form: null })
    for (const s of v.sections) {
      assert.equal(s.state, 'ok', `${c}/${s.id} should be ok (${s.empty?.title})`)
      if (s.id === 'cards') continue
      assert.ok(s.blocks.length > 0)
      if (s.id !== 'matchup') assert.match(s.window, new RegExp(SEASON.replace('-', '\\-')), `${c}/${s.id}: window names the season: ${s.window}`)
      if (['roster', 'schedule', 'stats', 'trends'].includes(s.id)) assert.match(s.window, /\d+ (games?|players? with a line)/, `${c}/${s.id}: window carries the sample: ${s.window}`)
      for (const b of s.blocks) if (b.type === 'table') for (const col of b.columns) assert.ok(col.group, `${c}/${s.id}/${b.id}: column ${col.key} has a group`)
    }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
})

// ── the header ──────────────────────────────────────────────────────────────
ok('header: record, standing, splits, streak, next game, last game and the last five (oldest to newest)', () => {
  const h = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR') }).header
  assert.equal(h.record, '3-1-1'); assert.equal(h.points, 7)
  assert.equal(h.standing, '2nd in the Atlantic · 4th in the East')
  assert.deepEqual(h.splits, { home: '2-0-0', road: '1-1-1', l10: '3-1-1', gf: 14, ga: 11 })
  assert.equal(h.streak, 'W2')
  assert.equal(h.next.gameId, 2026020105); assert.equal(h.last.gameId, 2026020104)
  assert.equal(h.last5.length, 5); assert.ok(h.last5[0].date < h.last5[4].date)
  assert.ok(h.next.opp && typeof h.next.home === 'boolean')
})

// ── stats and ranks ─────────────────────────────────────────────────────────
ok('stats: offence, defence and overall carry the rank of 32 and a percentile; fewest against is rank 1', () => {
  const rows = statRows({ summary: summaryByClub(mkSummary()), specials: mkSpecials(), xg: xgByClub(mkXg()) })
  const keys = rows.map((r) => r.key)
  for (const k of ['gfPg', 'sfPg', 'xgPg', 'ppPct', 'foPct', 'gaPg', 'saPg', 'xgaPg', 'pkPct', 'pPct']) assert.ok(keys.includes(k), k)
  const last = clubLines(rows, CLUBS[31]); const first = clubLines(rows, CLUBS[0])
  const L = (lines, k) => lines.find((l) => l.key === k)
  assert.equal(L(last, 'gfPg').rank.rank, 1)          // the fixture's last club scores most
  assert.equal(L(last, 'gaPg').rank.rank, 1)          // ...and allows fewest
  assert.equal(L(first, 'gfPg').rank.rank, 32); assert.equal(L(first, 'gfPg').rank.pct, 0)
  assert.equal(L(last, 'gfPg').rank.of, 32)
})
ok('stats: with no xG table the xG rows are left out and the page says why; nothing is filled in', () => {
  const rows = statRows({ summary: summaryByClub(mkSummary()), specials: mkSpecials(), xg: {} })
  assert.ok(!rows.some((r) => r.src === 'xg'))
  const deep = { ...mkDeep('TOR'), lines: clubLines(rows, 'TOR'), xg: { available: false } }
  const v = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep })
  const stats = v.sections.find((s) => s.id === 'stats')
  assert.ok(stats.blocks.every((b) => b.type !== 'table' || b.rows.every((r) => !/xG/.test(r.label))))
  assert.ok(stats.blocks.some((b) => b.type === 'note' && /lamp_team_game_xg/.test(b.text)))
})
ok('stats: a league report with no games yet is an empty state naming the report, not zeros', () => {
  const deep = { ...mkDeep('TOR'), lines: [] }
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep }).sections.find((x) => x.id === 'stats')
  assert.equal(s.state, 'empty'); assert.match(s.empty.note, /team\/summary/)
})

// ── our calls ───────────────────────────────────────────────────────────────
ok('calls: counts match the records (lib/callStatus words); did not play and pending are outside the rate', () => {
  const recs = mkRecords()
  assert.ok(recs.every((r) => r.status === 'called'))
  assert.equal(STATUS_WORD.called, 'CALLED')
  const b = callsBlock(recs)
  assert.equal(b.total, 4); assert.equal(b.versions.length, 1)
  const v = b.versions[0]
  assert.equal(v.n, 2); assert.equal(v.hit, 1); assert.equal(b.dnp, 1); assert.equal(b.pending, 1); assert.equal(v.rate, 50); assert.equal(b.graded, 2)
  const sec = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR') }).sections.find((s) => s.id === 'calls')
  const t = sec.blocks.find((x) => x.id === 'calls-version'); const last = sec.blocks.find((x) => x.id === 'calls-last')
  assert.equal(t.rows[0].n, 2); assert.equal(t.rows[0].hit, 1)
  assert.deepEqual(last.rows.map((r) => r.word), ['PENDING', 'HIT', 'MISSED', 'DID NOT PLAY'])
  assert.equal(last.rows.find((r) => r.word === 'DID NOT PLAY').goals, null)
})
ok('calls: the rate is never pooled across model versions', () => {
  const recs = [...mkRecords(), toRecord({ game_id: 9, game_date: '2026-09-29', game_type: 2, player_id: 1, model_version: 'lamp-goal-v1', team: 'TOR', opp: 'X', name: 'TEST', status: 'called', dressed: true, goals: 1, hit: true, locked_at: 'x', graded_at: 'x' })]
  const b = callsBlock(recs)
  assert.equal(b.versions.length, 2)
  assert.deepEqual(b.versions.map((v) => v.version).sort(), ['lamp-goal-v1', 'lamp-goal-v3'])
})
ok('calls: no calls yet is its own empty state; the goal log missing is another', () => {
  const none = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: { ...mkDeep('TOR'), calls: { available: true, total: 0, versions: [], last: [] } } }).sections.find((s) => s.id === 'calls')
  assert.equal(none.state, 'empty'); assert.match(none.empty.title, /NO CALLS/)
  const gone = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: { ...mkDeep('TOR'), calls: { available: false, total: 0, versions: [], last: [] } } }).sections.find((s) => s.id === 'calls')
  assert.match(gone.empty.note, /lamp_goal_log/)
})

// ── roster passes the board's words through ─────────────────────────────────
ok('roster: status words are the board\'s (called / board / off), unchanged; no status without a board', () => {
  const withBoard = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), board: board('TOR') }).sections[0]
  const rows = withBoard.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows)
  const st = rows.map((r) => r.status).filter(Boolean)
  assert.deepEqual(st.sort(), ['board', 'called'])
  for (const s of st) assert.ok(STATUS_WORD[s], s)
  const none = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR') }).sections[0].blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows)
  assert.ok(none.every((r) => !r.status))
  assert.match(withBoard.status, /2 on tonight/)
})
ok('roster: last-season form is not shown as this season\'s', () => {
  const form = { stale: true, seasonLabel: '2025-26', rows: [{ id: '8470002', g5: 4, sog5: 20, g10: 6, sog10: 40 }] }
  const rows = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), form }).sections[0].blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows)
  assert.ok(rows.every((r) => r.g5 == null))
  const fresh = { stale: false, seasonLabel: SEASON, rows: [{ id: '8470002', g5: 4, sog5: 20, g10: 6, sog10: 40 }] }
  const r2 = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), form: fresh }).sections[0].blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows)
  assert.equal(r2.find((r) => r.id === 8470002).g5, 4)
})

// ── schedule, trends, matchup, special ──────────────────────────────────────
ok('schedule: upcoming soonest first, results latest first; the opponent is quiet text and a link, the game a row door', () => {
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR') }).sections.find((x) => x.id === 'schedule')
  const ahead = s.blocks.find((b) => b.id === 'sched-ahead'); const done = s.blocks.find((b) => b.id === 'sched-done')
  assert.equal(ahead.rows.length, 3); assert.equal(done.rows.length, 5)
  assert.ok(ahead.rows[0].t < ahead.rows[2].t)
  assert.equal(ahead.rowOpen, 'game'); assert.ok(done.rows.every((r) => /^(W|L) \d–\d$/.test(r.resultTxt)))
  const opp = done.columns.find((c) => c.key === 'oppText')
  assert.equal(opp.link, 'team'); assert.equal(opp.linkKey, 'opp')
  assert.ok(done.rows.every((r) => /^(vs|@) [A-Z]{3}$/.test(r.oppText)))
})
ok('trends: home / away / last 10 / division / conference / back-to-back, with the games behind each; rest is a count with no claim', () => {
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR') }).sections.find((x) => x.id === 'trends')
  const t = s.blocks.find((b) => b.id === 'trend-splits')
  const by = Object.fromEntries(t.rows.map((r) => [r.split, r]))
  assert.equal(by.Home.gp + by.Away.gp, 5)
  assert.equal(by['Last 10'].gp, 5)
  assert.ok(by['Back-to-back'])
  assert.equal(by['Back-to-back'].gp, 4)   // the fixture plays on consecutive days
  assert.ok(s.blocks.some((b) => b.type === 'note' && /no reliable lean/.test(b.text)))
})
ok('matchup: attack vs defence both ways, the team model, the stored line, and the opposing net', () => {
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR') }).sections.find((x) => x.id === 'matchup')
  assert.ok(s.blocks.some((b) => b.id === 'mu-attack') && s.blocks.some((b) => b.id === 'mu-defence') && s.blocks.some((b) => b.id === 'mu-model'))
  assert.ok(s.blocks.some((b) => b.type === 'note' && /6\.0 \(the book total\)/.test(b.text)))
  const weak = s.blocks.find((b) => b.type === 'weak')
  assert.ok(weak && weak.sides.length === 1 && ['home', 'away'].includes(weak.sides[0]))
  assert.match(s.window, /^Next game · 2026-10-\d\d · (vs|@) [A-Z]{3}/)
  const noNext = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: { ...mkDeep('TOR'), next: null } }).sections.find((x) => x.id === 'matchup')
  assert.equal(noNext.state, 'empty')
})
ok('matchup: with no team-model number the section says so and prints no total', () => {
  const d = mkDeep('TOR'); d.next.proj = null; d.next.book = null
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: d }).sections.find((x) => x.id === 'matchup')
  assert.ok(!s.blocks.some((b) => b.id === 'mu-model'))
  assert.ok(s.blocks.some((b) => b.type === 'note' && /No team-model number/.test(b.text)))
})
ok('goalies: the season line carries GSAx from the xG table; a CONFIRMED starter is the board\'s own word and an expected one is never shown', () => {
  const mk = (starters) => ({ date: '2026-10-11', games: [{ game: { home: { abbrev: 'TOR' }, away: { abbrev: 'BOS' } }, starters, rows: [] }] })
  const none = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR') }).sections.find((x) => x.id === 'goalies')
  const g0 = none.blocks.find((b) => b.id === 'gk-goalies')
  assert.ok(g0.columns.some((c) => c.key === 'gsax'))
  assert.ok(Math.abs(g0.rows[0].gsax - (4 * 2.6 - 4 * 2)) < 1e-9)
  assert.ok(!g0.columns.some((c) => c.key === 'starter'), 'no board game for the club: no starter column')
  assert.ok(none.blocks.some((b) => b.type === 'note' && /no game on the board/.test(b.text)))
  const conf = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR'), board: mk({ home: { playerId: 8470001, name: 'TEST Goalie', confirmed: true }, away: null }) }).sections.find((x) => x.id === 'goalies')
  const gc = conf.blocks.find((b) => b.id === 'gk-goalies')
  assert.ok(gc.columns.some((c) => c.key === 'starter')); assert.equal(gc.rows[0].starter, 'CONFIRMED')
  const exp = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR'), board: mk({ home: { playerId: 8470001, name: 'TEST Goalie', confirmed: false }, away: null }) }).sections.find((x) => x.id === 'goalies')
  assert.equal(exp.blocks.find((b) => b.id === 'gk-goalies').rows[0].starter, '')
})
ok('goalies: club rest is counts only (days off, games in 7 and 14 days), the weak-zone and injury slots are named, wording is neutral', () => {
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR') }).sections.find((x) => x.id === 'goalies')
  const r = s.blocks.find((b) => b.id === 'gk-rest')
  assert.ok(r, 'rest block'); assert.deepEqual(r.columns.map((c) => c.key), ['next', 'rest', 'g7', 'g14'])
  assert.ok(Number.isInteger(r.rows[0].g7) && Number.isInteger(r.rows[0].g14))
  assert.ok(r.columns.every((c) => c.group), 'every column carries a group')
  const weak = s.blocks.find((b) => b.type === 'slot' && b.slot === 'goalieReads')
  assert.equal(weak.props.season, 20262027); assert.deepEqual(weak.props.goalies.map((x) => x.id), ['8470001'])
  assert.ok(s.blocks.some((b) => b.type === 'slot' && b.slot === 'injuries' && b.props.clubs[0] === 'TOR'))
  assert.deepEqual(neutralProblems(viewStrings(s)), [])
  assert.ok(!/\b(lean|edge|fatigue|tired)\b/i.test(viewStrings(s).filter((t) => !/no reliable lean/.test(t)).join(' ')), 'no rest claim')
})
ok('special teams carry ranks of 32 (the goalie table moved to its own section)', () => {
  const s = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR') }).sections.find((x) => x.id === 'special')
  assert.ok(!s.blocks.some((b) => b.id === 'sp-goalies'))
  const st = s.blocks.find((b) => b.id === 'sp-special')
  assert.ok(st.rows.every((r) => r.rankTxt.includes('of 32')))
})

// ── the address, the door, the money words ──────────────────────────────────
ok('the section rides the address as sec=, kept only on the team tab', () => {
  const page = readFileSync(new URL('../components/team/TeamPage.js', import.meta.url), 'utf8')
  assert.match(page, /writeParam\(hashKey/); assert.match(page, /hashKey = 'sec'/)
  const route = readFileSync(new URL('../lib/useShellRoute.js', import.meta.url), 'utf8')
  assert.match(route, /sec: new Set\(\['team'\]\)/)
})
ok('chips are one row and at least 44px; the page never names a sport', () => {
  const page = readFileSync(new URL('../components/team/TeamPage.js', import.meta.url), 'utf8')
  assert.match(page, /CHIP_H = 44/); assert.match(page, /overflowX: 'auto'/); assert.match(page, /position: 'sticky'/)
  for (const f of ['components/team/TeamPage.js', 'components/team/SectionView.js', 'components/team/kinds.js']) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.ok(!/sport === ['"](nfl|nhl|mlb|nba)['"]/.test(t), `${f}: a sport ternary`)
  }
})
ok('no probability is printed on a team page (the model section says expected goals, "not a probability")', () => {
  const v = buildNhlTeam({ team: 'TOR', payload: mkPayload('TOR'), deep: mkDeep('TOR'), board: board('TOR') })
  const all = viewStrings(v).join(' \n ')
  assert.ok(!/\b(win probability|chance to score|% chance|probability of)\b/i.test(all), 'a probability phrase')
})
ok('lamp wrapper: every club tab reaches the team page through the shared page', () => {
  const t = readFileSync(new URL('../components/lamp/tabs/Team.js', import.meta.url), 'utf8')
  assert.match(t, /TeamPage/); assert.match(t, /buildNhlTeam/); assert.match(t, /useLampTeamDeep/)
})

// ── optional: the live routes, every club (node scripts/check-team-pages.mjs --base http://localhost:3108) ──────────
const baseIx = process.argv.indexOf('--base')
if (baseIx > 0) {
  const base = process.argv[baseIx + 1]
  const get = async (u) => { const r = await fetch(`${base}${u}`); return r.ok ? r.json() : null }
  const board = await get('/api/lamp/board'); const form = await get('/api/lamp/hotsticks')
  let okSections = 0
  for (const c of CLUBS) {
    try {
      const [payload, deep] = [await get(`/api/lamp/team?team=${c}`), await get(`/api/lamp/teamdeep?team=${c}`)]
      const v = buildNhlTeam({ team: c, payload, deep, board, form })
      assert.ok(v.header.name && v.header.logo, `${c}: header`)
      assert.equal(v.sections.length, 9)
      assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
      okSections += v.sections.filter((s) => s.state === 'ok').length
      const empties = v.sections.filter((s) => s.state !== 'ok').map((s) => s.id)
      console.log(`ok   live ${c}: ${v.sections.length - empties.length}/8 sections${empties.length ? ` (empty: ${empties.join(', ')})` : ''}${payload && deep ? '' : ' [a feed was down]'}`)
    } catch (e) { fail += 1; console.log(`FAIL live ${c}: ${e.message}`) }
  }
  console.log(`live: ${okSections} of ${CLUBS.length * 7} sections filled`)
}

console.log(fail ? `\n${fail} FAILED` : '\nall team-page checks passed')
process.exit(fail ? 1 : 0)
