#!/usr/bin/env node
// LAMP GOALS — offline check of the goal feed, the push and the post
// (BATCH-LAMP-GOALS-PLAN steps 1, 2, 4). TEST DATA ONLY: a real saved league
// payload (scripts/fixtures/TEST-nhl-score-2026-03-20.json) run through
// lib/nhl/goalFeed.js tickGoals against an in-memory table, with a made-up
// TEST lock and TEST follow list. Nothing here touches Supabase, X or a phone.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-goals.mjs
// Exit 1 on any failed check.
import { readFileSync } from 'node:fs'
import { reduceScoreDay } from '../lib/nhl/reduce.js'
import { tickGoals, matchGame, labelGoals, pushText, postText, CONFIRM_MS, POST_AFTER_MS } from '../lib/nhl/goalFeed.js'
import { audienceFrom, nhlEventsFrom, wants } from '../lib/dash/pushRules.js'
import { _resetXFail } from '../lib/dash/xFail.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const clone = (x) => JSON.parse(JSON.stringify(x))

const RAW = JSON.parse(readFileSync(new URL('./fixtures/TEST-nhl-score-2026-03-20.json', import.meta.url)))
const TOR = 2025021094   // CAR 4 @ TOR 3 (OT): 7 goals -- PP, SH, penalty shot, OT
const WSH = 2025021095   // NJD 1 @ WSH 2: no TEST lock -> status null
const T0 = Date.parse('2026-03-21T01:30:00Z')

/** The fixture as a live day: the games' own facts, re-dated so they are active at `now`. */
function dayFrom(raw, mutate = () => {}) {
  const p = clone(raw)
  mutate(p)
  return reduceScoreDay(p).games
}
const gameOf = (p, id) => p.games.find((g) => g.id === id)

// TEST lock: two TOR-game scorers labelled by hand (NOT the model's output).
const TEST_LOCK = [
  { game_id: TOR, player_id: 8477939, status: 'called', rank_in_game: 1, score: 81 },   // Nylander
  { game_id: TOR, player_id: 8475166, status: 'board', rank_in_game: 5, score: 64 },    // Tavares
  { game_id: TOR, player_id: 8400000, status: 'called', rank_in_game: 2, score: 77 },   // a skater who didn't score
]

function memoryStore(lock = TEST_LOCK) {
  const t = { feed: [], multi: [], lockReads: 0 }
  const key = (r) => `${r.game_id}|${r.player_id}|${r.goal_n}`
  let clock = T0
  return {
    t, setClock: (ms) => { clock = ms },
    existing: async (ids) => t.feed.filter((r) => ids.map(Number).includes(Number(r.game_id))),
    locks: async (ids) => { t.lockReads += 1; return lock.filter((r) => ids.map(Number).includes(Number(r.game_id))) },
    insert: async (rows) => {
      const have = new Set(t.feed.map(key))
      const fresh = rows.filter((r) => !have.has(key(r))).map((r) => ({ ...r, first_seen_at: new Date(clock).toISOString(), confirmed_at: null, overturned_at: null, x_post_id: null, push_sent: false }))
      t.feed.push(...fresh)
      return fresh.map((r) => ({ ...r }))
    },
    confirm: async (row, at) => { const r = t.feed.find((x) => key(x) === key(row)); if (r && !r.confirmed_at && !r.overturned_at) r.confirmed_at = at },
    overturn: async (row, at) => { const r = t.feed.find((x) => key(x) === key(row)); if (r && !r.overturned_at) r.overturned_at = at },
    upsertMulti: async (rows) => { for (const m of rows) { t.multi = t.multi.filter((x) => !(x.game_id === m.game_id && x.player_id === m.player_id)); t.multi.push(m) } },
    deleteMulti: async ({ game_id, player_id }) => { t.multi = t.multi.filter((x) => !(x.game_id === game_id && x.player_id === player_id)) },
    countMulti: async (season, pid) => t.multi.filter((x) => x.season === season && x.player_id === pid).length,
    claimPost: async (row) => { const r = t.feed.find((x) => key(x) === key(row)); if (!r || r.x_post_id || r.overturned_at) return false; r.x_post_id = 'posting'; return true },
    finishPost: async (row, id) => { const r = t.feed.find((x) => key(x) === key(row)); if (r) r.x_post_id = id },
  }
}
const quiet = { log() {}, error() {} }
const run = (store, games, now, poster = null) => { store.setClock(now); return tickGoals({ games, now, store, poster, modelVersion: 'lamp-goal-v1', log: quiet }) }
const torRows = (s) => s.t.feed.filter((r) => r.game_id === TOR)

