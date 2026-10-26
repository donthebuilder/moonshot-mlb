// THE NETWORK vs THE BOARD, CHECKED (2026-10-21). lib/posts/networkVsBoard.js: the votes read, the network's pick, "who scored first", the guess
// leaders, one poll graded, the post, and the poster on a fake database with a fake X read. TEST data only (every name says Test).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-network-vs-board.mjs
import * as N from '../lib/posts/networkVsBoard.js'
import { xLen } from '../lib/posts/slate.js'
import { SWEARS, OVERCLAIM } from '../lib/facts/check.js'
import { receiptLineFor } from '../lib/posts/receiptLine.js'
import { kindInfo } from '../lib/dash/xSchedule.js'
import { tierOf } from '../lib/dash/xPolicy.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const T0 = Date.parse('2026-10-12T23:00:00Z')

// 1. timing and the week
ok(N.nvbDue({ dow: 0, min: 17 * 60 }) && !N.nvbDue({ dow: 0, min: 16 * 60 + 59 }) && !N.nvbDue({ dow: 6, min: 20 * 60 }), 'due Sunday from 5 PM Phoenix')
ok(JSON.stringify(N.nvbWeek('2026-10-18')) === JSON.stringify({ from: '2026-10-11', to: '2026-10-17' }), 'a Sunday grades the seven days before it')

// 2. the votes: X's poll expansion read; the network's pick is a unique top
const xjson = { data: [{ id: '111', attachments: { poll_ids: ['p1'] } }, { id: '222', attachments: { poll_ids: ['p2'] } }], includes: { polls: [
  { id: 'p1', voting_status: 'closed', options: [{ position: 2, label: 'Test Two', votes: 3 }, { position: 1, label: 'Test One', votes: 9 }, { position: 3, label: 'Neither', votes: 1 }] },
  { id: 'p2', voting_status: 'open', options: [{ position: 1, label: 'A', votes: 0 }, { position: 2, label: 'B', votes: 0 }] },
] } }
const v = N.votesFrom(xjson)
ok(v.get('111').status === 'closed' && v.get('111').options.map((o) => o.label).join() === 'Test One,Test Two,Neither', 'options in their own order, with the status')
ok(N.networkPick(v.get('111').options)?.label === 'Test One', 'the most votes is the network pick')
ok(N.networkPick(v.get('222').options) === null && N.networkPick([{ label: 'A', votes: 4 }, { label: 'B', votes: 4 }]) === null, 'no votes, or a tie at the top: no network pick')

// 3. who scored first
const ev = (id, game, order, seenMin, extra = {}) => ({ id, game, order, seen: T0 + seenMin * 60e3, ...extra })
ok(N.firstOf(['a', 'b'], [ev('a', 'g1', 5, 30), ev('b', 'g1', 3, 40)]) === 'b', 'same game: the game order wins over the seen time')
ok(N.firstOf(['a', 'b'], [ev('a', 'g1', 5, 30), ev('b', 'g2', 1, 40)]) === 'a', 'different games: the earlier seen, 10 minutes apart')
ok(N.firstOf(['a', 'b'], [ev('a', 'g1', 5, 30), ev('b', 'g2', 1, 31)]) === 'close', 'different games a minute apart: too close to call')
ok(N.firstOf(['a', 'b'], [ev('a', 'g1', 5, 30), ev('a', 'g1', 2, 50)]) === 'a' && N.firstOf(['a', 'b'], []) === null, 'one scorer; nobody = null')
ok(N.firstOf(['a', 'b'], [ev('c', 'g1', 1, 1)]) === null, 'a man not in the poll is not counted')

// 4. the events from each feed's rows
ok(N.eventOf('mlb', { player_id: 7, game_pk: 9, inning: 'bot 3rd', seen_at: '2026-10-12T23:10:00Z' }).order === 7, 'MLB: bot 3rd sorts after top 3rd')
ok(N.eventOf('nhl', { player_id: 8, game_id: 2, period: 2, time_in_period: '04:02', first_seen_at: '2026-10-12T23:10:00Z' }).order === 20242, 'NHL: period + clock')
ok(N.eventOf('nfl', { gsis_id: '00-1', game_id: 'x', td_n: 2, seen_at: '2026-10-12T23:10:00Z', yards: 44 }).yards === 44, 'NFL: td_n and the yards')

