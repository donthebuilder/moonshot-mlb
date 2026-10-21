// GROWTH, CHECKED (2026-10-21). lib/growth/snapshot.js: the week, the medians, the summary of our posts, the cut rule, the X read (pages and the
// private-numbers fallback), the type match, the once-a-week snapshot on a fake database, and the /admin panel. TEST data only.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-growth.mjs
import fs from 'node:fs'
const G = await import('../lib/growth/snapshot.js')

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const DAY = 86400e3
const NOW = Date.parse('2026-10-26T14:00:00Z')   // Monday 7 AM Phoenix

// 1. the week and the medians
ok(G.weekOf('2026-10-26') === '2026-10-26' && G.weekOf('2026-10-21') === '2026-10-19' && G.weekOf('2026-10-25') === '2026-10-19', 'the week is its Monday')
ok(G.median([5, 1, 3]) === 3 && G.median([1, 2, 3, 10]) === 3 && G.median([]) === null, 'medians')
ok(G.growthDue({ day: '2026-10-26', hour: 6 }) && !G.growthDue({ day: '2026-10-26', hour: 5 }), 'due from 6 AM Phoenix')

// 2. the summary
const tw = (id, daysAgo, views, extra = {}) => ({ id, created_at: new Date(NOW - daysAgo * DAY).toISOString(), public_metrics: { like_count: 2, reply_count: 1, retweet_count: 0, quote_count: 0, bookmark_count: 1, impression_count: views }, non_public_metrics: { impression_count: views, user_profile_clicks: 1 }, ...extra })
const tweets = [
  tw('1', 3, 50), tw('2', 4, 60), tw('3', 5, 70), tw('4', 9, 900),          // test_low: 3 settled posts, median 60 (+1 in the window: 900)
  tw('5', 3, 400), tw('6', 6, 500), tw('7', 8, 600),                        // test_good: median 500
  tw('8', 1, 5),                                                            // test_low but 1 day old: out of the medians, in the 7-day totals
  tw('9', 3, 20), tw('10', 4, 10), tw('11', 5, 30),                         // live: never cut
  tw('12', 3, 15), tw('13', 4, 15), tw('14', 5, 15),                        // hand: never cut
  tw('15', 4, 40), tw('16', 5, 40),                                         // test_few: two posts
  tw('17', 20, 9999),                                                       // past the 16 days: out
]
const types = new Map([['1', 'test_low'], ['2', 'test_low'], ['3', 'test_low'], ['4', 'test_low'], ['8', 'test_low'], ['5', 'test_good'], ['6', 'test_good'], ['7', 'test_good'], ['9', 'live · LAMP'], ['10', 'live · LAMP'], ['11', 'live · LAMP'], ['15', 'test_few'], ['16', 'test_few'], ['17', 'test_low']])
const sum = G.summarize({ tweets, types, now: NOW })
const t = (type) => sum.types.find((x) => x.type === type)
ok(t('test_low').posts === 4 && t('test_low').median === 65, `a type's 14 days: settled posts only (${JSON.stringify(t('test_low'))})`)
ok(t('test_good').median === 500 && G.verdictOf(t('test_good')) === 'earning', 'over the bar: earning')
ok(G.verdictOf(t('test_low')) === 'cut' && G.verdictOf(t('test_few')) === 'few', 'under the bar: cut; two posts: too few')
ok(G.verdictOf(t('live · LAMP')) === 'outside' && G.verdictOf(t(G.HAND)) === 'outside', 'live and hand posts sit outside the rule')
ok(G.cutList(sum.types).map((x) => x.type).join(',') === 'test_low', 'the cut list')
const last7 = tweets.filter((x) => Date.parse(x.created_at) >= NOW - 7 * DAY)
ok(sum.posts7 === last7.length && sum.views7 === last7.reduce((a, x) => a + x.public_metrics.impression_count, 0), `7-day totals (${sum.posts7} posts, ${sum.views7} views)`)
ok(sum.engagement7 === +((4 * last7.length) / sum.views7 * 100).toFixed(2) && sum.profile7 === last7.length, `engagement and profile clicks (${sum.engagement7}%)`)
ok(G.exemptType('fact:streaks') === false && G.exemptType('by_numbers') === false, 'fact posts and scheduled kinds are judged')

// 3. the X read
const calls = []
const fakeX = async (path, q) => {
  calls.push([path, q])
  if (path === '/2/users/me') return { ok: true, json: { data: { id: '99', username: 'TestAccount', public_metrics: { followers_count: 140 } } } }
  if (q['tweet.fields'].includes('non_public') && !q.pagination_token) return { ok: false, status: 400, error: 'test: too old for private numbers' }
  if (!q.pagination_token) return { ok: true, json: { data: [tw('a', 1, 10)], meta: { next_token: 'p2' } } }
  return { ok: true, json: { data: [tw('b', 2, 20)], meta: {} } }
}
const xr = await G.readX({ sinceMs: NOW - 16 * DAY, get: fakeX })
ok(xr.me.followers === 140 && xr.tweets.map((x) => x.id).join(',') === 'a,b', `followers and two pages (${JSON.stringify(xr.me)} ${xr.tweets.length})`)
ok(calls.some(([p, q]) => p === '/2/users/99/tweets' && q['tweet.fields'] === 'created_at,public_metrics'), 'a refused private read falls back to the public numbers')