// ── 1. first sight, idempotence, the label, SO ─────────────────────────────
{
  const s = memoryStore()
  const games = dayFrom(RAW)
  const r1 = await run(s, games, T0)
  check(torRows(s).length === 7, `CAR@TOR: 7 goals -> 7 rows (got ${torRows(s).length})`)
  check(r1.active === 5 && s.t.feed.length === 25, `all 5 finals inside the window, 25 rows (got ${r1.active} / ${s.t.feed.length})`)
  const r2 = await run(s, games, T0 + 10e3)
  check(r2.inserted === 0 && torRows(s).length === 7, 'run twice -> still 7 rows, nothing inserted')
  const ny = torRows(s).find((r) => r.player_id === 8477939)
  const tav = torRows(s).find((r) => r.player_id === 8475166)
  const jo = torRows(s).find((r) => r.player_id === 8478057)
  check(ny.status === 'called' && ny.rank_in_game === 1 && ny.lamp_score === 81, 'TEST-called scorer wears CALLED, rank 1, score 81 from the lock')
  check(tav.status === 'board' && tav.rank_in_game === 5, 'TEST-board scorer wears ON THE BOARD #5')
  check(jo.status === 'off', 'a scorer absent from a locked game is NOT ON THE BOARD (off)')
  check(s.t.feed.filter((r) => r.game_id === WSH).every((r) => r.status === null && r.model_version === null), 'a game with no lock: status null on every goal')
  check(torRows(s).find((r) => r.player_id === 8480817).strength === 'sh' && torRows(s).find((r) => r.player_id === 8482100).period_type === 'OT', 'SH and OT carried from the feed')
  check(ny.day === '2026-03-20' && ny.opp === 'CAR' && ny.name === 'William Nylander' && ny.score_after === 'CAR 3 · TOR 3', `day = game date, opp, full name, score after (${ny.day} ${ny.opp} ${ny.name} ${ny.score_after})`)
  check(torRows(s).every((r) => !r.confirmed_at), 'nothing confirmed before 90 s')

  // SO goal: never a row (a final decided in a shootout carries +1 for the winner)
  const so = dayFrom(RAW, (p) => {
    const g = gameOf(p, WSH)
    g.gameOutcome = { lastPeriodType: 'SO' }; g.homeTeam.score += 1
    g.goals.push({ ...clone(g.goals[0]), periodDescriptor: { number: 5, periodType: 'SO', maxRegulationPeriods: 3 }, timeInPeriod: '00:00', playerId: 8499999 })
  })
  const wshBefore = s.t.feed.filter((r) => r.game_id === WSH).length
  await run(s, so, T0 + 20e3)
  check(s.t.feed.filter((r) => r.game_id === WSH).length === wshBefore && !s.t.feed.some((r) => r.player_id === 8499999), 'a shootout goal -> no row')
}