// 5. one poll graded
const pick = { sport: 'nhl', day: '2026-10-12', format: 'pick', payload: { players: [{ id: 'a', name: 'Test One' }, { id: 'b', name: 'Test Two' }] } }
const g1 = N.gradePoll(pick, v.get('111'), [ev('b', 'g1', 3, 40)])
ok(g1.board === 'Test One' && g1.network === 'Test One' && g1.answer === 'Test Two' && !g1.networkRight && !g1.boardRight, `pick graded: ${JSON.stringify(g1)}`)
const g2 = N.gradePoll(pick, { options: [{ label: 'Test One', votes: 2 }, { label: 'Test Two', votes: 1 }, { label: 'Neither', votes: 7 }] }, [])
ok(g2.answer === 'Neither' && g2.networkRight && !g2.boardRight, 'nobody scored on a pick poll: Neither is the answer')
ok(N.gradePoll({ ...pick, format: 'board' }, v.get('111'), []).skip === 'nobody cashed', 'nobody cashed on a board poll: not graded')
ok(N.gradePoll(pick, v.get('111'), [ev('a', 'g1', 5, 30), ev('b', 'g2', 1, 31)]).skip === 'too close to call', 'too close to call: not graded')
const guess = { sport: 'nfl', day: '2026-10-12', format: 'guess', payload: { guess: { metric: 'td_longest', players: [{ id: 'a', name: 'Test One' }, { id: 'b', name: 'Test Two' }, { id: 'c', name: 'Test Three' }] } } }
const g3 = N.gradePoll(guess, { options: [{ label: 'Test One', votes: 1 }, { label: 'Test Two', votes: 1 }, { label: 'Test Three', votes: 5 }] }, [ev('b', 'g', 1, 1, { yards: 60 }), ev('c', 'g', 2, 2, { yards: 60 }), ev('a', 'g', 3, 3, { yards: 12 })])
ok(g3.networkRight && !g3.boardRight && g3.answer === 'Test Two / Test Three', `a tie: each tied man is right (${g3.answer})`)
ok(N.gradePoll({ ...pick, format: 'over' }, v.get('111'), []).skip && N.gradePoll({ ...pick, sport: 'nba' }, v.get('111'), []).skip, 'over / under and BUCKETS are not graded')

