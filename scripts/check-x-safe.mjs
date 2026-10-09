#!/usr/bin/env node
// THE X SAFE FIXES (stage 3 piece 1, 2026-10-09), checked on TEST DATA: made-up rows,
// ids and names (all labelled "Test ..."), a fake database, and a fake fetch. Nothing here
// touches the network, X, Discord or a real database.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-x-safe.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── the environment, BEFORE any module reads it ─────────────────────────────
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.example'
Object.assign(process.env, { X_API_KEY: 'TEST', X_API_SECRET: 'TEST', X_ACCESS_TOKEN: 'TEST', X_ACCESS_SECRET: 'TEST' })
for (const k of ['X_LINKS_EMERGENCY', 'X_LINK_KINDS', 'X_POST_LINK', 'X_POSTS_PAUSE', 'X_GUARDS_OFF', 'X_DAILY_CAP', 'POST_KINDS_ON', 'DISCORD_MLB_WEBHOOKS', 'DISCORD_HOMER_WEBHOOK']) delete process.env[k]

// ── a fake fetch: X's tweet endpoint records the body and answers with an id ─
const tweets = []
let nextId = 9000
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('api.x.com/2/tweets')) {
    const body = JSON.parse(opts.body)
    tweets.push(body)
    return { ok: true, status: 200, json: async () => ({ data: { id: String(++nextId) } }), headers: { get: () => null } }
  }
  return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } }
}

const P = await import('../lib/dash/xPolicy.js')
const G = await import('../lib/dash/xGate.js')
const B = await import('../lib/dash/xBudget.js')
const N = await import('../lib/dash/namingChecks.js')
const L = await import('../lib/dash/xPostLog.js')
const TL = await import('../lib/dash/threadsLink.js')
const PL = await import('../lib/dash/postLink.js')
const X = await import('../lib/dash/xPost.js')
const LS = await import('../lib/dash/longshotsPost.js')
const Q = await import('../lib/dash/quoteFor.js')
const HF = await import('../lib/dash/homerFeed.js')
const HS = await import('../lib/nhl/hardestShot.js')
const NFLTF = await import('../lib/nfl/tweetFeed.js')
const PC = await import('../lib/dash/postClaim.js')

let n = 0
const results = []
const ok = async (name, fn) => { await fn(); n++; results.push(name); console.log(`ok  ${name}`) }
const reset = () => { tweets.length = 0; L._resetLogForTests(); G._resetRecentCache() }

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
const seenAt = (hhmmUtc, day = today) => `${day}T${hhmmUtc}:00Z`   // 2026-10-09 15:00Z = 11:00 ET

