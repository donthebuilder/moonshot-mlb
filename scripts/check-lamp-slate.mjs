#!/usr/bin/env node
// THE LAMP SLATE, CHECKED ON TEST DATA (2026-10-10). Every name, id and number below is made up and labelled "Test ...";
// the database is an in-memory fake and fetch is replaced, so nothing here touches X, Discord, Supabase or the network.
// The clock is pinned at the top of the file.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lamp-slate.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
process.env.X_TEXT_LIMIT = '900'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' })
for (const k of ['X_LINKS_EMERGENCY', 'X_LINK_KINDS', 'X_POST_LINK', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_DAILY_CAP', 'POST_KINDS_ON', 'NHL_SLATE_OFF', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_HOMER_WEBHOOK', 'DISCORD_MEMBERS_WEBHOOK']) delete process.env[k]

// THE CLOCK IS PINNED: Saturday 2026-10-10, 21:40Z = 5:40pm ET. Tonight's first puck is 23:00Z (7pm ET); its lock window opened at 21:20Z.
const NOW = Date.parse('2026-10-10T21:40:00Z')
Date.now = () => NOW
const DAY = '2026-10-10'
const T = (hhmm) => Date.parse(`${DAY}T${hhmm}:00Z`)

const tweets = [], discords = []
let xFail = []
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets') && xFail.length) return { ok: false, status: xFail.shift(), json: async () => ({ title: 'test failure' }), headers: { get: () => null } }
  if (String(url).includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(7000 + tweets.length) } }), headers: { get: () => null } } }
  if (String(url).startsWith('https://discord.test/')) { discords.push({ url: String(url), body: JSON.parse(opts.body) }); return { ok: true, status: 204, json: async () => ({}), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}

const LS = await import('../lib/posts/lampSlate.js')
const SL = await import('../lib/posts/slate.js')
const P = await import('../lib/dash/xPolicy.js')
const SC = await import('../lib/dash/xSchedule.js')
const G = await import('../lib/dash/xGate.js')
const L = await import('../lib/dash/xPostLog.js')
const PC = await import('../lib/dash/postClaim.js')
const FX = await import('../lib/dash/xFail.js')
const DC = await import('../lib/dash/discordCard.js')
const CS = await import('../lib/callStatus.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const reset = () => { FX._resetXFail(); PC._resetTakenForTests(); xFail = []; tweets.length = 0; discords.length = 0; L._resetLogForTests(); G._resetRecentCache(); LS._resetLampSlateForTests(); delete process.env.NHL_SLATE_OFF; delete process.env.X_POSTS_PAUSE; Date.now = () => NOW }

// ── a tiny in-memory Supabase: just the calls the gate and postOnce make ────
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
    delete() { this.op = 'delete'; return this }
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
      if (this.op === 'delete') { hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { data: hit, error: null } }
      if (this.op === 'update') { hit.forEach((r) => Object.assign(r, this.patch)); return { data: hit, error: null } }
      if (this.single) return { data: hit[0] || null, error: null }
      return { data: this.opts.head ? null : hit, count: this.opts.count ? hit.length : null, error: null }
    }
  }
  return { tables, from: (name) => new Q_(name) }
}


