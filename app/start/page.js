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
//   MLB the league   buildHeadlines() via lib/headlinesCore.js — the same
//                    bites the header ticker and the front page already roll
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
// rows (lib/theFourFields.js) cross into the one client island. Both sports'
// bites are finished text by the time they leave this function, so those
// payloads never leave the server at all.
//
// NO JS FOR THE SPORT SWITCH — two plain links, same as /called's own switch
// and its night anchors.
import { createClient } from '@supabase/supabase-js'

import BotPicksStrip from '../../components/BotPicksStrip'
import { easternToday } from '../../lib/data'
import { fetchBoardFull } from '../../lib/dash/board'
import { captureFrom } from '../../lib/dash/homerFeed'
import { buildHeadlines } from '../../lib/headlinesCore'
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

// ── THE FOOTBALL RECORD HAS A START DATE, AND IT IS RECENT ──────────────────
//
// nfl_td_feed.td_board — the pregame board rank, which is what makes a scorer
// "on the board" rather than "a call" — was only added to the table on
// 2026-09-20 (migration 15). lib/nfl/tdFeed.js's buildTdEvent() had computed it
// since 09-14 and rowFromEvent() dropped it on the floor, so every row before
// 09-20 is honestly blank and nothing can backfill it: the rank has to be the
// one frozen at post time.
//
// Measured on 2026-09-21 against production, which is why this gate exists:
//
//   day          TDs   on_bot   td_board recorded
//   2026-09-13    14        1        0
//   2026-09-14     5        0        0
//   2026-09-17    10        1        0
//   2026-09-20    55        1       26
//   2026-09-21     3        0        3
//
// Quoting board coverage over a window that includes those first three days
// says "the model only saw 35% of touchdowns" when what actually happened is
// that the column was not being written yet. That is a worse failure than an
// unflattering number, because it reads as a measurement and isn't one.
//
// So the football number is quoted only from days where the rank was actually
// recorded, and only once there are enough of them to be a window rather than
// a sample of two. Until then the page says the record is filling in — which is
// true, and which project rule 24 asks for over a misleading figure. This
// unblocks itself: the gate opens on its own once three Sundays have banked.
const NFL_MIN_RECORD_DAYS = 3

// ── WHICH LEAGUE BITES EARN A SLOT ──────────────────────────────────────────
//
// buildHeadlines() emits up to eleven bites and four of them (top / hit / hrr
// / tb) are the same four hitters The Four names in the panel directly above.
// An "around the league" strip that repeats the names above it is noise, so
// only the bites that say something The Four does not are kept:
//
//   p3     SEASON POWER   — season EV profile, not tonight's matchup
//   hot    HOTTEST BAT    — form, which no category card leads with
//   hrw    HR WINDOW      — the audit's strongest bot term
//   weak   WEAK SPOTS     — a slate-wide count, nobody's card
//
// 'gone' (a homer already hit), 'game' and 'air' need results / headline /
// airRanked, which this page deliberately does not fetch — they drop out on
// their own rather than being filtered, and that is fine.
const LEAGUE_BITES = ['p3', 'hot', 'hrw', 'weak']

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
    callsSub: 'One pick per category, three deep — each graded on its own bar.',
    unit: 'day',
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
    unit: 'game day',
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
 * The receipts line — the same ten-day window /called publishes.
 *
 * Reuses the sport's OWN counter (captureFrom / tdCaptureFrom), which is the
 * whole reason one sentence can serve both: they return the same shape over the
 * same three states (CALLED / ON THE BOARD / NOT ON THE BOARD, project rule
 * 14). Only the query is local, and a failed, unconfigured or not-yet-gradeable
 * window returns null so the page renders the honest sentence instead of a
 * number it cannot stand behind (rules 24 and 25).
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

  // Football: only days whose board rank was actually recorded can be counted.
  // See NFL_MIN_RECORD_DAYS above for the measurement behind this.
  let usable = null
  if (sport.key === 'nfl') {
    const recorded = new Set(data.filter((r) => r.td_board).map((r) => r.day))
    if (recorded.size < NFL_MIN_RECORD_DAYS) return null
    usable = recorded
  }

  const nights = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    if (usable && !usable.has(day)) continue
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
  return { ...span, pct: Math.round((100 * span.on) / span.total), days: nights.length }
}

