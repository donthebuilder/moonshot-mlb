#!/usr/bin/env node
// THE NBA (BUCKETS) TEAM PAGE (2026-10-10). TEST data only: every club, name, number and game below is made up ("TEST ...") and
// exists to prove lib/team/nba.js, lib/nba/teamRead.js's pure parts and the gate; nothing real is read, nothing reaches the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-team-pages-nba.mjs
// Holds: the registry; all 30 clubs build with the real files absent; sections fill from TEST payloads, labelled with the season
// (LAST SEASON in the preseason) and the games behind them; the splits are arithmetic over the club's own results, rest as numbers
// with n; our-calls counts per market and version; the next game's model + stored line; and THE HIDING: every route behind the
// page is gated (404 until BUCKETS_PUBLIC=on), the sitemap lists nothing of it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NBA_TEAMS, nbaTeam } from '../lib/nba/teams.js'
import { sectionsOf, firstSection } from '../lib/team/registry.js'
import { neutralProblems, viewStrings } from '../lib/team/contract.js'
import { buildNbaTeam, NBA_CLUBS, splitRow, restOf } from '../lib/team/nba.js'
import { teamLine, statRowsNba, resultsOf } from '../lib/nba/teamRead.js'
import { clubLines } from '../lib/team/statLines.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const CLUBS = NBA_TEAMS.map((t) => t[0])
const SECTIONS = ['roster', 'schedule', 'stats', 'splits', 'calls', 'matchup']
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