// ── TEST DATA ────────────────────────────────────────────────────────────────
const CLUBS = [['TOR', 'MTL'], ['BOS', 'NYR'], ['COL', 'SEA'], ['EDM', 'VAN']]   // home, away
const pct = (k) => ({ shotsPg: 99 - k, goalsPg: 97 - k * 2, toi: 90 - k })
/** One game with two CALLED skaters (one per club, by construction) and one ON THE BOARD skater. */
const game = (i, o = {}) => {
  const [home, away] = CLUBS[i]
  const start = o.startUtc || `${DAY}T${i < 2 ? '23:00' : '23:30'}:00Z`
  const r0 = o.rank0 ?? (i * 2 + 1)
  const conf = { away: { playerId: 100 + i, confirmed: true }, home: { playerId: 200 + i, confirmed: true } }
  return {
    game: { id: 1000 + i, startUtc: start, state: o.state || 'pre', scheduleState: o.scheduleState || 'OK', away: { abbrev: away }, home: { abbrev: home } },
    setting: o.setting ?? true, locked: false, lockedAt: o.lockedAt === undefined ? `${DAY}T21:30:00Z` : o.lockedAt,
    starters: o.starters === undefined ? conf : o.starters,
    rows: o.rows || [
      { playerId: `t${r0}`, name: `Test Skater ${r0}`, team: home, opp: away, home: true, score: 95 - r0, status: 'called', legs: { shotsPg: 3.4 }, pct: pct(r0), context: { nightRank: r0, nightOf: 300 } },
      { playerId: `t${r0 + 1}`, name: `Test Skater ${r0 + 1}`, team: away, opp: home, home: false, score: 94 - r0, status: 'called', legs: { shotsPg: 2.9 }, pct: pct(r0 + 1), context: { nightRank: r0 + 1, nightOf: 300 } },
      { playerId: `b${i}`, name: `Test Board Skater ${i}`, team: home, opp: away, home: true, score: 60, status: 'board', legs: { shotsPg: 2 }, pct: pct(40), context: { nightRank: 100 + i, nightOf: 300 } },
    ],
  }
}
const night = (count = 4, over = {}) => Array.from({ length: count }, (_, i) => game(i, over[i] || {}))   // 4 games = 8 CALLED
const textBad = /https?:|www\.|\.com\b|dashnetwork|test\.example|#\w|\bbot\b|\bprobab|\bchance\b|\bodds\b|%|\block\b|\blocked\b|guarantee|\bpick\b|\bsure\b/i
const emojiCount = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length
const rowsOf = (db) => db.tables.homer_feed_posts.filter((r) => r.kind === 'nhl_slate')
// The routing table (lib/dash/routing.js nhl_slate -> the 'sport' room) narrows any hook to that room's webhooks, so the test hook IS the LAMP
// room for the run (DISCORD_NHL_WEBHOOKS), as in production; without it the send is 'routing:no-room' and nothing goes (the 0 !== 1 of 10-20).
const run = async (db, games, now = NOW, extra = {}) => {
  const had = process.env.DISCORD_NHL_WEBHOOKS
  if (!had) process.env.DISCORD_NHL_WEBHOOKS = 'https://discord.test/h'
  try { return await LS.postLampSlateOnce(db, { day: DAY, load: async () => games, hooks: 'https://discord.test/h', now, ...extra }) } finally { if (!had) delete process.env.DISCORD_NHL_WEBHOOKS }
}
const A = (games, now = NOW, extra = {}) => LS.assembleLampSlate({ day: DAY, games, now, ...extra })
const APP_NHL_BOARD = '/app#sport=nhl&tab=fullboard'