async function loadCalls(sportKey) {
  if (sportKey === 'nfl') {
    const [slate, matchup] = await Promise.all([
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    ])
    if (!slate) return { bites: [], strip: [] }
    // `p` on each bite is a whole player row and `col` is a theme colour. Only
    // the text and the colour are read below — the row itself must not cross
    // into the markup, or the payload this page exists to avoid comes back.
    const bites = buildNflHeadlines({
      players: slate.players || [],
      games: slate.games || [],
      markets: slate.markets || [],
      matchup,
    })
    // Football's bites ARE its best-calls section, so there is no second strip
    // to build from them. Not a parity gap with baseball — a consequence of
    // TUDDY having one board and MOONSHOT having a board plus The Four.
    return { bites, strip: [] }
  }

  const rows = await fetchBoardFull('today').catch(() => null)
  const league = buildHeadlines({ players: rows || [] })
    .filter((b) => LEAGUE_BITES.includes(b.k))
  return { players: trimForFour(rows || []), strip: league }
}

/** One bite row. Shared by both sports and by the league strip. */
function Bite({ b }) {
  return (
    <li className={styles.bite}>
      <span className={styles.biteIcon} aria-hidden="true">{b.icon}</span>
      <span className={styles.biteTag} style={{ color: b.col }}>{b.tag}</span>
      <span className={styles.biteName}>{b.name}</span>
      <span className={styles.biteWhy}>{b.why}</span>
      <span className={styles.biteStat}>{b.stat}</span>
    </li>
  )
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
  const strip = calls.strip || []

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
            {record.days} {sport.unit}{record.days === 1 ? '' : 's'} were on the board before they
            happened — <strong>{record.pct}%</strong>.{' '}
            <a className={styles.inline} href={`/called?sport=${sport.key}`}>{sport.recordLink}</a>
          </p>
        ) : (
          // Rule 24/25: say what the state is. For football this is the live
          // case right now, not a fallback — the board rank has only been
          // recorded since 2026-09-20 (see NFL_MIN_RECORD_DAYS).
          <p className={styles.receipt}>
            Every {sport.eventOne} is tagged against the board the moment it lands, and the public
            record is filling in{sport.key === 'nfl' ? ' — the board rank has been on the record since September 20' : ''}.{' '}
            <a className={styles.inline} href={`/called?sport=${sport.key}`}>See the record.</a>
          </p>
        )}
      </section>

      <section className={styles.panel}>
        {/* ── ONE HEADER, NOT TWO (2026-09-21) ────────────────────────────
            BotPicksStrip carries its OWN header -- the "The Four" title, the
            "four categories, three deep" line, and the measured "65% over 25
            nights · +16pp" pill. A panel header above it repeated the title
            and printed the 65% claim a second time six lines from the first,
            which is the same mistake as badging a score the card already
            shows. Caught by looking at the render, not by reading the code.
            So baseball lets the component speak and only gets a heading when
            there is no board to show; football's bites have no header of
            their own, so they keep this one. */}
        {(sportKey === 'nfl' || !hasCalls) && (
          <>
            <h2 className={styles.h2}>{sport.callsHead}</h2>
            <p className={styles.note}>{sport.callsSub}</p>
          </>
        )}

        {!hasCalls ? (
          <p className={styles.empty}>
            {sportKey === 'nfl'
              ? 'Waiting on this week’s board — it publishes well before kickoff.'
              : 'Waiting on tonight’s board — it publishes before first pitch.'}
          </p>
        ) : sportKey === 'nfl' ? (
          <ul className={styles.bites}>
            {calls.bites.map((b) => <Bite key={b.k} b={b} />)}
          </ul>
        ) : (
          // Mounted as-is, per the locked scope. No onPlayerClick: there is no
          // hitter modal on this page and a card that looks tappable and does
          // nothing is worse than one that doesn't.
          <BotPicksStrip players={calls.players} />
        )}
      </section>

      {strip.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.h2}>Around the league</h2>
          <p className={styles.note}>
            The rest of what the board flagged tonight, beyond the four picks above.
          </p>
          <ul className={styles.bites}>
            {strip.map((b) => <Bite key={b.k} b={b} />)}
          </ul>
        </section>
      )}

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
