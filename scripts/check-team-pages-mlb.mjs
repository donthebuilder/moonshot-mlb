#!/usr/bin/env node
// THE MLB TEAM PAGE (2026-10-10). TEST data only: every club, name, number and game below is made up ("TEST ...") and exists to
// prove lib/team/mlb.js, lib/mlb/teamSplitsCore.js and the contract; nothing real is read here, nothing reaches the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-team-pages-mlb.mjs
//   ... --base http://localhost:3108   also loads all 30 clubs from /api/mlb/team (a live check, not TEST data)
// Holds: the registry; every club builds with the real files absent; sections fill from TEST payloads with season and sample; the
// splits (ESPN where it has the split, MLB where it lacks it, a missing split NAMED not filled, the source on every table, G and a
// Wilson range on every row, innings sums recomputed from counts); the board's words; our-calls counts; ballpark and rest from
// our log; neutral wording with no call / strong / weak words in the splits.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MLB_TEAMS } from '../lib/mlbTeams.js'
import { sectionsOf, firstSection } from '../lib/team/registry.js'
import { neutralProblems, viewStrings } from '../lib/team/contract.js'
import { buildMlbTeam, MLB_CLUBS, logSplits } from '../lib/team/mlb.js'
import { espnRows, mlbRows, sumBat, sumPit, recordSplits, rangeText, outsOf, ipOf } from '../lib/mlb/teamSplitsCore.js'
import { statRowsMlb } from '../lib/mlb/teamRead.js'
import { clubLines } from '../lib/team/statLines.js'
import { STATUS_WORD } from '../lib/callStatus.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const CLUBS = Object.keys(MLB_TEAMS)
const SECTIONS = ['roster', 'schedule', 'stats', 'splits', 'calls', 'matchup', 'h2h', 'cards']

