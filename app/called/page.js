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

async function load() {
  const db = client()
  const today = easternToday()
  if (!db) return { today, rows: [], picks: [], calledIds: new Set(), history: [], configured: false }
  const since = shiftDay(today, -(DAYS - 1))
  const { data } = await db
    .from('homer_feed')
    .select('day,player_id,hr_n,name,team,opponent,inning,home,role,on_board,hr_score,board_rank,odds_over,odds_book,seen_at')
    .gte('day', since)
    .lte('day', today)
    .order('seen_at', { ascending: false })
  const rows = (data || []).filter((r) => r.day === today)
  // The morning's call, so the page shows the names BEFORE any homer lands.
  const { data: pre } = await db.from('homer_feed_posts').select('payload,x_post_id').match({ day: today, kind: 'pregame' }).maybeSingle()
  const picks = Array.isArray(pre?.payload?.picks) ? pre.payload.picks.slice(0, 5) : []
  const calledIds = new Set(rows.filter((r) => r.role).map((r) => String(r.player_id)))
  const history = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const c = captureFrom((data || []).filter((r) => r.day === day))
    history.push({ day, ...c })
  }
  return { today, rows, picks, calledIds, history: history.reverse(), configured: true }
}

// Every link into the board goes through /login carrying its destination
// (2026-09-05: the boards are behind an account now). Signed in, /login
// bounces straight to `next`; signed out, it opens the create tab. The hash
// rides inside `next`, so a player link still opens that player.
const gated = (href) => `/login?next=${encodeURIComponent(href)}#create-account`
const BOARD = gated('/app#sport=mlb&tab=home')
const PREVIEW = 5

const glyph = (r) => (r.role ? '⭐' : r.on_board ? '⚪' : '💥')
const callWord = (r) => (r.role
  ? `${roleWord(r.role)}${r.board_rank ? ` · #${r.board_rank}` : ''}`
  : r.on_board ? `on the board, no call${r.board_rank ? ` · #${r.board_rank}` : ''}` : 'not on the board')

export default async function CalledPage() {
  const { today, rows, picks, calledIds, history, configured } = await load()
  const tonight = captureFrom(rows)
  const graded = history.filter((h) => h.total > 0)
  const span = graded.reduce((a, h) => ({ called: a.called + h.called, total: a.total + h.total }), { called: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null
  const called = rows.filter((r) => r.role)
  const rest = rows.filter((r) => !r.role)

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
          <span>Free account · the full board, every call, before first pitch</span>
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
                <a className={styles.name} href={gated(`/app#sport=mlb&p=${encodeURIComponent(p.player_id)}`)}>{p.name}</a>
                <span className={styles.meta}>{p.team || ''}{p.opponent ? ` vs ${p.opponent}` : ''}{p.odds_over && p.odds_book ? ` · ${p.odds_over > 0 ? '+' : ''}${p.odds_over} ${p.odds_book}` : ''}</span>
                <span className={styles.call}>{calledIds.has(String(p.player_id)) ? '⭐ went deep' : 'live'}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.h2}>Last {DAYS} nights {spanPct != null ? <span className={styles.pill}>{span.called} / {span.total} · {spanPct}%</span> : null}</h2>
        <div className={styles.bars} role="img" aria-label={`Capture rate by night over the last ${DAYS} nights`}>
          {history.map((h) => (
            <div key={h.day} className={styles.barCol} title={h.total ? `${h.day}: ${h.called} of ${h.total} (${h.pct}%)` : `${h.day}: no homers recorded`}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ height: `${h.pct || 0}%` }} />
              </div>
              <div className={styles.barPct}>{h.total ? `${h.pct}%` : '—'}</div>
              <div className={styles.barDay}>{h.day.slice(5).replace('-', '/')}</div>
            </div>
          ))}
        </div>
      </section>

      {rows.length ? (
        <section className={styles.panel}>
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
        <a className={styles.cta} href={BOARD}>
          <strong>Create a free account</strong>
          <span>Board · picks · odds · alerts when your guys go deep</span>
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
      <a className={styles.name} href={gated(`/app#sport=mlb&p=${encodeURIComponent(r.player_id)}&view=spray`)}>
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