// ── 2. confirm, overturn, an inconsistent read, the post ───────────────────
{
  const s = memoryStore()
  const posts = []
  const poster = { post: async (text) => { posts.push(text); return { ok: true, id: `TEST${posts.length}` } } }
  await run(s, dayFrom(RAW), T0, poster)
  // Tavares's goal (2nd, 13:47) comes off: TOR's score drops by one, so the read is consistent.
  const waved = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); g.goals = g.goals.filter((x) => x.playerId !== 8475166); g.homeTeam.score -= 1 })
  const r = await run(s, waved, T0 + CONFIRM_MS + 5e3, poster)
  const tav = torRows(s).find((x) => x.player_id === 8475166)
  check(tav.overturned_at && !tav.confirmed_at, 'goal missing from a consistent read -> overturned_at, never confirmed')
  check(r.confirmed === 24 && torRows(s).filter((x) => x.confirmed_at).length === 6, `the other 6 TOR goals confirmed after 90 s (got ${torRows(s).filter((x) => x.confirmed_at).length})`)
  check(posts.length === 0, 'no post before confirmation + 3 min')
  // A read that doesn't add up (goal gone, score not moved) never overturns.
  const s2 = memoryStore()
  await run(s2, dayFrom(RAW), T0)
  const glitch = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); g.goals = g.goals.filter((x) => x.playerId !== 8478057) })
  const r2 = await run(s2, glitch, T0 + CONFIRM_MS + 5e3)
  check(r2.overturned === 0 && r2.held.length === 1, 'inconsistent read (goal gone, score unchanged) -> held, nothing overturned')

  await run(s, waved, T0 + CONFIRM_MS + 5e3 + POST_AFTER_MS + 1e3, poster)
  check(posts.length === 1 && posts[0].includes('WILLIAM NYLANDER SCORES.'), `exactly one post, the CALLED scorer (got ${posts.length})`)
  check(posts[0].startsWith('🤖 CALLED IT') && posts[0].includes('The top skater on his team on the LAMP board') && posts[0].includes('LAMP score 81 · Even strength, 3rd period') && posts[0].includes('Called before puck drop.') && !/https?:/.test(posts[0]), 'post text: headline, board line, score + strength + period, no link')
  console.log(`\n--- TEST post ---\n${posts[0]}\n-----------------\n`)
  await run(s, waved, T0 + CONFIRM_MS + POST_AFTER_MS + 60e3, poster)
  check(posts.length === 1, 'the next tick does not post it again')
  // preseason: the same goal in a game_type 1 game never posts
  const s3 = memoryStore()
  const pre = []
  const pp = { post: async (t) => { pre.push(t); return { ok: true, id: 'x' } } }
  const preDay = dayFrom(RAW, (p) => { gameOf(p, TOR).gameType = 1 })
  await run(s3, preDay, T0, pp); await run(s3, preDay, T0 + CONFIRM_MS + 1e3, pp); await run(s3, preDay, T0 + CONFIRM_MS + POST_AFTER_MS + 2e3, pp)
  check(pre.length === 0 && torRows(s3).length === 7, 'preseason: rows written, never posted')
}

// ── 3. scoring change, a nudged clock, a re-score after an overturn ───────
{
  const s = memoryStore()
  await run(s, dayFrom(RAW), T0)
  const nudged = dayFrom(RAW, (p) => { gameOf(p, TOR).goals.find((x) => x.playerId === 8478057).timeInPeriod = '11:46' })
  const r = await run(s, nudged, T0 + CONFIRM_MS + 1e3)
  check(r.inserted === 0 && r.overturned === 0 && torRows(s).length === 7, 'goal time nudged 2 s -> same row, no new row, no overturn')
  // Scoring change: Joshua's goal re-credited to Groulx (8480870).
  const moved = dayFrom(RAW, (p) => { const x = gameOf(p, TOR).goals.find((g) => g.playerId === 8478057); x.playerId = 8480870; x.name = { default: 'B. Groulx' }; x.firstName = { default: 'Benjamin' }; x.lastName = { default: 'Groulx' } })
  await run(s, moved, T0 + CONFIRM_MS + 20e3)
  const jo = torRows(s).find((x) => x.player_id === 8478057)
  const gr = torRows(s).find((x) => x.player_id === 8480870)
  check(jo.overturned_at && gr && gr.goal_n === 1 && !gr.confirmed_at, 'scoring change A->B: A overturned, B a new unconfirmed row')
  // Same man, goal waved off, scores again later: never inherits the old row.
  const s2 = memoryStore()
  await run(s2, dayFrom(RAW), T0)
  await run(s2, dayFrom(RAW), T0 + CONFIRM_MS + 1e3)
  const off = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); g.goals = g.goals.filter((x) => x.playerId !== 8477939); g.homeTeam.score -= 1 })
  await run(s2, off, T0 + CONFIRM_MS + 10e3)
  const again = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); const x = g.goals.find((y) => y.playerId === 8477939); x.timeInPeriod = '18:30' })
  await run(s2, again, T0 + CONFIRM_MS + 20e3)
  const ny = torRows(s2).filter((x) => x.player_id === 8477939)
  check(ny.length === 2 && ny[0].overturned_at && ny[0].confirmed_at && ny[1].goal_n === 2 && !ny[1].confirmed_at, 'waved off then scores again -> new row goal_n 2, old row stays overturned')
  check(matchGame(again.find((g) => g.id === TOR), torRows(s2)).fresh.length === 0, 'the re-score now matches its own row')
}

