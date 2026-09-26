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
//   the receipts     eventCapture() over the shared event record (lib/record/)
//                    -- the same homer_feed / nfl_td_feed rows /called reads,
//                    frozen at first sight
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
// exists for somebody arriving on a phone from a link. today_slim.json was
// measured at 4.0 MB on 2026-09-24 (it was ~890 KB the night this page was
// written); nfl_week.json is ~720 KB and nfl_matchup.json ~906 KB. All of it
// is fetched and reduced HERE, and only the trimmed designated rows
// (lib/theFourFields.js) cross into the one client island. Both sports' bites
// are finished text by the time they leave this function, so those payloads
// never leave the server at all.
//
// AND REDUCED ONCE PER TWO MINUTES, NOT ONCE PER VISITOR (PERF-2, 2026-09-24).
// Until then every view of /start pulled the whole 5.6 MB into the Vercel
// function before the first byte -- the `cache: 'no-store'` reads in
// lib/dash/board.js and lib/nfl/dataSource.js are right for the pushers that
// own them and wrong for a public landing page. A `next: { revalidate }` on
// those fetches would not help: the Data Cache refuses entries over 2 MB and
// the slate is twice that. So the REDUCED result is what gets cached --
// unstable_cache around the two loaders below, a few KB per sport, keyed on
// sport (+ the ET day for the record), START_TTL seconds. A cold function
// still pays the full pull once; every visitor after it reads the small
// entry. The bites carry a `p` (the whole player row) out of the headline
// builders -- stripped before caching, both because the cache is shared
// and because nothing in the markup reads it.
//
// NO JS FOR THE SPORT SWITCH — two plain links, same as /called's own switch
// and its night anchors.
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

import BotPicksStrip from '../../components/BotPicksStrip'
import { easternToday } from '../../lib/data'
import { fetchBoardFull } from '../../lib/dash/board'
import { buildHeadlines } from '../../lib/headlinesCore'
import {
  fetchNfl, nflMatchupLooksReal, nflMatchupPaths, nflSlateLooksReal, nflSlatePaths,
} from '../../lib/nfl/dataSource'
import { buildNflHeadlines } from '../../lib/nfl/headlines'
import { trimForFour } from '../../lib/theFourFields'
import { readBoard } from '../../lib/nhl/boardRead'
import { nhlCaptureFrom, readNhlRecords } from '../../lib/record/nhl'
import { readMlbEvents } from '../../lib/record/mlb'
import { readNflEvents } from '../../lib/record/nfl'
import { eventCapture } from '../../lib/record/shape'
import styles from './start.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Start here — DASH Network',
  description:
    'The calls before the game, and the public record of how they went. MOONSHOT for MLB home runs, TUDDY for NFL touchdowns, LAMP for NHL goals.',
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

// How long a reduced board / record entry is served before it is rebuilt.
// Same figure the front door uses (lib/dash/pulse.js PULSE_TTL): the bot
// republishes on a cadence of minutes, and a stranger's first screen does not
// need to be fresher than the ticker. An EMPTY board is cached for the same
// two minutes -- "waiting on tonight's board" is an honest state, and serving
// yesterday's Four while today's is being built (the stale-on-error path)
// would not be.
const START_TTL = 120

/** A bite with only what the markup reads. `p` (the full row) never crosses. */
const biteText = (b) => ({ k: b.k, icon: b.icon, tag: b.tag, name: b.name, why: b.why, stat: b.stat, col: b.col })

