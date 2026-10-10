#!/usr/bin/env node
// THE NIGHT RECEIPT, CHECKED ON TEST DATA (X overhaul stage 3 piece 5, 2026-10-09). Every name, id and number
// below is made up and labelled "Test ..."; the database is an in-memory fake and fetch is replaced, so
// nothing here touches X, Discord, Supabase or the network.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-receipt.mjs [--sample]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
process.env.X_TEXT_LIMIT = '900'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' })
for (const k of ['X_LINKS_EMERGENCY', 'X_LINK_KINDS', 'X_POST_LINK', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_DAILY_CAP', 'POST_KINDS_ON', 'BUCKETS_PUBLIC', 'NEXT_PUBLIC_BUCKETS_PUBLIC', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]

const tweets = [], discords = []
let xFail = []
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets') && xFail.length) return { ok: false, status: xFail.shift(), json: async () => ({ title: 'test failure' }), headers: { get: () => null } }
  if (String(url).includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(8000 + tweets.length) } }), headers: { get: () => null } } }
  if (String(url).startsWith('https://discord.test/')) { discords.push({ url: String(url), body: JSON.parse(opts.body) }); return { ok: true, status: 204, json: async () => ({}), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}

const RC = await import('../lib/posts/receipt.js')
const S = await import('../lib/posts/slate.js')
const R = await import('../lib/routes.js')
const P = await import('../lib/dash/xPolicy.js')
const G = await import('../lib/dash/xGate.js')
const SCH = await import('../lib/dash/xSchedule.js')
const L = await import('../lib/dash/xPostLog.js')
const PC = await import('../lib/dash/postClaim.js')
const CS = await import('../lib/callStatus.js')
const BUD = await import('../lib/dash/xBudget.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const reset = () => { PC._resetTakenForTests(); xFail = []; tweets.length = 0; discords.length = 0; L._resetLogForTests(); G._resetRecentCache(); G._resetPostedCache(); RC._resetReceiptForTests(); RC._resetPeriodForTests() }

// ── a tiny in-memory Supabase: just the calls the gate and the receipt make ──
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
    or(expr) {
      // supports the three forms the receipt read uses: kind.in.(a,b) / kind.like.pat* / kind.eq.x
      const parts = []; let depth = 0, cur = ''
      for (const ch of String(expr)) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch }
      parts.push(cur)
      const fns = parts.map((p) => {
        const m = /^(\w+)\.(in|like|eq)\.(.*)$/.exec(p); const [, c, op, v] = m
        if (op === 'in') { const l = parseList(v); return (r) => l.includes(String(r[c])) }
        if (op === 'like') { const re = likeRe(v.replace(/\*/g, '%')); return (r) => re.test(String(r[c] ?? '')) }
        return (r) => String(r[c]) === v
      })
      this.f.push((r) => fns.some((fn) => fn(r)))
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


// ── TEST DATA (made up; names are "Test ...") ────────────────────────────────
const DAY = '2026-10-09'                                   // a Friday
const T0 = Date.parse('2026-10-10T07:00:00Z')              // the morning after (UTC), every game is long over
const BANNED = /https?:|www\.|\.com|#\w|\bbot\b|%|probab|chance|\bodds\b|told you so|never miss/i
const slateRow = (o = {}) => ({ day: DAY, kind: 'slate', x_post_id: '7001', payload: {
  v: 1, day: DAY, named: ['n1', 'm1', 'h1'], named_by_sport: { mlb: ['m1'], nfl: ['n1'], nhl: ['h1'], nba: [] },
  cotn: { sport: 'nfl', player_id: 'n1', name: 'Test Back One', team: 'KC', rank: 1, of: 400 },
  lines: [{ sport: 'mlb', player_id: 'm1', name: 'Test Hitter One', team: 'LAD', rank: 1, of: 80 }, { sport: 'nhl', player_id: 'h1', name: 'Test Skater One', team: 'TOR', rank: 1, of: 300 }],
  ...o } })
const callRow = (o = {}) => ({ day: DAY, kind: 'call_2', x_post_id: '7002', payload: { player_id: 'm2', name: 'Test Hitter Two', game_pk: '2', role: 'HR', bar: '1+ home run', named: ['m2'], ...o } })
const nhlWriteup = (o = {}) => ({ day: DAY, kind: 'writeup_nhl_5', x_post_id: '7003', payload: { game_id: '5', mode: 'live', named: ['h2'], writeup: { players: [{ player_id: 'h2', name: 'Test Skater Two', team: 'MTL' }] }, ...o } })
const nflDry = () => ({ day: DAY, kind: 'writeup_nfl_g1', x_post_id: 'dry', payload: { game_id: 'g1', mode: 'dry', named: ['n2'], writeup: { players: [{ player_id: 'n2', name: 'Test Receiver Two', team: 'BUF' }] } } })
const posts = (...extra) => [slateRow(), callRow(), nhlWriteup(), nflDry(), ...extra]
const box = (o) => ({ ab: 4, h: 1, hr: 0, tb: 1, r: 0, rbi: 0, ...o })
// the night: m1 homered (cashed), n1 no TD (missed), h1 scored (cashed), m2 0-for-4 (missed), h2 not dressed (void)
const mixed = ({ homered = ['m1'], tds = [], nhl = {} } = {}) => ({
  results: {
    mlb: { homered: new Set(homered), lines: { m1: homered.includes('m1') ? box({ hr: 1, tb: 4 }) : box(), m2: homered.includes('m2') ? box({ hr: 1, tb: 4 }) : box() }, linesOk: true, postponed: new Set() },
    nfl: { scorers: { ids: new Set(tds), names: new Set() }, players: new Map([['n1', { player_id: 'n1', name: 'Test Back One', team: 'KC' }]]) },
    nhl: { rows: new Map(Object.entries({ h1: { graded_at: 'x', dressed: true, hit: true }, h2: { graded_at: 'x', dressed: false, hit: null }, ...nhl })) },
  },
  games: {
    mlb: [{ id: '1', teams: ['LAD'], final: true, startMs: Date.parse('2026-10-09T23:10:00Z') }, { id: '2', teams: ['NYY'], final: true, startMs: Date.parse('2026-10-09T23:10:00Z') }],
    nfl: [{ id: 'g1', teams: ['KC', 'BUF'], final: true, startMs: Date.parse('2026-10-09T23:15:00Z') }],
    nhl: [{ id: '1', teams: ['TOR'], final: true }, { id: '5', teams: ['MTL'], final: true }],
  },
})
const lines = (t) => t.split('\n').filter((l) => l.trim())
const load = (m) => async () => m

// ═══ 1. WHO WAS NAMED ═══════════════════════════════════════════════════════
await ok('named: the Slate and the write-ups, by sport; a dry / skipped / not-live post named nobody', () => {
  const { players, slateId } = RC.namedPlayers(posts())
  assert.equal(slateId, '7001')
  assert.deepEqual(players.map((p) => `${p.sport}:${p.id}`), ['mlb:m1', 'mlb:m2', 'nfl:n1', 'nhl:h1', 'nhl:h2'])   // registry order; n2 (dry write-up) is not here
  assert.equal(players.find((p) => p.id === 'm2').writeupId, '7002')
  assert.equal(players.find((p) => p.id === 'm1').slateId, '7001')
  // a Slate that never reached X names no one
  assert.deepEqual(RC.namedPlayers([slateRow({}), ].map((r) => ({ ...r, x_post_id: 'dry' }))).players, [])
  assert.deepEqual(RC.namedPlayers([{ ...callRow(), x_post_id: 'skipped' }, { ...callRow(), x_post_id: null }]).players, [])
})
await ok('named: only the ids the Slate says it names (named_by_sport) -- a candidate it trimmed is not on the receipt', () => {
  const trimmed = slateRow({ named_by_sport: { mlb: ['m1'], nfl: [], nhl: [], nba: [] } })
  assert.deepEqual(RC.namedPlayers([trimmed]).players.map((p) => p.id), ['m1'])
})
await ok('named: a man in both the Slate and a write-up is one row, quoted through the Slate', () => {
  const { players } = RC.namedPlayers([slateRow(), callRow({ player_id: 'm1', name: 'Test Hitter One', named: ['m1'] })])
  assert.equal(players.filter((p) => p.id === 'm1').length, 1)
  assert.equal(players.find((p) => p.id === 'm1').inSlate, true)
})

// ═══ 2. THE TEXT ════════════════════════════════════════════════════════════
await ok('text: a cash / miss / void mix leads with the cashed, shows the misses, says who did not play, and fits', () => {
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0, limit: 900 })   // the long-post allowance prod runs with
  assert.equal(a.state, 'go')
  const L_ = lines(a.text)
  assert.equal(L_[0], '\u{1F9FE} THE RECEIPT · FRI OCT 9')
  assert.match(L_[1], /^CALLED · 2 of 4 cashed · 1 did not play$/)
  assert.ok(L_.length >= 4 && L_.length <= 8, a.text)
  assert.ok(RC.MAX_ROWS === 4)
  // the same night at the plain 280: fewer rows, the same true record, still a miss in view
  const hard = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0, limit: 280 })
  assert.ok(S.xLen(hard.text) <= 280, String(S.xLen(hard.text)))
  assert.match(hard.text, /CALLED · 2 of 4 cashed · 1 did not play/)
  assert.ok(/missed/.test(hard.text) && /cashed/.test(hard.text.split('\n').slice(3).join('\n')))
  // wins first, then the misses; a miss is in view
  const rows = L_.slice(2).filter((l) => / · (cashed|missed|did not play)/.test(l))
  const firstMiss = rows.findIndex((l) => /missed/.test(l)), lastWin = rows.map((l) => /cashed$/.test(l)).lastIndexOf(true)
  assert.ok(lastWin < firstMiss, rows.join('|'))
  assert.ok(/missed/.test(a.text))
  assert.ok(!/can't be modeled/.test(a.text)); assert.match(a.text, /\nEvery call, graded → DASH · The Ledger$/)
})
await ok('text: the whole record is always the true one -- hidden rows are counted, never silently dropped (the old accountability flaw)', () => {
  // 3 cashed + 4 missed + 1 void: only 4 slots
  const graded = [
    ...['A', 'B', 'C'].map((x) => ({ sport: 'mlb', id: `w${x}`, name: `Test Winner ${x}`, market: 'home run', outcome: 'cashed' })),
    ...['D', 'E', 'F', 'G'].map((x) => ({ sport: 'nfl', id: `l${x}`, name: `Test Loser ${x}`, market: 'anytime touchdown', outcome: 'missed' })),
    { sport: 'nhl', id: 'v1', name: 'Test Void One', market: 'goal scorer', outcome: 'void' },
  ]
  const out = RC.renderReceipt({ day: DAY, graded })
  assert.match(out.text, /CALLED · 3 of 7 cashed · 1 did not play/)
  assert.match(out.text, /\n\+\d+ more cashed · \d+ more missed/)
  assert.ok(/Test Loser/.test(out.text), 'a miss is in view')
  assert.ok(/Test Winner/.test(out.text))
  assert.ok(lines(out.text).length <= 8)
  // every hidden row is accounted for in the +N line
  const shown = lines(out.text).filter((l) => / · (cashed|missed|did not play)/.test(l)).length
  const more = /\+(?:(\d+) more cashed)?(?: · )?(?:(\d+) more missed)?(?: · )?(?:(\d+) more did not play)?/.exec(out.text)
  assert.equal(shown + (Number(more[1]) || 0) + (Number(more[2]) || 0) + (Number(more[3]) || 0), graded.length)
})
await ok('text: long names still fit 280 (rows come off, the record line never does)', () => {
  const graded = Array.from({ length: 6 }, (_, i) => ({ sport: 'mlb', id: `x${i}`, name: `Test Hyphenated-Longname Extraordinarily ${i}`, market: 'home run', outcome: i < 2 ? 'cashed' : 'missed' }))
  const out = RC.renderReceipt({ day: DAY, graded })
  assert.ok(S.xLen(out.text) <= 280, String(S.xLen(out.text)))
  assert.match(out.text, /CALLED · 2 of 6 cashed/)
})
await ok('text: all cashed -> "The signal was there."; any miss -> no tagline; no link / hashtag / "bot" / probability / percent anywhere', () => {
  const win = (id) => ({ sport: 'mlb', id, name: `Test Hitter ${id}`, market: 'home run', outcome: 'cashed' })
  assert.match(RC.renderReceipt({ day: DAY, graded: [win('a'), win('b')] }).text, /The signal was there\./)
  const mixedOut = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0 }).text
  assert.ok(!/can't be modeled/.test(mixedOut)); assert.ok(!/\n\n\n/.test(mixedOut))
  assert.ok(!/told you so/i.test(mixedOut))
  for (const t of [mixedOut, RC.renderReceipt({ day: DAY, graded: [win('a')] }).text]) assert.ok(!BANNED.test(t), t)
  assert.equal((mixedOut.match(/\p{Extended_Pictographic}/gu) || []).length <= 2, true)
})
await ok('text: the words are the registry\'s -- CALLED is STATUS_WORD.called, the markets are POST_WORDS, the pointer is the real Ledger nav name', () => {
  assert.equal(CS.STATUS_WORD.called, 'CALLED')
  const t = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0 }).text
  assert.match(t, new RegExp(`${R.POST_WORDS.mlb.market} · cashed`))
  assert.match(t, new RegExp(`${R.POST_WORDS.nhl.market} · cashed`))
  assert.equal(RC.ledgerPointer(), `Every call, graded → ${R.POST_POINTER.home} · ${R.MLB_NAV.ledger.label}`)
  assert.equal(R.MLB_NAV.ledger.label, 'The Ledger'); assert.equal(R.NFL_NAV.ledger.label, 'The Ledger'); assert.equal(R.NHL_NAV.ledger.label, 'The Ledger')
  // no sport ternary and no URL in the module
  const src = fs.readFileSync('lib/posts/receipt.js', 'utf8').replace(/\/\/.*$/gm, '')
  assert.ok(!/sport\s*===\s*'(mlb|nfl|nhl|nba)'\s*\?/.test(src))
  assert.ok(!/https?:\/\//.test(src))
})
await ok('text: no BUCKETS pointer or row until BUCKETS is public', () => {
  const t = RC.assembleReceipt({ day: DAY, rows: [...posts(), { day: DAY, kind: 'slate', x_post_id: '7001', payload: slateRow().payload }], ...mixed(), now: T0 }).text
  assert.ok(!/BUCKETS|25 points|NBA/.test(t))
})