ok('registry: MLB lists six sections, Hitters first, Splits one chip', () => {
  assert.deepEqual(sectionsOf('mlb').map((s) => s.id), SECTIONS)
  assert.equal(firstSection('mlb'), 'roster')
  assert.equal(CLUBS.length, 30); assert.equal(MLB_CLUBS.length, 30)
})
ok('every MLB club builds with the real files absent: header name + logo, six honest empty states, neutral wording', () => {
  for (const c of CLUBS) {
    const v = buildMlbTeam({ team: c })
    assert.ok(v.header.name && v.header.known && /^https:\/\/a\.espncdn\.com/.test(v.header.logo), `${c}: header`)
    assert.deepEqual(v.sections.map((s) => s.id), SECTIONS)
    for (const s of v.sections) { if (s.id === 'cards' || s.id === 'h2h') { assert.equal(s.state, 'ok'); continue } /* slots load their own data */ assert.equal(s.state, 'empty', `${c}/${s.id}`); assert.ok(s.empty.title && s.empty.note); assert.deepEqual(s.blocks, []) }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
  assert.equal(buildMlbTeam({ team: 'ZZZ' }).header.known, false)
})

// ── the feeds' own shapes, normalised ───────────────────────────────────────
const cat = (name, vals) => ({ name, stats: Object.entries(vals).map(([abbreviation, value]) => ({ abbreviation, value, displayValue: String(value) })) })
const espnLine = (g, ab, h) => [cat('batting', { G: g, PA: ab + 40, AB: ab, H: h, R: 50, HR: 12, RBI: 48, BB: 30, SO: 80, SB: 5, AVG: h / ab, OBP: 0.31, SLG: 0.42, OPS: 0.73 }), cat('pitching', { G: g, ER: 40, HR: 11, BB: 30, K: 90, H: 120, R: 44, AB: 500, ERA: 3.6, WHIP: 1.2, OBA: 0.24 })]
const ESPN = { results: { stats: { categories: espnLine(80, 2500, 600) }, splits: [{ name: 'Home', categories: espnLine(40, 1300, 330) }, { name: 'Away', categories: espnLine(40, 1200, 270) }, { name: 'vs. Left', categories: espnLine(30, 900, 220) }, { name: 'April', categories: espnLine(24, 800, 190) }] } }
const mlbSplit = (code, stat) => ({ split: { code }, stat })
const batStat = { gamesPlayed: 80, plateAppearances: 400, atBats: 360, hits: 90, runs: 50, homeRuns: 12, rbi: 48, baseOnBalls: 30, strikeOuts: 80, stolenBases: 5, avg: '.250', obp: '.320', slg: '.420', ops: '.740', hitByPitch: 4, sacFlies: 3, totalBases: 151 }
const pitStat = { gamesPlayed: 80, inningsPitched: '200.1', hits: 170, runs: 80, earnedRuns: 70, homeRuns: 20, baseOnBalls: 60, strikeOuts: 210, atBats: 760, era: '3.15', whip: '1.15', avg: '.224' }
const SIT = ['h', 'a', 'vl', 'vr', 'val', 'vnl', 'd', 'n', '3', '4', '5', '6', '7', '8', '9', '10', 'r0', 'ron', 'risp', 'risp2', 'r123', 'o0', 'o1', 'o2', 'sah', 'sbh', 'sti', 'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'ix', 'g', 't', 'sp', 'rp']
const MLBJ = (stat) => ({ stats: [{ splits: SIT.map((c) => mlbSplit(c, stat)) }] })

ok('espnRows: the split name keys the line; the total is kept; AB / H read by their abbreviations', () => {
  const e = espnRows(ESPN)
  assert.equal(e.rows.Home.bat.ab, 1300); assert.equal(e.rows.Home.bat.h, 330); assert.equal(e.total.bat.g, 80); assert.equal(e.rows['vs. Left'].pit.era, 3.6)
})
ok('mlbRows: hitting and pitching lines by situation code', () => {
  const b = mlbRows(MLBJ(batStat), 'hitting'); const p = mlbRows(MLBJ(pitStat), 'pitching')
  assert.equal(Object.keys(b).length, SIT.length); assert.equal(b.h.ab, 360); assert.equal(b.h.tb, 151); assert.equal(p.sp.ip, '200.1'); assert.equal(p.sp.era, 3.15)
})
ok('innings groups are SUMS of the innings, rates recomputed from the counts (never averaged)', () => {
  const a = { ab: 100, h: 30, pa: 120, r: 10, hr: 3, rbi: 9, bb: 15, so: 20, sb: 1, hbp: 2, sf: 3, tb: 50 }; const b = { ab: 200, h: 40, pa: 230, r: 20, hr: 5, rbi: 18, bb: 25, so: 40, sb: 2, hbp: 3, sf: 2, tb: 90 }
  const s = sumBat([a, b])
  assert.equal(s.ab, 300); assert.equal(s.h, 70); assert.equal(s.avg, 0.233); assert.equal(s.slg, 0.467); assert.equal(s.obp, Number(((70 + 40 + 5) / (300 + 40 + 5 + 5)).toFixed(3)))
  assert.equal(s.ops, Number((s.obp + s.slg).toFixed(3))); assert.equal(s.g, null)
  assert.equal(sumBat([a, null]) !== null, true); assert.equal(sumBat([{ ...a, ab: null }, b]), null)
  const p = sumPit([{ ip: '10.1', er: 4, h: 9, bb: 3, k: 12, r: 4, hr: 1, ab: 40 }, { ip: '5.2', er: 2, h: 5, bb: 2, k: 6, r: 2, hr: 1, ab: 22 }])
  assert.equal(p.ip, '16.0'); assert.equal(p.era, Number(((9 * 6) / 16).toFixed(2))); assert.equal(outsOf('10.1'), 31); assert.equal(ipOf(48), '16.0')
})
ok('rangeText: the Wilson 95% range on hits over at-bats, ".221–.257" style; none without at-bats', () => {
  assert.match(rangeText(90, 360), /^\.\d{3}–\.\d{3}$/); assert.equal(rangeText(0, 0), null); assert.equal(rangeText(null, 100), null)
  const [lo, hi] = rangeText(90, 360).split('–').map((x) => Number('0' + x)); assert.ok(lo < 0.25 && hi > 0.25)
})
ok('recordSplits: home / away / vs L / vs R / day / night / grass / turf / one-run / extra innings / last 10 and the divisions and leagues', () => {
  const rec = { splitRecords: [{ type: 'home', wins: 46, losses: 34 }, { type: 'away', wins: 47, losses: 34 }, { type: 'left', wins: 31, losses: 17 }, { type: 'oneRun', wins: 25, losses: 14 }, { type: 'lastTen', wins: 5, losses: 5 }], divisionRecords: [{ division: { id: 201, name: 'American League East' }, wins: 28, losses: 24 }], leagueRecords: [{ league: { id: 103, name: 'American League' }, wins: 71, losses: 43 }, { league: { id: 104, name: 'National League' }, wins: 27, losses: 21 }] }
  const r = recordSplits(rec); const by = Object.fromEntries(r.map((x) => [x.label, x]))
  assert.equal(by.Home.w, 46); assert.equal(by['vs left-handed pitchers'].l, 17); assert.equal(by['One-run games'].w, 25); assert.equal(by['vs AL East'].w, 28); assert.equal(by['vs AL'].w, 71); assert.equal(by['vs NL'].l, 21)
})

// ── fixtures for the page ───────────────────────────────────────────────────
const YEAR = 2026
const other = (c, k = 0) => CLUBS.filter((x) => x !== c)[k]
const mkLeague = () => ({ h: CLUBS.map((c, i) => ({ team: { id: 1000 + i }, stat: { gamesPlayed: 160, runs: 600 + i * 5, homeRuns: 150 + i, avg: String(0.24 + i / 1000), obp: '.320', slg: String(0.4 + i / 1000), ops: '.730', baseOnBalls: 500, strikeOuts: 1300 - i * 3, stolenBases: 80 } })), p: CLUBS.map((c, i) => ({ team: { id: 1000 + i }, stat: { gamesPlayed: 160, runs: 750 - i * 5, era: String(4.4 - i / 20), whip: '1.25', strikeoutsPer9Inn: '8.5', walksPer9Inn: '3.2', homeRunsPer9: '1.2', avg: '.245', saves: 30 } })) })
const idToCode = Object.fromEntries(CLUBS.map((c, i) => [1000 + i, c]))
const lineRows = () => statRowsMlb(mkLeague(), idToCode, { diffPg: Object.fromEntries(CLUBS.map((c, i) => [c, i / 30])), win: Object.fromEntries(CLUBS.map((c, i) => [c, 0.4 + i / 100])) })
const mkSched = (t) => Array.from({ length: 10 }, (_, k) => {
  const done = k < 7; const dates = ['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']
  return { pk: `70${k}`, date: dates[k], startUtc: `${dates[k]}T23:05:00Z`, type: 'R', state: done ? 'Final' : 'Preview', detail: done ? 'Final' : 'Scheduled', dayNight: 'night', home: k % 2 === 0, opp: other(t, k), oppId: 1, venue: k % 2 === 0 ? 'TEST Park' : `TEST Away ${k % 3}`, venueId: k % 2 === 0 ? 1 : 2 + (k % 3),
    us: done ? (k % 3 === 0 ? 2 : 5) : null, them: done ? 3 : null, result: done ? (k % 3 === 0 ? 'L' : 'W') : null, usPitcher: { id: 11, name: 'TEST Ours' }, themPitcher: { id: 12, name: 'TEST Theirs' } }
})
const mkServer = (t, over = {}) => ({ season: YEAR, stale: false,
  standing: { w: 90, l: 70, pct: '.562', gp: 160, divName: 'American League East', divRank: 2, leagueRank: 3, gb: '3.0', streak: 'W2', rs: 700, ra: 640, diff: 60,
    records: recordSplits({ splitRecords: [{ type: 'home', wins: 50, losses: 30 }, { type: 'away', wins: 40, losses: 40 }, { type: 'left', wins: 30, losses: 20 }, { type: 'oneRun', wins: 20, losses: 20 }], divisionRecords: [], leagueRecords: [{ league: { id: 103, name: 'American League' }, wins: 60, losses: 40 }] }) },
  schedule: mkSched(t), venues: { 1: { name: 'TEST Park', roof: 'Open', turf: 'Grass' }, 2: { name: 'TEST Away 2', roof: 'Dome', turf: 'Artificial Turf' } },
  splits: { espn: espnRows(ESPN), mlb: { bat: { ...mlbRows(MLBJ(batStat), 'hitting'), 'i1-3': sumBat(['i01', 'i02', 'i03'].map((c) => mlbRows(MLBJ(batStat), 'hitting')[c])) }, pit: mlbRows(MLBJ(pitStat), 'pitching') }, year: YEAR },
  lines: clubLines(lineRows(), t), oppLines: clubLines(lineRows(), other(t, 7)),
  starters: { us: { id: 11, name: 'TEST Ours', hand: 'R', gs: 30, ip: '180.0', era: 3.2, whip: 1.1, k: 200, hr: 15 }, them: { id: 12, name: 'TEST Theirs', hand: 'L', gs: 28, ip: '170.2', era: 4.1, whip: 1.3, k: 150, hr: 20 } },
  totals: { line: 2.1, source: 'projection', projected: 2.2, called: true, rank: 2, of: 14 },
  calls: { picks: [{ game_date: '2026-09-20', player_id: '1', name: 'TEST Hitter', team: t, role: 'TOP', result: 'hit' }, { game_date: '2026-09-18', player_id: '1', name: 'TEST Hitter', team: t, role: 'HR', result: 'miss' }, { game_date: '2026-09-15', player_id: '2', name: 'TEST Other', team: t, role: 'HR', result: 'miss' }] },
  ...over })
const mkPlayers = (t) => [
  { player_id: 1, game_pk: 700, name: 'TEST Hitter', team: t, game_pick_role: 'TOP', board_rank: 1, lineup_spot: 3, pitcher_name: 'TEST Theirs', hr_score: 80 },
  { player_id: 2, game_pk: 700, name: 'TEST Other', team: t, game_pick_role: '', board_rank: 5, lineup_spot: 5, pitcher_name: 'TEST Theirs', hr_score: 60 },
  ...Array.from({ length: 12 }, (_, i) => ({ player_id: 100 + i, game_pk: 701, name: `TEST Filler ${i}`, team: other(t, 3), game_pick_role: '', board_rank: 6 + i, hr_score: 40 })),
]
const all = (t, over) => buildMlbTeam({ team: t, players: mkPlayers(t), server: mkServer(t, over) })
const sec = (v, id) => v.sections.find((s) => s.id === id)

ok('every club fills all six sections from TEST payloads; season and sample on each window; a group on every column; neutral wording', () => {
  for (const c of CLUBS) {
    const v = all(c)
    for (const s of v.sections) {
      assert.equal(s.state, 'ok', `${c}/${s.id}: ${s.empty?.title} ${s.empty?.note}`)
      if (s.id === 'cards' || s.id === 'h2h') continue
      if (s.id !== 'matchup') assert.match(s.window, /2026/, `${c}/${s.id}: ${s.window}`)
      for (const b of s.blocks) if (b.type === 'table') for (const col of b.columns) assert.ok(col.group, `${c}/${s.id}/${b.id}: ${col.key} needs a group`)
    }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
})
ok('header: record, standing, streak, runs, next game, last five from the feeds', () => {
  const h = all('NYY').header
  assert.equal(h.record, '90-70'); assert.match(h.standing, /2nd in the AL East/); assert.ok(h.summary.some((x) => /^Streak W2/.test(x)) && h.summary.some((x) => /^Runs 700-640/.test(x)))
  assert.equal(h.last5.length, 5); assert.equal(h.next.gameId, '707'); assert.equal(h.last.gameId, '706')
})
ok('hitters: the board\'s words (CALLED / ON THE BOARD / NOT) come from lib/callStatus; only this club\'s hitters; the injury module is a slot', () => {
  const s = sec(all('NYY'), 'roster')
  const rows = s.blocks.find((b) => b.id === 'hitters').rows
  assert.equal(rows.length, 2); assert.equal(rows.find((r) => r.name === 'TEST Hitter').status, 'called'); assert.ok(Object.keys(STATUS_WORD).includes(rows[1].status))
  assert.ok(s.blocks.some((b) => b.type === 'slot' && b.slot === 'injuries'))
  assert.match(s.status, /1 CALLED/)
})
ok('stats: offence, pitching and overall carry the rank of 30; fewest allowed is best', () => {
  const s = sec(all('NYY'), 'stats')
  const pit = s.blocks.find((b) => b.id === 'stats-pitching')
  assert.ok(pit.rows.some((r) => r.label === 'ERA' && /of 30/.test(r.rankTxt)))
  const l = Object.fromEntries(clubLines(lineRows(), CLUBS[0]).map((x) => [x.key, x]))
  assert.equal(l.era.rank.rank, 30); assert.equal(clubLines(lineRows(), CLUBS[29]).find((x) => x.key === 'era').rank.rank, 1)
})
ok('splits: three views; ESPN\'s line is used where ESPN has the split, MLB\'s where it lacks it; every table names its source', () => {
  const s = sec(all('NYY'), 'splits')
  assert.deepEqual(s.views.map((v) => v.key), ['bat', 'pit', 'park'])
  const ha = s.blocks.find((b) => b.id === 'split-bat-ha')
  assert.deepEqual(ha.rows.map((r) => r.src), ['ESPN', 'ESPN']); assert.equal(ha.rows[0].ab, 1300)
  const sit = s.blocks.find((b) => b.id === 'split-bat-sit')
  const by = Object.fromEntries(sit.rows.map((r) => [r.label, r]))
  assert.equal(by['Bases loaded'].src, 'MLB'); assert.equal(by['Bases empty'].src, 'MLB')   // ESPN fixture has no "None on", so MLB fills it
  for (const b of s.blocks.filter((x) => x.type === 'table' && x.view !== 'park')) assert.match(b.caption, /Source: (ESPN team splits|MLB situational splits)/, b.id)
  for (const b of s.blocks.filter((x) => x.type === 'table')) assert.match(b.caption, /Source:/, b.id)
})
ok('splits: every row carries its games and at-bats, and a Wilson range; month rows only for months a feed carries; a missing split is NAMED', () => {
  const s = sec(all('NYY'), 'splits')
  for (const b of s.blocks.filter((x) => x.type === 'table' && /^split-(bat|pit)-/.test(x.id))) for (const r of b.rows) { assert.ok(r.src); assert.match(r.range, /^(\.\d{3}–\.\d{3}|—)$/, `${b.id}/${r.label}`); assert.ok(r.g != null || r.ab != null || r.ip != null, `${b.id}/${r.label}: a sample`) }
  const mo = s.blocks.find((b) => b.id === 'split-bat-mo')
  assert.ok(mo.rows.some((r) => r.label === 'April')); assert.ok(!mo.rows.some((r) => r.label === 'November'))
  const noEspn = buildMlbTeam({ team: 'NYY', players: [], server: mkServer('NYY', { splits: { espn: null, mlb: { bat: { h: mlbRows(MLBJ(batStat), 'hitting').h }, pit: {} }, year: YEAR } }) })
  const note = sec(noEspn, 'splits').blocks.find((b) => b.type === 'note' && b.view === 'bat')
  assert.match(note.text, /Not carried by either feed/); assert.match(note.text, /Away/)
})
ok('splits: pitching has starters vs bullpen, the vs words flip to batters; batting does not', () => {
  const s = sec(all('NYY'), 'splits')
  assert.ok(s.blocks.some((b) => b.id === 'split-pit-rl')); assert.ok(!s.blocks.some((b) => b.id === 'split-bat-rl'))
  assert.ok(s.blocks.find((b) => b.id === 'split-pit-vs').rows.some((r) => r.label === 'vs left-handed batters'))
  assert.ok(s.blocks.find((b) => b.id === 'split-bat-vs').rows.some((r) => r.label === 'vs left-handed pitchers'))
})
ok('splits: record, ballpark and rest come from the standings and our schedule log with arithmetic that adds up', () => {
  const sv = mkServer('NYY'); const L = logSplits(sv)
  const fin = sv.schedule.filter((g) => g.state === 'Final')
  assert.equal(L.parks.reduce((a, p) => a + p.g, 0), fin.length); assert.equal(L.parks.reduce((a, p) => a + p.w + p.l, 0), fin.length)
  assert.equal(L.last5.length, 5)
  const s = sec(all('NYY'), 'splits')
  const park = s.blocks.find((b) => b.id === 'split-parks'); const rec = s.blocks.find((b) => b.id === 'split-record'); const rest = s.blocks.find((b) => b.id === 'split-rest')
  assert.ok(park.rows.some((r) => r.roof === 'Open' && r.turf === 'Grass')); assert.ok(park.rows.some((r) => r.roof === 'Dome' && r.turf === 'Turf'))
  assert.ok(rec.rows.some((r) => r.label === 'Home' && r.src === 'MLB standings' && r.g === 80)); assert.ok(rec.rows.some((r) => r.label === 'Last 5' && r.src === 'Our log'))
  assert.ok(rest.rows.every((r) => r.src === 'Our log'))
  const dayOff = L.dayOff.length; const consecutive = L.noOff.length
  assert.ok(dayOff + consecutive <= fin.length && dayOff > 0 && consecutive > 0)
})
ok('splits: no call words, no strong / weak labels in anything a Splits table says', () => {
  const s = sec(all('NYY'), 'splits')
  const text = viewStrings({ blocks: s.blocks.map((b) => ({ ...b, columns: undefined })) }).join(' \n ')
  assert.ok(!/\b(strong|weak|hot|cold|slump|struggl\w*|CALLED|ON THE BOARD)\b/i.test(text.replace(/Not carried by either feed/g, '')), 'a label that reads as a verdict')
  assert.deepEqual(neutralProblems(viewStrings(s)), [])
})
ok('calls: graded hit / miss counted, the rate carries n and a Wilson range, the window says it is the locked record', () => {
  const s = sec(all('NYY'), 'calls')
  const sum = s.blocks.find((b) => b.id === 'calls-sum').rows[0]
  assert.equal(sum.n, 3); assert.equal(sum.hit, 1); assert.match(sum.range, /–/)
  assert.deepEqual(s.blocks.find((b) => b.id === 'calls-last').rows.map((r) => r.word), ['HIT', 'MISSED', 'MISSED'])
  assert.match(s.window, /locked calls since 2026-09-15/)
  assert.equal(sec(all('NYY', { calls: { picks: [] } }), 'calls').state, 'empty'); assert.equal(sec(all('NYY', { calls: null }), 'calls').state, 'empty')
})
ok('next game: both probable starters with hand and season line, the ballpark, the stored Top Totals row, both clubs\' ranks', () => {
  const s = sec(all('NYY'), 'matchup')
  const sp = s.blocks.find((b) => b.id === 'mu-sp'); assert.deepEqual(sp.rows.map((r) => r.hand), ['R', 'L'])
  assert.ok(s.blocks.some((b) => b.id === 'mu-attack')); assert.ok(s.blocks.some((b) => b.id === 'mu-defence'))
  assert.ok(s.blocks.some((b) => b.type === 'note' && /Ballpark: TEST/.test(b.text))); assert.ok(s.blocks.some((b) => b.type === 'note' && /rank 2 of 14 on the slate, CALLED/.test(b.text)))
  assert.match(s.window, /^Next game · 2026-09-10/)
  assert.equal(sec(all('NYY', { schedule: mkSched('NYY').slice(0, 7) }), 'matchup').state, 'empty')
})
ok('schedule: every game is a row door and the opposing starter is a pitcher link; the opponent is a team link', () => {
  const s = sec(all('NYY'), 'schedule')
  assert.equal(s.blocks[0].rowOpen, 'game'); const cols = s.blocks[0].columns
  assert.equal(cols.find((c) => c.key === 'oppText').link, 'team'); assert.equal(cols.find((c) => c.key === 'sp').link, 'pitcher')
})
ok('the page is shared: MOONSHOT\'s tab renders TeamPage, the Splits view and section ride the address, and the address survives the shell\'s rewrite', () => {
  const t = readFileSync(new URL('../components/tabs/Team.js', import.meta.url), 'utf8')
  assert.match(t, /TeamPage/); assert.match(t, /buildMlbTeam/); assert.match(t, /\/api\/mlb\/team/); assert.match(t, /InjuryOut/)
  assert.match(readFileSync(new URL('../components/Dashboard.js', import.meta.url), 'utf8'), /\['sec', 'sv'\]/)
  assert.match(readFileSync(new URL('../components/team/SectionView.js', import.meta.url), 'utf8'), /sv/)
})

// ── optional: the live feeds, every club (--base http://localhost:3108) ───────
const ix = process.argv.indexOf('--base')
if (ix > 0) {
  const base = process.argv[ix + 1]
  const j = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null } catch { return null } }
  let filled = 0
  for (const c of CLUBS) {
    try {
      const server = await j(`${base}/api/mlb/team?team=${c}`)
      const v = buildMlbTeam({ team: c, players: [], server })
      assert.ok(v.header.name && v.header.logo); assert.equal(v.sections.length, 7)
      assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
      const empties = v.sections.filter((s) => s.state !== 'ok').map((s) => `${s.id}(${s.empty?.title})`)
      filled += 6 - empties.length
      console.log(`ok   live ${c}: ${6 - empties.length}/6${empties.length ? ` empty: ${empties.join(', ')}` : ''}${server ? '' : ' [no server data]'}`)
    } catch (e) { fail += 1; console.log(`FAIL live ${c}: ${e.message}`) }
  }
  console.log(`live: ${filled} of ${CLUBS.length * 6} sections filled (no board rows are passed here, so Hitters is empty by design)`)
}

console.log(fail ? `\n${fail} FAILED` : '\nall MLB team-page checks passed')
process.exit(fail ? 1 : 0)
