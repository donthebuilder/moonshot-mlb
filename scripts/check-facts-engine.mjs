#!/usr/bin/env node
// THE FACT ENGINE, v2 (fix23-facts-1009, 2026-10-09), checked on TEST DATA: made-up players ("Test ..."),
// made-up numbers, a fake database and a fake fetch. Nothing touches the network, X, Discord or a real table.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-facts-engine.mjs
import assert from 'node:assert/strict'
process.env.X_SCHEDULE_OFF = 'on'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' })
for (const k of ['X_POSTS_PAUSE', 'X_GUARDS_OFF', 'FACTS_AUTOPOST', 'ANTHROPIC_API_KEY', 'BUCKETS_PUBLIC']) delete process.env[k]
const tweets = []
let nextId = 9000
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets')) { tweets.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ data: { id: String(++nextId) } }), headers: { get: () => null } } }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}
const PL = await import('../lib/facts/players.js')
const CK = await import('../lib/facts/check.js')
const LB = await import('../lib/facts/label.js')
const WR = await import('../lib/facts/write.js')
const EN = await import('../lib/facts/engine.js')
const R = await import('../lib/routes.js')
const L = await import('../lib/dash/xPostLog.js')

let n = 0
const ok = async (name, fn) => { await fn(); n++; console.log(`ok  ${name}`) }
const TODAY = '2026-10-09'
const at = (hhmm) => Date.parse(`${TODAY}T${hhmm}:00Z`)
const START = at('23:00')
const P = (i, extra = {}) => ({ id: `T${i}`, name: `Test Player ${String.fromCharCode(64 + i)}`, team: 'AAA', opp: 'BBB', startMs: START, rank: i, score: 80 - i, gameDay: TODAY, ...extra })
const players = [1, 2, 3, 4].map((i) => P(i))
const BAD = /https?:|www\.|\.com|#\w|@\w|\bbot\b|%|\bodds\b|probab/i