// ═══ 3. ONLY WHO WAS NAMED ══════════════════════════════════════════════════
await ok('only named players appear: an unnamed homer / scorer / touchdown is not on the receipt', () => {
  const m = mixed({ homered: ['m1', 'stranger'], tds: ['n1', 'other-td'] })
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 })
  assert.ok(!/stranger|other-td/.test(JSON.stringify(a.payload)))
  for (const g of a.graded) assert.ok(['m1', 'm2', 'n1', 'h1', 'h2'].includes(g.id), g.id)
  assert.deepEqual(a.payload.results.map((r) => r.player_id).sort(), ['h1', 'h2', 'm1', 'm2', 'n1'])
  // and a man the text shows is one of them
  for (const id of a.named) assert.ok(['m1', 'm2', 'n1', 'h1', 'h2'].includes(id))
})
await ok('grades come from the sports\' own results: a touchdown in the feed cashes the Slate\'s back, a bar short of a hit is a miss', () => {
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed({ tds: ['n1'] }), now: T0 })
  assert.equal(a.graded.find((g) => g.id === 'n1').outcome, 'cashed')
  assert.equal(a.graded.find((g) => g.id === 'm2').outcome, 'missed')
  assert.equal(a.graded.find((g) => g.id === 'h2').outcome, 'void')
  // a HIT call (a write-up on another bar) is graded on its own bar, not on a home run
  const hit = RC.assembleReceipt({ day: DAY, rows: [callRow({ role: 'HIT', bar: '1+ hit' })], ...mixed(), now: T0 })
  assert.equal(hit.graded.find((g) => g.id === 'm2').outcome, 'cashed')   // box() has h: 1
  assert.equal(hit.graded.find((g) => g.id === 'm2').market, 'hit')
})