// ── 4. the 2+ Club, live ──────────────────────────────────────────────────
{
  const s = memoryStore()
  // TEST: give Nylander a second goal (3rd, 04:10) -- not a real goal.
  const two = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); const x = clone(g.goals.find((y) => y.playerId === 8477939)); x.timeInPeriod = '04:10'; g.goals.splice(5, 0, x); g.homeTeam.score += 1 })
  await run(s, two, T0)
  check(s.t.multi.length === 0, 'no 2+ Club row before confirmation')
  await run(s, two, T0 + CONFIRM_MS + 1e3)
  const m = s.t.multi.find((x) => x.player_id === '8477939')
  check(m && m.n === 2 && m.kind === 'G' && m.season === 2025 && m.status === 'called' && m.sport === 'nhl', `second confirmed goal -> multi_games row (n 2, G, season 2025, called): ${JSON.stringify(m && { n: m.n, season: m.season, status: m.status })}`)
  const posts = []
  await run(s, two, T0 + CONFIRM_MS + POST_AFTER_MS + 2e3, { post: async (t) => { posts.push(t); return { ok: true, id: `T${posts.length}` } } })
  check(posts.length === 2 && posts.some((p) => p.includes('(His 2nd tonight)') && p.includes('His 1st multi-goal game this season.')), 'his 2nd CALLED goal posts "(His 2nd tonight)" + the 2+ Club line')
  // one comes off -> the multi row goes
  const back = dayFrom(RAW)
  await run(s, back, T0 + CONFIRM_MS + POST_AFTER_MS + 30e3)
  check(!s.t.multi.some((x) => x.player_id === '8477939'), 'overturn takes him under two -> 2+ Club row removed')
}

