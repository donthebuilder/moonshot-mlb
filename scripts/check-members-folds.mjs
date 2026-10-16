#!/usr/bin/env node
// MEMBERS FOLDS (2026-10-16): MEMBERS_FOLDS_ON (default OFF).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-members-folds.mjs
// ALL DATA IS TEST DATA: made-up players ("Test Alpha"...), clubs AAA..ZZZ, TEST webhooks, an in-memory table, a stubbed fetch. Nothing is sent anywhere.
//   A  switch OFF: THE DAY, the per-sport card post and the write-up #members copy are exactly the old ones
//   B  switch ON: THE DAY is the one briefing (every leg with market / price / status word / one-line why, best looks); a late window is a short (added) post of new legs only
//   C  switch ON: card_members_<sport> is claimed and stored but nothing is sent
//   D  switch ON: the write-up roundup: one #members post per sport and night, only after the last game started, only games with a call, never twice, never to a public hook
//   E  the members text never reaches X or a public webhook; no model chance, no banned words
import './_no-injury-net.mjs'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const MEM = U('7001')
const PUB = { DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_NFL_WEBHOOKS: U('1003'), DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_NBA_WEBHOOKS: U('1005') }
const KEYS = [...Object.keys(PUB), 'DISCORD_MEMBERS_WEBHOOK', 'MEMBERS_FOLDS_ON', 'CARD_POSTS_PAUSE', 'X_WRITEUPS_PAUSE', 'BUCKETS_PUBLIC', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'NEXT_PUBLIC_SITE_URL']
const env = (extra = {}) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, PUB, { DISCORD_MEMBERS_WEBHOOK: MEM, NEXT_PUBLIC_SITE_URL: 'https://site.test' }, extra) }

const calls = []
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) } }
const sent = () => calls.filter((c) => /discord/.test(c.url))
const bodyText = (c) => (typeof c.body === 'string' ? c.body : '')

function fakeDb() {
  const rows = []
  const q = (filters = []) => {
    const run = () => rows.filter((r) => filters.every((f) => f(r)))
    const o = {
      match: (m) => q([...filters, (r) => Object.entries(m).every(([k, v]) => r[k] === v)]),
      eq: (k, v) => q([...filters, (r) => r[k] === v]),
      like: (k, p) => q([...filters, (r) => new RegExp(`^${String(p).replace(/\\_/g, '_').replace(/_/g, '[_]').replace(/%/g, '.*')}$`).test(r[k])]),
      maybeSingle: async () => ({ data: run()[0] || null }),
      then: (res) => res({ data: run(), error: null }),
    }
    return o
  }
  return {
    rows,
    from: () => ({
      select: () => q(),
      upsert: (r) => ({ select: async () => { const out = []; for (const x of r) if (!rows.some((y) => y.day === x.day && y.kind === x.kind)) { rows.push({ ...x }); out.push({ day: x.day }) } return { data: out, error: null } } }),
      update: (patch) => ({ match: async (m) => { for (const r of rows) if (Object.entries(m).every(([k, v]) => r[k] === v)) Object.assign(r, patch); return { error: null } } }),
      delete: () => ({ match: async (m) => { for (let i = rows.length - 1; i >= 0; i -= 1) if (Object.entries(m).every(([k, v]) => rows[i][k] === v)) rows.splice(i, 1); return { error: null } } }),
    }),
  }
}

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }

const NOW = Date.parse('2026-10-16T22:00:00Z')
const DAY = '2026-10-16'
const iso = (ms) => new Date(ms).toISOString()
const leg = (sport, id, extra = {}) => ({ player_id: id, name: `Test ${id}`, team: 'AAA', opp: 'BBB', market: 'anytime', status: 'called', board_pct: 90, start_at: iso(NOW + 3600e3), why: `Test why for ${id}: shots 2nd, goals 1st`, price: { median: 150, best: 170, books: 5 }, ...extra })   // TEST
const row = (sport, product, slot, legs, extra = {}) => ({ lane: 'bot', sport, product, slot, legs, stake: 1, rule: 'different_games', locks_at: iso(NOW - 60e3), start_at: iso(NOW + 3600e3), window_games: 7, ...extra })
const NHL = [row('nhl', 'straight', 1, [leg('nhl', 'A1', { board_pct: 99 })]), row('nhl', 'straight', 2, [leg('nhl', 'A2', { board_pct: 80 })]), row('nhl', 'two_man', 1, [leg('nhl', 'A1'), leg('nhl', 'A2')], { stake: 0.5 })]
const MLB = [row('mlb', 'straight', 1, [leg('mlb', 'M1', { board_pct: 95, why: 'Recent avg exit velo 93.1 mph · 4th of 72 tonight' })])]
const NFL_LATE = [row('nfl', 'straight', 1, [leg('nfl', 'F1', { board_pct: 97, why: 'Targets per game 9.1 · 2nd of 60' })])]

