#!/usr/bin/env node
// THE LAMP LADDER (2026-10-10, LAMP hero plan items 1 + 3; ledger audit findings 5 and 9). TEST DATA only: made-up
// skater-games ("TEST n"), counts shaped like the 10-10 pooled record only as a sanity check on the arithmetic
// (CALLED 48/147, board 150/788, off 182/1580, base 380/2515 = 15.1%); nothing real is read, nothing here is shown on the site.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lamp-ladder.mjs
import { MODEL_VERSION } from '../lib/nhl/goalModel.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ladderFromRecords, ladderFrom, ladderSentence, ladderOneLine, ladderScope, ladderRows, versionRows, versionsAddUp, priceNote, versionLabel, LADDER_RUNGS } from '../lib/record/ladder.js'
import { toRecord } from '../lib/record/nhl.js'
import { straightLine } from '../lib/record/callsLanded.js'
import { readNhlCalibration } from '../lib/calibration/readSportCalibration.js'
import { STATUS_WORD } from '../lib/callStatus.js'
import { nhlMeasures } from '../lib/record/page.js'

let fail = 0
const ok = (name, fn) => { try { fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }
const okA = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`) } catch (e) { fail += 1; console.log(`FAIL ${name}: ${e.message}`) } }

// ── TEST rows: a log row per skater-game, counts per (version, status) ────────────────────────────────
const VERSIONS = ['lamp-goal-v1', 'lamp-goal-v2', 'lamp-goal-v3']
const DATES = { 'lamp-goal-v1': ['2026-09-29', '2026-09-30'], 'lamp-goal-v2': ['2026-10-01', '2026-10-02'], 'lamp-goal-v3': ['2026-10-03', '2026-10-04', '2026-10-05'] }
// [n, hits] per version and status. CALLED sums to 147 / 48 (v1 24/5, v2 26/10, v3 97/33); board to 788 / 150; off to 1580 / 182
const PLAN = {
  'lamp-goal-v1': { called: [24, 5], board: [100, 18], off: [200, 24] },
  'lamp-goal-v2': { called: [26, 10], board: [88, 17], off: [180, 20] },
  'lamp-goal-v3': { called: [97, 33], board: [600, 115], off: [1200, 138] },
}
let seq = 0
function raw(over) {
  seq += 1
  return { game_id: 1000 + (seq % 7), game_date: '2026-10-03', game_type: 2, player_id: seq, model_version: 'lamp-goal-v3', team: 'AAA', opp: 'BBB', name: `TEST ${seq}`, pos: 'C', score: 50, rank_in_game: 3, status: 'off', dressed: true, goals: 0, hit: false, locked_at: '2026-10-03T22:00:00Z', graded_at: '2026-10-04T05:00:00Z', ...over }
}
function build() {
  const rows = []
  for (const v of VERSIONS) {
    for (const [status, [n, hits]] of Object.entries(PLAN[v])) {
      for (let i = 0; i < n; i += 1) rows.push(raw({ model_version: v, status, game_date: DATES[v][i % DATES[v].length], hit: i < hits, goals: i < hits ? 1 : 0 }))
    }
  }
  return rows
}
const clean = build()
const noise = [
  // void: did not dress (hit null), in every status: out of every count
  ...['called', 'board', 'off'].flatMap((status) => Array.from({ length: 4 }, () => raw({ status, dressed: false, hit: null, goals: null }))),
  // unlocked (no lock stamp), preseason, ungraded: out
  raw({ status: 'called', hit: true, locked_at: null }),
  raw({ status: 'called', hit: true, game_type: 1 }),
  raw({ status: 'called', hit: true, graded_at: null }),
]
const records = [...clean, ...noise].map(toRecord)

// ── the ladder's arithmetic ──────────────────────────────────────────────────────────────────────────
const L = ladderFromRecords(records)
const wil = (k, n) => { const z = 1.96; const p = k / n; const d = 1 + z * z / n; const m = (p + z * z / (2 * n)) / d; const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; return [100 * (m - h), 100 * (m + h)] }
ok('counts: CALLED, ON THE BOARD, NOT ON THE BOARD and the base, void / unlocked / preseason / ungraded out', () => {
  assert.deepEqual(LADDER_RUNGS.map((s) => [L.rungs[s].hits, L.rungs[s].n]), [[48, 147], [150, 788], [182, 1580]])
  assert.deepEqual([L.base.hits, L.base.n], [380, 2515])
})
ok('rates to one decimal, from the counts', () => {
  assert.equal(L.rungs.called.rate, 32.7); assert.equal(L.rungs.board.rate, 19.0); assert.equal(L.rungs.off.rate, 11.5); assert.equal(L.base.rate, 15.1)
})
ok('95% Wilson range on every row matches the textbook formula (percent)', () => {
  for (const c of [L.rungs.called, L.rungs.board, L.rungs.off, L.base]) {
    const [lo, hi] = wil(c.hits, c.n)
    assert.ok(Math.abs(c.ci[0] - lo) < 1e-6 && Math.abs(c.ci[1] - hi) < 1e-6, `${c.hits}/${c.n}`)
  }
})
ok('the ladder is monotone on this fixture: CALLED > ON THE BOARD > base > NOT ON THE BOARD', () => {
  assert.ok(L.rungs.called.rate > L.rungs.board.rate && L.rungs.board.rate > L.base.rate && L.base.rate > L.rungs.off.rate)
})
ok('scope: the nights counted are the rows\' own game dates, not a clock', () => {
  assert.equal(L.nights, 7); assert.equal(L.from, '2026-09-29'); assert.equal(L.to, '2026-10-05')
  assert.match(ladderScope(L), /regular season, 7 graded nights \(Sep 29 to Oct 5\), locked before puck drop/)
})
ok('the sentence: numbers from the rows, nothing typed', () => {
  assert.equal(ladderSentence(L), 'CALLED skaters scored in 48 of 147 (32.7%), against 15.1% for every dressed skater.')
})
ok('rows print in order with lib/callStatus words, then the base row', () => {
  const rows = ladderRows(L)
  assert.deepEqual(rows.map((r) => r.word), [STATUS_WORD.called, STATUS_WORD.board, STATUS_WORD.off, 'All dressed skaters'])
  assert.deepEqual(rows.map((r) => r.n), [147, 788, 1580, 2515])
})
ok('postseason is its own block, not mixed into the regular season', () => {
  const post = [...clean.slice(0, 40).map((r) => ({ ...r, game_type: 3 })), ...clean].map(toRecord)
  assert.deepEqual([ladderFromRecords(post).base.n, ladderFromRecords(post, { season: 'post' }).base.n], [2515, 40])
  assert.equal(ladderFromRecords(post.filter((r) => r.game_type === 3)), null)
})
ok('nothing graded and locked: no ladder (the surface draws nothing, not a zero)', () => {
  assert.equal(ladderFromRecords([]), null); assert.equal(ladderFromRecords(noise.map(toRecord)), null)
  assert.equal(ladderSentence(null), null)
})

// ── the version split ────────────────────────────────────────────────────────────────────────────────
ok('v1 / v2 / v3: n and hits per version, each with its own base', () => {
  assert.deepEqual(L.versions.map((v) => [v.label, v.called.hits, v.called.n]), [['v1', 5, 24], ['v2', 10, 26], ['v3', 33, 97]])
  assert.deepEqual(L.versions.map((v) => [v.nights, v.from, v.to]), [[2, '2026-09-29', '2026-09-30'], [2, '2026-10-01', '2026-10-02'], [3, '2026-10-03', '2026-10-05']])
  for (const v of L.versions) assert.ok(v.base.n > v.called.n && v.base.rate != null)
})
ok('the versions add up to the pooled number (CALLED and base)', () => {
  assert.equal(versionsAddUp(L), true)
  assert.equal(versionsAddUp({ ...L, versions: L.versions.slice(1) }), false)
})
ok('the live version is called out and listed first; the pooled row is labelled elsewhere "All versions"', () => {
  const live = ladderFrom({ ladder: { regular: L }, liveVersion: 'lamp-goal-v3', minN: 30 })
  assert.deepEqual(versionRows(live).map((v) => [v.label, v.live]), [['v3', true], ['v2', false], ['v1', false]])
  assert.equal(versionLabel('lamp-goal-v3'), 'v3')
})
ok('ladderFrom: a calibration body from before the ladder existed gives null', () => {
  assert.equal(ladderFrom({ regular: { tiers: [] } }), null); assert.equal(ladderFrom(null), null)
})

// ── the one reader: the calibration reader's tiers and the ladder are the same rows ──────────────────
await okA('readNhlCalibration: the ladder rides the same body as the tiers and they agree', async () => {
  // the fake db applies no filters (the real one drops preseason and ungraded rows in SQL), so it is handed rows that pass them
  const data = [...clean, ...noise.filter((r) => r.game_type !== 1 && r.graded_at && r.locked_at)]
  const q = new Proxy({}, { get: (_, k) => (k === 'range' ? async (a, b) => ({ data: data.slice(a, b + 1), error: null }) : () => q) })
  const cal = await readNhlCalibration({ from: () => q })
  const tier = Object.fromEntries(cal.regular.tiers.map((t) => [t.key, t]))
  const lad = ladderFrom(cal)
  assert.ok(lad, 'the body carries a ladder'); assert.equal(cal.liveVersion, MODEL_VERSION)
  for (const s of LADDER_RUNGS) assert.deepEqual([lad.rungs[s].hits, lad.rungs[s].n], [tier[s].hits, tier[s].n], s)
  assert.deepEqual([lad.base.hits, lad.base.n], [tier.called.board.hits, tier.called.board.n])
  assert.deepEqual([lad.rungs.called.hits, lad.rungs.called.n], [48, 147])
})

// ── the price line: only when stored lock prices compute it ──────────────────────────────────────────
const call = (result, median, best = median) => ({ result, median, best })
const priced = (hits, n, price) => Array.from({ length: n }, (_, i) => call(i < hits ? 'hit' : 'miss', price))
ok('priceNote: 44 of 131 at +181: break-even 35.6%, units from the stored prices, "roughly breaks even" because the return is within 10% of the stake', () => {
  const sl = straightLine(priced(44, 131, 181))
  const note = priceNote(sl)
  assert.ok(note && note.roughlyEven)
  assert.match(note.text, /^Priced at lock, CALLED roughly breaks even against the books: 44 of 131 priced CALLED skaters scored \(33\.6%\) against 35\.6% the stored prices imply; one unit on each returned −7\.4 units at the median price \(n=131\)\.$/)
})
ok('priceNote: a clearly negative return is stated without "roughly breaks even"', () => {
  const note = priceNote(straightLine(priced(25, 131, 181)))
  assert.ok(note && !note.roughlyEven); assert.ok(!/breaks even/.test(note.text))
})
ok('priceNote: under the priced minimum, or with no stored price, there is no line and no number', () => {
  assert.equal(priceNote(straightLine(priced(10, 60, 181))), null)
  assert.equal(priceNote(straightLine(Array.from({ length: 150 }, (_, i) => call(i % 3 ? 'miss' : 'hit', null)))), null)
  assert.equal(priceNote(null), null)
})

// ── the capture line: its own words, its own window ─────────────────────────────────────────────────
ok('nhlMeasures: capture is labelled as coverage and the ladder holds the hit rate (no second answer)', () => {
  const m = nhlMeasures({ nights: [{ date: '2026-09-29' }, { date: '2026-10-09' }], total: { calledN: 123, calledHits: 43, scorers: 380, scorersCalled: 70, scorersOnBoard: 128 }, sog: { calledN: 20, calledHits: 5 } })
  assert.deepEqual(m.map((x) => x.key), ['capture', 'board', 'sog'])
  assert.match(m[0].label, /Capture: scorers called in any LAMP market/); assert.equal(m[0].value, '70 of 380 (18%)')
  assert.match(m[0].sub, /coverage, not how often a call scores/); assert.match(m[0].sub, /2 graded nights, Sep 29 to Oct 9/)
  assert.ok(!m.some((x) => x.key === 'rate'))
})

// ── grep guards ──────────────────────────────────────────────────────────────────────────────────────
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(`../${dir}`, import.meta.url))) { if (['node_modules', '.next', 'ARCHIVE'].includes(f)) continue; const p = join(dir, f); const st = statSync(new URL(`../${p}`, import.meta.url)); if (st.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(f)) out.push(p) } return out }
// THE SURFACES SINCE 10-17 (front door rebuilt; /start is a redirect into the app): /called and the Record tab draw LadderBlock;
// the front door draws LAMP's ladder as a record block (lib/dash/recordBlocks.js ladderRows, lib/record/ladder.js).
const SURFACES = ['app/called/page.js', 'components/lamp/tabs/Results.js']
const DOOR = ['app/(front)/page.js', 'lib/dash/recordBlocks.js', 'components/home/RecordBlocks.js']
ok('one reader: every surface draws the ladder from lib/record/ladder.js, which reads the calibration body', () => {
  for (const p of SURFACES) assert.ok(/LadderBlock|LadderFromApi/.test(read(p)), `${p} draws the ladder`)
  assert.match(read('app/(front)/page.js'), /pulse\.nhlLadder/); assert.match(read('lib/dash/pulse.js'), /ladderFrom\(c\)/)
  assert.match(read('lib/dash/recordBlocks.js'), /from '\.\.\/record\/ladder'/)
  assert.match(read('app/start/page.js'), /redirect\(/)
  assert.match(read('app/called/page.js'), /ladderFrom\(cal\)/)
  assert.match(read('components/record/LadderBlock.js'), /\/api\/calibration\?sport=/)
  assert.match(read('lib/calibration/readSportCalibration.js'), /ladderFromRecords\(rows/)
})
ok('no second definition: only lib/record/ladder.js builds a ladder; nothing else groups lamp_goal_log rows by version', () => {
  const files = [...walk('lib'), ...walk('components'), ...walk('app')]
  const defs = files.filter((p) => /function ladderFromRecords|const ladderFromRecords/.test(read(p)))
  assert.deepEqual(defs, ['lib/record/ladder.js'])
  // app/api/lamp/record: ONE skater's record, counted per model version (2026-10-17: never pooled across versions) -- a count, not a ladder
  const byVersion = files.filter((p) => !['lib/record/ladder.js', 'lib/record/nhl.js', 'app/api/lamp/record/route.js'].includes(p) && /model_version/.test(read(p)) && /byVersion|perVersion|groupBy\(.*model_version/.test(read(p)))
  assert.deepEqual(byVersion, [])
})
ok('scroll cost: /start and /called fold the table behind a one-line summary (44px target); the Record tab keeps it open', () => {
  assert.match(read('app/called/page.js'), /<LadderBlock [^>]*\bfold\b/)
  assert.match(read('components/record/LadderBlock.js'), /minHeight: 44/)
  assert.ok(!/fold/.test(read('components/lamp/tabs/Results.js')))
  assert.equal(ladderOneLine(L), 'CALLED scored 48 of 147 (32.7%) vs 15.1% for every dressed skater')
})
ok('the old front-door headline (capture as the LAMP number) is gone', () => {
  const door = read('app/(front)/page.js')
  assert.ok(!/<b>\{pulse\.nhlRecord\.called\} of \{pulse\.nhlRecord\.total\}<\/b> CALLED/.test(door))
  // the rebuilt door (10-17) prints no capture number at all, so there is no capture line left to label
  assert.ok(!/nhlRecord\.called\} of/.test(door))
})
ok('no hard-coded record numbers in the ladder files or the surfaces', () => {
  for (const p of ['lib/record/ladder.js', 'components/record/LadderBlock.js', ...SURFACES, ...DOOR]) {
    const src = read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    assert.ok(!/\b(147|48 of|380|123|788|1580|2515)\b|(?<!fontSize: )\b(32\.7|19\.0|11\.5|15\.1)\b/.test(src), `${p} has a number that looks like a record`)
  }
})
ok('copy lint: no "due", no probability, no winners, no profit or edge claim in the ladder\'s words', () => {
  const copy = [read('lib/record/ladder.js'), read('components/record/LadderBlock.js')].join('\n')
  const strings = (copy.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).join('\n') + '\n' + (copy.match(/>[^<>{}\n]{12,}</g) || []).join('\n')
  assert.ok(!/\bdue\b/i.test(strings), 'due')
  assert.ok(!/probab/i.test(strings), 'probability')
  assert.ok(!/winner/i.test(strings), 'winners')
  assert.ok(!/profit/i.test(strings), 'profit')
  assert.ok(!/guarantee|lock of the|sure thing|can't lose/i.test(strings), 'certainty')
  for (const m of strings.match(/[^.\n]*\bedge\b[^.\n]*/gi) || []) assert.match(m, /not an edge|no edge/i, `edge claim: ${m}`)
  // ON THE BOARD / NOT ON THE BOARD / CALLED reach the page only through STATUS_WORD
  assert.ok(!/['"`>]\s*(CALLED|ON THE BOARD|NOT ON THE BOARD)\s*['"`<]/.test(read('components/record/LadderBlock.js')), 'status words come from lib/callStatus')
})

console.log(fail ? `\n${fail} FAILED` : '\nTEST DATA: all green')
process.exit(fail ? 1 : 0)
