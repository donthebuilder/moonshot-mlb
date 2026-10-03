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
import { monthUsage } from '../../lib/odds/sgo'
import { monthPlan, SOFT_CAP } from '../../lib/odds/budget'
import { LEAGUES } from '../../lib/odds/snap'
import { autopostState, FACTS_CONFIG } from '../../lib/facts/engine'
import { AutopostSwitch, DeleteFactPost } from '../../components/admin/FactsControls'
import { readShadows, readVsBook } from '../../lib/shadowRecord'
import { VERSIONS as NHL_VERSIONS } from '../../lib/nhl/versions'

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
// the shadow models' graded lines (lib/shadowRecord.js), 10 min: they change once a night
const cachedShadows = unstable_cache(async () => { const db = service(); return db ? readShadows(db) : [] }, ['admin-shadows-v1'], { revalidate: 600 })
// LAMP SHOTS 3+ (public) against the book's lock line (M3)
const cachedVsBook = unstable_cache(async () => { const db = service(); return db ? readVsBook(db, { table: 'lamp_prop_log', market: 'SOG', oddsMarket: 'sog', sport: 'nhl', versions: NHL_VERSIONS.sog, bar: 3 }) : null }, ['admin-vsbook-v1'], { revalidate: 600 })

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
  // THE ODDS MONTH (lib/odds/budget.js): what SGO says we've spent, and the planner's call
  const [usage, plan] = await Promise.all([
    monthUsage().catch((e) => ({ error: e?.message })),
    monthPlan(easternToday().slice(0, 7), LEAGUES).catch((e) => ({ error: e?.message })),
  ])
  // THE FACT ENGINE (lib/facts/engine.js): the switch, today's spend, the last posts
  const fdb = adminClient()
  const [fstate, frows] = fdb ? await Promise.all([
    autopostState(fdb).catch((e) => ({ on: false, why: e?.message, missing: true })),
    fdb.from('fact_posts').select('id, day, sport, family, status, text, writer, tokens_in, tokens_out, x_post_id, fact, posted_at, error').order('created_at', { ascending: false }).limit(20),
  ]) : [{ on: false, why: 'no database', missing: true }, { data: [], error: null }]
  const shadows = await cachedShadows().catch((e) => [{ key: 'x', label: 'Shadow models', error: e?.message }])
  const vsBook = await cachedVsBook().catch((e) => ({ error: e?.message }))
  const pct = (l) => (l?.n ? `${l.pct}% ±${l.pm} (${l.hit}/${l.n})` : 'no graded calls yet')
  const today = easternToday()
  const fToday = (frows.data || []).filter((r) => r.day === today)
  const tokensToday = fToday.reduce((a, r) => a + (r.tokens_in || 0) + (r.tokens_out || 0), 0)
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

        {/* DISCORD CHANNELS (2026-10-02): one line per channel, wired / not wired,
            never the URL. Which var feeds which channel: lib/dash/discordChannels.js. */}
        <h2 className={start.kicker} style={{ marginTop: 18 }}>Discord channels</h2>
        <Line k="#moonshot-mlb" v={process.env.DISCORD_MLB_WEBHOOKS ? 'wired' : 'not wired'} src="DISCORD_MLB_WEBHOOKS -- MLB board, last call, scratch, board-hit homers, MLB feed posts" />
        <Line k="#tuddy-nfl" v={process.env.DISCORD_NFL_WEBHOOKS ? 'wired' : (process.env.DISCORD_MLB_WEBHOOKS ? 'not wired (football posts fall back to #moonshot-mlb)' : 'not wired')} src="DISCORD_NFL_WEBHOOKS -- kickoff, red zone, CALLED / ON THE BOARD touchdowns" />
        <Line k="#lamp-nhl" v={process.env.DISCORD_NHL_WEBHOOKS ? 'wired' : (process.env.DISCORD_MLB_WEBHOOKS ? 'not wired (hockey posts fall back to #moonshot-mlb)' : 'not wired')} src="DISCORD_NHL_WEBHOOKS -- CALLED goals" />
        <Line k="#buckets-nba" v={process.env.DISCORD_NBA_WEBHOOKS ? 'wired' : (process.env.DISCORD_MLB_WEBHOOKS ? 'not wired (basketball posts fall back to #moonshot-mlb)' : 'not wired')} src="DISCORD_NBA_WEBHOOKS -- 30 PIECE moments, once BUCKETS opens (BUCKETS_PUBLIC)" />
        <Line k="#called-it" v={process.env.DISCORD_RECEIPTS_WEBHOOK ? 'wired' : 'not wired'} src="DISCORD_RECEIPTS_WEBHOOK -- the night's recap, the week, the month" />
        <Line k="Live room" v={process.env.DISCORD_LIVE_WEBHOOKS ? 'wired' : 'falls back to #moonshot-mlb'} src="DISCORD_LIVE_WEBHOOKS -- followed-hitter homers, slams, board-hit slate homers (MLB only)" />
        <Line k="Last members post" v={c.membersLast ? `${c.membersLast.day}` : 'none yet'} src={c.membersLast ? `${c.membersLast.kind}${c.membersLast.discord_sent ? ' · sent to Discord' : ' · claimed, not sent'}` : 'homer_feed_posts, kinds *_members_board / *_members_grade'} />

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Odds</h2>
        {usage.error ? <p>Odds usage unavailable: {usage.error}</p>
          : <Line k="Objects this month" v={`${usage.used} / ${usage.max}`} src={`SGO /account/usage · soft cap ${SOFT_CAP} drops CLOSE, 2450 stops`} />}
        {plan.error ? <p>Month plan unavailable: {plan.error}</p> : <>
          <Line k="Games this month" v={Object.entries(plan.games).map(([L, n]) => `${L} ${n ?? '?'}`).join(' · ')} src={`each league's own schedule (${plan.leagues.join(', ')})`} />
          <Line k="Projected" v={`${plan.projected.withClose} with CLOSE · ${plan.projected.noClose} without`} src="games × snapshots (list + lock + close; NHL list + lock)" />
          <Line k="CLOSE this month" v={plan.closeOff ? 'off' : 'on'} src={plan.why} />
        </>}

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Fact posts</h2>
        <Line k="Auto-post" v={<AutopostSwitch on={fstate.on} missing={Boolean(fstate.missing)} />} src={fstate.why} />
        <Line k="Writer" v={process.env.ANTHROPIC_API_KEY ? 'Claude' : 'templates'} src={process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY set (Vercel)' : 'ANTHROPIC_API_KEY not set: fixed templates, same checks'} />
        <Line k="Today" v={`${fToday.filter((r) => r.status === 'posted').length} / ${FACTS_CONFIG.maxPerDay} posted · ${fToday.filter((r) => r.status === 'rejected').length} rejected`} src={`fact_posts on ${today}, at least ${FACTS_CONFIG.spacingMin} min apart`} />
        <Line k="AI tokens today" v={tokensToday} src="input + output, summed over today's fact_posts rows" />
        {frows.error ? <p>Fact posts unavailable: {frows.error.message}</p> : (frows.data || []).map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid rgba(127,127,127,.25)', padding: '10px 0', fontSize: 13, lineHeight: 1.5 }}>
            <div><b>{r.status.toUpperCase()}</b> · {r.sport} · {r.family} · {r.day}{r.writer ? ` · ${r.writer}` : ''}</div>
            {r.text ? <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{r.text}</div> : null}
            <div style={{ opacity: 0.7 }}>{r.fact?.why}{r.fact?.source ? ` · source: ${r.fact.source}` : ''}{r.error ? ` · error: ${r.error}` : ''}</div>
            {r.status === 'posted' && r.x_post_id ? <div style={{ marginTop: 6 }}><a href={`https://x.com/i/web/status/${r.x_post_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', marginRight: 12 }}>on X →</a><DeleteFactPost id={r.id} /></div> : null}
          </div>
        ))}

        {/* SHADOW MODELS (BATCH-MODEL-V2 "PROVE IT"): logged-only, never public;
            a shadow goes live only as a new version when its range clears the live one */}
        <h2 className={start.kicker} style={{ marginTop: 18 }}>Shadow models</h2>
        {shadows.map((s) => (s.error
          ? <Line key={s.key} k={s.label} v="—" src={`unavailable: ${s.error}`} />
          : <div key={s.key}>
              <Line k={s.label} v={pct(s.shadow)} src={`${s.what} · ${s.note} · 95% range`} />
              {s.live ? <Line k="  … the live model, same games" v={pct(s.live)} src="lamp_goal_log called rows on the games the shadow locked" /> : null}
              <Line k="  … base rate (every graded row)" v={pct(s.base)} src="the share of all graded rows that hit -- the bar any pick has to clear" />
            </div>))}
 <h2 className={start.kicker} style={{ marginTop: 18 }}>Against the book</h2>
        {vsBook?.error ? <Line k="LAMP SHOTS 3+ calls" v="—" src={`unavailable: ${vsBook.error}`} /> : vsBook?.n ? <>
          <Line k="LAMP SHOTS 3+ · cleared our bar" v={pct(vsBook.cleared)} src={`${vsBook.n} of ${vsBook.calls} graded calls have the book's lock line (odds_lines, nhl sog, fair line)`} />
          <Line k="  … beat the book's line" v={pct(vsBook.beat)} src="his shots on goal above the book's own lock line -- chalk that only clears a soft bar shows up here" />
          <Line k="  … the book's no-vig chance (at 2.5)" v={vsBook.bookP != null ? `${vsBook.bookP}% (${vsBook.bookPn})` : '—'} src="mean implied probability of the over, from the fair price, where the line was our bar" />
        </> : <Line k="LAMP SHOTS 3+ calls" v="no graded calls with a lock line yet" src="odds_lines nhl sog at lock, joined to lamp_prop_log SOG called rows" />}
        <Line k="MLB · HR pick shadow (M0)" v="bot repo" src="python3 bots/eval_shadow_picks.py --fetch (hr_pick_top_score #1 vs the real HR pick, from por_rows)" />

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Waitlist</h2>
        <Line k="DASH Pro waitlist" v="—" src="not built (no waitlist exists yet)" />

        <h2 className={start.kicker} style={{ marginTop: 18 }}>Site</h2>
        <Line k="Supabase egress" v="—" src="not exposed by the API: Supabase dashboard → Project → Usage" />
      </section>
    </main>
  )
}