// 4. the type match (a fake database that answers .in() per table)
const tables = {
  homer_feed_posts: [{ kind: 'by_numbers', x_post_id: 'a' }], fact_posts: [{ family: 'streaks', x_post_id: 'b' }],
  lamp_goal_feed: [{ x_post_id: 'c' }], homer_feed: [{ reply_post_id: 'd' }],
}
const tdb = { from: (table) => ({ select: () => ({ in: async (col, ids) => ({ data: (tables[table] || []).filter((r) => ids.includes(r[col])), error: null }) }) }) }
const map = await G.readTypes(tdb, ['a', 'b', 'c', 'd', 'e'])
ok(map.get('a') === 'by_numbers' && map.get('b') === 'fact:streaks' && map.get('c') === 'live · LAMP' && map.get('d') === 'live · MOONSHOT' && !map.has('e'), `ids to types (${JSON.stringify([...map])})`)

// 5. the snapshot, once a week, on a fake database
const store = []
const sdb = { from: () => {
  const st = {}
  const api = {
    select: () => api, eq: (k, v) => { st[k] = v; return api },
    maybeSingle: async () => ({ data: store.find((r) => r.week === st.week) || null, error: null }),
    upsert: async (rows) => { for (const r of rows) if (!store.some((x) => x.week === r.week)) store.push(r); return { error: null } },
  }
  return api
} }
const stubs = { x: async () => ({ me: { id: '99', username: 'TestAccount', followers: 140 }, tweets }), types: async () => types, site: async () => ({ accounts: 50, accounts7: 4, push: 12, members: 3, founding: 2 }), discord: async () => 77 }
G._resetGrowthForTests()
ok(await G.snapshotOnce(sdb, { clock: { day: '2026-10-26', hour: 5 }, now: NOW, ...stubs }) === 'not-due', 'before 6 AM: not due')
const r1 = await G.snapshotOnce(sdb, { clock: { day: '2026-10-26', hour: 7 }, now: NOW, ...stubs })
ok(/^taken: 2026-10-26/.test(r1) && /1 to cut or rework/.test(r1), `taken (${r1})`)
const row = store[0]
ok(row?.data?.followers === 140 && row.data.discord === 77 && row.data.site.founding === 2 && row.data.types.length === sum.types.length, 'the row holds the week')
ok(await G.snapshotOnce(sdb, { clock: { day: '2026-10-27', hour: 9 }, now: NOW + DAY, ...stubs }) === 'already-taken', 'once a week (Tuesday: the same week, nothing read)')
G._resetGrowthForTests()
ok(await G.snapshotOnce(sdb, { clock: { day: '2026-10-26', hour: 7 }, now: NOW, ...stubs, x: async () => ({ error: 'test refused', tweets: [] }) }) === 'already-taken', 'a fresh instance finds the row')
G._resetGrowthForTests()
ok(/^x-failed/.test(await G.snapshotOnce(sdb, { clock: { day: '2026-11-02', hour: 7 }, now: NOW + 7 * DAY, ...stubs, x: async () => ({ error: 'test refused', tweets: [] }) })), 'X refused: nothing written, tried again later')
ok(store.length === 1, 'nothing half-written')
process.env.GROWTH_OFF = 'on'
ok(await G.snapshotOnce(sdb, { clock: { day: '2026-11-09', hour: 7 }, now: NOW, ...stubs }) === 'off', 'GROWTH_OFF=on stops it')
delete process.env.GROWTH_OFF

// 6. the /admin panel
const { renderToStaticMarkup } = await import('react-dom/server')
const React = (await import('react')).default
const { default: GrowthPanel } = await import('../components/admin/GrowthPanel.js')
const html = renderToStaticMarkup(React.createElement(GrowthPanel, { rows: [{ week: '2026-10-26', data: row.data }, { week: '2026-10-19', data: { ...row.data, followers: 130, discord: 70 } }] }))
ok(html.includes('GROWTH · WEEK OF 2026-10-26') && html.includes('+10 vs last week') && html.includes('CUT OR REWORK · 1') && html.includes('test_low'), 'the panel: the week, the change, the cut list')
ok(html.includes('WEEK BY WEEK') && html.includes('Vercel'), 'the trend and where the visits live')
ok(renderToStaticMarkup(React.createElement(GrowthPanel, { rows: [] })).includes('No snapshot yet'), 'no row yet: it says so')

// 7. the SQL and the wiring
const sql = fs.readFileSync(new URL('../supabase/migrations/202610211200_growth_snapshots.sql', import.meta.url), 'utf8')
ok(/create table if not exists public\.growth_snapshots/.test(sql) && /enable row level security/.test(sql), 'the table, RLS on')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
ok(/out\.growth = await snapshotOnce\(db, \{ clock \}\)/.test(route), 'tried from the receipt step')
const admin = fs.readFileSync(new URL('../app/admin/page.js', import.meta.url), 'utf8')
ok(/<GrowthPanel rows=\{growth\} \/>/.test(admin), '/admin shows it')

console.log(bad ? `${bad}/${n} FAILED` : `check-growth: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