// ═══ 4. THE QUOTE ═══════════════════════════════════════════════════════════
await ok('quote: the Slate\'s real tweet id when the Slate named someone who cashed', () => {
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0 })
  assert.equal(a.quoteId, '7001')
})
await ok('quote: a write-up player who cashed and is ONLY in the write-up quotes the write-up; a Slate man who missed does not pull the quote', () => {
  // only h2 (NHL write-up) cashed; the Slate\'s men all missed
  const m = mixed({ homered: [], nhl: { h1: { graded_at: 'x', dressed: true, hit: false }, h2: { graded_at: 'x', dressed: true, hit: true } } })
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 })
  assert.equal(a.state, 'go')
  assert.equal(a.quoteId, '7003')
  // and the call_<pk> write-up for a MLB hitter
  const m2 = mixed({ homered: ['m2'], nhl: { h1: { graded_at: 'x', dressed: true, hit: false }, h2: { graded_at: 'x', dressed: false, hit: null } } })
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m2, now: T0 }).quoteId, '7002')
})
await ok('quote: never a dry / skipped / missing id -- a Slate that did not reach X is not quoted (and names no one)', () => {
  for (const bad of ['dry', 'skipped', 'backfill', null, '']) {
    const rows = posts().map((r) => (r.kind === 'slate' ? { ...r, x_post_id: bad } : r))
    const a = RC.assembleReceipt({ day: DAY, rows, ...mixed({ homered: [], nhl: { h1: { graded_at: 'x', dressed: true, hit: false }, h2: { graded_at: 'x', dressed: true, hit: true } } }), now: T0 })
    assert.notEqual(a.quoteId, bad)
    assert.ok(a.quoteId == null || /^\d+$/.test(a.quoteId), String(a.quoteId))
  }
  // quoteId is what postToX receives (the API field quote_tweet_id), tested end to end below
})

