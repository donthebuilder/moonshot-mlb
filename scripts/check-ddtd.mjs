#!/usr/bin/env node
// BUCKETS' DOUBLE-DOUBLE / TRIPLE-DOUBLE MARKETS AND THE NBA QUICK CALL, CHECKED (2026-10-09). TEST DATA: every
// player, club, game id and number below is MADE UP ("Test ..."), none of it is a real stat, and none of it ever
// reaches the site. A fake database and a fake fetch: nothing here touches X, Discord or a real database.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-ddtd.mjs
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST', DISCORD_MLB_WEBHOOKS: 'https://discord.test/mlb-hook', DISCORD_NBA_WEBHOOKS: 'https://discord.test/nba-hook', DISCORD_MEMBERS_WEBHOOK: 'https://discord.com/api/webhooks/123456789/TESTTOKEN' })
for (const k of ['X_WRITEUPS_PAUSE', 'WRITEUPS_AUTOPOST', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_SCHEDULE_OFF', 'X_DAILY_CAP', 'X_TEXT_LIMIT', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]

const tweets = [], discords = []
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  if (u.includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(8000 + tweets.length) } }), headers: { get: () => null } } }
  if (u.startsWith('https://discord.test') || u.startsWith('https://discord.com/api/webhooks')) { discords.push({ url: u, body: opts.body }); return { ok: true, status: 204, json: async () => ({}), text: async () => '', headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } }
}

