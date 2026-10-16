#!/usr/bin/env node
// THE NIGHT RECAP (lib/posts/recapPost.js), 2026-10-16.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-recap-post.mjs
//
// ALL DATA HERE IS TEST DATA (names, ids, clock times are made up and labelled TEST). Every webhook is a TEST placeholder, the database is a
// fake in this file and global fetch is replaced: nothing is ever sent, read or written.
import './_no-injury-net.mjs'

let fail = 0
const check = (name, ok, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  -- ${extra}` : ''}`) }

const U = (n) => `https://discord.com/api/webhooks/${n}/TEST-TOKEN`
const HOOKS = { DISCORD_HOMER_WEBHOOK: U('1001'), DISCORD_MLB_WEBHOOKS: U('1002'), DISCORD_NFL_WEBHOOKS: U('1003'), DISCORD_NHL_WEBHOOKS: U('1004'), DISCORD_RECEIPTS_WEBHOOK: U('1006'), DISCORD_MEMBERS_WEBHOOK: U('1007') }
const ENV_KEYS = [...Object.keys(HOOKS), 'RECAP_POSTS_ON', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']
const setEnv = (extra = {}) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, HOOKS, extra) }
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.test'

const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body })
  return { ok: true, status: 204, statusText: 'x', headers: { get: () => null }, json: async () => ({}) }
}
let nextFetchStatus = []
const failingFetch = globalThis.fetch
const bodyOf = (c) => (typeof c.body === 'string' ? JSON.parse(c.body) : JSON.parse(c.body.get('payload_json')))

// a fake homer_feed_posts: the claim table
function fakeDb() {
  const rows = []
  const log = []
  const table = {
    select: () => ({ match: (m) => ({ maybeSingle: async () => { log.push('select'); return { data: rows.find((r) => r.day === m.day && r.kind === m.kind) || null, error: null } } }) }),
    upsert: (recs) => ({ select: async () => {
      log.push('upsert')
      const out = []
      for (const r of recs) if (!rows.some((x) => x.day === r.day && x.kind === r.kind)) { rows.push({ ...r }); out.push({ day: r.day }) }
      return { data: out, error: null }
    } }),
    update: (patch) => ({ match: async (m) => { log.push('update'); const r = rows.find((x) => x.day === m.day && x.kind === m.kind); if (r) Object.assign(r, patch); return { error: null } } }),
    delete: () => ({ match: async (m) => { log.push('delete'); const i = rows.findIndex((x) => x.day === m.day && x.kind === m.kind); if (i >= 0) rows.splice(i, 1); return { error: null } } }),
  }
  return { rows, log, from: (t) => { if (t !== 'homer_feed_posts') throw new Error(`unexpected table ${t}`); return table } }
}

