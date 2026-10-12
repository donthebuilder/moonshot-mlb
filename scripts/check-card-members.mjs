#!/usr/bin/env node
// THE CARD, MEMBERS FIRST (2026-10-12, Donovan: "members only, then after one leg cashes or is done then they can see the other").
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-members.mjs
// ALL DATA IS TEST DATA: made-up players ("Test Alpha"...), clubs AAA..ZZZ, an in-memory table (scripts/_card-fakedb.mjs holds the migrations' rules).
// The rule (lib/card/reveal.js): BEFORE any row of a Card is graded the PUBLIC (site route, X, free channels, public image routes) sees only the lead
// straight (+ the Long Shot, + Donovan's rows after his lock) and the record; the bot's Two-Man and straights #2-#3 are members only. AFTER a row has a
// result (hit / miss / push / VOID) everything is visible. Computed from stored results, never the clock.
//   A  the pure rule: lead only before, all after; a void counts; the Double never reveals a sport's Card; the clock never does
//   B  the store: readCard public vs members over a real lock + a real grade; no held identifier anywhere in the public rows
//   C  every public reader goes through the public view (static, over the source): /api/card, the three image routes' data, the X post
//   D  the X / free-Discord post: before the reveal it names ONLY the lead straight (+ Donovan's); text, payload and picture target
//   E  the members surfaces keep the whole Card (members text, the tick's audience)
//   F  the migration: the condition is in the policy text, nothing is dropped, the .txt (when present) IS the .sql
//   G  the site's quiet line: neutral words, no "lock"
import './_no-injury-net.mjs'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { lockCard, gradeCardRows, readCard, cardRows } from '../lib/card/store.js'
import { cardRevealed, publicCardRows, HELD_LINE } from '../lib/card/reveal.js'
import { leadStraight, lockAtOf } from '../lib/card/core.js'
import { membersCardText } from '../lib/card/text.js'
import { xCardBuild } from '../lib/card/post.js'
import { loadDualModel } from '../lib/cards/dualData.js'
import { fakeDb } from './_card-fakedb.mjs'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const H = 3600e3
const NOW = Date.parse('2026-10-10T20:00:00Z')
Date.now = () => NOW
const DAY = '2026-10-10'
const C = (id, game, startH, score, rate = 0.3) => ({ player_id: id, name: `Test ${id}`, team: `T${game}A`, opp: `T${game}B`, game_id: game, game_date: DAY, start_ms: NOW + startH * H, score, rate, why: `why ${id}`, price: { median: 150, best: 170, books: 5, taken_at: '2026-10-10T19:00:00Z' } })   // TEST price
const FIELD = [C('alpha', 'g1', 2, 90, 0.40), C('bravo', 'g1', 2, 88, 0.35), C('charlie', 'g2', 3, 85, 0.30), C('delta', 'g3', 4, 80, 0.25), C('echo', 'g3', 4, 70, 0.20), C('foxtrot', 'g4', 1, 95, 0.10)]
const SOGC = (id, game, startH, score, line = 2.5, med = 130) => ({ ...C(id, game, startH, score, null), market: 'sog', line, price: { median: med, best: med + 10, books: 6, taken_at: '2026-10-10T19:00:00Z' } })
const SOG = [SOGC('sierra', 'g1', 2, 77), SOGC('tango', 'g4', 1, 95), SOGC('uniform', 'g2', 3, 60)]
const INPUTS = { ok: true, byMarket: { anytime: { cands: FIELD, board: FIELD.map((c) => c.score) }, sog: { cands: SOG, board: [...SOG.map((c) => c.score), 10, 20, 30, 40] } }, games: 6, all: FIELD, prices: null }
const WIN = { card_date: DAY, slate_key: DAY, first_start_ms: NOW + 1 * H }

async function lockedDb() {
  const clock = { now: NOW }
  const db = fakeDb(clock)
  const res = await lockCard(db, 'nhl', WIN, INPUTS, { now: NOW })
  assert.match(res, /^locked 3 straight/)
  return { db, clock }
}
const bot = (rows, p) => rows.filter((r) => r.lane === 'bot' && r.product === p)
const names = (rows) => rows.flatMap((r) => r.legs.map((l) => l.name))

