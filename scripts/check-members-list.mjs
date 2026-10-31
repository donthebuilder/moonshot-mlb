#!/usr/bin/env node
// THE #MEMBERS LIST, EDITED IN PLACE (batch member-requests 2B, lib/card/membersList.js + lib/dash/discordEdit.js + lib/card/listPointer.js).
// TEST data (every name says TEST), an in-memory database and a recording fetch: nothing here touches Discord, X or Supabase.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-members-list.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

let failed = 0
const t = async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`) } catch (e) { failed += 1; console.log(`FAIL  ${name}\n     ${e.message}`) } }

const MEM = 'https://discord.com/api/webhooks/111111/TEST_MEMBERS'
const PUB = 'https://discord.com/api/webhooks/222222/TEST_PUBLIC'
process.env.DISCORD_MEMBERS_WEBHOOK = MEM
process.env.DISCORD_NFL_WEBHOOKS = PUB
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
for (const k of ['MEMBERS_LIST_OFF', 'CARD_POSTS_PAUSE', 'X_API_KEY', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]
const calls = []
let patchStatus = 200
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || 'GET', body: init.body })
  if (init.method === 'PATCH') return { ok: patchStatus < 300, status: patchStatus, statusText: 'test', json: async () => ({}), headers: { get: () => null } }
  return { ok: true, status: 200, json: async () => ({ id: '999000111', channel_id: '555666777' }), headers: { get: () => null } }
}

const L = await import('../lib/card/membersList.js')
const E = await import('../lib/dash/discordEdit.js')
const P = await import('../lib/card/listPointer.js')
const { routeOf } = await import('../lib/dash/routing.js')

const NOW = Date.parse('2026-10-25T17:00:00Z')
const DAY = '2026-10-25'
const leg = (name, o = {}) => ({ player_id: name, name: `TEST ${name}`, team: 'TST', opp: 'OPP', game_id: `g-${name}`, start_at: '2026-10-25T18:00:00Z', score: 80, market: 'anytime', why: `why ${name}`, price: { median: 180, best: 200 }, ...o })
const row = (id, slot, legs, o = {}) => ({ id, sport: 'nfl', card_date: DAY, lane: 'bot', product: legs.length > 1 ? 'two_man' : 'straight', slot, legs, leg_count: legs.length, start_at: legs[0].start_at, result: null, leg_results: null, locked_at: '2026-10-25T16:00:00Z', ...o })
const ROWS = [row(1, 1, [leg('A')]), row(2, 2, [leg('B', { score: 70, market: 'rush_yds', line: 99.5 })]), row(3, 1, [leg('C', { score: 60 }), leg('D', { score: 50, game_id: 'g-D2' })])]

// a tiny in-memory homer_feed_posts
function fakeDb() {
  const rows = []
  const q = (filter) => ({
    select: () => q(filter), match: (m) => q(m),
    maybeSingle: async () => ({ data: rows.find((r) => Object.entries(filter || {}).every(([k, v]) => r[k] === v)) || null, error: null }),
    update: (patch) => ({ match: async (m) => { const r = rows.find((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (r) Object.assign(r, patch); return { error: null } } }),
  })
  return { rows, from: () => ({ select: () => q(), update: (patch) => ({ match: async (m) => { const r = rows.find((x) => Object.entries(m).every(([k, v]) => x[k] === v)); if (r) Object.assign(r, patch); return { error: null } } }) }) }
}
// the post step stands in for postMembers: stores the row the way postOnce does (payload + discord_msg)
const posts = []
const stubPost = (db) => async (_db, { day, kind, build }) => { const b = await build(); posts.push({ kind, text: b.text }); db.rows.push({ day, kind, payload: { ...b.payload, discord_msg: { id: '999000111', channel_id: '555666777' } } }); return 'posted' }

await t('the text: count in the title, state line, one line a play, price at lock, the words from listRows, the pointer in words', async () => {
  const { listEntries } = await import('../lib/card/listRows.js')
  const text = L.listText({ sport: 'nfl', day: DAY, entries: listEntries(ROWS, { now: NOW }), now: NOW })
  const lines = text.split('\n')
  assert.match(lines[0], /^🏈 TUDDY · 4 plays today$/)
  assert.equal(lines[1], '4 waiting')
  assert.ok(lines.some((l) => /^⏳ TEST A \(TST\) · TD · \+180 at lock · WAITING$/.test(l)), text)
  assert.ok(lines.some((l) => /rush yds o99\.5 · \+180 at lock · WAITING$/.test(l)), text)
  assert.ok(lines.some((l) => /· Two-Man · WAITING$/.test(l)), 'a Two-Man leg says so')
  assert.ok(lines.includes('   why A'), 'the angle rides under the line')
  assert.match(lines[lines.length - 1], /^The same list, on the site → DASH · TUDDY · Called list$/)
  assert.ok(!/https?:\/\//.test(text), 'words, never a URL')
  assert.ok(!/\d%|chance|probab/i.test(text), 'no chance printed')
})
await t('a status change changes the text: live, then hit / miss / scratched, same words as the site', async () => {
  const { listEntries } = await import('../lib/card/listRows.js')
  const later = NOW + 2 * 3600e3
  const graded = ROWS.map((r, i) => (i === 0 ? { ...r, result: 'hit' } : i === 1 ? { ...r, result: 'void' } : r))
  const text = L.listText({ sport: 'nfl', day: DAY, entries: listEntries(graded, { now: later }), now: later })
  assert.match(text.split('\n')[1], /^2 live · 1 hit · 1 scratched$/)
  assert.ok(text.includes('✅ TEST A') && text.includes('HIT') && text.includes('SCRATCHED') && text.includes('🔴'))
})
await t('over Discord\'s 1,900: the angle lines go from the bottom, never a line cut in half; nothing fits = no post', async () => {
  const { listEntries } = await import('../lib/card/listRows.js')
  const many = Array.from({ length: 28 }, (_, i) => row(100 + i, 1 + (i % 3), [leg(`P${i}`, { score: 90 - i, why: 'a long reason that takes room '.repeat(3) })]))
  const text = L.listText({ sport: 'nfl', day: DAY, entries: listEntries(many, { now: NOW }), now: NOW })
  assert.ok(text.length <= 1900 && text.includes('TEST P0') && text.includes('TEST P27'), 'every play still has its line')
  assert.ok(text.split('\n').every((l) => l.length < 400), 'no line cut mid-way')
  const huge = Array.from({ length: 400 }, (_, i) => row(500 + i, 1, [leg(`Q${i}`)]))
  assert.equal(L.listText({ sport: 'nfl', day: DAY, entries: listEntries(huge, { now: NOW }), now: NOW }), null)
  assert.equal(L.listText({ sport: 'nfl', day: DAY, entries: [], now: NOW }), null)
})
await t('first call posts once; the same text is "unchanged" (no request); a new status EDITS the stored message in place, #members hook only', async () => {
  const db = fakeDb()
  const edits = []
  const deps = { postMembers: stubPost(db), edit: async (hook, msg, o) => { edits.push({ hook, msg, text: o.text }); return { ok: true, status: 200 } } }
  const r1 = await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps })
  assert.equal(r1.nfl, 'posted'); assert.equal(posts.length, 1)
  assert.equal(posts[0].kind, 'card_members_list_nfl')
  const stored = db.rows[0].payload
  assert.ok(stored.hash && stored.n === 4 && !JSON.stringify(stored).includes('TEST'), 'the stored row holds a hash and the message id, never a name or text')
  const r2 = await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps })
  assert.equal(r2.nfl, 'unchanged'); assert.equal(edits.length, 0)
  const later = NOW + 2 * 3600e3
  const r3 = await L.postMembersList(db, { day: DAY, rows: ROWS.map((r, i) => (i === 0 ? { ...r, result: 'hit' } : r)), now: later, deps })
  assert.equal(r3.nfl, 'edited'); assert.equal(edits.length, 1)
  assert.equal(edits[0].hook, MEM); assert.deepEqual(edits[0].msg, { id: '999000111', channel_id: '555666777' })
  assert.ok(edits[0].text.includes('HIT'))
  assert.equal(posts.length, 1, 'an edit never posts a second message')
  assert.ok(db.rows[0].payload.edited_at && db.rows[0].payload.hash !== stored.hash)
})
await t('a refused edit leaves the row alone and says so; a row with no message id is never reposted', async () => {
  const db = fakeDb()
  const deps = { postMembers: stubPost(db), edit: async () => ({ ok: false, status: 404 }) }
  await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps })
  const before = db.rows[0].payload.hash
  const r = await L.postMembersList(db, { day: DAY, rows: ROWS.map((x, i) => (i === 0 ? { ...x, result: 'miss' } : x)), now: NOW + 3 * 3600e3, deps })
  assert.equal(r.nfl, 'edit-failed: 404'); assert.equal(db.rows[0].payload.hash, before)
  const db2 = fakeDb(); db2.rows.push({ day: DAY, kind: 'card_members_list_nfl', payload: { hash: 'old' } })
  const r2 = await L.postMembersList(db2, { day: DAY, rows: ROWS, now: NOW, deps: { ...deps, postMembers: async () => { throw new Error('must not repost') } } })
  assert.equal(r2.nfl, 'no-message-id')
})
await t('no members webhook / the kill switch / a paused card: nothing is read, posted or edited', async () => {
  const db = fakeDb()
  const boom = { postMembers: async () => { throw new Error('no') }, edit: async () => { throw new Error('no') } }
  assert.equal(await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps: { ...boom, membersWebhook: () => '' } }), 'no-members-webhook')
  process.env.MEMBERS_LIST_OFF = 'on'; assert.equal(await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps: boom }), 'off'); delete process.env.MEMBERS_LIST_OFF
  process.env.CARD_POSTS_PAUSE = 'on'; assert.equal(await L.postMembersList(db, { day: DAY, rows: ROWS, now: NOW, deps: boom }), 'paused'); delete process.env.CARD_POSTS_PAUSE
})
await t('the edit goes ONLY to a #members webhook: a public hook, no hook or no message id is refused before any request', async () => {
  calls.length = 0
  const bad = await E.editMembersMessage(PUB, { id: '999000111' }, { text: 'x', kind: 'card_members_list_nfl', sportKey: 'nfl' })
  assert.ok(bad.refused && !bad.ok)
  assert.ok((await E.editMembersMessage(MEM, {}, { text: 'x' })).refused)
  assert.ok((await E.editMembersMessage('', { id: '999000111' }, { text: 'x' })).refused)
  assert.equal(calls.length, 0, 'no request left the building')
  assert.equal(E.editUrl(MEM, '999000111'), `${MEM}/messages/999000111`)
  assert.equal(E.editUrl(`${MEM}?wait=true`, '999000111'), `${MEM}/messages/999000111`)
  const ok = await E.editMembersMessage(MEM, { id: '999000111' }, { text: 'TEST list', kind: 'card_members_list_nfl', sportKey: 'nfl' })
  assert.ok(ok.ok); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'PATCH'); assert.equal(calls[0].url, `${MEM}/messages/999000111`)
  const body = JSON.parse(calls[0].body); assert.deepEqual(body.allowed_mentions, { parse: [] }); assert.ok(body.content.includes('TEST list'))
  patchStatus = 500
  const err = await E.editMembersMessage(MEM, { id: '999000111' }, { text: 'x', kind: 'card_members_list_nfl', sportKey: 'nfl' })
  assert.equal(err.ok, false); assert.equal(err.status, 500); patchStatus = 200
})
await t('routing: the list kind is members-only, and a members kind never names a public room', async () => {
  for (const s of ['nfl', 'nhl', 'mlb', 'nba']) assert.deepEqual(routeOf(`card_members_list_${s}`).rooms, ['members'], s)
  const src = fs.readFileSync('lib/card/membersList.js', 'utf8')
  assert.ok(/postMembers\(/.test(src) || /deps\.postMembers \|\| postMembers/.test(src), 'created through postMembers (the validated members webhook)')
  assert.ok(!/feedHooks|FEED_WEBHOOKS|partnerHooks|postToX|postToDiscord/.test(src), 'no path to a public room or X')
})
await t('the public pointer: one line, ONLY the free pregame Card post\'s Discord copy; never a members kind, never a URL', async () => {
  assert.equal(P.listPointerFor('card_nfl'), 'Every called play → DASH · TUDDY · Called list')
  for (const k of ['card_members_nfl', 'card_members_list_nfl', 'card_members_day', 'card_result_nfl', 'card_ls_nfl', 'moment_nfl_x', 'receipt', null]) assert.equal(P.listPointerFor(k), null, String(k))
  assert.equal(P.withListPointer('Body', 'card_nfl'), 'Body\n\nEvery called play → DASH · TUDDY · Called list')
  assert.equal(P.withListPointer('Body\n\nEvery called play → DASH · TUDDY · Called list', 'card_nfl').match(/Called list/g).length, 1, 'not twice')
  assert.equal(P.withListPointer('x'.repeat(1890), 'card_nfl', { limit: 1900 }), 'x'.repeat(1890), 'a full post goes without it (never trimmed)')
  const { discordPayload } = await import('../lib/dash/xPost.js')
  assert.ok(discordPayload('TEST card', { kind: 'card_nfl', sportKey: 'nfl' }).payload.content.endsWith('Called list'))
  assert.ok(!discordPayload('TEST card', { kind: 'card_members_nfl', sportKey: 'nfl' }).payload.content.includes('Called list'))
  const x = fs.readFileSync('lib/dash/xPost.js', 'utf8')
  assert.ok(!/withListPointer/.test(x.slice(x.indexOf('export async function postToX'), x.indexOf('export function discordPayload') > 0 ? x.indexOf('export function discordPayload') : undefined)), 'X is untouched')
})
await t('wiring + the migration', async () => {
  const tick = fs.readFileSync('lib/card/tick.js', 'utf8')
  assert.ok(/postMembersList\(db, \{ day, rows, now \}\)/.test(tick) && /import \{ postMembersList \} from '\.\/membersList'/.test(tick))
  const sql = fs.readFileSync('supabase/migrations/202610260100_members_list_kinds.sql', 'utf8')
  assert.ok(sql.includes("card_members_list_(mlb|nfl|nhl|nba)") && /not valid/.test(sql) && /PROBE/.test(sql))
})
await t('the box: one embed, accent bar, a section per play kind, a mark on every line, one site link, no angle lines, no chance printed', async () => {
  const { listEntries } = await import('../lib/card/listRows.js')
  const e = L.listEmbed({ sport: 'nfl', day: DAY, entries: listEntries(ROWS, { now: NOW }), now: NOW })
  assert.ok(e && e.title.includes('plays today') && typeof e.color === 'number')
  assert.deepEqual(e.fields.map((f) => f.name), ['Straights', 'Two-Man'])
  assert.ok(e.fields[0].value.includes('TEST A') && /\u23F3/.test(e.fields[0].value) && !e.fields[0].value.includes('why A'))
  assert.ok(e.fields[1].value.includes('with TEST D') || e.fields[1].value.includes('with TEST C'))
  assert.ok(!/%|chance|probab/i.test(JSON.stringify(e)))
  assert.equal(L.listEmbed({ sport: 'nfl', day: DAY, entries: [], now: NOW }), null)
})
await t('MEMBERS_BOX_ON cuts exactly the repeat kinds (leg checks, graded recap) and nothing that grades or pings; off by default', async () => {
  const R = await import('../lib/dash/routing.js')
  delete process.env.MEMBERS_BOX_ON
  assert.equal(R.isCut('card_members_leg_nfl_two_man_1_1'), false)
  process.env.MEMBERS_BOX_ON = 'on'
  assert.equal(R.isCut('card_members_leg_nfl_two_man_1_1'), true)
  assert.equal(R.isCut('card_members_graded'), true)
  for (const k of ['card_members_win_nfl_straight_1', 'card_members_day', 'card_members_day_2', 'card_result_nfl', 'card_members_list_nfl', 'members_roundup_nhl']) assert.equal(R.isCut(k), false, k)
  delete process.env.MEMBERS_BOX_ON
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
