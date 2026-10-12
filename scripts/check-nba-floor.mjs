#!/usr/bin/env node
// THE BUCKETS PUBLIC-NUMBER FLOOR, CHECKED (2026-10-12). TEST DATA: every night, player and call below is MADE UP (generated here),
// none of it is a real result and none of it reaches the site. Until a market has 30 graded regular-season nights, no hit count,
// rate or "X of Y" is made for it: the word is "tracking", with n and the nights so far. Even with BUCKETS public.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nba-floor.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log(`ok  ${name}`) }
const F = await import('../lib/record/nbaFloor.js')
const LAD = await import('../lib/record/ladder.js')
const GEN = await import('../lib/calibration/generic.js')
const CL = await import('../lib/record/callsLanded.js')

// TEST: a made-up calendar, `k` consecutive nights
const day = (i) => `2027-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`
const callRows = (market, k, { perNight = 2, season_type = 2, hitEvery = 2 } = {}) => Array.from({ length: k * perNight }, (_, i) => ({
  game_date: day(Math.floor(i / perNight)), game_id: `TEST-${market}-${i}`, player_id: `TEST-P${i}`, market, status: 'called', season_type, hit: i % hitEvery === 0, name: `Test Player ${i}`,
}))

ok('one constant: the floor IS the ladder\'s own bar (30), and 29 nights is tracking, 30 is not', () => {
  assert.equal(F.NBA_MIN_NIGHTS, LAD.LADDER_MIN_N); assert.equal(F.NBA_MIN_NIGHTS, 30)
  assert.equal(F.isTracking(29), true); assert.equal(F.isTracking(30), false); assert.equal(F.isTracking(0), true); assert.equal(F.isTracking(undefined), true)
  assert.match(F.trackingWords({ n: 12, nights: 3 }), /^tracking · 12 graded calls, 3 of 30 nights$/)
  assert.match(F.trackingWords({ n: 1, nights: 1 }), /1 graded call,/)
})

ok('calibration (/api/calibration?sport=nba, /called, /start): 29 nights = tracking with n and no hits, rate, board rate, lift or PROVEN; 30 nights = the rate', () => {
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

ok('/called\'s "N of M landed": no pooled line from a block with a tracking market; the tracking lines name the market, n and nights', () => {
  const t = (key, label, k) => GEN.blockFrom('nba', [{ key, label, kind: 'status', status: 'called', bar: 'x', graded: callRows(key, k).map((r) => ({ date: r.game_date, hit: r.hit })), void: 0, board: null }], { minNights: 30 }).tiers[0]
  const cal = { minN: 30, regular: { nights: 30, tiers: [t('pts', 'PTS 25+', 30), t('reb', 'REB 10+', 3)] } }
  assert.equal(CL.callsLandedFrom(cal), null)
  const tr = CL.callsTrackingFrom(cal)
  assert.equal(tr.markets.length, 1); assert.deepEqual(tr.markets[0], { label: 'REB 10+', n: 6, nights: 3 })
  const allOk = { minN: 30, regular: { nights: 30, tiers: [t('pts', 'PTS 25+', 30)] } }
  assert.ok(CL.callsLandedFrom(allOk)); assert.equal(CL.callsTrackingFrom(allOk), null)
})

ok('Record tab (/api/buckets/record): a market under 30 regular-season nights sends n and "tracking" and no hit count, no called-that-hit rows, no missed 25-point scorers', () => {
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

ok('preseason nights do not count toward the floor, and a preseason night is hidden too while the market is tracking', () => {
  const pre = callRows('pts', 30, { season_type: 1 })
  const r = F.foldBucketsNights(pre)
  assert.equal(r.tracking.pts.nights, 0); assert.ok(r.nights.every((x) => x.markets.pts.tracking && x.called.length === 0))
  const mixed = F.foldBucketsNights([...callRows('pts', 10), ...callRows('pts', 30, { season_type: 1 })])
  assert.equal(mixed.tracking.pts.nights, 10)
})

ok('regular season and playoffs both count (season_type 2 and 3); only preseason (1) is out', () => {
  const rows = [...callRows('pts', 20), ...callRows('pts', 10, { season_type: 3 }).map((r, i) => ({ ...r, game_date: day(20 + Math.floor(i / 2)) }))]
  assert.deepEqual(F.foldBucketsNights(rows).tracking, {})
})

ok('/api/record/calls: a tracking market loses every call row (results are the record) and is listed with n and nights; an open market keeps its rows; a market with only voids is tracking too', () => {
  const calls = [...callRows('pts', 30).map((r) => ({ market: 'pts', game_date: r.game_date, result: r.hit ? 'hit' : 'miss', name: r.name })), ...callRows('reb', 5).map((r) => ({ market: 'reb', game_date: r.game_date, result: r.hit ? 'hit' : 'miss' })), { market: 'dd', game_date: day(0), result: 'void' }]
  const f = F.floorCalls(calls, (m) => m.toUpperCase())
  assert.equal(f.calls.filter((c) => c.market === 'pts').length, 60); assert.equal(f.calls.filter((c) => c.market === 'reb').length, 0); assert.equal(f.calls.filter((c) => c.market === 'dd').length, 0)
  assert.deepEqual(f.tracking, [{ market: 'reb', label: 'REB', n: 10, nights: 5, minNights: 30 }])
})

ok('the routes and pages use the floor (read the source): record, calls, ledger, /called, /start, calibration', () => {
  const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  assert.match(src('app/api/buckets/record/route.js'), /foldBucketsNights\(rows\)/)
  assert.match(src('app/api/record/calls/route.js'), /floorCalls\(keep/)
  assert.match(src('app/api/buckets/ledger/route.js'), /trackingOf\(floor, k\)/)
  assert.match(src('app/called/page.js'), /trackNba/)
  assert.match(src('app/start/page.js'), /trackingOf\(await readNbaFloor\(db\), 'pts'\)/)
  assert.match(src('lib/record/page.js'), /!tracking\.pts &&/)
})

console.log(`\n${n} groups ok`)
