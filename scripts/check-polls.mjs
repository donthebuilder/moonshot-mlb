#!/usr/bin/env node
// THE X POLLS (stage 3 piece 2, 2026-10-09), checked on TEST DATA: made-up players and numbers, every
// name labelled "Test ...", a fake database and a fake fetch. Nothing here touches the network, X,
// Discord or a real database.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-polls.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

// The scheduler (xSchedule) has its own windows and is tested in check-x-schedule.mjs; here the real clock must not hold the poll tests.
process.env.X_SCHEDULE_OFF = 'on'
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST', DISCORD_HOMER_WEBHOOK: 'https://discord.test/hook' })
for (const k of ['X_POLLS_PAUSE', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'POST_KINDS_ON', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_NFL_WEBHOOKS', 'DISCORD_NHL_WEBHOOKS', 'DISCORD_NBA_WEBHOOKS', 'BUCKETS_PUBLIC']) delete process.env[k]

// a fake fetch: X's tweet endpoint records the body and answers with an id; Discord records the text
const tweets = [], discord = []
let nextId = 7000
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(++nextId) } }), headers: { get: () => null } } }
  if (String(url).startsWith('https://discord.test')) { discord.push(JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => ({}), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}

const K = await import('../lib/dash/polls/kinds.js')
const B = await import('../lib/dash/polls/build.js')
const S = await import('../lib/dash/polls/slots.js')
const PP = await import('../lib/dash/polls/post.js')
const MLB = await import('../lib/dash/polls/adapters/mlb.js')
const NFL = await import('../lib/dash/polls/adapters/nfl.js')
const NHL = await import('../lib/dash/polls/adapters/nhl.js')
const NBA = await import('../lib/dash/polls/adapters/nba.js')
const P = await import('../lib/dash/xPolicy.js')
const G = await import('../lib/dash/xGate.js')
const L = await import('../lib/dash/xPostLog.js')
const R = await import('../lib/dash/xRest.js')
const PC = await import('../lib/dash/postClaim.js')
const LS = await import('../lib/dash/longshotsPost.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const reset = () => { tweets.length = 0; discord.length = 0; L._resetLogForTests(); G._resetRecentCache(); PP._resetPollBackoff(); PC._resetTakenForTests() }

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
    is(c, v) { this.f.push((r) => (v === null ? r[c] == null : r[c] === v)); return this }
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

const today = '2026-10-09'
const iso = (day, hhmm) => `${day}T${hhmm}:00Z`
const NOW = Date.parse(iso(today, '18:30'))                      // 14:30 ET, after MLB's 10:50 Phoenix poll slot (17:50Z)
const FUTURE = Date.parse(iso(today, '23:00'))

// ── TEST data: players, bars, streaks, called ────────────────────────────────
const TEAMS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF']
const player = (i, extra = {}) => ({ id: `T${i}`, name: `Test Player ${String.fromCharCode(64 + i)}`, team: TEAMS[(i - 1) % 6], opp: TEAMS[(i) % 6], startMs: FUTURE, rank: i, score: 90 - i, pos: 'WR', ...extra })
const players = (k = 8) => Array.from({ length: k }, (_, i) => player(i + 1))
const bars = (label = '2+ total bases', threshold = 2) => players(8).map((p, i) => ({ id: p.id, label, threshold, cleared: 3 + (i % 5), of: 10 }))
const streaks = (whatKey, what, min = 3) => players(8).map((p, i) => ({ id: p.id, what, whatKey, n: min + (i % 3), min }))
const called = () => players(5).map((p) => ({ id: p.id, name: p.name, team: p.team }))
const fullData = () => ({ players: players(), bars: bars(), streaks: streaks('hr', 'a home run', 2), called: called() })
const BANNED = /https?:\/\/|www\.|\.com|#\w|\bbot\b|probab|%|\bchance\b|\bodds\b/i
const emoji = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length

const SAMPLES = process.argv.includes('--samples')
const BR = await import('../lib/routes.js')

// ═══ 1. THE FIVE FORMATS, EVERY SPORT ═══════════════════════════════════════
for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
  await ok(`${sport}: all five formats build from real-shaped data: distinct options <= 25 chars, 2-4 of them, clean copy`, () => {
    const brand = BR.BRAND[sport]
    for (const format of K.POLL_FORMATS) {
      const spec = B.BUILDERS[format]({ sport, day: today, usedKeys: new Set(), exclude: new Set(), ...fullData() })
      if (sport === 'nba' && format === 'guess') { assert.equal(spec, null, 'BUCKETS has no stored result to reveal from yet'); continue }
      assert.ok(spec, `${sport}/${format} did not build`)
      assert.equal(spec.kind, K.kindFor(sport, format))
      const lines = spec.text.split('\n')
      assert.equal(lines[0], `${brand.icon} ${brand.name} POLL`)
      assert.equal(lines[1], '')
      assert.ok(lines.length >= 3 && lines.length <= 8)
      assert.ok(spec.options.length >= 2 && spec.options.length <= 4, spec.options.join('|'))
      assert.equal(new Set(spec.options.map((o) => o.toLowerCase())).size, spec.options.length, 'options are distinct')
      for (const o of spec.options) assert.ok(o.length >= 1 && o.length <= 25, `option too long: ${o}`)
      for (const t of [spec.text, spec.discordText]) {
        assert.ok(!BANNED.test(t), `banned text in: ${t}`)
        assert.ok(emoji(t) <= 2, `more than 2 emoji: ${t}`)
      }
      assert.ok([...spec.text].length <= 280)
      assert.ok(spec.named.length >= 1)
      // every named id is one of the eligible players (the pre-naming checks already ran)
      const ok_ = new Set(players().map((p) => p.id))
      for (const id of spec.named) assert.ok(ok_.has(id), id)
      // the Discord mirror is plain text with the options typed out
      assert.match(spec.discordText, /\nA\) /)
      if (SAMPLES) console.log(`--- SAMPLE (TEST data) ${sport} ${format} | options: ${spec.options.join(' / ')}\n${spec.text}\n`)
    }
  })
}
await ok('the words come from the sport, not a ternary: homer / touchdown / goal', () => {
  const t = (sport) => B.BUILDERS.pick({ sport, day: today, usedKeys: new Set(), exclude: new Set(), players: players() }).text
  assert.match(t('mlb'), /goes deep first tonight/)
  assert.match(t('nfl'), /scores first today/)
  assert.match(t('nhl'), /scores first tonight/)
  assert.match(B.BUILDERS.guess({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: players() }).text, /hitters goes deep the most tonight/)
  assert.match(B.BUILDERS.guess({ sport: 'nfl', day: today, usedKeys: new Set(), exclude: new Set(), players: players() }).text, /longest touchdown today/)
  assert.match(B.BUILDERS.guess({ sport: 'nhl', day: today, usedKeys: new Set(), exclude: new Set(), players: players() }).text, /most goals tonight/)
  assert.match(B.BUILDERS.board({ sport: 'nfl', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), called: called() }).text, /today's CALLED players cashes first/)
})
await ok('over/under shows a COUNT as context (a fact), never a probability, and the bar as threshold', () => {
  const s = B.BUILDERS.over({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), bars: [{ id: 'T1', label: '2+ total bases', threshold: 2, cleared: 6, of: 10 }] })
  assert.match(s.text, /Test Player A \(AAA\): 2\+ total bases tonight\?/)
  assert.match(s.text, /Cleared it in 6 of his last 10\./)
  assert.deepEqual(s.options, ['Over (2+)', 'Under (1 or fewer)'])
  assert.ok(!/%|probab|chance/i.test(s.text))
  // a bar of 1 reads "Under (0)"; a thin sample (under 5 games) is no context: no poll
  assert.deepEqual(B.BUILDERS.over({ sport: 'nhl', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), bars: [{ id: 'T1', label: '1+ shots', threshold: 1, cleared: 9, of: 10 }] }).options, ['Over (1+)', 'Under (0)'])
  assert.equal(B.BUILDERS.over({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), bars: [{ id: 'T1', label: '2+ total bases', threshold: 2, cleared: 2, of: 3 }] }), null)
})
await ok('streak watch: N is the SHORTEST of the three (true for all), "None of them" is the fourth option', () => {
  const st = [{ id: 'T1', what: 'a touchdown', whatKey: 'td', n: 5, min: 3 }, { id: 'T2', what: 'a touchdown', whatKey: 'td', n: 3, min: 3 }, { id: 'T3', what: 'a touchdown', whatKey: 'td', n: 4, min: 3 }]
  const s = B.BUILDERS.streak({ sport: 'nfl', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), streaks: st })
  assert.match(s.text, /These 3 have a touchdown in each of their last 3\./)
  assert.match(s.text, /Who makes it 4\?/)
  assert.equal(s.options.length, 4)
  assert.equal(s.options[3], 'None of them')
  // two on a streak is not enough for "these 3"
  assert.equal(B.BUILDERS.streak({ sport: 'nfl', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), streaks: st.slice(0, 2) }), null)
})
await ok('board question: only names the public post carried AND still eligible; fewer than two = no poll', () => {
  const s = B.BUILDERS.board({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), called: [{ id: 'T1', name: 'Test Player A', team: 'AAA' }, { id: 'T99', name: 'Test Not Eligible', team: 'ZZZ' }, { id: 'T2', name: 'Test Player B', team: 'BBB' }] })
  assert.deepEqual(s.options, ['Test Player A', 'Test Player B'])
  assert.equal(B.BUILDERS.board({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: players(), called: [{ id: 'T99', name: 'Test Not Eligible' }, { id: 'T1', name: 'Test Player A' }] }), null)
})
await ok('options: duplicate names never make a poll (the 9/23 bug), and a name over 25 characters is never put in one', () => {
  const dup = [player(1), player(2, { name: 'Test Player A' }), player(3)]
  const s = B.BUILDERS.guess({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: dup })
  assert.equal(s, null, 'three players, two with the same name: no distinct three-way poll')
  const long = [player(1, { name: 'A Name That Is Far Too Long To Fit' }), player(2), player(3), player(4)]
  const g = B.BUILDERS.guess({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: long })
  assert.ok(g && g.options.every((o) => o.length <= 25) && !g.named.includes('T1'))
  const edge = [player(1, { name: 'X'.repeat(25) }), player(2), player(3)]
  assert.ok(B.BUILDERS.guess({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(), players: edge }))
})
await ok('exclude: a player the repeat guard excludes is not offered', () => {
  const s = B.BUILDERS.pick({ sport: 'mlb', day: today, usedKeys: new Set(), exclude: new Set(['T1', 'T2']), players: players(4) })
  assert.ok(!s.named.includes('T1') && !s.named.includes('T2'))
})

