'use client'
import StoryTape from '../StoryTape'
import PlayerFace from '../PlayerFace'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { etToday } from '../../lib/freshness'
import { slateWhen } from '../../lib/slateWhen'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { logUrl, dataUrl } from '../../lib/dataSource'
import { teamOf, oppOf, clean, n, hrScore } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { fetchPenFatigue, penTier } from '../../lib/bullpen'
import { teamAbbrs } from '../../lib/gamelogs'
import YourPlayers from '../YourPlayers'
import Fold from '../Fold'
import BotPicksStrip from '../BotPicksStrip'
import TonightsCalls from '../phone/TonightsCalls'
import { airParts } from '../../lib/conditions'
import { useSetupHomers, useBackToBack } from '../../lib/b2b'
import { slateProjHr } from '../ProjectedOutput'
import { useClubHr } from '../../lib/clubHr'
import { buildHeadlines, useLiveScores } from '../../lib/headlines'
import { btnStyle } from '../ui'
import { PillRow } from '../Filters'
import dynamic from 'next/dynamic'
import TabLoading from '../TabLoading'
// THE SUB-VIEWS LOAD WHEN THEY OPEN (2026-10-10, Wave 3 data diet). Home's default view is Tonight; At the plate, The board and
// Box scores only render on a deep link or a pick of their pill. They were static imports, so every cold load of MOONSHOT
// carried SprayField, ZoneMap, HomerLedger and LiveWire (and the whole Scoreboard) for a view it was not showing. Same markup,
// loaded when asked; TabLoading holds the height the way Dashboard.js does for every other tab.
const Scoreboard = dynamic(() => import('./Scoreboard'), { loading: TabLoading })
const Boxes = dynamic(() => import('./Boxes'), { loading: TabLoading })
const AtThePlate = dynamic(() => import('./AtThePlate'), { loading: TabLoading })
import { mlbSlateState } from '../../lib/mlbSlateState'
import HeadlineStrip from '../HeadlineStrip'
import FoundingMembersCard from '../FoundingMembersCard'
import { mlbNextGames, nextLine } from '../../lib/mlbNext'
import { onLiveRefresh } from '../../lib/liveRefresh'
import MlbTonight from '../tonight/MlbTonight'
import { sharedFetch } from '../../lib/sharedRead'
import MlbOffseason from './MlbOffseason'
import HomeGreeting from '../home/HomeGreeting'
import SlateRow from '../home/SlateRow'
import HomeLinks from '../home/HomeLinks'
import CalledList from '../CalledList'
import DenseTable from '../DenseTable'
import RaceTracker from '../RaceTracker'
import NetworkRow from '../NetworkRow'
import HotNumbers from '../numerology/HotNumbers'
import { useGameTotals } from '../GameTotalLine'
import { useStoryCards, interleave } from '../../lib/useStoryCards'
import { teamName } from '../../lib/mlbTeams'
import { MLB_NAV } from '../../lib/routes'
import { useMlbPhase } from '../../lib/mlb/usePhase'

