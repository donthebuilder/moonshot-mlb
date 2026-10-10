#!/usr/bin/env node
// THE SLATE, CHECKED ON TEST DATA (X overhaul stage 3 piece 3, 2026-10-09). Every name, id and number
// below is made up and labelled "Test ..."; the database is an in-memory fake and fetch is replaced, so
// nothing here touches X, Discord, Supabase or the network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-slate.mjs [--sample]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
process.env.X_TEXT_LIMIT = '900'   // prod has the long-post allowance (NOW.md); xPost reads it at import
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' })
for (const k of ['X_LINKS_EMERGENCY', 'X_LINK_KINDS', 'X_POST_LINK', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_DAILY_CAP', 'POST_KINDS_ON', 'BUCKETS_PUBLIC', 'NEXT_PUBLIC_BUCKETS_PUBLIC', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]

const tweets = [], discords = []
let xFail = []   // statuses X answers with, one per call, before it accepts
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets') && xFail.length) return { ok: false, status: xFail.shift(), json: async () => ({ title: 'test failure' }), headers: { get: () => null } }
  if (String(url).includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(7000 + tweets.length) } }), headers: { get: () => null } } }
  if (String(url).startsWith('https://discord.test/')) { discords.push({ url: String(url), body: JSON.parse(opts.body) }); return { ok: true, status: 204, json: async () => ({}), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}

const S = await import('../lib/posts/slate.js')
const MLB = await import('../lib/posts/mlb.js')
const NFL = await import('../lib/posts/nfl.js')
const NHL = await import('../lib/posts/nhl.js')
const NBA = await import('../lib/posts/nba.js')
const R = await import('../lib/routes.js')
const P = await import('../lib/dash/xPolicy.js')
const G = await import('../lib/dash/xGate.js')
const L = await import('../lib/dash/xPostLog.js')
const PC = await import('../lib/dash/postClaim.js')
const Q = await import('../lib/dash/quoteFor.js')
const CS = await import('../lib/callStatus.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const reset = () => { PC._resetTakenForTests(); xFail = []; tweets.length = 0; discords.length = 0; L._resetLogForTests(); G._resetRecentCache(); S._resetSlateForTests() }

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

// ── TEST DATA (made up; names are "Test ...") ────────────────────────────────
const DAY = '2026-10-09'                                   // a Friday
const NOW = Date.parse('2026-10-09T22:30:00Z')             // 6:30pm ET: inside the hour before the 7:10pm first pitch
// THE CLOCK IS INJECTED (F-04): code under test that reads Date.now() itself sees NOW, so this passes on any real date
Date.now = () => NOW
const MLB_START = '2026-10-09T23:10:00Z'
const NFL_KICK = '2026-10-09T23:15:00Z'
const NHL_DROP = '2026-10-10T00:00:00Z'
const mlbRow = (o) => ({ player_id: 'm1', name: 'Test Hitter One', team: 'LAD', game_pk: 1, game_time: MLB_START, game_pick_role: 'TOP', board_rank: 1, board_of: 80,
  last10_hr: 3, season_hr: 40, pitcher_name: 'Test Arm', pitcher_projected: false, pitcher_l3_hr9: 1.8, lineup_confirmed: true, ...o })
const mlbBoard = () => [
  mlbRow({}),
  mlbRow({ player_id: 'm2', name: 'Test Hitter Two', team: 'NYY', game_pk: 2, game_pick_role: 'HR', board_rank: 3, last10_hr: 0, season_hr: 31 }),
  mlbRow({ player_id: 'm3', name: 'Test Hitter Three', team: 'SEA', game_pk: 3, game_pick_role: '', board_rank: 2 }),            // on the board, not a call
]
const nflWeek = (extra = []) => ({
  games: [{ game_id: 'g1', kickoff: NFL_KICK, away: 'KC', home: 'BUF', away_name: 'Kansas City Chiefs', home_name: 'Buffalo Bills' }],
  players: [
    { player_id: 'n1', name: 'Test Back One', team: 'KC', opp: 'BUF', position: 'RB', scores: { TD: 99 }, stats: { RZ: 3.2 } },
    { player_id: 'n2', name: 'Test Receiver Two', team: 'BUF', opp: 'KC', position: 'WR', scores: { TD: 98 }, stats: { RZ: 2.1 } },
    ...Array.from({ length: 498 }, (_, i) => ({ player_id: `nf${i}`, name: `Test Filler ${i}`, team: 'ZZZ', position: 'WR', scores: { TD: 50 - i / 100 }, stats: {} })),
    ...extra,
  ],
})
const nflPicks = () => ({ card: { TD: { rungs: [{ rank: 1, player_id: 'n1' }, { rank: 2, player_id: 'n2' }] } } })
const nhlGames = (over = {}) => [{
  game: { id: 1, startUtc: NHL_DROP, state: 'pre', scheduleState: 'OK' },
  starters: { away: { playerId: 9, confirmed: true }, home: { playerId: 8, confirmed: true } },
  rows: [
    { playerId: 'h1', name: 'Test Skater One', team: 'TOR', home: true, score: 91, status: 'called', legs: { shotsPg: 3.4 }, context: { nightRank: 1, nightOf: 300 } },
    { playerId: 'h2', name: 'Test Skater Two', team: 'MTL', home: false, score: 88, status: 'called', legs: { shotsPg: 2.9 }, context: { nightRank: 2, nightOf: 300 } },
  ],
  ...over,
}]
const nbaBoard = () => ({
  games: [{ id: 'b1', seasonType: 2, state: 'pre', start: '2026-10-10T00:30:00Z' }],
  rows: [{ gameId: 'b1', playerId: 'b1p', name: 'Test Guard One', team: 'BOS', score: 80, status: 'called', nightRank: 1, nightOf: 150, injury: null }],
})
const sportsOf = ({ mlb = mlbBoard(), nfl = nflWeek(), nhl = nhlGames(), nba = null, now = NOW, mlbHold = null } = {}) => [
  MLB.mlbSlate({ rows: mlb, hold: mlbHold, firstStartMs: Date.parse(MLB_START) }),
  NFL.nflSlate({ data: nfl, picks: nflPicks(), day: DAY, now }),
  NHL.nhlSlate({ games: nhl || [], now }),
  NBA.nbaSlate({ board: nba, now }),
]
const emoji = (t) => (t.match(/\p{Extended_Pictographic}/gu) || []).length
const BANNED = /https?:|www\.|\.com\b|dashnetwork|#\w|\bbot\b|\bprobab|\bchance\b|\bodds\b|%|\bpick\b/i
const sample = (label, a) => { if (process.argv.includes('--sample')) console.log(`\n----- SAMPLE (${label}; TEST data, not real players) -----\n${a.text}\n----- ${a.text.split('\n').length} lines, ${S.xLen(a.text)} chars -----`) }

// ═══ 1. SHAPE ═══════════════════════════════════════════════════════════════
await ok('shape: a 3-sport day -- header, Call of the Night, one line per sport, the pointer in words', () => {
  process.env.X_TEXT_LIMIT = '900'
  const a = S.assembleSlate({ day: DAY, sports: sportsOf(), now: NOW })
  assert.equal(a.state, 'go')
  const lines = a.text.split('\n')
  assert.equal(lines[0], '🎯 THE SLATE · FRI OCT 9')
  assert.equal(lines[1], '')
  assert.equal(lines[2], 'CALL OF THE NIGHT')
  // the NFL back is #1 of 500 on his board: the smallest share of any board, so he leads
  assert.equal(lines[3], 'Test Back One (Kansas City Chiefs)')
  assert.equal(lines[4], 'anytime touchdown')
  assert.equal(lines[5], 'CALLED · 3.2 red-zone touches a game')
  assert.equal(lines[6], '')
  assert.deepEqual(lines.slice(7, 10), ['MLB  Test Hitter One · home run', 'NFL  Test Receiver Two · anytime touchdown', 'NHL  Test Skater One · goal scorer'])
  assert.equal(lines[10], '')
  assert.equal(lines[11], 'Full rankings → DASH · MOONSHOT · TUDDY · LAMP')
  // Donovan's shape: header + 4 call lines + one per sport + the pointer = 9 content lines on a three-sport day (the "4-8" of the
  // style guide is the one-or-two-sport day); fewer sports -> fewer lines, never more
  assert.equal(lines.filter((l) => l !== '').length, 9)
  assert.ok(emoji(a.text) <= 2, 'at most two emoji')
  for (const l of lines) assert.ok(l.length <= 48, `short lines: ${l.length} "${l}"`)
  // a full three-sport day is ~290 weighted characters: it needs the long-post allowance prod has (X_TEXT_LIMIT 900, NOW.md); at 280 it sheds sport lines
  assert.ok(S.xLen(a.text) > 280 && S.xLen(a.text) <= 900, `${S.xLen(a.text)} weighted chars`)
  sample('three sports, Fri Oct 9', a)
})
await ok('shape: the pointer is built from the real nav names (BRAND, the Rankings page), never a URL', () => {
  const names = R.SPORT_KEYS.map((k) => R.BRAND[k].name)
  assert.deepEqual(names, ['MOONSHOT', 'TUDDY', 'LAMP'])
  assert.equal(S.pointerLine(['mlb', 'nfl', 'nhl']), `${R.POST_POINTER.lead} ${R.POST_POINTER.arrow} DASH · ${names.join(' · ')}`)
  assert.equal(R.tabName('mlb', 'fullboard'), 'Rankings')   // the board page really is called Rankings
  assert.ok(!/https?:|\//.test(S.pointerLine(['mlb'])))
})
await ok('shape: only sports with games appear -- an MLB-only day has no NFL or NHL line and no TUDDY/LAMP in the pointer', () => {
  const a = S.assembleSlate({ day: DAY, sports: sportsOf({ nfl: { games: [], players: [] }, nhl: [] }), now: NOW })
  assert.equal(a.state, 'go')
  assert.ok(!/NFL|NHL|TUDDY|LAMP|touchdown|goal scorer/.test(a.text), a.text)
  assert.match(a.text, /Full rankings → DASH · MOONSHOT$/)
  // the Call of the Night is MLB's #1; MLB's own line shows his NEXT called player, never the same name twice
  assert.match(a.text, /^CALL OF THE NIGHT\nTest Hitter One \(Los Angeles Dodgers\)\nhome run\nCALLED · 3 HR in his last 10 games$/m)
  assert.match(a.text, /\nMLB  Test Hitter Two · home run\n/)
  assert.equal(a.text.split('Test Hitter One').length, 2)
  sample('MLB only, Fri Oct 9', a)
})
await ok('shape: a lone called player -- the Call of the Night and the pointer, no sport line (no name twice)', () => {
  const a = S.assembleSlate({ day: DAY, sports: sportsOf({ mlb: [mlbRow({})], nfl: { games: [], players: [] }, nhl: [] }), now: NOW })
  assert.equal(a.state, 'go')
  assert.ok(!/^MLB /m.test(a.text))
  assert.equal(a.text.split('\n').length, 8)
})
await ok('shape: the words come from the registry, with no sport branches in the slate code', () => {
  assert.equal(R.POST_WORDS.mlb.market, 'home run'); assert.equal(R.POST_WORDS.nfl.market, 'anytime touchdown'); assert.equal(R.POST_WORDS.nhl.market, 'goal scorer'); assert.equal(R.POST_WORDS.nba.market, '25 points')
  for (const f of ['lib/posts/slate.js', 'lib/posts/slateLoad.js']) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
    assert.ok(!/sport\s*===\s*'(mlb|nfl|nhl|nba)'|'(mlb|nfl|nhl|nba)'\s*===\s*sport/.test(src), `${f} branches on a sport name`)
  }
})
await ok('shape: at the plain 280 limit a one-sport day fits whole and a three-sport day sheds its last sport lines (never the Call of the Night)', () => {
  const one = S.assembleSlate({ day: DAY, sports: sportsOf({ nfl: { games: [], players: [] }, nhl: [] }), now: NOW, limit: 280 })
  assert.ok(S.xLen(one.text) <= 280 && /Test Hitter Two/.test(one.text), one.text)
  const three = S.assembleSlate({ day: DAY, sports: sportsOf(), now: NOW, limit: 280 })
  assert.ok(S.xLen(three.text) <= 280)
  assert.match(three.text, /CALL OF THE NIGHT\nTest Back One/)
  assert.ok(three.text.split('\n').length < 12)
})
await ok('shape: the date is the slate\'s own day (UTC noon of the key), whatever the clock says', () => {
  assert.equal(S.dayLabel('2026-10-09'), 'FRI OCT 9')
  assert.equal(S.dayLabel('2026-11-01'), 'SUN NOV 1')
})
await ok('shape: too long for X -> sport lines come off the bottom, then the pointer; the Call of the Night never does', () => {
  const longName = (o) => ({ ...o, name: `${o.name} Wolfeschlegelsteinhausenbergerdorff` })
  const sports = sportsOf()
  for (const s of sports) s.cands = s.cands.map(longName)
  const a = S.assembleSlate({ day: DAY, sports, now: NOW, limit: 280 })
  assert.equal(a.state, 'go')
  assert.ok(S.xLen(a.text) <= 280, `${S.xLen(a.text)}`)
  assert.match(a.text, /CALL OF THE NIGHT/)
  const withAll = S.assembleSlate({ day: DAY, sports: sportsOf(), now: NOW, limit: 900 })
  assert.ok(a.text.split('\n').length < withAll.text.split('\n').length, 'shortened')
  // and named still equals what is in the text
  for (const id of a.named) assert.ok(sports.flatMap((s) => s.cands).find((c) => String(c.id) === id && a.text.includes(c.name)), id)
})

// ═══ 2. CALL OF THE NIGHT ═══════════════════════════════════════════════════
await ok('call of the night: the smallest SHARE of its own board wins -- #1 of 500 beats #1 of 80; a score is never read', () => {
  const c = (sport, id, rank, of, score) => ({ sport, id, name: `Test ${id}`, rank, of, score, hr_score: score, problem: null, proof: 'p', teamName: 'T' })
  // MLB has the HIGHEST score of anything here; the pick must not care
  const rows = [c('mlb', 'a', 1, 80, 9999), c('nfl', 'b', 1, 500, 1), c('nhl', 'c', 1, 300, 5000)]
  const { cotn, lines } = S.pickSlate(rows)
  assert.equal(cotn.id, 'b')
  assert.deepEqual(lines.map((l) => l.id), ['a', 'c'])   // each other sport shows its own #1; the cotn's sport has no second player, so no line
  // shuffle every score: same answer
  for (let i = 0; i < 20; i++) {
    const shuffled = rows.map((r) => ({ ...r, score: Math.random() * 1e6, hr_score: Math.random() * 1e6 }))
    assert.equal(S.pickSlate(shuffled).cotn.id, 'b')
  }
  // a #2 of 500 (0.4%) still beats a #1 of 80 (1.25%); a #7 of 500 (1.4%) does not
  assert.equal(S.pickSlate([c('mlb', 'a', 1, 80), c('nfl', 'b', 2, 500)]).cotn.id, 'b')
  assert.equal(S.pickSlate([c('mlb', 'a', 1, 80), c('nfl', 'b', 7, 500)]).cotn.id, 'a')
})
await ok('call of the night: a tie goes to the registry order (MOONSHOT, TUDDY, LAMP, BUCKETS)', () => {
  const c = (sport, id) => ({ sport, id, name: `Test ${id}`, rank: 1, of: 100, problem: null, proof: 'p', teamName: 'T' })
  assert.equal(S.pickSlate([c('nhl', 'c'), c('nfl', 'b'), c('mlb', 'a')]).cotn.id, 'a')
  assert.equal(S.pickSlate([c('nhl', 'c'), c('nfl', 'b')]).cotn.id, 'b')
})
await ok('call of the night: only CALLED players are candidates (ON THE BOARD / NOT ON THE BOARD never lead or fill a line)', () => {
  const a = S.assembleSlate({ day: DAY, sports: sportsOf({ nfl: { games: [], players: [] }, nhl: [] }), now: NOW })
  assert.ok(!a.text.includes('Test Hitter Three'))           // rank 2 on the board, no call
  assert.equal(CS.callStatus({ role: 'TOP' }), 'called'); assert.equal(CS.callStatus({ role: '', board_rank: 2, board_of: 80 }), 'board')
  // NFL: a man on the board but not on the TD ladder is not a candidate; NHL: status board is not
  const nfl = NFL.nflSlate({ data: nflWeek([{ player_id: 'n9', name: 'Test Board Only', team: 'KC', position: 'WR', scores: { TD: 99.5 }, stats: {} }]), picks: nflPicks(), day: DAY, now: NOW })
  assert.ok(!nfl.cands.some((x) => x.id === 'n9'))
  const nhl = NHL.nhlSlate({ games: nhlGames({ rows: [{ playerId: 'h3', name: 'Test Board Skater', team: 'TOR', home: true, score: 99, status: 'board', legs: { shotsPg: 3 }, context: { nightRank: 1, nightOf: 300 } }] }), now: NOW })
  assert.equal(nhl.cands.length, 0)
})
await ok('call of the night: the rule is written in the code (documented) and the cross-sport pick reads no score', () => {
  const src = fs.readFileSync('lib/posts/slate.js', 'utf8')
  assert.match(src, /WHO IS "THE STRONGEST CALL"/)
  assert.match(src, /rank \/ of/)
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/\.score\b|hr_score|scores\b|\.pct\b/.test(code), 'lib/posts/slate.js reads a score')
  for (const f of ['mlb', 'nfl', 'nhl', 'nba']) {
    const adapter = fs.readFileSync(`lib/posts/${f}.js`, 'utf8').replace(/\/\/.*$/gm, '')
    // the adapters may use a score only to know a row WAS scored (a number exists), never to order
    assert.ok(!/sort\([^)]*score/.test(adapter), `${f} orders by a score`)
  }
})

// ═══ 3. BEFORE ANYONE IS NAMED: HOLD, THEN DROP ═════════════════════════════
await ok('naming: an MLB name with the lineup not posted HOLDS the post; at 30 minutes before first pitch it goes out WITHOUT him', () => {
  const board = mlbBoard(); board[0] = mlbRow({ lineup_confirmed: false })
  const early = Date.parse('2026-10-09T22:20:00Z')           // 50 minutes before first pitch
  const held = S.assembleSlate({ day: DAY, sports: sportsOf({ mlb: board, now: early }), now: early })
  assert.equal(held.state, 'held'); assert.match(held.reason, /lineup not posted/)
  const late = Date.parse('2026-10-09T22:41:00Z')            // 29 minutes before
  const out = S.assembleSlate({ day: DAY, sports: sportsOf({ mlb: board, now: late }), now: late })
  assert.equal(out.state, 'go')
  assert.ok(!out.text.includes('Test Hitter One'), 'he is never named')
  assert.ok(out.text.includes('Test Hitter Two'), 'the next called hitter takes the seat')
  assert.deepEqual(out.trimmed, ['mlb:m1'])
})
await ok('naming: a projected (unconfirmed) starter is pending too', () => {
  const board = mlbBoard(); board[0] = mlbRow({ pitcher_projected: true })
  const held = S.assembleSlate({ day: DAY, sports: sportsOf({ mlb: board }), now: Date.parse('2026-10-09T22:20:00Z') })
  assert.equal(held.state, 'held'); assert.match(held.reason, /starter not confirmed/)
})
await ok('naming: an OUT football player is left out at once (a definite no is not a hold); an NFL man whose game has started too', () => {
  const week = nflWeek(); week.players[0].injury_status = 'Out'
  const a = S.assembleSlate({ day: DAY, sports: sportsOf({ nfl: week }), now: NOW })
  assert.equal(a.state, 'go'); assert.ok(!a.text.includes('Test Back One'))
  assert.match(a.text, /Test Receiver Two/)
  const started = S.assembleSlate({ day: DAY, sports: sportsOf({ now: Date.parse(NFL_KICK) + 60e3 }), now: Date.parse(NFL_KICK) + 60e3 })
  assert.ok(!/Test Back One|Test Receiver Two/.test(started.text || ''))
})
await ok('naming: an NHL skater needs the opposing starting goalie confirmed -- an unconfirmed one HOLDS, then the sport line is dropped', () => {
  const games = nhlGames({ starters: { away: { playerId: 9, confirmed: false }, home: { playerId: 8, confirmed: true } } })
  const held = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: games }), now: NOW })
  // Test Skater One is the home side: his opponent is the AWAY goalie, unconfirmed. First game is 7:10pm, NOW is 6:30pm: held
  assert.equal(held.state, 'held'); assert.match(held.reason, /starting goalie not confirmed/)
  const late = Date.parse('2026-10-09T22:45:00Z')
  const out = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: games, now: late }), now: late })
  assert.equal(out.state, 'go'); assert.ok(!out.text.includes('Test Skater One'))
})
await ok('naming: an NHL game with no goalie source is a definite no -- the post is NOT held for a goalie that cannot come', () => {
  const games = nhlGames({ starters: null })
  const a = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: games }), now: NOW })
  assert.equal(a.state, 'go')
  assert.ok(!/NHL|goal scorer/.test(a.text.replace(/LAMP/, '')), 'no NHL line')
  assert.match(a.text, /· LAMP$/)                              // the pointer still lists the product that played
})
await ok('naming: the real pregame source (goalieSource via startersFor, TEST feed) -- confirmed both sides GOES, an ESPN-expected side HOLDS, an unlisted game is a definite no', async () => {
  const GSRC = await import('../lib/nhl/goalies.js'); const GSX = await import('../lib/nhl/goalieSource.js')
  const prob = (n, t) => [{ name: 'probableStartingGoalie', athlete: { id: '1', fullName: n }, status: { type: t } }]
  const feed = (a, h) => async () => ({ ok: true, status: 200, json: async () => ({ events: [{ date: NHL_DROP, status: { type: { name: 'STATUS_SCHEDULED' } }, competitions: [{ date: NHL_DROP, competitors: [{ homeAway: 'home', team: { abbreviation: 'TOR' }, probables: prob('Test Home Goalie', h) }, { homeAway: 'away', team: { abbreviation: 'MTL' }, probables: prob('Test Away Goalie', a) }] }] }] }) })
  const game = { id: 1, away: { abbrev: 'MTL' }, home: { abbrev: 'TOR' }, startUtc: NHL_DROP, state: 'pre' }
  const goaliesFor = async () => ({ away: [{ id: 9, first: 'Test', last: 'Goalie' }], home: [{ id: 8, first: 'Test', last: 'Goalie' }] })
  const via = async (a, h, gm = game) => { GSX._resetForTests(); const st = await GSRC.startersFor(DAY, [gm], { fetchImpl: feed(a, h), now: NOW, goaliesFor }); return nhlGames({ starters: st.byGame[1] ?? null }) }
  const go = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: await via('confirmed', 'confirmed') }), now: NOW })
  assert.equal(go.state, 'go'); assert.match(go.text, /Test Skater One/)
  const held = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: await via('expected', 'confirmed') }), now: NOW })
  assert.equal(held.state, 'held'); assert.match(held.reason, /starting goalie not confirmed/)
  const none = S.assembleSlate({ day: DAY, sports: sportsOf({ nhl: await via('confirmed', 'confirmed', { ...game, away: { abbrev: 'ZZZ' } }) }), now: NOW })
  assert.equal(none.state, 'go'); assert.ok(!none.text.includes('Test Skater One'))
})
await ok('naming: a board that is not tonight\'s (stale date / arms) HOLDS the MOONSHOT line, then it is left out', () => {
  const early = Date.parse('2026-10-09T22:15:00Z')
  const held = S.assembleSlate({ day: DAY, sports: sportsOf({ mlbHold: 'stale-slate-date', now: early }), now: early })
  assert.equal(held.state, 'held'); assert.match(held.reason, /mlb: stale-slate-date/)
  const late = Date.parse('2026-10-09T22:50:00Z')
  const out = S.assembleSlate({ day: DAY, sports: sportsOf({ mlbHold: 'stale-slate-date', now: late }), now: late })
  assert.equal(out.state, 'go'); assert.ok(!/MLB |Test Hitter/.test(out.text))
})
await ok('naming: too early -> waiting; a failed read for a sport holds, then drops it', () => {
  const morning = Date.parse('2026-10-09T13:00:00Z')
  assert.equal(S.assembleSlate({ day: DAY, sports: sportsOf(), now: morning }).state, 'waiting')
  const sports = sportsOf(); sports[1] = { sport: 'nfl', hasGames: false, firstStartMs: NaN, hold: 'the TUDDY week file could not be read', cands: [] }
  assert.equal(S.assembleSlate({ day: DAY, sports, now: NOW }).state, 'held')
  const late = Date.parse('2026-10-09T22:50:00Z')
  assert.equal(S.assembleSlate({ day: DAY, sports, now: late }).state, 'go')
})