// ═══ 2. ROTATION ════════════════════════════════════════════════════════════
const hist = (day, spec) => ({ day, kind: spec.kind, payload: spec.payload })
await ok('rotation: board and fun alternate, the fun formats rotate pick > over > guess > streak', () => {
  assert.deepEqual(B.formatOrder(null, null).slice(0, 2), ['pick', 'over'])
  assert.deepEqual(B.formatOrder({ format: 'pick', category: 'fun' }, 'pick').slice(0, 2), ['board', 'over'])
  assert.deepEqual(B.formatOrder({ format: 'board', category: 'board' }, 'pick').slice(0, 2), ['over', 'guess'])
  assert.deepEqual(B.formatOrder({ format: 'board', category: 'board' }, 'streak').slice(0, 2), ['pick', 'over'])
})
await ok('rotation: the same format + the same players does not repeat within 3 days (NFL 7)', () => {
  const data = { players: players(3) }                        // exactly one pair-set of three
  const a = B.choosePoll({ sport: 'mlb', day: today, data })
  assert.equal(a.format, 'pick')
  // the same question 2 days ago blocks it for MLB; the picker moves on to another format
  const h = [hist('2026-10-07', a)]
  const b = B.choosePoll({ sport: 'mlb', day: today, data, history: h })
  assert.ok(!(b && b.key === a.key))
  // 3 days ago is old enough for MLB (window 3) but still blocks the NFL (window 7)
  const old = [hist('2026-10-06', { ...a, payload: { ...a.payload, format: 'streak', category: 'fun' } })]
  const m = B.rotationState({ sport: 'mlb', day: today, history: [hist('2026-10-06', a)] })
  const f = B.rotationState({ sport: 'nfl', day: today, history: [hist('2026-10-06', a)] })
  assert.ok(!m.usedKeys.has(a.key)); assert.ok(f.usedKeys.has(a.key))
  assert.ok(old.length)
})
await ok('rotation: a week of days walks the formats: no key repeats, categories alternate', () => {
  const history = []
  const seen = []
  for (let d = 0; d < 8; d++) {
    const day = new Date(Date.parse(`${today}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)
    const spec = B.choosePoll({ sport: 'nhl', day, data: { ...fullData(), called: called().slice(d % 3) }, history })   // the public post's names differ day to day
    assert.ok(spec, day)
    history.push(hist(day, spec))
    seen.push(spec)
  }
  assert.deepEqual(seen.map((s) => s.category), ['fun', 'board', 'fun', 'board', 'fun', 'board', 'fun', 'board'])
  assert.deepEqual(seen.filter((s) => s.category === 'fun').map((s) => s.format), ['pick', 'over', 'guess', 'streak'])
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length && j - i < 3; j++) assert.notEqual(seen[i].key, seen[j].key)   // never the same question inside the window
})

// ═══ 3. A POLL NEVER NAMES AN UNCONFIRMED PLAYER ════════════════════════════
await ok('mlb: lineup not posted / starter projected = pending, never in the pool; not on the slate = gone', () => {
  const row = (id, extra = {}) => ({ player_id: id, name: `Test Hitter ${id}`, team: 'AAA', opponent: 'BBB', board_rank: 3, hr_score: 80, game_time: new Date(FUTURE).toISOString(), lineup_confirmed: true, pitcher_projected: false, ...extra })
  const rows = [row('M1'), row('M2', { lineup_confirmed: false }), row('M3', { pitcher_projected: true }), row('M4', { game_time: new Date(NOW - 3600e3).toISOString() }), row('M5', { board_rank: 99 })]
  const r = MLB.mlbPlayersFrom({ rows, live: null, now: NOW })
  assert.deepEqual(r.players.map((p) => p.id), ['M1'])
  assert.deepEqual(r.pending.map((p) => p.id).sort(), ['M2', 'M3'])
  // the live slate says the lineup is posted and he is not in it: definite, not pending
  const g = { state: 'Preview', lineupPosted: true, _lineupIds: new Set(['M1']) }
  const live = { size: 1, byPlayer: new Map([['M1', g]]), byTeam: new Map([['AAA', g]]) }
  const r2 = MLB.mlbPlayersFrom({ rows: [row('M1'), row('M2')], live, now: NOW })
  assert.deepEqual(r2.players.map((p) => p.id), ['M1'])
  assert.equal(r2.pending.length, 0)
})
await ok('nfl: OUT / inactive / IR / suspended are never named; questionable is still listed to play', () => {
  const mk = (id, inj) => ({ player_id: id, name: `Test Back ${id}`, team: 'AAA', opp: 'BBB', position: 'RB', injury_status: inj, scores: { TD: 70 } })
  const data = { games: [{ away: 'AAA', home: 'BBB', kickoff: new Date(FUTURE).toISOString() }], players: [mk('N1', ''), mk('N2', 'Out'), mk('N3', 'Questionable'), mk('N4', 'Injured Reserve'), mk('N5', 'Suspended')] }
  const r = NFL.nflPlayersFrom({ data, day: today, now: NOW })
  assert.deepEqual(r.players.map((p) => p.id).sort(), ['N1', 'N3'])
})
await ok('nhl: the goalie is read from the game\'s starters (the Slate\'s source): no source = nobody, unconfirmed = pending, confirmed = in', async () => {
  const board = (starters) => ({ games: [{ game: { state: 'pre', gameType: 2, startUtc: new Date(FUTURE).toISOString() }, starters, rows: [{ playerId: 7, name: 'Test Skater', team: 'AAA', opp: 'BBB', home: true, rank: 1, score: 77, status: 'called', context: {} }] }] })
  const none = NHL.nhlPlayersFrom({ board: board(undefined), now: NOW })
  assert.equal(none.players.length, 0); assert.equal(none.pending.length, 0)         // no source: a definite no, like the Slate
  const unconfirmed = NHL.nhlPlayersFrom({ board: board({ away: { playerId: 1, confirmed: false }, home: null }), now: NOW })
  assert.equal(unconfirmed.players.length, 0); assert.equal(unconfirmed.pending.length, 1)
  const conf = board({ away: { playerId: 1, confirmed: true }, home: null })        // a home skater faces the AWAY goalie
  assert.equal(NHL.nhlPlayersFrom({ board: conf, now: NOW }).players.length, 1)
  // the Slate adapter reads the very same helper and source
  const NHLS = await import('../lib/posts/nhl.js')
  const slate = NHLS.nhlSlate({ games: [{ ...conf.games[0], rows: [{ ...conf.games[0].rows[0], context: { nightRank: 1, nightOf: 100 } }] }], now: NOW })
  assert.equal(slate.cands[0].problem, null)
  // a preseason game is not a game for polls
  const pre = board(true); pre.games[0].game.gameType = 1
  assert.equal(NHL.nhlPlayersFrom({ board: pre, now: NOW }).players.length, 0)
})
await ok('nhl: the real pregame source (goalieSource via startersFor, TEST feed): confirmed names the skater, expected is pending, unlisted is nobody', async () => {
  const GSRC = await import('../lib/nhl/goalies.js'); const GSX = await import('../lib/nhl/goalieSource.js')
  const prob = (n, t) => [{ name: 'probableStartingGoalie', athlete: { id: '1', fullName: n }, status: { type: t } }]
  const start = new Date(FUTURE).toISOString()
  const feed = (t) => async () => ({ ok: true, status: 200, json: async () => ({ events: [{ date: start, status: { type: { name: 'STATUS_SCHEDULED' } }, competitions: [{ date: start, competitors: [{ homeAway: 'home', team: { abbreviation: 'BBB' }, probables: prob('Test Home Goalie', 'confirmed') }, { homeAway: 'away', team: { abbreviation: 'AAA' }, probables: prob('Test Away Goalie', t) }] }] }] }) })
  const game = { id: 5, away: { abbrev: 'AAA' }, home: { abbrev: 'BBB' }, startUtc: start, state: 'pre' }
  const board = async (t, gm = game) => { GSX._resetForTests(); const st = await GSRC.startersFor('2026-10-09', [gm], { fetchImpl: feed(t), now: NOW, goaliesFor: async () => ({ away: [], home: [] }) }); return { games: [{ game: { state: 'pre', gameType: 2, startUtc: start }, starters: st.byGame[5], rows: [{ playerId: 7, name: 'Test Skater', team: 'BBB', opp: 'AAA', home: true, rank: 1, score: 77, status: 'called', context: {} }] }] } }
  assert.equal(NHL.nhlPlayersFrom({ board: await board('confirmed'), now: NOW }).players.length, 1)
  const pend = NHL.nhlPlayersFrom({ board: await board('expected'), now: NOW }); assert.equal(pend.players.length, 0); assert.equal(pend.pending.length, 1)
  const none = NHL.nhlPlayersFrom({ board: await board('confirmed', { ...game, away: { abbrev: 'ZZZ' } }), now: NOW }); assert.equal(none.players.length, 0); assert.equal(none.pending.length, 0)
})
await ok('nba: only a regular-season / playoff game still to come activates BUCKETS; preseason and OUT do not', () => {
  const board = (seasonType, injury = null) => ({ games: [{ id: 'g1', seasonType, state: 'pre', start: new Date(FUTURE).toISOString() }], rows: [{ playerId: 'B1', name: 'Test Guard', team: 'AAA', opp: 'BBB', gameId: 'g1', score: 80, status: 'called', injury }] })
  assert.equal(NBA.nbaPlayersFrom({ board: board(1), now: NOW }).active, false)
  assert.equal(NBA.nbaPlayersFrom({ board: board(2), now: NOW }).players.length, 1)
  assert.equal(NBA.nbaPlayersFrom({ board: board(2, 'Out'), now: NOW }).players.length, 0)
})
await ok('post flow: pending names HOLD the poll (nothing claimed, nothing sent), then DROP it 30 minutes before the game', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  const start = Date.parse(iso(today, '23:00'))
  const adapter = fakeAdapter('mlb', { slate: { active: true, players: [], pending: [{ id: 'T9', reason: 'lineup not posted', startMs: start }] } })
  const held = await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter, now: NOW })
  assert.match(held, /^held: lineup not posted/)
  assert.equal(tweets.length, 0); assert.equal(db.tables.homer_feed_posts.length, 0)
  const dropped = await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter, now: start - 20 * 60e3 })
  assert.match(dropped, /^dropped: lineup not posted/)
  assert.equal(tweets.length, 0); assert.equal(db.tables.homer_feed_posts.length, 0)
  const states = L.recentLog().filter((e) => e.kind === 'poll_pick').map((e) => e.state)
  assert.deepEqual(states, ['HELD', 'DROPPED'])
})

// ═══ 4. POSTING: THE FULL PATH ══════════════════════════════════════════════
function fakeAdapter(sport, o = {}) {
  return {
    sport,
    slate: async () => o.slate || { active: true, players: players(), pending: [] },
    bars: async () => o.bars || bars(), streaks: async () => o.streaks || streaks('hr', 'a home run', 2), called: async () => o.called || called(),
    results: async (g) => (o.results ? o.results(g) : { known: false, ranking: [] }),
  }
}
const countedRow = (i, kind = `list_${i}`) => ({ day: today, kind, x_post_id: String(500 + i), seen_at: `${today}T15:00:00Z` })
await ok('post: a poll goes out as a NATIVE X poll (24h, distinct options), mirrors to Discord as plain text, and is claimed with its question key', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  const out = await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW })
  assert.equal(out, 'posted')
  assert.equal(tweets.length, 1)
  const t = tweets[0]
  assert.ok(t.poll && t.poll.duration_minutes === 1440 && t.poll.options.length >= 2 && t.poll.options.every((o) => o.length <= 25))
  assert.equal(new Set(t.poll.options).size, t.poll.options.length)
  assert.ok(!BANNED.test(t.text)); assert.match(t.text, /^⚾ MOONSHOT POLL\n\n/)
  assert.equal(discord.length, 1); assert.match(discord[0].content, /\nA\) /)
  const row = db.tables.homer_feed_posts[0]
  assert.equal(row.kind, 'poll_pick'); assert.ok(row.x_post_id && /^\d+$/.test(row.x_post_id))
  assert.match(row.payload.question_key, /^pick:/); assert.ok(row.payload.named.length === 2)
  // asked again the same day: nothing more goes out
  assert.equal(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW + 3600e3 }), 'already-posted')
  assert.equal(tweets.length, 1)
  const log = L.recentLog().find((e) => e.state === 'POSTED' && e.kind === 'poll_pick')
  assert.ok(log && log.tweetId)
})
await ok('post: before the sport\'s slot nothing is read or sent', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  let read = 0
  const a = fakeAdapter('mlb'); const slate = a.slate; a.slate = async () => { read++; return slate() }
  assert.equal(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: a, now: Date.parse(iso(today, '12:00')) }), 'not-yet')
  assert.equal(read, 0); assert.equal(tweets.length, 0)
})
await ok('post: a sport with no game left (inactive) posts nothing and is not re-read for a while', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  let read = 0
  const a = fakeAdapter('nhl', { slate: { active: false, why: 'no NHL game left tonight', players: [], pending: [] } })
  const slate = a.slate; a.slate = async () => { read++; return slate() }
  const late = Date.parse(iso(today, '21:00'))
  assert.match(await PP.postPollOnce(db, { sport: 'nhl', day: today, adapter: a, now: late }), /^no-poll: no NHL game/)
  assert.match(await PP.postPollOnce(db, { sport: 'nhl', day: today, adapter: a, now: late + 10 * 60e3 }), /^idle/)
  assert.equal(read, 1); assert.equal(tweets.length, 0)
})
await ok('post: a week of days through the real path: alternating, different questions, no repeats, one poll a day', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  const keys = [], cats = []
  for (let d = 0; d < 6; d++) {
    const day = new Date(Date.parse(`${today}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)
    const out = await PP.postPollOnce(db, { sport: 'nfl', day, adapter: fakeAdapter('nfl', { slate: { active: true, players: players(14), pending: [] }, streaks: streaks('td', 'a touchdown', 3), called: players(14).slice((d >> 1) * 4, (d >> 1) * 4 + 4).map((p) => ({ id: p.id, name: p.name, team: p.team })) }), now: Date.parse(`${day}T20:00:00Z`) })
    assert.equal(out, 'posted', `${day}: ${out}`)
    const row = db.tables.homer_feed_posts.filter((r) => r.day === day)
    assert.equal(row.length, 1)
    keys.push(row[0].payload.question_key); cats.push(row[0].payload.category)
  }
  assert.equal(new Set(keys).size, 6)
  assert.deepEqual(cats, ['fun', 'board', 'fun', 'board', 'fun', 'board'])
  assert.ok(db.tables.homer_feed_posts.every((r) => r.kind.startsWith('nfl_poll_')))
})
await ok('cap: polls are the poll tier (stop at 14 of 20); the reveal is a write-up tier receipt (stops at 18)', async () => {
  reset()
  for (const k of K.POLL_KINDS) { assert.equal(P.tierOf(k), 'poll', k); assert.equal(P.allowedBelow(k), 14); assert.equal(P.isRepeatExempt(k), false) }
  for (const k of K.POLL_RESULT_KINDS) { assert.equal(P.tierOf(k), 'writeup', k); assert.equal(P.allowedBelow(k), 18); assert.equal(P.isReceipt(k), true) }
  const rows = []
  const db = fakeDb({ homer_feed_posts: rows, fact_posts: [], nfl_td_feed: [] })
  for (let i = 0; i < 13; i++) rows.push(countedRow(i))
  assert.equal((await G.admit(db, { day: today, kind: 'poll_pick', repeat: false })).state, 'go')
  rows.push(countedRow(13))
  assert.equal((await G.admit(db, { day: today, kind: 'poll_pick', repeat: false })).state, 'capped')
  assert.equal((await G.admit(db, { day: today, kind: 'poll_result', repeat: false })).state, 'go')
  // the poll is on the lower tier than facts, above numerology: at 13 numerology is already out, the poll is not
  assert.equal(P.allowedBelow('numerology') < P.allowedBelow('poll_pick'), true)
  assert.equal(P.allowedBelow('poll_pick') < P.allowedBelow('longshots'), true)
  // through the real path at 14 counted: nothing reaches X
  const out = await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW })
  assert.equal(tweets.length, 0, `over the cap: ${out}`)
})
await ok('X_POLLS_PAUSE=on: no poll and no reveal, X or Discord; off again and they run', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  process.env.X_POLLS_PAUSE = 'on'
  assert.match(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW }), /^paused/)
  assert.match(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter: fakeAdapter('mlb'), now: NOW }), /^paused/)
  assert.equal(tweets.length, 0); assert.equal(discord.length, 0); assert.equal(db.tables.homer_feed_posts.length, 0)
  delete process.env.X_POLLS_PAUSE
  assert.equal(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW }), 'posted')
})
await ok('the repeat guard: a player this kind named in the last 3 days (NFL 7) is left out of the question', async () => {
  const only = (sport) => fakeAdapter(sport, { bars: [], streaks: [], called: [], slate: { active: true, players: players(2), pending: [] } })   // only PICK ONE is possible, from these two
  const namedBy = (sport, day) => ({ day, kind: K.kindFor(sport, 'pick'), x_post_id: '900', payload: { format: 'pick', category: 'fun', question_key: 'pick:OLD', named: ['T1', 'T2'] } })
  const at = (sport) => Date.parse(`${today}T23:30:00Z`)
  reset()
  // MLB: named 2 days ago = inside the 3-day window = no poll; named 4 days ago = fine
  let db = fakeDb({ homer_feed_posts: [namedBy('mlb', '2026-10-07')], fact_posts: [], nfl_td_feed: [] })
  assert.match(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: only('mlb'), now: at('mlb') }), /^no-poll/)
  assert.equal(tweets.length, 0)
  reset()
  db = fakeDb({ homer_feed_posts: [namedBy('mlb', '2026-10-05')], fact_posts: [], nfl_td_feed: [] })
  assert.equal(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: only('mlb'), now: at('mlb') }), 'posted')
  // NFL: the same 4 days ago is still inside its 7-day window
  reset()
  db = fakeDb({ homer_feed_posts: [namedBy('nfl', '2026-10-05')], fact_posts: [], nfl_td_feed: [] })
  assert.match(await PP.postPollOnce(db, { sport: 'nfl', day: today, adapter: only('nfl'), now: at('nfl') }), /^no-poll/)
  assert.equal(tweets.length, 0)
  reset()
  db = fakeDb({ homer_feed_posts: [namedBy('nfl', '2026-10-01')], fact_posts: [], nfl_td_feed: [] })
  assert.equal(await PP.postPollOnce(db, { sport: 'nfl', day: today, adapter: only('nfl'), now: at('nfl') }), 'posted')
})
await ok('BUCKETS: built and on, but silent to Discord until BUCKETS_PUBLIC; no pointer line in any poll', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  const slotNba = Date.parse(iso(today, '23:30'))
  assert.equal(await PP.postPollOnce(db, { sport: 'nba', day: today, adapter: fakeAdapter('nba'), now: slotNba }), 'posted')
  assert.equal(tweets.length, 1); assert.equal(discord.length, 0)
  assert.match(tweets[0].text, /^🏀 BUCKETS POLL\n\n/)
  assert.ok(!/Full board|DASH|->/.test(tweets[0].text))
  process.env.BUCKETS_PUBLIC = 'on'
  reset()
  const db2 = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  assert.equal(await PP.postPollOnce(db2, { sport: 'nba', day: '2026-10-10', adapter: fakeAdapter('nba'), now: Date.parse('2026-10-10T23:30:00Z') }), 'posted')
  assert.equal(discord.length, 1)
  delete process.env.BUCKETS_PUBLIC
})

