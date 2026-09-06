// /called — DID THE BOT CALL IT? Every home run tonight, on the record.
//
// 2026-09-05. The public face of the homer feed (lib/dash/homerFeed.js). One
// question, answered the way a stranger from X would check it: which of
// tonight's home runs did the bot have on its board before the ball left, and
// how has that gone over the last ten nights.
//
// NOT A GATE, NOT A BOARD. Nothing here needs an account, nothing here
// scores. It reads homer_feed — rows the cron wrote when each homer was first
// seen, with the designation frozen at that moment — so the number on this
// page and the star on the post can never disagree.
//
// EMPTY IS EMPTY. Before the first homer of the night the page says so. A
// capture rate of 0/0 is not a percentage and is not shown as one.
//
// 2026-09-06: past nights in the "Last N nights" strip are now real —
// each bar with a homer count links (no JS, plain #anchor) down to a
// <details> for that night with the same by-name breakdown "Tonight's
// home runs" gets. Donovan asked to be able to tap into other nights from
// this page the way the signed-in Ledger lab already lets him; this reuses
// the SAME rows the bars are already counting, one extra grouping pass on
// data already fetched — no new query.

import { createClient } from '@supabase/supabase-js'
import { easternToday } from '../../lib/data'
import { captureFrom, matchupWord, oddsWord, roleWord } from '../../lib/dash/homerFeed'
import styles from './called.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Called It — MOONSHOT · DASH Network',
  description: 'Every MLB home run tonight, tagged with whether MOONSHOT had the hitter on its board before first pitch. Ten-night capture rate, graded in public.',
}

const DAYS = 10

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function shiftDay(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function prettyDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// Compact form for the per-night <summary> row — "Wed, Sep 3" — prettyDay's
// full weekday reads fine as a hero kicker but wraps a summary row on phone.
function shortDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

async function load() {
  const db = client()
  const today = easternToday()
  if (!db) return { today, rows: [], picks: [], calledIds: new Set(), history: [], byDay: new Map(), configured: false }
  const since = shiftDay(today, -(DAYS - 1))
  const { data } = await db
    .from('homer_feed')
    .select('day,player_id,hr_n,name,team,opponent,inning,home,role,on_board,hr_score,board_rank,odds_over,odds_book,seen_at')
    .gte('day', since)
    .lte('day', today)
    .order('seen_at', { ascending: false })
  const all = data || []
  const rows = all.filter((r) => r.day === today)
  // The morning's call, so the page shows the names BEFORE any homer lands.
  const { data: pre } = await db.from('homer_feed_posts').select('payload,x_post_id').match({ day: today, kind: 'pregame' }).maybeSingle()
  const picks = Array.isArray(pre?.payload?.picks) ? pre.payload.picks.slice(0, 5) : []
  const calledIds = new Set(rows.filter((r) => r.role).map((r) => String(r.player_id)))
  // Same window, grouped by night — the bars and the per-night drilldown
  // below both read this so the two can never disagree.
  const byDay = new Map()
  const history = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const dayRows = all.filter((r) => r.day === day)
    byDay.set(day, dayRows)
    const c = captureFrom(dayRows)
    history.push({ day, ...c })
  }
  return { today, rows, picks, calledIds, history: history.reverse(), byDay, configured: true }
}

// 2026-09-06 — THE WALL CAME DOWN. Donovan, after hearing the "a brand-new
// site should not ask for an email before anyone's seen it" feedback and
// deciding the boards should speak for themselves: /app is open again (see
// proxy.js), so a link into the board goes straight there now, same as every
// link on the front door already did. An account is still real and still
// worth having — it's what saves your watchlist, your picks, and turns on
// alerts (lib/dash/sync.js) — so SIGNUP is kept as its own link for the one
// spot on this page that is actually asking someone to create one, rather
// than wrapping every board link in a login redirect nobody asked for.
const BOARD = '/app#sport=mlb&tab=home'
const boardLink = (href) => href
const SIGNUP = `/login?next=${encodeURIComponent(BOARD)}#create-account`
const PREVIEW = 5

