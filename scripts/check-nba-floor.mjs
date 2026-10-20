#!/usr/bin/env node
// THE BUCKETS PUBLIC-NUMBER FLOOR, CHECKED (2026-10-12). TEST DATA: every night, player and call below is MADE UP (generated here),
// none of it is a real result and none of it reaches the site. Until a market has 30 graded regular-season nights, no hit count,
// rate or "X of Y" is made for it: the word is "tracking", with n and the nights so far. Even with BUCKETS public.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nba-floor.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const F = await import('../lib/record/nbaFloor.js')
const LAD = await import('../lib/record/ladder.js')
const GEN = await import('../lib/calibration/generic.js')
const CL = await import('../lib/record/callsLanded.js')
const LD = await import('../lib/record/ladder.js')
const require_core = await import('../lib/calledLast/core.js')

// TEST: a made-up calendar, `k` consecutive nights
const day = (i) => `2027-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`
const callRows = (market, k, { perNight = 2, season_type = 2, hitEvery = 2 } = {}) => Array.from({ length: k * perNight }, (_, i) => ({
  game_date: day(Math.floor(i / perNight)), game_id: `TEST-${market}-${i}`, player_id: `TEST-P${i}`, market, status: 'called', season_type, hit: i % hitEvery === 0, name: `Test Player ${i}`,
}))

await ok('one constant: the floor IS the ladder\'s own bar (30), and 29 nights is tracking, 30 is not', () => {
  assert.equal(F.NBA_MIN_NIGHTS, LAD.LADDER_MIN_N); assert.equal(F.NBA_MIN_NIGHTS, 30)
  assert.equal(F.isTracking(29), true); assert.equal(F.isTracking(30), false); assert.equal(F.isTracking(0), true); assert.equal(F.isTracking(undefined), true)
  assert.match(F.trackingWords({ n: 12, nights: 3 }), /^tracking · 12 graded calls, 3 of 30 nights$/)
  assert.match(F.trackingWords({ n: 1, nights: 1 }), /1 graded call,/)
})

await ok('calibration (/api/calibration?sport=nba, /called, /start): 29 nights = tracking with n and no hits, rate, board rate, lift or PROVEN; 30 nights = the rate', () => {
  const tier = (k, perNight) => ({ key: 'pts', label: 'PTS 25+', kind: 'status', status: 'called', bar: '25+', graded: callRows('pts', k, { perNight }).map((r) => ({ date: r.game_date, hit: r.hit })), void: 0, board: callRows('pts', k, { perNight }).map((r) => ({ date: r.game_date, hit: r.hit })) })
  const under = GEN.blockFrom('nba', [tier(29, 4)], { minNights: F.NBA_MIN_NIGHTS }).tiers[0]   // 116 calls: plenty of n, too few nights
  assert.equal(under.tracking, true); assert.equal(under.enough, false); assert.equal(under.n, 116); assert.equal(under.nights, 29)
  assert.equal(under.hits, null); assert.equal(under.misses, null); assert.equal(under.rate, null); assert.equal(under.lift, null)
  assert.deepEqual(under.board, { n: 116, hits: null, rate: null }); assert.equal(under.proof.state, 'few'); assert.equal(under.minNights, 30)
  const over = GEN.blockFrom('nba', [tier(30, 2)], { minNights: F.NBA_MIN_NIGHTS }).tiers[0]
  assert.equal(over.tracking, false); assert.equal(over.enough, true); assert.equal(over.hits, 30); assert.equal(over.rate, 50)
  // other sports: no minNights, nothing changes
  const nhl = GEN.blockFrom('nhl', [tier(5, 10)]).tiers[0]
  assert.equal(nhl.tracking, false); assert.equal(nhl.hits, 25); assert.equal(nhl.enough, true)
  assert.match(fs.readFileSync(new URL('../lib/calibration/readSportCalibration.js', import.meta.url), 'utf8'), /blockFrom\('nba', by\.regular, fl\)/)
})

await ok('/called\'s "N of M landed": no pooled line from a block with a tracking market; the tracking lines name the market, n and nights', () => {
  const t = (key, label, k) => GEN.blockFrom('nba', [{ key, label, kind: 'status', status: 'called', bar: 'x', graded: callRows(key, k).map((r) => ({ date: r.game_date, hit: r.hit })), void: 0, board: null }], { minNights: 30 }).tiers[0]
  const cal = { minN: 30, regular: { nights: 30, tiers: [t('pts', 'PTS 25+', 30), t('reb', 'REB 10+', 3)] } }
  assert.equal(CL.callsLandedFrom(cal), null)
  const tr = CL.callsTrackingFrom(cal)
  assert.equal(tr.markets.length, 1); assert.deepEqual(tr.markets[0], { label: 'REB 10+', n: 6, nights: 3 })
  const allOk = { minN: 30, regular: { nights: 30, tiers: [t('pts', 'PTS 25+', 30)] } }
  assert.ok(CL.callsLandedFrom(allOk)); assert.equal(CL.callsTrackingFrom(allOk), null)
})