// ═══ 5. THE REVEAL ══════════════════════════════════════════════════════════
const guessRow = (extra = {}) => ({ day: '2026-10-08', kind: 'poll_guess', x_post_id: '555', payload: { format: 'guess', category: 'fun', question_key: 'guess:T1,T2,T3', named: ['T1', 'T2', 'T3'], guess: { metric: 'hr_most', day: '2026-10-08', players: [{ id: 'T1', name: 'Test Player A' }, { id: 'T2', name: 'Test Player B' }, { id: 'T3', name: 'Test Player C' }] } }, ...extra })
await ok('reveal: never posts without a real stored result (unknown, nobody registered, or no poll tweet to quote)', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [guessRow()], fact_posts: [], nfl_td_feed: [] })
  assert.match(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter: fakeAdapter('mlb', { results: () => ({ known: false, ranking: [] }) }), now: NOW }), /result not on file/)
  assert.match(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter: fakeAdapter('mlb', { results: () => ({ known: true, ranking: [] }) }), now: NOW }), /result not on file/)
  assert.match(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter: fakeAdapter('mlb', { results: () => ({ known: true, ranking: [{ id: 'T1', name: 'Test Player A', value: 0 }] }) }), now: NOW }), /result not on file/)
  const noTweet = fakeDb({ homer_feed_posts: [guessRow({ x_post_id: 'skipped' })], fact_posts: [], nfl_td_feed: [] })
  assert.equal(await PP.postRevealsOnce(noTweet, { sport: 'mlb', today, adapter: fakeAdapter('mlb', { results: () => ({ known: true, ranking: [{ id: 'T1', name: 'Test Player A', value: 2 }] }) }), now: NOW }), 'nothing-to-reveal')
  // before the morning after the games: too early
  assert.equal(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter: fakeAdapter('mlb'), now: Date.parse(iso(today, '08:00')) }), 'too-early')
  assert.equal(tweets.length, 0); assert.equal(db.tables.homer_feed_posts.filter((r) => r.kind === 'poll_result').length, 0)
})
await ok('reveal: a real stored outcome posts ONCE, as a quote of the poll, INFO kind, only stored numbers', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [guessRow()], fact_posts: [], nfl_td_feed: [] })
  const adapter = fakeAdapter('mlb', { results: () => ({ known: true, ranking: [{ id: 'T2', name: 'Test Player B', value: 2 }, { id: 'T1', name: 'Test Player A', value: 1 }] }) })
  assert.match(await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter, now: NOW }), /2026-10-08: posted/)
  assert.equal(tweets.length, 1)
  assert.equal(tweets[0].quote_tweet_id, '555')
  assert.equal(tweets[0].text, '⚾ MOONSHOT POLL RESULT\n\nTest Player B led the three with 2 home runs.')
  assert.ok(!tweets[0].poll)
  const res = db.tables.homer_feed_posts.find((r) => r.kind === 'poll_result')
  assert.equal(res.day, '2026-10-08'); assert.ok(res.x_post_id)
  // asked again: nothing more
  await PP.postRevealsOnce(db, { sport: 'mlb', today, adapter, now: NOW + 600e3 })
  assert.equal(tweets.length, 1)
  assert.equal(P.tierOf('poll_result'), 'writeup')
})
await ok('reveal text: leader, tie, yards, goals; zero or unknown is nothing; no probability', () => {
  const g = (metric) => ({ metric, day: today, players: [] })
  const r = (metric, ranking) => B.buildReveal({ sport: 'x', guess: g(metric), result: { known: true, ranking } })
  assert.match(r('hr_most', [{ id: 'a', name: 'Test A', value: 1 }, { id: 'b', name: 'Test B', value: 1 }]).text, /Test A and Test B tied for the lead with 1 home run each\./)
  assert.match(B.buildReveal({ sport: 'nfl', guess: g('td_longest'), result: { known: true, ranking: [{ id: 'a', name: 'Test A', value: 52 }] } }).text, /^🏈 TUDDY POLL RESULT\n\nTest A had the longest touchdown of the three: 52 yards\./)
  assert.match(B.buildReveal({ sport: 'nhl', guess: g('goals_most'), result: { known: true, ranking: [{ id: 'a', name: 'Test A', value: 2 }] } }).text, /Test A led the three with 2 goals\./)
  assert.equal(r('hr_most', []), null)
  assert.equal(B.buildReveal({ sport: 'mlb', guess: g('hr_most'), result: { known: false, ranking: [{ id: 'a', name: 'Test A', value: 3 }] } }), null)
  assert.equal(B.buildReveal({ sport: 'mlb', guess: g('unknown_metric'), result: { known: true, ranking: [{ id: 'a', name: 'Test A', value: 3 }] } }), null)
  assert.equal(B.buildReveal({ sport: 'mlb', guess: null, result: { known: true, ranking: [] } }), null)
  assert.ok(!BANNED.test(r('hr_most', [{ id: 'a', name: 'Test A', value: 2 }]).text))
})
await ok('reveal: the stored-result readers count only what is on file (mlb homers, nfl yards, nhl goals)', async () => {
  const guess = { day: '2026-10-08', metric: 'hr_most', players: [{ id: 'T1', name: 'Test Player A' }, { id: 'T2', name: 'Test Player B' }] }
  const mlb = MLB.createMlbPollAdapter({ day: today, db: fakeDb({ homer_feed: [{ day: '2026-10-08', player_id: 'T1' }, { day: '2026-10-08', player_id: 'T1' }, { day: '2026-10-07', player_id: 'T2' }] }) })
  const r = await mlb.results(guess)
  assert.deepEqual(r, { known: true, ranking: [{ id: 'T1', name: 'Test Player A', value: 2 }] })
  const none = await MLB.createMlbPollAdapter({ day: today, db: fakeDb({ homer_feed: [] }) }).results(guess)
  assert.equal(none.known, false)
  const nfl = NFL.createNflPollAdapter({ day: today, db: fakeDb({ nfl_td_feed: [{ day: '2026-10-08', gsis_id: 'T1', yards: 12 }, { day: '2026-10-08', gsis_id: 'T1', yards: 47 }, { day: '2026-10-08', gsis_id: 'T2', yards: null }] }) })
  assert.deepEqual((await nfl.results(guess)).ranking, [{ id: 'T1', name: 'Test Player A', value: 47 }])
  const nhl = NHL.createNhlPollAdapter({ day: today, db: fakeDb({ lamp_goal_feed: [{ day: '2026-10-08', player_id: 7, confirmed_at: 'x', overturned_at: null }] }) })
  assert.equal((await nhl.results({ day: '2026-10-08', players: [{ id: '7', name: 'Test Skater' }] })).ranking[0].value, 1)
})