// ═══ 4. NAMED = THE TEXT, EXACTLY ═══════════════════════════════════════════
await ok('named: the ids stored are exactly the players in the text -- every day shape', () => {
  const day = [sportsOf(), sportsOf({ nfl: { games: [], players: [] } }), sportsOf({ nhl: [], nfl: { games: [], players: [] } })]
  for (const sports of day) {
    const a = S.assembleSlate({ day: DAY, sports, now: NOW })
    const all = sports.flatMap((s) => s.cands)
    const inText = all.filter((c) => a.text.includes(c.name)).map((c) => String(c.id)).sort()
    assert.deepEqual([...a.named].sort(), inText)
    assert.deepEqual(a.payload.named, a.named)
    assert.deepEqual(Object.keys(a.payload.named_by_sport).sort(), ['mlb', 'nba', 'nfl', 'nhl'])
    assert.deepEqual(Object.values(a.payload.named_by_sport).flat().sort(), [...a.named].sort())
    assert.equal(a.named.length, new Set(a.named).size)
    // the MOONSHOT names are kept in the old pregame shape for the morning grade and /called
    assert.deepEqual(a.payload.picks.map((p) => p.player_id), a.payload.named_by_sport.mlb)
  }
})
await ok('named: no banned words anywhere -- links, hashtags, "bot", probability words, percent signs', () => {
  for (const sports of [sportsOf(), sportsOf({ nfl: { games: [], players: [] }, nhl: [] })]) {
    const a = S.assembleSlate({ day: DAY, sports, now: NOW })
    assert.ok(!BANNED.test(a.text), a.text)
  }
})