env()
const { postDay, postCardMembers } = await import('../lib/card/post.js')
const { briefingText, briefingEmbed, bestLooks } = await import('../lib/card/briefing.js')
const { membersFoldsOn, roundupItems, roundupText, postRoundup, roundupKind, _resetRoundupMemo } = await import('../lib/dash/membersFolds.js')
const { runNhlWriteups } = await import('../lib/writeups/post.js')
const { _resetTakenForTests } = await import('../lib/dash/postClaim.js')

// ── A. SWITCH OFF ───────────────────────────────────────────────────────────
await t('A1 the switch defaults OFF and reads MEMBERS_FOLDS_ON', async () => {
  env(); assert.equal(membersFoldsOn(), false)
  env({ MEMBERS_FOLDS_ON: 'on' }); assert.equal(membersFoldsOn(), true)
  env({ MEMBERS_FOLDS_ON: 'off' }); assert.equal(membersFoldsOn(), false)
})
await t('A2 OFF: THE DAY is the old text (no best looks, no why) and the per-sport card post delivers', async () => {
  env(); calls.length = 0; _resetTakenForTests()
  const db = fakeDb()
  assert.equal(await postDay(db, { day: DAY, rows: [...NHL, ...MLB], now: NOW }), 'posted')
  const body = sent().map(bodyText).join('\n')
  assert.ok(!/Best looks/.test(body) && !/Test why/.test(body))
  const r = await postCardMembers(db, { sport: 'nhl', day: DAY, rows: NHL.map((x) => ({ ...x, legs: x.legs.map((l) => ({ ...l, start_at: iso(NOW + 3600e3) })) })), now: NOW, image: async () => null, dual: async () => null })
  assert.equal(r, 'posted'); assert.equal(sent().length, 2)
})

