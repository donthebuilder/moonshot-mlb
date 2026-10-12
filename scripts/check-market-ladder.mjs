#!/usr/bin/env node
// THE MARKET LADDER (Wave 8, 2026-10-11): MLB, TUDDY and BUCKETS. TEST DATA only: every number below is made up
// ("TEST"), shaped to exercise the arithmetic; nothing real is read and nothing here is shown on the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-market-ladder.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marketLadderFrom, marketSentence, marketOneLine, marketScope, marketCells, rangesOverlap, ladderFrom } from '../lib/record/ladder.js'
import { LADDER_SPORTS, ladderKind } from '../lib/record/ladderSports.js'
import { blockFrom } from '../lib/calibration/generic.js'
import { baselineFromReport } from '../lib/nfl/cardRecord.js'
import { wilson } from '../lib/interval.js'
import { ALL_SPORT_KEYS } from '../lib/routes.js'
import { nbaOutcome } from '../lib/posts/nba.js'
import { nbaLanePlayers, nbaBoxResults } from '../lib/numerology/nbaNight.js'
import { nflTdResult, nflRowOf } from '../components/nfl/shareCard.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const days = (n) => Array.from({ length: n }, (_, i) => `2026-09-${String(10 + (i % 20)).padStart(2, '0')}`)
const graded = (hits, n) => days(n).map((date, i) => ({ date, hit: i < hits }))

// ── TEST body, MLB-shaped: tier.board is the base (every hitter on the board on the same bar) ──────────────────
const mlbTier = (key, hits, n, bHits, bN) => ({ key, kind: 'call', status: null, label: key, bar: key === 'HR' ? '1+ HR' : '1+ H', graded: graded(hits, n), void: 0, board: graded(bHits, bN) })
function mlbBody(tiers) { return { sport: 'mlb', minN: 30, regular: blockFrom('mlb', tiers), post: blockFrom('mlb', []) } }
const wide = mlbBody([mlbTier('HR', 90, 300, 400, 3000), mlbTier('HIT', 160, 250, 1500, 3000)])
const flat = mlbBody([mlbTier('HR', 40, 300, 400, 3000), mlbTier('HIT', 160, 250, 1500, 3000)])   // HR at the base: 13.3% vs 13.3%
const flatDown = mlbBody([mlbTier('HR', 30, 300, 400, 3000)])                                       // below the base

ok('registry: every sport has a kind and every market sport carries its words', () => {
  for (const s of ['nhl', 'mlb', 'nfl', 'nba']) assert.ok(ALL_SPORT_KEYS.includes(s), `${s} is a registry sport`)
  for (const s of ['mlb', 'nfl', 'nba']) {
    assert.equal(ladderKind(s), 'market')
    for (const k of ['subject', 'unit', 'baseWords', 'baseHead', 'foot', 'leadWord']) assert.ok(LADDER_SPORTS[s][k], `${s}.${k}`)
  }
  assert.equal(ladderKind('nhl'), 'status')
})
ok('registry-driven: no sport ternary in the ladder code', () => {
  for (const f of ['../lib/record/ladder.js', '../components/record/LadderBlock.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.ok(!/sport\s*===?\s*['"](mlb|nfl|nhl|nba)['"]/.test(src), `${f} branches on a sport`)
  }
})
ok('the status ladder is untouched: a market body has no cal.ladder, so ladderFrom is null', () => { assert.equal(ladderFrom(wide), null) })