// ═══ 1. THE LIST ═══════════════════════════════════════════════════════════
await ok('list: the top 5 CALLED by night rank (rank 1..5 of 8), best first, one per line: name (TEAM) vs OPP and ONE fact', () => {
  const a = A(night(4))
  assert.equal(a.state, 'go')
  assert.deepEqual(a.named, ['t1', 't2', 't3', 't4', 't5'])
  const lines = a.text.split('\n')
  assert.match(lines[0], /^\u{1F3D2} THE LAMP SLATE · SAT OCT 10$/u)
  assert.equal(lines[1], '')                                                   // label, a blank line, the lead, a blank line, the names (Donovan 2026-10-16)
  assert.equal(lines[2], '8 CALLED tonight, top 5 by LAMP ranking score.')      // no percentile note (2026-10-23)
  assert.equal(lines[3], '')
  assert.equal(lines[4], '1. Test Skater 1 (TOR) vs MTL · 3.4 shots a game')       // his real numbers, never a percentile (2026-10-23)
  assert.equal(lines[5], '2. Test Skater 2 (MTL) vs TOR · 2.9 shots a game')
  assert.equal(lines.length, 9)
  assert.ok(!/Board Skater/.test(a.text))                                   // ON THE BOARD (not called) men are never in it
  assert.equal(a.payload.n_called, 8); assert.deepEqual(a.payload.named, a.named)
})
await ok('list: the lead counts honestly -- "tonight" when every game is locked, "so far tonight" when one is still a preview', () => {
  assert.match(A(night(4)).text, /8 CALLED tonight, top 5/)
  const part = night(4); part[3] = game(3, { lockedAt: null, setting: false })
  const a = A(part)
  assert.match(a.text, /6 CALLED so far tonight, top 5/); assert.ok(!a.named.includes('t7') && !a.named.includes('t8'))
})
await ok('list: at most 5; exactly 3 posts 3; fewer than 3 CALLED posts nothing', () => {
  assert.equal(A(night(4)).named.length, 5)
  const three = [game(0), game(1, { rows: [game(1).rows[0]] })]
  const a3 = A(three); assert.equal(a3.state, 'go'); assert.deepEqual(a3.named, ['t1', 't2', 't3']); assert.match(a3.text, /3 CALLED tonight, top 3 by/)
  const two = A([game(0)])
  assert.equal(two.state, 'none'); assert.match(two.reason, /only 2 CALLED skaters in the locked games \(fewer than 3\)/)
  assert.equal(A([game(0, { rows: [game(0).rows[2]] })]).state, 'none')      // only an ON THE BOARD man: no call
})
await ok("list: the fact is the Card's stat words from stored data -- shots / goals / ice time percentile among tonight's skaters (never a probability)", () => {
  const g = game(0)
  // his real numbers, never a percentile (Donovan, 2026-10-23)
  assert.equal(LS.shortFact(g.rows[0], 1, 300), '3.4 shots a game')
  assert.equal(LS.longFact(g.rows[0], 1, 300), '3.4 shots a game')
  assert.equal(LS.shortFact({ legs: { shotsPg: 3.1, goalsPg: 0.55 }, pct: { shotsPg: 50, goalsPg: 91, toi: 70 } }), '0.55 goals a game')      // the stronger of the two leads
  assert.equal(LS.longFact({ legs: { shotsPg: 3.1, goalsPg: 0.55, toi: 20.5 } }), '3.1 shots and 0.55 goals a game · 20:30 ice time')
  assert.equal(LS.shortFact({ pct: { shotsPg: 12, goalsPg: 40, toi: 99.6 } }, 4, 300), '#4 of 300 on the LAMP board')      // percentiles alone are never printed
  assert.equal(LS.shortFact({ legs: { shotsPg: 3.4 } }, 4, 300), '3.4 shots a game')               // no percentile stored: the stored rate, else his night rank. Never invented
  assert.equal(LS.shortFact({}, 4, 300), '#4 of 300 on the LAMP board')
})
await ok('wording: no link, no hashtag, no probability, no "lock"/"guaranteed", plain text; the score is a ranking score', () => {
  const a = A(night(4))
  assert.ok(!textBad.test(a.text), a.text)
  assert.match(a.text, /ranking score/)
  assert.equal(emojiCount(a.text), 1)
  assert.equal(P.stripLinks(a.text), a.text)
})
await ok("limits: X's length (default 280) -- 5 names when they fit, fewer when long names do not, never a cut line; the lead says how many", () => {
  const long = night(4).map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, name: `${r.name} Montgomery-Smith` })) }))
  for (const [limit, games] of [[280, night(4)], [270, night(4)], [900, long], [4000, long]]) {
    const a = A(games, NOW, { limit })
    assert.equal(a.state, 'go', String(limit))
    assert.ok(SL.xLen(a.text) <= limit, `${limit}: ${SL.xLen(a.text)}`)
    const k = a.named.length
    assert.ok(k >= 3 && k <= 5); assert.match(a.text, new RegExp(`top ${k} by LAMP`)); assert.equal(a.text.split('\n').filter((l) => /^\d\. /.test(l)).length, k)
  }
  assert.equal(A(long, NOW, { limit: 900 }).named.length, 5); assert.ok(A(night(4), NOW, { limit: 280 }).named.length >= 3)   // at the bare 280 three or four fit (the shorter lead since 10-23); the long-post allowance (X_TEXT_LIMIT) carries five
  assert.equal(A(night(4), NOW, { limit: 280 }).state, 'go')
  assert.equal(A(night(4), NOW, { limit: 40 }).state, 'none')                       // three names do not fit in 40: nothing, not a cut post
  assert.ok(SL.xLen(A(night(4)).text) <= 900)
})

