#!/usr/bin/env node
// #MEMBERS WINS AND THE MORNING GRADE (lib/card/wins.js, lib/card/post.js postMembersWins / postMembersGraded). TEST data, no network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-members-wins.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

let failed = 0
const t = async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`) } catch (e) { failed += 1; console.log(`FAIL  ${name}\n     ${e.message}`) } }

const MEM = 'https://discord.com/api/webhooks/1/TEST_MEMBERS'
process.env.DISCORD_MEMBERS_WEBHOOK = MEM
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'
for (const k of ['DISCORD_HOMER_WEBHOOK', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'MEMBERS_WINS_OFF', 'CARD_POSTS_PAUSE', 'X_API_KEY']) delete process.env[k]
const calls = []
globalThis.fetch = async (url, init = {}) => { if (/discord\.com/.test(String(url))) calls.push({ url: String(url), body: init.body }); return new Response(null, { status: /discord\.com/.test(String(url)) ? 204 : 503 }) }

const { winKind, dayPicks, gradedParts, gradedText, winsText, winsEmbed } = await import('../lib/card/wins.js')
const { postMembersWins, postMembersGraded } = await import('../lib/card/post.js')
const { routeOf } = await import('../lib/dash/routing.js')

const NOW = Date.parse('2026-10-23T14:00:00Z')      // 10 AM ET
const DAY = '2026-10-22'
const leg = (name, extra = {}) => ({ name: `TEST ${name}`, team: 'TST', opp: 'OPP', player_id: name, price: { median: 186, best: 190 }, ...extra })
const row = (id, sport, product, slot, result, legs, graded = NOW - 3600e3) => ({ id, sport, card_date: DAY, lane: 'bot', product, slot, result, legs, graded_at: result ? new Date(graded).toISOString() : null, locks_at: '2026-10-22T22:00:00Z' })
const ROWS = [
  row(1, 'nfl', 'straight', 1, 'hit', [leg('A')]),
  row(2, 'nfl', 'two_man', 1, 'hit', [leg('B'), leg('C')]),
  row(3, 'nhl', 'straight', 1, 'miss', [leg('D', { market: 'sog', line: 2.5 })]),
  row(4, 'all', 'double', 1, 'hit', [leg('E', { sport: 'nhl' }), leg('A', { sport: 'nfl' })]),
  row(5, 'nhl', 'long_shot', 1, 'miss', [leg('F')]),
  { ...row(6, 'nhl', 'two_man', 1, null, [leg('G'), leg('H')]), lane: 'donovan' },
]
const fakeDb = () => {
  const rows = []
  const q = (op, payload) => {
    const f = { eq: {}, in: null }
    const api = {
      select() { return api }, eq(k, v) { f.eq[k] = v; return api }, in(k, v) { f.in = [k, v]; return api }, match(m) { Object.assign(f.eq, m); return api }, is() { return api }, maybeSingle() { return api.then((r) => ({ ...r, data: r.data?.[0] || null })) },
      then(res, rej) {
        const hit = (r) => Object.entries(f.eq).every(([k, v]) => r[k] === v) && (!f.in || f.in[1].includes(r[f.in[0]]))
        let data = []
        if (op === 'select') data = rows.filter(hit)
        if (op === 'upsert') for (const r of payload) { if (!rows.some((x) => x.day === r.day && x.kind === r.kind)) { rows.push({ ...r }); data.push(r) } }
        if (op === 'update') rows.filter(hit).forEach((r) => Object.assign(r, payload))
        if (op === 'delete') for (const r of rows.filter(hit)) rows.splice(rows.indexOf(r), 1)
        return Promise.resolve({ data, error: null }).then(res, rej)
      },
    }
    return api
  }
  return { rows, from: () => ({ select: () => q('select'), upsert: (p) => q('upsert', p), update: (p) => q('update', p), delete: () => q('delete') }) }
}

await t('the kinds: one per pick, routed to #members only, and allowed by the migration', async () => {
  assert.equal(winKind(ROWS[0]), 'card_members_win_nfl_straight_1')
  assert.deepEqual(routeOf('card_members_win_nfl_straight_1').rooms, ['members'])
  assert.deepEqual(routeOf('card_members_graded').rooms, ['members'])
  const sql = fs.readFileSync(new URL('../supabase/migrations/202610231200_members_wins_kinds.sql', import.meta.url), 'utf8')
  const re = new RegExp(/kind ~ ''(.+?)''/.exec(sql)[1])
  for (const r of dayPicks(ROWS)) assert.ok(re.test(winKind(r)), winKind(r))
})
await t('plain words: no status word, no units, the bet as a bettor says it', async () => {
  const w = winsText({ day: DAY, rows: ROWS })
  assert.match(w, /3 picks hit/); assert.match(w, /TEST A \(TST\) scored a TD \(\+186\)/); assert.match(w, /Two-Man: TEST B \+ TEST C, both scored a TD/)
  const g = gradedText({ day: DAY, rows: ROWS.slice(0, 5) })
  assert.match(g, /3 of 5 hit/); assert.match(g, /❌ TEST D \(TST\) 3\+ shots/); assert.match(g, /❌ Long shot: TEST F/)
  for (const s of [w, g]) assert.ok(!/CALLED|ON THE BOARD|\bunits?\b|\d\.?\d*u\b|straight/.test(s), s)
  assert.ok(winsEmbed({ day: DAY, rows: ROWS }).fields.length >= 2)
})
await t('the grade waits for every pick, and for the morning after', async () => {
  assert.equal(gradedParts([...ROWS.slice(0, 5), row(7, 'nhl', 'straight', 2, null, [leg('X')])]), null)
  calls.length = 0
  assert.equal(await postMembersGraded(fakeDb(), { day: DAY, rows: ROWS, now: Date.parse('2026-10-23T10:00:00Z') }), 'waiting-for-morning')
  const db = fakeDb()
  assert.equal(await postMembersGraded(db, { day: DAY, rows: ROWS, now: NOW }), 'posted')
  assert.equal(calls.length, 1); assert.equal(calls[0].url, MEM)
  assert.equal(await postMembersGraded(db, { day: DAY, rows: ROWS, now: NOW + 600e3 }), 'already-posted')
  assert.equal(await postMembersGraded(fakeDb(), { day: DAY, rows: ROWS, now: NOW + 3 * 864e5 }), 'too-old')
})
await t('wins: one post for the fresh hits, never twice, never an old backlog, members URL only', async () => {
  calls.length = 0
  const db = fakeDb()
  assert.equal(await postMembersWins(db, { day: DAY, rows: ROWS, now: NOW }), 'posted 3')
  assert.equal(calls.length, 1); assert.equal(calls[0].url, MEM)
  assert.equal(await postMembersWins(db, { day: DAY, rows: ROWS, now: NOW + 60e3 }), 'already-posted')
  assert.equal(calls.length, 1)
  assert.equal(await postMembersWins(fakeDb(), { day: DAY, rows: ROWS, now: NOW + 12 * 3600e3 }), 'no-new-hits')
  process.env.DISCORD_MEMBERS_WEBHOOK = ''
  assert.equal(await postMembersWins(fakeDb(), { day: DAY, rows: ROWS, now: NOW }), 'no-members-webhook')
  process.env.DISCORD_MEMBERS_WEBHOOK = MEM
  process.env.MEMBERS_WINS_OFF = 'on'
  assert.equal(await postMembersWins(fakeDb(), { day: DAY, rows: ROWS, now: NOW }), 'off')
  delete process.env.MEMBERS_WINS_OFF
})

console.log(failed ? `\n${failed} FAILED` : '\nOK: members wins')
process.exit(failed ? 1 : 0)