// ── 1. each player family: honest numbers in, a clean 4-8 line post out ─────────────────────────────
const built = {
  p_streak: () => PL.streakFacts({ sport: 'mlb', players, streaks: [{ id: 'T1', what: 'a home run', whatKey: 'hr', n: 3 }, { id: 'T1', what: 'a hit', whatKey: 'hit', n: 7 }, { id: 'T9', what: 'a hit', whatKey: 'hit', n: 9 }], today: TODAY }),
  p_form: () => PL.formFacts({ sport: 'nhl', players, bars: [{ id: 'T2', label: '3+ shots', threshold: 3, cleared: 8, of: 10 }, { id: 'T3', label: '3+ shots', threshold: 3, cleared: 5, of: 10 }, { id: 'T4', label: '3+ shots', threshold: 3, cleared: 7, of: 7 }], today: TODAY }),
  p_birthday: () => PL.nflBirthdayFacts({ data: { players: [{ player_id: 'T1', birth_date: '1999-10-09' }, { player_id: 'T2', birth_date: '1999-10-10' }, { player_id: 'T9', birth_date: '1990-10-09' }] }, players, today: TODAY }),
  p_vs_team: () => PL.nflVsTeamFacts({ logs: { logs: { T1: { log: [{ s: 2024, opp: 'BBB', g_td: 1 }, { s: 2025, opp: 'BBB', g_td: 2 }, { s: 2025, opp: 'CCC', g_td: 1 }] }, T2: { log: [{ s: 2025, opp: 'BBB', g_td: 1 }] } } }, players, today: TODAY }),
  p_milestone: () => PL.nflMilestoneFacts({ countdowns: [{ player: { player_id: 'T1' }, stat: 'touchdowns', have: 9, next: 10, gap: 1, games: 4 }], players, today: TODAY }),
  p_vs_starter: () => PL.mlbVsStarterFacts({ rows: [{ player_id: 'T1', pitcher_name: 'Test Pitcher X', pitcher_team: 'BBB', pitcher_id: 77, bvp_ab: 8, bvp_hits: 4, bvp_hr: 2 }, { player_id: 'T2', pitcher_name: 'Test Pitcher Y', pitcher_team: 'BBB', bvp_ab: 3, bvp_hits: 3, bvp_hr: 1 }, { player_id: 'T3', pitcher_name: 'Test Pitcher Z', pitcher_team: 'BBB', bvp_ab: 9, bvp_hits: 2, bvp_hr: 0 }, { player_id: 'T4', pitcher_name: 'Test Pitcher W', pitcher_team: 'BBB', pitcher_projected: true, bvp_ab: 9, bvp_hits: 6, bvp_hr: 3 }], players, today: TODAY }),
}
const EXPECT = { p_streak: 1, p_form: 1, p_birthday: 1, p_vs_team: 1, p_milestone: 1, p_vs_starter: 1 }
for (const [fam, make] of Object.entries(built)) {
  await ok(`${fam}: builds only what the numbers support (${EXPECT[fam]}), and the post is clean`, async () => {
    const facts = make()
    assert.equal(facts.length, EXPECT[fam], fam)
    const f = facts[0]
    assert.deepEqual(f.named, [f.pid]); assert.ok(f.score >= EN.FACTS_CONFIG.minScore)
    const w = await EN.writeChecked(f)
    assert.ok(w.text, `${fam} was rejected: ${JSON.stringify(w.rejected)}`)
    const lines = w.text.split('\n')
    assert.ok(lines.length >= 4 && lines.length <= 8, `${lines.length} lines`)
    assert.equal(lines[0], `${R.BRAND[f.sport].icon} ${R.BRAND[f.sport].name} · ${LB.LABELS[fam]}`)
    assert.ok(!BAD.test(w.text), 'link / hashtag / bot / percent / odds'); assert.equal((w.text.match(new RegExp(f.player, 'g')) || []).length, 1, 'full name once')
    assert.ok(CK.checkShape(w.text, f).ok); assert.ok(CK.checkDraft(w.text, f).ok)
  })
}
await ok('the streak takes the LONGEST run per man and never names a man who is not on the slate', () => {
  const f = built.p_streak()[0]
  assert.equal(f.n, 7); assert.equal(f.whatKey, 'hit')
})
await ok('sport words come from the registry (POST_WORDS), not typed', () => {
  for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
    const f = PL.streakFacts({ sport, players, streaks: [{ id: 'T1', what: 'a goal', whatKey: 'goal', n: 3 }], today: TODAY })[0]
    assert.equal(f.market, R.POST_WORDS[sport].market); assert.ok(WR.templateDrafts(f)[0].includes(`Market: ${R.POST_WORDS[sport].market}.`))
  }
})
await ok('the checker still refuses what it must: a number or a name not in the fact, a missing label line, a link, 3 lines', () => {
  const f = built.p_streak()[0]
  const good = WR.templateDrafts(f)[0]
  assert.ok(CK.checkDraft(good, f).ok)
  assert.ok(!CK.checkDraft(good.replace('7 straight', '8 straight'), f).ok)
  assert.ok(!CK.checkDraft(good.replace('Test Player A', 'Test Player Q'), f).ok)
  assert.ok(!CK.checkShape(good.split('\n').slice(1).join('\n'), f).ok)
  assert.ok(!CK.checkShape(`${good}\nhttps://x.example`, f).ok)
  assert.ok(!CK.checkShape(good.split('\n').slice(0, 3).join('\n'), f).ok)
  assert.ok(!CK.checkShape(`${good}\n#MLB`, f).ok)
})