// 6. the post
const graded = [g1, g2, g3, { ...g2, day: '2026-10-14' }]
const t = N.tally(graded)
ok(t.n === 4 && t.network === 3 && t.board === 0, `the tally (${JSON.stringify({ n: t.n, net: t.network, board: t.board })})`)
const text = N.nvbText({ week: N.nvbWeek('2026-10-18'), t, limit: 890 })
ok(text.startsWith('\u{1F5F3}\u{FE0F} THE NETWORK vs THE BOARD · LAST WEEK · OCT 11–17') && text.includes('THE NETWORK  3 of 4') && text.includes('THE BOARD  0 of 4'), `head and scoreboard:\n${text}`)
ok(text.includes('🏒 One or Two, first to score: you said One ❌, we said One ❌'), 'a poll line')
ok(/Can the board catch you next week\?$/.test(text), 'the network leads: its ask')
const t280 = N.nvbText({ week: N.nvbWeek('2026-10-18'), t, limit: 280 })
ok(t280 && xLen(t280) <= 280 && t280.includes('THE BOARD  0 of 4'), `fits 280 with the scoreboard (${xLen(t280)})`)
ok(N.nvbText({ week: N.nvbWeek('2026-10-18'), t: N.tally([g1, g2]) }) === '', 'under three graded polls: no post')
ok(!/https?:|#[A-Za-z]|%/.test(text) && !SWEARS.test(text) && !OVERCLAIM.test(text), 'no link, hashtag, percent, swear or overclaim')

// 7. the kind
ok(kindInfo('network_vs_board')?.mode === 'event' && tierOf('network_vs_board') === 'writeup' && receiptLineFor('network_vs_board', { text }) === null, 'event, write-up tier, no receipt line (it grades polls, not our calls)')

// 8. the poster on a fake database and a fake X read
const store = [
  { day: '2026-10-12', kind: 'nhl_poll_pick', payload: pick.payload, x_post_id: '111' },
  { day: '2026-10-13', kind: 'nhl_poll_pick', payload: pick.payload, x_post_id: '333' },
  { day: '2026-10-14', kind: 'nhl_poll_pick', payload: pick.payload, x_post_id: '444' },
  { day: '2026-10-15', kind: 'nhl_poll_pick', payload: pick.payload, x_post_id: 'not-a-tweet' },
]
const feed = { lamp_goal_feed: [{ player_id: 'b', game_id: 'g1', period: 1, time_in_period: '05:00', first_seen_at: '2026-10-12T23:40:00Z', day: '2026-10-12' }] }
const db = { from: (table) => {
  const st = { filters: {} }
  const api = {
    select: () => api, eq: (k, val) => { st.filters[k] = val; return api }, in: (k, list) => { st.in = { k, list }; return api }, gte: (k, val) => { st.gte = val; return api }, lte: (k, val) => { st.lte = val; return api },
    not: () => api, is: () => api, match: (m) => { Object.assign(st.filters, m); return api },
    maybeSingle: async () => ({ data: store.find((x) => x.day === st.filters.day && x.kind === st.filters.kind) || null, error: null }),
    upsert: (rows) => { const fresh = rows.filter((x) => !store.some((y) => y.day === x.day && y.kind === x.kind)); store.push(...fresh.map((x) => ({ ...x }))); return { select: async () => ({ data: fresh, error: null }) } },
    update: (patch) => ({ match: async (m) => { const r = store.find((x) => x.day === m.day && x.kind === m.kind); if (r) Object.assign(r, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }),
    then: (res) => {
      if (table === 'homer_feed_posts') return res({ data: store.filter((x) => st.in?.list.includes(x.kind) && x.day >= st.gte && x.day <= st.lte), error: null })
      return res({ data: (feed[table] || []).filter((r) => r.day === st.filters.day), error: null })
    },
  }
  return api
} }
const closed = (id, votes) => ({ id, attachments: { poll_ids: [`p${id}`] } })
const read = async (path, q) => ({ ok: true, json: { data: q.ids.split(',').map((id) => closed(id)), includes: { polls: q.ids.split(',').map((id) => ({ id: `p${id}`, voting_status: 'closed', options: [{ position: 1, label: 'Test One', votes: 5 }, { position: 2, label: 'Test Two', votes: 2 }, { position: 3, label: 'Neither', votes: 1 }] })) } } })
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN']) delete process.env[k]
N._resetNvbForTests()
let drawn = null
const r1 = await N.postNvbOnce(db, { day: '2026-10-18', clock: { dow: 0, min: 17 * 60 }, read, draw: async (m) => { drawn = m; return Buffer.from('PNG') } })
const row = store.find((x) => x.kind === 'network_vs_board')
ok(/^posted/.test(r1) && row?.payload?.n === 3, `posts with three graded polls (${r1}, n=${row?.payload?.n})`)
ok(row?.payload?.network === 0 && row.payload.board === 0, 'the 12th: Two scored (both picked One); the 13th and 14th: nobody scored, Neither was right, both picked One')
ok(drawn && drawn.t.n === 3 && row.payload.picture === true, 'the card got the tally')
ok(await N.postNvbOnce(db, { day: '2026-10-18', clock: { dow: 0, min: 17 * 60 }, read, draw: async () => null }) === 'already-posted', 'once')

// 8c. the week and the game day say what they are
ok(N.weekWords('2026-10-18', '2026-10-24') === 'LAST WEEK · OCT 18–24' && N.weekWords('2026-10-25', '2026-10-31') === 'LAST WEEK · OCT 25–31' && N.weekWords('2026-10-25', '2026-11-01') === 'LAST WEEK · OCT 25–NOV 1', 'weekWords: last week with its range, across a month turn too')
ok(N.dayWord('2026-10-19') === 'MON' && N.dayWord('2026-10-18') === 'SUN' && N.dayWord('') === '', 'dayWord: the weekday of the game day')
{ const g = N.gradePoll({ sport: 'nfl', day: '2026-10-19', format: 'pick', payload: { players: [{ id: 'a', name: 'Test A' }, { id: 'b', name: 'Test B' }] } }, { options: [{ label: 'Test A', votes: 5 }, { label: 'Test B', votes: 1 }] }, [{ id: 'a', game: 'g', order: 1, seen: 1e12 }])
  ok(g.gameDay === '2026-10-19', 'a graded poll carries its game day') }

ok(/all\.length > MAX_ROWS \? MAX_ROWS - 1 : MAX_ROWS/.test(fs.readFileSync(new URL('../lib/cards/networkCard.js', import.meta.url), 'utf8')), 'the card shows five rows when a "+N more" line follows (six + more cut the footer off)')

// 9. the SQL and the wiring
const fs = await import('node:fs')
// 8b. a suffix is never the name (the card said "III or STEVENSON", 10-25)
ok(N.pollLine({ sport: 'nfl', format: 'pick', names: ['Test Back Smith III', 'Test Runner Jr.'], network: 'Test Runner Jr.', networkRight: false, board: 'Test Back Smith III', boardRight: true }).includes('Smith or Runner, first to score: you said Runner'), 'pollLine drops III / Jr. and shows the surname')
ok(/lastName\(n\)\.toUpperCase\(\)/.test(fs.readFileSync(new URL('../lib/cards/networkCard.js', import.meta.url), 'utf8')), 'the card uses the same suffix-aware surname')

const sql = fs.readFileSync(new URL('../supabase/migrations/202610210900_network_vs_board_kind.sql', import.meta.url), 'utf8')
ok(sql.includes("''network_vs_board''") && /\) not valid'/.test(sql), 'the kind migration allows network_vs_board, NOT VALID')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
ok(/if \(nvbDue\(clock\)\) out\.network_vs_board = await postNvbOnce\(db, \{ day: clock\.day, clock, hooks: FEED_WEBHOOKS\(\) \}\)/.test(route), 'tried from the receipt step, the free feed channels')

console.log(bad ? `${bad}/${n} FAILED` : `check-network-vs-board: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
