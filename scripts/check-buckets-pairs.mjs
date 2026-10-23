#!/usr/bin/env node
// BUCKETS PAIRS + SLIP PAIR HISTORY + POINTS WRITE-UP (2026-10-15). TEST data only (every name says TEST); no network, no database, nothing posted.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-buckets-pairs.mjs
// Holds:
//   1. the reducer: a 25-point day for both is a joint event; joint days need both PLAYED; preseason, void and unnumbered rows never count;
//      nothing under the thresholds is listed; no row at all -> a valid EMPTY file (the page says "builds as the season plays"); inactive players are left out
//   2. the file is read by the one reader every sport uses (lib/pairHistV2.js) and rows come out ranked
//   3. the slip: only event legs get a note, a listed pair quotes its stored counts, an unlisted pair says so and invents nothing, no file -> no note
//   4. the points write-up: a called points man reads his own numbers; a game with no points rows reads exactly as before (the post is unchanged)
//   5. routing: pairs / power resolve, the old words land on them, accountability and bot land where the record and the picks are
import assert from 'node:assert/strict'

let n = 0
const ok = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`) }
delete process.env.BUCKETS_PUBLIC; delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC

const H = await import('../lib/nba/pairHistory.js')
const V2 = await import('../lib/pairHistV2.js')
const SLIP = await import('../lib/slipPairHist.js')
const WU = await import('../lib/writeups/nba.js')
const R = await import('../lib/nba/routes.js')
const DS = await import('../lib/dataSource.js')

// 6 regular-season nights; A and B both score 25+ on 3 of them (two in the same game), C is quiet
const days = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-12']
const row = (day, id, name, team, pts, game, extra = {}) => ({ game_id: game, game_date: day, player_id: id, name, team, actual: pts, played: true, season_type: 2, ...extra })
const rows = []
days.forEach((d, i) => {
  const hot = i < 3
  rows.push(row(d, '1', 'TEST Alpha', 'AAA', hot ? 31 : 12, `g${i}`))
  rows.push(row(d, '2', 'TEST Bravo', i === 0 ? 'AAA' : 'BBB', hot ? 27 : 10, i === 0 ? `g${i}` : `h${i}`))
  rows.push(row(d, '3', 'TEST Charlie', 'CCC', 8, `k${i}`))
})
await ok('a joint 25+ day counts once per pair; same-game is counted apart; thresholds list only the pair that earned it', () => {
  const f = H.buildNbaPairHist(rows)
  assert.equal(f.model_version, 'pairhist_v2'); assert.equal(f.sport, 'nba')
  assert.deepEqual(f.seasons_covered, [2026])
  assert.equal(f.pairs.length, 1)
  const p = f.pairs[0]
  assert.equal(p.joint_days, 6); assert.equal(p.joint_event_days, 3); assert.equal(p.same_game_event_days, 1)
  assert.equal(p.rate, 0.5); assert.equal(p.last_joint_date, '2026-11-06')
  assert.deepEqual(p.seasons['2026'], [6, 3])
  // expected = joint days x his rate x his rate = 6 x .5 x .5
  assert.equal(p.expected_joint, 1.5); assert.equal(p.lift, 2)
  assert.deepEqual(f.thresholds, { min_joint_days: 5, min_joint_event_days: 2 })
})
await ok('preseason, void (played=false) and unnumbered rows never count', () => {
  const bad = rows.map((r) => ({ ...r, season_type: 1 }))
  assert.equal(H.buildNbaPairHist(bad).pairs.length, 0)
  const dnp = rows.map((r) => (r.player_id === '2' ? { ...r, played: false } : r))
  assert.equal(H.buildNbaPairHist(dnp).pairs.length, 0)
  const nul = rows.map((r) => (r.player_id === '2' ? { ...r, actual: null } : r))
  assert.equal(H.buildNbaPairHist(nul).pairs.length, 0)
})
await ok('two joint events are not enough with under 5 joint days; and a player with no game in 3 weeks is not active', () => {
  const few = rows.filter((r) => r.game_date <= '2026-11-06')   // 3 joint days, 3 events
  assert.equal(H.buildNbaPairHist(few).pairs.length, 0)
  const late = [...rows, row('2026-12-20', '9', 'TEST Late', 'ZZZ', 5, 'z1')]   // newest day is 12-20: A and B last played 11-12, 38 days earlier
  const f = H.buildNbaPairHist(late)
  assert.equal(f.pairs.length, 0)
})
await ok('no graded row -> a valid empty file, nothing invented', () => {
  const f = H.buildNbaPairHist([])
  assert.equal(f.pairs.length, 0); assert.deepEqual(f.seasons_covered, [])
  assert.ok(V2.readPairHistV2(f, 'nba'), 'the reader accepts an empty nba file')
  assert.equal(V2.pairHistRows(f).length, 0)
  assert.equal(H.buildNbaPairHist(null).pairs.length, 0)
})
await ok('the shared reader ranks it and labels NBA seasons 26-27', () => {
  const f = H.buildNbaPairHist(rows)
  const t = V2.pairHistRows(f)
  assert.equal(t.length, 1); assert.equal(t[0].rank, 1); assert.equal(t[0].je, 3); assert.equal(t[0].rate, 50)
  assert.equal(t[0].s2026, 3)
  assert.equal(V2.seasonLabel('nba', 2026), '26-27'); assert.equal(V2.seasonLabel('mlb', 2026), '2026')
  assert.deepEqual(DS.pairHistV2Paths('nba'), ['/api/buckets/pairs'])
  assert.match(DS.pairHistV2Paths('nhl')[0], /pairhist_v2_nhl\.json$/)
})

// ── the slip ──
const file = H.buildNbaPairHist(rows)
const cfg = { sport: 'nba', idOf: (r) => String(r.id), nameOf: (r) => r.name, isEventLeg: (k) => k === 'pts' }
const leg = (id, name, k = 'pts') => ({ key: `${id}|${k}`, k, r: { id, name } })
await ok('slip: a listed pair quotes its stored counts and says it is history', () => {
  const notes = SLIP.pairHistNotes([leg('1', 'TEST Alpha'), leg('2', 'TEST Bravo')], file, cfg)
  assert.equal(notes.length, 1)
  assert.match(notes[0].text, /3 of 6 shared games \(50\.0%\)/); assert.match(notes[0].text, /1 in the same game/); assert.match(notes[0].text, /lift 2\.00/); assert.match(notes[0].text, /History, not a forecast/)
  assert.equal(notes[0].a, 'TEST Alpha'); assert.equal(notes[0].b, 'TEST Bravo')
  // order does not matter
  assert.equal(SLIP.pairHistNotes([leg('2', 'TEST Bravo'), leg('1', 'TEST Alpha')], file, cfg).length, 1)
})
await ok('slip: an unlisted pair says so and quotes nothing; a non-event leg gets no note; no file, no note', () => {
  const un = SLIP.pairHistNotes([leg('1', 'TEST Alpha'), leg('3', 'TEST Charlie')], file, cfg)
  assert.equal(un.length, 1); assert.match(un[0].text, /Not in the pair history/); assert.equal(un[0].rate, null)
  assert.ok(!/\d+(\.\d)?%/.test(un[0].text), 'no percentage is quoted for a pair that is not listed')
  assert.equal(SLIP.pairHistNotes([leg('1', 'TEST Alpha', 'reb'), leg('2', 'TEST Bravo')], file, cfg).length, 0)
  assert.equal(SLIP.pairHistNotes([leg('1', 'TEST Alpha'), leg('2', 'TEST Bravo')], null, cfg).length, 0)
  assert.equal(SLIP.pairHistNotes([leg('1', 'TEST Alpha'), leg('1', 'TEST Alpha', 'pts')], file, cfg).length, 0)
  assert.equal(SLIP.pairHistNotes([leg('1', 'x'), leg('2', 'y')], file, { ...cfg, sport: 'mlb' }).length, 0)
})

// ── the points write-up ──
const game = { id: '401000001', start: '2026-11-20T00:00:00Z', away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' }, venue: 'TEST Arena' }
const call = (id, name, team, opp, extra = {}) => ({ playerId: id, name, team, opp, home: team === 'BBB', gameId: game.id, pos: 'G', score: 88, status: 'called', role: 'TOP', nightRank: 1, nightOf: 40, injury: null, ...extra })
await ok('points write-up: the called man reads his own numbers; with no points rows the write-up is the old one', () => {
  const pts = call('1', 'TEST Alpha', 'AAA', 'BBB', { legs: { ptsPg: 28.4, minPg: 35, fgaPg: 21.2, oppPts: 118.2 }, pct: { ptsPg: 95, minPg: 90, fgaPg: 92, oppPts: 80 } })
  const w = WU.buildNbaWriteup({ game, rows: { pts: [pts] } })
  assert.equal(w.players.length, 1)
  assert.deepEqual(w.players[0].markets.map((m) => m.word), ['25+ points'])
  const t = w.players[0].why.map((l) => l.t).join(' | ')
  assert.match(t, /28\.4 points a game/); assert.match(t, /21\.2 shots a game(?! \()/); assert.match(t, /BBB allow 118\.2 points a game/); assert.doesNotMatch(t, /top \d+%|percentile/)   // the stat, never a percentile (2026-10-23, #265)
  for (const l of w.players[0].why) assert.ok(l.v.every((v) => String(l.t).includes(String(v))), `a printed value is in the line: ${l.t}`)
  // the old shape: dd only, byte-identical markets
  const dd = call('2', 'TEST Bravo', 'BBB', 'AAA', { ctx: { logGames: 40, ddGames: 20 }, legs: { minPg: 34 }, pct: { minPg: 80 } })
  const old = WU.buildNbaWriteup({ game, rows: { dd: [dd], td: [] } })
  assert.deepEqual(old.markets, ['double-double'])
  const none = WU.buildNbaWriteup({ game, rows: { pts: [], dd: [], td: [] } })
  assert.equal(none, null)
  // a man called for points and double-double reads both markets
  const both = WU.buildNbaWriteup({ game, rows: { pts: [pts], dd: [{ ...pts, ctx: { logGames: 40, ddGames: 20 } }] } })
  assert.deepEqual(both.players[0].markets.map((m) => m.word), ['25+ points', 'double-double'])
})

// ── routing ──
await ok('routing: pairs and power are tabs; the other products\' words land on them; bot and accountability land on the picks and the record', async () => {
  assert.ok(R.NBA_TABS.includes('pairs')); assert.ok(R.NBA_TABS.includes('power'))
  assert.equal(R.NBA_ALIASES.explosive, 'power'); assert.equal(R.NBA_ALIASES.pairhist, 'pairs'); assert.equal(R.NBA_ALIASES.bot, 'board')
  assert.ok(R.NBA_MORE_GROUPS.some(([, keys]) => keys.includes('pairs')) && R.NBA_MORE_GROUPS.some(([, keys]) => keys.includes('power')))
  const LV = await import('../lib/ledger/views.js')
  assert.equal(LV.LEDGER_ALIAS_VIEW.accountability, 'record'); assert.equal(R.NBA_ALIASES.accountability, 'ledger')
})

console.log(`\n${n} checks passed`)