// ── 5. the push ───────────────────────────────────────────────────────────
{
  const s = memoryStore()
  await run(s, dayFrom(RAW), T0)
  const unconfirmed = nhlEventsFrom(s.t.feed, null)
  check(unconfirmed.length === 0, 'unconfirmed rows -> no event')
  await run(s, dayFrom(RAW), T0 + CONFIRM_MS + 1e3)
  // TEST follow list: two users, one follows Nylander (LAMP), one follows an MLB id.
  const state = {
    u1: { dash_follow_v1: { 'nhl:8477939': { id: 8477939, name: 'William Nylander', sport: 'nhl' } } },
    u2: { dash_follow_v1: { 'mlb:592450': { id: 592450, name: 'Aaron Judge', sport: 'mlb' }, 'nfl:x': { id: 'x', name: 'Josh Allen' } } },
  }
  const audience = audienceFrom(state)
  check(audience.nhl?.has('8477939') && audience.mlb.has('592450') && audience.nfl.has('josh allen'), 'audienceFrom hears nhl: from the registry (and still mlb / nfl)')
  const ev = nhlEventsFrom(s.t.feed, audience)
  const goal = ev.filter((e) => e.category === 'nhlgoal')
  const called = ev.filter((e) => e.category === 'nhlcalled')
  check(goal.length === 1 && goal[0].key === 'nhl:2026-03-20:8477939:goal:1' && goal[0].priority === 0, `followed skater -> one P0 nhlgoal, key ${goal[0]?.key}`)
  check(goal[0].title === '🚨 NYLANDER SCORES' && goal[0].body === 'CALLED · the top skater on his team on the LAMP board\nEven strength · 3rd · his 24th', `push words: ${JSON.stringify([goal[0]?.title, goal[0]?.body])}`)
  check(goal[0].url === '/app#sport=nhl&tab=player&player=8477939', 'the push opens his LAMP page')
  check(called.length === 1 && called[0].everyone && called[0].key.endsWith(':called'), 'the CALLED goal also makes one nhlcalled (everyone, its own key)')
  check(JSON.stringify(nhlEventsFrom(s.t.feed, audience).map((e) => e.key)) === JSON.stringify(ev.map((e) => e.key)), 'same rows twice -> same keys')
  check(wants(state.u1, goal[0]) && !wants(state.u2, goal[0]), 'wants(): the follower gets nhlgoal, the MLB follower does not')
  check(!wants(state.u1, called[0]), 'nhlcalled is off by default')
  check(nhlEventsFrom(s.t.feed.map((r) => ({ ...r, game_type: 1 })), audience).length === 0, 'preseason rows -> no event')
  check(nhlEventsFrom(s.t.feed.map((r) => ({ ...r, overturned_at: r.player_id === 8477939 ? 'x' : null })), audience).filter((e) => e.playerId === '8477939').length === 0, 'an overturned row -> no event')
  const tav = s.t.feed.find((r) => r.player_id === 8475166)
  check(pushText(tav).body.startsWith('ON THE BOARD #5'), 'a board scorer: "ON THE BOARD #5" (the status word, then his rank)')
  const wsh = s.t.feed.find((r) => r.game_id === WSH)
  check(!/ON THE BOARD|CALLED/.test(pushText(wsh).body), 'no lock -> no status word in the push')
}

// ── 6. the page labels ────────────────────────────────────────────────────
{
  const s = memoryStore()
  await run(s, dayFrom(RAW), T0)
  const labels = new Map()
  for (const r of s.t.feed.filter((x) => x.status)) {
    const k = `${r.game_id}|${r.player_id}|${r.period}`
    const [m, sec] = r.time_in_period.split(':').map(Number)
    labels.set(k, [...(labels.get(k) || []), { t: m * 60 + sec, status: r.status, rank: r.rank_in_game }])
  }
  const shown = labelGoals(dayFrom(RAW, (p) => { gameOf(p, TOR).goals.find((x) => x.playerId === 8477939).timeInPeriod = '13:52' }), labels)
  const tor = shown.find((g) => g.id === TOR)
  check(tor.goals.find((x) => x.scorer.id === 8477939).label === 'called' && tor.goals.find((x) => x.scorer.id === 8475166).label === 'board', 'scores list: CALLED and ON THE BOARD land on the right goals (even after a 2 s nudge)')
  check(shown.find((g) => g.id === WSH).goals.every((x) => !x.label), 'no lock -> no label on the page')
}

// ── X refuses a CALLED goal after the channel copy went out (10-09: Kyle Connor posted in #lamp-nhl every minute) ──
{
  const s = memoryStore()
  let sends = 0
  const poster = { post: async () => { sends += 1; return { ok: false, status: 403, error: 'refused', discordSent: true } } }
  await run(s, dayFrom(RAW), T0, poster)
  const waved = dayFrom(RAW, (p) => { const g = gameOf(p, TOR); g.goals = g.goals.filter((x) => x.playerId !== 8475166); g.homeTeam.score -= 1 })
  await run(s, waved, T0 + CONFIRM_MS + 5e3, poster)
  await run(s, waved, T0 + CONFIRM_MS + 5e3 + POST_AFTER_MS + 1e3, poster)
  for (let i = 1; i <= 5; i += 1) await run(s, waved, T0 + CONFIRM_MS + POST_AFTER_MS + i * 60e3, poster)
  check(sends === 1, `X refusing after a channel post: the goal is sent once, not every tick (sends ${sends})`)
  check(s.t ? true : torRows(s).some((x) => x.x_post_id === 'skipped'), 'the closed goal reads skipped (budget ignores it)')
  // nothing sent anywhere and X refusing: still retried (a transient refusal must not lose the post)
  const s2 = memoryStore(); let tries = 0
  const poster2 = { post: async () => { tries += 1; return { ok: false, status: 500, error: 'x down' } } }
  await run(s2, dayFrom(RAW), T0, poster2)
  await run(s2, waved, T0 + CONFIRM_MS + 5e3, poster2)
  await run(s2, waved, T0 + CONFIRM_MS + 5e3 + POST_AFTER_MS + 1e3, poster2)
  await run(s2, waved, T0 + CONFIRM_MS + POST_AFTER_MS + 120e3, poster2)
  check(tries >= 2, `with nothing sent, an X refusal is still retried (tries ${tries})`)
}