// ═══ 5. NO CASH = NO POST ═══════════════════════════════════════════════════
await ok('no cash = no post: nothing cashed -> state none, nothing posted, logged DROPPED "no cash", the night\'s counts kept on a skipped row', async () => {
  reset()
  const m = mixed({ homered: [], nhl: { h1: { graded_at: 'x', dressed: true, hit: false } } })
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 })
  assert.equal(a.state, 'none'); assert.equal(a.reason, 'no cash')
  const db = fakeDb({ homer_feed_posts: posts() })
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(m), hooks: '', now: T0 }), 'settling')
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(m), hooks: '', now: T0 + RC.SETTLE_MS + 1 }), 'dropped: no cash')
  assert.equal(tweets.length, 0); assert.equal(discords.length, 0)
  const row = db.tables.homer_feed_posts.find((r) => r.kind === 'receipt')
  assert.equal(row.x_post_id, 'skipped'); assert.equal(row.payload.counts.cashed, 0); assert.equal(row.payload.counts.missed, 4)
  assert.ok(L.recentLog().some((e) => e.kind === 'receipt' && e.state === 'DROPPED' && e.reason === 'no cash'))
  // asked again later: the row exists, so nothing more happens
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: async () => { throw new Error('must not load') }, hooks: '', now: T0 + 3600e3 }), 'already-posted')
})
await ok('no cash = no post: a night where no one was named has no receipt at all', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [nflDry()] })
  assert.match(await RC.postReceiptOnce(db, { day: DAY, load: async () => { throw new Error('must not load') }, hooks: '', now: T0 }), /^none/)
  assert.equal(db.tables.homer_feed_posts.length, 1)
})

// ═══ 6. WHEN: ALL GAMES FINAL ═══════════════════════════════════════════════
await ok('gating: not ready while any game that held a named player is live; ready when the last one is final', () => {
  const m = mixed()
  m.games.nfl[0].final = false
  const w = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 })
  assert.equal(w.state, 'waiting'); assert.match(w.reason, /nfl g1 not final/)
  m.games.nfl[0].final = true
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 }).state, 'go')
})
await ok('gating: a game with NO named player does not hold the post', () => {
  const m = mixed()
  m.games.mlb.push({ id: '99', teams: ['BOS'], final: false })
  m.games.nfl.push({ id: 'g9', teams: ['DEN'], final: false })
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 }).state, 'go')
})
await ok('gating: a sport whose games cannot be read waits (never guessed final); a man whose game cannot be found waits for his sport\'s night', () => {
  const m = mixed(); m.games.nfl = null
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 }).state, 'waiting')
  const m2 = mixed(); m2.games.mlb = [{ id: '77', teams: ['ZZZ'], final: false }]
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m2, now: T0 }).state, 'waiting')
})
await ok('gating: a result that is not graded yet waits (the box line unread is not a miss)', () => {
  const m = mixed(); m.results.mlb.linesOk = false; m.results.mlb.lines = {}
  m.results.mlb.homered = new Set(['m1'])
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: T0 })
  assert.equal(a.state, 'waiting'); assert.match(a.reason, /not graded yet: Test Hitter Two/)
  const m3 = mixed({ nhl: { h1: { graded_at: null, dressed: true, hit: true } } })
  assert.equal(RC.assembleReceipt({ day: DAY, rows: posts(), ...m3, now: T0 }).state, 'waiting')
})
await ok('gating: a game that is never final is given up on after 30 hours; what was graded goes out, the rest is left out and recorded', () => {
  const m = mixed(); m.games.nfl[0].final = false
  const late = Date.parse('2026-10-09T23:15:00Z') + RC.STALE_MS + 60e3
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...m, now: late })
  assert.equal(a.state, 'go')
  m.results.nfl.players = new Map()
  assert.ok(Array.isArray(a.payload.left_out))
})
await ok('gating: the post waits for the night to stay settled for a few minutes (the last event row has landed)', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: posts() })
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: '', now: T0 }), 'settling')
  assert.equal(tweets.length, 0)
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: '', now: T0 + 60e3 }), 'waiting')
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: '', now: T0 + RC.SETTLE_MS + 60e3 }), 'posted')
  assert.equal(tweets.length, 1)
})