// ═══ 2. THE LOCK AND THE CLOCK ═════════════════════════════════════════════
await ok('lock: no lock written for the first game -> WAITING (a preview is never named); the lock lands -> it is named', () => {
  const none = { lockedAt: null, setting: false }
  const a = A(night(4, { 0: none, 1: none, 2: none, 3: none }))
  assert.equal(a.state, 'waiting'); assert.match(a.reason, /lock not written yet for the first game/)
  const mixed = night(4); mixed[0].rows = mixed[0].rows.map((r) => ({ ...r, preview: true }))      // rows flagged preview inside a game are not calls either
  const m = A(mixed); assert.equal(m.state, 'go'); assert.ok(!m.named.includes('t1') && !m.named.includes('t2'))
  assert.equal(A([{ ...game(0), setting: true, lockedAt: null }, game(1)]).state, 'waiting')       // `setting` without a lockedAt is not a lock
})
await ok('first puck passed: a game that has started is never named; every game started -> nothing; within 20 minutes of puck -> not named', () => {
  const a = A(night(4, { 0: { state: 'live' } })); assert.equal(a.state, 'go'); assert.ok(!a.named.includes('t1') && !a.named.includes('t2'))
  assert.deepEqual([...A(night(4), T('23:05')).named].sort(), ['t5', 't6', 't7', 't8'])        // the 23:00 games have started; the 23:30 pair is 25 minutes away
  assert.match(A(night(4), T('23:15')).reason, /less than 20 minutes|started/)
  assert.equal(A(night(2), T('22:40')).state, 'go'); assert.equal(A(night(2), T('22:41')).state, 'none')     // 20 minutes exactly is the edge
  const b = A(night(4), T('22:45'))                                                                          // the later pair can still be named
  assert.equal(b.state, 'go'); assert.deepEqual([...b.named].sort(), ['t5', 't6', 't7', 't8'])
  assert.ok(Math.min(...b.picks.map((p) => p.startMs)) - T('22:45') >= 20 * 60e3)
  assert.equal(A([]).state, 'none'); assert.equal(A([game(0, { scheduleState: 'PPD' })]).state, 'none')
})

