// /start — THE ONE BUILD. The stop between an X click and the product.
//
// 2026-09-21. `claude/the-funnel-2026-09-14.md` measured the funnel: 12 real
// strangers in 4 days, 0 reached the app. Not a conversion-rate problem — the
// door was shut. `claude/the-one-build-funnel-page-scope-2026-09-20.md` locked
// the scope, and Donovan picked /start as the route on 2026-09-21.
//
// WHAT THIS IS. One screen that answers "what is this and is it any good" for
// somebody who has never heard of DASH, then offers exactly one thing to do
// about it. It is not /app (eleven tabs, ~90 screens — real, and the wrong
// first impression) and it is not /called (the nightly public record, which
// keeps its own job and is linked from here).
//
// EVERY NUMBER ON THIS PAGE IS ALREADY REAL AND ALREADY MEASURED. Nothing here
// is modelled, scored or written for the first time (project rules 16 and 17):
//   MLB best calls   BotPicksStrip — The Four, 65.0% over 25 graded nights
//                    (bots/precision_study.py), the component mounted as-is
//   NFL best calls   buildNflHeadlines() — the same five story-bites TUDDY's
//                    header ticker has carried since round 3 (57e0359)
//   the receipts     captureFrom()/tdCaptureFrom() over the same homer_feed /
//                    nfl_td_feed rows /called reads, frozen at first sight
//   the ask          the same /login?next=...#create-account target SignUpPill
//                    has always pointed at
//
// DELIBERATELY NOT HERE. No FRANCHISE pill — it is a private, invite-only
// ten-team league, so a third tab would be a dead end for a stranger (decided
// 09-20). No "TUDDY Four": football has no measured precision study yet, so
// nothing here may imply one — the bites are presented as what the model
// noticed, and the 65% claim appears on the baseball side only, where it was
// actually measured.
//
// SERVER-RENDERED, AND WHY THAT MATTERS HERE MORE THAN ANYWHERE. This page
// exists for somebody arriving on a phone from a link. today_slim.json is ~890
// KB tonight and several megabytes on a full slate; nfl_matchup.json is ~874
// KB. All of it is fetched and reduced HERE, and only the trimmed designated
// rows (lib/theFourFields.js) cross into the one client island. The NFL bites
// are finished text by the time they leave this function, so that payload never
// leaves the server at all.
//
// NO JS FOR THE SPORT SWITCH — two plain links, same as /called's own switch
// and its night anchors.
import { createClient } from '@supabase/supabase-js'

import BotPicksStrip from '../../components/BotPicksStrip'
import { easternToday } from '../../lib/data'
import { fetchBoardFull } from '../../lib/dash/board'
import { captureFrom } from '../../lib/dash/homerFeed'
import {
  fetchNfl, nflMatchupLooksReal, nflMatchupPaths, nflSlateLooksReal, nflSlatePaths,
} from '../../lib/nfl/dataSource'
import { buildNflHeadlines } from '../../lib/nfl/headlines'
import { tdCaptureFrom } from '../../lib/nfl/tdFeed'
import { trimForFour } from '../../lib/theFourFields'
import styles from './start.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Start here — DASH Network',
  description:
    'The calls before the game, and the public record of how they went. MOONSHOT for MLB home runs, TUDDY for NFL touchdowns.',
}

// Ten nights is what /called's own strip spans, so the rate quoted here and the
// rate quoted there are the same number over the same window.
const DAYS = 10

const SPORTS = {
  mlb: {
    key: 'mlb',
    label: 'MLB',
    product: 'MOONSHOT',
    table: 'homer_feed',
    board: '/app#sport=mlb&tab=home',
    event: 'home runs',
    eventOne: 'home run',
    lead: 'Who goes deep tonight',
    recordLink: 'See every one, night by night.',
    promise: 'MOONSHOT rates every hitter on the slate before first pitch, then grades itself in public.',
    callsHead: 'The Four — tonight’s headline picks',
    callsSub: 'One pick per category, three deep. Each graded on its own bar.',
  },
  nfl: {
    key: 'nfl',
    label: 'NFL',
    product: 'TUDDY',
    table: 'nfl_td_feed',
    board: '/app#sport=nfl&tab=home',
    event: 'touchdowns',
    eventOne: 'touchdown',
    lead: 'Who finds the end zone',
    recordLink: 'See every one, week by week.',
    promise: 'TUDDY rates every skill player on the week before kickoff, then grades itself in public.',
    callsHead: 'What the model noticed this week',
    callsSub: 'The reads off this week’s touchdown board — the signals, not a bet slip.',
  },
}

function shiftDay(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * The receipts line — the same ten-night window /called publishes.
 *
 * Reuses the sport's OWN counter (captureFrom / tdCaptureFrom), which is the
 * whole reason one sentence can serve both: they return the same shape over the
 * same three states (CALLED / ON THE BOARD / NOT ON THE BOARD, project rule
 * 14). Only the query is local, and a failed or unconfigured query returns null
 * so the page renders without the strip rather than with a zero in it (rule 24).
 */
async function loadRecord(sport, today) {
  const db = client()
  if (!db) return null
  const since = shiftDay(today, -(DAYS - 1))
  const { data, error } = await db
    .from(sport.table)
    .select('*')
    .gte('day', since)
    .lte('day', today)
  if (error || !Array.isArray(data) || !data.length) return null

  const nights = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    const rows = data.filter((r) => r.day === day)
    if (!rows.length) continue
    const cap = sport.key === 'nfl' ? tdCaptureFrom(rows) : captureFrom(rows)
    if (cap.total > 0) nights.push(cap)
  }
  if (!nights.length) return null

  // Board coverage, not just designated calls, because that is the honest
  // headline for football — see /called's own note on why the two sports lead
  // with different numbers. Both are counted the same way; only which one is
  // quoted changes.
  const span = nights.reduce(
    (a, c) => ({ on: a.on + c.called + c.rated, total: a.total + c.total }),
    { on: 0, total: 0 },
  )
  if (!span.total) return null
  return { ...span, pct: Math.round((100 * span.on) / span.total), nights: nights.length }
}

