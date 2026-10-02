// /admin (2026-10-01, ADMIN-PAGE-PLAN): the numbers page only Donovan opens.
//
// ACCESS: signed in (Supabase auth, the same session /account reads) AND the
// account's email in ADMIN_EMAILS (Vercel env, comma list, never committed).
// Anyone else gets a 404 -- not "forbidden" -- so nobody learns the page
// exists. Not linked anywhere but /account, and only for an admin.
//
// COUNTS ONLY: no email, name or id reaches the HTML. Every query runs here
// with the service-role key; each line says when it was read and where from.
// Cached 60 s.
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { logXBudget } from '../../lib/dash/xBudget'
import { easternToday } from '../../lib/data'
import { isAdminEmail } from '../../lib/admin'
import start from '../start/start.module.css'
import { adminClient } from '../../lib/supabase/admin'
import { MEMBERS_KINDS } from '../../lib/dash/membersPost'

export const dynamic = 'force-dynamic'
// The title is computed, not static: a static one rides the 404's payload
// and would tell a non-admin the page exists. Everyone else gets the 404's.
export async function generateMetadata() {
  const robots = { index: false, follow: false }
  try {
    if (!hasSupabaseConfig()) return { title: 'Not found · DASH Network', robots }
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return { title: user && isAdminEmail(user.email) ? 'Admin · DASH Network' : 'Not found · DASH Network', robots }
  } catch { return { title: 'Not found · DASH Network', robots } }
}

const WATCH_KEYS = ['mlb_watchlist_v1', 'tuddy_watchlist_v1', 'dash_follow_v1']
const DAY = 86400000

function service() {
  return adminClient()
}

// A saved list holds at least one live entry: an array with items, or a map
// with an entry that isn't a tombstone (the follow list is merge-stamped).
function holdsOne(v) {
  if (Array.isArray(v)) return v.length > 0
  if (v && typeof v === 'object') {
    return Object.values(v).some((x) => (Array.isArray(x) ? x.length > 0 : x && typeof x === 'object' ? x.deleted !== true && x.on !== false && x.removed !== true : Boolean(x)))
  }
  return false
}

async function readCounts() {
  const db = service()
  if (!db) return { error: 'SUPABASE_SERVICE_ROLE_KEY is not set on this deploy.' }
  const now = Date.now()
  const day = easternToday()
  const out = { readAt: new Date(now).toISOString(), day }

  // ACCOUNTS + ACTIVE: auth.users through the admin API, every page.
  try {
    const users = []
    for (let page = 1; page < 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      users.push(...(data?.users || []))
      if (!data?.users?.length || data.users.length < 1000) break
    }
    const since = (ms) => users.filter((u) => Date.parse(u.created_at) >= now - ms).length
    const todayStart = Date.parse(`${day}T00:00:00-04:00`)
    out.accounts = {
      total: users.length,
      today: users.filter((u) => Date.parse(u.created_at) >= todayStart).length,
      d7: since(7 * DAY), d30: since(30 * DAY),
      active7: users.filter((u) => u.last_sign_in_at && Date.parse(u.last_sign_in_at) >= now - 7 * DAY).length,
    }
  } catch (e) { out.accountsError = e.message }

  // PUSH: devices subscribed; today's outcomes from dash_push_log.
  try {
    const subs = await db.from('dash_push_subscriptions').select('*', { count: 'exact', head: true })
    const since = new Date(Date.parse(`${day}T00:00:00-04:00`)).toISOString()
    const counts = {}
    for (const o of ['sent', 'bundled', 'dropped', 'failed']) {
      const r = await db.from('dash_push_log').select('*', { count: 'exact', head: true }).eq('outcome', o).gte('at', since)
      counts[o] = r.count ?? null
    }
    out.push = { devices: subs.count ?? null, ...counts }
  } catch (e) { out.pushError = e.message }

  // WATCHLIST: accounts holding at least one saved player (watchlists + follows).
  try {
    const { data, error } = await db.from('dash_user_state').select('user_id,key,value').in('key', WATCH_KEYS)
    if (error) throw error
    out.watchers = new Set((data || []).filter((r) => holdsOne(r.value)).map((r) => r.user_id)).size
  } catch (e) { out.watchError = e.message }

  // X: this month's posts, counted the way the posting cap counts them.
  const cap = Number(process.env.X_MONTHLY_CAP) || 0
  // An unlimited cap here, so reading the page never logs the posting cap's warnings.
  const x = await logXBudget(db, day, { mode: 'admin', cap: Number.MAX_SAFE_INTEGER })
  const per = Number(process.env.X_COST_PER_POST)
  out.x = x ? { used: x.used, cap: cap || null, cost: Number.isFinite(per) && per > 0 ? x.used * per : null, per: Number.isFinite(per) && per > 0 ? per : null } : null
  // Members (M4): the last members-only post, if any has gone out
  const { data: lastMember } = await db.from('homer_feed_posts').select('day,kind,discord_sent')
    .in('kind', Object.values(MEMBERS_KINDS)).order('day', { ascending: false }).limit(1)
  out.membersLast = lastMember?.[0] || null
  return out
}