// ═══ 7. POSTING END TO END (fake X, fake Discord) ════════════════════════════
await ok('post: quotes the Slate through the X API field, is plain text, logs POSTED, stores counts, mirrors to Discord, and posts once', async () => {
  reset()
  process.env.DISCORD_HOMER_WEBHOOK = 'https://discord.test/a'
  const db = fakeDb({ homer_feed_posts: posts() })
  await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: 'https://discord.test/a', now: T0 })
  const r = await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: 'https://discord.test/a', now: T0 + RC.SETTLE_MS + 1 })
  assert.equal(r, 'posted')
  assert.equal(tweets.length, 1)
  assert.equal(tweets[0].quote_tweet_id, '7001')
  assert.ok(!BANNED.test(tweets[0].text), tweets[0].text)
  assert.equal(discords.length, 1)
  assert.equal(discords[0].body.content, tweets[0].text)
  const row = db.tables.homer_feed_posts.find((x) => x.kind === 'receipt')
  assert.match(row.x_post_id, /^\d+$/); assert.equal(row.payload.counts.cashed, 2); assert.equal(row.payload.quote_id, '7001'); assert.equal(row.discord_sent, true)
  assert.ok(L.recentLog().some((e) => e.kind === 'receipt' && e.state === 'POSTED' && e.tweetId === row.x_post_id))
  assert.equal(await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: '', now: T0 + 1e7 }), 'already-posted')
  assert.equal(tweets.length, 1)
  delete process.env.DISCORD_HOMER_WEBHOOK
})
await ok('post: the pause holds it (claim released, nothing sent, Discord not told); a transient X error releases the claim for the next try', async () => {
  reset()
  process.env.X_POSTS_PAUSE = 'on'
  const db = fakeDb({ homer_feed_posts: posts() })
  await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: 'https://discord.test/a', now: T0 })
  assert.match(await RC.postReceiptOnce(db, { day: DAY, load: load(mixed()), hooks: 'https://discord.test/a', now: T0 + RC.SETTLE_MS + 1 }), /^retry/)
  assert.equal(tweets.length, 0); assert.equal(discords.length, 0)
  assert.ok(!db.tables.homer_feed_posts.some((r) => r.kind === 'receipt'))
  delete process.env.X_POSTS_PAUSE
  reset(); xFail = [503]
  const db2 = fakeDb({ homer_feed_posts: posts() })
  await RC.postReceiptOnce(db2, { day: DAY, load: load(mixed()), hooks: '', now: T0 })
  assert.match(await RC.postReceiptOnce(db2, { day: DAY, load: load(mixed()), hooks: '', now: T0 + RC.SETTLE_MS + 1 }), /^retry/)
  assert.ok(!db2.tables.homer_feed_posts.some((r) => r.kind === 'receipt'))
})

// ═══ 8. TIER, CAP, EXEMPTIONS ═══════════════════════════════════════════════
await ok('policy: the receipt is a write-up-tier post (stops at 18 of 20), exempt from the repeat guard, event-driven INFO; the cap holds it at 18', async () => {
  assert.equal(P.tierOf('receipt'), 'writeup')
  assert.equal(P.allowedBelow('receipt'), 18)
  assert.equal(P.capAllows('receipt', 17), true); assert.equal(P.capAllows('receipt', 18), false)
  assert.equal(P.isCapExempt('receipt'), false)
  for (const k of ['receipt', 'weekly', 'monthly']) { assert.equal(P.isReceipt(k), true, k); assert.equal(P.isRepeatExempt(k), true, k); assert.equal(P.tierOf(k), 'writeup', k) }
  const info = SCH.kindInfo('receipt')
  assert.equal(info.tag, 'INFO'); assert.equal(info.mode, 'event'); assert.equal(info.group, 'receipt')
  assert.deepEqual(SCH.untagged(), [])
  // a receipt that names the same men as yesterday's is not held out by the repeat guard
  reset()
  const db = fakeDb({ homer_feed_posts: [{ day: '2026-10-08', kind: 'receipt', x_post_id: '1', payload: { named: ['m1', 'n1', 'h1'] } }] })
  assert.deepEqual(await G.repeatCheck(db, { day: DAY, kind: 'receipt', ids: ['m1', 'n1'] }), [])
})
await ok('policy: with 18 counted posts today the receipt waits; with 17 it goes (the gate\'s own count, fake rows)', async () => {
  reset()
  const now = Date.now()
  const day = SCH.phxDayWindow(now).day
  // the cap counts the ET day (xBudget.etDayWindow), which ends 3 hours before the Phoenix day does: stamp the rows one minute into that window, whatever the hour the check runs
  const seen = new Date(Date.parse(BUD.etDayWindow(day)[0]) + 60e3).toISOString()
  const counted = (k) => Array.from({ length: k }, (_, i) => ({ day: DAY, kind: 'list_mlb', x_post_id: String(100 + i), seen_at: seen, payload: {} }))
  for (const [k, want] of [[17, 'go'], [18, 'capped']]) {
    reset()
    const db = fakeDb({ homer_feed_posts: counted(k).map((r) => ({ ...r, day })) , fact_posts: [] })
    assert.equal((await G.admit(db, { day, kind: 'receipt', repeat: false })).state, want, `${k} counted`)
  }
})