await ok('the market ladder (Wave 8, BUCKETS): a tracking market prints n and "tracking, k of 30 nights" -- never "0 of n", a rate or a base; an open market prints as before', () => {
  const t = (key, label, k) => GEN.blockFrom('nba', [{ key, label, kind: 'status', status: 'called', bar: key === 'pts' ? '25+' : '10+', graded: callRows(key, k).map((r) => ({ date: r.game_date, hit: r.hit })), void: 0, board: callRows(key, k).map((r) => ({ date: r.game_date, hit: r.hit })) }], { minNights: 30 }).tiers[0]
  const cal = { sport: 'nba', minN: 30, regular: { nights: 30, unit: 'night', tiers: [t('pts', 'PTS 25+', 30), t('reb', 'REB 10+', 4)] }, post: { nights: 0, tiers: [] } }
  const l = LD.marketLadderFrom(cal, { sport: 'nba' })
  const pts = l.rows.find((r) => r.key === 'pts'); const reb = l.rows.find((r) => r.key === 'reb')
  assert.equal(reb.floorTracking, true); assert.equal(reb.hits, null); assert.equal(reb.rate, null); assert.equal(reb.base, null); assert.equal(reb.n, 8); assert.equal(reb.nights, 4)
  const c = LD.marketCells(reb, 30)
  assert.equal(c.of, 'n=8'); assert.equal(c.rate, '\u2014'); assert.equal(c.tracking, true); assert.equal(c.vs, null)
  assert.equal(pts.floorTracking, undefined); assert.equal(pts.hits, 30); assert.match(LD.marketCells(pts, 30).of, /^30 of 60$/)
  const only = LD.marketLadderFrom({ ...cal, regular: { ...cal.regular, tiers: [t('reb', 'REB 10+', 4)] } }, { sport: 'nba' })
  const words = [LD.marketOneLine(only), LD.marketSentence(only)].join(' | ')
  assert.ok(!/ of 8|\d+(\.\d)?%|cleared/.test(words), words)
})

await ok('Record tab (/api/buckets/record): a market under 30 regular-season nights sends n and "tracking" and no hit count, no called-that-hit rows, no missed 25-point scorers', () => {
  const rows = [...callRows('pts', 29), ...callRows('reb', 30), { game_date: day(0), game_id: 'TEST-away', player_id: 'TEST-A', market: 'pts', status: 'board', season_type: 2, hit: true, name: 'Test Away' }]
  const r = F.foldBucketsNights(rows)
  assert.deepEqual(Object.keys(r.tracking), ['pts']); assert.deepEqual(r.tracking.pts, { n: 58, nights: 29, minNights: 30 })
  for (const night of r.nights.filter((x) => x.markets.pts)) {
    assert.equal(night.markets.pts.hit, undefined); assert.equal(night.markets.pts.tracking, true); assert.ok(night.markets.pts.n > 0)
    assert.equal(night.called.filter((x) => x.market === 'pts').length, 0); assert.equal(night.away.length, 0)
  }
  for (const night of r.nights.filter((x) => x.markets.reb)) assert.equal(typeof night.markets.reb.hit, 'number')   // 30 nights: counted
  assert.ok(r.nights.some((x) => x.called.some((c) => c.market === 'reb')))
  // the 30th night opens the points market
  const open = F.foldBucketsNights([...callRows('pts', 30), { game_date: day(0), game_id: 'TEST-away', player_id: 'TEST-A', market: 'pts', status: 'board', season_type: 2, hit: true }])
  assert.deepEqual(open.tracking, {}); assert.equal(open.nights[0].markets.pts.hit, 1); assert.equal(open.nights[0].away.length, 1)
})

await ok('preseason nights do not count toward the floor, and a preseason night is hidden too while the market is tracking', () => {
  const pre = callRows('pts', 30, { season_type: 1 })
  const r = F.foldBucketsNights(pre)
  assert.equal(r.tracking.pts.nights, 0); assert.ok(r.nights.every((x) => x.markets.pts.tracking && x.called.length === 0))
  const mixed = F.foldBucketsNights([...callRows('pts', 10), ...callRows('pts', 30, { season_type: 1 })])
  assert.equal(mixed.tracking.pts.nights, 10)
})

await ok('regular season and playoffs both count (season_type 2 and 3); only preseason (1) is out', () => {
  const rows = [...callRows('pts', 20), ...callRows('pts', 10, { season_type: 3 }).map((r, i) => ({ ...r, game_date: day(20 + Math.floor(i / 2)) }))]
  assert.deepEqual(F.foldBucketsNights(rows).tracking, {})
})

