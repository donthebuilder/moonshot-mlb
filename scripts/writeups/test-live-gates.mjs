#!/usr/bin/env node
// THE WRITE-UPS, LIVE (2026-10-09), checked on TEST DATA: made-up clubs, players and ids (all labelled "Test ..."),
// a fake database and a fake fetch. Nothing here touches X, Discord or a real database.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/writeups/test-live-gates.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST', DISCORD_MLB_WEBHOOKS: 'https://discord.test/hook-a' })
for (const k of ['X_WRITEUPS_PAUSE', 'WRITEUPS_AUTOPOST', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_SCHEDULE_OFF', 'X_DAILY_CAP', 'X_TEXT_LIMIT', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]

const tweets = [], discords = []
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  if (u.includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(7000 + tweets.length) } }), headers: { get: () => null } } }
  if (u.startsWith('https://discord.test')) { discords.push(opts.body); return { ok: true, status: 204, json: async () => ({}), text: async () => '', headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } }
}

const P = await import('../../lib/writeups/post.js')
const T = await import('../../lib/writeups/text.js')
const NHL = await import('../../lib/writeups/nhl.js')
const G = await import('../../lib/dash/xGate.js')
const L = await import('../../lib/dash/xPostLog.js')
const PC = await import('../../lib/dash/postClaim.js')
const X = await import('../../lib/dash/xPolicy.js')
const S = await import('../../lib/dash/xSchedule.js')

function fakeDb(tables = {}) {
  const t = (name) => (tables[name] = tables[name] || [])
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const parseList = (s) => String(s).replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '').trim())
  const likeRe = (pat) => new RegExp(`^${String(pat).replace(/\\_/g, '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/\u0000/g, '_')}$`)
  class Q_ {
    constructor(name) { this.name = name; this.f = []; this.op = 'select'; this.opts = {} }
    select(_c, opts = {}) { this.opts = opts; return this }
    eq(c, v) { this.f.push((r) => r[c] === v); return this }
    gte(c, v) { this.f.push((r) => r[c] != null && cmp(String(r[c]), String(v)) >= 0); return this }
    lte(c, v) { this.f.push((r) => r[c] != null && cmp(String(r[c]), String(v)) <= 0); return this }
    lt(c, v) { this.f.push((r) => r[c] != null && cmp(String(r[c]), String(v)) < 0); return this }
    gt(c, v) { this.f.push((r) => r[c] != null && cmp(String(r[c]), String(v)) > 0); return this }
    not(c, op, v) {
      if (c === 'reply_x_post_id' && tables.__noReplyCol) this.err = { message: 'column reply_x_post_id does not exist' }
      if (op === 'is') this.f.push((r) => r[c] != null)
      else if (op === 'in') { const l = parseList(v); this.f.push((r) => !l.includes(String(r[c]))) }
      return this
    }
    like(c, p) { const re = likeRe(p); this.f.push((r) => re.test(String(r[c] ?? ''))); return this }
    in(c, l) { this.f.push((r) => l.includes(r[c])); return this }
    match(o) { for (const [k, v] of Object.entries(o)) this.f.push((r) => r[k] === v); return this }
    order() { return this }
    limit() { return this }
    maybeSingle() { this.single = true; return this }
    upsert(rows, o = {}) { this.op = 'upsert'; this.rows = rows; this.o = o; return this }
    update(patch) { this.op = 'update'; this.patch = patch; return this }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej) }
    run() {
      if (this.err) return { data: null, count: null, error: this.err }
      const rows = t(this.name)
      if (this.op === 'upsert') {
        const made = []
        for (const r of this.rows) {
          if (rows.some((x) => x.day === r.day && x.kind === r.kind)) continue
          const row = { x_post_id: null, seen_at: new Date().toISOString(), payload: {}, ...r }
          rows.push(row); made.push({ day: row.day })
        }
        return { data: made, error: null }
      }
      const hit = rows.filter((r) => this.f.every((fn) => fn(r)))
      if (this.op === 'update') { hit.forEach((r) => Object.assign(r, this.patch)); return { data: hit, error: null } }
      if (this.single) return { data: hit[0] || null, error: null }
      return { data: this.opts.head ? null : hit, count: this.opts.count ? hit.length : null, error: null }
    }
  }
  return { tables, from: (name) => new Q_(name) }
}

let n = 0
const ok = async (name, fn) => { reset(); await fn(); n++; console.log(`ok  ${name}`) }
function reset() { tweets.length = 0; discords.length = 0; L._resetLogForTests(); G._resetRecentCache(); G._resetPostedCache(); PC._resetTakenForTests(); delete process.env.X_WRITEUPS_PAUSE; delete process.env.X_GUARDS_OFF }
const MIN = 60e3
const etWindow = (day) => `${day}T16:00:00Z`    // inside that ET day (noon ET)