async function loadCalls(sportKey) {
  if (sportKey === 'nfl') {
    const [slate, matchup] = await Promise.all([
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    ])
    if (!slate) return { bites: [] }
    // `p` on each bite is a whole player row and `col` is a theme colour. Only
    // the text and the colour are read below — the row itself must not cross
    // into the markup, or the payload this page exists to avoid comes back.
    const bites = buildNflHeadlines({
      players: slate.players || [],
      games: slate.games || [],
      markets: slate.markets || [],
      matchup,
    })
    return { bites: bites.slice(0, 5) }
  }

  const rows = await fetchBoardFull('today').catch(() => null)
  return { players: trimForFour(rows || []) }
}

export default async function StartPage({ searchParams }) {
  const params = (await searchParams) || {}
  const asked = String(params.sport || '').toLowerCase()
  const sportKey = SPORTS[asked] ? asked : 'mlb'
  const sport = SPORTS[sportKey]
  const today = easternToday()

  const [calls, record] = await Promise.all([
    loadCalls(sportKey).catch(() => ({})),
    loadRecord(sport, today).catch(() => null),
  ])

  const SIGNUP = `/login?next=${encodeURIComponent(sport.board)}#create-account`
  const hasCalls = sportKey === 'nfl' ? Boolean(calls.bites?.length) : Boolean(calls.players?.length)

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a className={styles.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>{sport.product}</strong></div>
        </a>
        <nav className={styles.nav}>
          <a className={sportKey === 'mlb' ? styles.navOn : styles.navOff} href="/start?sport=mlb">⚾ MLB</a>
          <a className={sportKey === 'nfl' ? styles.navOn : styles.navOff} href="/start?sport=nfl">🏈 NFL</a>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>Finding the moments before they happen</p>
        <h1 className={styles.headline}>{sport.lead}, called before the game.</h1>
        <p className={styles.sub}>{sport.promise}</p>
        {record ? (
          <p className={styles.receipt}>
            <span className={styles.big}>{record.on}</span> of{' '}
            <span className={styles.big}>{record.total}</span> {sport.event} over the last{' '}
            {record.nights} {record.nights === 1 ? 'day' : 'days'} were on the board before they
            happened — <strong>{record.pct}%</strong>.{' '}
            <a className={styles.inline} href={`/called?sport=${sport.key}`}>{sport.recordLink}</a>
          </p>
        ) : (
          // Rule 24: say what the state is, never render an empty panel or a
          // 0/0 dressed up as a percentage.
          <p className={styles.receipt}>
            The public record fills in as each {sport.eventOne} lands.{' '}
            <a className={styles.inline} href={`/called?sport=${sport.key}`}>See the record.</a>
          </p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.h2}>
          {sport.callsHead}
          {sportKey === 'mlb' && <span className={styles.pill}>65% over 25 nights</span>}
        </h2>
        <p className={styles.note}>{sport.callsSub}</p>

        {!hasCalls ? (
          <p className={styles.empty}>
            {sportKey === 'nfl'
              ? 'Waiting on this week’s board — it publishes well before kickoff.'
              : 'Waiting on tonight’s board — it publishes before first pitch.'}
          </p>
        ) : sportKey === 'nfl' ? (
          <ul className={styles.bites}>
            {calls.bites.map((b) => (
              <li key={b.k} className={styles.bite}>
                <span className={styles.biteIcon} aria-hidden="true">{b.icon}</span>
                <span className={styles.biteTag} style={{ color: b.col }}>{b.tag}</span>
                <span className={styles.biteName}>{b.name}</span>
                <span className={styles.biteWhy}>{b.why}</span>
                <span className={styles.biteStat}>{b.stat}</span>
              </li>
            ))}
          </ul>
        ) : (
          // Mounted as-is, per the locked scope. No onPlayerClick: there is no
          // hitter modal on this page and a card that looks tappable and does
          // nothing is worse than one that doesn't.
          <BotPicksStrip players={calls.players} />
        )}
      </section>

      <a className={styles.cta} href={SIGNUP}>
        <strong>Get the calls before the game</strong>
        <span>Free. Saves your watchlist and turns on alerts.</span>
      </a>

      <p className={styles.alt}>
        Or just look around first — <a href={sport.board}>the full {sport.label} board</a> is open,
        no account needed.
      </p>

      <footer className={styles.foot}>
        <span>
          Every number here is published by the model before the game and graded after it. Nothing on
          this page is back-dated.
        </span>
        <span>
          <a href={`/called?sport=${sport.key}`}>The public record</a>
          {' · '}
          <a href={sport.board}>The {sport.label} board</a>
        </span>
      </footer>
    </main>
  )
}