// ═══ 1. NO LINKS ANYWHERE ON X ═══════════════════════════════════════════════
await ok('links: xLinkFor is empty for every linked kind and every other kind, with the env unset', () => {
  for (const k of [...TL.linkedKinds(), 'td', 'homer', 'nhlgoal', 'nba30', 'writeup', 'facts', 'list_mlb', 'numerology', 'botpoll', 'whatever']) assert.equal(TL.xLinkFor(k, { playerId: 'T1' }), '', k)
})
await ok('links: the old opt-out env can no longer turn them on; only the emergency switch can', () => {
  process.env.X_LINK_KINDS = '1'
  assert.equal(TL.xLinkFor('pregame'), '')
  delete process.env.X_LINK_KINDS
  process.env.X_LINKS_EMERGENCY = 'on'
  assert.match(TL.xLinkFor('pregame'), /https:\/\/test\.example/)   // an emergency, by name
  delete process.env.X_LINKS_EMERGENCY
  assert.equal(TL.xLinkFor('pregame'), '')
})
await ok('links: the post tail (site + handle) is empty even with X_POST_LINK=1 and a site', () => {
  process.env.X_POST_LINK = '1'
  for (const k of ['pregame', 'board', 'accountability', 'nfl_board']) assert.deepEqual(PL.tailFor(k, { site: 'https://test.example/x', handle: '@test' }), { site: '', handle: '' }, k)
  delete process.env.X_POST_LINK
})
await ok('links: postToX sends no URL for any kind, linked or not (fake fetch)', async () => {
  reset()
  for (const k of [...TL.linkedKinds(), 'td', 'writeup', 'facts', null]) await X.postToX('TEST post body', { kind: k, link: { playerId: 'T1' } })
  assert.ok(tweets.length >= 10)
  for (const t of tweets) assert.ok(!/https?:\/\/|test\.example|dashnetwork/i.test(t.text), t.text)
  for (const t of tweets) assert.equal(t.text, 'TEST post body')
})
await ok('links: a URL a builder wrote into its own text is cut before it is sent', async () => {
  reset()
  await X.postToX('TEST line\nsee https://test.example/app#sport=nhl&tab=shotmap\nTEST end', { kind: 'nhlhardest' })
  await X.postToX('TEST x\ndashnetwork.vercel.app/app', { kind: 'x' })
  assert.equal(tweets[0].text, 'TEST line\nsee\nTEST end')
  assert.equal(tweets[1].text, 'TEST x')
})
await ok('links: the hardest-shot text carries no URL line any more', () => {
  const t = HS.hardestText({ mph: 99.9, name: 'Test Skater', row: { team: 'TST', shot_type: 'slap', result: 'goal', period: 2, period_type: 'REG' }, opp: 'OPP', avg: 80, leagueAvg: 70 })
  assert.ok(!/http|vercel|tab=shotmap/.test(t), t)
  assert.match(t, /^⚡ HARDEST SHOT OF THE NIGHT/)
})
await ok('links: no hashtags in any post this piece builds', () => {
  const t = HF.pregameText([{ player_id: '1', name: 'Test Alpha', team: 'AAA' }], { day: today })
  assert.ok(!/#[A-Za-z]/.test(t))
})
await ok('links: Moonshot text is character-identical but for the removed link block (before/after, TEST data)', async () => {
  // BEFORE = origin/main 7bf7897 with NEXT_PUBLIC_SITE_URL set (captured from the fetch body); AFTER = now.
  const before = {
    pregame: "🌙 THE CALLED SHOTS\n\n1. Test Alpha (AAA) vs Test Arm 1.50 HR/9 L3 · +250\n2. Test Bravo (BBB) vs Test Two\n3. Test Charlie (CCC)\n\nTonight's board is public before first pitch.\nhttps://test.example/app?utm_source=x&utm_medium=social&utm_campaign=pregame#sport=mlb&tab=home",
    longshots: "🎯 LONGSHOTS · HOME RUN\n+500 or longer, by our model score:\n\nTest Alpha (AAA) +600 · 71 · CALLED\nTest Bravo (BBB) +700 · 65\nTest Charlie (CCC) +550 · 60\n\nPrices, not picks. Full list on the site.\n\nEvery long price tonight, beside the model.",
  }
  const picks = [
    { player_id: '1', name: 'Test Alpha', team: 'AAA', pitcher: 'Test Arm', pitcher_l3_hr9: 1.5, odds_over: 250, odds_book: 'TestBook' },
    { player_id: '2', name: 'Test Bravo', team: 'BBB', pitcher: 'Test Two', pitcher_l3_hr9: null },
    { player_id: '3', name: 'Test Charlie', team: 'CCC' },
  ]
  const pre = HF.pregameText(picks, { day: today })
  const ls = LS.longshotsText({ sport: 'mlb', market: 'home run', longAt: 500, date: today, rows: [
    { id: '1', name: 'Test Alpha', team: 'AAA', median: 600, score: 71.2, status: 'called' },
    { id: '2', name: 'Test Bravo', team: 'BBB', median: 700, score: 65.4, status: 'board' },
    { id: '3', name: 'Test Charlie', team: 'CCC', median: 550, score: 60.1, status: 'board' },
  ] }, Date.parse('2026-10-09T12:00:00Z'))
  reset()
  await X.postToX(pre, { kind: 'pregame' })
  await X.postToX(ls, { kind: 'longshots' })
  assert.equal(tweets[0].text, before.pregame.slice(0, before.pregame.indexOf("\n\nTonight's board is public")))
  assert.equal(tweets[0].text, pre)
  assert.equal(tweets[1].text, before.longshots.slice(0, before.longshots.indexOf('\n\nEvery long price')))
  assert.equal(tweets[1].text, ls)
})

// ═══ 2. THE CAP: every kind counted or exempt per the table ═════════════════
const EXPECT = {
  // exempt: live CALLED alerts and the boards
  homer: 'called', td: 'called', nhlgoal: 'called', nba30: 'called', board: 'board', nfl_board: 'board', nhl_board: 'board',
  // slate
  pregame: 'slate', callofnight: 'slate', thefour: 'slate', nfl_callsheet_reply: 'slate',
  // write-ups and the receipts
  call_12345: 'writeup', writeup: 'writeup', writeup_nfl_401: 'writeup', writeup_nhl_2025: 'writeup', accountability: 'writeup', recap: 'writeup', weekly: 'writeup', monthly: 'writeup', board_results: 'writeup', nfl_results: 'writeup', nfl_bigweek: 'writeup',
  // facts
  facts: 'fact', longshots: 'fact', nfl_longshots: 'fact', nhl_longshots: 'fact', list_mlb: 'fact', list_nfl: 'fact', list_nhl: 'fact', multi_club: 'fact', nfl_multi_club: 'fact', nhl_multi_club: 'fact', nhlhardest: 'fact',
  nfl_whyboard: 'fact', nfl_spotlight: 'fact', nfl_redzone: 'fact', nfl_goalline: 'fact', nfl_tdhistory: 'fact', nfl_milestone: 'fact', matchup_hr: 'fact', pairswatch: 'fact', hotcontact: 'fact', hot_week: 'fact', storylines: 'fact', history_watch: 'fact', mlbhr_reply: 'fact', story_t3: 'fact', homer_board_reply: 'fact', brand_new_kind: 'fact',
  // polls and numerology
  botpoll: 'poll', community_pick: 'poll', nfl_botpoll: 'poll', nfl_community: 'poll', numerology: 'numerology',
}
await ok('cap: every kind is classified as the table says (an unlisted kind counts as a fact)', () => {
  for (const [k, tier] of Object.entries(EXPECT)) assert.equal(P.tierOf(k), tier, k)
})
await ok('cap: the exempt kinds are exactly CALLED alerts and the boards, and nothing else', () => {
  const exempt = Object.keys(EXPECT).filter((k) => P.isCapExempt(k)).sort()
  assert.deepEqual(exempt, ['board', 'homer', 'nba30', 'nfl_board', 'nhl_board', 'nhlgoal', 'td'])
  assert.equal(P.X_POLICY.dailyCap, 20)
})
await ok('cap: priority order near the cap -- numerology stops first, then polls, facts, write-ups, the slate; CALLED and boards never', () => {
  const stopsAt = (kind) => { for (let used = 0; used < 40; used++) if (!P.capAllows(kind, used)) return used; return Infinity }
  const order = ['numerology', 'nfl_botpoll', 'longshots', 'call_1', 'pregame'].map(stopsAt)
  assert.deepEqual(order, [12, 14, 16, 18, 20])
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  assert.equal(stopsAt('homer'), Infinity); assert.equal(stopsAt('td'), Infinity); assert.equal(stopsAt('board'), Infinity); assert.equal(stopsAt('nfl_board'), Infinity)
  assert.deepEqual(P.TIERS.map((t) => t.tier), ['called', 'board', 'slate', 'writeup', 'fact', 'poll', 'numerology'])
})
await ok('cap: the day count includes every non-exempt kind, the facts and the NFL replies; not alerts, not boards, not dry/skipped', async () => {
  const db = fakeDb({
    homer_feed_posts: [
      { day: today, kind: 'pregame', x_post_id: '1', seen_at: seenAt('15:00') },
      { day: today, kind: 'list_nhl', x_post_id: '2', seen_at: seenAt('16:00') },
      { day: today, kind: 'longshots', x_post_id: '3', seen_at: seenAt('16:30') },
      { day: today, kind: 'multi_club', x_post_id: '4', seen_at: seenAt('17:00') },
      { day: today, kind: 'nhlhardest', x_post_id: '5', seen_at: seenAt('17:30') },
      { day: today, kind: 'numerology', x_post_id: '6', seen_at: seenAt('18:00') },
      { day: today, kind: 'board', x_post_id: '7', seen_at: seenAt('18:10') },          // exempt
      { day: today, kind: 'nfl_board', x_post_id: '8', seen_at: seenAt('18:20') },     // exempt
      { day: today, kind: 'writeup_nhl_1', x_post_id: 'dry', seen_at: seenAt('18:30') }, // never reached X
      { day: today, kind: 'call_9', x_post_id: 'skipped', seen_at: seenAt('18:40') },
      { day: '2026-10-08', kind: 'accountability', x_post_id: '9', seen_at: seenAt('12:00') }, // yesterday's grades, posted at 8am ET today
      { day: today, kind: 'accountability', x_post_id: '10', seen_at: seenAt('02:00') },        // 10pm ET YESTERDAY: not today
    ],
    homer_feed: [{ day: today, x_post_id: '11' }], nfl_td_feed: [{ day: today, x_post_id: '12', on_bot: { rank: 1 }, reply_x_post_id: '13' }, { day: today, x_post_id: '14' }], lamp_goal_feed: [{ day: today, x_post_id: '15' }],
    fact_posts: [{ day: today, x_post_id: '16', posted_at: seenAt('19:00') }],
  })
  // pregame, list_nhl, longshots, multi_club, nhlhardest, numerology, accountability (8am ET) = 7; + 1 fact + 1 reply = 9
  assert.equal(await B.xPostsToday(db, today), 9)
})
await ok('cap: before the reply-id column exists the replies are still counted (estimated, never zero)', async () => {
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], __noReplyCol: true, nfl_td_feed: [{ day: today, x_post_id: '1', on_bot: { rank: 1 } }, { day: today, x_post_id: '2', on_bot: null }] })
  assert.equal(await B.xPostsToday(db, today), 1)
})
await ok('cap: the ET day is the day a post was made, across the DST change', () => {
  assert.deepEqual(B.etDayWindow('2026-10-09'), ['2026-10-09T04:00:00.000Z', '2026-10-10T04:00:00.000Z'])
  assert.deepEqual(B.etDayWindow('2026-11-01'), ['2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'])
})
await ok('cap: admit() lets a CALLED/board kind through at any count and holds the lower tiers as the day fills', async () => {
  const rows = []
  const db = fakeDb({ homer_feed_posts: rows, fact_posts: [], nfl_td_feed: [] })
  for (let i = 0; i < 12; i++) rows.push({ day: today, kind: `list_${i}`, x_post_id: String(100 + i), seen_at: seenAt('15:00') })
  assert.equal((await G.admit(db, { day: today, kind: 'numerology', repeat: false })).state, 'capped')   // 12 of 20: numerology is out
  assert.equal((await G.admit(db, { day: today, kind: 'nfl_botpoll', repeat: false })).state, 'go')
  for (let i = 12; i < 20; i++) rows.push({ day: today, kind: `list_${i}`, x_post_id: String(100 + i), seen_at: seenAt('15:00') })
  assert.equal((await G.admit(db, { day: today, kind: 'pregame', repeat: false })).state, 'capped')      // 20 of 20: even the slate waits
  assert.equal((await G.admit(db, { day: today, kind: 'homer' })).state, 'go')
  assert.equal((await G.admit(db, { day: today, kind: 'board' })).state, 'go')
})
await ok('cap: the emergency switches work (pause = no scheduled posts, CALLED still go)', async () => {
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  process.env.X_POSTS_PAUSE = 'on'
  assert.equal((await G.admit(db, { day: today, kind: 'pregame', repeat: false })).state, 'capped')
  assert.equal((await G.admit(db, { day: today, kind: 'homer' })).state, 'go')
  delete process.env.X_POSTS_PAUSE
})

