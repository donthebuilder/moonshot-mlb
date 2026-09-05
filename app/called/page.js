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
  title: 'Did the bot call it? — MOONSHOT',
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
  if (!db) return { today, rows: [], history: [], configured: false }
  const since = shiftDay(today, -(DAYS - 1))
  const { data } = await db
    .from('homer_feed')
    .select('day,player_id,hr_n,name,team,opponent,inning,home,role,on_board,hr_score,board_rank,odds_over,odds_book,seen_at')
    .gte('day', since)
    .lte('day', today)
    .order('seen_at', { ascending: false })
  const rows = (data || []).filter((r) => r.day === today)
  const history = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const c = captureFrom((data || []).filter((r) => r.day === day))
    history.push({ day, ...c })
  }
  return { today, rows, history: history.reverse(), configured: true }
}

const glyph = (r) => (r.role ? '⭐' : r.on_board ? '⚪' : '💥')
const callWord = (r) => (r.role
  ? `${roleWord(r.role)}${r.board_rank ? ` · #${r.board_rank}` : ''}`
  : r.on_board ? `rated${r.board_rank ? ` · #${r.board_rank}` : ''}` : 'not on the board')

export default async function CalledPage() {
  const { today, rows, history, configured } = await load()
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
          <div><small>MOONSHOT</small><strong>CALLED IT?</strong></div>
        </a>
        <nav className={styles.nav}>
          <a href="/app#sport=mlb&tab=home">Tonight&apos;s board</a>
          <a href="/app#sport=mlb&tab=results">Results</a>
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
              {tonight.rated ? ` · ${tonight.rated} more rated but not picked` : ''}
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
        <p className={styles.rule}>
          ⭐ = the hitter carried a bot designation (TOP · Top 15 · HR · HIT · HRR · CONTACT) on the published board
          when the ball left. ⚪ = on the board, not designated. 💥 = not on the board. The tag is frozen the moment
          the homer is first seen and never re-graded.
        </p>
      </section>

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
              <h3 className={styles.h3}>Not called</h3>
              <ul className={styles.list}>
                {rest.map((r) => <Row key={`${r.player_id}:${r.hr_n}`} r={r} dim />)}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <footer className={styles.foot}>
        <a href="/app#sport=mlb&tab=home">See tonight&apos;s board →</a>
        <span>Every call graded in public. Data from MLB&apos;s public feeds.</span>
      </footer>
    </main>
  )
}

function Row({ r, dim }) {
  return (
    <li className={`${styles.row} ${dim ? styles.rowDim : ''}`}>
      <span className={styles.glyph}>{glyph(r)}</span>
      <a className={styles.name} href={`/app#sport=mlb&p=${encodeURIComponent(r.player_id)}&view=spray`}>
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