// ── A. THE PURE RULE ─────────────────────────────────────────────────────────
await t('A1 before any grade: the public rows are the lead straight only; the Two-Man and the other straights are held and only counted', async () => {
  const { db } = await lockedDb()
  const all = db.rows
  assert.equal(bot(all, 'straight').length, 3); assert.equal(bot(all, 'two_man').length, 1)
  const v = publicCardRows(all)
  assert.equal(v.revealed, false)
  assert.equal(bot(v.rows, 'straight').length, 1); assert.equal(bot(v.rows, 'two_man').length, 0)
  assert.equal(bot(v.rows, 'straight')[0].id, leadStraight(all).id, 'the free pick is the same lead the X post names')
  assert.deepEqual(v.held, { straights: 2, two_man: 1 })
})
await t('A2 after one row has a result (hit / miss / push / void) everything is visible; a void counts as done', () => {
  for (const result of ['hit', 'miss', 'push', 'void']) {
    const rows = [
      { sport: 'nhl', lane: 'bot', product: 'straight', slot: 1, legs: [{ board_pct: 90, player_id: 'a', start_at: '2026-10-10T22:00:00Z' }], result: null },
      { sport: 'nhl', lane: 'bot', product: 'straight', slot: 2, legs: [{ board_pct: 80, player_id: 'b', start_at: '2026-10-10T22:00:00Z' }], result },
      { sport: 'nhl', lane: 'bot', product: 'two_man', slot: 1, legs: [{ player_id: 'a' }, { player_id: 'b' }], result: null },
    ]
    assert.equal(cardRevealed(rows), true, result)
    assert.equal(publicCardRows(rows).rows.length, 3, result)
  }
})
await t('A3 the Double (sport all) never reveals a sport\'s Card; the clock never does (every game started, nothing graded: still held)', async () => {
  const { db } = await lockedDb()
  const withDouble = [...db.rows, { sport: 'all', lane: 'bot', product: 'double', slot: 1, legs: [], result: 'hit' }]
  assert.equal(cardRevealed(withDouble), false)
  db.rows.forEach((r) => { r.start_at = new Date(NOW - 5 * H).toISOString() })      // every game started long ago
  const late = await readCard(db, 'nhl', DAY, { now: NOW + 9 * H })
  assert.equal(late.revealed, false); assert.equal(bot(late.rows, 'two_man').length, 0); assert.equal(bot(late.rows, 'straight').length, 1)
})

// ── B. THE STORE ─────────────────────────────────────────────────────────────
await t('B1 readCard: public = lead only (no held name anywhere in the rows); members = the whole Card; default audience is public', async () => {
  const { db } = await lockedDb()
  const pub = await readCard(db, 'nhl', DAY, { now: NOW })
  const mem = await readCard(db, 'nhl', DAY, { now: NOW, audience: 'members' })
  assert.equal(mem.rows.length, 4); assert.equal(pub.rows.length, 1)
  const lead = pub.rows[0]
  const hidden = mem.rows.filter((r) => r.id !== lead.id)
  const txt = JSON.stringify(pub)
  for (const r of hidden) for (const l of r.legs) if (!lead.legs.some((x) => x.player_id === l.player_id)) assert.ok(!txt.includes(l.name) && !txt.includes(`"${l.player_id}"`), `${l.name} leaked`)
  assert.equal((await cardRows(db, 'nhl', DAY, { now: NOW })).length, 1, 'cardRows defaults to the public view')
})
await t('B2 one straight graded (the others still open): the public now reads every row, graded or live', async () => {
  const { db, clock } = await lockedDb()
  clock.now = NOW + 12 * H
  const open = db.rows.filter((r) => r.result == null)
  const only = new Map([['g4|foxtrot', { played: true, landed: true }]])      // one game final
  assert.ok(await gradeCardRows(db, open, only, clock.now) >= 1)
  assert.ok(db.rows.some((r) => r.result == null), 'something is still open')
  const pub = await readCard(db, 'nhl', DAY, { now: clock.now })
  assert.equal(pub.revealed, true); assert.equal(pub.rows.length, 4)
})
await t('B3 a VOID leg (player did not play) reveals the Card too', async () => {
  const { db, clock } = await lockedDb()
  clock.now = NOW + 12 * H
  await gradeCardRows(db, db.rows.filter((r) => r.result == null), new Map([['g4|foxtrot', { played: false, landed: false }]]), clock.now)
  assert.ok(db.rows.some((r) => r.result === 'void'))
  assert.equal((await readCard(db, 'nhl', DAY, { now: clock.now })).rows.length, 4)
})
await t('B4 the dual (Two-Man) image data: a public caller gets the SAME 404 before the reveal as for a day with no Two-Man; members reach the row', async () => {
  const { db } = await lockedDb()
  const a = await loadDualModel({ sport: 'nhl', date: DAY, lane: 'bot', db, now: NOW, publicOnly: true })
  const b = await loadDualModel({ sport: 'nhl', date: '2026-10-09', lane: 'bot', db, now: NOW, publicOnly: true })
  assert.equal(a.ok, false); assert.equal(a.status, 404); assert.equal(a.why, b.why, 'no oracle: held and absent read the same')
  assert.ok(!JSON.stringify(a).includes('Test '), 'no identifier in the refusal')
  const m = await readCard(db, 'nhl', DAY, { now: NOW, audience: 'members' })
  assert.ok(m.rows.find((r) => r.product === 'two_man'), 'the members audience has it')
})

