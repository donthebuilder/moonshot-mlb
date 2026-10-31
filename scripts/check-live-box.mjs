#!/usr/bin/env node
// THE LIVE BOX, CHECKED (lib/dash/liveBox.js, lib/nba/liveBox.js, app/api/buckets/moments). TEST data (every name says TEST), an in-memory database and
// recording send/edit seams: nothing here touches Discord, X or Supabase.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-live-box.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

let failed = 0
const t = async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`) } catch (e) { failed += 1; console.log(`FAIL  ${name}\n     ${e.message}`) } }
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
process.env.NEXT_PUBLIC_BUCKETS_PUBLIC = 'on'

const B = await import('../lib/dash/liveBox.js')
const N = await import('../lib/nba/liveBox.js')

function fakeDb(refuseClaim = false) {
  const rows = new Map()
  const k = (m) => `${m.day}|${m.kind}`
  const q = (m = {}) => ({
    select: () => q(m), match: (x) => q(x), maybeSingle: async () => ({ data: rows.get(k(m)) || null, error: null }),
    upsert: (arr) => ({ select: async () => { if (refuseClaim) return { data: null, error: { message: 'check constraint' } }; const r = arr[0]; if (rows.has(k(r))) return { data: [], error: null }; rows.set(k(r), { ...r }); return { data: [{ day: r.day }], error: null } } }),
    update: (patch) => ({ match: async (x) => { const r = rows.get(k(x)); if (r) Object.assign(r, patch); return { error: null } } }),
    delete: () => ({ match: async (x) => { rows.delete(k(x)); return { error: null } } }),
  })
  return { from: () => q(), rows }
}
const HOOK = 'https://discord.com/api/webhooks/111/TEST_A'
const HOOK2 = 'https://discord.com/api/webhooks/222/TEST_B'
const row = (i, o = {}) => ({ game_id: `g${i}`, player_id: `p${i}`, kind: '30_piece', game_date: '2026-10-31', name: `TEST P${i}`, team: 'TST', opp: 'OPP', points: 30 + i, status: 'called', ...o })
const common = { sport: 'nba', day: '2026-10-31', ...N.NBA_BOX }

await t('the first moment posts ONE message per room and keeps each id; later ones EDIT, never post again', async () => {
  const db = fakeDb(); const posts = []; const edits = []
  const deps = { post: async (text, o, h) => { posts.push({ o, h }); return { ok: true, messages: [{ id: `m${posts.length}`, channel_id: 'c' }] } }, edit: async (h, m, o) => { edits.push({ h, m, o }); return { ok: true } } }
  assert.equal(await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(1), 1000), hooks: [HOOK, HOOK2], deps }), 'posted')
  assert.equal(posts.length, 2)
  assert.deepEqual(db.rows.get('2026-10-31|live_box_nba').payload.msgs.map((m) => m.hook), ['111', '222'])
  assert.ok(!JSON.stringify(db.rows.get('2026-10-31|live_box_nba')).includes('TEST_A'), 'a webhook token is never stored')
  assert.equal(await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(2), 2000), hooks: [HOOK, HOOK2], deps }), 'edited')
  assert.equal(posts.length, 2); assert.equal(edits.length, 2)
  assert.equal(edits[0].o.embed.fields[0].value.split('\n').length, 2, 'both moments are in the box')
  assert.equal(await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(2), 3000), hooks: [HOOK, HOOK2], deps }), 'already-in')
  assert.equal(edits.length, 2, 'the same moment twice is no request')
})
await t('the box reads right: title, count line, sections, newest kept past 12 lines, a mark of the board word, no chance printed', async () => {
  const evs = Array.from({ length: 15 }, (_, i) => N.nbaBoxEvent(row(i), 1000 + i))
  evs.push(N.nbaBoxEvent(row(40, { kind: 'double_double', points: null }), 5000))
  const e = B.liveEmbed({ sport: 'nba', events: evs, ...N.NBA_BOX, at: 9000 })
  assert.ok(e.title.includes('live tonight') && e.description.includes('15 at 30+') && e.description.includes('1 with a double-double or better'))
  const lines = e.fields[0].value.split('\n')
  assert.equal(lines[0], '+4 earlier'); assert.equal(lines.length, 12); assert.ok(lines[11].includes('TEST P14'))
  assert.ok(e.fields[1].value.includes('double-double') && e.fields[0].value.includes('CALLED'))
  assert.ok(!/%|chance|probab/i.test(JSON.stringify(e)))
  assert.equal(B.liveEmbed({ sport: 'nba', events: [], ...N.NBA_BOX }), null)
})
await t('the kinds SQL not run: claim-failed, nothing posted (the caller posts the old way)', async () => {
  const posts = []
  const r = await B.addLiveEvent(fakeDb(true), { ...common, event: N.nbaBoxEvent(row(1)), hooks: [HOOK], deps: { post: async () => { posts.push(1); return { ok: true, messages: [] } }, edit: async () => ({ ok: true }) } })
  assert.equal(r, 'claim-failed'); assert.equal(posts.length, 0)
})
await t('a refused first send gives the claim back and records nothing', async () => {
  const db = fakeDb()
  const r = await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(1)), hooks: [HOOK], deps: { post: async () => ({ ok: false, error: 'boom' }), edit: async () => ({ ok: true }) } })
  assert.ok(/^send-failed/.test(r)); assert.equal(db.rows.size, 0)
})
await t('a refused edit still records the moment (the next edit carries it) and says so; no rooms = nothing', async () => {
  const db = fakeDb(); const ok = { post: async () => ({ ok: true, messages: [{ id: 'm1', channel_id: 'c' }] }), edit: async () => ({ ok: false, status: 500 }) }
  await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(1), 1), hooks: [HOOK], deps: ok })
  const r = await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(2), 2), hooks: [HOOK], deps: ok })
  assert.ok(/^send-failed/.test(r)); assert.equal(db.rows.get('2026-10-31|live_box_nba').payload.events.length, 2)
  assert.equal(await B.addLiveEvent(db, { ...common, event: N.nbaBoxEvent(row(3)), hooks: [], deps: ok }), 'no-rooms')
})
await t('off by default; the NBA route posts the old way unless the switch is on; X is untouched', async () => {
  delete process.env.LIVE_BOX_ON
  assert.equal(B.liveBoxOn(), false)
  process.env.LIVE_BOX_ON = 'on'; assert.equal(B.liveBoxOn(), true); delete process.env.LIVE_BOX_ON
  const route = fs.readFileSync('app/api/buckets/moments/route.js', 'utf8')
  assert.ok(/liveBoxOn\(\)/.test(route) && /addLiveEvent\(/.test(route) && /postToDiscord\(text, \{ sport: 'nba', kind: 'nba30'/.test(route), 'the old post is still there')
  assert.ok(/postToX\(/.test(route))
})
await t('LIVE_BOX_ON also cuts the standalone red-zone post (kept as a row), and nothing that grades', async () => {
  const R = await import('../lib/dash/routing.js')
  delete process.env.LIVE_BOX_ON
  assert.equal(R.isCut('alert_nflboardred'), false)
  process.env.LIVE_BOX_ON = 'on'
  assert.equal(R.isCut('alert_nflboardred'), true)
  for (const k of ['td', 'nhlgoal', 'nba30', 'card_result_nfl', 'receipt', 'live_box_nba']) assert.equal(R.isCut(k), false, k)
  delete process.env.LIVE_BOX_ON
})
await t('the migration: the kind family, NOT VALID, a probe', async () => {
  const sql = fs.readFileSync('supabase/migrations/202610301200_live_box_kinds.sql', 'utf8')
  assert.ok(sql.includes('live_box_(mlb|nfl|nhl|nba)') && /not valid/i.test(sql) && /PROBE/.test(sql))
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