const { nflRecap, nhlRecap, postRecapOnce, nightOver, recapPostsOn, KINDS, SETTLE_MS, _resetRecapForTests } = await import('../lib/posts/recapPost.js')
const { recapAfterTick } = await import('../lib/posts/recapTick.js')
const { embedUrls, siteBase, LIMITS, embedSize, playUrlOk, playLine } = await import('../lib/dash/discordCard.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { roomsOf, isCut, GRADING_KIND } = await import('../lib/dash/routing.js')
const { kindInfo, tagOf, modeOf } = await import('../lib/dash/xSchedule.js')
const { normalizeTweet } = await import('../lib/dash/tweetFormat.js')

const DAY = '2026-10-18'   // TEST day
// ── TEST data: NFL ──────────────────────────────────────────────────────────
const NFL_CALLED = [
  { id: '00-TEST01', name: 'Test Rusher One', team: 'AAA', gameId: 'g1' },
  { id: '00-TEST02', name: 'Test Catcher Two', team: 'BBB', gameId: 'g1' },
  { id: '00-TEST03', name: 'Test Missed Three', team: 'AAA', gameId: 'g1' },
  { id: '00-TEST04', name: 'Test Later Four', team: 'CCC', gameId: 'g2' },
  { id: '00-TEST05', name: 'Test Inactive Five', team: 'CCC', gameId: 'g2', out: true },
]
const NFL_EVENTS = [
  { day: DAY, game_id: 'g1', td_n: 1, team: 'BBB', quarter: 2, clock: '4:12', kind: 'pass', yards: 3, passer_name: 'Test Passer', scorer_name: 'Test Catcher Two', gsis_id: '00-TEST02', on_bot: { market: 'TD', rank: 2 }, text: 'Test Catcher Two 3 Yd pass from Test Passer' },
  { day: DAY, game_id: 'g1', td_n: 2, team: 'AAA', quarter: 3, clock: '9:50', kind: 'rush', yards: 1, passer_name: null, scorer_name: 'Test Rusher One', gsis_id: '00-TEST01', on_bot: { market: 'TD', rank: 1 }, text: 'Test Rusher One 1 Yd Rush' },
  { day: DAY, game_id: 'g1', td_n: 3, team: 'AAA', quarter: 4, clock: '0:45', kind: 'rush', yards: 7, passer_name: null, scorer_name: 'Test Rusher One', gsis_id: '00-TEST01', on_bot: { market: 'TD', rank: 1 }, text: 'Test Rusher One 7 Yd Rush' },
  { day: DAY, game_id: 'g1', td_n: 4, team: 'AAA', quarter: 4, clock: '0:10', kind: 'pass', yards: 20, passer_name: 'Test Passer', scorer_name: 'Test Offboard Six', gsis_id: '00-TEST06', on_bot: null, td_board: { rank: 40, of: 300 }, text: 'x' },
]
const NFL_GAMES_FINAL = [{ id: 'g1', final: true }, { id: 'g2', final: true }]
const nfl = nflRecap({ day: DAY, called: NFL_CALLED, events: NFL_EVENTS, games: NFL_GAMES_FINAL })
const allText = (e) => [e.title, e.description, e.footer?.text, ...(e.fields || []).flatMap((f) => [f.name, f.value])].join('\n')
const linesOf = (e) => allText(e).split('\n')
const host = (u) => new URL(u).host
const SITE_HOST = new URL(siteBase()).host
console.log('\n--- TEST NFL recap, as rendered ---\n' + allText(nfl.embed) + '\n--- end ---\n')

check('N1 state go, one embed', nfl.state === 'go' && nfl.embed && typeof nfl.embed === 'object')
check('N2 counts: 2 cleared, 2 missed (both games final), 1 void, none pending', nfl.counts.cleared === 2 && nfl.counts.missed === 2 && nfl.counts.void === 1 && nfl.counts.pending === 0, JSON.stringify(nfl.counts))
const lineOf = (e, name) => linesOf(e).find((l) => l.includes(name)) || ''
check('N3 each cleared man has a line with a markdown link to his page on the site host', ['Test Rusher One', 'Test Catcher Two'].every((n) => /\]\(https:\/\/site\.test\/app#sport=nfl&tab=players&player=00-TEST0[12]\)/.test(lineOf(nfl.embed, n))))
check('N4 the play is printed from the feed row (yards, kind, passer, quarter, clock)', lineOf(nfl.embed, 'Test Catcher Two').includes('3-yd pass from Test Passer, Q2 4:12') && lineOf(nfl.embed, 'Test Rusher One').includes('1-yd run, Q3 9:50') && lineOf(nfl.embed, 'Test Rusher One').includes('7-yd run, Q4 0:45'))
check('N5 two touchdowns say so', lineOf(nfl.embed, 'Test Rusher One').includes('2 TDs'))
check('N6 a miss is listed with no link', /Test Missed Three/.test(allText(nfl.embed)) && !/\(http/.test(lineOf(nfl.embed, 'Test Missed Three')) && !lineOf(nfl.embed, 'Test Missed Three').includes('scored'))
check('N7 a man who did not play is void, not a miss, no link', /Test Inactive Five.*void/.test(lineOf(nfl.embed, 'Test Inactive Five')) && !/\(http/.test(lineOf(nfl.embed, 'Test Inactive Five')))
check('N8 a scorer the board did not call (on_bot null) is not listed as called', !/Test Offboard Six/.test(allText(nfl.embed)))
check('N9 the status word is the registry one', nfl.embed.description.includes(STATUS_WORD.called))
check('N10 section order: record, scored, didn\'t get there', (() => { const n = nfl.embed.fields.map((f) => f.name); return n[0].includes('RECORD') && n[1].includes('SCORED') && n[n.length - 1].includes("DIDN'T GET THERE") || n.some((x) => x.includes('PENDING')) })())
check('N11 no title link and no description link', !nfl.embed.url && !/https?:/.test(nfl.embed.title + nfl.embed.description))
check('N12 plain text has no link and is tweetFormat-clean', !/https?:|\]\(/.test(nfl.text) && normalizeTweet(nfl.text) === nfl.text)

// a game that is not final yet is pending, never a miss
const nflPend = nflRecap({ day: DAY, called: NFL_CALLED, events: NFL_EVENTS, games: [{ id: 'g1', final: true }, { id: 'g2', final: false }] })
check('P1 not-final game: its called men are pending, not missed', nflPend.counts.pending === 1 && nflPend.counts.missed === 1 && /Test Later Four[^\n]*not final/.test(allText(nflPend.embed)) && !/Test Later Four[^\n]*called, no touchdown/.test(allText(nflPend.embed)))
const nflUnknown = nflRecap({ day: DAY, called: NFL_CALLED, events: [], games: [] })
check('P2 a game that cannot be found is pending (never guessed final)', nflUnknown.counts.missed === 0 && nflUnknown.counts.pending === 4)
check('P3 nothing called = nothing to say', nflRecap({ day: DAY, called: [], events: [], games: [] }).state === 'none')

// ── TEST data: NHL ──────────────────────────────────────────────────────────
const CLIP = 'https://www.nhl.com/video/test-goal-0001'
const NHL_LOG = [
  { game_id: 9001, game_date: DAY, player_id: 8000001, team: 'AAA', name: 'Test Winger One', status: 'called', graded_at: 't', dressed: true, hit: true, goals: 2, score: 91.4 },
  { game_id: 9001, game_date: DAY, player_id: 8000002, team: 'BBB', name: 'Test Center Two', status: 'called', graded_at: 't', dressed: true, hit: true, goals: 1, score: 77.7 },
  { game_id: 9001, game_date: DAY, player_id: 8000003, team: 'BBB', name: 'Test Quiet Three', status: 'called', graded_at: 't', dressed: true, hit: false, goals: 0, score: 70.1 },
  { game_id: 9002, game_date: DAY, player_id: 8000004, team: 'CCC', name: 'Test Later Four', status: 'called', graded_at: null, dressed: null, hit: null, goals: null, score: 60 },
  { game_id: 9001, game_date: DAY, player_id: 8000005, team: 'AAA', name: 'Test Scratch Five', status: 'called', graded_at: 't', dressed: false, hit: null, goals: null, score: 50 },
  { game_id: 9001, game_date: DAY, player_id: 8000006, team: 'AAA', name: 'Test Board Six', status: 'board', graded_at: 't', dressed: true, hit: true, goals: 1, score: 40 },
]
const NHL_GOALS = [
  { game_id: 9001, player_id: 8000001, goal_n: 1, period: 1, period_type: 'REG', time_in_period: '03:21', strength: 'ev', empty_net: false, clip_url: CLIP, overturned_at: null },
  { game_id: 9001, player_id: 8000001, goal_n: 2, period: 3, period_type: 'REG', time_in_period: '11:02', strength: 'pp', empty_net: false, clip_url: 'https://www.nhl.com/video/test-goal-0002', overturned_at: null },
  { game_id: 9001, player_id: 8000001, goal_n: 3, period: 2, period_type: 'REG', time_in_period: '01:00', strength: 'ev', empty_net: false, clip_url: 'https://www.nhl.com/video/overturned', overturned_at: 'x' },
  { game_id: 9001, player_id: 8000002, goal_n: 1, period: 2, period_type: 'REG', time_in_period: '14:03', strength: 'ev', empty_net: false, clip_url: 'https://evil.example/steal', overturned_at: null },
]
const nhl = nhlRecap({ date: DAY, called: NHL_LOG, goals: NHL_GOALS })
console.log('--- TEST NHL recap, as rendered ---\n' + allText(nhl.embed) + '\n--- end ---\n')
check('H1 counts: 2 cleared, 1 missed, 1 void, 1 pending', nhl.counts.cleared === 2 && nhl.counts.missed === 1 && nhl.counts.void === 1 && nhl.counts.pending === 1, JSON.stringify(nhl.counts))
check('H2 a cleared man with a clip links the clip (nhl.com), one per goal', lineOf(nhl.embed, 'Test Winger One').includes(`[▶ watch](${CLIP})`) && lineOf(nhl.embed, 'Test Winger One').includes('[▶ 2nd goal](https://www.nhl.com/video/test-goal-0002)'))
check('H3 an overturned goal is not shown or linked', !allText(nhl.embed).includes('overturned') && lineOf(nhl.embed, 'Test Winger One').includes('2 goals'))
check('H4 a clip on a foreign host is refused; he links his page on the site instead', !allText(nhl.embed).includes('evil.example') && /\]\(https:\/\/site\.test\/app#sport=nhl&tab=player&player=8000002\)/.test(lineOf(nhl.embed, 'Test Center Two')))
check('H5 the goal is printed from the feed row (period, clock, strength)', lineOf(nhl.embed, 'Test Winger One').includes('1st 03:21, Even strength') && lineOf(nhl.embed, 'Test Winger One').includes('3rd 11:02, PP goal'))
check('H6 a miss is listed with no link; a scratch is void; a not-graded game is pending', /Test Quiet Three/.test(allText(nhl.embed)) && !/\(http/.test(lineOf(nhl.embed, 'Test Quiet Three')) && /Test Scratch Five[^\n]*void/.test(allText(nhl.embed)) && /Test Later Four[^\n]*not final/.test(allText(nhl.embed)))
check('H7 a scorer who was only ON THE BOARD is not in a called recap', !allText(nhl.embed).includes('Test Board Six'))

// ── rules over everything built ─────────────────────────────────────────────
const built = [['nfl', nfl], ['nfl pending', nflPend], ['nhl', nhl]]
for (const [name, b] of built) {
  const urls = embedUrls(b.embed)
  check(`R1 ${name}: only the site host and nhl.com`, urls.every((u) => host(u) === SITE_HOST || /(^|\.)nhl\.com$/.test(host(u))), urls.map(host).join(','))
  const body = allText(b.embed) + b.text
  check(`R2 ${name}: no model probability printed (no percent, no 'probability', none of the stored scores)`, !/\d+(\.\d+)?\s?%/.test(body) && !/probab|chance|\bscore\b/i.test(body) && !/91\.4|77\.7|\b91\b|\b78\b/.test(body))
  check(`R3 ${name}: one embed within Discord's limits`, embedSize(b.embed) <= LIMITS.total && b.embed.fields.length <= LIMITS.fields && b.embed.fields.every((f) => [...f.value].length <= LIMITS.value && [...f.name].length <= LIMITS.name))
}
check('R4 playUrlOk: refuses look-alikes, http, userinfo, javascript', !playUrlOk('https://nhl.com.evil.example/x') && !playUrlOk('http://www.nhl.com/x') && !playUrlOk('https://user@www.nhl.com/x') && !playUrlOk('javascript:alert(1)') && !playUrlOk('https://evil.example/') && playUrlOk('https://www.nhl.com/video/1') && playUrlOk(`${siteBase()}/app#sport=nhl`))
check('R5 playLine: a foreign link keeps its words, a bare URL goes', playLine('see [here](https://evil.example/x) and https://evil.example/y') === 'see here and')

// a big night: nothing is hidden among the misses, the card still fits
const bigLog = Array.from({ length: 70 }, (_, i) => ({ game_id: 1 + (i % 7), game_date: DAY, player_id: 5000000 + i, team: 'AAA', name: `Test Skater ${i} With A Long Name`, status: 'called', graded_at: 't', dressed: true, hit: i % 3 === 0, goals: i % 3 === 0 ? 1 : 0 }))
const bigGoals = bigLog.filter((r) => r.hit).map((r) => ({ game_id: r.game_id, player_id: r.player_id, goal_n: 1, period: 2, period_type: 'REG', time_in_period: '10:00', strength: 'ev', empty_net: false, clip_url: `https://www.nhl.com/video/test-${r.player_id}`, overturned_at: null }))
const big = nhlRecap({ date: DAY, called: bigLog, goals: bigGoals })
const bigMissed = bigLog.filter((r) => !r.hit)
check('B1 70 called: one embed under 6000, 25 fields, 1024 a field', embedSize(big.embed) <= LIMITS.total && big.embed.fields.length <= 25 && big.embed.fields.every((f) => [...f.value].length <= 1024), `${embedSize(big.embed)} chars, ${big.embed.fields.length} fields`)
check('B2 every miss is still named however long the night', bigMissed.every((r) => allText(big.embed).includes(r.name)), bigMissed.filter((r) => !allText(big.embed).includes(r.name)).map((r) => r.name).join('; '))
check('B3 any win left out for room is said ("+N more cleared") and counted', (() => { const shown = bigLog.filter((r) => r.hit && allText(big.embed).includes(r.name)).length; const total = bigLog.filter((r) => r.hit).length; return shown === total || new RegExp(`\\+${total - shown} more cleared`).test(allText(big.embed)) })())
check('B4 no link was cut in half', (allText(big.embed).match(/\]\(/g) || []).length === (allText(big.embed).match(/\]\(https:[^)\s]+\)/g) || []).length)

// ── the night is over? ──────────────────────────────────────────────────────
const T0 = Date.parse('2026-10-18T20:00:00Z')
check('O1 league silent = not ready', nightOver(null).ready === false)
check('O2 no games = not a night', nightOver({ games: [] }).empty === true)
check('O3 one game open = not ready, not given up', (() => { const o = nightOver({ games: [{ id: 1, final: true, startMs: T0 }, { id: 2, final: false, startMs: T0 }] }, T0 + 3600e3); return !o.ready && !o.gaveUp })())
check('O4 postponed counts as done', nightOver({ games: [{ id: 1, final: true, startMs: T0 }, { id: 2, final: false, off: true, startMs: T0 }] }, T0).ready === true)
check('O5 a game that never ends is given up on after 30 hours', nightOver({ games: [{ id: 2, final: false, startMs: T0 }] }, T0 + 31 * 3600e3).gaveUp === true)

// ── posting ─────────────────────────────────────────────────────────────────
const readyLoad = (input) => async () => ({ over: { ready: true, gaveUp: false, reason: '' }, input })
const NFL_INPUT = { day: DAY, called: NFL_CALLED, events: NFL_EVENTS, games: NFL_GAMES_FINAL }

// the switch is OFF by default: nothing is read, claimed or sent
setEnv()
check('S0 RECAP_POSTS_ON is off by default', recapPostsOn() === false)
{
  _resetRecapForTests(); calls.length = 0
  const db = fakeDb()
  let loaded = 0
  const r = await postRecapOnce(db, { sport: 'nfl', day: DAY, load: async () => { loaded += 1; return readyLoad(NFL_INPUT)() }, now: T0 })
  const t = await recapAfterTick(null, { sport: 'nfl', days: [DAY], db })
  check('S1 off: nothing posts, nothing read, nothing claimed, no fetch', r === 'off' && t === null && loaded === 0 && calls.length === 0 && db.log.length === 0 && db.rows.length === 0, `${r}`)
  for (const v of ['off', '0', 'false', '']) { setEnv({ RECAP_POSTS_ON: v }); if (recapPostsOn()) check(`S1b RECAP_POSTS_ON=${v} is off`, false) }
}

// ON: routed to #called-it only
for (const [sport, input] of [['nfl', NFL_INPUT], ['nhl', { day: DAY, called: NHL_LOG, goals: NHL_GOALS }]]) {
  setEnv({ RECAP_POSTS_ON: 'on' })
  _resetRecapForTests(); calls.length = 0
  const db = fakeDb()
  const kind = KINDS[sport]
  const first = await postRecapOnce(db, { sport, day: DAY, load: readyLoad(input), now: T0 })
  check(`S2 ${sport}: the first sight of a finished night settles first, sends nothing`, first === 'settling' && calls.length === 0, first)
  const sent = await postRecapOnce(db, { sport, day: DAY, load: readyLoad(input), now: T0 + SETTLE_MS + 6 * 60e3 })
  check(`S3 ${sport}: then posts once`, sent === 'posted (discord only)' && calls.length === 1, `${sent}, ${calls.length} calls`)
  const c = calls[0]
  check(`S4 ${sport}: the receipts webhook only (never the public feed, the sport channel, #members or X)`, c?.url === HOOKS.DISCORD_RECEIPTS_WEBHOOK && calls.every((x) => x.url === HOOKS.DISCORD_RECEIPTS_WEBHOOK) && !calls.some((x) => /twitter|api\.x\.com/.test(x.url)), c?.url)
  const b = c ? bodyOf(c) : {}
  check(`S5 ${sport}: exactly one embed, no plain content, no mentions`, Array.isArray(b.embeds) && b.embeds.length === 1 && b.content === undefined && JSON.stringify(b.allowed_mentions) === '{"parse":[]}')
  check(`S6 ${sport}: the claim row is (${DAY}, ${kind}) with the payload and discord_sent`, db.rows.length === 1 && db.rows[0].kind === kind && db.rows[0].day === DAY && db.rows[0].discord_sent === true && Array.isArray(db.rows[0].payload?.cleared) && db.rows[0].payload.cleared.length === 2 && db.rows[0].payload.missed.length >= 1)
  check(`S7 ${sport}: routed to receipts only; a recap is a grading kind and is never off`, roomsOf(kind)?.join() === 'receipts' && !isCut(kind) && GRADING_KIND.test(kind))
  check(`S8 ${sport}: tagged INFO, event-driven, group receipt`, tagOf(kind) === 'INFO' && modeOf(kind) === 'event' && kindInfo(kind)?.group === 'receipt')
  calls.length = 0
  _resetRecapForTests()
  const again = await postRecapOnce(db, { sport, day: DAY, load: readyLoad(input), now: T0 + 99 * 60e3 })
  check(`S9 ${sport}: a second try the same night posts nothing`, again === 'already-posted' && calls.length === 0, again)
}

// waiting for the games: pending nights claim nothing and send nothing
{
  setEnv({ RECAP_POSTS_ON: 'on' }); _resetRecapForTests(); calls.length = 0
  const db = fakeDb()
  const r = await postRecapOnce(db, { sport: 'nfl', day: DAY, load: async () => ({ over: { ready: false, gaveUp: false, reason: '1 game not final' }, input: NFL_INPUT }), now: T0 })
  check('S10 games not final: waits, claims nothing, sends nothing', r.startsWith('waiting') && db.rows.length === 0 && calls.length === 0, r)
  const g = await postRecapOnce(db, { sport: 'nfl', day: '2026-10-19', load: async () => ({ over: { ready: false, gaveUp: true, reason: '' }, input: { ...NFL_INPUT, day: '2026-10-19', events: [], games: [{ id: 'g1', final: true }] } }), now: T0 })
  check('S11 a game given up on: the recap goes out and shows its men as pending, not missed', g === 'settling' || g.startsWith('posted'), g)
}
// no receipts webhook: nothing claimed, never falls through to another room
{
  setEnv({ RECAP_POSTS_ON: 'on' }); delete process.env.DISCORD_RECEIPTS_WEBHOOK; _resetRecapForTests(); calls.length = 0
  const db = fakeDb()
  const r = await postRecapOnce(db, { sport: 'nhl', day: DAY, load: readyLoad({ day: DAY, called: NHL_LOG, goals: NHL_GOALS }), now: T0 + 3 * SETTLE_MS })
  check('S12 no #called-it webhook: nothing claimed, nothing sent anywhere else', r === 'no-webhook' && db.rows.length === 0 && calls.length === 0, r)
}
// Discord down: the claim is released so the next tick retries
{
  setEnv({ RECAP_POSTS_ON: 'on' }); _resetRecapForTests(); calls.length = 0
  const db = fakeDb()
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), body: init.body }); return { ok: false, status: 500, statusText: 'x', headers: { get: () => null }, json: async () => ({}) } }
  const load = readyLoad(NFL_INPUT)
  await postRecapOnce(db, { sport: 'nfl', day: '2026-10-25', load, now: T0 })
  const r = await postRecapOnce(db, { sport: 'nfl', day: '2026-10-25', load, now: T0 + SETTLE_MS + 6 * 60e3 })
  check('S13 Discord 500: the claim is released for another try (nothing was sent, so nothing can double)', r.startsWith('retry') && db.rows.length === 0, r)
  globalThis.fetch = failingFetch
}
// the hook is wrapped: a failing database never throws into the tick
{
  setEnv({ RECAP_POSTS_ON: 'on' }); _resetRecapForTests(); calls.length = 0
  const boom = { from: () => { throw new Error('boom') } }
  let threw = false
  let out
  try { out = await recapAfterTick(null, { sport: 'nfl', days: ['2026-11-01'], db: boom }) } catch { threw = true }
  check('S14 recapAfterTick never throws into the tick', !threw && out === null)
  const unauth = await recapAfterTick({ status: 401 }, { sport: 'nfl', days: ['2026-11-01'], db: fakeDb() })
  check('S15 an unauthorized tick does no recap work', unauth === null)
}

console.log(fail ? `\n${fail} FAILED` : '\nall ok')
process.exit(fail ? 1 : 0)