// ── C. EVERY PUBLIC READER GOES THROUGH THE PUBLIC VIEW (static) ─────────────
const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
await t('C1 /api/card reads the public audience only, builds prices from the public rows, and has no members mode', () => {
  const s = src('app/api/card/route.js')
  assert.match(s, /readCard\(db, sport, date, \{ now, audience: 'public' \}\)/)
  assert.ok(!/audience: 'members'/.test(s) && !/members=|isMember|searchParams.get\('audience'\)/.test(s))
  assert.match(s, /currentPrices\(db, sport, sportRows\.flatMap/)
  assert.ok(!/cardRows\(/.test(s), 'no unfiltered read')
})
await t('C2 only the in-process members paths ask for audience members (tick, day model\'s whole read, dual with publicOnly false)', () => {
  const hits = []
  const walk = (d) => { for (const f of fs.readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) { if (!/node_modules|\.next/.test(f.name)) walk(p) } else if (/\.(js|mjs)$/.test(f.name) && /audience: ?(publicOnly \? 'public' : )?'members'/.test(src(p))) hits.push(p) } }
  for (const d of ['app', 'lib', 'components']) walk(d)
  assert.deepEqual(hits.sort(), ['lib/card/store.js', 'lib/card/tick.js', 'lib/cards/dayData.js', 'lib/cards/dualData.js'].sort())
  assert.ok(!hits.some((h) => h.startsWith('app/') || h.startsWith('components/')), 'no route or component asks for members')
})
await t('C3 the day image route serves scope auto (the data layer decides from stored results); dual route passes publicOnly; slab reads the public rows', () => {
  assert.match(src('app/api/card/day/route.js'), /scope: 'auto'/)
  assert.match(src('app/api/card/dual/route.js'), /publicOnly: true/)
  assert.match(src('lib/cards/cardImage.js'), /use = probe\.revealed \? 'full' : 'free'/)
  assert.ok(!/audience: 'members'/.test(src('lib/cards/slabData.js')))
  assert.ok(!/cardIsRecord/.test(src('lib/cards/cardImage.js') + src('lib/cards/dualData.js') + src('lib/cards/dayData.js')), 'the clock-based rule is gone')
})

// ── D. THE X / FREE-DISCORD POST ─────────────────────────────────────────────
await t('D1 before the reveal the free Card post names ONLY the lead straight (+ Donovan\'s Two-Man): text and payload carry no held name', async () => {
  const { db } = await lockedDb()
  const all = db.rows
  const lead = leadStraight(all)
  const problems = new Map(all.flatMap((r) => r.legs).map((l) => [String(l.player_id), null]))
  const b = xCardBuild({ sport: 'nhl', day: DAY, rows: all, problems, now: NOW })       // even handed the WHOLE Card
  assert.ok(b.text.includes(lead.legs[0].name))
  const held = all.filter((r) => r.id !== lead.id).flatMap((r) => r.legs).filter((l) => l.player_id !== lead.legs[0].player_id)
  for (const l of held) assert.ok(!b.text.includes(l.name) && !JSON.stringify(b.payload).includes(l.name), `${l.name} named on the free post`)
  assert.match(src('lib/card/post.js'), /rows = publicCardRows\(rows\)\.rows/)
})
await t('D2 the free picture is the lead\'s front only (same lead as the text)', () => {
  assert.match(src('lib/card/post.js'), /const s1 = leadStraight\(rows\)      \/\/ the free pick/)
})
await t('D3 no new post kind: KIND_TAGS / CARD_KIND are the ones that were', () => {
  const s = src('lib/card/post.js')
  for (const k of ['card_${sport}', 'card_members_${sport}', 'card_result_${sport}', 'card_ls_${sport}', 'card_ls_result_${sport}', 'card_double_result', "'card_today'"]) assert.ok(s.includes(k), k)
  assert.equal((s.match(/^  [a-zA-Z]+: /gm) || []).length >= 8, true)
})

// ── E. THE MEMBERS SURFACES KEEP EVERYTHING ──────────────────────────────────
await t('E1 the #members text names the Two-Man and every straight (the tick hands it the whole Card)', async () => {
  const { db } = await lockedDb()
  const mem = await readCard(db, 'nhl', DAY, { now: NOW, audience: 'members' })
  const text = membersCardText({ sport: 'nhl', day: DAY, rows: mem.rows.filter((r) => r.lane === 'bot'), prices: new Map() }).text
  for (const n of new Set(names(mem.rows))) assert.ok(text.includes(n), `${n} missing from #members`)
  assert.match(src('lib/card/tick.js'), /cardRows\(db, sport, day, \{ now, audience: 'members' \}\)/)
  assert.match(src('lib/card/tick.js'), /const rows = await dayRows\(db, today/)
})

// ── F. THE MIGRATION ─────────────────────────────────────────────────────────
await t('F1 the policy holds the reveal condition and the free pick; nothing is dropped or rewritten; the .txt (if present) IS the .sql', () => {
  const sql = src('supabase/migrations/202610121000_card_calls_members.sql')
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  assert.match(code, /create or replace function public\.card_calls_revealed/)
  assert.match(code, /c\.result is not null/)
  assert.match(code, /create policy card_calls_read on public\.card_calls for select to anon, authenticated/)
  assert.match(code, /public\.card_calls_revealed\(sport, card_date\)/)
  assert.match(code, /id = public\.card_calls_free_id\(sport, card_date\)/)
  assert.match(code, /product = 'long_shot'/); assert.match(code, /product = 'double' and result is not null/); assert.match(code, /lane = 'donovan' and now\(\) >= locks_at/)
  assert.ok(!/\bset role\b/i.test(code), 'no set role in the real SQL')
  assert.ok(!/\b(drop table|delete from|truncate|alter table .* drop|update public\.card_calls)\b/i.test(code), 'no row or column is touched')
  assert.ok(/security definer set search_path/.test(code))
  assert.ok(/drop policy if exists card_calls_read/.test(code) && /create or replace function/.test(code), 'idempotent')
  const txt = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/MEMBERS-CARD/card_members_SQL.txt'
  if (fs.existsSync(txt)) assert.equal(fs.readFileSync(txt, 'utf8'), sql, 'the .txt is the .sql')
})
await t('F2 the members-post rows stay off the public feed read (homer_feed_posts policy: kinds with _members_ are excluded; card_members_* matches)', () => {
  const sql = src('supabase/migrations/202610091200_homer_feed_members_rls.sql')
  assert.match(sql, /kind not like '%\\_members\\_%'/)
  for (const k of ['card_members_nhl', 'card_members_day', 'card_members_day_2']) assert.ok(/_members_/.test(k), k)
})

// ── G. THE SITE'S LINE ───────────────────────────────────────────────────────
await t('G1 the quiet line is neutral (no "lock", no "locked", no "premium"), and the section shows it from the route\'s `held`', () => {
  assert.equal(HELD_LINE, 'The Two-Man and calls #2-#3 are for members until a leg is graded.')
  assert.ok(!/lock|premium|paid|unlock/i.test(HELD_LINE))
  assert.match(src('components/card/CardSection.js'), /data\?\.held\?\.line/)
})

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