await ok('/api/record/calls: a tracking market loses every call row (results are the record) and is listed with n and nights; an open market keeps its rows; a market with only voids is tracking too', () => {
  const calls = [...callRows('pts', 30).map((r) => ({ market: 'pts', game_date: r.game_date, result: r.hit ? 'hit' : 'miss', name: r.name })), ...callRows('reb', 5).map((r) => ({ market: 'reb', game_date: r.game_date, result: r.hit ? 'hit' : 'miss' })), { market: 'dd', game_date: day(0), result: 'void' }]
  const f = F.floorCalls(calls, (m) => m.toUpperCase())
  assert.equal(f.calls.filter((c) => c.market === 'pts').length, 60); assert.equal(f.calls.filter((c) => c.market === 'reb').length, 0); assert.equal(f.calls.filter((c) => c.market === 'dd').length, 0)
  assert.deepEqual(f.tracking, [{ market: 'reb', label: 'REB', n: 10, nights: 5, minNights: 30 }])
})

await ok('the routes and pages use the floor (read the source): record, calls, ledger, /called, the player page, calibration', () => {
  const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  assert.match(src('app/api/buckets/record/route.js'), /foldBucketsNights\(rows\)/)
  assert.match(src('app/api/record/calls/route.js'), /floorCalls\(keep/)
  assert.match(src('app/api/buckets/ledger/route.js'), /trackingOf\(floor, k\)/)
  assert.match(src('app/called/page.js'), /trackNba/)
  // /start was retired 10-16 (a redirect now); the player page took its place on the list 10-19: his record lines read only open markets
  assert.match(src('app/api/buckets/player/route.js'), /!trackingOf\(floor, r\.market\)/)
  assert.match(src('lib/record/page.js'), /!tracking\.pts &&/)
})

// ── THE NIGHT RECEIPT and CALLED LAST NIGHT and the ANGLE TITLES (2026-10-12, Donovan) ── TEST data, all made up ──
await ok('night receipt: an NBA call under the 30-night floor is named with no tally, no record line and no "x of y"; open = counted like any sport; other sports identical', async () => {
  process.env.BUCKETS_PUBLIC = 'on'
  const RC = await import('../lib/posts/receipt.js')
  const slate = (nbaIds) => ({ day: '2027-01-09', kind: 'slate', x_post_id: '7001', payload: { v: 1, named_by_sport: { mlb: ['m1'], nba: nbaIds }, lines: [
    { sport: 'mlb', player_id: 'm1', name: 'Test Hitter', team: 'LAD' }, ...nbaIds.map((id) => ({ sport: 'nba', player_id: id, name: `Test Guard ${id}`, team: 'TST' }))] } })
  const brow = (id, hit) => [id, { market: 'pts', graded_at: 'x', played: true, hit }]
  const run = (floor, nbaIds = ['b1', 'b2']) => RC.assembleReceipt({
    day: '2027-01-09', rows: [slate(nbaIds)], now: Date.parse('2027-01-10T12:00:00Z'),
    results: { mlb: { homered: new Set(['m1']), lines: { m1: { ab: 4, h: 1, hr: 1, tb: 4, r: 1, rbi: 1 } }, linesOk: true, postponed: new Set() }, nba: { rows: new Map([brow('b1', true), brow('b2', false)]), floor } },
    games: { mlb: [{ id: '1', teams: ['LAD'], final: true, startMs: 0 }], nba: [{ id: '9', teams: ['TST'], final: true, startMs: 0 }] },
  })
  const under = run({ pts: { n: 12, nights: 3, tracking: true } })
  assert.equal(under.state, 'go')
  assert.match(under.text, /CALLED · 1 of 1 cashed/)                                   // MLB only: the tracking NBA calls are not in the tally
  assert.match(under.text, /BUCKETS · tracking · 12 graded calls, 3 of 30 nights/)
  assert.ok(!/Test Guard/.test(under.text), 'the X text names no tracking NBA player')
  assert.deepEqual(under.payload.counts, { cashed: 1, missed: 0, void: 0 }); assert.equal(under.payload.by_sport.nba, undefined)
  assert.ok(under.payload.results.filter((r) => r.sport === 'nba').every((r) => r.tracking === true))
  const emb = JSON.stringify(under.embed)
  assert.match(emb, /Test Guard b1/); assert.match(emb, /tracking · 12 graded calls, 3 of 30 nights/); assert.ok(!/2 for 3|1 for 3/.test(emb), emb)
  assert.equal(JSON.stringify(run(null).text.match(/tracking[^\n]*/)), JSON.stringify(['tracking · 30-night floor']))   // unreadable floor fails closed
  // only NBA calls, all under the floor: nothing cashed in the record = no post
  const onlyNba = RC.assembleReceipt({ day: '2027-01-09', rows: [slate(['b1'])].map((r) => ({ ...r, payload: { ...r.payload, lines: r.payload.lines.slice(1), named_by_sport: { nba: ['b1'] } } })), now: Date.parse('2027-01-10T12:00:00Z'), results: { nba: { rows: new Map([brow('b1', true)]), floor: { pts: { n: 1, nights: 1 } } } }, games: { nba: [{ id: '9', teams: ['TST'], final: true, startMs: 0 }] } })
  assert.equal(onlyNba.state, 'none')
  // 30 nights: counted
  const open = run({ pts: { n: 60, nights: 30, tracking: false } })
  assert.match(open.text, /CALLED · 2 of 3 cashed/); assert.ok(!/tracking/.test(open.text)); assert.equal(open.payload.by_sport.nba.cashed, 1)
  delete process.env.BUCKETS_PUBLIC
})

await ok('Called Last Night (NBA): the payload says tracking with n and nights under the floor; the summary prints no hit/miss tally; at 30 nights and for other sports it is unchanged', () => {
  const CC = require_core
  const s = { called: 5, hit: 2, miss: 3, void: 0, pending: 0 }
  const tr = { n: 12, nights: 3, minNights: 30 }
  assert.equal(CC.summaryLine('2027-01-08', s, tr), '5 called Fri Jan 8 · tracking · 12 graded calls, 3 of 30 nights')
  assert.equal(CC.summaryShort(s, tr), '5 called · tracking')
  assert.ok(!/\bhit\b|missed|%/.test(`${CC.summaryLine('2027-01-08', s, tr)} ${CC.summaryShort(s, tr)}`))
  assert.equal(CC.summaryLine('2027-01-08', s), '5 called Fri Jan 8 · 2 hit · 3 missed')
  assert.equal(CC.summaryShort(s), '5 called · 2 hit · 3 missed')
})

await ok('Called Last Night reader (NBA) is wired to the floor (read the source); the payload carries tracking only when set', async () => {
  const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  assert.match(src('lib/calledLast/read.js'), /trackingOf\(floor, 'pts'\)/)
  assert.match(src('components/CalledLastNight.js'), /summaryShort\(s, lens\.tracking\)/)
  const A = await import('../lib/calledLast/adapters.js')
  assert.equal(A.payloadOf({ sport: 'nba', slate: '2027-01-09' }).tracking, undefined)
  assert.deepEqual(A.payloadOf({ sport: 'nba', slate: '2027-01-09', tracking: { n: 1, nights: 1, minNights: 30 } }).tracking, { n: 1, nights: 1, minNights: 30 })
})

await ok('NBA angle titles: under the floor they say tracking and "back-test, not the live record" with the replay\'s own n and NO rate and NO "x of n"; open, the replay\'s x of n prints still labelled a back-test', async () => {
  // plain node cannot import the site's .json without an attribute (Next can): a tiny loader turns it into a default export
  const { register } = await import('node:module')
  register(`data:text/javascript,${encodeURIComponent('export async function load(u, c, next) { if (u.endsWith(".json")) { const { readFileSync } = await import("node:fs"); const { fileURLToPath } = await import("node:url"); return { format: "module", shortCircuit: true, source: "export default " + readFileSync(fileURLToPath(u), "utf8") } } return next(u, c) }')}`, import.meta.url)
  const { bucketsAngles } = await import('../lib/nba/angles.js')
  const BT = JSON.parse(fs.readFileSync(new URL('../lib/nba/angleBacktest.json', import.meta.url), 'utf8'))
  const rows = [{ opp: 'AAA', score: 90, legs: { oppPts: 1 }, pct: { fgaPg: 90 } }, { opp: 'BBB', score: 50, legs: { oppPts: 0 }, pct: { fgaPg: 10 } }]
  let seen = 0
  for (const mk of Object.keys(BT.lastSeason.markets)) {
    for (const a of bucketsAngles(rows, mk)) {
      seen++
      assert.match(a.title, /^(His opponent[^.]*\. |Score 85 or higher\. )Tracking, no live rate yet/); assert.match(a.title, /Back-test, not the live record/)
      assert.match(a.title, /n=[\d,]+ calls/); assert.ok(!/\d+%| of [\d,]+ /.test(a.title), a.title)
      const o = bucketsAngles(rows, mk, { open: true }).find((x) => x.key === a.key)
      assert.match(o.title, /Back-test, not the live record/); assert.match(o.title, /[\d,]+ of [\d,]+/)
    }
  }
  assert.ok(seen > 0, 'at least one angle has an edge in the file')
})

console.log(`\n${n} groups ok`)
