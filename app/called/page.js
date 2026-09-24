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
import { tdCallWord, tdCaptureFrom, tdPlayWord } from '../../lib/nfl/tdFeed'
import { callStatus } from '../../lib/callStatus'
import styles from './called.module.css'

// 2026-09-20 — FOOTBALL MOVED IN, IT DIDN'T GET ITS OWN HOUSE. Donovan:
// "can you not just build it on the same side of the site." Right call, and
// it is the CALLED IT brand architecture written down in the project
// instructions: one account, one public record, both sports. A second page at
// a second URL would have meant a second thing to link, a second thing to
// keep honest, and a visitor who lands on the baseball one in February.
//
// ?sport=nfl swaps the source table (nfl_td_feed for homer_feed) and the
// words. Everything else — the strip, the drilldowns, the frozen tags, the
// sign-up — is the same page, because it is the same promise.
//
// NO JS FOR THE SWITCH. Two plain links, same as the night anchors already
// in the strip below. The page is server-rendered and stays that way.
//
// ONE COUNT, TWO SPORTS. tdCaptureFrom() returns the exact shape
// captureFrom() does, so every number on this page is computed by the sport's
// own function and rendered by one component. The three states (CALLED / ON
// THE BOARD / NOT ON THE BOARD — project rule 14) are the same three states
// in both, which is the whole reason one page can carry both.

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

const SPORTS = {
  mlb: {
    key: 'mlb', label: 'MLB', product: 'MOONSHOT', event: 'home runs', eventOne: 'home run',
    verb: 'went deep', table: 'homer_feed', board: '/app#sport=mlb&tab=home',
    legend: '🤖 on the bot before the ball left  ·  ⚪ on the board, no call  ·  💥 not on the board',
    empty: 'No home runs yet tonight',
    foot: "CALLED IT is MOONSHOT's home run record — every home run, graded in public. Data from MLB's public feeds.",
  },
  nfl: {
    key: 'nfl', label: 'NFL', product: 'TUDDY', event: 'touchdowns', eventOne: 'touchdown',
    verb: 'found the end zone', table: 'nfl_td_feed', board: '/app#sport=nfl&tab=home',
    legend: '🤖 on the bot before the snap  ·  ⚪ on the board, no call  ·  💥 not on the board',
    empty: 'No touchdowns yet today',
    foot: "CALLED IT is TUDDY's touchdown record — every touchdown, graded in public. Data from public NFL feeds.",
  },
}

// ── ONE ROW SHAPE, BOTH SPORTS ─────────────────────────────────────────────
// The list component below renders this and nothing else, so a change to how
// a row looks lands on both sports at once and neither can drift.
function normMlb(r) {
  return {
    key: `${r.player_id}:${r.hr_n}`,
    day: r.day,
    name: r.name,
    repeat: r.hr_n > 1 ? r.hr_n : null,
    href: `/app#sport=mlb&p=${encodeURIComponent(r.player_id)}&view=spray`,
    called: callStatus(r) === 'called',
    onBoard: callStatus(r) !== 'off',
    detail: [r.team || '', r.inning ? `${r.inning}` : '', matchupWord(r), oddsWord(r) || ''].filter(Boolean).join(' · '),
    cardHref: `/api/dash/homers/card?day=${r.day}&pid=${r.player_id}&n=${r.hr_n}`,
    call: r.role
      ? `${roleWord(r.role)}${r.board_rank ? ` · #${r.board_rank}` : ''}`
      : r.on_board ? `on the board, no call${r.board_rank ? ` · #${r.board_rank}` : ''}` : 'not on the board',
  }
}