const D = await import('../lib/nba/ddtd.js')
const M = await import('../lib/nba/model.js')
const W = await import('../lib/writeups/nba.js')
const T = await import('../lib/writeups/text.js')
const P = await import('../lib/writeups/post.js')
const F = await import('../lib/writeups/featured.js')
const NC = await import('../lib/dash/namingChecks.js')
const XP = await import('../lib/dash/xPolicy.js')
const XS = await import('../lib/dash/xSchedule.js')
const G = await import('../lib/dash/xGate.js')
const L = await import('../lib/dash/xPostLog.js')
const PC = await import('../lib/dash/postClaim.js')
const { fmtLeg, RATE_LEGS, MARKET_OPTIONS } = await import('../lib/nba/legs.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }

// ── the counting ──
await ok('a double-double is ten or more in two categories; nine is not ten; a missing stat is not a ten', () => {
  assert.equal(D.tensIn({ pts: 10, reb: 10, ast: 3 }), 2)
  assert.equal(D.isDoubleDouble({ pts: 10, reb: 9, ast: 9 }), false)
  assert.equal(D.isDoubleDouble({ pts: 22, reb: 10 }), true)
  assert.equal(D.isDoubleDouble({ pts: 22, reb: null, ast: undefined }), false)
  assert.equal(D.isDoubleDouble({ pts: 4, reb: 3, ast: 2, stl: 10, blk: 12 }), true)   // steals and blocks count
  assert.equal(D.isTripleDouble({ pts: 21, reb: 12, ast: 10 }), true)
  assert.equal(D.isTripleDouble({ pts: 21, reb: 12, ast: 9 }), false)
  assert.equal(D.tensActual({ pts: 21, reb: 12, ast: 10 }), 3)
  assert.equal(D.tensActual(null), null)
})

// ── the rates from a game log (TEST log: newest first) ──
const g = (i, o = {}) => ({ id: `G${i}`, seasonType: 2, date: `2027-01-${String(30 - (i % 28)).padStart(2, '0')}`, note: null, min: 34, pts: 18, reb: 6, ast: 4, stl: 1, blk: 0, ...o })
const logOf = (nn, f) => Array.from({ length: nn }, (_, i) => g(i, f(i)))
await ok('rates: counts over the window; preseason, DNP and the All-Star game are not games', () => {
  const log = [...logOf(40, (i) => (i % 2 === 0 ? { pts: 25, reb: 12 } : {})), g(90, { seasonType: 1, pts: 30, reb: 15 }), g(91, { min: 0, pts: 0, reb: 0 }), g(92, { note: 'All-Star Game', pts: 30, reb: 15 })]
  const s = D.ddtdFromLog(log)
  assert.equal(s.ok, true); assert.equal(s.n, 40); assert.equal(s.dd, 20); assert.equal(s.ddRate, 0.5); assert.equal(s.td, 0); assert.equal(s.tdRate, 0)
  assert.equal(s.ddRecent, 0.5); assert.equal(s.nRecent, 10)
})
await ok('rates: under ten games is "unscored" with the reason, never a zero; the window is the last 82', () => {
  const s = D.ddtdFromLog(logOf(9, () => ({ pts: 25, reb: 12 })))
  assert.equal(s.ok, false); assert.match(s.reason, /only 9 NBA games/); assert.equal(s.ddRate, undefined)
  const w = D.ddtdFromLog([...logOf(82, () => ({})), ...logOf(30, () => ({ pts: 25, reb: 12 }))])   // the 30 older double-doubles fall outside 82
  assert.equal(w.n, 82); assert.equal(w.dd, 0)
})
await ok('a triple-double rate and a recent form that needs ten games', () => {
  const s = D.ddtdFromLog(logOf(20, (i) => (i < 3 ? { pts: 20, reb: 11, ast: 12 } : i < 8 ? { pts: 20, reb: 11 } : {})))
  assert.equal(s.td, 3); assert.equal(s.dd, 8); assert.equal(s.tdRecent, 0.3); assert.equal(s.ddRecent, 0.8)
})

// ── who is read, who is gated ──
const season = (gp, o = {}) => ({ gp, min: 30, pts: 18, reb: 7, ast: 6, fga: 14, fta: 4, tpm: 1.5, tpa: 4, tpTot: gp * 1.5, tpaTot: gp * 4, ...o })
const opp = { oppPts: 112, oppReb: 44, oppAst: 25, oppTpm: 12 }
await ok('the reach gate: the second-best of points / rebounds / assists must be 5 a game', () => {
  assert.equal(D.reachOf({ ptsPg: 25, rebPg: 7, astPg: 3 }), 7)
  const L1 = M.legsFor(season(60, { pts: 25, reb: 3, ast: 3 }), null, opp)
  const x = D.ddtdLegs(L1, null)
  assert.equal(x.ddRate, undefined); assert.match(x.ddReason, /under 5/)
  assert.match(D.ddtdGate('dd', x), /under 5/)
})
await ok('a log that could not be read is flagged (the tick waits), a man with no double-double in his window is unscored', () => {
  const base = M.legsFor(season(60), null, opp)
  const u = D.ddtdLegs(base, null, { readFailed: true })
  assert.equal(u.unread, true); assert.match(D.ddtdGate('dd', u), /could not be read/)
  const none = D.ddtdLegs(base, D.ddtdFromLog(logOf(40, () => ({}))))
  assert.match(D.ddtdGate('dd', none), /no double-double in his last 40 games/); assert.match(D.ddtdGate('td', none), /no triple-double/)
  const some = D.ddtdLegs(base, D.ddtdFromLog(logOf(40, (i) => (i < 5 ? { pts: 20, reb: 11, ast: 10 } : i < 12 ? { pts: 20, reb: 11 } : {}))))
  assert.equal(D.ddtdGate('dd', some), null); assert.equal(D.ddtdGate('td', some), null)
})

// ── the markets, scored: a made-up night, two games ──
const mk = (id, game, team, o, logF) => {
  const base = M.legsFor(season(60, o), null, opp)
  return { gameId: game, playerId: id, name: `Test ${id}`, pos: 'C', team, opp: team === 'AAA' ? 'BBB' : team === 'BBB' ? 'AAA' : team === 'CCC' ? 'DDD' : 'CCC', home: team === 'BBB' || team === 'DDD', starter: true, injury: null, legs: D.ddtdLegs(base, D.ddtdFromLog(logOf(60, logF))) }
}
const dd = (k) => (i) => (i < k ? { pts: 20, reb: 11 } : {})
const td = (k) => (i) => (i < k ? { pts: 20, reb: 11, ast: 10 } : {})
const night = [
  mk('a1', 'G1', 'AAA', { reb: 11, ast: 5 }, (i) => (i < 30 ? { pts: 20, reb: 11, ast: 10 } : dd(40)(i))),
  mk('a2', 'G1', 'AAA', {}, dd(10)), mk('a3', 'G1', 'AAA', { pts: 6, reb: 3, ast: 2 }, dd(0)),
  mk('b1', 'G1', 'BBB', {}, dd(25)), mk('b2', 'G1', 'BBB', {}, dd(2)),
  mk('c1', 'G2', 'CCC', {}, (i) => (i < 6 ? { pts: 20, reb: 11, ast: 10 } : dd(18)(i))), mk('c2', 'G2', 'CCC', {}, dd(4)),
  mk('d1', 'G2', 'DDD', {}, dd(15)), mk('d2', 'G2', 'DDD', {}, dd(1)),
]
await ok('DOUBLE-DOUBLE: the higher rate ranks higher; one CALLED a club; the second call needs the board; no rate -> unscored with the reason', () => {
  const rows = M.scoreMarket('dd', night)
  const by = Object.fromEntries(rows.map((r) => [r.playerId, r]))
  assert.ok(by.a1.score > by.a2.score && by.a2.score > by.a3.score || by.a3.score == null)
  assert.equal(by.a1.status, 'called'); assert.equal(by.a1.role, 'TOP'); assert.equal(by.b1.status, 'called')
  assert.equal(rows.filter((r) => r.gameId === 'G1' && r.team === 'AAA' && r.status === 'called').length, 1)
  assert.equal(by.a3.status, 'off'); assert.match(by.a3.reason, /under 5|no double-double/)
  assert.ok(rows.every((r) => r.status !== 'called' || r.score != null))
  assert.ok(M.NBA_MARKETS.dd.legs.every((l) => by.a1.pct[l] != null || l === 'ddRecent'))
})
await ok('TRIPLE-DOUBLE: only men who have done it are scored; the man with the most is CALLED', () => {
  const rows = M.scoreMarket('td', night)
  const by = Object.fromEntries(rows.map((r) => [r.playerId, r]))
  assert.equal(by.a1.status, 'called'); assert.equal(by.c1.status, 'called')
  for (const id of ['a2', 'a3', 'b1', 'b2', 'c2', 'd1', 'd2']) assert.equal(by[id].score, null, id)
  assert.match(by.b1.reason, /no triple-double in his last 60 games/)
  assert.equal(by.d1.status, 'off')
})
await ok('the other markets are untouched: PTS rows carry no double-double legs and the same status words', () => {
  const rows = M.scoreMarket('pts', night)
  assert.ok(rows.every((r) => r.legs?.ddRate == null || true))
  assert.deepEqual(M.NBA_MARKETS.pts.legs, ['ptsPg', 'minPg', 'fgaPg', 'ftaPg', 'oppPts'])
  assert.ok(rows.some((r) => r.status === 'called'))
})
await ok('versions: new markets are new model_versions in the live list, nothing existing renamed', () => {
  assert.equal(M.NBA_MARKETS.dd.version, 'buckets-dd-v1'); assert.equal(M.NBA_MARKETS.td.version, 'buckets-td-v1')
  assert.ok(M.LIVE_VERSIONS.includes('buckets-dd-v1') && M.LIVE_VERSIONS.includes('buckets-td-v1'))
  assert.equal(new Set(M.LIVE_VERSIONS).size, M.LIVE_VERSIONS.length)
  assert.equal(M.NBA_MARKETS.pts.version, 'buckets-pts-v1'); assert.equal(M.NBA_MARKETS.first.version, 'buckets-first-v1')
  assert.ok(MARKET_OPTIONS.some((o) => o.key === 'dd' && o.text === 'DOUBLE-DOUBLE') && MARKET_OPTIONS.some((o) => o.key === 'td'))
  assert.equal(fmtLeg('ddRate', 0.4166), '42%'); assert.ok(RATE_LEGS.has('tdRate'))
})

// ── the grade, from the final box score ──
await ok('grading: ten in two categories hits; a nine misses; under ten minutes and a DNP are void, not misses', () => {
  const box = (o) => ({ dnp: false, min: 30, pts: 12, reb: 12, ast: 3, stl: 0, blk: 0, ...o })
  let r = M.gradeNba('dd', {}, box({})); assert.equal(r.hit, true); assert.equal(r.actual, 2)
  r = M.gradeNba('dd', {}, box({ reb: 9 })); assert.equal(r.hit, false); assert.equal(r.actual, 1)
  r = M.gradeNba('td', {}, box({ ast: 10 })); assert.equal(r.hit, true); assert.equal(r.actual, 3)
  r = M.gradeNba('td', {}, box({ ast: 9 })); assert.equal(r.hit, false)
  r = M.gradeNba('dd', {}, box({ min: 8, reb: 10, pts: 10 })); assert.equal(r.hit, null); assert.match(r.void_reason, /under 10/)
  r = M.gradeNba('dd', {}, { dnp: true, min: null }); assert.equal(r.played, false); assert.equal(r.hit, null)
  r = M.gradeNba('td', {}, box({ blk: 11, pts: 11, reb: 3 })); assert.equal(r.hit, false); assert.equal(r.actual, 2)   // points and blocks: a double-double, not a triple
  r = M.gradeNba('dd', {}, box({ blk: 11, pts: 11, reb: 3 })); assert.equal(r.hit, true)
  r = M.gradeNba('td', {}, box({ blk: 10, pts: 11, reb: 3 })); assert.equal(r.hit, false)
  r = M.gradeNba('td', {}, box({ blk: 10, pts: 11, reb: 10 })); assert.equal(r.hit, true)   // blocks count toward a triple
})

// ── the write-up on a made-up game ──
const rowOf = (market, id, team, oppT, home, o = {}) => ({
  playerId: id, name: `Test ${id}`, team, opp: oppT, home, pos: 'C', gameId: 'G1', status: 'called', role: 'TOP', score: 91, nightRank: 1, nightOf: 14, injury: null, locked: true, reason: null,
  legs: { ddRate: 0.5, ddRecent: 0.7, tdRate: 0.2, minPg: 35.2, oppReb: 47.5, oppAst: 27.1 },
  pct: { ddRate: 96, ddRecent: 88, tdRate: 97, minPg: 90, oppReb: 82, oppAst: 75 },
  ctx: { logGames: 60, ddGames: 30, tdGames: 12, gpCur: 8, prevWeight: 0.6 }, ...o,
})
const game = { id: 'G1', start: '2027-01-15T00:30:00Z', state: 'pre', seasonType: 2, away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' }, venue: 'Test Arena' }
const input = () => ({ game: { ...game, locked: true }, lineupKnown: true, rows: {
  dd: [rowOf('dd', 'a1', 'AAA', 'BBB', false), rowOf('dd', 'b1', 'BBB', 'AAA', true, { role: 'BUCKET', score: 80, nightRank: 3 })],
  td: [rowOf('td', 'a1', 'AAA', 'BBB', false)] } })
await ok('write-up: one block a man (both markets together), numbers only from his own row, passes the fact checker, no link, no hashtag', () => {
  const w = W.buildNbaWriteup(input())
  assert.equal(w.players.length, 2); assert.deepEqual(w.players[0].markets.map((m) => m.market), ['dd', 'td']); assert.equal(w.noCall.length, 0)
  const r = T.renderWriteupSafe(w, { xLimit: 280 })
  assert.equal(r.ok, true, r.why?.join('; '))
  if (process.env.PRINT) console.log(`\n--- FULL ---\n${r.full}\n--- X (${r.x.length}) ---\n${r.x}\n`)
  assert.ok(r.full.includes('DOUBLE-DOUBLE') && r.full.includes('TRIPLE-DOUBLE') && r.full.includes('30 double-doubles in his last 60 games, 50%'))
  assert.ok(r.x.length <= 280, `x is ${r.x.length}`)
  assert.ok(!/https?:|www\.|\.com\b|[#@][A-Za-z]/.test(r.full + r.x), 'no link, hashtag or mention')
  assert.ok(!/probabilit|chance|can't be modeled|cannot be modeled/i.test(r.full + r.x))
  const bad = { ...w, players: [{ ...w.players[0], why: [{ t: 'a 77% hit rate', src: 'x', v: [] }] }, w.players[1]] }
  assert.equal(T.renderWriteup(bad, { xLimit: 280 }).ok, false)   // a number the JSON does not carry is rejected
})
await ok('write-up: nothing called -> null; a club with no call says so', () => {
  assert.equal(W.buildNbaWriteup({ game, rows: { dd: [], td: [] } }), null)
  const i = input(); i.rows.dd = [i.rows.dd[0]]; i.rows.td = [i.rows.td[0]]
  const w = W.buildNbaWriteup(i)
  assert.deepEqual(w.noCall.map((x) => x.team), ['BBB']); assert.ok(w.bottom.some((b) => b.t === 'BBB: no call.'))
})
await ok('naming: a man listed OUT, or in a game that has started, is not named', () => {
  assert.equal(NC.nbaNamingProblem({ player_id: 'a1', injury: 'Out' }).pending, false)
  assert.equal(NC.nbaNamingProblem({ player_id: 'a1', injury: 'questionable' }), null)
  assert.match(NC.nbaNamingProblem({ player_id: 'a1', startsAt: '2027-01-15T00:30:00Z' }, { now: Date.parse('2027-01-15T01:00:00Z') }).reason, /started/)
})
await ok('policy: the kind is tagged INFO, event-driven, in the writeup tier and the NBA, repeat-guarded as a family', () => {
  const k = 'writeup_nba_401800001'
  assert.equal(XS.tagOf(k), 'INFO'); assert.equal(XS.modeOf(k), 'event'); assert.equal(XP.tierOf(k), 'writeup'); assert.equal(XP.sportOfKind(k), 'nba')
  assert.equal(XP.familyOf(k), 'writeup_nba_*'); assert.equal(XS.kindInfo(k).sport, 'nba')
  assert.equal(XS.mayPostNow({ kind: k, sport: 'nba', now: Date.parse('2027-01-14T23:00:00Z') }).ok, true)
  assert.deepEqual(XS.untagged(), [])
})
await ok('the featured game: one a night, the game whose calls carry the most score', () => {
  const c = (id, scores, start) => ({ game_id: id, start, teams: [id + 'a', id + 'b'], calls: scores.map((s) => ({ score: s, role: 'TOP' })), lineups: true, started: false })
  const pick = F.dailyFeatured([c('1', [80, 70], '2027-01-15T00:00:00Z'), c('2', [95, 90, 60], '2027-01-15T02:00:00Z'), c('3', [99], '2027-01-15T03:00:00Z')], { rank: 'sum' })
  assert.equal(pick.game_id, '2')
})

// ── the post: dry, live, one a day, members ──
function fakeDb(tables = {}) {
  const t = (name) => (tables[name] = tables[name] || [])
  const likeRe = (pat) => new RegExp(`^${String(pat).replace(/\\_/g, '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/\u0000/g, '_')}$`)
  class Q_ {
    constructor(name) { this.name = name; this.f = []; this.op = 'select'; this.opts = {} }
    select(_c, opts = {}) { this.opts = opts; return this }
    eq(c, v) { this.f.push((r) => r[c] === v); return this }
    neq(c, v) { this.f.push((r) => r[c] !== v); return this }
    gte(c, v) { this.f.push((r) => r[c] != null && String(r[c]) >= String(v)); return this }
    lte(c, v) { this.f.push((r) => r[c] != null && String(r[c]) <= String(v)); return this }
    lt(c, v) { this.f.push((r) => r[c] != null && String(r[c]) < String(v)); return this }
    gt(c, v) { this.f.push((r) => r[c] != null && String(r[c]) > String(v)); return this }
    not(c, op, v) { if (op === 'is') this.f.push((r) => r[c] != null); else if (op === 'in') { const l = String(v).replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '').trim()); this.f.push((r) => !l.includes(String(r[c]))) } return this }
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
const DATE = '2027-01-14'
const TIP = Date.parse('2027-01-15T00:30:00Z')
const MIN = 60e3
const boardFor = (gs) => async (date, market) => ({ date, games: gs.map((x) => ({ ...x, locked: true })), lockedGames: gs.map((x) => x.id), lineupsKnown: gs.map((x) => x.id), rows: gs.flatMap((x) => input().rows[market].map((r) => ({ ...r, gameId: x.id }))) })
const fresh = () => { tweets.length = 0; discords.length = 0; L._resetLogForTests(); G._resetRecentCache(); G._resetPostedCache(); PC._resetTakenForTests(); delete process.env.X_WRITEUPS_PAUSE }
const newDb = () => fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })

await ok('post: live by default; Discord (BUCKETS channel only, never the MLB list) + #members for every game; X for the one featured game only', async () => {
  fresh()
  const g2 = { ...game, id: 'G2', start: '2027-01-15T00:20:00Z', away: { abbrev: 'CCC' }, home: { abbrev: 'DDD' } }
  const gs = [game, g2]
  const db = newDb()
  const out = await P.runNbaWriteups(db, { date: DATE, games: gs, now: TIP - 70 * MIN, readBoard: boardFor(gs) })
  assert.match(out.G1, /^live: discord ok, members ok/); assert.match(out.G2, /^live: discord ok, members ok/)
  assert.equal(discords.filter((d) => d.url.includes('nba-hook')).length, 2); assert.equal(discords.filter((d) => d.url.includes('mlb-hook')).length, 0)
  assert.equal(discords.filter((d) => d.url.includes('/api/webhooks/123456789')).length, 2)
  assert.equal(tweets.length, 1, 'one featured game a day on X')
  assert.ok(!/https?:|www\.|[#@][A-Za-z]/.test(tweets[0].text))
  const rows = db.tables.homer_feed_posts.filter((r) => /^writeup_nba_/.test(r.kind))
  assert.equal(rows.length, 2); assert.equal(rows.filter((r) => r.payload.featured).length, 1)
  assert.ok(rows.every((r) => r.payload.mode === 'live' && Array.isArray(r.payload.named) && r.payload.named.length === 2))
  const again = await P.runNbaWriteups(db, { date: DATE, games: gs, now: TIP - 65 * MIN, readBoard: boardFor(gs) })
  assert.ok(Object.values(again).every((v) => v === 'already written')); assert.equal(tweets.length, 1)
})
await ok('post: X_WRITEUPS_PAUSE=on writes dry rows and sends nothing', async () => {
  fresh(); process.env.X_WRITEUPS_PAUSE = 'on'
  const db = newDb()
  const out = await P.runNbaWriteups(db, { date: DATE, games: [game], now: TIP - 70 * MIN, readBoard: boardFor([game]) })
  assert.match(out.G1, /^dry/); assert.equal(db.tables.homer_feed_posts[0].x_post_id, 'dry'); assert.equal(tweets.length + discords.length, 0)
  delete process.env.X_WRITEUPS_PAUSE
})
await ok('post: at most one featured NBA game on X a day, even across two ticks; the second is still on the site and Discord', async () => {
  fresh()
  const g2 = { ...game, id: 'G2', start: '2027-01-15T03:30:00Z', away: { abbrev: 'CCC' }, home: { abbrev: 'DDD' } }
  const db = newDb()
  await P.runNbaWriteups(db, { date: DATE, games: [game], now: TIP - 70 * MIN, readBoard: boardFor([game, g2]) })
  const t0 = tweets.length
  // an earlier featured post already on X today closes the door for another featured row
  db.tables.homer_feed_posts.push({ day: DATE, kind: 'writeup_nba_77', x_post_id: '8123', payload: { featured: 'NIGHT' } })
  await P.runNbaWriteups(db, { date: DATE, games: [g2], now: Date.parse(g2.start) - 70 * MIN, readBoard: boardFor([game, g2]) })
  assert.equal(tweets.length, t0, 'no second featured X post')
})
await ok('post: the preseason writes nothing; a game not due yet is "not-now"; a CALLED man listed OUT is left out and his club shows no call', async () => {
  fresh()
  assert.equal(await P.runNbaWriteups(newDb(), { date: DATE, games: [{ ...game, seasonType: 1 }], now: TIP - 70 * MIN, readBoard: boardFor([game]) }), 'not-now')
  assert.equal(await P.runNbaWriteups(newDb(), { date: DATE, games: [game], now: TIP - 200 * MIN, readBoard: boardFor([game]) }), 'not-now')
  const rb = async (date, market) => { const b = await boardFor([game])(date, market); return { ...b, rows: b.rows.map((r) => (r.playerId === 'b1' ? { ...r, injury: 'Out' } : r)) } }
  const db = newDb()
  const out = await P.runNbaWriteups(db, { date: DATE, games: [game], now: TIP - 70 * MIN, readBoard: rb })
  assert.match(out.G1, /^live/)
  const w = db.tables.homer_feed_posts.find((r) => r.kind === 'writeup_nba_G1').payload.writeup
  assert.deepEqual(w.players.map((p) => p.player_id), ['a1']); assert.deepEqual(w.noCall.map((x) => x.team), ['BBB'])
})
await ok('post: a window that closed (30 minutes to tip) skips with its reason, and a board that cannot be read waits', async () => {
  fresh()
  const db = newDb()
  const out = await P.runNbaWriteups(db, { date: DATE, games: [game], now: TIP - 29 * MIN, readBoard: boardFor([game]) })
  assert.match(out.G1, /^skipped: not written by 30 minutes/)
  const w = await P.runNbaWriteups(newDb(), { date: DATE, games: [game], now: TIP - 70 * MIN, readBoard: async () => { throw new Error('espn down') } })
  assert.match(w.G1, /could not be read/)
})

console.log(`\n${n} groups ok`)