// ── B. THE ONE BRIEFING ─────────────────────────────────────────────────────
await t('B1 ON: the briefing has a section per sport, each leg with market / price / status word / one-line why, and the best looks', async () => {
  env({ MEMBERS_FOLDS_ON: 'on' })
  const text = briefingText({ day: DAY, rows: [...NHL, ...MLB, ...NFL_LATE], all: [...NHL, ...MLB, ...NFL_LATE], prices: new Map() })
  assert.match(text, /THE DAY · Oct 16/)
  for (const s of ['NHL', 'NFL', 'MLB']) assert.match(text, new RegExp(`${s} .*straight`))
  assert.match(text, /Test A1 .*CALLED/); assert.match(text, /\+150/)
  assert.match(text, /Recent avg exit velo 93\.1 mph/); assert.match(text, /Targets per game 9\.1/)
  assert.match(text, /Among tonight's skaters: shots 2nd, goals 1st|Test why for A1/)
  assert.match(text, /Best looks of the day\n1\. Test A1 \(NHL/)
  assert.equal(bestLooks([NHL[0]]).length, 0, 'one straight is not a "best looks" list')
  assert.ok(/Two-Man/.test(text))
})
await t('B2 ON: one post at the first lock, then ONE short (added) post of only the new legs; a known pick is never repeated', async () => {
  env({ MEMBERS_FOLDS_ON: 'on' }); calls.length = 0; _resetTakenForTests()
  const db = fakeDb()
  const rowKey = (r) => `${r.sport}|${r.product}|${r.slot}|${r.lane}`
  assert.equal(await postDay(db, { day: DAY, rows: [...NHL, ...MLB], now: NOW }), 'posted')
  const first = db.rows.find((r) => r.kind === 'card_members_day')
  assert.deepEqual(first.payload.keys.sort(), [...NHL, ...MLB].map(rowKey).sort())
  const posted = db.rows.map((r) => ({ kind: r.kind, payload: r.payload }))
  assert.equal(await postDay(db, { day: DAY, rows: [...NHL, ...MLB, ...NFL_LATE], posted, now: NOW }), 'posted')
  const upd = JSON.parse(bodyText(sent()[1])) // the embed or content of the second send
  const flat = JSON.stringify(upd)
  assert.match(flat, /added/i); assert.match(flat, /Test F1/); assert.ok(!/Test A1|Test M1/.test(flat), 'no known pick repeated')
  assert.ok(!/Best looks/.test(flat))
  assert.equal(await postDay(db, { day: DAY, rows: [...NHL, ...MLB, ...NFL_LATE], posted: db.rows.map((r) => ({ kind: r.kind, payload: r.payload })), now: NOW }), 'nothing-new')
  assert.ok(briefingEmbed({ day: DAY, rows: NHL, all: NHL }).fields.every((f) => f.value.length <= 1024))
})

// ── C. the per-sport row is stored, not sent ───────────────────────────────────────
await t('C1 ON: card_members_<sport> is claimed (row recorded) but nothing is sent', async () => {
  env({ MEMBERS_FOLDS_ON: 'on' }); calls.length = 0; _resetTakenForTests()
  const db = fakeDb()
  const r = await postCardMembers(db, { sport: 'nhl', day: DAY, rows: NHL, now: NOW, image: async () => { throw new Error('no render when folded') }, dual: async () => null })
  assert.match(r, /^posted \(folded/); assert.equal(sent().length, 0)
  const rec = db.rows.find((x) => x.kind === 'card_members_nhl')
  assert.ok(rec && rec.payload.sport === 'nhl')
  assert.match(await postCardMembers(db, { sport: 'nhl', day: DAY, rows: NHL, now: NOW }), /already-posted/)
})

// ── D. the write-up roundup ─────────────────────────────────────────────────────
const wrow = (id, start, extra = {}) => ({ kind: `writeup_nhl_${id}`, payload: { mode: 'live', game_id: id, kickoff: iso(start), called: ['p1'], members_sent: 'roundup', writeup: { away: 'AAA', home: 'BBB', header: { t: `Test ${id} + Test Two: why they're the goal looks` }, players: [{ name: `Test ${id}` }] }, ...extra } })
const stored = (db, rs) => { for (const r of rs) db.rows.push({ day: DAY, ...r }) }
await t('D1 items: only live, called, folded-for-roundup games, in kickoff order; text carries each game\'s headline and its site link', async () => {
  const rs = [wrow('g2', NOW - 1800e3), wrow('g1', NOW - 3600e3), wrow('g3', NOW, { called: [] }), wrow('g4', NOW, { mode: 'dry' }), wrow('g5', NOW, { members_sent: true })]
  const items = roundupItems(rs)
  assert.deepEqual(items.map((i) => i.game_id), ['g1', 'g2'])
  const text = roundupText({ sport: 'nhl', day: DAY, items })
  assert.match(text, /LAMP MEMBERS · 2026-10-16 · every game with a call tonight \(2\)/)
  assert.match(text, /AAA at BBB: Test g1 \+ Test Two: why they're the goal looks\nhttps:\/\/site\.test\/app#sport=nhl&tab=game&game=g1/)
  assert.ok(!/%|probab|\block/i.test(text))
  const many = roundupItems(Array.from({ length: 24 }, (_, i) => wrow(`g${100 + i}`, NOW - 7200e3 + i * 1000)))
  const long = roundupText({ sport: 'nhl', day: DAY, items: many })
  assert.ok([...long].length <= 1900); assert.match(long, /Every game's page: https:\/\/site\.test\/app#sport=nhl&tab=game/); assert.match(long, /game=g100/, 'the first games keep their own link')
})
await t('D2 ON: one roundup per sport and night, only after the last game has started; never twice; members hook only', async () => {
  env({ MEMBERS_FOLDS_ON: 'on' }); calls.length = 0; _resetTakenForTests(); _resetRoundupMemo()
  const db = fakeDb(); stored(db, [wrow('g1', NOW - 3600e3), wrow('g2', NOW + 1800e3)])
  assert.equal(await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3, NOW + 1800e3], now: NOW }), 'not-yet')
  assert.equal(sent().length, 0)
  const later = NOW + 3600e3
  assert.equal(await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3, NOW + 1800e3], now: later }), 'posted')
  assert.equal(sent().length, 1); assert.equal(sent()[0].url, MEM)
  assert.ok(db.rows.some((r) => r.kind === roundupKind('nhl') && r.day === DAY))
  _resetRoundupMemo()
  assert.match(await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3, NOW + 1800e3], now: later + 6 * 60e3 }), /already-posted/)
  assert.equal(sent().length, 1)
})
await t('D3 OFF, no members hook, BUCKETS hidden, or nothing to say: nothing sent', async () => {
  env(); calls.length = 0; _resetTakenForTests(); _resetRoundupMemo()
  const db = fakeDb(); stored(db, [wrow('g1', NOW - 3600e3)])
  assert.equal(await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3], now: NOW }), 'off')
  env({ MEMBERS_FOLDS_ON: 'on', DISCORD_MEMBERS_WEBHOOK: '' }); _resetRoundupMemo()
  assert.equal(await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3], now: NOW }), 'no-members-webhook')
  env({ MEMBERS_FOLDS_ON: 'on' }); _resetRoundupMemo()
  assert.equal(await postRoundup(db, { sport: 'nba', day: DAY, startsMs: [NOW - 3600e3], now: NOW }), 'hidden')
  assert.equal(await postRoundup(fakeDb(), { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3], now: NOW }), 'nothing-to-say')
  assert.equal(sent().length, 0)
})
await t('D4 runNhlWriteups with the switch ON: the per-game row is still stored (members_sent roundup), no per-game #members send; OFF sends it as before', async () => {
  const game = { id: 'g9', startUtc: iso(NOW + 70 * 60e3), state: 'pre', away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' } }
  const src = fs.readFileSync(new URL('../lib/writeups/post.js', import.meta.url), 'utf8')
  assert.equal((src.match(/membersFoldsOn\(\) \? FOLDED : await sendMembers\(r\.full/g) || []).length, 3, 'all three sports fold their per-game #members send')
  assert.equal((src.match(/await sendMembers\(r\.full/g) || []).length, 3, 'and no per-game #members send is left outside the switch')
  assert.match(src, /const FOLDED = 'roundup'/)
  assert.ok(typeof runNhlWriteups === 'function' && game.id)
})

// ── E. nothing reaches X or a public hook ───────────────────────────────────────────
await t('E1 the folded posts go to the members webhook only, never X or a public hook', async () => {
  env({ MEMBERS_FOLDS_ON: 'on', X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' }); calls.length = 0; _resetTakenForTests(); _resetRoundupMemo()
  const db = fakeDb(); stored(db, [wrow('g1', NOW - 3600e3)])
  await postDay(db, { day: DAY, rows: [...NHL, ...MLB], now: NOW })
  await postRoundup(db, { sport: 'nhl', day: DAY, startsMs: [NOW - 3600e3], now: NOW })
  assert.ok(calls.length >= 2)
  assert.ok(calls.every((c) => c.url === MEM), `only the members URL was called: ${calls.map((c) => c.url).join(' ')}`)
  const lib = ['lib/card/briefing.js', 'lib/dash/membersFolds.js'].map((f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n')
  assert.ok(!/postToX|uploadImageToX|toX: true|DISCORD_MEMBERS_WEBHOOK|sportHooks|feedHooks/.test(lib.replace(/^\s*\/\/.*$/gm, '')), 'the fold modules cannot reach X or a public hook')
  for (const text of [briefingText({ day: DAY, rows: NHL, all: NHL }), roundupText({ sport: 'nhl', day: DAY, items: roundupItems([wrow('g1', NOW)]) })]) assert.ok(!/%|probab/i.test(text))
})

console.log(failed ? `\n${failed} FAILED` : '\nOK: members folds')
process.exit(failed ? 1 : 0)