ok('MLB rows: n, hits, rate, Wilson range and the base on the same bar are counts of the rows handed in', () => {
  const l = marketLadderFrom(wide)
  assert.equal(l.kind, 'market'); assert.equal(l.rows.length, 2)
  const hr = l.rows.find((r) => r.key === 'HR')
  assert.deepEqual([hr.n, hr.hits, hr.rate], [300, 90, 30])
  assert.deepEqual(hr.ci, wilson(90, 300))
  assert.deepEqual([hr.base.n, hr.base.hits, hr.base.rate], [3000, 400, 13.3])
  assert.deepEqual(hr.base.ci, wilson(400, 3000))
  assert.equal(hr.gap, 16.7)   // 30.0 - 13.3
  assert.equal(hr.overlap, false)
})
ok('MLB’s reader returns no `sport` on its body: the caller names it, the ladder is the same', () => {
  const { sport: _s, ...bare } = wide
  assert.equal(marketLadderFrom(bare), null)
  assert.deepEqual(marketLadderFrom(bare, { sport: 'mlb' }), marketLadderFrom(wide))
})
ok('a model-tier row (HR Overlay) is not a CALLED row: it stays off the ladder', () => {
  const body = mlbBody([mlbTier('HR', 90, 300, 400, 3000), { ...mlbTier('hr_overlay', 50, 100, 400, 3000), kind: 'model' }])
  assert.deepEqual(marketLadderFrom(body).rows.map((r) => r.key), ['HR'])
})
ok('FLAT RESULT: same sentence template, same row, the gap is signed and the ranges overlap is said as a fact', () => {
  const l = marketLadderFrom(flat)
  const hr = l.rows.find((r) => r.key === 'HR')
  assert.equal(hr.gap, 0); assert.equal(hr.overlap, true)
  const s = marketSentence(l)
  assert.match(s, /^CALLED HR calls cleared 1\+ HR in 40 of 300 \(13\.3%/)
  assert.match(s, /against 13\.3% for every hitter on the board on the same bar\.$/)
  // the wide result uses the identical words with other numbers
  const w = marketSentence(marketLadderFrom(wide))
  assert.equal(s.replace(/\d[\d,.]*/g, '#'), w.replace(/\d[\d,.]*/g, '#'))
  assert.equal(marketCells(hr).vs, '+0.0 pts'); assert.equal(marketCells(hr).overlap, 'ranges overlap')
})
ok('BELOW the base is printed with the same dignity: a signed minus, no colour word, no hedging', () => {
  const l = marketLadderFrom(flatDown)
  const c = marketCells(l.rows[0])
  assert.equal(c.vs, '−3.3 pts')
  assert.match(marketSentence(l), /^CALLED HR calls cleared 1\+ HR in 30 of 300 \(10\.0%/)
  assert.doesNotMatch(marketSentence(l) + marketOneLine(l), /lock|due|guarantee|only|despite|unfortunately/i)
})
ok('one line (the fold) carries the claim and the base', () => {
  assert.equal(marketOneLine(marketLadderFrom(wide)), 'CALLED HR cleared 90 of 300 (30.0%) vs 13.3% on the same bar')
})
ok('a tier under the minimum prints its counts and NO rate; the base still prints', () => {
  const l = marketLadderFrom(mlbBody([mlbTier('HR', 5, 12, 400, 3000)]))
  const r = l.rows[0]
  assert.equal(r.enough, false); assert.equal(r.gap, null); assert.equal(r.overlap, null)
  const c = marketCells(r)
  assert.equal(c.rate, '—'); assert.equal(c.range, null); assert.equal(c.tracking, true); assert.equal(c.base, '13.3%')
  assert.match(marketSentence(l), /12 CALLED HR calls graded so far \(5 cleared 1\+ HR\); a rate waits for 30\./)
})
ok('EMPTY: a market sport with nothing graded says so (empty:true, no row, no number); a missing body says nothing', () => {
  const l = marketLadderFrom(mlbBody([]))
  assert.equal(l.empty, true); assert.equal(l.rows.length, 0)
  assert.equal(marketOneLine(l), 'No CALLED calls graded yet'); assert.equal(marketSentence(l), null)
  assert.equal(marketLadderFrom(null), null)
  assert.equal(marketLadderFrom({ sport: 'nhl', regular: {} }), null)
})
ok('SCOPE names the window: nights for MLB, weeks for TUDDY', () => {
  const m = marketScope(marketLadderFrom(wide))
  assert.match(m, /^Regular season, 20 graded nights \(Sep 10 to Sep 29\), each call stamped before the game\.$/)
})

// ── TUDDY: counts per market, no rows; the base is the report card's back-test, pooled over its seasons ─────────
const REPORT = { seasons: {
  2024: { TD: { base: 20.0, deciles: { 1: { n: 1000 }, 2: { n: 1000 } } }, REC: { base: 25.0, deciles: { 1: { n: 400 } } } },
  2025: { TD: { base: 10.0, deciles: { 1: { n: 1000 } } } },
} }
ok('NFL baseline: pooled from the file’s own base and decile n (TEST report)', () => {
  const td = baselineFromReport(REPORT, 'TD')
  assert.deepEqual([td.n, td.hits], [3000, 500])        // 20% of 2000 + 10% of 1000
  assert.deepEqual(td.seasons, ['2024', '2025']); assert.equal(td.scope, 'back-test seasons 2024 and 2025')
  assert.deepEqual(baselineFromReport(REPORT, 'REC'), { n: 400, hits: 100, seasons: ['2024'], scope: 'back-test season 2024' })
  assert.equal(baselineFromReport(REPORT, 'PASS_YDS'), null)
  assert.equal(baselineFromReport(null, 'TD'), null)
})
function nflBody(counts, bases) {
  const tiers = counts.map(([key, label, bar, n, hits]) => ({ key, label, kind: 'status', status: 'called', bar, counts: { n, hits }, void: 0, board: null }))
  return { sport: 'nfl', minN: 30, season: 2026, bases, regular: { ...blockFrom('nfl', tiers), nights: 5, unit: 'week', weeks: [1, 2, 3, 4, 5] }, post: blockFrom('nfl', []) }
}
ok('NFL rows: the base comes from cal.bases, weeks are the unit, a 5-call week is under the minimum and prints no rate', () => {
  const l = marketLadderFrom(nflBody([['TD', 'Anytime TD', '1+', 40, 22], ['REC', 'Receptions', '4+', 9, 6]], { TD: baselineFromReport(REPORT, 'TD') }))
  const td = l.rows.find((r) => r.key === 'TD'), rec = l.rows.find((r) => r.key === 'REC')
  assert.deepEqual([td.n, td.hits, td.rate, td.base.n, td.base.rate], [40, 22, 55, 3000, 16.7])
  assert.equal(td.enough, true); assert.equal(rec.enough, false); assert.equal(rec.base, null)
  assert.equal(marketCells(rec).baseN, 'none stored')
  assert.equal(marketScope(l), 'Regular season, weeks 1 to 5 of 2026, each call stamped before the game.')
  assert.match(marketSentence(l), /^CALLED Anytime TD calls cleared 1\+ in 22 of 40 \(55\.0%/)
  assert.match(marketSentence(l), /for every player the model scored, on the same bar\.$/)
})

// ── BUCKETS adapters (hidden): the receipt grade, the lane-night shapes ────────────────────────────────────────
ok('nbaOutcome: hit cashed, miss missed, did not play void, ungraded pending (TEST rows)', () => {
  const rows = new Map([['1', { graded_at: 'x', played: true, hit: true }], ['2', { graded_at: 'x', played: true, hit: false }], ['3', { graded_at: 'x', played: false, hit: null }], ['4', { graded_at: null }]])
  assert.deepEqual(['1', '2', '3', '4', '9'].map((id) => nbaOutcome({ id }, { rows })), ['cashed', 'missed', 'void', 'pending', 'pending'])
})
ok('nbaLanePlayers / nbaBoxResults: the record’s shapes; a logged player with no box line did not play (void, not a miss)', () => {
  const read = { all: [{ id: '7', name: 'TEST A', team: 'AAA', opp: 'BBB', jersey: 23, birthDate: '2000-01-02' }, { id: '', name: 'no id' }] }
  assert.deepEqual(nbaLanePlayers(read), [{ player_id: '7', name: 'TEST A', jersey: 23, birthDate: '2000-01-02', next: null, team: 'AAA', opp: 'BBB' }])
  const res = nbaBoxResults([{ id: '1', dnp: false, pts: 25 }, { id: '2', dnp: false, pts: 24 }, { id: '3', dnp: true, pts: null }], ['1', '2', '3', '4'])
  assert.deepEqual([...res], [['1', { played: true, hit: true }], ['2', { played: true, hit: false }], ['3', { played: false, hit: false }], ['4', { played: false, hit: false }]])
})

// ── TUDDY share card rows (TEST player) ───────────────────────────────────────────────────────────────────────
ok('nflTdResult: nothing before the game is final; a touchdown, a miss and a void wear the same dignity after', () => {
  const g = { completed: true }
  const results = { lines: { a: { TD: 2 }, b: { REC: 40 }, c: {} } }
  assert.equal(nflTdResult({ player_id: 'a' }, { completed: false }, results), null)
  assert.deepEqual(nflTdResult({ player_id: 'a' }, g, results), { text: '2 TD', hot: true, miss: false })
  assert.deepEqual(nflTdResult({ player_id: 'b' }, g, results), { text: 'MISS', hot: false, miss: true })
  assert.deepEqual(nflTdResult({ player_id: 'c' }, g, results), { text: 'VOID', hot: false, miss: true })
  assert.equal(nflTdResult({ player_id: 'zz' }, g, results), null)
  const row = nflRowOf({ p: { player_id: 'b', name: 'TEST B', team: 'AAA', opp: 'BBB', scores: { TD: 61.4 } }, status: 'called', rank: 2 }, [{ home: 'AAA', away: 'BBB', completed: true }], results)
  assert.deepEqual([row.where, row.status, row.miss, row.result.text], ['vs BBB', 'called', true, 'MISS'])
})

console.log(fail ? `\n${fail} FAILED` : '\nok market ladder: rows, Wilson ranges, base arithmetic, flat and below-base wording, empty and under-minimum states, registry, BUCKETS adapters, TUDDY card rows')
process.exit(fail ? 1 : 0)
