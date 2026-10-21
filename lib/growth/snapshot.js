// GROWTH: THE WEEKLY SNAPSHOT (2026-10-21, claude/BATCH-GROWTH-PLAN-2026-10-21.txt). Playbook §6: "WEEKLY SNAPSHOT (one row a week, on /admin as
// GROWTH)" and the replace rule: "a post type under 100 median views for two weeks gets cut or reworked". Server only.
//
// ONE ROW A WEEK in growth_snapshots (week = that week's Monday, Phoenix), taken from Monday 6 AM Phoenix by the homers tick (the first tick after the
// push takes this week's). What it reads, once:
//   X        /2/users/me (followers) and our own timeline for the last 16 days (/2/users/:id/tweets: views, likes, replies, reposts, quotes,
//            bookmarks, and profile clicks, which X gives an account for its own posts under 30 days old)
//   TYPES    each post matched to its type through the tables that keep its X id (homer_feed_posts.kind, fact_posts.family, and the four live
//            feeds); a post nothing matches is "by hand or other"
//   SITE     accounts (auth users), push devices, members (site_members; source whop = founding)
//   DISCORD  the invite link's public member count (no token)
// NOT read: /start and /called visits. They live in Vercel Analytics, which has no read the site can use; /admin says where to look.
//
// THE CUT LIST is advice on /admin, never automatic: a type with 3+ posts in the 14 days and median views under 100 = CUT OR REWORK. Live event
// posts and hand posts are outside the rule (the playbook: "Live event posts sit outside that"). Posts under 2 days old stay out of the medians:
// their views are still coming in. GROWTH_OFF=on stops the weekly read.
import { tierOf } from '../dash/xPolicy'
import { DISCORD_URL } from '../members'

export const GROWTH_TABLE = 'growth_snapshots'
export const FROM_PHX_HOUR = 6
export const WINDOW_DAYS = 14
export const SETTLE_MS = 2 * 86400e3
export const CUT_VIEWS = 100
export const CUT_MIN_POSTS = 3
export const growthOff = () => /^(on|1|true)$/i.test(String(process.env.GROWTH_OFF || '').trim())
const DAY = 86400e3
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

// the live feeds: every row is an event post (an HR, a TD, a goal, a BUCKETS moment), outside the cut rule
export const LIVE_SOURCES = Object.freeze({ homer_feed: 'live · MOONSHOT', nfl_td_feed: 'live · TUDDY', lamp_goal_feed: 'live · LAMP', buckets_feed: 'live · BUCKETS' })
export const HAND = 'by hand or other'