// ═══ 3. THE GOALIE RULE ════════════════════════════════════════════════════
const unconfirmed = (i) => ({ starters: { away: { playerId: 100 + i, confirmed: false }, home: { playerId: 200 + i, confirmed: true } } })
await ok('goalie unconfirmed -> HELD (nothing named), then 30 minutes before puck the man is left out and the next CALLED skater takes the seat', () => {
  const games = night(4, { 0: unconfirmed(0) })   // the AWAY goalie (MTL) is unconfirmed -> the home skater (TOR, t1) is pending; t2 faces the confirmed home goalie
  const h = A(games, T('21:40'))
  assert.equal(h.state, 'held'); assert.match(h.reason, /Test Skater 1: starting goalie not confirmed/)
  assert.deepEqual(h.pending.map((p) => p.id), ['t1'])
  const t = A(games, T('22:31'))                  // 29 minutes before the 23:00 puck
  assert.equal(t.state, 'go'); assert.deepEqual(t.named, ['t2', 't3', 't4', 't5', 't6']); assert.deepEqual(t.trimmed, ['t1'])
  assert.ok(!/Test Skater 1 /.test(t.text)); assert.match(t.text, /top 5 by/)
  assert.deepEqual(A(night(4), T('22:00')).named.slice(0, 2), ['t1', 't2'])    // confirmed in time: he is named, in his place
  const far = night(4, { 3: unconfirmed(3) })                                   // a pending man outside the top five does not hold the post
  assert.equal(A(far).state, 'go')
})
await ok("no goalie source for a game -> a definite no (not a wait): that game's skaters are left out at once", () => {
  const a = A(night(4, { 0: { starters: null } })); assert.equal(a.state, 'go'); assert.deepEqual(a.named, ['t3', 't4', 't5', 't6', 't7'])
  assert.equal(A(night(1, { 0: { starters: null } })).state, 'none')
})
await ok('a pending list holds the post through the tick: nothing claimed, nothing sent, the log says HELD; later it posts without him', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  const games = night(4, { 0: unconfirmed(0) })
  assert.match(await run(db, games, T('21:40')), /^held: /); assert.equal(rowsOf(db).length, 0); assert.equal(tweets.length, 0); assert.equal(discords.length, 0)
  assert.ok(L.recentLog().some((e) => e.kind === 'nhl_slate' && e.state === 'HELD' && /starting goalie not confirmed/.test(e.reason)))
  Date.now = () => T('22:31')
  assert.equal(await run(db, games, T('22:31')), 'posted')
  assert.ok(L.recentLog().some((e) => e.kind === 'nhl_slate' && e.state === 'DROPPED' && /goalie not confirmed 30 min/.test(e.reason)))
  assert.ok(!rowsOf(db)[0].payload.named.includes('t1'))
})