// ═══ 5. BUCKETS ═════════════════════════════════════════════════════════════
await ok('buckets: the line is absent until BUCKETS is public, and it never reaches the pointer; public + regular season -> the line', () => {
  const sports = sportsOf({ nba: nbaBoard() })
  assert.equal(sports[3].cands.length, 1)                      // the adapter built it (regular-season game)
  let a = S.assembleSlate({ day: DAY, sports, now: NOW })
  assert.ok(!/BUCKETS|NBA|25 points|Test Guard/.test(a.text), a.text)
  assert.ok(!a.named.includes('b1p'))
  process.env.BUCKETS_PUBLIC = 'on'
  a = S.assembleSlate({ day: DAY, sports: sportsOf({ nba: nbaBoard() }), now: NOW })
  // #1 of 150 is a smaller share than MLB's #1 of 80 and LAMP's #1 of 300? no: 1/300 is smallest, TUDDY's 1/500 is smaller still
  assert.match(a.text, /NBA  Test Guard One · 25 points/)
  assert.match(a.text, /· BUCKETS$/)
  delete process.env.BUCKETS_PUBLIC
})
await ok('buckets: a preseason or playoff-less night has no BUCKETS line even when public', () => {
  process.env.BUCKETS_PUBLIC = 'on'
  const board = nbaBoard(); board.games[0].seasonType = 1
  const sports = sportsOf({ nba: board })
  assert.equal(sports[3].hasGames, false)
  const a = S.assembleSlate({ day: DAY, sports, now: NOW })
  assert.ok(!/NBA|Test Guard/.test(a.text))
  assert.ok(!/BUCKETS/.test(a.text))
  delete process.env.BUCKETS_PUBLIC
})