// ── 2. the birthday / vs-team / form guards ────────────────────────────────────────────────────────
await ok('birthday: only today in ET, age from the birth year; vs-team needs 2 meetings and a TD; form needs 7 of 8+', () => {
  const b = built.p_birthday()[0]; assert.equal(b.age, 27); assert.equal(b.born, 'Oct 9, 1999')
  const v = built.p_vs_team()[0]; assert.equal(v.tds, 3); assert.equal(v.meetings, 2); assert.equal(v.since, 2024)
  assert.deepEqual(built.p_form().map((f) => f.pid), ['T2'])
})
await ok('MLB head to head: needs 6+ AB, a real confirmed starter, and a real edge; a projected arm is never named', () => {
  assert.deepEqual(built.p_vs_starter().map((f) => f.pid), ['T1'])
})

// ── 3. the windows and the caps ───────────────────────────────────────────────────────────────────
await ok('windows: a daily sport opens 6h before its first game (not before 10:00 ET) and closes 45 min before it', () => {
  const w = EN.windowOf('nhl', { today: TODAY, firstStartMs: START, now: at('18:00') })
  assert.equal(w.close, START - 45 * 60e3); assert.ok(w.open >= at('14:00') && w.open <= START - 359 * 60e3)
  assert.ok(EN.windowOf('mlb', { today: TODAY, firstStartMs: NaN }).none)
})
await ok('NFL: a game day gets 3, a build-up day Tue-Sat gets 1 in the afternoon window, Sunday-with-no-game and Monday get none', () => {
  assert.equal(EN.capFor('nfl', false), 3); assert.equal(EN.capFor('nfl', true), 1); assert.equal(EN.capFor('mlb'), 3)
  const fri = Date.parse('2026-10-09T18:00:00Z')   // a Friday, 2pm ET
  const w = EN.windowOf('nfl', { today: TODAY, gameDay: '2026-10-11', now: fri })
  assert.ok(w.buildUp && w.open < w.close)
  assert.ok(EN.windowOf('nfl', { today: '2026-10-12', gameDay: '2026-10-18', now: Date.parse('2026-10-12T18:00:00Z') }).none, 'Monday')
  assert.ok(EN.windowOf('nfl', { today: '2026-10-11', gameDay: '2026-10-11', firstStartMs: Date.parse('2026-10-11T17:00:00Z'), now: Date.parse('2026-10-11T14:00:00Z') }).open)
})

// ── 4. the repeat guard reads fact_posts: same man 3 days (NFL 7), a club too ─────────────────────────
await ok('repeat: the same man within 3 days is blocked (NFL 7); the 49ers\' 3-0 then 4-0 four days apart is blocked in the NFL', () => {
  const recent = [{ day: '2026-10-08', sport: 'mlb', status: 'posted', fact: { named: ['T1'] } }, { day: '2026-10-03', sport: 'nfl', status: 'posted', fact: { named: ['N1'] } }, { day: '2026-10-05', sport: 'nfl', status: 'posted', fact: { sport: 'nfl', teams: [{ code: 'SF' }] } }, { day: '2026-10-08', sport: 'mlb', status: 'rejected', fact: { named: ['T2'] } }]
  assert.deepEqual(EN.repeatBlocked({ sport: 'mlb', named: ['T1'] }, recent, TODAY), ['T1'])
  assert.deepEqual(EN.repeatBlocked({ sport: 'mlb', named: ['T2'] }, recent, TODAY), [], 'a rejected row never reached X')
  assert.deepEqual(EN.repeatBlocked({ sport: 'nfl', named: ['N1'] }, recent, TODAY), ['N1'], '6 days ago, NFL window is 7')
  assert.deepEqual(EN.repeatBlocked({ sport: 'nfl', named: ['team:nfl:SF'] }, recent, TODAY), ['team:nfl:SF'])
  assert.deepEqual(EN.repeatBlocked({ sport: 'nhl', named: ['T1'] }, recent, TODAY), [], 'another sport')
})