// ═══ 4. POSTING: ONE A DAY, THE CLAIM, THE KILL SWITCH ════════════════════
await ok('post: claims (day, nhl_slate), X first, Discord after; the row keeps who was named and the INFO tag; a second try the same day sends nothing', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  assert.equal(await run(db, night(4)), 'posted')
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
  const row = rowsOf(db)[0]
  assert.ok(row.x_post_id); assert.equal(row.discord_sent, true); assert.deepEqual(row.payload.named, ['t1', 't2', 't3', 't4', 't5']); assert.equal(row.payload.x_tag, 'INFO'); assert.equal(row.payload.n_called, 8)
  // postToX adds the receipt line under every post (lib/posts/receiptLine.js): the tweet is the Slate's text plus that line, nothing else
  const { receiptLineFor } = await import('../lib/posts/receiptLine.js')
  assert.equal(tweets[0].text, `${A(night(4)).text}\n\n${receiptLineFor('nhl_slate', { sport: 'nhl', text: A(night(4)).text })}`)
  for (let i = 0; i < 3; i++) assert.equal(await run(db, night(4), NOW + i * 600e3), 'already-posted')
  PC._resetTakenForTests(); assert.equal(await run(db, night(4)), 'already-posted')       // a cold instance still finds the row
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1); assert.equal(rowsOf(db).length, 1)
})
await ok('post: waiting for the lock sends and claims nothing; the tick that finds it posts; puck-passed sends nothing', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  const none = { lockedAt: null, setting: false }
  assert.equal(await run(db, night(4, { 0: none, 1: none, 2: none, 3: none }), T('21:00')), 'waiting'); assert.equal(rowsOf(db).length, 0); assert.equal(tweets.length + discords.length, 0)
  assert.equal(await run(db, night(4), T('21:30')), 'posted')
  reset(); const db2 = fakeDb({ homer_feed_posts: [] })
  assert.match(await run(db2, night(4), T('23:15')), /^none: /); assert.equal(rowsOf(db2).length, 0); assert.equal(tweets.length + discords.length, 0)
})
await ok('post: fewer than 3 CALLED sends and claims nothing, and a later tick with more locked games posts', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  assert.match(await run(db, [game(0)]), /^none: only 2 CALLED/); assert.equal(rowsOf(db).length, 0); assert.equal(tweets.length + discords.length, 0)
  assert.equal(await run(db, night(2)), 'posted')
})
await ok('kill switch: NHL_SLATE_OFF=on stops it (nothing read, claimed or sent); off again and it posts', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  process.env.NHL_SLATE_OFF = 'on'
  let loaded = 0
  assert.equal(await LS.postLampSlateOnce(db, { day: DAY, load: async () => { loaded++; return night(4) }, hooks: 'https://discord.test/h', now: NOW }), 'off')
  assert.equal(loaded, 0); assert.equal(rowsOf(db).length, 0); assert.equal(tweets.length + discords.length, 0)
  delete process.env.NHL_SLATE_OFF
  assert.equal(await run(db, night(4)), 'posted')
})
await ok('post: the pause (X_POSTS_PAUSE) holds X; before the first puck the claim is released with nothing sent anywhere, so a retry cannot double anything', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  process.env.X_POSTS_PAUSE = 'on'
  assert.match(await run(db, night(4)), /^retry: x /); assert.equal(tweets.length, 0); assert.equal(discords.length, 0); assert.equal(rowsOf(db).length, 0)
  delete process.env.X_POSTS_PAUSE
  assert.equal(await run(db, night(4)), 'posted'); assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
})
await ok('retries: a transient X error (429, 5xx) releases the claim BEFORE Discord is told; Discord goes exactly once; a refusal that is not transient keeps the claim and goes to Discord only', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  xFail = [503, 503]       // the post, then postToX's own short retry
  assert.equal(await run(db, night(4)), 'retry: x 503'); assert.equal(discords.length, 0); assert.equal(rowsOf(db).length, 0)
  FX._resetXFail(); xFail = [429, 429]
  assert.equal(await run(db, night(4), NOW + 60e3), 'retry: x 429'); assert.equal(discords.length, 0)
  FX._resetXFail(); xFail = []
  assert.equal(await run(db, night(4), NOW + 120e3), 'posted'); assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
  reset()
  const db2 = fakeDb({ homer_feed_posts: [] })
  xFail = [403, 403]
  assert.equal(await run(db2, night(4)), 'posted (discord only)'); assert.equal(rowsOf(db2).length, 1); assert.equal(discords.length, 1); assert.equal(tweets.length, 0)
  assert.equal(await run(db2, night(4), NOW + 60e3), 'already-posted')
})
await ok('post: without X configured the list goes to Discord only', async () => {
  reset()
  const saved = {}; for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']) { saved[k] = process.env[k]; delete process.env[k] }
  try {
    const db = fakeDb({ homer_feed_posts: [] })
    assert.equal(await run(db, night(4)), 'posted (discord only)'); assert.equal(tweets.length, 0); assert.equal(discords.length, 1)
  } finally { Object.assign(process.env, saved) }
})