// ── 10-10 bug hunt: every other way a refusal could loop ─────────────────────────────────────────
{
  const waved = (p) => { const g = gameOf(p, TOR); g.goals = g.goals.filter((x) => x.playerId !== 8475166); g.homeTeam.score -= 1 }
  const drive = async (poster, { start = T0, steps = 8, every = 60e3 } = {}) => {
    _resetXFail()   // the retry counter is per warm instance; every scenario here is a fresh one
    const s = memoryStore(); const games = dayFrom(RAW, waved)
    await run(s, games, start, poster)
    await run(s, games, start + CONFIRM_MS + 5e3, poster)
    for (let i = 0; i < steps; i += 1) await run(s, games, start + CONFIRM_MS + POST_AFTER_MS + 5e3 + i * every, poster)
    return s
  }
  // credits depleted (402), nothing sent anywhere: ONE attempt, then the goal is closed -- no X call every minute for 3 hours
  let calls402 = 0
  const s402 = await drive({ post: async () => { calls402 += 1; return { ok: false, status: 402, error: 'credits', title: 'CreditsDepleted' } } })
  check(calls402 === 1, `X credits depleted: one attempt, not one per tick (got ${calls402})`)
  check(torRows(s402).filter((x) => x.status === 'called').every((x) => x.x_post_id === 'skipped'), 'the refused CALLED goal is closed as skipped -- nothing re-posts after a top-up')
  // a duplicate-content refusal is closed too
  let dup = 0
  await drive({ post: async () => { dup += 1; return { ok: false, status: 403, error: 'You are not allowed to create a Tweet with duplicate content.' } } })
  check(dup === 1, `a duplicate-content refusal is not retried (got ${dup})`)
  // a transient refusal retries a limited number of times, then closes
  let tr = 0
  const sTr = await drive({ post: async () => { tr += 1; return { ok: false, status: 503, error: 'x down' } } }, { steps: 12 })
  check(tr === 3, `a 503 is tried 3 times, then the goal is closed (got ${tr})`)
  check(torRows(sTr).filter((x) => x.status === 'called').every((x) => x.x_post_id === 'skipped'), 'after its tries the goal reads skipped')
  // X paused by the breaker (no request made): the goal waits, is not counted as a try, and expires by age
  let held = 0
  const sHeld = await drive({ post: async () => { held += 1; return { ok: false, blocked: true, status: 402, error: 'X paused' } } }, { steps: 3 })
  check(torRows(sHeld).filter((x) => x.status === 'called').every((x) => x.x_post_id === null), 'X paused: the claim is released, the goal waits (nothing sent, nothing closed)')
  // a late goal is never posted (a backlog after credits return is not news): first seen 46 minutes ago
  let late = 0
  const sLate = memoryStore(); const gamesLate = dayFrom(RAW, waved)
  await run(sLate, gamesLate, T0, null)
  await run(sLate, gamesLate, T0 + CONFIRM_MS + 5e3, null)
  await run(sLate, gamesLate, T0 + 46 * 60e3, { post: async () => { late += 1; return { ok: true, id: '1' } } })
  check(late === 0, 'a CALLED goal first seen 46 min ago is not posted late')
  // fresh and healthy still posts exactly once
  let ok1 = 0
  await drive({ post: async () => { ok1 += 1; return { ok: true, id: String(100 + ok1) } } })
  check(ok1 === 1, `a healthy post goes out once (got ${ok1})`)
}

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