// ═══ 6. REAL-DATA READERS (pure halves), SLOTS, KINDS, THE SWITCHES ═════════
await ok('bars: each sport states a real count against the market\'s standard bar', () => {
  const rates = new Map([['T1', { markets: { tb2: { L10: { ok: 6, n: 10 } }, hr: { streak: 2 }, hit: { streak: 7 } } }]])
  assert.deepEqual(MLB.mlbBarsFrom(rates, [player(1)]), [{ id: 'T1', label: '2+ total bases', threshold: 2, cleared: 6, of: 10 }])
  assert.deepEqual(MLB.mlbStreaksFrom(rates, [player(1)]).map((s) => [s.whatKey, s.n]), [['hr', 2], ['hit', 7]])
  const logs = { bars: { REC_YDS: ['g_recyd', 40], TD: ['g_td', 1] }, logs: { T1: { log: Array.from({ length: 10 }, (_, i) => ({ s: 2026, w: i + 1, g_recyd: i % 2 ? 60 : 10, g_td: 1 })) } } }
  assert.deepEqual(NFL.nflBarsFrom({ logs, players: [player(1, { pos: 'WR' })] }), [{ id: 'T1', label: '40+ receiving yards', threshold: 40, cleared: 5, of: 10 }])
  assert.deepEqual(NFL.nflBarsFrom({ logs, players: [player(1, { pos: 'K' })] }), [])
  const hot = { rows: [{ id: '7', spark: [[1, 4], [0, 3], [1, 2], [0, 5], [0, 3], [1, 1]] }] }
  assert.deepEqual(NHL.nhlBarsFrom(hot, [{ id: '7' }]), [{ id: '7', label: '3+ shots', threshold: 3, cleared: 4, of: 6 }])
  assert.deepEqual(NHL.nhlStreaksFrom({ rows: [{ id: '7', spark: [[1, 4], [2, 3], [1, 2], [0, 5]] }] }, [{ id: '7' }]), [{ id: '7', what: 'a goal', whatKey: 'goal', n: 3, min: 2 }])
  const nba = { rows: [{ playerId: 'B1', spark: [10, 12, 26, 27, 30] }] }
  assert.deepEqual(NBA.nbaBarsFrom(nba, [{ id: 'B1' }]), [{ id: 'B1', label: '25+ points', threshold: 25, cleared: 3, of: 5 }])
  assert.equal(NBA.nbaStreaksFrom(nba, [{ id: 'B1' }])[0].n, 3)
})
await ok('slots: Phoenix windows converted with Intl (no DST in Phoenix), first poll in the morning window', () => {
  const at = (sport, day) => new Date(S.pollSlots(sport, day)[0].startMs).toISOString()
  assert.equal(at('mlb', '2026-10-09'), '2026-10-09T17:50:00.000Z')      // 10:50 Phoenix = 17:50Z
  assert.equal(at('mlb', '2026-11-09'), '2026-11-09T17:50:00.000Z')      // Phoenix does not change on Nov 1
  assert.equal(at('nfl', '2026-10-11'), '2026-10-11T16:50:00.000Z')      // 9:50 Phoenix
  assert.equal(at('nhl', '2026-10-09'), '2026-10-09T20:20:00.000Z')
  assert.equal(at('nba', '2026-10-09'), '2026-10-09T23:30:00.000Z')
  assert.ok(S.pollSlots('nfl', today)[0].startMs < S.pollSlots('mlb', today)[0].startMs && S.pollSlots('mlb', today)[0].startMs < S.pollSlots('nhl', today)[0].startMs)
  // a zone that DOES change: New York 9:00 is 13:00Z before Nov 1 and 14:00Z after (read from Intl, never +N)
  assert.equal(new Date(S.zonedMs('2026-10-30', 9, 0, 'America/New_York')).toISOString(), '2026-10-30T13:00:00.000Z')
  assert.equal(new Date(S.zonedMs('2026-11-02', 9, 0, 'America/New_York')).toISOString(), '2026-11-02T14:00:00.000Z')
  assert.deepEqual(S.pollSlots('curling', today), [])
})
await ok('slots: every poll slot lands where the scheduler lets a poll go out (mayPostNow ok at slot + 5 min on a fake clock, every weekday)', async () => {
  const X = await import('../lib/dash/xSchedule.js')
  for (const sport of K.POLL_SPORTS) for (const day of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
    for (const s of S.pollSlots(sport, day)) {
      const r = X.mayPostNow({ kind: K.kindFor(sport, 'pick'), sport, now: s.startMs + 5 * 60e3, posted: [] })
      assert.equal(r.ok, true, `${sport} ${day} ${new Date(s.startMs).toISOString()}: ${r.reason}`)
    }
  }
})
await ok('MLB BOARD poll reads the Slate row (named MLB ids only); the old pregame row only before the Slate', async () => {
  const slateRow = { day: '2026-10-12', kind: 'slate', payload: { picks: [{ player_id: 'T1', name: 'Test A', team: 'AAA' }, { player_id: 'T2', name: 'Test B', team: 'BBB' }], named: ['T1', 'N9'], named_by_sport: { mlb: ['T1'], nfl: ['N9'] } } }
  const old = { day: '2026-10-08', kind: 'pregame', payload: { picks: [{ player_id: 'T3', name: 'Test C', team: 'CCC' }] } }
  const db = fakeDb({ homer_feed_posts: [slateRow, old, { day: '2026-10-13', kind: 'pregame', payload: { picks: [{ player_id: 'T4', name: 'Test D' }] } }] })
  assert.deepEqual(await MLB.mlbCalledNames(db, '2026-10-12'), [{ id: 'T1', name: 'Test A', team: 'AAA' }])
  assert.deepEqual(await MLB.mlbCalledNames(db, '2026-10-08'), [{ id: 'T3', name: 'Test C', team: 'CCC' }])
  assert.deepEqual(await MLB.mlbCalledNames(db, '2026-10-13'), [])      // from the Slate on, a stray pregame row is not read
})
await ok('kinds: every poll kind passes the migration pattern; sport reads right off the kind; the rest list is empty; old kinds are gone from the ticks', () => {
  const re = /^((nfl|nhl|nba)_)?poll_(pick|over|guess|streak|board|result)$/
  for (const k of [...K.POLL_KINDS, ...K.POLL_RESULT_KINDS]) assert.match(k, re)
  assert.equal(K.POLL_KINDS.length, 20); assert.equal(K.POLL_RESULT_KINDS.length, 4)
  assert.equal(P.sportOfKind('poll_pick'), 'mlb'); assert.equal(P.sportOfKind('nfl_poll_over'), 'nfl'); assert.equal(P.sportOfKind('nhl_poll_guess'), 'nhl'); assert.equal(P.sportOfKind('nba_poll_board'), 'nba')
  assert.equal(P.repeatWindowDays('nfl_poll_pick'), 7); assert.equal(P.repeatWindowDays('poll_pick'), 3)
  assert.deepEqual(R.RESTED_KINDS, [])
  for (const k of ['botpoll', 'community_pick', 'nfl_botpoll', 'nfl_community']) assert.equal(R.isRested(k), false)
  const read = (f) => fs.readFileSync(f, 'utf8')
  assert.ok(!/kind: 'botpoll'|claimSlot\(db, day, 'botpoll'\)|'community_pick'/.test(read('app/api/dash/homers/tick/route.js').replace(/\/\/.*$/gm, '')))
  assert.ok(!/nfl_botpoll|nfl_community/.test(read('app/api/dash/nfl/tick/route.js').replace(/\/\/.*$/gm, '')))
  // polls are on in code: no env list can switch them, only the emergency pause (and no X_UNREST)
  const src = read('lib/dash/polls/post.js') + read('lib/dash/xRest.js') + read('app/api/dash/polls/tick/route.js')
  assert.ok(!/X_UNREST|POST_KINDS_ON/.test(src.replace(/\/\/.*$/gm, '')))
  assert.match(read('lib/dash/polls/post.js'), /X_POLLS_PAUSE/)
  assert.match(read('vercel.json'), /\/api\/dash\/polls\/tick/)
})
await ok('postOnce: POST_KINDS_ON set to something else does not switch a poll off (envGate false), and still does for every other kind', async () => {
  reset()
  process.env.POST_KINDS_ON = 'pregame'
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  assert.equal(await PP.postPollOnce(db, { sport: 'mlb', day: today, adapter: fakeAdapter('mlb'), now: NOW }), 'posted')
  assert.equal(await LS.postOnce(db, { day: today, kind: 'longshots', build: async () => ({ text: 'TEST' }) }), 'off')
  delete process.env.POST_KINDS_ON
})
await ok('copy: across 30 days x 4 sports x every format, no link, hashtag, "bot", probability or percent; <= 2 emoji', () => {
  for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.parse(`${today}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)
      for (const f of K.POLL_FORMATS) {
        const s = B.BUILDERS[f]({ sport, day, usedKeys: new Set(), exclude: new Set(), ...fullData() })
        if (!s) continue
        assert.ok(!BANNED.test(s.text) && !BANNED.test(s.discordText) && emoji(s.discordText) <= 2, s.text)
        for (const o of s.options) assert.ok(!BANNED.test(o) && o.length <= 25)
      }
    }
  }
})

console.log(`\n${n} checks passed`)