// ═══ 5. THE REPEAT GUARD, AND THE CROSS-SPORT SLATE ═══════════════════════
await ok('repeat: a man this kind named in the last 3 days is left out and the next CALLED skater takes the seat; day 4 he may be named again; a skipped row does not count', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [
    { day: '2026-10-09', kind: 'nhl_slate', x_post_id: '555', payload: { named: ['t1', 't3'] } },
    { day: '2026-10-06', kind: 'nhl_slate', x_post_id: '556', payload: { named: ['t2'] } },       // 4 days ago: allowed again
  ] })
  assert.equal(await run(db, night(4)), 'posted')
  const row = rowsOf(db).find((r) => r.day === DAY)
  assert.deepEqual(row.payload.named, ['t2', 't4', 't5', 't6', 't7'])
  assert.ok(!/Test Skater 1 \(/.test(tweets[0].text))
  reset()
  const db2 = fakeDb({ homer_feed_posts: [{ day: '2026-10-09', kind: 'nhl_slate', x_post_id: 'skipped', payload: { named: ['t1'] } }] })
  assert.equal(await run(db2, night(4)), 'posted'); assert.ok(rowsOf(db2).find((r) => r.day === DAY).payload.named.includes('t1'))
})
await ok('the cross-sport Slate is a DIFFERENT kind: its NHL line neither blocks nor is blocked by this post; the same man can be in both; it keeps its one NHL line', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [{ day: DAY, kind: 'slate', x_post_id: '777', payload: { named: ['nhl:t1'], named_by_sport: { nhl: ['t1'], mlb: [], nfl: [], nba: [] } } }] })
  assert.equal(await run(db, night(4)), 'posted')
  assert.ok(rowsOf(db)[0].payload.named.includes('t1'))
  assert.notEqual(P.familyOf('slate'), P.familyOf('nhl_slate'))
  const set = await G.recentNamed(fakeDb({ homer_feed_posts: [{ day: DAY, kind: 'nhl_slate', x_post_id: '888', payload: { named: ['t1'] } }] }), { kind: 'slate', day: DAY, sport: 'nhl' })
  assert.equal(set.size, 0)                          // this kind's row never holds out a man from the cross-sport Slate
  const NHL = await import('../lib/posts/nhl.js')
  const cands = NHL.nhlSlate({ games: night(4), now: NOW }).cands
  const pick = SL.pickSlate(cands)
  assert.ok(1 + pick.lines.length <= 2); assert.ok(cands.length >= 5)   // the cross-sport Slate names at most two of the eight; this post names five
})
await ok('daily cap: the post is slate tier (counted); at the cap X holds it, Discord still goes on a late post; before puck the claim is released', async () => {
  reset()
  const full = Array.from({ length: 20 }, (_, i) => ({ day: DAY, kind: `list_x${i}`, x_post_id: String(100 + i), seen_at: `${DAY}T10:00:00Z`, payload: {} }))
  const db = fakeDb({ homer_feed_posts: full, fact_posts: [], nfl_td_feed: [] })
  const out = await run(db, night(4))
  assert.ok(/^retry: x /.test(out), out)
  assert.equal(tweets.length, 0); assert.equal(discords.length, 0)
})

// ═══ 6. DISCORD ════════════════════════════════════════════════════════════
await ok('discord: one DASH card to the LAMP channel -- title linked to the LAMP board, one section per skater, the ledger line on the last, the footer from the registry; never #members', async () => {
  reset()
  process.env.DISCORD_NHL_WEBHOOKS = 'https://discord.test/lamp'
  process.env.DISCORD_MEMBERS_WEBHOOK = 'https://discord.test/members'
  try {
    const db = fakeDb({ homer_feed_posts: [] })
    assert.equal(await LS.postLampSlateOnce(db, { day: DAY, load: async () => night(4), now: NOW }), 'posted')    // hooks left to the default: feedHooks('nhl')
    assert.equal(discords.length, 1); assert.equal(discords[0].url, 'https://discord.test/lamp')
    assert.ok(!discords.some((d) => /members/.test(d.url)))
    const body = discords[0].body
    assert.equal(body.content, undefined); assert.equal(body.embeds.length, 1)
    const e = body.embeds[0]
    assert.equal(e.title, '\u{1F3D2} The LAMP Slate · Sat Oct 10')
    assert.equal(e.url, `https://test.example${APP_NHL_BOARD}`)
    assert.equal(e.description, '8 CALLED tonight, top 5 by LAMP ranking score.')
    assert.equal(e.fields.length, 5)
    assert.equal(e.fields[0].name, '1. Test Skater 1')
    assert.match(e.fields[0].value, /^TOR vs MTL · \*\*CALLED\*\* · puck 7:00 PM ET\n3\.4 shots a game$/)      // real numbers, never a percentile (2026-10-23)
    assert.match(e.fields[4].value, /\]\(https:\/\/test\.example\/app#sport=nhl&tab=ledger\)$/)
    assert.equal(e.footer.text, 'LAMP · DASH Network')
    assert.equal(e.color, DC.accentOf('nhl'))
    assert.equal(DC.embedUrls(e).length, 2)           // exactly the two link slots the card allows: the title and the one ledger line
    assert.ok(e.fields.slice(0, 4).every((f) => !/https?:/.test(f.value)))
    assert.ok(!/%|probab|chance|odds|guarantee/i.test(JSON.stringify(e)))
  } finally { delete process.env.DISCORD_NHL_WEBHOOKS; delete process.env.DISCORD_MEMBERS_WEBHOOK }
})
await ok("discord: the embed is inside Discord's limits for any list (long names too); the X text has no link at all", () => {
  const long = night(4).map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, name: `${r.name} ${'Alexandrovich-Montgomery '.repeat(8)}` })) }))
  for (const games of [night(4), long, night(2)]) {
    const a = A(games, NOW, { limit: 4000 })
    const e = a.embed
    assert.ok(DC.len(e.title) <= DC.LIMITS.title); assert.ok(DC.len(e.description) <= DC.LIMITS.description); assert.ok(e.fields.length <= DC.LIMITS.fields)
    for (const f of e.fields) { assert.ok(DC.len(f.name) <= DC.LIMITS.name); assert.ok(DC.len(f.value) <= DC.LIMITS.value) }
    assert.ok(DC.embedSize(e) <= DC.LIMITS.total, String(DC.embedSize(e)))
    assert.ok(!textBad.test(a.text))
  }
})