// ── NHL (TEST board): readBoard returns { games }; a game has rows (one called skater a club), starters, proj ──
const DATE = '2026-10-12'
const START = Date.parse('2026-10-12T23:00:00Z')
let pid = 100
function bgame(id, away, home, { total = 6.0, confirmed = true, top = 1, start = START, source = true } = {}) {
  const row = (team, opp, isHome, i) => ({ playerId: pid++, name: `Test Skater ${team}`, team, opp, pos: 'C', home: isHome, status: 'called', score: 80 - i, rank: i + 1, context: { role: i === 0 ? 'TOP' : 'GOAL', nightRank: i < top ? 3 : 40, nightOf: 120 } })
  const g = { game: { id, startUtc: new Date(start).toISOString(), state: 'pre', away: { abbrev: away }, home: { abbrev: home }, venue: 'Test Arena' },
    proj: { total, source: 'xg' }, rows: [row(away, home, false, 0), row(home, away, true, 1)] }
  if (source) g.starters = { away: { name: 'Test Goalie A', confirmed }, home: { name: 'Test Goalie H', confirmed } }
  return g
}
const night = (...bgs) => ({ games: bgs, readBoard: async () => ({ games: bgs }) })
const gamesOf = (bgs) => bgs.map((b) => ({ id: b.game.id, startUtc: b.game.startUtc, state: 'pre', away: b.game.away, home: b.game.home }))
const newDb = (extra = {}) => fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [], dash_flags: [{ key: 'writeups_autopost', value: 'off' }], ...extra })
const run = (db, bgs, now, opts = {}) => P.runNhlWriteups(db, { date: DATE, games: gamesOf(bgs), now, readBoard: async () => ({ games: bgs }), ...opts })
const rowOf = (db, kind) => db.tables.homer_feed_posts.find((r) => r.kind === kind)