const glyph = (r) => (r.role ? '⭐' : r.on_board ? '⚪' : '💥')
const callWord = (r) => (r.role
  ? `${roleWord(r.role)}${r.board_rank ? ` · #${r.board_rank}` : ''}`
  : r.on_board ? `on the board, no call${r.board_rank ? ` · #${r.board_rank}` : ''}` : 'not on the board')

export default async function CalledPage() {
  const { today, rows, picks, calledIds, history, byDay, configured } = await load()
  const tonight = captureFrom(rows)
  const graded = history.filter((h) => h.total > 0)
  const span = graded.reduce((a, h) => ({ called: a.called + h.called, total: a.total + h.total }), { called: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null
  const called = rows.filter((r) => r.role)
  const rest = rows.filter((r) => !r.role)
  // Newest first, today excluded (it already has its own full section below).
  const pastNights = history.filter((h) => h.day !== today).slice().reverse()

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a className={styles.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK · MOONSHOT</small><strong>CALLED IT</strong></div>
        </a>
        <nav className={styles.nav}>
          <a className={styles.navCta} href={BOARD}>Get tonight&apos;s calls</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>{prettyDay(today)}</p>
        {tonight.total ? (
          <>
            <h1 className={styles.headline}>
              <span className={styles.big}>{tonight.called}</span> of <span className={styles.big}>{tonight.total}</span> home runs were on the bot
            </h1>
            <p className={styles.sub}>
              {tonight.pct}% tonight
              {tonight.rated ? ` · ${tonight.rated} more on the board, no call` : ''}
              {tonight.off ? ` · ${tonight.off} off the board` : ''}
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.headline}>No home runs yet tonight</h1>
            <p className={styles.sub}>
              {configured ? 'This page fills in within a minute of each one.' : 'The feed is not configured on this deployment.'}
            </p>
          </>
        )}
        <a className={styles.cta} href={BOARD}>
          <strong>See who the bot likes tonight</strong>
          <span>The full board, every call, before first pitch — no account needed</span>
        </a>
        <p className={styles.rule}>
          ⭐ on the bot before the ball left &nbsp;·&nbsp; ⚪ on the board, no call &nbsp;·&nbsp; 💥 not on the board. Tags are frozen when the homer is first seen and never re-graded.
        </p>
      </section>

      {picks.length ? (
        <section className={styles.panel}>
          <h2 className={styles.h2}>Tonight&apos;s calls <span className={styles.pill}>posted before first pitch</span></h2>
          <ol className={styles.calls}>
            {picks.map((p, i) => (
              <li key={p.player_id || i} className={calledIds.has(String(p.player_id)) ? styles.callHit : ''}>
                <span className={styles.callN}>{i + 1}</span>
                <a className={styles.name} href={boardLink(`/app#sport=mlb&p=${encodeURIComponent(p.player_id)}`)}>{p.name}</a>
                <span className={styles.meta}>{p.team || ''}{p.opponent ? ` vs ${p.opponent}` : ''}{p.odds_over && p.odds_book ? ` · ${p.odds_over > 0 ? '+' : ''}${p.odds_over} ${p.odds_book}` : ''}</span>
                <span className={styles.call}>{calledIds.has(String(p.player_id)) ? '⭐ went deep' : 'live'}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.h2}>Last {DAYS} nights {spanPct != null ? <span className={styles.pill}>{span.called} / {span.total} · {spanPct}%</span> : null}</h2>
        <div className={styles.bars} role="group" aria-label={`Capture rate by night over the last ${DAYS} nights — tap a night to see who went deep`}>
          {history.map((h) => {
            const href = h.total ? (h.day === today ? '#tonight' : `#night-${h.day}`) : null
            const inner = (
              <>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ height: `${h.pct || 0}%` }} />
                </div>
                <div className={styles.barPct}>{h.total ? `${h.pct}%` : '—'}</div>
                <div className={styles.barDay}>{h.day.slice(5).replace('-', '/')}</div>
              </>
            )
            return href ? (
              <a key={h.day} className={styles.barCol} href={href} aria-label={`${h.day}: ${h.called} of ${h.total} called, ${h.pct}% — see who went deep`}>
                {inner}
              </a>
            ) : (
              <div key={h.day} className={styles.barCol} title={`${h.day}: no homers recorded`}>
                {inner}
              </div>
            )
          })}
        </div>
        {pastNights.some((h) => h.total > 0) ? (
          <div className={styles.nights}>
            {pastNights.map((h) => (h.total > 0 ? <NightDetails key={h.day} h={h} rows={byDay.get(h.day) || []} /> : null))}
          </div>
        ) : null}
      </section>

      {rows.length ? (
        <section id="tonight" className={styles.panel}>
          <h2 className={styles.h2}>Tonight&apos;s home runs</h2>
          {called.length ? (
            <ul className={styles.list}>
              {called.map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} />)}
            </ul>
          ) : null}
          {rest.length ? (
            <>
              <h3 className={styles.h3}>Not called · {rest.length}</h3>
              <ul className={styles.list}>
                {rest.slice(0, PREVIEW).map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} dim />)}
              </ul>
              {rest.length > PREVIEW ? (
                // A phone should not scroll through thirty misses to reach
                // the sign-up. Five preview, the rest behind one tap, no JS.
                <details className={styles.more}>
                  <summary>Show the other {rest.length - PREVIEW}</summary>
                  <ul className={styles.list}>
                    {rest.slice(PREVIEW).map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} dim />)}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className={styles.close}>
        <h2 className={styles.closeH}>Tomorrow&apos;s calls are already on the board.</h2>
        <p>The bot publishes its picks every morning. The ⭐ you see here is what it said before first pitch.</p>
        <a className={styles.cta} href={SIGNUP}>
          <strong>Create a free account</strong>
          <span>Save your watchlist, picks and alerts when your guys go deep</span>
        </a>
      </section>

      <footer className={styles.foot}>
        <span>CALLED IT is MOONSHOT&apos;s home run record — every home run, graded in public. Data from MLB&apos;s public feeds.</span>
      </footer>
    </main>
  )
}

function Row({ r, dim }) {
  return (
    <li className={`${styles.row} ${dim ? styles.rowDim : ''}`}>
      <span className={styles.glyph}>{glyph(r)}</span>
      <a className={styles.name} href={boardLink(`/app#sport=mlb&p=${encodeURIComponent(r.player_id)}&view=spray`)}>
        {r.name}{r.hr_n > 1 ? <small> ({r.hr_n})</small> : null}
      </a>
      <span className={styles.meta}>
        {r.team || ''}{r.inning ? ` · ${r.inning}` : ''} · {matchupWord(r)}
        {oddsWord(r) ? ` · ${oddsWord(r)}` : ''}
        {' · '}<a className={styles.cardLink} href={`/api/dash/homers/card?day=${r.day}&pid=${r.player_id}&n=${r.hr_n}`} target="_blank" rel="noreferrer">card</a>
      </span>
      <span className={styles.call}>{callWord(r)}</span>
    </li>
  )
}

// One night from the strip, expanded — same shape as "Tonight's home runs"
// so a night from last week reads exactly like tonight does once it's over.
function NightDetails({ h, rows }) {
  const called = rows.filter((r) => r.role)
  const rest = rows.filter((r) => !r.role)
  return (
    <details id={`night-${h.day}`} className={styles.night}>
      <summary>
        <span className={styles.nightDay}>{shortDay(h.day)}</span>
        <span className={styles.nightStat}>{h.called} of {h.total} called · {h.pct}%</span>
      </summary>
      {called.length ? (
        <ul className={styles.list}>
          {called.map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} />)}
        </ul>
      ) : (
        <p className={styles.sub}>No calls that night.</p>
      )}
      {rest.length ? (
        <>
          <h3 className={styles.h3}>Not called · {rest.length}</h3>
          <ul className={styles.list}>
            {rest.slice(0, PREVIEW).map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} dim />)}
          </ul>
          {rest.length > PREVIEW ? (
            <details className={styles.more}>
              <summary>Show the other {rest.length - PREVIEW}</summary>
              <ul className={styles.list}>
                {rest.slice(PREVIEW).map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} dim />)}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