function normNfl(r) {
  return {
    key: `${r.game_id}:${r.td_n}`,
    day: r.day,
    name: r.scorer_name || r.team,
    repeat: null,
    // The gsis_id is nullable by design (see tdFeed.js) — an unresolved
    // scorer still gets his row, just without a link into the board.
    href: r.gsis_id ? `/app#sport=nfl&tab=players&player=${encodeURIComponent(r.gsis_id)}` : null,
    called: Boolean(r.on_bot),
    onBoard: Boolean(r.td_board),
    detail: [
      r.team || '', r.opponent ? `vs ${r.opponent}` : '',
      r.quarter != null ? `Q${r.quarter}${r.clock ? ` ${r.clock}` : ''}` : '',
      tdPlayWord(r),
    ].filter(Boolean).join(' · '),
    // No public touchdown-card route yet, so no card link rather than a
    // link to a 404.
    cardHref: null,
    call: tdCallWord(r),
  }
}

async function load(sportKey) {
  const sport = SPORTS[sportKey] || SPORTS.mlb
  const db = client()
  const today = easternToday()
  const blank = { sport, today, rows: [], picks: [], calledIds: new Set(), history: [], byDay: new Map(), configured: false }
  if (!db) return blank

  // FOOTBALL IS NOT NIGHTLY. Baseball plays every day, so ten days and ten
  // game days are the same window; football plays three days a week, so a
  // ten-DAY strip would be seven empty columns. The NFL window is widened to
  // four weeks and then reduced to the last ten days that actually had a
  // touchdown — same ten bars, each one a real game day.
  const span = sport.key === 'nfl' ? 28 : DAYS
  const since = shiftDay(today, -(span - 1))

  if (sport.key === 'nfl') {
    const { data } = await db
      .from('nfl_td_feed')
      .select('day,game_id,td_n,team,opponent,quarter,clock,scorer_name,gsis_id,position,kind,yards,passer_name,on_bot,td_board,seen_at')
      .gte('day', since).lte('day', today)
      .order('seen_at', { ascending: false })
    const all = (data || []).map((r) => ({ ...r, _n: normNfl(r) }))
    const rows = all.filter((r) => r.day === today)
    const byDay = new Map()
    const history = []
    // Newest ten game days, oldest-first for the strip.
    const days = [...new Set(all.map((r) => r.day))].sort().slice(-DAYS)
    for (const day of days) {
      const dayRows = all.filter((r) => r.day === day)
      byDay.set(day, dayRows)
      history.push({ day, ...tdCaptureFrom(dayRows) })
    }
    // The board post the bot published before kickoff, most recent first —
    // the football twin of the morning pregame picks.
    const { data: pre } = await db.from('homer_feed_posts')
      .select('day,payload').eq('kind', 'nfl_board').gte('day', since)
      .order('day', { ascending: false }).limit(1)
    const picks = Array.isArray(pre?.[0]?.payload?.picks) ? pre[0].payload.picks.slice(0, 5) : []
    const calledIds = new Set(rows.filter((r) => r.gsis_id).map((r) => String(r.gsis_id)))
    return { sport, today, rows, picks, calledIds, history, byDay, configured: true }
  }

  const { data } = await db
    .from('homer_feed')
    .select('day,player_id,hr_n,name,team,opponent,inning,home,role,on_board,hr_score,board_rank,odds_over,odds_book,seen_at')
    .gte('day', since)
    .lte('day', today)
    .order('seen_at', { ascending: false })
  const all = (data || []).map((r) => ({ ...r, _n: normMlb(r) }))
  const rows = all.filter((r) => r.day === today)
  // The morning's call, so the page shows the names BEFORE any homer lands.
  const { data: pre } = await db.from('homer_feed_posts').select('payload,x_post_id').match({ day: today, kind: 'pregame' }).maybeSingle()
  const picks = Array.isArray(pre?.payload?.picks) ? pre.payload.picks.slice(0, 5) : []
  const calledIds = new Set(rows.filter((r) => callStatus(r) === 'called').map((r) => String(r.player_id)))
  // Same window, grouped by night — the bars and the per-night drilldown
  // below both read this so the two can never disagree.
  const byDay = new Map()
  const history = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const dayRows = all.filter((r) => r.day === day)
    byDay.set(day, dayRows)
    history.push({ day, ...captureFrom(dayRows) })
  }
  return { sport, today, rows, picks, calledIds, history: history.reverse(), byDay, configured: true }
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
const PREVIEW = 5