await ok('NHL: live by CODE DEFAULT (the old dash_flags row says off and is ignored); Discord + X for the featured game, ids stored', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB', { total: 6.4 })]
  const db = newDb()
  const out = await run(db, bgs, START - 70 * MIN)
  assert.match(out[1], /^live: discord ok, X 70/)
  const row = rowOf(db, 'writeup_nhl_1')
  assert.equal(row.payload.mode, 'live'); assert.equal(row.payload.featured, 'NIGHT'); assert.ok(/^70\d+$/.test(row.x_post_id))
  assert.deepEqual(row.payload.named, bgs[0].rows.map((r) => String(r.playerId)))   // the receipt quote reads this
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
  assert.ok(!/https?:|www\.|(^|\s)#[A-Za-z]/.test(tweets[0].text), 'no links or hashtags on X: ' + tweets[0].text)
  assert.equal(P.writeupsPaused(), false)
})
await ok('NHL: X_WRITEUPS_PAUSE=on stops it (a dry row, nothing sent)', async () => {
  process.env.X_WRITEUPS_PAUSE = 'on'
  const bgs = [bgame(1, 'AAA', 'BBB')]
  const db = newDb()
  const out = await run(db, bgs, START - 70 * MIN)
  assert.match(out[1], /^dry/); assert.equal(rowOf(db, 'writeup_nhl_1').x_post_id, 'dry')
  assert.equal(tweets.length + discords.length, 0)
  assert.equal((await P.writeupsAutopost(db)).on, false)
})
await ok('NHL: one featured game a night to X (the dial number), every game to Discord; a second tick posts nothing', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB', { total: 5.9 }), bgame(2, 'CCC', 'DDD', { total: 6.6 }), bgame(3, 'EEE', 'FFF', { total: 5.1 })]
  const db = newDb()
  const out = await run(db, bgs, START - 70 * MIN)
  assert.equal(tweets.length, 1); assert.equal(discords.length, 3)
  assert.match(out[2], /X 70/); assert.doesNotMatch(out[1], /X /); assert.doesNotMatch(out[3], /X /)
  assert.equal(rowOf(db, 'writeup_nhl_2').payload.featured, 'NIGHT')
  const again = await run(db, bgs, START - 65 * MIN)
  assert.ok(Object.values(again).every((v) => v === 'already written')); assert.equal(tweets.length, 1)
})
await ok('NHL: goalie unconfirmed -> HELD (no row, no claim) every tick, then posts once confirmed', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB', { confirmed: false })]
  const db = newDb()
  for (const m of [70, 62, 50, 40]) { const out = await run(db, bgs, START - m * MIN); assert.match(out[1], /^held: starting goalie not confirmed/) }
  assert.equal(db.tables.homer_feed_posts.length, 0); assert.equal(tweets.length + discords.length, 0)
  assert.ok(L.recentLog().some((e) => e.state === 'HELD' && e.kind === 'writeup_nhl_1'))
  bgs[0].starters.away.confirmed = true; bgs[0].starters.home.confirmed = true
  const out = await run(db, bgs, START - 45 * MIN)    // 45 minutes before: past the first look, inside the retry limit
  assert.match(out[1], /^live/); assert.equal(tweets.length, 1)
})
await ok('NHL: goalie still unconfirmed 30 minutes before puck drop -> DROPPED (a skipped row, never posted)', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB', { confirmed: false })]
  const db = newDb()
  const out = await run(db, bgs, START - 29 * MIN)
  assert.match(out[1], /^skipped: .*not confirmed 30 minutes before puck drop/)
  assert.equal(rowOf(db, 'writeup_nhl_1').x_post_id, 'skipped'); assert.equal(tweets.length + discords.length, 0)
  assert.ok(L.recentLog().some((e) => e.state === 'DROPPED' && e.kind === 'writeup_nhl_1'))
  const later = await run(db, bgs, START - 20 * MIN)
  assert.equal(later[1], 'already written')
})
await ok('NHL: no goalie source for the game also waits (never named on a guess), then drops', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB', { source: false })]
  const db = newDb()
  assert.match((await run(db, bgs, START - 65 * MIN))[1], /^held: .*no starting-goalie source/)
  assert.match((await run(db, bgs, START - 28 * MIN))[1], /^skipped/)
})
await ok('NHL: the cap tier \'writeup\' stops at 18 (X skipped, Discord still goes, the reason is stored)', async () => {
  const rows = []
  for (let i = 0; i < 18; i++) rows.push({ day: DATE, kind: `list_${i}`, x_post_id: String(500 + i), seen_at: etWindow(DATE) })
  const db = newDb({ homer_feed_posts: rows })
  const out = await run(db, [bgame(1, 'AAA', 'BBB')], START - 70 * MIN)
  assert.match(out[1], /^live: discord ok, X daily cap/); assert.equal(tweets.length, 0); assert.equal(discords.length, 1)
  assert.equal(rowOf(db, 'writeup_nhl_1').x_post_id, null)
})
await ok('NHL: the repeat guard holds X when the same skater was named by this kind within the window', async () => {
  const bgs = [bgame(1, 'AAA', 'BBB')]
  const prior = [{ day: '2026-10-11', kind: 'writeup_nhl_9', x_post_id: '123', seen_at: etWindow('2026-10-11'), payload: { named: [String(bgs[0].rows[0].playerId)] } }]
  const db = newDb({ homer_feed_posts: prior })
  const out = await run(db, bgs, START - 70 * MIN)
  assert.match(out[1], /X named within/); assert.equal(tweets.length, 0); assert.equal(discords.length, 1)
})
await ok('checker fallback: a long text the checker rejects posts the short text instead (never nothing, never unchecked)', () => {
  const w = NHL.buildNhlWriteup(bgame(1, 'AAA', 'BBB'))
  w.players[0].why.push({ t: '12.34 shots a game', src: 'test', v: [] })    // TEST: a number the checker cannot find in the facts
  const plain = T.renderWriteup(w, { xLimit: 900 })
  assert.equal(plain.ok, false)
  const safe = T.renderWriteupSafe(w, { xLimit: 900 })
  assert.equal(safe.ok, true); assert.equal(safe.fellBack, true); assert.equal(safe.x, plain.short); assert.equal(safe.full, plain.short); assert.ok(safe.longWhy.length)
  const clean = T.renderWriteupSafe(NHL.buildNhlWriteup(bgame(1, 'AAA', 'BBB')), { xLimit: 900 })
  assert.equal(clean.fellBack, false)
})

// ── NFL (TEST calls file): the stale file is waited for until 30 minutes before kickoff ──
const KICK = Date.parse('2026-10-16T00:15:00Z')   // Thursday night, 8:15 pm ET: the TNF slot, so featured
const callsFile = (builtMin) => ({ season: 2026, week: 6, built_at: new Date(KICK - builtMin * MIN).toISOString(), games: [
  { game_id: 'T-TNF', away: 'TAA', home: 'TBB', kickoff: new Date(KICK).toISOString(), state: 'pre', calls: [
    { player_id: 'N1', name: 'Test Back', team: 'TAA', position: 'RB', role: 'TOP', score: 80.5, slate_rank: 2, of: 120 },
    { player_id: 'N2', name: 'Test Wideout', team: 'TBB', position: 'WR', role: 'TD', score: 70.2, slate_rank: 9, of: 120 }], no_call: [] }] })