// An Eastern calendar day n days from today (YYYY-MM-DD), on etToday's clock.
const etShift = (n) => { const d = new Date(`${etToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// HOME — the front porch.
//
// The site used to open on the Scoreboard, 268 rows deep, every column lit.
// Great once you know the house; a wall of stats if you just walked in.
// This tab is the answer to "make the first page welcoming — something good,
// living and breathing": a greeting that knows what time it is, tonight in
// four numbers, the one game worth circling, the bot's own graded record,
// and three doors into the rest of the site. Everything on this page is
// either in the slate payload, the live results file, or the bot's published
// today.txt — nothing invented, and every missing piece says so out loud.
//
// ── FLOW PASS (2026-08-16, Donovan: "lots of the pages seems all over the
// palace or scrroll up to scoll back down" / things should "flow beetter") ──
//
// What was wrong: this page was a stack of eight equal-weight sections with no
// lead. The hero said "the best air is Coors, +14%" and then five hundred
// pixels later a row of three tiles said the same thing again — read the top,
// scroll down, scroll back up to check you'd read it right. The four-tile row
// (GAMES / PROJECTED HR / FIRST PITCH / BOT RECORD) sat between the hero and
// the headline game, so the one thing worth circling tonight was below the
// fold. And the onboarding card rendered on EVERY visit until it was manually
// dismissed, which put a "New here?" panel between the owner and his own data
// every single evening.
//
// What it is now, top to bottom, in descending weight:
//   1. the rail          scores, always. You came to check them.
//   2. THE HERO          the lead: tonight in ONE sentence that swallowed the
//                        entire tile row — games, confirmed lineups, first
//                        pitch, both projections, the power grade, the best
//                        air with its clause, and the bot's graded record.
//   3. the rundown       the headline-card strip, SportsCenter-style, rolling.
//   4. your players      your own guys, with tonight's line, when you follow any.
//
// ── SECOND PASS (2026-09-06). Donovan: the page was "all over the place,"
// and named what he actually opens the front page FOR: storylines, a quick
// look, tonight's top tens, "a good snapshot of what's going on and where to
// look." Those were sitting at #6-9, under the headliner / call-of-the-night
// / your-night / money-answer / October / comebacks stack — a visitor had to
// scroll past five sections of "here's one thing" before reaching the
// sections that are actually a SURVEY of the night. So the angles, the full
// storyline engine, the top tens and the arms move up as one block, right
// after your players and before the single-game/single-pick sections:
//
//   5. tonight's angles  the narrative lines (air, day-off, drought).
//   6. storylines        the full ledger the angles are cherry-picked from.
//   7. the top tens      names, ranked.
//   8. the arms          who they get to attack — read WITH the top tens,
//                        which is why it sits directly under them.
//   9. the snapshot      four tiles, then the headliner, the call of the
//                        night, the money answer, October, comebacks, the
//                        moneyline log, your night if you made any calls.
//  10. the doors         where to go next, onboarding included.
//
// Nothing in this second block changed its OWN content or component — only
// where it sits. If a section's own comment below still says "lifted here
// 2026-08-16" or similar, that dates when IT last moved, not this pass.
//
// TILES → SENTENCES. Two tile rows died here (the four stat tiles, the three
// best-air tiles). Not one number, caption or tooltip left with them: every
// figure is in the prose, and the hover text that hung off each tile now hangs
// off the number itself. lib/conditions.js speaks the weather/park clause so
// this page is not the fifth surface with its own chip strip.

// THE EDITION (2026-09-06). "Burning the midnight oil" is gone -- Donovan:
// "the messaging is trash". The hero reads like the top of a broadcast now:
// which edition of the show this is, then the rundown. Same hour buckets.
// The slate's own date (YYYY-MM-DD), as weekday + day. Parsed as a calendar date, never the wall clock.
const slateDayLabel = (iso) => {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase() } catch { return String(iso) }
}

const greeting = (h) => {
  if (h >= 5 && h < 12) return ['MORNING EDITION', '☀️']
  if (h >= 12 && h < 17) return ['AFTERNOON EDITION', '⚾']
  if (h >= 17 && h < 22) return ['PRIME TIME', '🌆']
  return ['LATE EDITION', '🌙']
}




// ── TAB CONSOLIDATION (2026-08-16, owner-approved plan) ─────────────────────
//
// The rule the plan runs on: a TAB is a question you arrive with; a VIEW is an
// answer you switch between once you're there. Home, the Scoreboard and the
// box scores all answer the same question — "what's happening right now" — so
// they are now ONE tab with three views: Tonight (everything this file always
// rendered, untouched), The board (the Scoreboard component, mounted as-is)
// and Box scores (the Boxes component, mounted as-is). Same idiom as the
// VIEWS pill row on the Bot tab, kept quiet — a bare pill row, not another
// bordered box, per the Apple-Sports direction for live surfaces.
//
// ROUTING LANDS SEPARATELY. The tab bar and the #tab= deep links are being
// rewired in Dashboard.js by the session owner; this file only makes Home
// CAPABLE of hosting the three views. That ordering is why every new prop
// below defaults to null/'tonight': the current Dashboard mount passes none
// of them, and Home must render exactly as it did yesterday until the wiring
// arrives. `initial` exists so the old deep links (#tab=scoreboard,
// #tab=boxes) can open Home on the right view once routing maps them here,
// and it beats the remembered view because a link the user just clicked is a
// stronger signal than what he looked at last time.
//
// ── A FOURTH VIEW: AT THE PLATE (2026-09-13) ────────────────────────────────
// Donovan: "the whole live tab needs to be fixed its missing the at the
// plate ... I want to move it from the slate section to the live section
// considering it's the live updates." AtThePlate (the pitcher-toggle, the
// live timeline, the zone map) was fully built but mounted on a Dashboard
// tab key ('live') that lib/routes.js always aliases away from before it
// can render — it was permanently dead code. It belongs here, not on Slate
// (Games.js): Slate answers "what's the matchup," this answers "what's
// happening right now," which is exactly this tab's job. It's reachable as a
// pill the moment you tap "Live" — Scores stays the landing view there (see
// the `scoreboard` alias in Dashboard.js; briefly swapped to open on At the
// plate instead the same day, then reverted — Donovan: "live should open up
// to scores page"), so At the plate is one tap away rather than gone.
// Games.js's own "🔴 Live" mode is retired in the same change: it rendered
// the same grid as Default in every way but its button state, so nothing of
// value was sitting behind it.
// "The board" renamed to "Scores" (2026-09-13). Donovan flagged it read as
// the same thing as the top-level "Boards" nav tab (the nine ranked HR/hit/
// HRR/contact boards) — different content, confusingly similar name. This
// view is the scores/wire read (Dashboard.js's own description of the Live
// nav tab it sits under: "scores, the wire, and what is happening right
// now"), so "Scores" says what it actually is. The `key` stays `board` —
// only the label changed — since Dashboard.js's routing reads the key, not
// the label, and there's no reason to touch working routing for a rename.
const HOME_VIEWS = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'live', label: 'At the plate' },
  { key: 'board', label: 'Scores' },
  { key: 'boxes', label: 'Box scores' },
  // 2026-10-06: Rankings is its own page now (#tab=fullboard, components/tabs/HitsHRR.js; the old
  // Boards page is merged into it). The pill stays so the other views still reach it, but it goes
  // there: it is not a view of Home any more, so it is not in HOME_VIEW_KEYS (a remembered
  // `home_view` of 'fullboard' must not open a blank Home).
  { key: 'fullboard', label: 'Rankings' },
]
const HOME_VIEW_KEYS = new Set(HOME_VIEWS.filter((v) => v.key !== 'fullboard').map((v) => v.key))
// view -> the tab key Dashboard.js mounts it under
const VIEW_TAB = { tonight: 'home', live: 'atplate', board: 'scoreboard', boxes: 'boxes', fullboard: 'fullboard' }
const BARE_BUTTON = {
  border: 'none', background: 'transparent', padding: 0,
  color: 'inherit', font: 'inherit', textAlign: 'left',
}

// ── THE HEADLINES (2026-09-06, second cut) ────────────────────────────────────
// Donovan: "expand the row ... add more headlines like old-school SportsCenter
// and have it in motion and clickable." The vertical rundown became a
// horizontal strip of headline cards -- the same height as the Four cards
// below -- that rolls right-to-left on its own, pauses under the pointer, and
// where every card is a tap (a hitter opens his modal, a game opens Slate).
// The set renders twice back to back for a seamless loop, the same trick the
// old header ticker used. Reduced-motion users get a plain swipeable row.
//
// Every headline is a field already on this page; nothing is computed beyond
// a sort. Order is the order a viewer opens the show for.
function Headlines({ players = [], headline, results, isLive, airRanked = [], odds, onPlayerClick, onNavigate }) {
  // Built in lib/headlines.js -- the header's ticker rolls the same set. The
  // strip itself is shared with TUDDY and LAMP (components/HeadlineStrip.js,
  // 2026-09-26); this is where MOONSHOT's cards and taps are decided.
  // 22 -> 30 px/s (2026-09-14, Donovan: 'make the headline move at a little faster pace')
  // 📜 HISTORY WATCH card (milestones plan step 2): the night's rarest claim
  // one homer away, first in the strip. From /api/history/watch -- a query
  // result with its proof, never typed; absent when nothing passes.
  const [hist, setHist] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/history/watch?sport=mlb').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHist(j?.items?.[0] || null) }).catch(() => {})
    return () => { alive = false }
  }, [])
  // THE STORIES RIDE IN THE STRIP (2026-10-22, every product's Home): the week's storylines as headline cards, woven in
  const findPlayer = useCallback((id) => players.find((x) => String(x?.player_id) === String(id)) || null, [players])
  const stories = useStoryCards('mlb', { findPlayer, color: C.orange })
  const cards = useMemo(() => {
    const base = interleave(buildHeadlines({ players, headline, results, isLive, airRanked }), stories)
    if (!hist) return base
    const p = players.find((x) => String(x?.player_id) === String(hist.player_id)) || null
    return [{ k: `hist-${hist.player_id}`, tag: 'HISTORY WATCH', icon: '📜', name: hist.name, why: `One more: ${hist.claim}.`, stat: `${hist.hr} HR`, col: C.yellow, p }, ...base]
  }, [players, headline, results, isLive, airRanked, hist, stories])
  const open = (c) => (c.p ? onPlayerClick?.(c.p) : c.nav ? onNavigate?.(c.nav) : null)
  const faceOf = (c) => (c.p?.player_id ? <PlayerFace sport="mlb" id={String(c.p.player_id)} name={c.name} size={22} theme={C} /> : null)
  return <HeadlineStrip sport="mlb" cards={cards} onOpen={open} theme={C} numFont={NUM_FONT} accent={C.orange} speed={30} faceOf={faceOf} title="HEADLINES + STORIES" countWord="in the strip" />
}

export default function Home({
  players = [], results, backtest, mode = 'today', slateDate = '', dateLabel = '',
  onNavigate, onPlayerClick,
  // tab-consolidation props (2026-08-16) — every one optional so the current
  // Dashboard mount, which predates the rewiring, keeps rendering untouched.
  // filteredPlayers: the globally-FILTERED list The board runs on; Home's own
  // `players` is allPlayers. Falls back to `players` until Dashboard passes both.
  odds = null, onWatch = null, watchIds = null, filteredPlayers = null,
  initial = 'tonight',
}) {
  // Which view is showing. Server and first client paint always agree on
  // 'tonight'; the effect then applies, in order of authority: an explicit
  // non-default `initial` (a deep link — the user just asked for that view),
  // else this device's remembered choice. Storage reads/writes are wrapped
  // because private mode without localStorage must not take the page down.
  const [view, setView] = useState('tonight')
  // MLB'S STATE (2026-10-21, BATCH-MLB-OFFSEASON B1): lib/mlb/phase.js from MLB's schedule; null while loading or unreadable (this page as always)
  const mlbPhase = useMlbPhase()
  const [top10All, setTop10All] = useState(false)   // the two top-10 lists show four rows until opened (10-18)
  useEffect(() => {
    if (initial !== 'tonight' && HOME_VIEW_KEYS.has(initial)) { setView(initial); return }
    try {
      const saved = localStorage.getItem('home_view')
      if (saved && HOME_VIEW_KEYS.has(saved)) setView(saved)
    } catch { /* no storage: open on Tonight */ }
  }, [initial])
  // EACH VIEW IS AN ADDRESS (2026-10-04, audit 02 #1): the pills only set
  // state, so the URL kept saying the tab you came in on and Back left /app
  // altogether. Every view already has its own tab key (Dashboard.js mounts
  // this component under each), so a pill navigates there.
  const pickView = (k) => {
    if (k === 'fullboard') { onNavigate?.('fullboard'); return }   // the Rankings page, not a view of this one
    setView(k)
    try { localStorage.setItem('home_view', k) } catch { /* not remembered, still shown */ }
    const tabFor = VIEW_TAB[k]
    if (onNavigate && tabFor && VIEW_TAB[initial] !== tabFor) onNavigate(tabFor)
  }

  // ── "New here?" — SHOWN ON THE FIRST VISIT, NOT EVERY VISIT (2026-08-16) ──
  //
  // It used to render until you clicked "Got it, hide this", which meant a
  // returning visitor — the owner, every night — opened his own front page on
  // an onboarding card. The default is now the returning-visitor default: this
  // device has been here before, so the card stays shut and a one-line reopen
  // sits down in the doors block, where "where do I go next" questions belong.
  //
  // Storage is device-local and entirely optional: `home_seen` is stamped on
  // the first render, `home_start_done` is the explicit dismissal that still
  // works. If localStorage throws (private mode, storage disabled) we keep the
  // card SHUT rather than open — an unrememberable dismissal that reappears
  // forever is the exact bug being fixed, and the reopen line means nothing is
  // out of reach. Both reads happen in an effect, never during render, so the
  // server and the first client paint agree.
  const [startOpen, setStartOpen] = useState(false)
  useEffect(() => {
    try {
      const done = localStorage.getItem('home_start_done') === '1'
      const seen = localStorage.getItem('home_seen') === '1'
      if (!done && !seen) setStartOpen(true)
      localStorage.setItem('home_seen', '1')
    } catch { /* no storage: stay shut, the reopen line is always there */ }
  }, [])
  const dismissStart = () => {
    setStartOpen(false)
    try { localStorage.setItem('home_start_done', '1') } catch {}
  }
  const reopenStart = () => {
    setStartOpen(true)
    try { localStorage.removeItem('home_start_done') } catch {}
  }

  const [hour, setHour] = useState(null) // effect-set so server/client agree
  useEffect(() => {
    setHour(new Date().getHours())
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  const [hello, icon] = greeting(hour ?? 18)

  // ── projected HR, from the bot's own published sheet (today.txt) ──
  const [proj, setProj] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!alive || !text) return
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        if (range) setProj({ low: Number(range[1]), high: Number(range[2]), grade: (grade?.[1] || '').trim() })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [mode])

  const games = useMemo(() => groupGames(players), [players])
  const mlbTotals = useGameTotals('mlb')
  const clubHr = useClubHr()   // the league table the team model reads (lib/teamHr.js)
  const modelHr = useMemo(() => slateProjHr(players, clubHr), [players, clubHr])
  // LIVE MEANS THE LEAGUE SAYS SO (2026-09-26, stranger test F5). The
  // payload's live_mode freezes at the bot's last build; when that ran
  // mid-slate the hero said "TODAY · LIVE — grading as they land" at 2:30 AM
  // for games the score rail already called LAST NIGHT. The league's feed
  // (lib/mlbSlateState.js) decides; while the payload still says live it is
  // re-asked every two minutes, and the flag stands if the feed can't answer.
  const [feedOver, setFeedOver] = useState(false)
  const payloadLive = results?.live_mode === true
  useEffect(() => {
    if (!payloadLive || !slateDate) { setFeedOver(false); return undefined }
    let alive = true
    const ask = () => mlbSlateState(slateDate).then((st) => { if (alive && st) setFeedOver(st.over) })
    ask()
    const id = onLiveRefresh(ask)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    return () => { alive = false; id() }
  }, [payloadLive, slateDate])
  const isLive = payloadLive && !feedOver
  // The league says the slate is over but the payload's last build ran
  // mid-slate: the games are final, the grades are not yet (the grader's
  // first run is the morning one -- see Dashboard.js's STALE-RESULTS GATE).
  const gradesPending = payloadLive && feedOver
  // TENSE (2026-08-29, both reviews): the hero said "Tonight's sheet is
  // ready" while showing yesterday's finished slate. A slate whose calendar
  // date is behind the local clock — and which isn't live — is history, and
  // the headline should say so.
  //
  // EASTERN, NOT THE BROWSER'S CLOCK (2026-09-19). All four day comparisons on
  // this page read the VIEWER's local date (toLocaleDateString with no zone).
  // slateDate is the Eastern baseball day, so comparing the two is only
  // correct for a viewer sitting in Eastern. Everywhere else the page rolls
  // over at the wrong moment: a viewer in Europe, whose local date is already
  // tomorrow while first pitch is still hours away in the US, had tonight's
  // live slate labelled as past, the back-to-back proof keyed to the wrong
  // day, and the bullpen panel skipped. Phoenix is the mirror case, three
  // hours the other way.
  //
  // etToday() is lib/freshness.js's Eastern day -- the clock StaleBanner and
  // the box scores already use -- and still returns YYYY-MM-DD, so every
  // plain string compare below is unchanged.
  const slateInPast = Boolean(
    slateDate
    && slateDate < etToday()
    && !isLive,
  )
  // When baseball is back (2026-09-27, e.g. Mon 09-28 -> "Wild Card starts
  // Tue 9/29"): one schedule read, only while the slate on screen is past.
  const [nextMlb, setNextMlb] = useState(null)
  useEffect(() => {
    if (!slateInPast) { setNextMlb(null); return undefined }
    let alive = true
    mlbNextGames(etToday()).then((n) => { if (alive) setNextMlb(n) })
    return () => { alive = false }
  }, [slateInPast])

  // The countdown chip ticks inside NextPitchStat (below), not here: a
  // once-a-second state in this component re-rendered the whole tab -- Home
  // and Live alike -- every second (perf audit 2026-10-04: ~2 s of scripting
  // per 30 s idle on a throttled phone).
  const live = useLiveScores()
  const firstPitch = useMemo(() => {
    const now = Date.now()
    const times = games.map((g) => new Date(g.game_time || 0).getTime()).filter((t) => t > 0)
    if (!times.length) return null
    const upcoming = times.filter((t) => t > now).sort((a, b) => a - b)
    return new Date(upcoming[0] ?? Math.min(...times))
  }, [games])

  // THE headline game — the one whose three best power bats sum highest.
  // Same slate scores the boards run on; this is a ranking, not a projection.
  const headline = useMemo(() => {
    let best = null
    games.forEach((g) => {
      const sorted = [...(g.players || [])].sort((a, b) => hrScore(b) - hrScore(a))
      const heat = sorted.slice(0, 3).reduce((s, p) => s + hrScore(p), 0)
      if (!best || heat > best.heat) best = { g, heat, bats: sorted.slice(0, 2) }
    })
    return best
  }, [games])

  // ── STORYLINES, cherry-picked (2026-08-08, "turn it up, maybe some
  // storyline"). Three hero lines, each from a source that already exists:
  //   🔁 back-to-back watch — pure slate field (games_since_last_hr === 0)
  //   🧱 tonight's fence rider — current/fence_board.json, slate-filtered
  //   🚪 pen door — yesterday's reliever workload (lib/bullpen)
  // Lines that can't be computed don't render; nothing here is invented.
  // BACK-TO-BACK, VERIFIED (2026-08-09). This line was reading
  // `games_since_last_hr === 0` raw — the exact bug that was reported and
  // fixed in the Storylines panel, still live on the front page, still telling
  // people a hitter who homered THIS AFTERNOON was chasing an encore. The rule
  // and the proof fetch now live in lib/b2b.js so the two surfaces cannot
  // drift apart again: the setup homer must be proven from a graded file, and
  // without proof the line does not render at all.
  // Fall back to today rather than passing '' — an empty slateDate would make
  // the proof fetch bail and silently hide the line on a normal night.
  const b2bDateKey = slateDate || etToday()
  const isTmrwSlate = b2bDateKey > etToday()
  const setupHr = useSetupHomers(b2bDateKey)
  const { list: b2b, verified: b2bVerified } = useBackToBack(players, setupHr, hrScore, b2bDateKey)

  const [fence, setFence] = useState(null)
  useEffect(() => {
    let alive = true
    sharedFetch(`${dataUrl('current/fence_board.json')}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setFence(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  // DATE GATE (2026-08-09 audit). The fence board publishes `slate_date`
  // (bots/spray_cache.py writes it) and this line never looked at it. So on a
  // tomorrow slate, or any night the spray-cache job didn't run, the rider was
  // taken from whatever board happened to be on the branch — and it looked
  // legitimate, because the only filter was "is he on tonight's slate", which
  // a hitter from yesterday's board usually still is.
  //
  // Same rule the park board already applies to the context pack: the file has
  // to be FOR the slate on screen, or the line doesn't render. A stale rider
  // quietly presented as tonight's is worse than no rider.
  const fenceApplies = !!fence?.slate_date && String(fence.slate_date) === String(b2bDateKey)
  const fenceRider = useMemo(() => {
    if (!fenceApplies || !fence?.rows?.length || !players.length) return null
    const byId = new Map(players.map((p) => [String(p?.player_id ?? p?.id), p]))
    // Same base fit the Fence Riders board leads with (contact vs the wall),
    // minus the per-park wall pull — this is one hero line, not the board.
    const scored = fence.rows
      .filter((r) => byId.has(String(r.player_id)))
      .map((r) => ({
        r, p: byId.get(String(r.player_id)),
        fit: (r.deep_pull_ct || 0) * 3 + (r.fence_ct || 0) * 1.5 + (r.over_ct || 0) + (r.robbed_ct || 0) * 1.5,
      }))
      .sort((a, b) => b.fit - a.fit)
    return scored[0] || null
  }, [fence, players, fenceApplies])

  // Gassed / worked pens among TONIGHT's teams. Yesterday's workload only
  // means anything for today's slate, so tomorrow mode skips the fetch.
  const [pens, setPens] = useState([])
  const penApplies = !slateDate || slateDate <= etToday()
  useEffect(() => {
    if (!penApplies || !players.length) { setPens([]); return undefined }
    let alive = true
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([pen, abbrs]) => {
      if (!alive) return
      const tonight = new Set()
      players.forEach((p) => { [teamOf(p), oppOf(p)].forEach((t) => t && tonight.add(String(t).toUpperCase())) })
      const out = []
      Object.entries(pen || {}).forEach(([tid, t]) => {
        const ab = String(abbrs?.[tid] || '').toUpperCase()
        if (!ab || !tonight.has(ab)) return
        const tier = penTier(t)
        if (tier) out.push({ ab, t, tier })
      })
      out.sort((a, b) =>
        ((a.tier.key === 'gassed' ? 0 : 1) - (b.tier.key === 'gassed' ? 0 : 1)) || b.t.pitches - a.t.pitches)
      setPens(out)
    }).catch(() => {})
    return () => { alive = false }
  }, [penApplies, players.length])

  // ── best air, hoisted (2026-08-15 "make the home page better" pass) ──
  // Was computed inline in the strip's own IIFE; the hero's tonight-sentence
  // needs the same answer, so it's one memo now instead of two computations
  // that could drift.
  // 2026-08-16: each entry keeps its source row (`row`) so lib/conditions can
  // speak that game's air — temp, wind and direction, park, humidity, rain,
  // roof — instead of this file growing a sixth private chip strip.
  const airRanked = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk
      if (pk == null || seen.has(pk)) return
      const parkHR = n(p?.park_hr_factor, n(p?.park_dist_factor, 0))
      const temp = n(p?.weather_temp_f, n(p?.temp_f, 0))
      const wind = n(p?.weather_wind_mph, n(p?.wind_mph, 0))
      const wl = clean(p?.wind_direction_label, '')
      const wxEff = n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, null))
      const windOut = /out/i.test(wl) ? wind : /in\b/i.test(wl) ? -wind : 0
      const edge = (parkHR > 0 ? (parkHR - 1) * 100 : 0)
        + (wxEff != null ? wxEff : windOut + (temp > 0 ? (temp - 70) / 7 : 0))
      seen.set(pk, { row: p, venue: clean(p?.venue_name, ''), matchup: `${teamOf(p)} vs ${oppOf(p)}`, temp, wind, wl, edge })
    })
    return [...seen.values()].filter((g) => g.venue).sort((a, b) => b.edge - a.edge)
  }, [players])


  // ── 🧱 near-miss watch — the same bar the Scoreboard board sets (drought
  // + genuinely homer-shaped recent contact), reduced to the single
  // strongest case for one Angles line. close >= 3 here, a notch above the
  // board's 2: a hero line should need a better reason than a board row.
  const nearMiss = useMemo(() => {
    let best = null
    players.forEach((p) => {
      const since = n(p?.games_since_last_hr, 0)
      if (since < 2) return
      const d = n(p?.hr_shape_components?.max_distance, 0)
      const e = n(p?.hr_shape_components?.max_ev, 0)
      const w = n(p?.hr_shape_profile?.wall_scraper, 0)
      const close = (d >= 400 ? 3 : d >= 385 ? 2 : d >= 372 ? 1 : 0)
        + w * 2 + (e >= 110 ? 2 : e >= 106 ? 1 : 0)
        + (n(p?.recent_barrel_rate, 0) >= 0.12 ? 1 : 0)
      if (close >= 3 && (!best || close > best.close || (close === best.close && d > best.d))) {
        best = { p, since, d, e, w, close }
      }
    })
    return best
  }, [players])


  const empty = !players.length

  // ── the numbers the four tiles used to hold ──────────────────────────────
  // confirmedGames was the GAMES tile's sub-line; the rest are already memos
  // above. `airLine` is the spoken air for one game, straight out of
  // lib/conditions — the same clause GameStrip, Games and the park board use.
  const confirmedGames = useMemo(() => games.filter((g) => g.lineup_confirmed).length, [games])
  // Snapshot-tile values (2026-08-29). liveGames counts what is actually on
  // the field right now; topHr is the board's leader, taken with the same
  // hrScore() every board on the site sorts by, so the tile can never
  // disagree with the list it links into.
  const liveGames = useMemo(
    () => games.filter((g) => g?.row?.game_state === 'live' || g?.live === true).length,
    [games],
  )
  const airLine = (g) => airParts(g?.row).map((x) => x.text).join(', ')
  const airTitle = (g) => airParts(g?.row).map((x) => `${x.text} — ${x.title}`).join('\n')

  // NEW HERE? (2026-08-09, owner: "people want it spoon-fed"). Three things,
  // in order, each one a link to the tab that does it. Dismissible and
  // remembered, because it's onboarding and onboarding that won't go away
  // becomes furniture. Nothing here is data — it's three sentences and three
  // tab jumps, so it renders on an empty slate too.
  const START = [
    { tab: 'scoreboard', n: 1, title: 'See who the model likes', body: 'The top of the list. You don’t need to read a column to use the order.' },
    { tab: 'games', n: 2, title: 'Look at one game', body: 'The arm, the park, the lineup and the pick for that game.' },
    { tab: 'results', n: 3, title: 'Check if it’s been right', body: 'Every pick is graded against its own job, every night.' },
  ]

  const DOORS = [
    { tab: 'scoreboard', icon: '📊', title: 'The Scoreboard', color: C.orange,
      body: 'Every hitter tonight, every column.' },
    { tab: 'games', icon: '⚾', title: 'Game by game', color: C.orange,
      body: 'Game by game: the arm, the park, the lineup, the picks.' },
    { tab: 'results', icon: '✅', title: 'The receipts', color: C.orange,
      body: 'Every pick graded, wins and losses alike.' },
  ]

  // THE OFFSEASON (2026-10-21, BATCH-MLB-OFFSEASON B1): once MLB's schedule has no regular or postseason game within three days either side, Home's
  // Tonight view is the offseason page (the record, fall ball while it plays). Any other state, or a state not read yet, draws this page as it was.
  if (mlbPhase?.phase === 'OFFSEASON' && view === 'tonight') return <MlbOffseason phase={mlbPhase} onNavigate={onNavigate} />

  return (
    <div>
      {/* ── THE VIEW SWITCHER — three answers to "what's happening right
             now": Tonight (this page as it always was), The board (the
             Scoreboard, whole), Box scores (Boxes, whole). Same pill idiom
             as the Bot tab's VIEWS row; deliberately a bare row, no border,
             no panel — it's navigation, not content. See the consolidation
             note above the component for why these live here and why the
             routing that points at them lands in a separate change. ── */}
      {/* ── NO PILL ROW ON THE FRONT PAGE (2026-08-17) ────────────────────────
          Donovan: "the read on the home page is good. i just dont like how the
          home page has tabs aals wtf."
          The landing page carried a second row of navigation directly beneath
          the main tab bar — the same duplication as the double Pair History row
          on Combos. Home is one page now.
          The `view` state and the `initial` prop STAY, because Dashboard routes
          #tab=scoreboard and #tab=boxes through this component; those links
          still land on the right view. The pills are reached from the Boards
          group's existing row instead, so nothing became unreachable and no new
          row was created to replace this one. Only when a deep link put us on a
          sub-view does a single way back appear, below.
          2026-09-13: now that a sub-view has a sibling worth reaching directly
          — At the plate, The board, Box scores are all "what's happening
          right now" answers — the lone "← Home" button grew into a pill row
          so you can jump straight from one to another instead of bouncing
          through Tonight. Still only shows once you've left Tonight, so the
          front page stays exactly as bare as Donovan asked for. */}
      {view !== 'tonight' && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => pickView('tonight')} style={btnStyle(C.orange, false)}>
            ← Home
          </button>
          <PillRow
            value={view}
            options={HOME_VIEWS.filter((v) => v.key !== 'tonight')}
            onChange={pickView}
          />
        </div>
      )}

      {/* The board runs on the globally-filtered list when Dashboard provides
          it; Boxes takes the full slate (allPlayers), same as its old mount.
          At the plate takes the full slate too — it does its own watching for
          who's actually due up. All three are mounted unmodified — they carry
          their own headers, fetches and empty states. */}
      {view === 'live' && (
        <AtThePlate players={players} watchIds={watchIds} mode={mode} slateMode={mode} onPlayerClick={onPlayerClick} onNavigate={onNavigate} />
      )}
      {view === 'board' && (
        <Scoreboard
          players={filteredPlayers ?? players} mode={mode} slateDate={slateDate}
          results={results} backtest={backtest} odds={odds}
          onWatch={onWatch} watchIds={watchIds}
          onPlayerClick={onPlayerClick} onNavigate={onNavigate}
        />
      )}
      {view === 'boxes' && (
        <Boxes players={players} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      )}

      {view === 'tonight' && <>
      <style>{`
        @keyframes homePulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes homeFade { from{opacity:0; transform:translateY(3px)} to{opacity:1; transform:none} }
        .home-headline:hover { filter: brightness(1.12); }
        .home-headlines-viewport::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── ORIENT, THEN READ (2026-08-29) ────────────────────────────────
          Donovan, comparing this page to TUDDY's: "just want it to be more
          user friendly and nav smooth. i like the creative aspect — i feel
          that is missing from the other parts of the site."

          So nothing here is cut and no sentence is rewritten. What changed is
          what you land on. The rail and the Following strip used to sit ABOVE
          the greeting (the rail's old note argued "a score is what you came to
          check"), which meant the page opened on two strips of chrome before
          it said a word. They move to directly under the hero — still the
          first things after it, still above everything else — and the hero
          leads, followed by four tiles and The Four, so the top of the page
          answers "what is tonight" before it starts talking.

          Everything below is exactly where it was. */}

      {/* ── 🧾 THE HOMER LEDGER, WHERE PEOPLE ACTUALLY ARE (2026-08-16) ───
          Donovan: "the home run ledger [needs to be] somewhere else as well —
          people are saying they dont see it, or 'i wish i would have seen it
          earlier'."

          It has only ever lived on Home's "The board" view, which is a second
          click almost nobody makes while a game is on. That is the whole
          reason for the complaint: not that the panel is bad, that it is one
          view sideways from where everyone is standing. He picked every
          surface offered, so it now sits on all of them and the component is
          the single source — mount it, do not fork it.

          LIVE ONLY here. Before first pitch it has nothing to say and would
          be an empty box on the busiest screen on the site; the ledger's own
          date gate already returns null, and this gate means it does not even
          mount. It appears when the first game starts, which is exactly the
          moment "I wish I'd seen it earlier" is about. */}
      {/* ── THE GATE ABOVE WAS THE BUG, AND ITS COMMENT WAS THE ARGUMENT FOR IT.
          The reasoning was: don't mount an empty box, it appears when the first
          game starts, "which is exactly the moment 'I wish I'd seen it earlier'
          is about". That is backwards. Nobody can discover a feature inside a
          window they must already be watching to see. Donovan asked where this
          thing is THREE separate times, most recently guessing "maybe it will
          show during the slate" — which was correct, and was the problem.
          The ledger owns an honest waiting state now ("no homers yet tonight",
          plus what it will show and when) and still refuses on tomorrow's
          slate, so there is no empty box to protect against. */}
      {/* The ledger no longer leads the page — see the mount after the hero.
          (2026-08-17, Donovan: "it doesnt need to be at the top of the page on
          the home page, the welcome thing needs to.") */}

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      {/* THE TAPE (2026-10-20, Donovan picked prototype A: "this whole section ... needs to be
          the storylines jumping out"): the day in one line, every product's storylines
          rolling, a line per product (components/StoryTape.js). It replaces the hero's stat
          tiles and the crawl; the rundown and the four sit right under it, as before. */}
      {/* THE NUMBERS OF THE DAY, FIRST (2026-10-22, the Home rebuild every product shares) */}
      <HotNumbers compact sport="mlb" date={slateDate} theme={C} numFont={NUM_FONT} accent={C.orange} onOpen={() => onNavigate?.('numerology')} eventWord="HRs" />

      {/* THE GREETING (2026-10-22, components/home/HomeGreeting): the day, the next first pitch ("Dodgers at Blue Jays · first pitch in
          2h 10m"), three tiles, then the headlines + stories strip -- one block, as on TUDDY's Home */}
      {(() => {
        const g = {  icon, live: isLive,
          eyebrow: <>{`${slateInPast ? (slateDate === etShift(-1) ? 'Last night' : 'Final') : (mode === 'tomorrow' && slateDate === etShift(0) ? 'Tonight' /* the 'Tmrw' slate after midnight is tonight (2026-10-04 day rule) */ : (dateLabel || (mode === 'today' ? 'Today' : 'Tomorrow')))}${!slateInPast && nextMlb?.round && nextMlb.date === slateDate ? ` · ${nextMlb.round}` : ''}`}{slateDate ? <>{' · '}<span style={{ color: C.orange, fontWeight: 900, fontSize: TYPE.body, letterSpacing: '.08em' }}>{slateDayLabel(slateDate)}</span></> : null}</>,
          lead: empty
          ? <>Tonight&apos;s board isn&apos;t built yet.</>
          : slateInPast
            ? <>That slate is done.</>
            : <><span style={{ fontFamily: NUM_FONT }}>{games.length}</span>{games.length === 1 ? ' game' : ' games'} {slateWhen(slateDate, etToday())}{isLive && liveGames > 0 && (<>, <span style={{ fontFamily: NUM_FONT }}>{liveGames}</span> live</>)}.</>,
          accentText: [empty ? null : slateInPast ? (gradesPending ? 'Final grades post in the morning.' : 'Every pick is graded.') : (isLive ? 'Grading as they land.' : null),
            slateInPast && nextLine(nextMlb, etToday()) ? `No games tonight · ${nextLine(nextMlb, etToday())}.` : null].filter(Boolean).join(' ')  }
        const now = Date.now()
        const nextG = games.filter((x) => Date.parse(x.game_time || '') > now).sort((a, b) => Date.parse(a.game_time) - Date.parse(b.game_time))[0] || null
        const kick = nextG ? { away: teamName(nextG.away) || nextG.away, home: teamName(nextG.home) || nextG.home, start: Date.parse(nextG.game_time) } : null
        const later = nextG ? games.filter((x) => x !== nextG && Date.parse(x.game_time || '') > now).length : 0
        const topHr = [...players].filter((x) => Number.isFinite(Number(x.hr_score))).sort((a, b) => b.hr_score - a.hr_score)[0] || null
        const confirmed = games.filter((x) => x.lineup_confirmed).length
        const tiles = empty ? [] : [
          { label: slateInPast ? 'GAMES' : 'TONIGHT', value: games.length, sub: games.length === 1 ? 'game' : 'games' },
          { label: 'TOP HR SCORE', value: topHr ? Math.round(topHr.hr_score) : '—', sub: topHr?.name || 'waiting for the board', dim: !topHr, onClick: topHr ? () => onPlayerClick?.(topHr) : null },
          { label: 'LINEUPS', value: `${confirmed}/${games.length}`, sub: confirmed === games.length && games.length ? 'all confirmed' : 'confirmed so far' },
        ]
        return (
          <HomeGreeting sport="mlb" theme={C} numFont={NUM_FONT} icon={g.icon} eyebrow={g.eyebrow} live={g.live} kick={slateInPast ? null : kick} verb="first pitch" more={later}
            lead={g.lead} accentText={g.accentText} tiles={tiles}>
            {!empty ? <Headlines players={players} headline={headline} results={results} isLive={isLive} airRanked={airRanked} odds={odds} onPlayerClick={onPlayerClick} onNavigate={onNavigate} /> : null}
          </HomeGreeting>
        )
      })()}
      {!empty && (
        <div style={{ marginBottom: 12 }}>
          <BotPicksStrip players={players} graded={results?.graded_slots || null} onPlayerClick={onPlayerClick} onFullCard={onNavigate ? () => onNavigate('props') : null} />
        </div>
      )}

      {/* TONIGHT'S CALLS AS CARDS (2026-10-18, PHONE-PARITY 9a): /m's swipe deck, shut by default so nothing above the table moves and no request is made until it is opened */}
      {!empty && <Fold id="tonight-calls" title="🃏 Tonight's calls" meta="swipe the real cards"><TonightsCalls sport="mlb" /></Fold>}

      {/* TONIGHT (2026-10-04): who went, who lines up, who's still to go (components/tonight/MlbTonight.js) */}
      {/* THE CALLED LIST (2026-10-25): the locked Card as a table, three rows and a link to the full list; silent until a card is locked */}
      <CalledList sport="mlb" theme={C} numFont={NUM_FONT} accent={C.orange} Table={DenseTable} preview={3} onOpenList={() => onNavigate?.('calledlist')} />

      <MlbTonight players={players} results={results} slateDate={slateDate} onPlayerClick={onPlayerClick} onNavigate={onNavigate} />

      {/* ⭐ YOUR PLAYERS (2026-09-03) — replaces FollowingStrip here.
          Same list, same stores, same place on the page. What changed is that
          it now carries tonight's line, so the section about your guys says
          something you did not already know. FollowingStrip itself is
          untouched and still mounts on the watchlist tab; see YourPlayers.js
          for why the star list and the follow list are unioned into one
          section rather than shown as the two stores they actually are. */}
      <YourPlayers
        players={players}
        watchIds={watchIds}
        onPlayerClick={onPlayerClick}
        /* onUnstar (2026-09-18): the same toggleWatch this page's own boards
           already use for their stars, so the × here removes a man from both
           lists instead of leaving a starred row behind. */
        onUnstar={onWatch}
      />

      {/* ONE CALLS SURFACE (2026-10-17): tonight's calls live in The Four (the hero) -- the swipe-through cards are gone from Home. */}


      {/* FOUNDING MEMBERS (2026-10-16): the one place the site asks for the $10, after the record and the money line. */}
      <FoundingMembersCard accent={C.orange} theme={C} numFont={NUM_FONT} />
      {/* THE RACES, THE SLATE, THE LINKS, THE NETWORK (2026-10-22): the bottom every product's Home shares. Tonight's angles, the
          two Top 10s, the weak arms and the rest of "more on tonight" are one tap away; the money answer is on Results. */}
      <RaceTracker sport="mlb" theme={C} numFont={NUM_FONT} onOpen={() => onNavigate?.('leaders')} />
      <SlateRow sport="mlb" theme={C} numFont={NUM_FONT} games={games.map((x) => ({ id: x.game_pk, away: x.away, home: x.home, start: Date.parse(x.game_time || ''), state: 'pre' }))} totals={mlbTotals} title={slateInPast ? 'THE GAMES' : 'TONIGHT'} />
      <HomeLinks sport="mlb" theme={C} nav={MLB_NAV} setTab={onNavigate} label="More on MOONSHOT" links={[
        { tab: 'fullboard', sub: 'every hitter, ranked' }, { tab: 'games', sub: 'game by game' }, { tab: 'leaders', sub: 'odds, awards' },
        { tab: 'pitchers', sub: 'the weak arms' }, { tab: 'ledger', sub: 'who homered' }, { tab: 'odds', sub: 'prices, longshots' },
        { tab: 'results', sub: 'every pick graded' }, { tab: 'combos', sub: 'pairs and pools' }, { tab: 'storylines', sub: 'every story' },
      ]} />
      <NetworkRow sport="mlb" theme={C} numFont={NUM_FONT} />

      {/* ── NOTHING BUILT YET. One honest card instead of eight strips each
             quietly rendering nothing — an empty page that says why is a
             different experience from an empty page. ── */}
      {empty && (
        <div style={{
          background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 14,
          padding: '16px 18px', marginBottom: 14,
        }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 800, marginBottom: 5 }}>Nothing on the board yet</div>
          <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, maxWidth: 620 }}>
            Tonight&apos;s slate posts in the morning. Until then, the pages below still work, and the record has every graded night behind it.
          </div>
        </div>
      )}

      <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 12, lineHeight: 1.5 }}>
        Every number is real, never a guess. Tap any number for what it is.
      </div>
      </>}
    </div>
  )
}