// ── 5. the engine end to end, on a fake database ────────────────────────────────────────────────────
function fakeDb(rows = []) {
  const flags = [{ key: 'facts_autopost', value: 'on' }]
  const table = { fact_posts: rows, dash_flags: flags, homer_feed_posts: [], nfl_td_feed: [] }
  class Q {
    constructor(name) { this.name = name; this.op = 'select'; this.opts = {} }
    select(_c, o = {}) { this.opts = o; return this }
    eq(c, v) { this.eqs = { ...(this.eqs || {}), [c]: v }; return this }
    gte() { return this } lt() { return this } lte() { return this } not() { return this } in() { return this } order() { return this } is() { return this }
    maybeSingle() { this.single = true; return this }
    upsert(r, o) { this.op = 'upsert'; this.r = r; this.o = o; return this }
    update(p) { this.op = 'update'; this.p = p; return this }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej) }
    run() {
      const t = table[this.name] || []
      if (this.op === 'upsert') { const made = []; for (const r of this.r) { if (t.some((x) => x.id === r.id)) continue; t.push({ ...r }); made.push({ id: r.id }) } return { data: made, error: null } }
      if (this.op === 'update') { t.filter((x) => x.id === this.eqs?.id).forEach((x) => Object.assign(x, this.p)); return { data: [], error: null } }
      let hit = t
      if (this.eqs) hit = hit.filter((r) => Object.entries(this.eqs).every(([k, v]) => r[k] === v))
      if (this.single) return { data: hit[0] || null, error: null }
      return { data: this.opts.head ? null : hit, count: this.opts.count ? (this.name === 'fact_posts' ? hit.filter((r) => r.status === 'posted' && r.x_post_id).length : 0) : null, error: null }
    }
  }
  return { rows, from: (name) => new Q(name) }
}
const mkRead = (map) => async (sport) => map[sport] || { sport, active: false, why: 'no games', facts: [], errors: [], window: { none: 'x' } }
const readOf = (sport, facts, extra = {}) => ({ sport, active: true, why: null, gameDay: TODAY, facts, errors: [], window: { open: at('15:00'), close: at('22:00') }, ...extra })
const NOW = at('17:00')
const mlbFacts = () => built.p_streak()
await ok('engine: posts the best fact of an active sport inside its window, writes the row, counts it, and logs it', async () => {
  tweets.length = 0; L._resetLogForTests()
  const db = fakeDb()
  const out = await EN.runFacts(db, { now: NOW, read: mkRead({ mlb: readOf('mlb', mlbFacts()) }) })
  assert.ok(out.posted?.x, JSON.stringify(out)); assert.equal(tweets.length, 1)
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].status, 'posted'); assert.equal(db.rows[0].sport, 'mlb')
  assert.ok(L.recentLog().some((e) => e.state === 'POSTED' && e.kind === 'facts' && e.sport === 'mlb'))
  assert.equal(out.sports.mlb.found, 1)
})
await ok('engine: a sport with nothing to say posts nothing and the report says why', async () => {
  tweets.length = 0
  const out = await EN.runFacts(fakeDb(), { now: NOW, read: mkRead({ nhl: { sport: 'nhl', active: true, why: null, gameDay: TODAY, facts: [], errors: [], window: { open: at('15:00'), close: at('22:00') } } }) })
  assert.equal(tweets.length, 0); assert.equal(out.sports.nhl.held, 'nothing honest to say today'); assert.equal(out.sports.mlb.active, false)
})
await ok('engine: outside the window, nothing; at the sport\'s cap (3), nothing; inside 90 min of its last post, nothing', async () => {
  tweets.length = 0
  const f = mlbFacts()
  assert.equal((await EN.runFacts(fakeDb(), { now: at('12:00'), read: mkRead({ mlb: readOf('mlb', f) }) })).sports.mlb.held, 'outside the posting window')
  const done = (i, min) => ({ id: `old${i}`, day: TODAY, sport: 'mlb', status: 'posted', x_post_id: `${i}`, posted_at: new Date(at('10:00') + min * 60e3).toISOString(), fact: { named: [`Z${i}`] } })
  const three = await EN.runFacts(fakeDb([done(1, 0), done(2, 100), done(3, 200)]), { now: at('19:00'), read: mkRead({ mlb: readOf('mlb', f) }) })
  assert.match(three.sports.mlb.held, /3 fact posts already today/)
  const soon = await EN.runFacts(fakeDb([done(1, 400)]), { now: at('17:30'), read: mkRead({ mlb: readOf('mlb', f) }) })
  assert.match(soon.sports.mlb.held || soon.skipped, /under (45|90) min ago/)
  assert.equal(tweets.length, 0)
})
await ok('engine: a man named 2 days ago is not named again; a stored fact id is never re-posted', async () => {
  tweets.length = 0
  const f = mlbFacts()
  const prior = [{ id: 'older', day: '2026-10-07', sport: 'mlb', status: 'posted', x_post_id: '5', posted_at: '2026-10-07T20:00:00Z', fact: { named: ['T1'] } }]
  const out = await EN.runFacts(fakeDb(prior), { now: NOW, read: mkRead({ mlb: readOf('mlb', f) }) })
  assert.equal(tweets.length, 0); assert.deepEqual(out.sports.mlb.repeats, ['T1'])
  const same = await EN.runFacts(fakeDb([{ id: f[0].id, day: '2026-10-08', sport: 'mlb', status: 'rejected', fact: {} }]), { now: NOW, read: mkRead({ mlb: readOf('mlb', f) }) })
  assert.equal(same.sports.mlb.seen, 1); assert.equal(tweets.length, 0)
})
await ok('engine: the kill switch, the X pause and the daily cap all hold it; a dry run posts and writes nothing', async () => {
  tweets.length = 0
  const f = mlbFacts()
  const off = fakeDb(); off.from('dash_flags'); off.rows.length = 0
  const offDb = fakeDb(); const flagRows = []; const orig = offDb.from; offDb.from = (n) => (n === 'dash_flags' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'off' }, error: null }) }) }) } : orig(n))
  assert.match((await EN.runFacts(offDb, { now: NOW, read: mkRead({ mlb: readOf('mlb', f) }) })).skipped, /autopost off/); void flagRows
  process.env.X_POSTS_PAUSE = 'on'
  const paused = await EN.runFacts(fakeDb(), { now: NOW, read: mkRead({ mlb: readOf('mlb', f) }) })
  delete process.env.X_POSTS_PAUSE
  assert.match(paused.skipped, /gate/)
  const db = fakeDb()
  const dry = await EN.runFacts(db, { now: NOW, dry: true, read: mkRead({ mlb: readOf('mlb', f) }) })
  assert.equal(tweets.length, 0); assert.equal(db.rows.length, 0); assert.equal(dry.tried.length, 1); assert.ok(dry.tried[0].text)
})
await ok('engine: a reader that throws is reported, not swallowed (out.errors)', async () => {
  const out = await EN.runFacts(fakeDb(), { now: NOW, dry: true, read: async (sport) => ({ sport, active: false, why: 'x', facts: [], errors: [`${sport} team standings: boom`], window: { none: 'x' } }) })
  assert.ok(out.errors.some((e) => /boom/.test(e)))
})
await ok('no fact post ever carries a Source line (Donovan 10-10): compose() drops it for every sport, even when the fact has a via', async () => {
  const L = await import('../lib/facts/label.js')
  for (const sport of ['nfl', 'mlb', 'nhl', 'nba']) {
    const fact = L.decorate({ sport, family: 'p_streak', named: [] })
    const text = L.compose(fact, ['Test Player has a point in 5 straight games.'])
    assert.ok(fact.via, 'the fact still records where it came from')
    assert.ok(!/source/i.test(text) && !/nflverse|stats api|api-web/i.test(text), `${sport}: ${text}`)
  }
})
console.log(`\n${n} checks passed`)