await ok('NFL: a stale calls file WAITS (no row), re-reads past the cache, posts when the rebuild lands, one X post', async () => {
  let file = callsFile(240), busts = 0
  const fetchCalls = async (bust) => { if (bust) busts++; return file }
  const db = newDb()
  for (const m of [74, 65, 55]) assert.equal((await P.runNflWriteups(db, { now: KICK - m * MIN, fetchCalls }))['T-TNF'], 'waiting for the pregame build')
  assert.ok(busts >= 3, 'a stale read is repeated with the cache bypassed')
  assert.equal(db.tables.homer_feed_posts.length, 0)
  file = callsFile(90)   // the bot rebuilt it 90 minutes before kickoff
  const out = await P.runNflWriteups(db, { now: KICK - 45 * MIN, fetchCalls })
  assert.match(out['T-TNF'], /^live: discord ok, X 70/)
  const row = rowOf(db, 'writeup_nfl_T-TNF')
  assert.equal(row.payload.featured, 'TNF'); assert.deepEqual(row.payload.named, ['N1', 'N2']); assert.equal(tweets.length, 1)
  assert.deepEqual((await P.runNflWriteups(db, { now: KICK - 44 * MIN, fetchCalls })), { 'T-TNF': 'already written' })
})
await ok('NFL: still stale 30 minutes before kickoff -> dropped with a reason (a skipped row), nothing posted', async () => {
  const fetchCalls = async () => callsFile(240)
  const db = newDb()
  const out = await P.runNflWriteups(db, { now: KICK - 29 * MIN, fetchCalls })
  assert.match(out['T-TNF'], /^skipped: calls file not rebuilt before kickoff/)
  assert.equal(rowOf(db, 'writeup_nfl_T-TNF').x_post_id, 'skipped'); assert.equal(tweets.length + discords.length, 0)
})
await ok('NFL: X_WRITEUPS_PAUSE=on stops it (dry); live by default otherwise', async () => {
  process.env.X_WRITEUPS_PAUSE = 'on'
  const fetchCalls = async () => callsFile(90)
  const db = newDb()
  assert.match((await P.runNflWriteups(db, { now: KICK - 70 * MIN, fetchCalls }))['T-TNF'], /^dry/)
  assert.equal(tweets.length + discords.length, 0)
})

// ── MLB: the call_<game_pk> write-up under the same gates ──
await ok('MLB: call_<pk> is an event-driven INFO write-up in the \'writeup\' tier; the scheduler passes it, the cap stops it at 18', async () => {
  assert.equal(X.tierOf('call_776655'), 'writeup'); assert.equal(S.kindInfo('call_776655').mode, 'event')
  const db = newDb()
  assert.equal((await G.scheduleGate(db, { kind: 'call_776655', day: DATE, sport: 'mlb' })).ok, true)
  assert.equal((await G.admit(db, { day: DATE, kind: 'call_776655', ids: ['1'], repeat: false })).state, 'go')
  for (let i = 0; i < 18; i++) db.tables.homer_feed_posts.push({ day: DATE, kind: `list_${i}`, x_post_id: String(500 + i), seen_at: etWindow(DATE) })
  assert.equal((await G.admit(db, { day: DATE, kind: 'call_776655', ids: ['1'], repeat: false })).state, 'capped')
})
await ok('MLB: the homers tick asks the scheduler, checks the starter is confirmed, stores payload.named, and posts through xOk', () => {
  const src = fs.readFileSync(new URL('../../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('THE CALL, ONE PER GAME'), src.indexOf('STORY THREADS, THE RESULT'))
  for (const need of ['scheduleGate(db, { kind, day, sport: \'mlb\'', 'mlbNamingProblem(call.row)', 'named: callNamed', 'xOk(db, { day, kind, ids: callNamed', 'claimSlot(db, day, kind)']) assert.ok(block.includes(need), `missing: ${need}`)
  assert.ok(block.indexOf('scheduleGate') < block.indexOf('claimSlot'), 'scheduler before the claim')
})
await ok('no flag or env other than X_WRITEUPS_PAUSE can switch the write-ups off', () => {
  const src = fs.readFileSync(new URL('../../lib/writeups/post.js', import.meta.url), 'utf8')
  assert.ok(!/flagState|WRITEUPS_AUTOPOST/.test(src.replace(/\/\/.*$/gm, '')), 'post.js reads no flag')
})
console.log(`\n${n} checks passed`)