/** That week's Monday for a Phoenix date "YYYY-MM-DD". Pure. */
export function weekOf(day) {
  const d = new Date(`${day}T12:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10)
}
/** Due: from 6 AM Phoenix any day the week has no row yet (the row itself is the once-a-week claim). Pure. */
export const growthDue = (clock) => Boolean(clock && clock.day && Number(clock.hour) >= FROM_PHX_HOUR)

export function median(list) {
  const a = (list || []).filter((x) => Number.isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

/** Is a type outside the cut rule (live events, the called / board tiers, hand posts)? Pure. */
export function exemptType(type) {
  if (!type || type === HAND || String(type).startsWith('live · ')) return true
  if (String(type).startsWith('fact:')) return false
  const t = tierOf(type)
  return t === 'called' || t === 'board'
}

/** One post's numbers from X's tweet object. Pure. */
export function postNumbers(t) {
  const p = t?.public_metrics || {}, np = t?.non_public_metrics || {}
  const views = num(np.impression_count) ?? num(p.impression_count) ?? 0
  const eng = ['like_count', 'reply_count', 'retweet_count', 'quote_count', 'bookmark_count'].reduce((a, k) => a + (num(p[k]) || 0), 0)
  return { views, eng, profile: num(np.user_profile_clicks) }
}

/**
 * The summary of our posts: the last 7 days' totals and every type's 14 days. `tweets` = X tweet objects (id, created_at, metrics),
 * `types` = Map id -> type, `now` = ms. Pure.
 */
export function summarize({ tweets = [], types = new Map(), now = Date.now() } = {}) {
  const rows = (tweets || []).map((t) => ({ id: String(t.id), at: Date.parse(t.created_at), type: types.get(String(t.id)) || HAND, ...postNumbers(t) })).filter((r) => Number.isFinite(r.at))
  const last7 = rows.filter((r) => r.at >= now - 7 * DAY)
  const views7 = last7.reduce((a, r) => a + r.views, 0)
  const eng7 = last7.reduce((a, r) => a + r.eng, 0)
  const prof = last7.filter((r) => r.profile != null)
  const inWindow = rows.filter((r) => r.at >= now - WINDOW_DAYS * DAY - SETTLE_MS && r.at <= now - SETTLE_MS)
  const by = new Map()
  for (const r of inWindow) { if (!by.has(r.type)) by.set(r.type, []); by.get(r.type).push(r) }
  const types14 = [...by.entries()].map(([type, list]) => ({
    type, posts: list.length, median: median(list.map((r) => r.views)), total: list.reduce((a, r) => a + r.views, 0), exempt: exemptType(type),
  })).sort((a, b) => (b.median ?? -1) - (a.median ?? -1) || b.posts - a.posts)
  return {
    posts7: last7.length, views7, engagement7: views7 > 0 ? +(eng7 / views7 * 100).toFixed(2) : null,
    profile7: prof.length ? prof.reduce((a, r) => a + r.profile, 0) : null,
    types: types14,
  }
}

/** The verdict for one type: 'cut' | 'earning' | 'few' | 'outside'. Pure. */
export function verdictOf(t) {
  if (!t || t.exempt) return 'outside'
  if (t.posts < CUT_MIN_POSTS || t.median == null) return 'few'
  return t.median < CUT_VIEWS ? 'cut' : 'earning'
}
/** The cut list: types under the bar, worst first. Pure. */
export const cutList = (types) => (types || []).filter((t) => verdictOf(t) === 'cut').sort((a, b) => a.median - b.median)

// ── THE READS (impure; each injectable for the tests) ──────────────────────────────────────────────────────────
/** Our account and our timeline since `sinceMs`: { me: { id, username, followers }, tweets } or { error }. At most 4 pages of 100. */
export async function readX({ sinceMs, get = null } = {}) {
  const read = get || (await import('../dash/xPost')).getFromX
  const me = await read('/2/users/me', { 'user.fields': 'public_metrics' })
  if (!me?.ok || !me.json?.data?.id) return { error: `X /2/users/me: ${me?.error || me?.status || 'no data'}` }
  const id = me.json.data.id
  const tweets = []
  let token = null
  for (let page = 0; page < 4; page++) {
    const q = { max_results: '100', exclude: 'retweets', 'tweet.fields': 'created_at,public_metrics,non_public_metrics', start_time: new Date(sinceMs).toISOString(), ...(token ? { pagination_token: token } : {}) }
    let r = await read(`/2/users/${id}/tweets`, q)
    // a post past 30 days has no private numbers: X refuses the whole page, so the public numbers are asked for instead
    if (!r?.ok && (r?.status === 400 || r?.status === 403)) r = await read(`/2/users/${id}/tweets`, { ...q, 'tweet.fields': 'created_at,public_metrics' })
    if (!r?.ok) return { error: `X timeline: ${r?.error || r?.status}`, me: { id, username: me.json.data.username, followers: num(me.json.data.public_metrics?.followers_count) }, tweets }
    tweets.push(...(r.json?.data || []))
    token = r.json?.meta?.next_token
    if (!token) break
  }
  return { me: { id, username: me.json.data.username, followers: num(me.json.data.public_metrics?.followers_count) }, tweets }
}

/** Map X id -> post type for `ids`, from the tables that keep X ids. A table that fails is logged and skipped. */
export async function readTypes(db, ids) {
  const out = new Map()
  const list = [...new Set((ids || []).map(String))]
  if (!list.length) return out
  const chunks = []
  for (let i = 0; i < list.length; i += 100) chunks.push(list.slice(i, i + 100))
  const q = async (table, cols, idCol, typeOf) => {
    for (const c of chunks) {
      const r = await db.from(table).select(cols).in(idCol, c)
      if (r?.error) { console.error(`[growth] ${table}: ${r.error.message}`); return }
      for (const row of r.data || []) if (row[idCol]) out.set(String(row[idCol]), typeOf(row))
    }
  }
  await q('homer_feed_posts', 'kind,x_post_id', 'x_post_id', (r) => r.kind)
  await q('fact_posts', 'family,x_post_id', 'x_post_id', (r) => `fact:${r.family || 'other'}`)
  for (const [table, label] of Object.entries(LIVE_SOURCES)) await q(table, 'x_post_id', 'x_post_id', () => label)
  await q('homer_feed', 'reply_post_id', 'reply_post_id', () => 'live · MOONSHOT')
  await q('nfl_td_feed', 'reply_x_post_id', 'reply_x_post_id', () => 'live · TUDDY')
  return out
}

/** Accounts, push devices, members. Each null when its read fails (logged). */
export async function readSite(db, { now = Date.now() } = {}) {
  const out = { accounts: null, accounts7: null, push: null, members: null, founding: null }
  try {
    const users = []
    for (let page = 1; page < 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      users.push(...(data?.users || []))
      if (!data?.users?.length || data.users.length < 1000) break
    }
    out.accounts = users.length
    out.accounts7 = users.filter((u) => Date.parse(u.created_at) >= now - 7 * DAY).length
  } catch (e) { console.error(`[growth] accounts: ${e?.message || e}`) }
  const count = async (table, f = (x) => x) => { const r = await f(db.from(table).select('*', { count: 'exact', head: true })); if (r?.error) { console.error(`[growth] ${table}: ${r.error.message}`); return null } return r.count ?? null }
  out.push = await count('dash_push_subscriptions')
  out.members = await count('site_members')
  out.founding = await count('site_members', (q) => q.eq('source', 'whop'))
  return out
}

/** The Discord server's member count from the invite link (public, no token), or null. */
export async function readDiscord({ fetcher = fetch } = {}) {
  const code = String(DISCORD_URL).split('/').pop()
  try {
    const r = await fetcher(`https://discord.com/api/v10/invites/${code}?with_counts=true`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) { console.error(`[growth] discord invite ${r.status}`); return null }
    const j = await r.json()
    return num(j?.approximate_member_count)
  } catch (e) { console.error(`[growth] discord: ${e?.message || e}`); return null }
}