const cachedCounts = unstable_cache(readCounts, ['admin-counts-v1'], { revalidate: 60 })

function Line({ k, v, src }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 12px', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 15 }}>{k}</span>
      <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v ?? '—'}</strong>
      <small style={{ gridColumn: '1 / -1', color: 'var(--dim)', fontSize: 12 }}>{src}</small>
    </div>
  )
}

export default async function AdminPage() {
  if (!hasSupabaseConfig()) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) notFound()

  const c = await cachedCounts()
  const a = c.accounts || {}
  const p = c.push || {}
  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>ADMIN</strong></div>
        </a>
      </header>
      <section style={{ padding: '22px 0 40px', maxWidth: 560 }}>
        <p className={start.kicker}>The numbers · read {c.readAt ? new Date(c.readAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '—'} ET · cached 60 s</p>
        {c.error ? <p>{c.error}</p> : null}

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Accounts</h2>
        {c.accountsError ? <p>Accounts unavailable: {c.accountsError}</p> : <>
          <Line k="Total" v={a.total} src="auth.users (Supabase admin API)" />
          <Line k="New today (ET)" v={a.today} src={`created_at on ${c.day}`} />
          <Line k="New, last 7 days" v={a.d7} src="created_at" />
          <Line k="New, last 30 days" v={a.d30} src="created_at" />
          <Line k="Active, last 7 days" v={a.active7} src="last_sign_in_at within 7 days" />
        </>}

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Push</h2>
        {c.pushError ? <p>Push unavailable: {c.pushError}</p> : <>
          <Line k="Devices subscribed" v={p.devices} src="dash_push_subscriptions (no sport is stored per device)" />
          <Line k="Sent today" v={p.sent} src="dash_push_log outcome = sent, since midnight ET" />
          <Line k="Bundled today" v={p.bundled} src="dash_push_log outcome = bundled" />
          <Line k="Dropped today" v={p.dropped} src="dash_push_log outcome = dropped" />
          <Line k="Failed today" v={p.failed} src="dash_push_log outcome = failed" />
        </>}

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Watchlists</h2>
        {c.watchError ? <p>Watchlists unavailable: {c.watchError}</p>
          : <Line k="Accounts with a saved player" v={c.watchers} src={`dash_user_state: ${WATCH_KEYS.join(', ')}`} />}

        <h2 className={start.kicker} style={{ marginTop: 18 }}>X</h2>
        {c.x ? <>
          <Line k="Posts this month" v={c.x.cap ? `${c.x.used} / ${c.x.cap}` : c.x.used} src="lib/dash/xBudget.js logXBudget: homer_feed + homer_feed_posts + nfl_td_feed rows with an X post id" />
          <Line k="Estimated cost" v={c.x.cost != null ? `$${c.x.cost.toFixed(2)}` : null} src={c.x.per != null ? `posts × X_COST_PER_POST ($${c.x.per})` : 'X_COST_PER_POST is not set'} />
        </> : <p>X count unavailable.</p>}

        {/* MEMBERS (BATCH-MEMBERS-PLAN M4): Whop holds the count -- a link, not an
            integration built for one number. The two settings say set / not set,
            never their values. */}
        <h2 className={start.kicker} style={{ marginTop: 18 }}>Members</h2>
        <Line k="Founding members" v={<a href="https://whop.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Whop →</a>} src="counted in the Whop dashboard (the $5 founders product)" />
        <Line k="Checkout link" v={process.env.NEXT_PUBLIC_MEMBERS_URL ? 'set' : 'not set'} src="NEXT_PUBLIC_MEMBERS_URL (Vercel) -- the members line on /start and /called shows only when set" />
        <Line k="#members webhook" v={process.env.DISCORD_MEMBERS_WEBHOOK ? 'wired' : 'not wired'} src="DISCORD_MEMBERS_WEBHOOK (Vercel) -- no members post runs until it is" />
        <Line k="Last members post" v={c.membersLast ? `${c.membersLast.day}` : 'none yet'} src={c.membersLast ? `${c.membersLast.kind}${c.membersLast.discord_sent ? ' · sent to Discord' : ' · claimed, not sent'}` : 'homer_feed_posts, kinds *_members_board / *_members_grade'} />

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Waitlist</h2>
        <Line k="DASH Pro waitlist" v="—" src="not built (no waitlist exists yet)" />

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Site</h2>
        <Line k="Supabase egress" v="—" src="not exposed by the API: Supabase dashboard → Project → Usage" />
      </section>
    </main>
  )
}