// ═══ 7. THE REGISTRY, THE ROUTING, THE WIRING ═════════════════════════════
await ok('registry: nhl_slate is tagged INFO and event-driven, slate tier, NHL, repeat-guarded; nothing in the table is untagged', () => {
  assert.equal(SC.tagOf('nhl_slate'), 'INFO'); assert.equal(SC.kindInfo('nhl_slate').mode, 'event'); assert.equal(SC.kindInfo('nhl_slate').group, 'lampslate')
  assert.deepEqual(SC.untagged(), [])
  assert.equal(P.tierOf('nhl_slate'), 'slate'); assert.equal(P.sportOfKind('nhl_slate'), 'nhl'); assert.ok(!P.isRepeatExempt('nhl_slate')); assert.ok(!P.EXEMPT_KINDS.includes('nhl_slate'))
  assert.equal(P.isRetiredForever('nhl_slate'), false)
  assert.equal(SC.mayPostNow({ kind: 'nhl_slate', now: T('21:40') }).ok, true)
  assert.equal(SC.mayPostNow({ kind: 'nhl_slate', now: T('21:40'), tag: 'FUN' }).ok, false)
})
await ok('wiring: the LAMP tick asks once the lock window is open; the SQL allows the kind (NOT VALID, idempotent, no set role); no sport ternary, no hex literal, never #members', () => {
  const tick = fs.readFileSync('app/api/lamp/tick/route.js', 'utf8')
  assert.match(tick, /postLampSlateOnce\(db, \{ day: date/)
  assert.match(tick, /LOCK_WINDOW_MS\)\) \{\n    out\.lampSlate/)
  const sql = fs.readFileSync('supabase/migrations/202610101300_lamp_slate_kind.sql', 'utf8')
  assert.match(sql, /nhl_slate/); assert.match(sql, /not valid/); assert.match(sql, /NOT VALID\$/); assert.ok(!/set role/i.test(sql))
  const lib = fs.readFileSync('lib/posts/lampSlate.js', 'utf8')
  assert.ok(!/sport === '/.test(lib), 'no sport ternary')
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(lib), 'no hex literal')
  assert.match(lib, /feedHooks\('nhl'\)/); assert.ok(!/DISCORD_MEMBERS|membersHooks/.test(lib))
  assert.match(lib, /STATUS_WORD\.called/); assert.equal(CS.STATUS_WORD.called, 'CALLED')
})

console.log(`\n${n} checks passed -- TEST data, fake fetch, fake database, clock pinned`)
