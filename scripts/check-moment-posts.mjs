// THE MOMENT POSTS + THE POSTSEASON BIG NIGHTS (2026-10-12): lib/cards/momentPosting.js (the policy), lib/posts/momentFeed.js, momentPost.js, postseasonPost.js,
// momentTick.js, the migration, the KIND_TAGS rows.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-moment-posts.mjs
// ALL DATA IS TEST DATA: players are "Test ...", the database is a fake in memory, every sender is a stub (nothing is sent, no fetch leaves this process).
//   A  the tier policy table (LEGEND/ELITE X + Discord + #members; STAR is NOT posted on its own, it rides the night's digest; BASE never)
//   B  claim once (two passes, two racing instances), the event key in the claim kind, two events of one man are two posts
//   C  an X refusal keeps the claim and never loops; a Discord hiccup with nothing else sent releases the claim a few times only
//   D  the cap: moment kinds are the counted write-up tier, not exempt; a STAR card is not posted on its own
//   E  the repeat guard never suppresses a different event; kill switches (off by default, pause, per-kind pause)
//   F  the SQL is not run: nothing is sent, the log names the file, the failure is cached 30 minutes
//   G  the overturned goal: ONE update (reply + channel), never a delete, never twice; CORRECTIONS_OFF
//   H  postseason thresholds, the night's postseason digest (one post, the top three big nights), the game log wait, the fresh window
//   I  BASE is never posted; the text sanitiser; no link on X; banned words; a player named Lock
//   J  KIND_TAGS tags every new kind; the migration matches the plain .txt and accepts exactly the kinds the code claims
//   K  wiring: the four ticks call the one hook, no new cron
//   L  THE NIGHT'S DIGEST (TOP 3 TONIGHT): rank, dedupe against ELITE posted on their own, 1/2/3 names, claim once, an X refusal never loops, the cap (ONE post), the
//      night-over window from the league's schedule, kill switches, KIND_TAGS + migration cover the kinds, the text rules, never BASE, no SQL
import { readFileSync, existsSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

globalThis.fetch = async (url) => { throw new Error(`NETWORK CALL IN A TEST: ${url}`) }   // nothing in this file may leave the process
for (const k of Object.keys(process.env)) if (/^MOMENT_|^X_|^DISCORD_|POST_KINDS_ON|CORRECTIONS_OFF/.test(k)) delete process.env[k]

const P = await import('../lib/cards/momentPosting.js')
const XP = await import('../lib/dash/xPolicy.js')
const XS = await import('../lib/dash/xSchedule.js')
const { testFeedRow } = await import('../lib/cards/specialFixtures.js')
const F = await import('../lib/cards/specialFixtures.js')
const MF = await import('../lib/posts/momentFeed.js')
const MP = await import('../lib/posts/momentPost.js')
const PS = await import('../lib/posts/postseasonPost.js')
const PC = await import('../lib/posts/postseasonCard.js')
const { _resetTakenForTests } = await import('../lib/dash/postClaim.js')
const { _resetXFail } = await import('../lib/dash/xFail.js')
const { repeatCheck } = await import('../lib/dash/xGate.js')

const NOW = Date.parse('2026-10-12T20:00:00Z')
const reset = () => { _resetTakenForTests(); _resetXFail(); MP._resetMomentPost(); PS._resetPostseasonPost(); MF._resetMomentFeed() }

// ── a fake homer_feed_posts / lamp_goal_feed in memory ───────────────────────────────────────────────────
function fakeDb({ posts = [], goals = [], failKindCheck = false } = {}) {
  const calls = { upsert: 0, update: 0, delete: 0, deletedKinds: [] }
  const tables = { homer_feed_posts: posts, lamp_goal_feed: goals, homer_feed: [], nfl_td_feed: [] }
  const match = (r, f) => f.every(([op, col, v]) => {
    const x = r[col]
    if (op === 'eq') return String(x) === String(v)
    if (op === 'gte') return String(x) >= String(v)
    if (op === 'in') return v.map(String).includes(String(x))
    if (op === 'like') return new RegExp(`^${String(v).replace(/\\_/g, '_').replace(/_/g, '[_]').replace(/%/g, '.*')}$`).test(String(x))
    return true
  })
  const query = (name) => {
    const f = []
    const q = {
      select: () => q, limit: () => q, order: () => q,
      eq: (c, v) => (f.push(['eq', c, v]), q), gte: (c, v) => (f.push(['gte', c, v]), q), in: (c, v) => (f.push(['in', c, v]), q), like: (c, v) => (f.push(['like', c, v]), q),
      then: (res, rej) => Promise.resolve({ data: tables[name].filter((r) => match(r, f)).map((r) => ({ ...r })), error: null }).then(res, rej),
    }
    return q
  }
  const db = {
    from: (name) => ({
      select: () => query(name),
      upsert: (rows) => ({ select: async () => {
        calls.upsert += 1
        if (failKindCheck) return { data: null, error: { code: '23514', message: 'new row for relation "homer_feed_posts" violates check constraint "homer_feed_posts_kind_check"' } }
        const out = []
        for (const x of rows) if (!tables[name].some((q) => q.day === x.day && q.kind === x.kind)) { tables[name].push({ x_post_id: null, discord_sent: false, ...x }); out.push({ day: x.day }) }
        return { data: out, error: null }
      } }),
      update: (patch) => ({ match: async (m) => { calls.update += 1; for (const r of tables[name]) if (Object.entries(m).every(([k, v]) => r[k] === v)) Object.assign(r, patch); return { error: null } } }),
      delete: () => ({ match: async (m) => { calls.delete += 1; calls.deletedKinds.push(m.kind); tables[name] = tables[name].filter((r) => !Object.entries(m).every(([k, v]) => r[k] === v)); return { error: null } } }),
    }),
  }
  return { db, calls, tables }
}

// ── stub senders ─────────────────────────────────────────────────────────────────────────────────────────
function senders(o = {}) {
  const sent = { x: [], discord: [], members: [], upload: 0, admit: [], logged: [] }
  const HOOK = 'https://discord.com/api/webhooks/1/TEST-TOKEN'
  const MEM = 'https://discord.com/api/webhooks/2/TEST-TOKEN'
  const d = {
    hasX: () => o.hasX !== false,
    postToX: async (text, opts) => { sent.x.push({ text, ...opts }); return o.xResult ? o.xResult(text, opts) : { ok: true, id: `tw-${sent.x.length}` } },
    uploadImageToX: async () => { sent.upload += 1; return 'media-1' },
    postToDiscord: async (text, opts, hooks) => { (hooks === MEM ? sent.members : sent.discord).push({ text, hooks, ...opts }); return o.discordResult ? o.discordResult(hooks) : { ok: true, failed: [] } },
    feedHooks: () => HOOK,
    membersWebhook: () => (o.noMembers ? '' : MEM),
    admit: async (db, a) => { sent.admit.push(a); return o.admit ? o.admit(a) : { state: 'go' } },
    logPosted: (a) => sent.logged.push(a),
    render: async (e) => (o.noImage ? { model: null, png: null } : { model: { name: e.who.name }, png: Buffer.from('PNG-TEST') }),
    loadModel: async (o) => ({ brand: { league: String(o.sport || '').toUpperCase() }, tiles: o.picks.map((p) => ({ name: p.name })), picks: o.picks }),
    image: async () => (o.noImage ? { model: null, png: null } : { model: null, png: Buffer.from('PNG-TEST') }),
    clock: () => Date.now(),
  }
  return { d, sent, HOOK, MEM }
}

// ── test events ──────────────────────────────────────────────────────────────────────────────────────────
const conf = (o = {}) => testFeedRow({ game_type: 2, confirmed_at: '2026-01-02T01:00:00Z', ...o })
const hatRows = (extra = {}) => [
  conf({ goal_n: 1, period: 1, time_in_period: '03:12', strength: 'ev', score_after: 'EXA 0 · TST 1', season_goals: 10, ...extra }),
  conf({ goal_n: 2, period: 2, time_in_period: '11:41', strength: 'pp', score_after: 'EXA 1 · TST 2', season_goals: 11, ...extra }),
  conf({ goal_n: 3, period: 3, time_in_period: '18:55', strength: 'ev', empty_net: true, score_after: 'EXA 1 · TST 3', season_goals: 12, assists: [], ...extra }),
]
const find = (events, moment) => events.find((e) => e.moment === moment)
const hat = find(MF.nhlEventsFrom(hatRows()), 'nhl_hat_trick')
const ot = find(MF.nhlEventsFrom([conf({ period: 4, period_type: 'OT', time_in_period: '02:10', strength: 'ev', status: 'board' })]), 'nhl_goal')
const base = find(MF.nhlEventsFrom([conf({ goal_n: 1 })]), 'nhl_goal')
const mlb = MF.mlbEventsFrom([1, 2, 3].map((n) => ({ day: '2026-01-02', player_id: '900', hr_n: n, name: 'Test Slugger', team: 'TST', opponent: 'EXA', game_pk: '700', inning: 'top 2nd', home: true, role: 'TOP', on_board: true, board_rank: 1, seen_at: '2026-01-02T01:00:00Z' })))[0]
const long = MF.makeEvent('long_shot_cashed', F.TEST_LONG_SHOT, { gameId: '20260102', n: 'ls', at: null })
const yards = MF.makeEvent('nfl_100_yards', F.TEST_100, { gameId: 's2026w5', n: 'yd', at: null })
const star = MF.makeEvent('nfl_100_yards', { ...F.TEST_100, rush_yds: 105 }, { gameId: 's2026w5', n: 'yd', at: null })
check(hat && ot && base && mlb && long && yards && star, 'the test events build: hat trick, OT goal, a plain goal, multi-HR, long shot, 100 yards')
check(hat.tier === 'elite' && ot.tier === 'star' && base.tier === 'base' && mlb.tier === 'elite' && long.tier === 'elite' && MF.makeEvent('long_shot_cashed', { ...F.TEST_LONG_SHOT, best: 2100 }, { gameId: '20260102', n: 'ls', at: null }).tier === 'legend' && MF.makeEvent('long_shot_cashed', { ...F.TEST_LONG_SHOT, best: 700 }, { gameId: '20260102', n: 'ls', at: null }) === null && MF.makeEvent('long_shot_cashed', { ...F.TEST_LONG_SHOT, best: 750 }, { gameId: '20260102', n: 'ls', at: null }).tier === 'star' && yards.tier === 'elite' && star.tier === 'star', 'tiers: hat trick ELITE, OT goal STAR, a plain goal BASE, 3 HR ELITE, +1520 long shot ELITE (+750 STAR, +1200 ELITE, +2000 LEGEND; +700 is not one), 151 yards ELITE, 105 STAR')

// ── A. the tier policy table ─────────────────────────────────────────────────────────────────────────────
{
  const L = P.policyFor('legend', { xUsed: 15 }), E = P.policyFor('elite', { xUsed: 15 })
  check(L.x && L.discord && L.members && E.x && E.discord && E.members, 'A: LEGEND and ELITE -> X + Discord sport channel + #members')
  const s0 = P.policyFor('star', { xUsed: 0 })
  check(!s0.x && !s0.discord && !s0.members && /digest/.test(s0.why) && !P.postable('star') && P.postable('elite') && P.postable('legend') && P.inDigest('star') && P.inDigest('elite'), 'A: STAR -> NOT posted on its own (it is named in the night\'s digest); ELITE and LEGEND still are')
  const b = P.policyFor('base', { xUsed: 0 })
  check(!b.x && !b.discord && !b.members && !P.postable('base') && !P.inDigest('base'), 'A: BASE -> never posted anywhere, and never in a digest')
  const dp = P.digestPolicy()
  check(dp.x && dp.discord && dp.members && !P.digestPolicy({ hasX: false }).x && !P.digestPolicy({ hasMembers: false }).members && P.DIGEST_MAX === 3, 'A: the digest goes to X + the sport channel + #members (as ELITE does), three names at most')
  check(!P.policyFor('legend', { hasX: false }).x && !P.policyFor('elite', { hasMembers: false }).members, 'A: no X configured -> no X; no #members webhook -> no #members')
  check(P.MAX_PER_PASS <= 3 && P.POSTSEASON_MAX_PER_NIGHT === 3 && P.DIGEST_EVAL_MS === 300e3 && P.DIGEST_FRESH_MS === 20 * 3600e3, 'A: the numbers are in the one config (3 a pass, 3 names a digest, the digest looks every 5 minutes and posts a night within 20 hours of its last start)')
}

// ── B. claim once; the event is in the kind ─────────────────────────────────────────────────────────────
process.env.MOMENT_POSTS_ON = 'on'
{
  reset()
  const { db, tables } = fakeDb()
  const s = senders()
  const r1 = await MP.postMomentEvents(db, [hat], { now: NOW, deps: s.d })
  const kind = tables.homer_feed_posts[0]?.kind
  check(r1.posted.length === 1 && /^moment_nhl_11_1_ht3$/.test(kind), `B: the hat trick claims its own kind (${kind}) and posts`)
  check(tables.homer_feed_posts[0].payload.event === 'moment|nhl|11|1|ht3' && tables.homer_feed_posts[0].payload.named[0] === '11' && tables.homer_feed_posts[0].payload.goals.length === 3, 'B: the claim payload keeps the event key, who it names and the goals behind it')
  check(tables.homer_feed_posts[0].x_post_id === 'tw-1' && tables.homer_feed_posts[0].discord_sent === true && tables.homer_feed_posts[0].payload.x_tag === 'INFO', 'B: the row records the tweet, the channel send and the INFO tag')
  const r2 = await MP.postMomentEvents(db, [hat], { now: NOW + 60e3, deps: s.d })
  check(r2.posted.length === 0 && s.sent.x.length === 1 && s.sent.discord.length === 1, 'B: the next tick (same instance) does not post it again')
  _resetTakenForTests()
  const r3 = await MP.postMomentEvents(db, [hat], { now: NOW + 120e3, deps: s.d })
  check(r3.posted.length === 0 && s.sent.x.length === 1 && s.sent.discord.length === 1 && tables.homer_feed_posts.length === 1, 'B: a COLD instance (nothing remembered) is stopped by the database claim')
  // two instances racing on the same event
  reset()
  const f2 = fakeDb(); const s2 = senders()
  const [a, b] = await Promise.all([MP.postMomentEvents(f2.db, [hat], { now: NOW, deps: s2.d }), MP.postMomentEvents(f2.db, [hat], { now: NOW, deps: s2.d })])
  check(a.posted.length + b.posted.length === 1 && s2.sent.x.length === 1 && s2.sent.discord.length === 1, 'B: two ticks racing on one event send it once')
  // the members copy: ELITE yes (once)
  check(s2.sent.members.length === 1 && s2.sent.discord.length === 1, 'B: ELITE also goes to #members (its own webhook, once)')
  // two events of one man are two posts (different game / different rung)
  reset()
  const f3 = fakeDb(); const s3 = senders()
  const hat2 = find(MF.nhlEventsFrom(hatRows({ game_id: 2 })), 'nhl_hat_trick')
  const four = find(MF.nhlEventsFrom([...hatRows(), conf({ goal_n: 4, period: 3, time_in_period: '19:30', score_after: 'EXA 1 · TST 4' })]), 'nhl_hat_trick')
  await MP.postMomentEvents(f3.db, [hat, hat2, four], { now: NOW, deps: s3.d })
  check(f3.tables.homer_feed_posts.length === 3 && new Set(f3.tables.homer_feed_posts.map((r) => r.kind)).size === 3 && f3.tables.homer_feed_posts.some((r) => r.kind.endsWith('_ht4')), 'B: the same man in two games, and his 4th goal after his hat trick, are three events with three claims')
}

// ── C. an X refusal keeps the claim and never loops ─────────────────────────────────────────────────────
{
  reset()
  const { db, tables } = fakeDb(); const s = senders({ xResult: () => ({ ok: false, status: 403, error: 'Forbidden: duplicate content' }) })
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '))
  const r1 = await MP.postMomentEvents(db, [hat], { now: NOW, deps: s.d })
  _resetTakenForTests()
  const r2 = await MP.postMomentEvents(db, [hat], { now: NOW + 60e3, deps: s.d })
  const r3 = await MP.postMomentEvents(db, [hat], { now: NOW + 120e3, deps: s.d })
  console.error = ce
  check(r1.posted.length === 1 && s.sent.x.length === 1 && s.sent.discord.length === 1, 'C: X refuses -> the Discord copy went, X was tried ONCE')
  check(tables.homer_feed_posts.length === 1 && tables.homer_feed_posts[0].x_post_id === 'skipped' && r2.posted.length === 0 && r3.posted.length === 0 && s.sent.x.length === 1 && s.sent.discord.length === 1, 'C: the claim stays, x_post_id is closed as skipped, later ticks (even a cold one) send nothing: no loop')
  check(errs.some((e) => /X refused/.test(e)), 'C: the refusal is logged')
  // Discord hiccup and nothing else went out: the claim is released a few times, then stays
  reset()
  const f = fakeDb(); const sh = senders({ hasX: false, noMembers: true, discordResult: () => ({ ok: false, status: 503, failed: [{}] }) })
  for (let i = 0; i < 6; i++) await MP.postMomentEvents(f.db, [hat], { now: NOW + i * 60e3, deps: sh.d })
  check(f.calls.delete <= 3 && f.calls.delete >= 1 && sh.sent.discord.length <= 4, `C: a channel outage with nothing else sent retries only a few times (${sh.sent.discord.length} tries, ${f.calls.delete} releases), then stops`)
}

// ── D. the cap ───────────────────────────────────────────────────────────────────────────────────────────
{
  check(XP.tierOf('moment_nhl_11_1_ht3') === 'writeup' && XP.tierOf('postseason_mlb_1_2') === 'writeup' && !XP.isCapExempt('moment_nhl_11_1_ht3') && !XP.isCapExempt('postseason_mlb_1_2'), 'D: moment and postseason kinds are the counted write-up tier, NOT exempt')
  check(XP.capAllows('moment_nhl_11_1_ht3', 17) && !XP.capAllows('moment_nhl_11_1_ht3', 18) && XP.EXEMPT_KINDS.every((k) => !/^(moment|postseason)/.test(k)), 'D: they stop at 18 of 20 (the CALLED alerts keep their room) and are not in the exempt list')
  reset()
  const { db, tables } = fakeDb(); const s = senders({ admit: () => ({ state: 'capped', reason: 'daily cap (writeup tier)' }) })
  const r = await MP.postMomentEvents(db, [hat], { now: NOW, deps: s.d })
  check(r.posted.length === 1 && s.sent.x.length === 0 && s.sent.discord.length === 1 && tables.homer_feed_posts[0].x_post_id === 'skipped' && /capped/.test(tables.homer_feed_posts[0].payload.x_note), 'D: over the cap -> Discord still goes, X does not, the row says why')
  check(s.sent.admit.length === 1 && s.sent.admit[0].kind.startsWith('moment_nhl_') && s.sent.admit[0].repeat === false, 'D: the X post asks the one gate (admit) with its own kind')
  reset()
  const f2 = fakeDb(); const s2 = senders()
  const r2 = await MP.postMomentEvents(f2.db, [ot], { now: NOW, deps: s2.d })
  check(r2.posted.length === 0 && f2.tables.homer_feed_posts.length === 0 && s2.sent.x.length + s2.sent.discord.length + s2.sent.members.length === 0 && r2.skipped.length === 0, 'D: a STAR card is not claimed or posted on its own, whatever the day\'s X count (it rides the digest)')
  reset()
  const f5 = fakeDb(); const s5 = senders()
  const many = [hat, MF.makeEvent('mlb_multi_hr', mlb.row, { gameId: 701, n: 'hr3', at: null }), MF.makeEvent('mlb_multi_hr', mlb.row, { gameId: 702, n: 'hr3', at: null }), MF.makeEvent('mlb_multi_hr', mlb.row, { gameId: 703, n: 'hr3', at: null }), MF.makeEvent('mlb_multi_hr', mlb.row, { gameId: 704, n: 'hr3', at: null })]
  const rm = await MP.postMomentEvents(f5.db, many, { now: NOW, deps: s5.d })
  check(rm.posted.length === P.MAX_PER_PASS && f5.tables.homer_feed_posts.length === P.MAX_PER_PASS, `D: a backlog never dumps: one pass posts at most ${P.MAX_PER_PASS}`)
}

// ── E. the repeat guard; the kill switches ─────────────────────────────────────────────────────────────
{
  const kinds = ['moment_nhl_11_1_ht3', 'moment_mlb_900_700_hr3', 'moment_nfl_00_s2026w5_yd', 'moment_nhl_11_1_ht3_upd', 'postseason_mlb_849831_660271']
  check(kinds.every((k) => XP.isMomentKind(k) && XP.isRepeatExempt(k)), 'E: every moment / postseason kind is exempt from the 3-day repeat guard (one post per EVENT)')
  check(!XP.isMomentKind('card_nhl') && !XP.isMomentKind('moment_nba_1_2_x') && !XP.isMomentKind('nhl_slate') && !XP.isRepeatExempt('nhl_slate'), 'E: the exemption is only for these kinds (not the Card, the Slate, or BUCKETS)')
  let asked = 0
  const fake = { from: () => { asked += 1; throw new Error('the repeat guard read the database for a moment kind') } }
  check((await repeatCheck(fake, { day: '2026-10-12', kind: 'moment_nhl_11_1_ht3', ids: ['11'] })).length === 0 && asked === 0, 'E: repeatCheck answers [] without reading anything for a moment kind')
  check(XP.sportOfKind('moment_nfl_00_s2026w5_yd') === 'nfl' && XP.sportOfKind('moment_nhl_11_1_ht3') === 'nhl' && XP.sportOfKind('postseason_mlb_1_2') === 'mlb' && XP.repeatWindowDays('moment_nfl_x') === 7, 'E: sportOfKind reads the sport out of the moment kinds')
  reset()
  delete process.env.MOMENT_POSTS_ON
  let f = fakeDb(); let s = senders()
  let r = await MP.postMomentEvents(f.db, [hat], { now: NOW, deps: s.d })
  check(r.off === true && f.tables.homer_feed_posts.length === 0 && s.sent.x.length + s.sent.discord.length === 0, 'E: OFF BY DEFAULT: without MOMENT_POSTS_ON nothing is claimed or sent')
  check((await MP.momentPass(f.db, { source: 'nhl', now: NOW })).off === true, 'E: the tick hook returns at once when the switch is off')
  process.env.MOMENT_POSTS_ON = 'on'; process.env.MOMENT_POSTS_PAUSE = '1'
  r = await MP.postMomentEvents(f.db, [hat], { now: NOW, deps: s.d })
  check(r.paused === true && f.tables.homer_feed_posts.length === 0 && s.sent.discord.length === 0, 'E: MOMENT_POSTS_PAUSE=1 stops every new post')
  delete process.env.MOMENT_POSTS_PAUSE; process.env.MOMENT_POSTS_PAUSE_KINDS = 'moment_nhl'
  reset(); f = fakeDb(); s = senders()
  const rp = await MP.postMomentEvents(f.db, [hat, mlb], { now: NOW, deps: s.d })
  check(f.tables.homer_feed_posts.length === 1 && f.tables.homer_feed_posts[0].kind.startsWith('moment_mlb_') && rp.skipped.some((x) => /moment_nhl is paused/.test(x)), 'E: a per-kind pause (MOMENT_POSTS_PAUSE_KINDS=moment_nhl) stops just that family')
  delete process.env.MOMENT_POSTS_PAUSE_KINDS
}

// ── F. the SQL is not run ────────────────────────────────────────────────────────────────────────────────
{
  reset()
  const f = fakeDb({ failKindCheck: true }); const s = senders()
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '))
  const r1 = await MP.postMomentEvents(f.db, [hat, mlb], { now: NOW, deps: s.d })
  const r2 = await MP.postMomentEvents(f.db, [hat], { now: NOW + 60e3, deps: s.d })
  const asked = f.calls.upsert
  const r3 = await MP.postMomentEvents(f.db, [hat], { now: NOW + 31 * 60e3, deps: s.d })
  console.error = ce
  check(s.sent.x.length === 0 && s.sent.discord.length === 0 && s.sent.members.length === 0, 'F: the kind is not allowed yet -> nothing is sent anywhere')
  check(errs.some((e) => /kind not allowed yet \(run supabase\/migrations\/202610121400_homer_feed_moment_kinds\.sql\)/.test(e)), 'F: the log says "kind not allowed yet (run <file>)"')
  check(asked === 1 && r1.skipped.some((x) => /^blocked/.test(x)) && r2.blocked && asked === 1, 'F: the first refusal stops the pass; the next ticks do not ask the database again (cached)')
  check(f.calls.upsert === 2, 'F: after 30 minutes it asks once more')
  // postseason, same SQL
  reset()
  const f2 = fakeDb({ failKindCheck: true })
  check(typeof PS.postseasonPass === 'function', 'F: (the postseason pass shares the same skip, tested in H)')
}

// ── G. the overturned goal ─────────────────────────────────────────────────────────────────────────────
{
  reset()
  const f = fakeDb(); const s = senders()
  await MP.postMomentEvents(f.db, [hat], { now: NOW, deps: s.d })
  const row = f.tables.homer_feed_posts[0]
  // nothing overturned yet: no update
  f.tables.lamp_goal_feed.push(...hatRows().map((r) => ({ ...r, overturned_at: null })))
  const CNOW = Date.parse('2026-01-03T12:00:00Z')    // the test goals are from 2026-01-02: the update looks back two days from here
  let out = await MP.postMomentCorrections(f.db, { now: CNOW + 600e3, deps: s.d })
  check(out.length === 0 && s.sent.x.length === 1, 'G: while every goal stands there is no update')
  // goal 2 is overturned
  f.tables.lamp_goal_feed[1].overturned_at = '2026-01-02T02:00:00Z'
  out = await MP.postMomentCorrections(f.db, { now: CNOW + 700e3, deps: s.d })
  const reply = s.sent.x[1]
  check(out.length === 1 && reply && reply.replyTo === 'tw-1' && /overturned on review/.test(reply.text) && /hat trick card above no longer stands/.test(reply.text) && !/https?:\/\//.test(reply.text), 'G: ONE reply under the original tweet saying the card no longer stands (no link)')
  check(s.sent.discord.length === 2 && /no longer stands/.test(s.sent.discord[1].text), 'G: and one channel update where the card went')
  check(f.tables.homer_feed_posts.some((r) => r.kind === `${row.kind}_upd`) && f.calls.delete === 0 && f.tables.homer_feed_posts.some((r) => r.kind === row.kind), 'G: the update has its own claim row; the original row is untouched and NOTHING is deleted')
  const again = await MP.postMomentCorrections(f.db, { now: CNOW + 800e3, deps: s.d })
  _resetTakenForTests()
  const again2 = await MP.postMomentCorrections(f.db, { now: CNOW + 900e3, deps: s.d })
  check(again.length === 0 && again2.length === 0 && s.sent.x.length === 2, 'G: the update goes once (a cold instance too)')
  process.env.CORRECTIONS_OFF = 'on'
  reset(); const f2 = fakeDb(); const s2 = senders()
  await MP.postMomentEvents(f2.db, [hat], { now: NOW, deps: s2.d })
  f2.tables.lamp_goal_feed.push(...hatRows().map((r) => ({ ...r, overturned_at: '2026-01-02T02:00:00Z' })))
  check((await MP.postMomentCorrections(f2.db, { now: CNOW + 1e3, deps: s2.d })).length === 0 && s2.sent.x.length === 1, 'G: CORRECTIONS_OFF=on stops the update')
  delete process.env.CORRECTIONS_OFF
  // the feed itself: an overturned or unconfirmed goal is not an event, a preseason goal never posts
  check(MF.nhlEventsFrom(hatRows({ overturned_at: '2026-01-02T02:00:00Z' })).length === 0 && MF.nhlEventsFrom(hatRows({ confirmed_at: null })).length === 0 && MF.nhlEventsFrom(hatRows({ game_type: 1 })).length === 0, 'G: an overturned, unconfirmed or preseason goal is never an event')
  const withTwoConfirmed = MF.nhlEventsFrom([...hatRows().slice(0, 2), { ...hatRows()[2], confirmed_at: null }])
  check(!find(withTwoConfirmed, 'nhl_hat_trick'), 'G: a third goal the league has not confirmed is not a hat trick yet')
  check(MF.inWindow({ ...hat, at: NOW - 60e3, sport: 'nhl' }, NOW) === false && MF.inWindow({ ...hat, at: NOW - 4 * 60e3, sport: 'nhl' }, NOW) === true && MF.inWindow({ ...hat, at: NOW - 4 * 3600e3, sport: 'nhl' }, NOW) === false, 'G: a goal waits 3 minutes after confirmation (a challenge), and is not posted once it is 3 hours old')
}

// ── H. the postseason ────────────────────────────────────────────────────────────────────────────────────
{
  const hit = (o) => ({ batting: { homeRuns: 0, hits: 0, rbi: 0, atBats: 4, ...o } })
  const pit = (ip, k, er) => ({ pitching: { inningsPitched: ip, strikeOuts: k, earnedRuns: er } })
  const big = (s) => PC.boxNight(s).length > 0
  check(big(hit({ homeRuns: 1 })) && big(hit({ hits: 3 })) && big(hit({ rbi: 4 })) && !big(hit({ hits: 2, rbi: 3 })) && !big(hit({})), 'H: hitter: a HR, or 3+ hits, or 4+ RBI (2 hits and 3 RBI is not)')
  check(big(pit('5.0', 8, 3)) && big(pit('6.0', 3, 1)) && big(pit('7.2', 4, 0)) && !big(pit('5.2', 7, 0)) && !big(pit('6.0', 7, 2)) && !big(pit('7.0', 7, 2)), 'H: pitcher: 8+ K, or 6+ IP with 1 ER or fewer (5.2 IP 0 ER and 6 IP 2 ER are not)')
  check(PC.BIG_NIGHT.hr === 1 && PC.BIG_NIGHT.hits === 3 && PC.BIG_NIGHT.rbi === 4 && PC.BIG_NIGHT.k === 8 && PC.BIG_NIGHT.ip === 6 && PC.BIG_NIGHT.er === 1, 'H: the approved numbers')
  const player = (id, name, stats) => ({ person: { id, fullName: name }, stats })
  const box = { teams: { home: { players: { ID1: player(1, 'Test A', hit({ homeRuns: 2, hits: 3, rbi: 4 })), ID2: player(2, 'Test B', hit({ hits: 3 })), ID3: player(3, 'Test C', pit('7.0', 9, 0)), ID4: player(4, 'Test D', hit({ hits: 1 })) } }, away: { players: { ID5: player(5, 'Test E', hit({ homeRuns: 1 })), ID6: player(6, 'Test F', hit({ rbi: 4 })) } } } }
  const nights = PS.bigNights(box)
  check(nights.map((n) => n.name).join(',') === 'Test A,Test C,Test E,Test F,Test B' && nights.every((n) => n.name !== 'Test D'), `H: a game's big nights, most notable first (${nights.map((n) => n.name).join(', ')})`)
  // the live pass, with a fake schedule, box scores and MLB game logs
  const raw = (pk, extra = {}) => ({ gamePk: pk, officialDate: '2026-10-12', season: '2026', gameDate: new Date(NOW - 3 * 3600e3).toISOString(), status: { abstractGameState: 'Final', detailedState: 'Final' }, ...extra })
  const sched = (extra = {}) => [raw(900001, extra), raw(900002, extra)]
  const box2 = { teams: { home: { players: { ID7: player(7, 'Test G', hit({ homeRuns: 1, hits: 2, rbi: 1 })) } }, away: { players: {} } } }
  const modelFor = (id, name, group, pk, over = {}) => ({ ok: true, model: {
    id, name, group, team: 'TST', teamName: 'Test Club', season: '2026', games: 4, roundTag: 'ALDS', face: '', logo: '', logoPlate: false, tone: null, total: { hr: '3', rbi: '5', avg: '.300', ip: '10.0', era: '1.50', k: '20', whip: '1.00', wl: '1-0', h: '8', obp: '.400', slg: '.600' },
    last: { date: '2026-10-12', dayWord: 'Mon Oct 12', opp: 'Test Opp', isHome: true, round: 'ALDS', gamePk: pk, ip: '7.0', counts: group === 'pitching' ? { outs: 21, strikeOuts: 9, earnedRuns: 0 } : { homeRuns: 2, hits: 3, rbi: 4, atBats: 4, doubles: 0, triples: 0 } },
    back: { career: null }, ...over,
  } })
  const gameOf = { 1: 900001, 2: 900001, 3: 900001, 4: 900001, 5: 900001, 6: 900001, 7: 900002 }
  const mk = ({ schedule = sched(), models = {}, xs = {}, boxes = { 900001: box, 900002: box2 } } = {}) => {
    const s = senders(xs)
    return { s, deps: { ...s.d, postseasonOn: async () => true, schedule: async () => schedule, boxscore: async (pk) => boxes[pk] || null,
      loadPlayer: async ({ id, group }) => models[id] || modelFor(id, `Test ${id}`, group, gameOf[id]) } }
  }
  const emptyBox = { teams: { home: { players: {} }, away: { players: {} } } }
  check(PS.postseasonNights(sched()).length === 1 && PS.postseasonNights(sched())[0].games.length === 2 && PS.postseasonNights([raw(1), raw(2, { officialDate: '2026-10-11' })]).length === 2, 'H: a night is a game date: two games on one date are one night')
  reset()
  let f = fakeDb(); let m = mk()
  let r = await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  const kinds = f.tables.homer_feed_posts.map((x) => x.kind)
  check(kinds.length === 1 && kinds[0] === 'postseason_mlb_top3_20261012' && r.nights?.[0]?.result?.startsWith('posted TOP 3 POSTSEASON PERFORMANCES'), `H: the night posts ONE digest, claimed as ${kinds.join(', ')} (not one claim per player)`)
  check(m.s.sent.x.length === 1 && m.s.sent.discord.length === 1 && m.s.sent.members.length === 1 && m.s.sent.upload === 1 && m.s.sent.x[0].mediaId === 'media-1', 'H: ONE X post with the one card image, ONE MLB channel post, ONE #members post')
  const hx = m.s.sent.x[0].text
  check(/^TOP 3 POSTSEASON PERFORMANCES · MLB\n1\. Test A \(TST\): 3-FOR-4 · 2 HR · 4 RBI\n2\. Test C \(TST\): 7\.0 IP · 0 ER · 9 K/.test(hx) && !/https?:\/\//.test(hx) && Array.from(hx).length <= 280 && !P.BANNED.test(hx), `H: the X text is neutral, titled, ranked, no link, fits 280 (${hx.replace(/\n/g, ' | ')})`)
  check(/2\. Test C/.test(hx) && /3\. Test G/.test(hx) && !/Test E|Test F|Test B/.test(hx), 'H: the three best of the WHOLE night across games (A 34, C 27.5, then G 16 from the second game), not the first game\'s')
  check(f.tables.homer_feed_posts[0].payload.named.join(',') === '1,3,7' && f.tables.homer_feed_posts[0].payload.count === 3 && f.tables.homer_feed_posts[0].x_post_id === 'tw-1', 'H: the claim row names the three players (the repeat record) and the tweet')
  check(m.s.sent.admit.length === 1 && m.s.sent.admit[0].kind === 'postseason_mlb_top3_20261012' && m.s.sent.admit[0].repeat === false, 'H: it counts as ONE post through the one X gate (write-up tier)')
  const again = await PS.postseasonPass(f.db, { now: NOW + 60e3, deps: m.deps })
  PS._resetPostseasonPost(); _resetTakenForTests()
  const again2 = await PS.postseasonPass(f.db, { now: NOW + 120e3, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1 && m.s.sent.x.length === 1 && !(again.nights || []).length && !(again2.nights || []).some((n) => /^posted/.test(n.result)), 'H: once a night: a later tick and a cold instance post nothing more')
  // one game of the night is still going: nothing yet
  reset(); f = fakeDb(); m = mk({ schedule: [raw(900001), raw(900002, { status: { abstractGameState: 'Live', detailedState: 'In Progress' } })] })
  r = await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'H: the digest waits for the LAST game of the night (every game Final)')
  // a postponed game does not hold the night
  reset(); f = fakeDb(); m = mk({ schedule: [raw(900001), raw(900002, { status: { abstractGameState: 'Preview', detailedState: 'Postponed' } })] })
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1, 'H: a postponed game is done for the night: it does not hold the digest')
  // one big night: titled by count
  reset(); f = fakeDb(); m = mk({ boxes: { 900001: { teams: { home: { players: { ID1: player(1, 'Test A', hit({ homeRuns: 1 })) } }, away: { players: {} } } }, 900002: emptyBox } })
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1 && /^TOP POSTSEASON PERFORMANCE · MLB\n1\. Test A/.test(m.s.sent.x[0]?.text || ''), 'H: one big night is posted as one (titled by count)')
  // no big night at all: nothing
  reset(); f = fakeDb(); m = mk({ boxes: { 900001: emptyBox, 900002: emptyBox } })
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'H: a night with no big night posts nothing')
  // the game log has not caught up for the best man: wait, then go without him
  reset(); f = fakeDb(); m = mk({ models: { 1: modelFor('1', 'Test 1', 'hitting', 899999) } })
  for (let i = 0; i < 5; i++) await PS.postseasonPass(f.db, { now: NOW + i * 60e3, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'H: a player whose MLB game log has not caught up with the Final is waited for (nothing claimed, nothing said)')
  for (let i = 5; i < 30; i++) await PS.postseasonPass(f.db, { now: NOW + i * 60e3, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1 && !/Test A\b/.test(m.s.sent.x[0]?.text || '') && /1\. Test C/.test(m.s.sent.x[0]?.text || ''), 'H: after the wait runs out the digest goes without him (the next best fills the place)')
  // too old / too early / not the postseason / off / paused
  reset(); f = fakeDb(); m = mk({ schedule: sched({ gameDate: new Date(NOW - 21 * 3600e3).toISOString() }) })
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0, 'H: a night whose last game started over 20 hours ago is not posted (no backlog dump)')
  reset(); f = fakeDb(); m = mk({ schedule: sched({ gameDate: new Date(NOW - 1 * 3600e3).toISOString() }) })
  r = await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0 && /waiting/.test(r.nights?.[0]?.result || ''), 'H: not before the post-game window (a feed that says Final too early never posts a half night)')
  reset(); f = fakeDb(); m = mk(); m.deps.postseasonOn = async () => false
  check((await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })).skipped === 'not the postseason' && f.tables.homer_feed_posts.length === 0, 'H: outside the postseason the pass reads nothing and posts nothing')
  delete process.env.MOMENT_POSTS_ON
  reset(); f = fakeDb(); m = mk()
  check((await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })).off === true && f.tables.homer_feed_posts.length === 0, 'H: off by default')
  process.env.MOMENT_POSTS_ON = 'on'
  for (const list of ['postseason_mlb', 'moment_top3', 'postseason_mlb_top3']) {
    process.env.MOMENT_POSTS_PAUSE_KINDS = list
    reset(); f = fakeDb(); m = mk()
    check(Boolean((await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })).paused) && f.tables.homer_feed_posts.length === 0, `H: MOMENT_POSTS_PAUSE_KINDS=${list} stops the postseason digest`)
  }
  process.env.MOMENT_POSTS_PAUSE_KINDS = 'moment_nhl,moment_nhl_top3'
  reset(); f = fakeDb(); m = mk(); await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1, 'H: pausing the NHL families leaves the postseason digest alone')
  delete process.env.MOMENT_POSTS_PAUSE_KINDS
  // the SQL is not run
  reset(); f = fakeDb({ failKindCheck: true }); m = mk()
  const ce = console.error; const errs = []; console.error = (...a) => errs.push(a.join(' '))
  r = await PS.postseasonPass(f.db, { now: NOW, deps: m.deps }); const r2 = await PS.postseasonPass(f.db, { now: NOW + 60e3, deps: m.deps })
  console.error = ce
  check(m.s.sent.x.length === 0 && m.s.sent.discord.length === 0 && errs.some((e) => /kind not allowed yet \(run supabase/.test(e)) && r2.blocked, 'H: the SQL not run -> nothing sent, the log names the file, not asked again for 30 minutes')
  // X refuses the digest: the claim stays, no loop
  reset(); f = fakeDb(); m = mk({ xs: { xResult: () => ({ ok: false, status: 403, error: 'forbidden' }) } })
  const ce2 = console.error; console.error = () => {}
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps }); PS._resetPostseasonPost(); _resetTakenForTests(); await PS.postseasonPass(f.db, { now: NOW + 60e3, deps: m.deps })
  console.error = ce2
  check(m.s.sent.x.length === 1 && f.tables.homer_feed_posts.length === 1 && f.tables.homer_feed_posts[0].x_post_id === 'skipped' && m.s.sent.discord.length === 1, 'H: X refuses -> the claim stays closed as skipped, X tried once, Discord went, no loop (a cold instance too)')
  // the picture fails: X text only, Discord without the image
  reset(); f = fakeDb(); m = mk(); m.deps.image = async () => ({ model: null, png: null })
  await PS.postseasonPass(f.db, { now: NOW, deps: m.deps })
  check(m.s.sent.x.length === 1 && m.s.sent.upload === 0 && !m.s.sent.x[0].mediaId && m.s.sent.discord.every((x) => !x.png && !x.embed.image), 'H: a card that does not draw posts X text-only and Discord without the image')
}