ok('registry: NBA lists six sections, Players first', () => { assert.deepEqual(sectionsOf('nba').map((s) => s.id), SECTIONS); assert.equal(firstSection('nba'), 'roster'); assert.equal(NBA_CLUBS.length, 30) })
ok('every NBA club builds with the real files absent: header name + logo, six named empty states, neutral wording', () => {
  for (const c of CLUBS) {
    const v = buildNbaTeam({ team: c })
    assert.ok(v.header.name && v.header.known && /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nba\//.test(v.header.logo), `${c}: header`)
    assert.deepEqual(v.sections.map((s) => s.id), SECTIONS)
    for (const s of v.sections) { assert.equal(s.state, 'empty', `${c}/${s.id}`); assert.ok(s.empty.title && s.empty.note); assert.deepEqual(s.blocks, []) }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
  assert.equal(buildNbaTeam({ team: 'ZZZ' }).header.known, false)
})

// ── the feed's own shape ────────────────────────────────────────────────────
const cat = (name, vals) => ({ name, stats: Object.entries(vals).map(([abbreviation, value]) => ({ abbreviation, value, displayValue: String(value) })) })
ok('teamLine: the FIRST of each abbreviation is the per-game number (later ones are season totals)', () => {
  const j = { results: { stats: { categories: [cat('general', { GP: 82, REB: 46.4 }), cat('offensive', { PTS: 114.9, 'FG%': 46.7 }), cat('defensive', { DR: 33.9 })] } } }
  j.results.stats.categories[1].stats.push({ abbreviation: 'PTS', value: 9418 }, { abbreviation: 'FG%', value: 99 })
  const l = teamLine(j); assert.equal(l.pts, 114.9); assert.equal(l.fgPct, 46.7); assert.equal(l.reb, 46.4); assert.equal(l.dr, 33.9); assert.equal(l.gp, 82)
  assert.equal(teamLine({}), null)
})
const stats = Object.fromEntries(CLUBS.map((c, i) => [c, { gp: 82, reb: 40 + i / 10, pf: 19, pts: 105 + i / 3, fgPct: 44 + i / 15, tpPct: 35, ftPct: 78, tpm: 12 + i / 20, tpa: 35, fta: 20, or: 10, ast: 24, to: 15 - i / 20, dr: 33, stl: 7, blk: 5 }]))
const standings = Object.fromEntries(CLUBS.map((c, i) => [c, { abbrev: c, w: 20 + i, l: 62 - i, pct: (20 + i) / 82, seed: (i % 15) + 1, ppg: 105 + i / 3, oppg: 120 - i / 3, diff: `${i > 15 ? '+' : ''}${(i - 15) / 2}`, home: '12-10', road: '8-12', last10: '5-5', streak: 'W2' }]))
ok('statRowsNba: ranks of 30; fewest turnovers and points allowed are best', () => {
  const rows = statRowsNba(stats, standings)
  const first = Object.fromEntries(clubLines(rows, CLUBS[0]).map((l) => [l.key, l])); const last = Object.fromEntries(clubLines(rows, CLUBS[29]).map((l) => [l.key, l]))
  assert.equal(last.pts.rank.rank, 1); assert.equal(first.pts.rank.rank, 30); assert.equal(last.to.rank.rank, 1); assert.equal(last.opp.rank.rank, 1); assert.equal(first.pts.rank.of, 30)
  assert.equal(statRowsNba(null, null).length, 0)
})

// ── TEST fixtures ───────────────────────────────────────────────────────────
const SEASON = { cur: 2027, read: 2026, label: '2025-26', stale: true, phase: 1 }
const T = 'BOS'
const mkGames = () => {
  const opps = CLUBS.filter((c) => c !== T)
  const days = ['2025-10-22', '2025-10-24', '2025-10-25', '2025-10-28', '2025-11-02', '2025-11-03', '2025-11-06', '2025-12-01', '2025-12-02', '2025-12-05', '2026-01-10', '2026-02-11']
  return days.map((d, i) => ({ id: `g${i}`, start: `${d}T00:30:00Z`, seasonType: 2, home: i % 2 === 0, opp: opps[i], state: 'final', us: 100 + (i % 4) * 6, them: i % 3 === 0 ? 118 : 101, result: null }))
}
const sched = mkGames().map((g) => ({ ...g, result: g.us > g.them ? 'W' : 'L' }))
const results = resultsOf(sched, T)
ok('resultsOf: final regular-season games with the opponent\'s conference and division, oldest first, the ET game day', () => {
  assert.equal(results.length, 12); assert.ok(results[0].date <= results[11].date)
  const o = nbaTeam(sched[0].opp); assert.equal(results[0].sameConf, o.conf === nbaTeam(T).conf); assert.equal(results[0].sameDiv, o.div === nbaTeam(T).div)
  assert.equal(resultsOf([{ ...sched[0], seasonType: 1 }, { ...sched[1], state: 'pre' }], T).length, 0)
})
const next = { id: 'n1', start: '2026-10-14T23:30:00Z', seasonType: 1, home: true, opp: 'NY', state: 'pre' }
const deep = (over = {}) => ({
  team: nbaTeam(T), season: SEASON, standing: standings[T], lines: clubLines(statRowsNba(stats, standings), T), oppLines: clubLines(statRowsNba(stats, standings), 'NY'),
  schedule: [...sched.map((g) => ({ ...g, seasonType: 1 })), next], results,
  next: { game: next, model: { id: 'n1', total: 221.4, basis: 'this season and last', rest: { away: 1, home: 0 }, away: { abbrev: 'NY', pts: 108.9 }, home: { abbrev: T, pts: 112.5 } }, totals: { line: 222.5, source: 'book', projected: 221.4, called: true, rank: 2, of: 9 } },
  calls: [
    { gameId: 'a', date: '2026-04-01', playerId: '1', name: 'TEST Guard', opp: 'NY', market: 'pts', version: 'buckets-pts-v1', rank: 1, actual: 31, result: 'hit' },
    { gameId: 'b', date: '2026-03-30', playerId: '1', name: 'TEST Guard', opp: 'MIA', market: 'pts', version: 'buckets-pts-v1', rank: 1, actual: 18, result: 'miss' },
    { gameId: 'c', date: '2026-03-28', playerId: '2', name: 'TEST Big', opp: 'MIA', market: 'reb', version: 'buckets-reb-v1', rank: 2, actual: null, result: 'void' },
    { gameId: 'd', date: '2026-03-25', playerId: '2', name: 'TEST Big', opp: 'ATL', market: 'reb', version: 'buckets-reb-v1', rank: 2, actual: 14, result: 'hit' },
  ], ...over })
const payload = { team: nbaTeam(T), season: 2026, seasonLabel: '2025-26', stale: true, standing: standings[T], schedule: sched,
  players: [{ id: '11', name: 'TEST Guard', pos: 'G', jersey: '7', age: 27, injuries: ['Questionable'], gp: 70, min: 34.1, pts: 27.3, reb: 4.1, ast: 6.2, tpm: 3.1, onStats: true }, { id: '12', name: 'TEST Big', pos: 'C', jersey: '12', age: 24, injuries: [], gp: 60, min: 30, pts: 14, reb: 11, ast: 2, tpm: 0.2, onStats: true }, { id: '13', name: 'TEST Rookie', pos: 'F', jersey: '9', age: 20, injuries: [], onStats: false }] }
const board = { rows: [{ playerId: '11', team: T, status: 'called' }, { playerId: '12', team: T, status: 'board' }, { playerId: '99', team: 'NY', status: 'called' }] }
const all = (over, t = T) => buildNbaTeam({ team: t, payload, deep: deep(over), board, shots: true })
const sec = (v, id) => v.sections.find((s) => s.id === id)

ok('every club fills all six sections from TEST payloads; the season is named LAST SEASON in the preseason; a group on every column; neutral wording', () => {
  for (const c of CLUBS) {
    const v = buildNbaTeam({ team: c, payload: { ...payload, team: nbaTeam(c) }, deep: deep({ lines: clubLines(statRowsNba(stats, standings), c), oppLines: clubLines(statRowsNba(stats, standings), 'NY') }), board })
    for (const s of v.sections) {
      assert.equal(s.state, 'ok', `${c}/${s.id}: ${s.empty?.title} ${s.empty?.note}`)
      if (!['matchup', 'schedule'].includes(s.id)) assert.match(s.window, /2025-26 .*\(LAST SEASON\)/, `${c}/${s.id}: ${s.window}`)
      for (const b of s.blocks) if (b.type === 'table') for (const col of b.columns) assert.ok(col.group, `${c}/${s.id}/${b.id}: ${col.key} group`)
    }
    assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
  }
})
ok('header: last season\'s record named FINAL, seed in the conference, streak, home / road / last ten from the standings, next and last games', () => {
  const h = all().header
  assert.equal(h.record, `${standings[T].w}-${standings[T].l}`); assert.match(h.chips[0].label, /2025-26 FINAL/); assert.match(h.standing, /seed in the East/)
  assert.ok(h.summary.some((x) => /^Home 12-10/.test(x)) && h.summary.some((x) => /^Streak W2/.test(x)))
  assert.equal(h.next.gameId, 'n1'); assert.equal(h.last5.length, 5)
})
ok('players: the board\'s word is the model\'s own, injuries are ESPN\'s words, no invented role', () => {
  const s = sec(all(), 'roster'); const rows = s.blocks.find((b) => b.id === 'players').rows
  assert.equal(rows.find((r) => r.name === 'TEST Guard').status, 'called'); assert.equal(rows.find((r) => r.name === 'TEST Big').status, 'board'); assert.equal(rows.find((r) => r.name === 'TEST Rookie').status, null)
  assert.equal(rows.find((r) => r.name === 'TEST Guard').inj, 'Questionable')
  assert.ok(s.blocks.some((b) => b.type === 'slot' && b.slot === 'injuries')); assert.match(s.status, /1 CALLED · 1 ON THE BOARD/); assert.match(s.window, /2 players with a line/)
  assert.ok(!rows.some((r) => 'role' in r)); assert.equal(sec(all(), 'roster').blocks.find((b) => b.type === 'note').text.includes('no depth role'), true)
})
ok('splits: every row is arithmetic over the club\'s own results; home + away = all; rest rows carry their games and no claim', () => {
  const s = sec(all(), 'splits')
  const ha = s.blocks.find((b) => b.id === 'split-ha').rows
  assert.equal(ha.reduce((a, r) => a + r.g, 0), 12); assert.equal(ha[0].w + ha[1].w, results.filter((g) => g.result === 'W').length)
  const home = results.filter((g) => g.home); assert.equal(ha[0].g, home.length); assert.equal(ha[0].ppg, home.reduce((a, g) => a + g.us, 0) / home.length)
  assert.match(ha[0].range, /^\d+–\d+%$/)
  const rest = restOf(results); const rr = s.blocks.find((b) => b.id === 'split-rest').rows
  assert.equal(rr.find((r) => /Back-to-back/.test(r.label)).g, [...rest.values()].filter((v) => v === 0).length)
  assert.ok(s.blocks.find((b) => b.id === 'split-rest').caption.includes('nothing here reads rest as a lean'))
  for (const b of s.blocks.filter((x) => x.type === 'table')) { assert.match(b.caption, /Source: Our log, 2025-26 regular season/); for (const r of b.rows) assert.ok(r.g > 0 && r.src) }
  assert.ok(s.blocks.some((b) => b.type === 'note' && /ESPN publishes no team-splits feed/.test(b.text)))
  assert.equal(splitRow('x', 's', []).g, 0)
})
ok('splits: months only for months with games; opponent rows partition the games', () => {
  const s = sec(all(), 'splits'); const mo = s.blocks.find((b) => b.id === 'split-month').rows
  assert.ok(mo.some((r) => r.label === 'October') && !mo.some((r) => r.label === 'July')); assert.equal(mo.reduce((a, r) => a + r.g, 0), 12)
  const opp = s.blocks.find((b) => b.id === 'split-opp').rows; const sameConf = opp.find((r) => /^vs (East|West)$/.test(r.label) && r.label.includes(nbaTeam(T).conf === 'E' ? 'East' : 'West'))
  assert.equal(opp.filter((r) => /^vs (East|West)$/.test(r.label)).reduce((a, r) => a + r.g, 0), 12); assert.ok(sameConf)
})
ok('calls: per market and version (never pooled), void and pending outside n, last calls with the graded word', () => {
  const s = sec(all(), 'calls'); const sum = s.blocks.find((b) => b.id === 'calls-sum').rows
  assert.equal(sum.length, 2); const pts = sum.find((r) => /Points/.test(r.scope)); const reb = sum.find((r) => /Rebounds/.test(r.scope))
  assert.deepEqual([pts.n, pts.hit], [2, 1]); assert.deepEqual([reb.n, reb.hit], [1, 1])
  assert.deepEqual(s.blocks.find((b) => b.id === 'calls-last').rows.map((r) => r.word), ['HIT', 'MISSED', 'DID NOT PLAY', 'HIT'])
  assert.equal(sec(all({ calls: [] }), 'calls').state, 'empty'); assert.equal(sec(all({ calls: null }), 'calls').state, 'empty')
})
ok('next game: the model\'s expected points with days off, the stored line, both clubs in the injury module, ranks both ways', () => {
  const s = sec(all(), 'matchup')
  assert.ok(s.blocks.some((b) => b.id === 'mu-model') && s.blocks.some((b) => b.id === 'mu-attack') && s.blocks.some((b) => b.id === 'mu-defence'))
  assert.deepEqual(s.blocks.find((b) => b.type === 'slot').props.clubs, ['NY', T])
  assert.ok(s.blocks.some((b) => b.type === 'note' && /line 222\.5 \(the book total\), rank 2 of 9 on the slate, CALLED/.test(b.text)))
  assert.match(s.window, /^Next game · 2026-10-14 · vs NY · preseason/)
  assert.equal(sec(all({ next: null }), 'matchup').state, 'empty')
  const noModel = sec(all({ next: { game: next, model: null, totals: null } }), 'matchup'); assert.ok(noModel.blocks.some((b) => b.type === 'note' && /No team-model number/.test(b.text)))
})
ok('stats: offence, defence, overall with the rank of 30, and where the club shoots from as a slot', () => {
  const s = sec(all(), 'stats'); assert.ok(['stats-offence', 'stats-defence', 'stats-overall'].every((id) => s.blocks.some((b) => b.id === id)))
  assert.ok(s.blocks.some((b) => b.type === 'slot' && b.slot === 'shots')); assert.ok(s.blocks.find((b) => b.id === 'stats-defence').rows.some((r) => /of 30/.test(r.rankTxt)))
  assert.equal(sec(all({ lines: [] }), 'stats').state, 'empty')
})

// ── THE HIDING ──────────────────────────────────────────────────────────────
ok('every route behind the page is gated: 404 until BUCKETS_PUBLIC=on, private while gated', () => {
  const r = read('app/api/buckets/teamdeep/route.js')
  assert.match(r, /bucketsRoute\(/); assert.match(r, /from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/nba\/respond'/)
  assert.ok(!/export (async )?function GET/.test(r))   // the gated handler is the only GET
  const g = read('lib/nba/gate.js'); assert.match(g, /BUCKETS_PUBLIC/); assert.match(g, /status: 404/)
  assert.match(read('lib/nba/respond.js'), /bucketsPublic\(\) \? `public/)
  for (const f of ['app/api/buckets/team/route.js']) assert.match(read(f), /bucketsRoute\(/)
})
ok('nothing of it is public: the sitemap and the crawlable pages do not name a BUCKETS team page; the tab is inside the BUCKETS shell only', () => {
  const sm = read('app/sitemap.js'); assert.ok(!/buckets|nba/i.test(sm.replace(/\/\/.*$/gm, '')), 'the sitemap names BUCKETS')
  assert.match(read('lib/routes.js'), /TEAM_HREF_SPORTS/); assert.match(read('lib/routes.js'), /isHiddenSport\(k\)/)
  assert.match(read('components/buckets/BucketsDashboard.js'), /tab === 'team'/)
  const t = read('components/buckets/tabs/Team.js'); assert.match(t, /TeamPage/); assert.match(t, /buildNbaTeam/); assert.match(t, /useBucketsTeamDeep/)
})
ok('no probability is printed; the team model says expected points and is not a pick', () => {
  const all2 = viewStrings(all()).join('\n'); assert.ok(!/\b(win probability|chance to|% chance|probability of)\b/i.test(all2))
  assert.ok(/not a pick and not a probability/.test(all2))
})

// ── optional: the live feeds, every club, through the gated route (--base URL, server run with BUCKETS_PUBLIC=on) ──
const ix = process.argv.indexOf('--base')
if (ix > 0) {
  const base = process.argv[ix + 1]
  const j = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null } catch { return null } }
  let filled = 0
  for (const c of CLUBS) {
    try {
      const [p, d] = [await j(`${base}/api/buckets/team?team=${c}`), await j(`${base}/api/buckets/teamdeep?team=${c}`)]
      const v = buildNbaTeam({ team: c, payload: p, deep: d, board: null })
      assert.ok(v.header.name && v.header.logo); assert.equal(v.sections.length, 6); assert.deepEqual(neutralProblems(viewStrings(v)), [], `${c}: wording`)
      const empties = v.sections.filter((s) => s.state !== 'ok').map((s) => `${s.id}(${s.empty?.title})`)
      filled += 6 - empties.length
      console.log(`ok   live ${c}: ${6 - empties.length}/6${empties.length ? ` empty: ${empties.join(', ')}` : ''}${p && d ? '' : ' [a feed was down]'}`)
    } catch (e) { fail += 1; console.log(`FAIL live ${c}: ${e.message}`) }
  }
  console.log(`live: ${filled} of ${CLUBS.length * 6} sections filled`)
} else console.log('(live check skipped: pass --base with the server running BUCKETS_PUBLIC=on)')

console.log(fail ? `\n${fail} FAILED` : '\nall NBA team-page checks passed')
process.exit(fail ? 1 : 0)