// ── every send site goes through the gate (static: no postToX without xOk / admit / exemption) ──
await ok('cap: every scheduled postToX call site is behind the gate, and the cap is not env-tunable', () => {
  const read = (f) => fs.readFileSync(f, 'utf8')
  for (const f of ['app/api/dash/homers/tick/route.js', 'app/api/dash/nfl/tick/route.js', 'lib/writeups/post.js', 'lib/facts/engine.js', 'lib/dash/longshotsPost.js', 'lib/dash/storyThread.js']) {
    const src = read(f)
    assert.ok(/xOk\(|admit\(|xDailyAllows\(|xAllows\(/.test(src), `${f} has no gate`)
  }
  assert.ok(!/X_DAILY_CAP/.test(read('lib/dash/xBudget.js').replace(/\/\/.*$/gm, '')), 'the cap must not read an env var')
  // postOnce (longshots, lists, 2+ club, hardest shot) gates inside, once
  assert.match(read('lib/dash/longshotsPost.js'), /gated/)
  // the live alerts (homer / td / goal / nba30) are not gated: the exempt kinds
  for (const k of ['homer', 'td', 'nhlgoal', 'nba30']) assert.ok(P.isCapExempt(k))
})

// ═══ 3. REPEAT GUARD ═════════════════════════════════════════════════════════
await ok('repeat: 3 days for MLB/NHL kinds, 7 for NFL', () => {
  assert.equal(P.repeatWindowDays('pregame'), 3); assert.equal(P.repeatWindowDays('list_nhl'), 3); assert.equal(P.repeatWindowDays('nhl_longshots'), 3)
  for (const k of ['nfl_milestone', 'nfl_longshots', 'list_nfl', 'nfl_redzone', 'writeup_nfl_401']) assert.equal(P.repeatWindowDays(k), 7, k)
})
await ok('repeat: boundary days -- named D-1 and D-2 are blocked at 3 days; D-3 may be named again', () => {
  const recent = [{ day: '2026-10-08', payload: { named: ['a'] } }, { day: '2026-10-07', payload: { named: ['b'] } }, { day: '2026-10-06', payload: { named: ['c'] } }, { day: '2026-10-10', payload: { named: ['future'] } }]
  const set = P.recentNamedIds(recent, { day: today, windowDays: 3 })
  assert.deepEqual([...set].sort(), ['a', 'b'])
  const nfl = P.recentNamedIds([{ day: '2026-10-03', payload: { named: ['x'] } }, { day: '2026-10-02', payload: { named: ['y'] } }], { day: today, windowDays: 7 })
  assert.deepEqual([...nfl], ['x'])   // 6 days ago blocked, 7 days ago free
})
await ok('repeat: ids come from `named`, else every legacy payload shape', () => {
  assert.deepEqual(P.namedIdsOf({ named: ['1', 2], picks: [{ player_id: '9' }] }), ['1', '2'])   // named wins: it is exactly who the text named
  assert.deepEqual(P.namedIdsOf({ picks: [{ player_id: '1' }, { player_id: '2' }] }).sort(), ['1', '2'])
  assert.deepEqual(P.namedIdsOf({ rows: [{ id: '3' }], players: [{ id: '4' }], pick: { player_id: '5' }, player_id: '6' }).sort(), ['3', '4', '5', '6'])
  assert.deepEqual(P.namedInText({ rows: [{ id: '1', name: 'Test One' }, { id: '2', name: 'Test Two' }] }, 'Test One (AAA)'), ['1'])
})
await ok('repeat: the guard reads same-kind posts that reached X; call_* is one family; dry/skipped rows do not count', async () => {
  G._resetRecentCache()
  const db = fakeDb({ homer_feed_posts: [
    { day: '2026-10-08', kind: 'list_nhl', x_post_id: '1', payload: { named: ['p1'] } },
    { day: '2026-10-07', kind: 'list_nhl', x_post_id: 'skipped', payload: { named: ['p2'] } },
    { day: '2026-10-08', kind: 'longshots', x_post_id: '2', payload: { named: ['p3'] } },
    { day: '2026-10-08', kind: 'call_100', x_post_id: '3', payload: { named: ['p4'] } },
    { day: '2026-10-08', kind: 'callofnight', x_post_id: '4', payload: { named: ['p5'] } },
  ] })
  assert.deepEqual(await G.repeatCheck(db, { day: today, kind: 'list_nhl', ids: ['p1', 'p2', 'p3'] }), ['p1'])
  G._resetRecentCache()
  assert.deepEqual(await G.repeatCheck(db, { day: today, kind: 'call_200', ids: ['p4', 'p5'] }), ['p4'])   // another game's call, same family; not callofnight
})
await ok('repeat: live CALLED alerts, the night receipt (accountability, recap), the other receipts and the board are exempt', async () => {
  G._resetRecentCache()
  const db = fakeDb({ homer_feed_posts: [{ day: '2026-10-08', kind: 'accountability', x_post_id: '1', payload: { named: ['p1'] } }, { day: '2026-10-08', kind: 'homer', x_post_id: '1', payload: { named: ['p1'] } }] })
  for (const k of ['accountability', 'recap', 'weekly', 'monthly', 'board_results', 'nfl_results', 'homer', 'td', 'nhlgoal', 'board', 'nfl_board']) {
    assert.ok(P.isRepeatExempt(k), k)
    assert.deepEqual(await G.repeatCheck(db, { day: today, kind: k, ids: ['p1'] }), [], k)
  }
  for (const k of ['pregame', 'list_nhl', 'nhl_longshots', 'nfl_milestone', 'callofnight', 'longshots']) assert.ok(!P.isRepeatExempt(k), k)
})
await ok('repeat: postOnce -- a list that names a man named yesterday does not go to X; a fresh one does; the row keeps who was named', async () => {
  reset()
  const day = '2026-10-09'
  const db = fakeDb({ homer_feed_posts: [{ day: '2026-10-08', kind: 'list_nhl', x_post_id: '77', payload: { named: ['p1'] } }], fact_posts: [], nfl_td_feed: [] })
  const stale = { text: 'TEST LIST\nTest One (AAA)\nTest Two (BBB)', payload: { list: 'point_every_game', rows: [{ id: 'p1', name: 'Test One' }, { id: 'p2', name: 'Test Two' }] } }
  const out = await LS.postOnce(db, { day, kind: 'list_nhl', sport: 'nhl', build: async () => stale })
  assert.equal(out, 'posted')
  assert.equal(tweets.length, 0, 'the repeat must not reach X')
  assert.ok(L.recentLog().some((e) => e.state === 'DROPPED' && /repeat/.test(e.reason)))
  const row = db.tables.homer_feed_posts.find((r) => r.day === day)
  assert.deepEqual(row.payload.named.sort(), ['p1', 'p2'])
  reset()
  const fresh = { text: 'TEST LIST\nTest Three (CCC)', payload: { list: 'goal_streak', rows: [{ id: 'p3', name: 'Test Three' }] } }
  assert.equal(await LS.postOnce(db, { day: '2026-10-10', kind: 'list_nhl', sport: 'nhl', build: async () => fresh }), 'posted')
  assert.equal(tweets.length, 1)
})
await ok('repeat: postOnce asks the builder again WITHOUT the repeated man (longshots) and posts the rebuilt text', async () => {
  reset()
  const day = '2026-10-11'
  const db = fakeDb({ homer_feed_posts: [{ day: '2026-10-10', kind: 'longshots', x_post_id: '5', payload: { named: ['1'] } }], fact_posts: [], nfl_td_feed: [] })
  const far = new Date(Date.now() + 6 * 3600e3).toISOString()
  const body = { sport: 'mlb', market: 'home run', longAt: 500, date: day, rows: ['1', '2', '3', '4', '5'].map((id, i) => ({ id, name: `Test ${id}`, team: 'TST', median: 600 + i, score: 70 - i, status: 'board', startsAt: far })) }
  const out = await LS.postOnce(db, { day, kind: 'longshots', sport: 'mlb', build: async ({ exclude } = {}) => LS.longshotsBuild(body, { sport: 'mlb', exclude }) })
  assert.equal(out, 'posted')
  assert.equal(tweets.length, 1)
  assert.ok(!/Test 1 \(/.test(tweets[0].text) && /Test 2 \(/.test(tweets[0].text), tweets[0].text)
})
await ok('repeat: the NFL milestone exclusion path runs without data (no throw)', () => {
  const logs = null
  const picks = NFLTF.milestonePicks(logs, { players: [] }, { exclude: new Set(['x']) })
  assert.deepEqual(picks, [])   // (no data: no picks; the exclusion path must not throw)
})

// ═══ 4. PRE-NAMING CHECKS: hold, then drop ═══════════════════════════════════
await ok('naming: hold until 30 minutes before the start, then drop', () => {
  const start = Date.parse('2026-10-09T23:00:00Z')
  const pend = [{ id: 'p1', reason: 'lineup not posted' }]
  assert.equal(P.holdOrDrop({ pending: [], startMs: start, now: start }).state, 'go')
  assert.equal(P.holdOrDrop({ pending: pend, startMs: start, now: start - 3 * 3600e3 }).state, 'held')
  assert.equal(P.holdOrDrop({ pending: pend, startMs: start, now: start - 31 * 60e3 }).state, 'held')
  assert.equal(P.holdOrDrop({ pending: pend, startMs: start, now: start - 30 * 60e3 }).state, 'dropped')
  assert.equal(P.holdOrDrop({ pending: pend, startMs: start, now: start + 1 }).state, 'dropped')
  assert.equal(P.holdOrDrop({ pending: pend, startMs: NaN, now: start }).state, 'held')   // no start known: keep waiting, never name him
})
await ok('naming: MLB needs the lineup posted and the starter confirmed; NFL not OUT; NHL the goalie confirmed', () => {
  assert.equal(N.mlbNamingProblem({ player_id: '1', lineup_confirmed: true, pitcher_projected: false }), null)
  assert.deepEqual(N.mlbNamingProblem({ player_id: '1', lineup_confirmed: false }), { id: '1', reason: 'lineup not posted', pending: true })
  assert.equal(N.mlbNamingProblem({ player_id: '1', lineup_confirmed: true, pitcher_projected: true }).reason, 'starter not confirmed')
  const live = { size: 1, byPlayer: new Map([['1', { state: 'Preview', lineupPosted: true, _lineupIds: new Set(['2']) }]]), byTeam: new Map() }
  assert.equal(N.mlbNamingProblem({ player_id: '1', lineup_confirmed: true }, { live }).pending, false)   // posted lineup without him
  assert.equal(N.mlbNamingProblem({ player_id: '9', lineup_confirmed: true }, { live }).reason, "not on today's slate")
  for (const s of ['OUT', 'IR', 'SUSP', 'PUP', 'NFI']) assert.equal(N.nflNamingProblem({ player_id: 'n1', injury_status: s }).pending, false, s)
  assert.equal(N.nflNamingProblem({ player_id: 'n1', injury_status: 'Q' }), null)
  assert.equal(N.nflNamingProblem({ player_id: 'n1' }), null)
  assert.equal(N.nhlNamingProblem({ id: 'h1' }).reason, 'starting goalie not confirmed')
  assert.equal(N.nhlNamingProblem({ id: 'h1', oppGoalieConfirmed: true }), null)
})
await ok('naming: an OUT man is left off every NFL list builder (activePlayers)', () => {
  const data = { week: 5, players: [
    { player_id: 'n1', name: 'Test Out', team: 'AAA', position: 'WR', injury_status: 'OUT', stats: { RZ: 9 } },
    { player_id: 'n2', name: 'Test Healthy', team: 'BBB', position: 'WR', stats: { RZ: 5 } },
    { player_id: 'n3', name: 'Test Quest', team: 'CCC', position: 'WR', injury_status: 'Q', stats: { RZ: 4 } },
  ] }
  const picks = NFLTF.opportunityPicks(data, 'RZ')
  assert.deepEqual(picks.map((p) => p.name), ['Test Healthy', 'Test Quest'])
})
await ok('naming: resolveNaming holds the post while a pending name is in it, then builds it without him at the cutoff', () => {
  const start = Date.parse('2026-10-09T23:00:00Z')
  const rows = [
    { player_id: '1', score: 9, lineup_confirmed: true, game_time: new Date(start).toISOString() },
    { player_id: '2', score: 8, lineup_confirmed: false, game_time: new Date(start).toISOString() },    // pending
    { player_id: '3', score: 7, lineup_confirmed: true, pitcher_projected: true, game_time: new Date(start).toISOString() },   // pending
    { player_id: '4', score: 6, lineup_confirmed: true, game_time: new Date(start).toISOString() },
  ]
  const base = { rows, check: N.mlbNamingProblem, pickFrom: (rs) => [...rs].sort((a, b) => b.score - a.score).slice(0, 2), startOf: (r) => Date.parse(r.game_time), trim: true }
  const early = N.resolveNaming({ ...base, now: start - 2 * 3600e3 })
  assert.equal(early.state, 'held')
  assert.deepEqual(early.pending.map((p) => p.id), ['2'])   // only the one that would have been NAMED holds it
  const late = N.resolveNaming({ ...base, now: start - 20 * 60e3 })
  assert.equal(late.state, 'go'); assert.deepEqual(late.picks.map((r) => r.player_id), ['1', '4']); assert.deepEqual(late.trimmed, ['2'])
  const literal = N.resolveNaming({ ...base, trim: false, now: start - 20 * 60e3 })
  assert.equal(literal.state, 'dropped')
  const clean = N.resolveNaming({ ...base, rows: rows.filter((r) => r.lineup_confirmed && !r.pitcher_projected), now: start - 5 * 3600e3 })
  assert.equal(clean.state, 'go')
})
await ok('naming: postOnce HOLDS an NHL longshots post (goalie unconfirmed) and claims nothing; at the cutoff it is dropped, logged DROPPED', async () => {
  reset()
  const day = '2026-10-12'
  const db = fakeDb({ homer_feed_posts: [], fact_posts: [], nfl_td_feed: [] })
  const mk = (startMs) => ({ sport: 'nhl', market: 'anytime goal', longAt: 350, date: day, rows: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: `Test ${id}`, team: 'TST', median: 400 + i, score: 60 - i, status: 'board', startsAt: new Date(startMs).toISOString() })) })
  const build = (body) => async ({ exclude } = {}) => LS.longshotsBuild(body, { sport: 'nhl', exclude })
  const held = await LS.postOnce(db, { day, kind: 'nhl_longshots', sport: 'nhl', build: build(mk(Date.now() + 3 * 3600e3)) })
  assert.match(held, /^held: starting goalie not confirmed/)
  assert.equal(db.tables.homer_feed_posts.length, 0, 'a held post claims nothing')
  assert.equal(tweets.length, 0)
  assert.ok(L.recentLog().some((e) => e.state === 'HELD' && e.kind === 'nhl_longshots'))
  const day2 = '2026-10-13'
  const dropped = await LS.postOnce(db, { day: day2, kind: 'nhl_longshots', sport: 'nhl', build: build({ ...mk(Date.now() + 20 * 60e3), date: day2 }) })
  assert.equal(dropped, 'not-enough-yet')   // trimmed to nobody: nothing is named
  assert.equal(tweets.length, 0)
  assert.ok(L.recentLog().some((e) => e.state === 'DROPPED' && /goalie/.test(e.reason)))
  // the emergency off-switch for the naming rule
  process.env.X_GUARDS_OFF = 'naming'
  const day3 = '2026-10-14'
  assert.equal(await LS.postOnce(db, { day: day3, kind: 'nhl_longshots', sport: 'nhl', build: build({ ...mk(Date.now() + 3 * 3600e3), date: day3 }) }), 'posted')
  delete process.env.X_GUARDS_OFF
})
await ok('naming: the posting log keeps one line per decision, not one per tick', () => {
  reset()
  for (let i = 0; i < 5; i++) L.recordPost({ day: today, kind: 'pregame', state: 'HELD', reason: 'lineup not posted' })
  L.recordPost({ day: today, kind: 'pregame', state: 'POSTED', tweetId: '1' })
  assert.deepEqual(L.recentLog().map((e) => e.state), ['HELD', 'POSTED'])
  assert.equal(L.recordPost({ day: today, kind: 'x', state: 'MAYBE' }), false)
})

// ═══ 5. QUOTE / REPLY ONLY WHEN NAMED ═══════════════════════════════════════
await ok('quote: pregameCalled is the ids whose names are IN the posted text, not the board', () => {
  const picks = [{ player_id: '1', name: 'Test Alpha' }, { player_id: '2', name: 'Test Bravo' }, { player_id: '3', name: 'Test Charlie' }]
  assert.deepEqual(HF.pregameCalled(picks), ['1', '2', '3'])
  assert.deepEqual(HF.pregameCalled(picks, HF.pregameText(picks, { day: today })), ['1', '2', '3'])
  assert.deepEqual(HF.pregameCalled(picks, 'TEST teaser that names no one'), [])
  assert.deepEqual(HF.pregameCalled(picks, 'TEST: Test Alpha, Test Charlie'), ['1', '3'])
})
await ok('quote: a CALLED homer quotes the pregame post only when he is NAMED in it; otherwise nothing (standalone)', () => {
  const status = (r) => r._s
  const pre = { x_post_id: '111', payload: { picks: [{ player_id: '1' }, { player_id: '2' }], named: ['1', '2'], called: ['1', '2', '3', '4', '5'] } }
  const q = Q.mlbQuotes({ pre, gamePosts: [], callStatus: status }).quoteFor
  assert.equal(q({ player_id: 1, _s: 'called' }), '111')
  assert.equal(q({ player_id: 2, _s: 'called' }), '111')
  assert.equal(q({ player_id: 3, _s: 'called' }), null, 'on the board list but not named in the post: no quote')
  assert.equal(q({ player_id: 1, _s: 'board' }), null)
  // an old row (no `named`) falls back to the picks that were posted, never to `called`
  const old = Q.mlbQuotes({ pre: { x_post_id: '111', payload: { picks: [{ player_id: 1 }], called: ['1', '2', '3'] } }, gamePosts: [], callStatus: status }).quoteFor
  assert.equal(old({ player_id: 1, _s: 'called' }), '111'); assert.equal(old({ player_id: 2, _s: 'called' }), null)
  // a 'dry' / 'posting' / null id is never quoted
  for (const bad of ['dry', 'posting', 'skipped', null]) assert.equal(Q.mlbQuotes({ pre: { x_post_id: bad, payload: { named: ['1'] } }, gamePosts: [], callStatus: status }).quoteFor({ player_id: 1, _s: 'called' }), null)
})
await ok('quote: a call post quotes for every man its write-up names, and for no one else', () => {
  const status = (r) => r._s
  const gp = [{ kind: 'call_900', x_post_id: '222', payload: { game_pk: 900, player_id: '10', named: ['10', '11'] } }, { kind: 'call_901', x_post_id: 'dry', payload: { game_pk: 901, player_id: '20', named: ['20'] } }]
  const q = Q.mlbQuotes({ pre: null, gamePosts: gp, callStatus: status }).quoteFor
  assert.equal(q({ player_id: 10, game_pk: 900, _s: 'called' }), '222')
  assert.equal(q({ player_id: 11, game_pk: 900, _s: 'called' }), '222')
  assert.equal(q({ player_id: 12, game_pk: 900, _s: 'called' }), null)
  assert.equal(q({ player_id: 20, game_pk: 901, _s: 'called' }), null)
})
await ok('quote: callofnight stores who it named (it stored {} before), and the call_ / pregame / board payloads store `named`', () => {
  const route = fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8')
  assert.match(route, /call \? \{ picks: \[\{ player_id: String\(call\.player_id\), name: call\.name \}\] \} : \{\}\)/)
  assert.match(route, /const patch = \{ payload: \{ picks, named \} \}/)
  assert.match(route, /named: callNamed/)
  assert.match(route, /withNamed\(\{ picks: boardPicks \}/)
  assert.match(fs.readFileSync('lib/dash/tweetFeed.js', 'utf8'), /player_id: txt\(top\.player_id\)/)
  // the CALLED alert's copy and its quoteFor wiring are untouched
  assert.match(route, /quoteId: quoteFor\(row\)/)
})

// ═══ 6. THE _mid KINDS ARE GONE ═════════════════════════════════════════════
await ok('retired: hotcontact_mid and dangercombos_mid are unreachable', async () => {
  assert.deepEqual([...P.RETIRED_KINDS].sort(), ['dangercombos_mid', 'hotcontact_mid'])
  for (const k of P.RETIRED_KINDS) assert.ok(P.isRetiredForever(k))
  // the claim gate the MLB tick uses refuses them before any database call
  const db = { from() { throw new Error('a retired kind reached the database') } }
  for (const k of P.RETIRED_KINDS) assert.equal(await PC.claimSlot(db, today, k, { gate: (kind) => !P.isRetiredForever(kind) }), false)
  // no code names them outside the one list (comments and the history migrations aside)
  const hits = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p) } else if (/\.(js|mjs)$/.test(e.name) && !/check-x-safe/.test(p) && !/xPolicy\.js$/.test(p)) { const code = fs.readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/\/\/.*$/gm, ''); if (/hotcontact_mid|dangercombos_mid|HOTTEST_CONTACT_MID|DANGER_COMBOS_MID|variant: 'mid'/.test(code)) hits.push(p) } } }
  walk('app'); walk('lib'); walk('scripts')
  assert.deepEqual(hits, [])
  const vercel = fs.readFileSync('vercel.json', 'utf8')
  assert.ok(!/_mid/.test(vercel))
})