const SPORTS = {
  mlb: {
    key: 'mlb',
    label: 'MLB',
    product: 'MOONSHOT',
    table: 'homer_feed',
    board: '/app#sport=mlb&tab=home',
    recordHref: '/called?sport=mlb',
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
    recordHref: '/called?sport=nfl',
    event: 'touchdowns',
    eventOne: 'touchdown',
    lead: 'Who finds the end zone',
    recordLink: 'See every one, week by week.',
    promise: 'TUDDY rates every skill player on the week before kickoff, then grades itself in public.',
    callsHead: 'What the model noticed this week',
    callsSub: 'The reads off this week’s touchdown board — the signals, not a bet slip.',
    unit: 'game day',
  },
  // 2026-09-25. Hockey's record is its own table (lamp_goal_log, graded rows,
  // regular season and playoffs only) and its public record page is the
  // in-app tab until /called learns a third sport — so recordHref points
  // there, not at /called?sport=nhl, which would silently show baseball.
  nhl: {
    key: 'nhl',
    label: 'NHL',
    product: 'LAMP',
    table: 'lamp_goal_log',
    board: '/app#sport=nhl&tab=home',
    recordHref: '/app#sport=nhl&tab=results',
    event: 'goals',
    eventOne: 'goal',
    lead: 'Who lights the lamp tonight',
    recordLink: 'See every one, night by night.',
    promise: 'LAMP calls three skaters per game to score, locks them before puck drop, then grades itself in public.',
    callsHead: 'Tonight’s board — three called per game',
    callsSub: 'Shots, goals and ice time per game over his last 82, ranked against tonight’s skaters. PREVIEW until a game’s lock; the lock is the call.',
    unit: 'night',
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
 * Counts the shared event record (eventCapture over lib/record/ events), which
 * is the whole reason one sentence can serve every sport: the same shape over
 * the same three states (CALLED / ON THE BOARD / NOT ON THE BOARD, project
 * rule 14), each set by the sport's own rule in lib/callStatus.js. Only the query is local, and a failed, unconfigured or not-yet-gradeable
 * window returns null so the page renders the honest sentence instead of a
 * number it cannot stand behind (rules 24 and 25).
 */
// Each sport's live events, read through the shared event record (§33,
// lib/record/). LAMP's goals join here with its phase 4; until then its
// number comes from the model record (computeLampRecord below).
const EVENT_READERS = { mlb: readMlbEvents, nfl: readNflEvents }

async function computeRecord(sportKey, today) {
  const sport = SPORTS[sportKey]
  const db = client()
  if (!db) return null
  const since = shiftDay(today, -(DAYS - 1))
  if (sport.key === 'nhl') return computeLampRecord(db, since, today)
  const { events, error } = await EVENT_READERS[sport.key](db, { since, until: today })
  if (error || !events.length) return null

  // Football: only days whose board rank was actually recorded can be counted.
  // See NFL_MIN_RECORD_DAYS above for the measurement behind this.
  let usable = null
  if (sport.key === 'nfl') {
    const recorded = new Set(events.filter((e) => e.payload.td_board).map((e) => e.game_date))
    if (recorded.size < NFL_MIN_RECORD_DAYS) return null
    usable = recorded
  }

  const nights = []
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(today, -i)
    if (usable && !usable.has(day)) continue
    const dayEvents = events.filter((e) => e.game_date === day)
    if (!dayEvents.length) continue
    const cap = eventCapture(dayEvents)
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

/**
 * Hockey's receipts: graded rows of the current model, regular season and
 * playoffs only (preseason is graded but not quoted — camp lineups), reduced
 * by the same coverage() the in-app record tab uses. Same shape as the other
 * two: scorers who were CALLED or ON THE BOARD at lock, over the scorers.
 */
async function computeLampRecord(db, since, today) {
  // Scorers only: nhlCaptureFrom counts scorers, so the other ~90% of a
  // night's rows would be read for nothing.
  const { rows, error } = await readNhlRecords(db, { since, until: today, includePre: false, graded: true, hitOnly: true })
  if (error || !rows.length) return null
  const cap = nhlCaptureFrom(rows)
  if (!cap.total) return null
  return { on: cap.onBoard, total: cap.total, pct: cap.boardPct, days: new Set(rows.map((r) => r.game_date)).size }
}

/** Tonight's hockey board, one line per game — read by the same function the Board page's route uses. */
async function computeLampCalls() {
  const board = await readBoard(easternToday())
  return {
    games: board.games.map((g) => ({
      id: g.game.id, away: g.game.away.abbrev, home: g.game.home.abbrev, startUtc: g.game.startUtc, state: g.game.state,
      locked: g.locked, graded: g.graded,
      called: g.rows.filter((r) => r.status === 'called').map((r) => ({ name: r.name, score: r.score, hit: r.hit, dressed: r.dressed })),
    })),
  }
}

const etClock = (iso) => `${new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`

/** A game on the hockey board as one bite: stamp · matchup · the three · the clock. */
const lampBite = (g) => ({
  k: String(g.id), icon: '🏒',
  tag: g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW',
  col: g.graded ? 'var(--ink)' : g.locked ? 'var(--nhl)' : 'var(--dim)',
  name: `${g.away} @ ${g.home}`,
  why: g.called.length
    ? g.called.map((c) => `${c.name} ${c.score}${g.graded ? (c.hit ? ' 🚨' : c.dressed === false ? ' (void)' : '') : ''}`).join(' · ')
    : 'nobody scored yet — fewer than ten NHL games on file across both rosters',
  stat: g.state === 'final' ? 'FINAL' : g.state === 'live' ? 'LIVE' : etClock(g.startUtc),
})

async function computeCalls(sportKey) {
  if (sportKey === 'nhl') return computeLampCalls()
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
    return { bites: bites.map(biteText), strip: [] }
  }

  const rows = await fetchBoardFull('today').catch(() => null)
  const league = buildHeadlines({ players: rows || [] })
    .filter((b) => LEAGUE_BITES.includes(b.k))
    .map(biteText)
  return { players: trimForFour(rows || []), strip: league }
}

// The cached faces of the two loaders. unstable_cache keys on the arguments,
// so each sport (and each ET day, for the record) is its own entry. A loader
// that throws is not cached -- the page's own .catch() renders the honest
// empty state and the next visitor asks again.
const loadCalls = unstable_cache(computeCalls, ['start-calls'], { revalidate: START_TTL })
const loadRecord = unstable_cache(computeRecord, ['start-record'], { revalidate: START_TTL })

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
    loadRecord(sportKey, today).catch(() => null),
  ])

  const SIGNUP = `/login?next=${encodeURIComponent(sport.board)}#create-account`
  const hasCalls = sportKey === 'nfl' ? Boolean(calls.bites?.length) : sportKey === 'nhl' ? Boolean(calls.games?.length) : Boolean(calls.players?.length)
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
          <a className={sportKey === 'nhl' ? styles.navOn : styles.navOff} href="/start?sport=nhl">🏒 NHL</a>
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
            <a className={styles.inline} href={sport.recordHref}>{sport.recordLink}</a>
          </p>
        ) : (
          // Rule 24/25: say what the state is. For football this is the live
          // case right now, not a fallback — the board rank has only been
          // recorded since 2026-09-20 (see NFL_MIN_RECORD_DAYS).
          <p className={styles.receipt}>
            Every {sport.eventOne} is tagged against the board the moment it lands, and the public
            record is filling in{sport.key === 'nfl' ? ' — the board rank has been on the record since September 20' : sport.key === 'nhl' ? ' — the first regular-season night is September 29' : ''}.{' '}
            <a className={styles.inline} href={sport.recordHref}>See the record.</a>
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
        {(sportKey === 'nfl' || sportKey === 'nhl' || !hasCalls) && (
          <>
            <h2 className={styles.h2}>{sport.callsHead}</h2>
            <p className={styles.note}>{sport.callsSub}</p>
          </>
        )}

        {!hasCalls ? (
          <p className={styles.empty}>
            {sportKey === 'nfl'
              ? 'Waiting on this week’s board — it publishes well before kickoff.'
              : sportKey === 'nhl'
                ? 'No NHL games tonight — the board comes back with the next slate.'
                : 'Waiting on tonight’s board — it publishes before first pitch.'}
          </p>
        ) : sportKey === 'nhl' ? (
          <ul className={styles.bites}>
            {calls.games.map((g) => <Bite key={g.id} b={lampBite(g)} />)}
          </ul>
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
          <a href={sport.recordHref}>The public record</a>
          {' · '}
          <a href={sport.board}>The {sport.label} board</a>
        </span>
      </footer>
    </main>
  )
}