// ═══ 9. RETIRED KINDS ARE UNREACHABLE ═══════════════════════════════════════
await ok('retired: accountability, recap and board_results are retired forever -- the claim gate refuses them, the schedule marks them retired, nothing posts them', async () => {
  assert.deepEqual([...P.RETIRED_BY_RECEIPT].sort(), ['accountability', 'board_results', 'recap'])
  const db = { from() { throw new Error('a retired kind reached the database') } }
  for (const k of P.RETIRED_BY_RECEIPT) {
    assert.ok(P.isRetiredForever(k)); assert.equal(SCH.modeOf(k), 'retired')
    assert.equal(await PC.claimSlot(db, DAY, k, { gate: (kind) => !P.isRetiredForever(kind) }), false)
    assert.equal(SCH.mayPostNow({ kind: k, now: T0 }).ok, false)
  }
  // a scan: nothing claims, builds or posts a retired kind. The history READS and the kind check are named here, and only here.
  const hits = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p) } else if (/\.(js|mjs)$/.test(e.name)) {
    const rel = p.replace(/\\/g, '/')
    if (rel === 'lib/dash/xPolicy.js' || rel === 'lib/dash/xSchedule.js') continue
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      if (/(claimSlot|claimAndPostStat|safeStat|knownTaken|markTaken|xOk|admit|scheduleGate)\([^)]*'(accountability|recap|board_results)'/.test(code)) hits.push(`${rel}:${i + 1} claims a retired kind`)
      if (/\bkind:\s*'(accountability|recap|board_results)'/.test(code)) hits.push(`${rel}:${i + 1} names a retired kind in a post/claim`)
      if (/\b(accountabilityText|boardRoleResultsText|postRecap|weeklyText|monthlyText)\b/.test(code)) hits.push(`${rel}:${i + 1} calls a retired builder`)
    })
  } } }
  walk('app'); walk('lib')
  assert.deepEqual(hits, [])
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  assert.ok(!/async function postRecap/.test(route))
  assert.ok(!/'off-in-post-list'/.test(route))
  assert.ok(!/DAILY_KINDS = new Set\([^)]*'(accountability|weekly|monthly)'/.test(route))
  // their history rows stay valid: the database check still lists them
  const sql = fs.readFileSync('supabase/migrations/202609290100_homer_feed_posts_kind_widen_18.sql', 'utf8')
  for (const k of ['accountability', 'recap', 'weekly', 'monthly']) assert.ok(sql.includes(`'${k}'`), k)
  const mig = fs.readFileSync('supabase/migrations/202610091500_homer_feed_posts_kind_receipt.sql', 'utf8')
  assert.match(mig, /kind = ''receipt''/); assert.match(mig, /pg_get_constraintdef/)
})
await ok('the tick runs the receipt on every path -- in season, no games, and the MLB offseason (football nights) -- before any no-games exit', () => {
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  assert.equal((route.match(/await receiptTick\(db/g) || []).length, 2)
  const at = route.indexOf('await receiptTick(db, { day })')
  assert.ok(at > 0 && at < route.indexOf("skipped: 'no-games'"))
  assert.match(route, /postReceiptOnce\(db, \{ day: d,/)
  assert.match(route, /periodsDue\(phxClock\(Date\.now\(\)\)\)/)
  assert.match(route, /withReceipts\(FEED_WEBHOOKS\(\)\)/)
})

// ═══ 10. WEEKLY AND MONTHLY ARE REACHABLE ═══════════════════════════════════
const phx = (ms) => SCH.phxClock(ms)
await ok('weekly / monthly: due on Monday morning and the 1st, on their own (Phoenix wall clock); not before 7am, not on other days', () => {
  const MON = Date.parse('2026-10-12T15:00:00Z')            // Mon 8am Phoenix
  assert.deepEqual(RC.periodsDue(phx(MON)).map((p) => p.kind), ['weekly'])
  assert.deepEqual(RC.periodsDue(phx(MON))[0], { kind: 'weekly', key: '2026-10-12', from: '2026-10-05', to: '2026-10-11' })
  assert.deepEqual(RC.periodsDue(phx(Date.parse('2026-10-12T11:00:00Z'))), [])   // 4am Phoenix: too early
  assert.deepEqual(RC.periodsDue(phx(Date.parse('2026-10-13T15:00:00Z'))), [])   // Tuesday
  const FIRST = Date.parse('2026-11-01T16:00:00Z')          // Sunday Nov 1, 9am Phoenix
  assert.deepEqual(RC.periodsDue(phx(FIRST)).map((p) => `${p.kind} ${p.from}..${p.to}`), ['monthly 2026-10-01..2026-10-31'])
  const BOTH = Date.parse('2026-06-01T15:00:00Z')            // a Monday the 1st
  assert.deepEqual(RC.periodsDue(phx(BOTH)).map((p) => p.kind), ['weekly', 'monthly'])
})
const nightRow = (day, c, by) => ({ day, kind: 'receipt', x_post_id: c.cashed ? '9' : 'skipped', payload: { counts: c, by_sport: by } })
const weekRows = () => [
  nightRow('2026-10-05', { cashed: 2, missed: 1, void: 0 }, { mlb: { cashed: 2, missed: 1, void: 0 } }),
  nightRow('2026-10-07', { cashed: 0, missed: 3, void: 1 }, { mlb: { cashed: 0, missed: 2, void: 1 }, nhl: { cashed: 0, missed: 1, void: 0 } }),      // a no-cash night still counts
  nightRow('2026-10-11', { cashed: 3, missed: 1, void: 0 }, { nfl: { cashed: 2, missed: 1, void: 0 }, nhl: { cashed: 1, missed: 0, void: 0 } }),
]
await ok('weekly: the same honest receipt over the stored nights -- the no-cash nights\' misses are in the total, a sport line each', () => {
  const totals = RC.periodTotals(weekRows())
  assert.deepEqual(totals.total, { cashed: 5, missed: 5, void: 1 }); assert.equal(totals.nights, 3)
  const t = RC.renderPeriod({ kind: 'weekly', from: '2026-10-05', to: '2026-10-11', totals })
  assert.equal(lines(t)[0], '\u{1F9FE} THE RECEIPT · WEEK OF OCT 5')
  assert.match(t, /CALLED · 11 calls made · 5 landed · 5 missed · 1 did not play · 3 nights/)   // made = landed + missed + did not play, summed from the stored nights
  assert.ok(!/ of 10 cashed/.test(lines(t)[2]), 'the weekly record line is the made / landed / missed line')
  assert.match(t, /MLB  2 of 5 cashed · home run/); assert.match(t, /NFL  2 of 3 cashed · anytime touchdown/); assert.match(t, /NHL  1 of 2 cashed · goal scorer/)
  assert.ok(!/can't be modeled/.test(t)); assert.match(t, /\nEvery call, graded → DASH · The Ledger$/)
  assert.ok(lines(t).length <= 8 && S.xLen(t) <= 280); assert.ok(!BANNED.test(t), t)
  const m = RC.renderPeriod({ kind: 'monthly', from: '2026-09-01', to: '2026-09-30', totals })
  assert.equal(lines(m)[0], '\u{1F9FE} THE RECEIPT · SEPTEMBER')
  assert.match(m, /CALLED · 5 of 10 cashed · 1 did not play · 3 nights/)   // the monthly keeps the night receipt's wording
})
await ok('weekly: nothing cashed all week -> no post; monthly the same', () => {
  const none = RC.periodTotals([nightRow('2026-10-05', { cashed: 0, missed: 2, void: 0 }, { mlb: { cashed: 0, missed: 2, void: 0 } })])
  assert.equal(RC.renderPeriod({ kind: 'weekly', from: '2026-10-05', to: '2026-10-11', totals: none }), '')
})
await ok('weekly / monthly post on their own claim: Monday, once, quote-free, INFO receipts tier, Discord mirrored; the nightly rows are read, no other post is touched', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: weekRows() })
  const period = RC.periodsDue(phx(Date.parse('2026-10-12T15:00:00Z')))[0]
  assert.equal(await RC.postPeriodOnce(db, { period, hooks: 'https://discord.test/a', now: Date.parse('2026-10-12T15:00:00Z') }), 'posted')
  assert.equal(tweets.length, 1); assert.equal(tweets[0].quote_tweet_id, undefined)
  assert.match(tweets[0].text, /WEEK OF OCT 5/)
  assert.equal(discords.length, 1)
  const row = db.tables.homer_feed_posts.find((r) => r.kind === 'weekly')
  assert.equal(row.day, '2026-10-12'); assert.match(row.x_post_id, /^\d+$/)
  assert.equal(await RC.postPeriodOnce(db, { period, hooks: '', now: Date.parse('2026-10-12T16:00:00Z') }), 'already-posted')
  assert.equal(tweets.length, 1)
  // a monthly with no cash all month: DROPPED, nothing claimed
  reset()
  const empty = fakeDb({ homer_feed_posts: [] })
  const mp = { kind: 'monthly', key: '2026-11-01', from: '2026-10-01', to: '2026-10-31' }
  assert.equal(await RC.postPeriodOnce(empty, { period: mp, hooks: '', now: Date.parse('2026-11-01T16:00:00Z') }), 'none: no cash')
  assert.equal(empty.tables.homer_feed_posts.length, 0)
  assert.ok(L.recentLog().some((e) => e.kind === 'monthly' && e.state === 'DROPPED' && e.reason === 'no cash'))
})
await ok('weekly / monthly are claimed OUTSIDE any retired post: no claim of them in the recap path, and the route never answers off-in-post-list for them', () => {
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  assert.ok(!/claimSlot\(db, [^)]*'(weekly|monthly)'\)/.test(route))
  const src = fs.readFileSync('lib/posts/receipt.js', 'utf8')
  assert.match(src, /export async function postPeriodOnce/)
  assert.ok(!/postKindOn\(/.test(src))
})

// ═══ 11. ADAPTERS ═══════════════════════════════════════════════════════════
await ok('adapters: MOONSHOT / TUDDY / LAMP grade with the helpers that already exist', async () => {
  const MLB = await import('../lib/posts/mlb.js'), NFL = await import('../lib/posts/nfl.js'), NHL = await import('../lib/posts/nhl.js')
  const res = { homered: new Set(['a']), lines: { b: box(), c: box({ ab: 0 }), d: box({ h: 2, r: 1, rbi: 0 }) }, linesOk: true, postponed: new Set(['e']) }
  assert.equal(MLB.mlbOutcome({ id: 'a' }, res), 'cashed')
  assert.equal(MLB.mlbOutcome({ id: 'b' }, res), 'missed')
  assert.equal(MLB.mlbOutcome({ id: 'c' }, res), 'void')          // no at-bat
  assert.equal(MLB.mlbOutcome({ id: 'z' }, res), 'void')          // no line at all, the box score read fine
  assert.equal(MLB.mlbOutcome({ id: 'z' }, { ...res, linesOk: false }), 'pending')
  assert.equal(MLB.mlbOutcome({ id: 'e' }, res), 'void')          // postponed
  assert.equal(MLB.mlbOutcome({ id: 'd', role: 'HRR' }, res), 'cashed')   // h + r + rbi >= 2
  const weekP = new Map([['out', { player_id: 'out', injury_status: 'Out' }], ['ok', { player_id: 'ok', name: 'X' }]])
  const nres = { scorers: { ids: new Set(['s']), names: new Set(['test back']) }, players: weekP }
  assert.equal(NFL.nflOutcome({ id: 's', name: 'S' }, nres), 'cashed')
  assert.equal(NFL.nflOutcome({ id: 'q', name: 'Test Back' }, nres), 'cashed')   // a scorer the feed never joined, by name
  assert.equal(NFL.nflOutcome({ id: 'out', name: 'O' }, nres), 'void')
  assert.equal(NFL.nflOutcome({ id: 'ok', name: 'K' }, nres), 'missed')
  const rows = new Map([['h', { graded_at: 'x', dressed: true, hit: true }], ['m', { graded_at: 'x', dressed: true, hit: false }], ['v', { graded_at: 'x', dressed: false, hit: null }], ['p', { graded_at: null, dressed: true, hit: null }]])
  for (const [id, want] of [['h', 'cashed'], ['m', 'missed'], ['v', 'void'], ['p', 'pending'], ['nobody', 'pending']]) assert.equal(NHL.nhlOutcome({ id }, { rows }), want, id)
})
await ok('loader: a failed read is "not ready", never a miss (schedule down -> null games)', async () => {
  const LD = await import('../lib/posts/receiptLoad.js')
  assert.equal(await LD.mlbGamesOn(DAY, { fetchImpl: async () => ({ ok: false }) }), null)
  assert.equal(await LD.mlbGamesOn(DAY, { fetchImpl: async () => { throw new Error('down') } }), null)
  const g = await LD.mlbGamesOn(DAY, { fetchImpl: async () => ({ ok: true, json: async () => ({ dates: [{ games: [
    { gamePk: 5, gameDate: '2026-10-09T23:10:00Z', status: { abstractGameState: 'Final', detailedState: 'Final' }, teams: { away: { team: { abbreviation: 'NYY' } }, home: { team: { abbreviation: 'LAD' } } } },
    { gamePk: 6, gameDate: '2026-10-09T23:10:00Z', status: { abstractGameState: 'Preview', detailedState: 'Postponed' }, teams: { away: { team: { abbreviation: 'SEA' } }, home: { team: { abbreviation: 'BOS' } } } },
    { gamePk: 7, gameDate: '2026-10-09T23:10:00Z', status: { abstractGameState: 'Live', detailedState: 'In Progress' }, teams: { away: { team: { abbreviation: 'SF' } }, home: { team: { abbreviation: 'SD' } } } },
  ] }] }) }) })
  assert.deepEqual(g.map((x) => [x.id, x.final, x.postponed]), [['5', true, false], ['6', true, true], ['7', false, false]])
  assert.deepEqual(g[0].teams, ['NYY', 'LAD'])
})

// ═══ SAMPLE ═════════════════════════════════════════════════════════════════
if (process.argv.includes('--sample')) {
  const a = RC.assembleReceipt({ day: DAY, rows: posts(), ...mixed(), now: T0 })
  console.log('\n--- SAMPLE (TEST data, a mixed night) ---\n' + a.text + `\n--- quotes ${a.quoteId} · ${S.xLen(a.text)} chars ---`)
  const t = RC.renderPeriod({ kind: 'weekly', from: '2026-10-05', to: '2026-10-11', totals: RC.periodTotals(weekRows()) })
  console.log('\n--- SAMPLE weekly (TEST data) ---\n' + t)
}
console.log(`\n${n} receipt checks passed`)