// ═══ 7. THE POLL BUG ════════════════════════════════════════════════════════
await ok('poll: options are distinct (the 9/23 "Pete Alonso" twice)', () => {
  assert.deepEqual(P.distinctOptions(['Pete Alonso', 'Juan Soto', 'Pete Alonso', 'Aaron Judge', 'Bobby Witt Jr.', 'Kyle Schwarber'], 4), ['Pete Alonso', 'Juan Soto', 'Aaron Judge', 'Bobby Witt Jr.'])
  assert.deepEqual(P.distinctOptions(['Test A', 'test a', ' Test  A ', 'Test B'], 4), ['Test A', 'Test B'])
  assert.deepEqual(P.distinctOptions(['José Ramírez', 'Jose Ramirez', 'Test C'], 4), ['José Ramírez', 'Test C'])
  // X cuts an option at 25 characters: two long names that cut to the same text are one option
  assert.deepEqual(P.distinctOptions(['Test Player With A Very Long Name Jr.', 'Test Player With A Very Long Name Sr.', 'Test D'], 4), ['Test Player With A Very Long Name Jr.', 'Test D'])
  assert.deepEqual(P.distinctOptions(['', null, undefined, 'Test E'], 4), ['Test E'])
  const four = P.distinctOptions(Array.from({ length: 9 }, (_, i) => `Test ${i % 3}`), 4)
  assert.equal(new Set(four).size, four.length)
})
await ok('poll: the NFL poll builder and the MLB poll site both use it', () => {
  assert.deepEqual(NFLTF.nflBotPollOptions([{ name: 'Test A' }, { name: 'Test A' }, { name: 'Test B' }, { name: 'Test C' }, { name: 'Test D' }, { name: 'Test E' }]), ['Test A', 'Test B', 'Test C', 'Test D'])
  assert.match(fs.readFileSync('app/api/dash/homers/tick/route.js', 'utf8'), /const pollNames = distinctOptions\(picks\.map\(\(p\) => p\.name\), 4\)/)
})

console.log(`\n${n} groups passed (${results.length} checks) -- TEST data, fake fetch, fake database`)