/**
 * The week's row, once. `clock` = phxClock(now). Reads are injectable for the tests.
 * @returns {Promise<string>} what happened, for the tick's log
 */
let _triedAt = 0
let _doneWeek = null      // this instance has seen the week's row: no more reads until next week
export const _resetGrowthForTests = () => { _triedAt = 0; _doneWeek = null }
export async function snapshotOnce(db, { clock, now = Date.now(), x = null, types = null, site = null, discord = null } = {}) {
  if (growthOff()) return 'off'
  if (!growthDue(clock)) return 'not-due'
  const week = weekOf(clock.day)
  if (_doneWeek === week) return 'already-taken'
  if (now - _triedAt < 30 * 60e3) return 'waiting'
  _triedAt = now
  const have = await db.from(GROWTH_TABLE).select('week').eq('week', week).maybeSingle()
  if (have?.error) return `read-failed: ${have.error.message}`
  if (have?.data) { _doneWeek = week; return 'already-taken' }
  const xr = await (x || readX)({ sinceMs: now - (WINDOW_DAYS * DAY + SETTLE_MS) })
  if (xr.error && !xr.tweets?.length) return `x-failed: ${xr.error}`
  const map = await (types || readTypes)(db, (xr.tweets || []).map((t) => t.id))
  const sum = summarize({ tweets: xr.tweets, types: map, now })
  const data = {
    takenAt: new Date(now).toISOString(), followers: xr.me?.followers ?? null, username: xr.me?.username || null, xError: xr.error || null, postsRead: (xr.tweets || []).length,
    ...sum, site: await (site || readSite)(db, { now }), discord: await (discord || readDiscord)(),
  }
  const ins = await db.from(GROWTH_TABLE).upsert([{ week, data }], { onConflict: 'week', ignoreDuplicates: true })
  if (ins?.error) return `write-failed: ${ins.error.message}`
  _doneWeek = week
  return `taken: ${week} (${data.postsRead} posts read, ${cutList(sum.types).length} to cut or rework)`
}

/** The last `n` rows, newest first, for /admin. [] when the table is not there yet. */
export async function readSnapshots(db, n = 8) {
  const r = await db.from(GROWTH_TABLE).select('week,data').order('week', { ascending: false }).limit(n)
  if (r?.error) { console.error(`[growth] read: ${r.error.message}`); return [] }
  return r.data || []
}