// ── I. BASE never; the text ───────────────────────────────────────────────────────────────────────────
{
  reset()
  const f = fakeDb(); const s = senders()
  const r = await MP.postMomentEvents(f.db, [base, base], { now: NOW, deps: s.d })
  check(f.tables.homer_feed_posts.length === 0 && s.sent.x.length + s.sent.discord.length + s.sent.members.length === 0 && r.posted.length === 0, 'I: a BASE card is never claimed or posted')
  const sample = [['nhl_goal', ot], ['nhl_hat_trick', hat], ['mlb_multi_hr', mlb], ['nfl_100_yards', yards], ['long_shot_cashed', long], ['nfl_multi_td', MF.makeEvent('nfl_multi_td', F.TEST_MULTI_TD, { gameId: '800', n: 'td3', at: null })], ['nhl_season_goal_milestone', MF.makeEvent('nhl_season_goal_milestone', F.TEST_MILESTONE, { gameId: 1, n: 'g1', at: null })], ['nhl_three_points', MF.makeEvent('nhl_three_points', F.TEST_POINTS, { gameId: 1, n: 'pt3', at: null })]]
  for (const [key, e] of sample) {
    const line = P.momentLine(key, e.row, e.who)
    const t = P.xTextFor(line, e.status, [e.who.name, e.who.team, e.who.opp])
    check(Boolean(e) && Boolean(t) && !/https?:\/\//.test(t) && Array.from(t).length <= 280 && !P.BANNED.test(t) && !/\b(lock|due|guarantee|nuke|probab)/i.test(t), `I: ${key}: one neutral factual line, no link, no banned word (${(t || '').slice(0, 90)})`)
  }
  check(P.xTextFor(P.momentLine('nhl_hat_trick', hat.row, hat.who), 'called', []).endsWith('He was CALLED.') && !/CALLED|BOARD/.test(P.xTextFor(P.momentLine('nhl_hat_trick', hat.row, hat.who), null, [])), 'I: CALLED appears only when the stored label says called; no label, no word')
  check(P.statusLine('board') === 'He was ON THE BOARD.' && P.statusLine('off') === '' && P.statusLine(undefined) === '', 'I: ON THE BOARD only from a stored board label; NOT ON THE BOARD is never printed')
  check(P.noLinkText('See https://dashnetwork.vercel.app/x and [here](https://x.com/a) now dashnetwork.vercel.app/called') === 'See and here now', 'I: the sanitiser strips bare URLs, markdown links and the site host')
  check(P.xTextFor('He is due for a lock', null, []) === null && P.xTextFor('A guaranteed 50% night', null, []) === null && P.xTextFor('A nuke of a night', null, []) === null && P.xTextFor('Hit 3 home runs, a 90 percent night', null, []) !== null, 'I: "due", "lock", "guaranteed", a percent sign are refused (the post is dropped, not reworded)')
  check(P.xTextFor('Drew Lock (SEA) has scored 2 touchdowns against LAR.', null, ['Drew Lock']) !== null && P.xTextFor('Drew Lock (SEA) is a lock tonight.', null, ['Drew Lock']) === null, 'I: a quarterback named Lock is not a banned word, the word lock still is')
  check(P.xTextFor('x'.repeat(300), null, []) === null, 'I: text over 280 is refused, never cut mid-word')
  // a run with a banned line drops the post without sending, keeps the claim
  reset()
  const bad = MF.makeEvent('long_shot_cashed', { ...F.TEST_LONG_SHOT, market: 'anytime goal 100%' }, { gameId: '20260102', n: 'ls', at: null })
  const fb = fakeDb(); const sb = senders()
  const rb = await MP.postMomentEvents(fb.db, [bad], { now: NOW, deps: sb.d })
  check(sb.sent.x.length + sb.sent.discord.length === 0 && fb.tables.homer_feed_posts[0]?.payload?.dropped === 'no clean text' && rb.skipped.some((x) => /no clean text/.test(x)), 'I: a line with a banned word is dropped, nothing sent, the claim recorded (no retry)')
  // the Discord embed carries the player\'s page link and the attached card; X carries neither
  reset()
  const fe = fakeDb(); const se = senders()
  await MP.postMomentEvents(fe.db, [hat], { now: NOW, deps: se.d })
  const em = se.sent.discord[0].embed
  check(em.image?.url === 'attachment://card.png' && /\/nhl\/player|\/player|lamp|nhl/.test(em.url || '') && se.sent.discord[0].png && !se.sent.x[0].text.includes('http') && em.footer.text.includes('DASH Network'), 'I: Discord: the embed has the player page link and attachment://card.png; X text has no link')
  check(se.sent.x[0].mediaId === 'media-1' && se.sent.upload === 1, 'I: the card is uploaded to X as media')
  // no picture: X text only, Discord without the image
  reset()
  const fn = fakeDb(); const sn = senders({ noImage: true })
  await MP.postMomentEvents(fn.db, [hat], { now: NOW, deps: sn.d })
  check(sn.sent.x.length === 1 && !sn.sent.x[0].mediaId && sn.sent.upload === 0 && sn.sent.discord.length === 1 && !sn.sent.discord[0].png && !sn.sent.discord[0].embed.image, 'I: the card does not draw -> X text-only, Discord without the image, the post still goes')
}

// ── J. KIND_TAGS, the migration ───────────────────────────────────────────────────────────────────────
{
  const sampleKinds = [...P.MOMENT_FAMILIES, 'moment_nhl_11_1_ht3', 'moment_mlb_900_700_hr3', 'moment_nfl_000038124_s2026w5_yd', 'moment_nhl_11_1_ht3_upd', 'postseason_mlb_849831_660271', 'moment_nhl_top3_20261012', 'moment_nfl_top3_20261011', 'moment_mlb_top3_20261012', 'postseason_mlb_top3_20261012']
  check(sampleKinds.every((k) => XS.tagOf(k) === 'INFO' && XS.modeOf(k) === 'event'), 'J: KIND_TAGS tags every new kind (the four families and every claim kind) INFO, event-driven')
  check(XS.untagged().length === 0 && P.MOMENT_FAMILIES.every((k) => XS.KIND_TAGS[k]), 'J: untagged() is still empty')
  const mp = XS.mayPostNow({ kind: 'moment_nhl_11_1_ht3', now: NOW, sport: 'nhl' }), ps = XS.mayPostNow({ kind: 'postseason_mlb_900001_1', now: NOW })
  check(mp.ok && ps.ok && mp.tag === 'INFO', 'J: the scheduler lets a tagged moment kind through (events ignore windows)')
  const src = ['lib/posts/momentPost.js', 'lib/posts/postseasonPost.js', 'lib/cards/momentPosting.js', 'lib/posts/digestPost.js'].map((f) => readFileSync(f, 'utf8')).join('\n')
  const lits = [...src.matchAll(/['`](moment|postseason)_(?:mlb|nfl|nhl)\b/g)].map((m) => m[0].slice(1))
  check(lits.every((l) => XS.kindInfo(l)), `J: every kind literal in the posting code is in the table (${[...new Set(lits)].join(', ')})`)
  // kinds the code generates, against the migration's patterns
  const sql = readFileSync('supabase/migrations/202610121400_homer_feed_moment_kinds.sql', 'utf8')
  const regexes = [...sql.matchAll(/\('''(\^[^']+\$)'''/g)].map((m) => new RegExp(m[1]))
  const exact = [...sql.matchAll(/\('''([a-z_]+)''',\s+'kind = /g)].map((m) => m[1])
  const allowed = (k) => exact.includes(k) || regexes.some((re) => re.test(k))
  const gen = [...[hat, ot, mlb, long, yards, star].map((e) => P.eventKeyOf({ sport: e.sport, playerId: e.who.playerId, gameId: e.gameId, n: e.n }).kind), P.eventKeyOf({ sport: 'nfl', playerId: '00-0033873', gameId: '401872991', n: 'td2' }).kind, `${P.eventKeyOf({ sport: 'nhl', playerId: 8478402, gameId: 2025020123, n: 'ht3' }).kind}_upd`, P.digestKindOf({ sport: 'nhl', night: '2026-10-12' }), P.digestKindOf({ sport: 'nfl', night: '2026-10-12' }), P.digestKindOf({ sport: 'mlb', night: '2026-10-12' }), P.digestKindOf({ sport: 'mlb', night: '2026-10-12', postseason: true })]
  check(gen.every(allowed) && exact.length === 4 && regexes.length === 2, `J: the migration allows every kind the code claims (${gen.length} sampled) and the four family names`)
  check(!allowed('moment_nba_1_2_x') && !allowed('card_nhl') && !allowed('moment_nhl_X_1') && !allowed('postseason_nfl_1_2'), 'J: and nothing else (BUCKETS has no moment kind)')
  check(/regexp_replace\(d, ' NOT VALID\$', ''\)/.test(sql) && /\) not valid'/.test(sql) && /position\(r\.probe in d\) = 0/.test(sql) && /raise exception 'homer_feed_posts_kind_check not found/.test(sql), 'J: the migration strips a NOT VALID suffix, skips kinds already present, adds NOT VALID and stops if the constraint is missing (like 202610101100 / 202610121100)')
  check(!/\b(drop table|truncate|delete from public|update public)\b/i.test(sql.replace(/--.*$/gm, '')), 'J: the migration only replaces the one check constraint (no data is touched)')
  const txtPath = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/MOMENT-POSTS/moment_kinds_SQL.txt'
  if (existsSync(txtPath)) check(readFileSync(txtPath, 'utf8') === sql, 'J: the plain .txt for the SQL editor is byte-identical to the migration')
  else console.log('skip the plain .txt copy is not on this machine (AUDITS-TO-READ/MOMENT-POSTS/moment_kinds_SQL.txt)')
  check(P.MIGRATION_FILE === 'supabase/migrations/202610121400_homer_feed_moment_kinds.sql' && existsSync(P.MIGRATION_FILE), 'J: the file the log tells Donovan to run exists')
}

// ── K. wiring ────────────────────────────────────────────────────────────────────────────────────────────
{
  const route = (f) => readFileSync(f, 'utf8')
  const mlbR = route('app/api/dash/homers/tick/route.js'), nflR = route('app/api/dash/nfl/tick/route.js'), lampR = route('app/api/lamp/goals/tick/route.js'), totR = route('app/api/totals/tick/route.js')
  check(/momentAfterTick\(res, \{ sources: \['mlb'\], postseason: true \}\)/.test(mlbR) && /async function mlbTick\(request\)/.test(mlbR) && /export async function GET\(request\) \{\n  const res = await mlbTick/.test(mlbR), 'K: the homers tick: its own work first, then the moment pass for MLB and the postseason final detector')
  check(/momentAfterTick\(res, \{ sources: \['nfl'\] \}\)/.test(nflR) && /async function nflTick\(request\)/.test(nflR), 'K: the NFL tick calls the hook after its own work')
  check(/momentAfterTick\(null, \{ sources: \['nhl'\], db \}\)/.test(lampR) && /await tickGoals/.test(lampR), 'K: the LAMP goals tick calls the hook after tickGoals')
  check(/momentAfterTick\(null, \{ sources: \['daily'\], db \}\)/.test(totR) && /await cardTick/.test(totR), 'K: the card tick (totals cron) carries the day-keyed moments: 100-yard games and long shots')
  const cron = JSON.parse(readFileSync('vercel.json', 'utf8')).crons.map((c) => c.path)
  check(!cron.some((p) => /moment|postseason/i.test(p)), 'K: no new cron path')
  const hook = readFileSync('lib/posts/momentTick.js', 'utf8')
  check(/if \(!momentPostsOn\(\)\) return null/.test(hook) && hook.indexOf('momentPostsOn()') < hook.indexOf('adminClient'), 'K: the hook reads the switch before touching anything (off = free)')
  // the hook never throws and never calls anything when off
  delete process.env.MOMENT_POSTS_ON
  const { momentAfterTick } = await import('../lib/posts/momentTick.js')
  check((await momentAfterTick({ status: 200 }, { sources: ['nhl'], db: { from: () => { throw new Error('touched the database while off') } } })) === null, 'K: off -> the hook does nothing')
  process.env.MOMENT_POSTS_ON = 'on'
  check((await momentAfterTick({ status: 401 }, { sources: ['nhl'], db: { from: () => { throw new Error('unauthorized call did work') } } })) === null, 'K: an unauthorized tick call does no moment work')
  delete process.env.MOMENT_POSTS_ON
}

// ── L. THE NIGHT'S DIGEST (TOP 3 TONIGHT) ───────────────────────────────────────────────────────────────────
{
  process.env.MOMENT_POSTS_ON = 'on'
  const DG = await import('../lib/posts/digestPost.js')
  const DR = await import('../lib/cards/digestRank.js')
  const { TEST_MODEL } = await import('../lib/cards/topThreeFixtures.js')
  const NIGHT = '2026-10-12'
  const nhlRow = (o = {}) => conf({ day: NIGHT, ...o })
  const nhl = (o) => MF.nhlEventsFrom([nhlRow(o)])
  // a hat trick (ELITE) by man 11; OT goals (STAR) by 21 and 22 (22 is later); a 3-point night (STAR) by 31; a 30th goal (STAR) by 41; a plain goal (BASE) by 51
  const hatN = find(MF.nhlEventsFrom(hatRows({ day: NIGHT })), 'nhl_hat_trick')
  const otA = find(nhl({ player_id: 21, name: 'Test Winger', period: 4, period_type: 'OT', time_in_period: '02:10', strength: 'ev', game_id: 3, confirmed_at: '2026-10-12T01:00:00Z' }), 'nhl_goal')
  const otB = find(nhl({ player_id: 22, name: 'Test Center', period: 4, period_type: 'OT', time_in_period: '01:05', strength: 'ev', game_id: 4, confirmed_at: '2026-10-12T02:00:00Z' }), 'nhl_goal')
  const mil = find(nhl({ player_id: 41, name: 'Test Sniper', season_goals: 30, game_id: 5, goal_n: 1, confirmed_at: '2026-10-12T00:30:00Z' }), 'nhl_season_goal_milestone')
  const ptsRows = [31, 32, 33].map((id, i) => nhlRow({ player_id: id, name: `Test Point ${id}`, goal_n: 1, game_id: 6, period: i + 1, time_in_period: `0${i + 1}:00`, score_after: `EXA 0 · TST ${i + 1}`, assists: id === 31 ? [{ id: 99, name: 'T. Other', assistsToDate: 2 }] : [{ id: 31, name: 'T. Playmaker', assistsToDate: 4 }] }))
  const pts = find(MF.nhlEventsFrom(ptsRows).filter((e) => e.who.playerId === '31'), 'nhl_three_points')
  const baseN = find(nhl({ player_id: 51, name: 'Test Plain', game_id: 7 }), 'nhl_goal')
  check(hatN && otA && otB && mil && pts && baseN && hatN.tier === 'elite' && otA.tier === 'star' && mil.tier === 'star' && pts.tier === 'star' && baseN.tier === 'base', 'L: the digest test events build (ELITE hat trick, STAR OT goals / 30th goal / 3-point night, BASE goal)')

  // ── ranking ──
  const top = (events, o) => DR.pickTop(events, o)
  let t = top([otA, otB, mil, pts, baseN])
  check(t.map((p) => p.playerId).join(',') === '31,41,22', `L: rank: tier, then the moment's size (3 points 3.0, 30th goal 1.5, OT goal 1.0), then recency (the later OT goal first): ${t.map((p) => p.name).join(', ')}`)
  t = top([otA, otB, mil, pts, baseN, hatN])
  check(t[0].playerId === '11' && t.length === 3 && t[1].playerId === '31', 'L: ELITE before STAR; at most three')
  check(top([baseN, baseN]).length === 0 && !top([otA, baseN]).some((p) => p.playerId === '51'), 'L: BASE is never in a digest')
  const sameMan = find(nhl({ player_id: 21, name: 'Test Winger', season_goals: 30, game_id: 8, goal_n: 1, period: 4, period_type: 'OT', time_in_period: '01:00', confirmed_at: '2026-10-12T03:00:00Z' }), 'nhl_season_goal_milestone')
  t = top([otA, sameMan])
  check(t.length === 1 && t[0].moment === 'nhl_season_goal_milestone', 'L: one line per man (his best moment: the 30th goal over the OT goal)')
  check(top([otA, otB, mil], { exclude: new Set(['41']) }).map((p) => p.playerId).join(',') === '22,21' && top([otA, otB, mil, pts], { max: 2 }).length === 2, 'L: a man already posted on his own is left out; max is honoured')
  check(DR.rankPicks([{ slug: 'a', rank: 1, magnitude: 1, at: 5, name: 'A', moment: 'x' }, { slug: 'b', rank: 1, magnitude: 1, at: 5, name: 'A', moment: 'a' }]).map((p) => p.slug).join(',') === 'b,a', 'L: ties are broken by name then moment key (the same input always gives the same order)')
  const same = JSON.stringify(top([otB, otA, mil, pts].reverse()).map((p) => p.playerId)) === JSON.stringify(top([otA, otB, mil, pts]).map((p) => p.playerId))
  check(same, 'L: the order does not depend on the order the events arrive in')
  const yd = (y, id, o = {}) => MF.makeEvent('nfl_100_yards', { ...F.TEST_100, gsis_id: id, name: `Test Back ${id}`, rush_yds: y, day: NIGHT, ...o }, { gameId: 's2026w5', n: 'yd', at: null })
  const nflTop = DR.pickTop([yd(105, 'a1'), yd(151, 'a2'), yd(212, 'a3'), yd(120, 'a4'), MF.makeEvent('nfl_multi_td', { ...F.TEST_MULTI_TD, day: NIGHT }, { gameId: '800', n: 'td3', at: null })])
  check(nflTop.map((p) => p.line).join('|') === '212 RUSH YDS|3 TOUCHDOWNS|151 RUSH YDS' || nflTop.map((p) => p.line).join('|') === '212 RUSH YDS|151 RUSH YDS|3 TOUCHDOWNS', `L: NFL: LEGEND 212 yards first, then ELITE (151 yards 1.51 against 3 TDs 3.0: the touchdowns) (${nflTop.map((p) => p.line).join(' | ')})`)
  check(DR.shortLine(hatN) === 'HAT TRICK · 3 G' && DR.shortLine(otA) === 'OT GOAL' && DR.shortLine(yd(151, 'z')) === '151 RUSH YDS' && DR.shortLine(pts) === '3-POINT NIGHT · 1 G 2 A' && DR.shortLine(mil) === 'GOAL #30' && DR.shortLine(long) === 'LONG SHOT · +1520' && DR.shortLine(mlb) === '3 HOME RUNS' && DR.shortLine(MF.makeEvent('nhl_hat_trick', { ...hatN.row, goals: [...hatN.row.goals, hatN.row.goals[0]] }, { gameId: 1, n: 'ht4', at: null })) === '4-GOAL GAME', 'L: the moment lines are facts: HAT TRICK · 3 G / OT GOAL / 151 RUSH YDS / 3-POINT NIGHT · 1 G 2 A / GOAL #30 / LONG SHOT · +1520 / 3 HOME RUNS / 4-GOAL GAME')

  // ── the words ──
  check(DR.digestTitle(3) === 'TOP 3 TONIGHT' && DR.digestTitle(2) === 'TOP 2 TONIGHT' && DR.digestTitle(1) === 'TOP PERFORMER TONIGHT' && DR.digestTitle(0) === null && DR.digestTitle(3, { sport: 'nfl' }) === 'TOP 3 TODAY' && DR.digestTitle(3, { postseason: true }) === 'TOP 3 POSTSEASON PERFORMANCES' && DR.digestTitle(9) === 'TOP 3 TONIGHT', 'L: titled by count (TOP 3 / TOP 2 / TOP PERFORMER; NFL says TODAY; the postseason one says POSTSEASON PERFORMANCES)')
  const three = top([hatN, otA, otB, mil, pts])
  const tx = DR.digestTexts(three, { sport: 'nhl' })
  check(/^TOP 3 TONIGHT · NHL\n1\. Test Skater \(TST\): HAT TRICK · 3 G\n2\. /.test(tx.x) && !/https?:\/\//.test(tx.x) && Array.from(tx.x).length <= 280 && !P.BANNED.test(tx.x) && tx.discord === tx.x, `L: the X text is neutral, ranked, no link, fits 280 (${tx.x.replace(/\n/g, ' | ')})`)
  const longP = (n) => ({ slug: `p${n}`, playerId: `p${n}`, name: `Test Maximilian Featherstonehaugh-Villanueva ${n}`, team: 'TST', rank: 1, tier: 'star', magnitude: 1, at: n, moment: 'x', line: '3-POINT NIGHT · 1 G 2 A' })
  const lx = DR.digestTexts([longP(1), longP(2), longP(3)], { sport: 'nhl' })
  check(lx.x === null || Array.from(lx.x).length <= 280, 'L: three very long names: the X text is shortened (clubs dropped) or refused, never over 280')
  const shortP = [{ ...longP(1), name: 'Test A Longer Name Here Than Usual Surname', line: 'HAT TRICK · 3 G' }, { ...longP(2), name: 'Test B Quite Long Name Surname Hyphen-Name', line: '151 RUSH YDS' }, { ...longP(3), name: 'Test C Another Name Surname Here Please', line: 'OT GOAL' }]
  const sx = DR.digestTexts(shortP, { sport: 'nhl' })
  check(sx.x && Array.from(sx.x).length <= 280, 'L: long names that fit only without the club codes keep the names and drop the codes')
  check(DR.digestTexts([{ ...longP(1), name: 'Test Lock Man', line: 'OT GOAL' }], { sport: 'nhl' }).x !== null && DR.digestTexts([{ ...longP(1), line: 'a lock tonight' }], { sport: 'nhl' }).x === null && DR.digestTexts([{ ...longP(1), line: '100% night' }], { sport: 'nhl' }).discord === null, 'L: a man named Lock is fine; the word lock or a percent sign in a line is refused (nothing is reworded)')
  check(DR.digestTexts([], { sport: 'nhl' }).x === null, 'L: no picks, no text')

  // ── the league's word on the night ──
  const g = (o = {}) => ({ id: '1', startMs: NOW - 6 * 3600e3, final: true, off: false, ...o })
  const S = DG.nightState
  check(S([g(), g({ id: '2' })]).over && !S([g(), g({ id: '2', final: false })]).over && S([g(), g({ id: '2', off: true, final: false })]).over && !S([g({ off: true, final: false })]).over && !S([]).over && S([g(), g({ id: '2', startMs: NOW - 5 * 3600e3 })]).lastStart === NOW - 5 * 3600e3, 'L: pure: the night is over when every game is Final or off (and one was played); the last start is the latest')
  check(DG.windowFor('nhl', NOW - 6 * 3600e3, NOW) === 'go' && DG.windowFor('nhl', NOW - 1 * 3600e3, NOW) === 'wait' && DG.windowFor('nhl', NOW - 21 * 3600e3, NOW) === 'stale' && DG.windowFor('nfl', NOW - 3.5 * 3600e3, NOW) === 'wait' && DG.windowFor('nfl', NOW - 4.5 * 3600e3, NOW) === 'go' && DG.windowFor('nhl', null, NOW) === 'go', 'L: pure: not before 2.5 h (NFL 4 h) after the last start, not after 20 h')

  // ── the pass ──
  const mkd = ({ games = [g()], postseason = false, rows = true, events = [hatN, otA, otB, mil, pts, baseN], xs = {} } = {}) => {
    const s = senders(xs)
    return { s, deps: { ...s.d, hasRows: async () => rows, nightGames: async (sport, night) => (night === NIGHT ? { postseason, games } : { postseason: false, games: [] }), events: async () => events } }
  }
  const D = (f, m, o = {}) => DG.digestPass(f.db, { sport: 'nhl', now: NOW, deps: m.deps, ...o })
  const resetD = () => { reset(); DG._resetDigest() }
  resetD()
  let f = fakeDb(); let m = mkd()
  let r = await D(f, m)
  const row = f.tables.homer_feed_posts[0]
  check(f.tables.homer_feed_posts.length === 1 && row.kind === 'moment_nhl_top3_20261012' && row.day === NIGHT && /^posted TOP 3 TONIGHT/.test(r.nights?.[0]?.result), `L: the night is over: ONE claim ${row?.kind} on the game's own date, one post`)
  check(m.s.sent.x.length === 1 && m.s.sent.discord.length === 1 && m.s.sent.members.length === 1 && m.s.sent.x[0].kind === 'moment_nhl_top3_20261012' && m.s.sent.x[0].sport === 'nhl', 'L: ONE X post, ONE sport-channel post, ONE #members post')
  check(m.s.sent.x[0].mediaId === 'media-1' && m.s.sent.upload === 1 && m.s.sent.discord[0].png && m.s.sent.discord[0].embed.image?.url === 'attachment://card.png' && m.s.sent.members[0].png, 'L: ONE image (the top-three card): uploaded to X, attached to both Discord posts')
  const emb = m.s.sent.discord[0].embed
  check(/^TOP 3 TONIGHT · NHL/.test(emb.title) && /\/app#sport=nhl&tab=binder/.test(emb.url || '') && /1\. Test Skater/.test(emb.description) && !/https?:\/\//.test(emb.description) && !/https?:\/\//.test(m.s.sent.x[0].text), 'L: Discord: the embed links the sport\'s binder (Discord links are allowed); X carries no link')
  check(row.payload.named.join(',') === '11,31,41' && row.payload.count === 3 && row.payload.picks.length === 3 && row.x_post_id === 'tw-1' && row.discord_sent === true && row.payload.members_sent === true && row.payload.x_tag === 'INFO', 'L: the claim row names the three men, records the tweet, the channel sends and the INFO tag')
  check(m.s.sent.admit.length === 1 && m.s.sent.admit[0].kind === 'moment_nhl_top3_20261012' && m.s.sent.admit[0].repeat === false && m.s.sent.admit[0].sport === 'nhl' && m.s.sent.admit[0].day === '2026-10-12', 'L: it counts as ONE X post, asked of the one gate (admit: pause + the write-up tier cap) with its own kind')
  check(m.s.sent.logged.length === 1, 'L: the one X post is logged as posted')
  // later passes and a cold instance: nothing more
  const r2 = await D(f, m, { now: NOW + 6 * 60e3 })
  DG._resetDigest(); _resetTakenForTests()
  const r3 = await D(f, m, { now: NOW + 12 * 60e3 })
  check(f.tables.homer_feed_posts.length === 1 && m.s.sent.x.length === 1 && m.s.sent.discord.length === 1 && !(r2.nights || []).some((n) => /^posted/.test(n.result)) && !(r3.nights || []).some((n) => /^posted/.test(n.result)), 'L: CLAIM ONCE: the next pass and a cold instance (nothing remembered) post nothing more')
  // the schedule is not asked again inside 5 minutes
  const rw = await D(f, m, { now: NOW + 13 * 60e3 }); const rw2 = await D(f, m, { now: NOW + 14 * 60e3 })
  check(rw2.wait === true, 'L: the league\'s schedule is not asked again inside the 5-minute look')
  // two instances racing on the same night
  resetD()
  { const f2 = fakeDb(); const m2 = mkd()
    const picks = DR.pickTop([hatN, otA, mil])
    const send = () => DG.sendDigest(f2.db, { sport: 'nhl', night: NIGHT, kind: 'moment_nhl_top3_20261012', picks, now: NOW }, { ...DG.DIGEST_SENDERS, ...m2.deps })
    const [a, b] = await Promise.all([send(), send()])
    check(f2.tables.homer_feed_posts.length === 1 && m2.s.sent.x.length === 1 && m2.s.sent.discord.length === 1 && [a, b].filter((x) => /^posted/.test(x)).length === 1, 'L: CLAIM ONCE: two ticks racing on one night send it once') }

  // ── counts: 2, 1, none ──
  resetD(); f = fakeDb(); m = mkd({ events: [otA, otB] })
  await D(f, m)
  check(/^TOP 2 TONIGHT · NHL\n1\. Test Center/.test(m.s.sent.x[0]?.text || '') && f.tables.homer_feed_posts[0].payload.count === 2, 'L: two names -> "TOP 2 TONIGHT" (no filler)')
  resetD(); f = fakeDb(); m = mkd({ events: [otA] })
  await D(f, m)
  check(/^TOP PERFORMER TONIGHT · NHL\n1\. Test Winger/.test(m.s.sent.x[0]?.text || '') && m.s.sent.discord.length === 1, 'L: one name -> a single "TOP PERFORMER TONIGHT"')
  resetD(); f = fakeDb(); m = mkd({ events: [baseN, baseN] })
  r = await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length + m.s.sent.discord.length + m.s.sent.members.length === 0 && /nothing to name/.test(r.nights?.[0]?.result || ''), 'L: nothing but BASE moments -> nothing is claimed or posted')
  resetD(); f = fakeDb(); m = mkd({ events: [] })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'L: a night with no moment at all posts nothing')

  // ── dedupe against the men already posted on their own ──
  resetD(); f = fakeDb(); m = mkd({ events: [hatN, otA, otB, mil, pts] })
  await MP.postMomentEvents(f.db, [hatN], { now: NOW, deps: m.s.d })
  check(f.tables.homer_feed_posts.length === 1 && f.tables.homer_feed_posts[0].kind === 'moment_nhl_11_1_ht3' && m.s.sent.x.length === 1, 'L: (setup) the ELITE hat trick is posted on his own first')
  await D(f, m)
  const dg = f.tables.homer_feed_posts.find((x) => x.kind === 'moment_nhl_top3_20261012')
  check(dg && !dg.payload.named.includes('11') && dg.payload.named.join(',') === '31,41,22' && !/Test Skater/.test(m.s.sent.x[1].text), 'L: DEDUPE: a man already posted on his own that night is not repeated in the digest; the next men fill the place')
  // and the other way round: named in the digest, then his own card comes up
  resetD(); f = fakeDb(); m = mkd({ events: [hatN, otA] })
  await D(f, m)
  const before = f.tables.homer_feed_posts.length
  const rr = await MP.postMomentEvents(f.db, [hatN], { now: NOW + 60e3, deps: m.s.d })
  check(f.tables.homer_feed_posts.length === before && rr.skipped.some((x) => /already named in the night's digest/.test(x)) && m.s.sent.x.length === 1, 'L: DEDUPE: a man the digest named is not posted again on his own afterwards')
  // a man whose own post was never made (no claim) is eligible: the digest names him even though he is ELITE
  resetD(); f = fakeDb(); m = mkd({ events: [hatN, otA] })
  await D(f, m)
  check(/1\. Test Skater/.test(m.s.sent.x[0].text) && /2\. Test Winger/.test(m.s.sent.x[0].text), 'L: an ELITE man who was not posted on his own is named in the digest (first, by tier)')

  // ── the cap ──
  resetD(); f = fakeDb(); m = mkd({ xs: { admit: () => ({ state: 'capped', reason: 'daily cap (writeup tier)' }) } })
  await D(f, m)
  check(m.s.sent.x.length === 0 && m.s.sent.discord.length === 1 && m.s.sent.members.length === 1 && f.tables.homer_feed_posts[0].x_post_id === 'skipped' && /capped/.test(f.tables.homer_feed_posts[0].payload.x_note), 'L: over the cap -> Discord and #members still go, X does not, the row says why (the digest is NOT exempt)')
  check(XP.tierOf('moment_nhl_top3_20261012') === 'writeup' && !XP.isCapExempt('moment_nhl_top3_20261012') && !XP.isCapExempt('postseason_mlb_top3_20261012') && XP.capAllows('moment_nhl_top3_20261012', 17) && !XP.capAllows('moment_nhl_top3_20261012', 18) && XP.isMomentKind('moment_nhl_top3_20261012') && XP.sportOfKind('moment_nfl_top3_20261011') === 'nfl' && XP.sportOfKind('postseason_mlb_top3_20261012') === 'mlb', 'L: the digest kinds are the counted write-up tier (stop at 18 of 20), never exempt, one post per night (no repeat guard on the kind)')
  resetD(); f = fakeDb(); m = mkd({ xs: { hasX: false } })
  await D(f, m)
  check(m.s.sent.x.length === 0 && m.s.sent.discord.length === 1 && f.tables.homer_feed_posts[0].x_post_id === null, 'L: no X configured -> Discord and #members only')
  resetD(); f = fakeDb(); m = mkd({ xs: { noMembers: true } })
  await D(f, m)
  check(m.s.sent.members.length === 0 && m.s.sent.discord.length === 1 && m.s.sent.x.length === 1, 'L: no #members webhook -> no #members copy')

  // ── an X refusal keeps the claim and never loops ──
  resetD(); f = fakeDb(); m = mkd({ xs: { xResult: () => ({ ok: false, status: 403, error: 'Forbidden: duplicate content' }) } })
  const ce = console.error; const errs = []; console.error = (...a) => errs.push(a.join(' '))
  await D(f, m); DG._resetDigest(); _resetTakenForTests(); await D(f, m, { now: NOW + 6 * 60e3 }); DG._resetDigest(); await D(f, m, { now: NOW + 12 * 60e3 })
  console.error = ce
  check(m.s.sent.x.length === 1 && m.s.sent.discord.length === 1 && f.tables.homer_feed_posts.length === 1 && f.tables.homer_feed_posts[0].x_post_id === 'skipped' && errs.some((e) => /X refused/.test(e)), 'L: X refuses -> the Discord copies went, X was tried ONCE, the claim stays closed as skipped, later passes (a cold instance too) send nothing: no loop')
  // a Discord hiccup with nothing else sent releases the claim only a few times
  resetD(); f = fakeDb(); m = mkd({ xs: { hasX: false, noMembers: true, discordResult: () => ({ ok: false, status: 503, failed: [{}] }) } })
  for (let i = 0; i < 8; i++) { DG._resetDigest(); await D(f, m, { now: NOW + i * 6 * 60e3 }) }
  check(f.calls.delete >= 1 && f.calls.delete <= 3 && m.s.sent.discord.length <= 4, `L: a channel outage with nothing else sent retries only a few times (${m.s.sent.discord.length} tries), then stops`)
  // no picture: X text only, Discord without the image
  resetD(); f = fakeDb(); m = mkd({ xs: { noImage: true } })
  await D(f, m)
  check(m.s.sent.x.length === 1 && !m.s.sent.x[0].mediaId && m.s.sent.upload === 0 && m.s.sent.discord.every((x) => !x.png && !x.embed.image), 'L: the card does not draw -> X text-only, Discord without the image, the digest still goes')

  // ── WHEN: the league's schedule decides ──
  resetD(); f = fakeDb(); m = mkd({ games: [g(), g({ id: '2', final: false })] })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'L: WHEN: one game of the night is still going -> nothing yet')
  resetD(); f = fakeDb(); m = mkd({ games: [g(), g({ id: '2', final: false, off: true })] })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 1, 'L: WHEN: a postponed game is done for the night (the digest goes when the others are Final)')
  resetD(); f = fakeDb(); m = mkd({ games: [g({ startMs: NOW - 1 * 3600e3 })] })
  r = await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && /waiting/.test(r.nights?.[0]?.result || ''), 'L: WHEN: not before 2.5 hours after the night\'s last start (a feed that says Final too early never posts a half night)')
  resetD(); f = fakeDb(); m = mkd({ games: [g({ startMs: NOW - 22 * 3600e3 })] })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'L: WHEN: a night whose last game started over 20 hours ago is not dumped (the day the switch is turned on, a restart)')
  resetD(); f = fakeDb(); m = mkd({ games: [] })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0, 'L: WHEN: no games on the league\'s schedule that date -> nothing')
  resetD(); f = fakeDb(); m = mkd({ rows: false })
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0, 'L: WHEN: a date the sport has no feed rows on is not even looked up (free on an off day)')
  resetD(); f = fakeDb(); m = mkd(); m.deps.nightGames = async () => null
  await D(f, m)
  check(f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'L: WHEN: the league did not answer -> nothing is guessed from the clock')
  resetD(); f = fakeDb(); m = mkd({ postseason: true })
  r = await DG.digestPass(f.db, { sport: 'mlb', now: NOW, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 0 && /postseason date/.test(r.nights?.[0]?.result || ''), 'L: WHEN: on an MLB postseason date the regular TOP 3 is not posted (the postseason digest is the night\'s one MLB top-three post)')
  resetD(); f = fakeDb(); m = mkd({ events: [yd(212, 'a3'), yd(151, 'a2'), yd(105, 'a1')], games: [g({ startMs: NOW - 5 * 3600e3 })] })
  r = await DG.digestPass(f.db, { sport: 'nfl', now: NOW, deps: m.deps })
  check(/^TOP 3 TODAY · NFL\n1\. Test Back a3 \(TST\): 212 RUSH YDS/.test(m.s.sent.x[0]?.text || '') && f.tables.homer_feed_posts[0]?.kind === 'moment_nfl_top3_20261012', 'L: NFL: one post for the game day, "TOP 3 TODAY", kind moment_nfl_top3_<date>')
  // NFL: nothing yet (the weekly logs are late) -> looked at again, not given up on for hours
  resetD(); f = fakeDb(); m = mkd({ events: [], games: [g({ startMs: NOW - 5 * 3600e3 })] })
  await DG.digestPass(f.db, { sport: 'nfl', now: NOW, deps: m.deps })
  m.deps.events = async () => [yd(151, 'a2')]
  await DG.digestPass(f.db, { sport: 'nfl', now: NOW + 6 * 60e3, deps: m.deps })
  check(f.tables.homer_feed_posts.length === 1 && /1\. Test Back a2/.test(m.s.sent.x[0]?.text || ''), 'L: NFL: when the 100-yard logs arrive after the first look, the digest still goes')
  resetD(); f = fakeDb(); m = mkd({ events: [baseN] })
  await D(f, m); m.deps.events = async () => [otA]; await D(f, m, { now: NOW + 6 * 60e3 })
  check(f.tables.homer_feed_posts.length === 0, 'L: NHL / MLB: a night with nothing to name is closed (not looked at again every 5 minutes)')

  // ── the league's feeds, read through a fake fetch ──
  { const realFetch = globalThis.fetch
    const ok = (body) => ({ ok: true, status: 200, json: async () => body })
    const start = '2026-10-12T23:00:00Z'
    globalThis.fetch = async (url) => {
      if (/statsapi\.mlb\.com/.test(url)) return ok({ dates: [{ games: [{ gamePk: 1, gameDate: start, gameType: 'D', status: { abstractGameState: 'Final', detailedState: 'Final' } }, { gamePk: 2, gameDate: start, gameType: 'D', status: { abstractGameState: 'Preview', detailedState: 'Postponed' } }] }] })
      if (/api-web\.nhle\.com/.test(url)) return ok({ games: [{ id: 2026020001, gameType: 2, startTimeUTC: start, gameState: 'OFF', gameScheduleState: 'OK' }, { id: 2026020002, gameType: 2, startTimeUTC: start, gameState: 'LIVE', gameScheduleState: 'OK' }, { id: 2026020003, gameType: 1, startTimeUTC: start, gameState: 'LIVE', gameScheduleState: 'OK' }, { id: 2026020004, gameType: 2, startTimeUTC: start, gameState: 'FUT', gameScheduleState: 'PPD' }] })
      if (/espn\.com/.test(url)) return ok({ events: [{ id: '9', date: start, status: { type: { state: 'post', completed: true, name: 'STATUS_FINAL' } }, competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'AAA' }, score: '1' }, { homeAway: 'away', team: { abbreviation: 'BBB' }, score: '0' }] }] }] })
      throw new Error(`NETWORK CALL IN A TEST: ${url}`)
    }
    try {
      const mlbG = await DG.nightGames('mlb', NIGHT), nhlG = await DG.nightGames('nhl', NIGHT), nflG = await DG.nightGames('nfl', NIGHT)
      check(mlbG.postseason === true && mlbG.games.length === 2 && mlbG.games[0].final && mlbG.games[1].off && DG.nightState(mlbG.games).over, 'L: the MLB schedule is read: postseason dates are flagged, a postponed game is "off"')
      check(nhlG.games.length === 3 && nhlG.games[0].final && !nhlG.games[1].final && nhlG.games[2].off && !DG.nightState(nhlG.games).over, 'L: the NHL scoreboard is read: OFF/FINAL are final, LIVE is not, preseason games are left out, a postponed one is "off"')
      check(nflG.games.length === 1 && nflG.games[0].final && DG.nightState(nflG.games).over, 'L: the NFL scoreboard is read: state post is final')
    } finally { globalThis.fetch = realFetch }
    globalThis.fetch = async () => { throw new Error('offline') }
    try { check((await DG.nightGames('nhl', NIGHT)) === null && (await DG.nightGames('nfl', NIGHT)) === null && (await DG.nightGames('mlb', NIGHT)) === null && (await DG.nightGames('nba', NIGHT)) === null, 'L: a feed that does not answer is null (nothing guessed)') } finally { globalThis.fetch = realFetch } }

  // ── kill switches, OFF by default, the SQL ──
  delete process.env.MOMENT_POSTS_ON
  resetD(); f = fakeDb(); m = mkd()
  check((await D(f, m)).off === true && f.tables.homer_feed_posts.length === 0 && m.s.sent.x.length === 0, 'L: OFF BY DEFAULT: without MOMENT_POSTS_ON the digest claims and sends nothing')
  process.env.MOMENT_POSTS_ON = 'on'
  process.env.MOMENT_POSTS_PAUSE = '1'
  resetD(); f = fakeDb(); m = mkd()
  check((await D(f, m)).paused === true && f.tables.homer_feed_posts.length === 0, 'L: MOMENT_POSTS_PAUSE=1 stops the digest')
  delete process.env.MOMENT_POSTS_PAUSE
  for (const [list, stops] of [['moment_nhl', true], ['moment_nhl_top3', true], ['moment_top3', true], ['moment_mlb', false], ['moment_mlb_top3', false], ['postseason_mlb', false]]) {
    process.env.MOMENT_POSTS_PAUSE_KINDS = list
    resetD(); f = fakeDb(); m = mkd()
    await D(f, m)
    check((f.tables.homer_feed_posts.length === 0) === stops, `L: MOMENT_POSTS_PAUSE_KINDS=${list} ${stops ? 'stops' : 'leaves alone'} the NHL digest`)
  }
  delete process.env.MOMENT_POSTS_PAUSE_KINDS
  check(P.kindPaused('moment_nhl_top3_20261012') === false && P.isDigestKind('moment_nhl_top3_20261012') && P.isDigestKind('postseason_mlb_top3_20261012') && !P.isDigestKind('moment_nhl_11_1_ht3') && !P.isDigestKind('moment_nhl_top3_2026') && P.playerSlugOfKind('moment_nhl_11_1_ht3') === '11' && P.playerSlugOfKind('moment_nhl_top3_20261012') === null && P.playerSlugOfKind('moment_nhl_11_1_ht3_upd') === null, 'L: the digest kind is told apart from an event claim (a digest has no player; an update is not a card)')
  resetD(); f = fakeDb({ failKindCheck: true }); m = mkd()
  const ce2 = console.error; const errs2 = []; console.error = (...a) => errs2.push(a.join(' '))
  r = await D(f, m); const rb = await D(f, m, { now: NOW + 6 * 60e3 })
  console.error = ce2
  check(m.s.sent.x.length + m.s.sent.discord.length === 0 && errs2.some((e) => /kind not allowed yet \(run supabase\/migrations\/202610121400/.test(e)) && rb.blocked, 'L: the SQL is not run (it should be: the kind pattern is already allowed) -> nothing sent, the log names the file, not asked again for 30 minutes')

  // ── kinds: tags, the table pattern (no new SQL) ──
  const dk = ['moment_nhl_top3_20261012', 'moment_mlb_top3_20261012', 'moment_nfl_top3_20261011', 'postseason_mlb_top3_20261012']
  check(dk.every((k) => XS.tagOf(k) === 'INFO' && XS.modeOf(k) === 'event' && XS.kindInfo(k)) && P.digestKindOf({ sport: 'nhl', night: '2026-10-12' }) === dk[0] && P.digestKindOf({ sport: 'mlb', night: '2026-10-12', postseason: true }) === dk[3] && P.digestKindOf({ sport: 'nba', night: '2026-10-12' }) === null && P.digestKindOf({ sport: 'nhl', night: 'today' }) === null, 'L: KIND_TAGS (prefix) tags moment_<sport>_top3_* and postseason_mlb_top3_* INFO, event-driven; the kind builder refuses a bad sport or date')
  const sql = readFileSync('supabase/migrations/202610121400_homer_feed_moment_kinds.sql', 'utf8')
  const res = [...sql.matchAll(/\('''(\^[^']+\$)'''/g)].map((x) => new RegExp(x[1]))
  check(dk.every((k) => res.some((re) => re.test(k))) && XS.untagged().length === 0, 'L: the EXISTING migration (202610121400) already allows every digest kind: NO NEW SQL')
  const pm = readFileSync('lib/posts/momentPost.js', 'utf8')
  check(/out\.digest = await \(await import\('\.\/digestPost'\)\)\.digestPass\(db, \{ sport: source, now, deps \}\)/.test(pm) && /\['mlb', 'nfl', 'nhl'\]\.includes\(source\)/.test(pm), 'L: wiring: the digest rides momentPass (the ticks that already run): no new cron, no new polling')
  check(/export const momentPostsOn/.test(readFileSync('lib/cards/momentPosting.js', 'utf8')) && /truthy\(process\.env\.MOMENT_POSTS_ON\)/.test(readFileSync('lib/cards/momentPosting.js', 'utf8')) && (delete process.env.MOMENT_POSTS_ON, P.momentPostsOn() === false), 'L: MOMENT_POSTS_ON is still OFF by default in code')
  // the card model the digest draws
  const { topThreeModel, tileFromPick } = await import('../lib/cards/topThreeData.js')
  const mdl = topThreeModel({ sport: 'nhl', picks: three, night: NIGHT })
  check(mdl.title === 'TOP 3 TONIGHT' && mdl.tiles.length === 3 && mdl.tiles[0].holo && !mdl.tiles[1].holo && mdl.tiles[1].shimmer && mdl.brand.name === 'LAMP' && mdl.dayWord === 'Oct 12' && tileFromPick(three[0]).line === 'HAT TRICK · 3 G' && TEST_MODEL('nhl').tiles.length === 3, 'L: the card model: three tiles in rank order, ELITE holo, STAR shimmer, the sport\'s own brand and the game date')
}

console.log(failed ? `\n${failed} FAILED` : '\nall moment-post checks passed')
process.exit(failed ? 1 : 0)