const glyph = (n) => (n.called ? '🤖' : n.onBoard ? '⚪' : '💥')

export default async function CalledPage({ searchParams }) {
  const params = (await searchParams) || {}
  const asked = String(params.sport || '').toLowerCase()
  const sportKey = SPORTS[asked] ? asked : 'mlb'
  const { sport, today, rows, picks, calledIds, history, byDay, configured } = await load(sportKey)
  const BOARD = sport.board
  const SIGNUP = `/login?next=${encodeURIComponent(BOARD)}#create-account`
  // /start -- THE FUNNEL STOP (2026-09-21). claude/the-funnel-2026-09-14.md
  // measured 12 strangers off X in 4 days and 0 reaching the app. The two
  // CTAs a stranger meets first now land on /start, which introduces the
  // product and carries one sign-up, instead of dropping them straight into
  // an eleven-tab dashboard. BOARD is unchanged everywhere else on this page:
  // the per-player links, the footer and SIGNUP's own `next` all still go to
  // the board, because somebody who taps a named hitter has already chosen.
  const START = `/start?sport=${sport.key}`
  const tonight = sport.key === 'nfl' ? tdCaptureFrom(rows) : captureFrom(rows)
  const graded = history.filter((h) => h.total > 0)
  const span = graded.reduce((a, h) => ({ called: a.called + h.called, onBoard: a.onBoard + (h.onBoard || 0), total: a.total + h.total }), { called: 0, onBoard: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null
  const spanBoardPct = span.total ? Math.round((100 * span.onBoard) / span.total) : null
  // 2026-09-24 audit: the bars and the per-day lines below used `called` for
  // football too, so the record read "3 / 88 · 3%" against a five-rung
  // ladder -- the same category error the hero comment above already names.
  // Football's bars are board coverage; baseball's stay the call rate. Both
  // numbers are printed either way.
  const leadOf = (h) => (sport.key === 'nfl' ? { n: h.onBoard || 0, pct: h.boardPct || 0 } : { n: h.called, pct: h.pct })
  const leadWord = sport.key === 'nfl' ? 'on the board' : 'called'
  const called = rows.filter((r) => r._n.called)
  const rest = rows.filter((r) => !r._n.called)
  // Newest first, today excluded (it already has its own full section below).
  const pastNights = history.filter((h) => h.day !== today).slice().reverse()

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a className={styles.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK · {sport.product}</small><strong>CALLED IT</strong></div>
        </a>
        <nav className={styles.nav}>
          {/* The switch. Two links, no JS — the same approach the night
              anchors in the strip below already use. */}
          <a className={sport.key === 'mlb' ? styles.navOn : styles.navOff} href="/called?sport=mlb">MLB</a>
          <a className={sport.key === 'nfl' ? styles.navOn : styles.navOff} href="/called?sport=nfl">NFL</a>
          <a className={styles.navCta} href={START}>Get the calls</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>{prettyDay(today)}</p>
        {tonight.total ? (
          <>
            {/* ── WHY FOOTBALL LEADS WITH A DIFFERENT NUMBER ──────────────
                MOONSHOT publishes ~30 calls a night against ~30 home runs, so
                "N of M were on the bot" is a fair capture rate. TUDDY's
                touchdown ladder is FIVE rungs a week against ~24 touchdowns a
                Sunday, so the same sentence reads "0 of 24 · 0%" on a day the
                model only ever claimed five names. That is not honesty, it is
                a category error dressed as honesty: it implies 24 chances
                were taken and missed.
                So football leads with board coverage — how many of the day's
                scorers the model had rated at all — and states the designated
                calls underneath, which is the claim it actually made. The
                counting is identical; only which number is the headline
                changes. Both are on the page either way. */}
            <h1 className={styles.headline}>
              <span className={styles.big}>{sport.key === 'nfl' ? tonight.called + tonight.rated : tonight.called}</span> of <span className={styles.big}>{tonight.total}</span> {sport.event} were on {sport.key === 'nfl' ? 'the board' : 'the bot'}
            </h1>
            <p className={styles.sub}>
              {sport.key === 'nfl'
                ? `${tonight.called} designated ${tonight.called === 1 ? 'call' : 'calls'}${tonight.off ? ` · ${tonight.off} never surfaced` : ''}`
                : `${tonight.pct}% tonight${tonight.rated ? ` · ${tonight.rated} more on the board, no call` : ''}${tonight.off ? ` · ${tonight.off} off the board` : ''}`}
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.headline}>{sport.empty}</h1>
            <p className={styles.sub}>
              {configured ? 'This page fills in within a minute of each one.' : 'The feed is not configured on this deployment.'}
            </p>
          </>
        )}
        <a className={styles.cta} href={START}>
          <strong>{sport.key === 'nfl' ? 'See who the bot likes this week' : 'See who the bot likes tonight'}</strong>
          <span>{sport.key === 'nfl'
            ? 'The reads for this week, the public record, and the full board — no account needed'
            : 'The headline picks, the public record, and the full board — no account needed'}</span>
        </a>
        <p className={styles.rule}>
          {sport.legend}. Tags are frozen when the {sport.eventOne} is first seen and never re-graded.
        </p>
      </section>

      {picks.length ? (
        <section className={styles.panel}>
          <h2 className={styles.h2}>{sport.key === 'nfl' ? 'This week\u2019s calls' : 'Tonight\u2019s calls'} <span className={styles.pill}>{sport.key === 'nfl' ? 'posted before kickoff' : 'posted before first pitch'}</span></h2>
          <ol className={styles.calls}>
            {picks.map((p, i) => (
              <li key={p.player_id || i} className={calledIds.has(String(p.player_id)) ? styles.callHit : ''}>
                <span className={styles.callN}>{i + 1}</span>
                <a className={styles.name} href={sport.key === 'nfl' ? `/app#sport=nfl&tab=players&player=${encodeURIComponent(p.player_id)}` : `/app#sport=mlb&p=${encodeURIComponent(p.player_id)}`}>{p.name}</a>
                <span className={styles.meta}>{p.team || ''}{p.opponent || p.opp ? ` vs ${p.opponent || p.opp}` : ''}{p.odds_over && p.odds_book ? ` · ${p.odds_over > 0 ? '+' : ''}${p.odds_over} ${p.odds_book}` : ''}</span>
                <span className={styles.call}>{calledIds.has(String(p.player_id)) ? `🤖 ${sport.verb}` : 'live'}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.h2}>{sport.key === 'nfl' ? `Last ${history.length} game days` : `Last ${DAYS} nights`} {spanPct != null ? <span className={styles.pill}>{sport.key === 'nfl' ? `${span.onBoard} / ${span.total} on the board · ${spanBoardPct}% · ${span.called} called` : `${span.called} / ${span.total} called · ${spanPct}% · ${span.onBoard} on the board`}</span> : null}</h2>
        <div className={styles.bars} role="group" aria-label={`Capture rate over the last ${history.length} ${sport.key === 'nfl' ? 'game days' : 'nights'} — tap one to see who ${sport.verb}`}>
          {history.map((h) => {
            const href = h.total ? (h.day === today ? '#tonight' : `#night-${h.day}`) : null
            const inner = (
              <>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ height: `${leadOf(h).pct || 0}%` }} />
                </div>
                <div className={styles.barPct}>{h.total ? `${leadOf(h).pct}%` : '—'}</div>
                <div className={styles.barDay}>{h.day.slice(5).replace('-', '/')}</div>
              </>
            )
            return href ? (
              <a key={h.day} className={styles.barCol} href={href} aria-label={`${h.day}: ${leadOf(h).n} of ${h.total} ${leadWord}, ${leadOf(h).pct}% — see who ${sport.verb}`}>
                {inner}
              </a>
            ) : (
              <div key={h.day} className={styles.barCol} title={`${h.day}: no ${sport.event} recorded`}>
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
          <h2 className={styles.h2}>{sport.key === 'nfl' ? 'Today\u2019s touchdowns' : 'Tonight\u2019s home runs'}</h2>
          {called.length ? (
            <ul className={styles.list}>
              {called.map((r) => <Row key={r._n.key} n={r._n} />)}
            </ul>
          ) : null}
          {rest.length ? (
            <>
              <h3 className={styles.h3}>Not called · {rest.length}</h3>
              <ul className={styles.list}>
                {rest.slice(0, PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
              </ul>
              {rest.length > PREVIEW ? (
                // A phone should not scroll through thirty misses to reach
                // the sign-up. Five preview, the rest behind one tap, no JS.
                <details className={styles.more}>
                  <summary>Show the other {rest.length - PREVIEW}</summary>
                  <ul className={styles.list}>
                    {rest.slice(PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className={styles.close}>
        <h2 className={styles.closeH}>{sport.key === 'nfl' ? 'This week\u2019s calls are already on the board.' : 'Tomorrow\u2019s calls are already on the board.'}</h2>
        <p>{sport.key === 'nfl'
          ? 'The bot publishes its touchdown board before kickoff. The 🤖 you see here is what it said before the snap.'
          : 'The bot publishes its picks every morning. The 🤖 you see here is what it said before first pitch.'}</p>
        <a className={styles.cta} href={SIGNUP}>
          <strong>Create a free account</strong>
          <span>{sport.key === 'nfl'
            ? 'Save your watchlist, picks and alerts when your guys score'
            : 'Save your watchlist, picks and alerts when your guys go deep'}</span>
        </a>
      </section>

      <footer className={styles.foot}>
        <span>{sport.foot}</span>
      </footer>
    </main>
  )
}

function Row({ n, dim }) {
  return (
    <li className={`${styles.row} ${dim ? styles.rowDim : ''}`}>
      <span className={styles.glyph}>{glyph(n)}</span>
      {n.href
        ? <a className={styles.name} href={n.href}>{n.name}{n.repeat ? <small> ({n.repeat})</small> : null}</a>
        : <span className={styles.name}>{n.name}</span>}
      <span className={styles.meta}>
        {n.detail}
        {n.cardHref ? <>{' · '}<a className={styles.cardLink} href={n.cardHref} target="_blank" rel="noreferrer">card</a></> : null}
      </span>
      <span className={styles.call}>{n.call}</span>
    </li>
  )
}

// One night from the strip, expanded — same shape as "Tonight's home runs"
// so a night from last week reads exactly like tonight does once it's over.
function NightDetails({ h, rows }) {
  const called = rows.filter((r) => r._n.called)
  const rest = rows.filter((r) => !r._n.called)
  return (
    <details id={`night-${h.day}`} className={styles.night}>
      <summary>
        <span className={styles.nightDay}>{shortDay(h.day)}</span>
        <span className={styles.nightStat}>{h.called} of {h.total} called · {h.onBoard ?? h.called} on the board</span>
      </summary>
      {called.length ? (
        <ul className={styles.list}>
          {called.map((r) => <Row key={r._n.key} n={r._n} />)}
        </ul>
      ) : (
        <p className={styles.sub}>No calls that day.</p>
      )}
      {rest.length ? (
        <>
          <h3 className={styles.h3}>Not called · {rest.length}</h3>
          <ul className={styles.list}>
            {rest.slice(0, PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
          </ul>
          {rest.length > PREVIEW ? (
            <details className={styles.more}>
              <summary>Show the other {rest.length - PREVIEW}</summary>
              <ul className={styles.list}>
                {rest.slice(PREVIEW).map((r) => <Row key={r._n.key} n={r._n} dim />)}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