// ═══ 6. RETIRED KINDS ═══════════════════════════════════════════════════════
await ok('retired: pregame, callofnight and thefour are unreachable -- the claim gate refuses them, and no code claims or posts them', async () => {
  assert.deepEqual([...P.RETIRED_BY_SLATE].sort(), ['callofnight', 'pregame', 'thefour'])
  const db = { from() { throw new Error('a retired kind reached the database') } }
  for (const k of P.RETIRED_BY_SLATE) {
    assert.ok(P.isRetiredForever(k))
    assert.equal(await PC.claimSlot(db, DAY, k, { gate: (kind) => !P.isRetiredForever(kind) }), false)
  }
  // a scan for strays: nothing claims, builds or posts a retired kind. History READS are named here, and only here.
  const READS = new Set(['app/api/dash/homers/card/route.js'])   // renders an OLD day's pregame card from its stored row
  const hits = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p) } else if (/\.(js|mjs)$/.test(e.name)) {
    const rel = p.replace(/\\/g, '/')
    if (READS.has(rel) || rel === 'lib/dash/xPolicy.js') continue
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      if (/(claimSlot|claimAndPostStat|safeStat|knownTaken|markTaken)\([^)]*'(pregame|callofnight|thefour)'/.test(code)) hits.push(`${rel}:${i + 1} claims a retired kind`)
      if (/\bkind:\s*'(pregame|callofnight|thefour)'/.test(code)) hits.push(`${rel}:${i + 1} names a retired kind in a post/claim`)
      if (/(theFourPicks|theFourText|callOfTheNightPick|callOfTheNightText|pregameCard)\(/.test(code) && !/export (async )?function/.test(code) && !rel.startsWith('lib/dash/')) hits.push(`${rel}:${i + 1} calls a retired builder`)
    })
  } } }
  walk('app'); walk('lib')
  assert.deepEqual(hits, [])
  // the tick posts the Slate and nothing of the old three
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  assert.match(route, /postSlateOnce\(db/)
  assert.ok(!/DAILY_KINDS = new Set\([^)]*'(pregame|callofnight)'/.test(route))
})
await ok('offseason MLB day: the tick still tries the Slate (football / hockey days), once, before it returns', () => {
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  const g = route.indexOf("skipped: 'offseason'")
  assert.ok(g > 0)
  const block = route.slice(route.lastIndexOf('if (!season.active)', g), g + 80)
  assert.match(block, /slateTick\(db, \{ day: easternToday\(\) \}\)/)
  // in-season the Slate is called from exactly two places (no games / board path), never also from the guard's path
  assert.equal((route.match(/await slateTick\(db/g) || []).length, 3)
})
await ok('retired: their history rows stay valid -- the database check still lists them, and the receipt reads an old pregame row', () => {
  const sql = fs.readFileSync('supabase/migrations/202610020300_lamp_shot_speed_and_widen_20.sql', 'utf8')
  for (const k of ['pregame', 'callofnight', 'thefour']) assert.ok(sql.includes(`'${k}'`))
  assert.match(fs.readFileSync('supabase/migrations/202610091400_homer_feed_posts_kind_slate.sql', 'utf8'), /kind = ''slate''/)
  const old = Q.mlbQuotes({ pre: { x_post_id: '111', payload: { named: ['10'] } }, gamePosts: [], callStatus: (r) => r._s })
  assert.equal(old.quoteFor({ player_id: 10, _s: 'called' }), '111')
})

// ═══ 7. THE RECEIPT READS THE SLATE'S NAMED IDS ══════════════════════════════
await ok('quote: a CALLED homer quotes the Slate only when the Slate names HIM; a football id in `named` never quotes a hitter', () => {
  const a = S.assembleSlate({ day: DAY, sports: sportsOf(), now: NOW })
  const pre = { x_post_id: '5001', payload: a.payload }
  const status = (r) => r._s
  const q = Q.mlbQuotes({ pre, gamePosts: [], callStatus: status }).quoteFor
  assert.equal(q({ player_id: 'm1', _s: 'called' }), '5001')            // named on the MLB line
  assert.equal(q({ player_id: 'm2', _s: 'called' }), null)              // called, but not named in this post
  assert.equal(q({ player_id: 'm1', _s: 'board' }), null)
  // an id that is only in the NFL list does not quote a hitter with the same id
  const cross = { x_post_id: '5002', payload: { named: ['n1'], named_by_sport: { mlb: [], nfl: ['n1'], nhl: [], nba: [] } } }
  assert.equal(Q.mlbQuotes({ pre: cross, gamePosts: [], callStatus: status }).quoteFor({ player_id: 'n1', _s: 'called' }), null)
  // a slate that never went out (no X id) quotes nothing
  assert.equal(Q.mlbQuotes({ pre: { x_post_id: null, payload: a.payload }, gamePosts: [], callStatus: status }).quoteFor({ player_id: 'm1', _s: 'called' }), null)
  // NFL / NHL: the same rule through slateQuoteFor
  assert.equal(Q.slateQuoteFor('nfl', pre)('n1'), '5001')
  assert.equal(Q.slateQuoteFor('nfl', pre)('n2'), '5001')
  assert.equal(Q.slateQuoteFor('nfl', pre)('n9'), null)
  assert.equal(Q.slateQuoteFor('nhl', pre)('h1'), '5001')
  assert.equal(Q.slateQuoteFor('nhl', pre)('h2'), null)
  assert.equal(Q.slateQuoteFor('nfl', { x_post_id: 'dry', payload: a.payload })('n1'), null)
  assert.match(fs.readFileSync('app/api/dash/nfl/tick/route.js', 'utf8'), /slateQuoteFor\('nfl'/)
  assert.match(fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8'), /morningPost\(db, day, 'x_post_id,payload'\)/)
})

// ═══ 8. POSTING: ONE ROW, THE GATE, THE REPEAT GUARD, DISCORD ═══════════════
const load = (sports) => async () => sports
await ok('post: claims once, stores `named`, goes to X as plain text and mirrors to the free Discord channels; a second try does nothing', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [] })
  const r = await S.postSlateOnce(db, { day: DAY, load: load(sportsOf()), hooks: 'https://discord.test/hook', now: NOW })
  assert.equal(r, 'posted')
  assert.equal(tweets.length, 1)
  const row = db.tables.homer_feed_posts.find((x) => x.kind === 'slate')
  assert.equal(row.x_post_id, '7001'); assert.equal(row.discord_sent, true)
  assert.deepEqual(row.payload.named.sort(), ['h1', 'm1', 'n1', 'n2'])
  assert.equal(tweets[0].text, row.payload.named.length ? tweets[0].text : '')
  assert.ok(!BANNED.test(tweets[0].text))
  assert.equal(discords.length, 1); assert.equal(discords[0].body.content, tweets[0].text)   // plain text, character for character
  assert.equal(db.tables.homer_feed_posts.filter((x) => ['pregame', 'callofnight', 'thefour'].includes(x.kind)).length, 0)
  const again = await S.postSlateOnce(db, { day: DAY, load: load(sportsOf()), hooks: 'https://discord.test/hook', now: NOW })
  assert.equal(again, 'already-posted'); assert.equal(tweets.length, 1)
})
await ok('post: a HELD post claims nothing and posts nothing; the same call later (past the cutoff) posts without the pending name', async () => {
  reset(); PC.markTaken && 0
  const day = '2026-10-16'
  const db = fakeDb({ homer_feed_posts: [] })
  const board = mlbBoard().map((r) => ({ ...r, game_time: '2026-10-16T23:10:00Z' })); board[0] = { ...board[0], lineup_confirmed: false }
  const mk = (now) => [MLB.mlbSlate({ rows: board }), NFL.nflSlate({ data: { games: [], players: [] }, picks: nflPicks(), day, now }), NHL.nhlSlate({ games: [], now }), NBA.nbaSlate({ board: null, now })]
  const t1 = Date.parse('2026-10-16T22:20:00Z')
  const held = await S.postSlateOnce(db, { day, load: load(mk(t1)), hooks: 'https://discord.test/hook', now: t1 })
  assert.match(held, /^held:/); assert.equal(db.tables.homer_feed_posts.length, 0); assert.equal(tweets.length, 0)
  S._resetSlateForTests()
  const t2 = Date.parse('2026-10-16T22:45:00Z')
  const out = await S.postSlateOnce(db, { day, load: load(mk(t2)), hooks: 'https://discord.test/hook', now: t2 })
  assert.equal(out, 'posted'); assert.ok(!tweets[0].text.includes('Test Hitter One'))
  assert.ok(L.recentLog().some((e) => e.kind === 'slate' && e.state === 'HELD'))
  assert.ok(L.recentLog().some((e) => e.kind === 'slate' && e.state === 'DROPPED'))
})
await ok('post: the repeat guard -- a player a Slate named within 3 days (football 7) takes no seat; the next called player does', async () => {
  reset()
  const day = '2026-10-14'
  const db = fakeDb({ homer_feed_posts: [
    { day: '2026-10-12', kind: 'slate', x_post_id: '1', payload: { named: ['m1', 'n1', 'h1'], named_by_sport: { mlb: ['m1'], nfl: ['n1'], nhl: ['h1'], nba: [] } } },   // 2 days ago
    { day: '2026-10-09', kind: 'slate', x_post_id: '2', payload: { named: ['n2', 'm2'], named_by_sport: { mlb: ['m2'], nfl: ['n2'], nhl: [], nba: [] } } },              // 5 days ago
  ] })
  const sh = (iso) => iso.replace('2026-10-09', day)
  const board = mlbBoard().map((r) => ({ ...r, game_time: '2026-10-14T23:10:00Z' }))
  const week = nflWeek(); week.games[0].kickoff = '2026-10-14T23:15:00Z'
  const nhl = nhlGames(); nhl[0].game.startUtc = '2026-10-15T00:00:00Z'
  const now = Date.parse('2026-10-14T22:30:00Z')
  const sports = [MLB.mlbSlate({ rows: board }), NFL.nflSlate({ data: week, picks: nflPicks(), day, now }), NHL.nhlSlate({ games: nhl, now }), NBA.nbaSlate({ board: null, now })]
  const r = await S.postSlateOnce(db, { day, load: load(sports), hooks: '', now })
  assert.equal(r, 'posted')
  const text = tweets[0].text
  // named 2 days ago (any sport) -> out; named 5 days ago: a hitter may come back (3 days), a football player may not (7)
  for (const out of ['Test Hitter One', 'Test Back One', 'Test Skater One', 'Test Receiver Two']) assert.ok(!text.includes(out), `${out} was named too recently\n${text}`)
  assert.match(text, /CALL OF THE NIGHT\nTest Skater Two \(Montr[^)]*\)\ngoal scorer/)   // #2 of 300 is the smallest share left
  assert.match(text, /MLB  Test Hitter Two · home run/)
  assert.ok(!/^NFL /m.test(text))
  assert.match(text, /DASH · MOONSHOT · TUDDY · LAMP$/)                  // football still played: the pointer still lists TUDDY
})
const mkDay = (day) => {
  const week = nflWeek(); week.games[0].kickoff = `${day}T23:15:00Z`
  const nhl = nhlGames(); nhl[0].game.startUtc = `${day}T23:59:00Z`
  const now = Date.parse(`${day}T22:30:00Z`)
  const board = mlbBoard().map((r) => ({ ...r, game_time: `${day}T23:10:00Z` }))
  return { now, sports: [MLB.mlbSlate({ rows: board }), NFL.nflSlate({ data: week, picks: nflPicks(), day, now }), NHL.nhlSlate({ games: nhl, now }), NBA.nbaSlate({ board: null, now })] }
}
const slateRows = (db) => db.tables.homer_feed_posts.filter((r) => r.kind === 'slate')
await ok('post: a cap hold or the pause RELEASES the claim, Discord waits (no double post), and the next tick retries and posts both once', async () => {
  reset()
  const day = '2026-10-17'
  const full = Array.from({ length: 20 }, (_, i) => ({ day, kind: `list_mlb_x${i}`, x_post_id: String(100 + i), seen_at: `${day}T15:00:00Z` }))
  const a = mkDay(day)
  const db = fakeDb({ homer_feed_posts: full })
  const r = await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now })
  assert.match(r, /^retry: x daily cap/); assert.equal(tweets.length, 0); assert.equal(discords.length, 0)
  assert.equal(slateRows(db).length, 0, 'the claim is released')
  assert.ok(L.recentLog().some((e) => e.kind === 'slate' && e.state === 'DROPPED' && /daily cap/.test(e.reason)))
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now + 60e3 }), 'waiting')   // not asked again inside 5 minutes
  db.tables.homer_feed_posts.splice(0, 20)                      // the cap clears
  const r1 = await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now + 6 * 60e3 })
  assert.equal(r1, 'posted'); assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
  assert.ok(slateRows(db)[0].x_post_id)
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now + 12 * 60e3 }), 'already-posted')
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
  // the pause
  reset()
  process.env.X_POSTS_PAUSE = 'on'
  const day2 = '2026-10-20'
  const b = mkDay(day2)
  const db2 = fakeDb({ homer_feed_posts: [] })
  try {
    const r2 = await S.postSlateOnce(db2, { day: day2, load: load(b.sports), hooks: 'https://discord.test/h', now: b.now })
    assert.match(r2, /^retry: x paused/); assert.equal(tweets.length, 0); assert.equal(discords.length, 0); assert.equal(slateRows(db2).length, 0)
  } finally { delete process.env.X_POSTS_PAUSE }
  assert.equal(await S.postSlateOnce(db2, { day: day2, load: load(b.sports), hooks: 'https://discord.test/h', now: b.now + 6 * 60e3 }), 'posted')
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1)
})
await ok('post: a transient X error (429, 5xx) releases the claim and retries; a success is never released; a 4xx refusal keeps the claim (Discord only)', async () => {
  reset()
  const day = '2026-10-21'
  const a = mkDay(day)
  const db = fakeDb({ homer_feed_posts: [] })
  xFail = [429]
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now }), 'retry: x 429')
  assert.equal(discords.length, 0); assert.equal(slateRows(db).length, 0)
  xFail = [503]
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now + 6 * 60e3 }), 'retry: x 503')
  assert.equal(discords.length, 0)
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now + 12 * 60e3 }), 'posted')
  assert.equal(tweets.length, 1); assert.equal(discords.length, 1); assert.ok(slateRows(db)[0].x_post_id)
  // a refusal that is not transient is final
  reset()
  const day2 = '2026-10-22'
  const b = mkDay(day2)
  const db2 = fakeDb({ homer_feed_posts: [] })
  xFail = [403, 403]   // the long post is refused, then its 280 retry
  assert.equal(await S.postSlateOnce(db2, { day: day2, load: load(b.sports), hooks: 'https://discord.test/h', now: b.now }), 'posted (discord only)')
  assert.equal(slateRows(db2).length, 1); assert.equal(discords.length, 1)
  // after the first game has started the claim is not released any more (a late Slate is no use on X)
  reset()
  const day3 = '2026-10-23'
  const c = mkDay(day3)
  const db3 = fakeDb({ homer_feed_posts: [] })
  process.env.X_POSTS_PAUSE = 'on'
  try {
    const late = Date.parse(`${day3}T23:20:00Z`)         // MLB first pitch 23:10 has passed; the hockey game (23:59) has not
    const out = await S.postSlateOnce(db3, { day: day3, load: load(c.sports), hooks: 'https://discord.test/h', now: late })
    assert.ok(out === 'posted (discord only)' || /^none/.test(out), out)
    if (out === 'posted (discord only)') { assert.equal(slateRows(db3).length, 1); assert.equal(discords.length, 1) }
  } finally { delete process.env.X_POSTS_PAUSE }
})
await ok('post: deploy day -- a pregame / callofnight / thefour row with a real X id means the list is out today (no Slate); a skipped one does not', async () => {
  for (const [i, kind] of ['pregame', 'callofnight', 'thefour'].entries()) {
    reset()
    const day = `2026-10-${27 + i}`
    const a = mkDay(day)
    const db = fakeDb({ homer_feed_posts: [{ day, kind, x_post_id: '1234567890', payload: {} }] })
    assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: 'https://discord.test/h', now: a.now }), `already-posted (${kind} list)`)
    assert.equal(tweets.length, 0); assert.equal(discords.length, 0); assert.equal(slateRows(db).length, 0)
  }
  reset()
  const day = '2026-10-25'
  const a = mkDay(day)
  const db = fakeDb({ homer_feed_posts: [{ day, kind: 'pregame', x_post_id: 'skipped', payload: {} }] })
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: '', now: a.now }), 'posted')
})
await ok('post: the repeat guard is per sport -- an id another sport used does not hold a player out; the same sport still does', async () => {
  reset()
  const day = '2026-10-26'
  const a = mkDay(day)
  const db = fakeDb({ homer_feed_posts: [{ day: '2026-10-25', kind: 'slate', x_post_id: '9', payload: { named: ['m1'], named_by_sport: { mlb: [], nfl: ['m1'], nhl: [], nba: [] } } }] })
  assert.equal(await S.postSlateOnce(db, { day, load: load(a.sports), hooks: '', now: a.now }), 'posted')
  assert.ok(tweets[0].text.includes('Test Hitter One'), 'an NFL id equal to his MOONSHOT id does not block him')
  reset()
  const db2 = fakeDb({ homer_feed_posts: [{ day: '2026-10-25', kind: 'slate', x_post_id: '9', payload: { named: ['m1'], named_by_sport: { mlb: ['m1'], nfl: [], nhl: [], nba: [] } } }] })
  assert.equal(await S.postSlateOnce(db2, { day, load: load(a.sports), hooks: '', now: a.now }), 'posted')
  assert.ok(!tweets[0].text.includes('Test Hitter One'))
})
await ok('post: the words come from the registry -- CALLED is STATUS_WORD.called, character for character', () => {
  assert.equal(CS.STATUS_WORD.called, 'CALLED')
  const a = S.assembleSlate({ day: DAY, sports: sportsOf(), now: NOW })
  assert.match(a.text, /\nCALLED · /)
  assert.ok(!/'CALLED ·|`CALLED ·/.test(fs.readFileSync('lib/posts/slate.js', 'utf8')))
  assert.ok(!/s CALLED players/.test(fs.readFileSync('lib/dash/polls/build.js', 'utf8')))
})
await ok('post: POST_KINDS_ON -- on when the Slate or the kind it replaced (pregame) is listed, off when neither is', () => {
  process.env.POST_KINDS_ON = 'board,accountability'
  assert.equal(S.slateKindOn(), false)
  process.env.POST_KINDS_ON = 'board,pregame'
  assert.equal(S.slateKindOn(), true)
  process.env.POST_KINDS_ON = 'slate'
  assert.equal(S.slateKindOn(), true)
  delete process.env.POST_KINDS_ON
  assert.equal(S.slateKindOn(), true)
})
await ok('post: a slate row that exists is never re-claimed, and a day with nothing named claims nothing', async () => {
  reset()
  const db = fakeDb({ homer_feed_posts: [{ day: DAY, kind: 'slate', x_post_id: '1', payload: {} }] })
  PC.markTaken && 0
  assert.equal(await S.postSlateOnce(db, { day: DAY, load: async () => { throw new Error('must not load') }, hooks: '', now: NOW }), 'already-posted')
  reset()
  const empty = fakeDb({ homer_feed_posts: [] })
  const r = await S.postSlateOnce(empty, { day: '2026-10-19', load: load([MLB.mlbSlate({ rows: [] }), NFL.nflSlate({}), NHL.nhlSlate({}), NBA.nbaSlate({})]), hooks: '', now: NOW })
  assert.match(r, /^none/); assert.equal(empty.tables.homer_feed_posts.length, 0)
})

console.log(`\n${n} checks passed -- TEST data, fake fetch, fake database`)
