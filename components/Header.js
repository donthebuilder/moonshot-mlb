'use client'
import { explain } from '../lib/explain'
import { useState, useEffect, useMemo } from 'react'
import { C, NUM_FONT, GRADIENT, DAY_COLORS } from '../lib/theme'
import { logUrl } from '../lib/dataSource'
import { setSport } from '../lib/sport'
// LAMP's ice for the third pill below -- a token import, not a literal (hex budget).
import { computeSlateStats } from './SlateTiles'
import PaletteButton from './PaletteButton'
import ThemeModeButton from './ThemeModeButton'
import QuietButton from './QuietButton'
import { slateProjHr } from './ProjectedOutput'
import { useClubHr } from '../lib/clubHr'
import { easternToday } from '../lib/data'
import { digestGradedNight } from '../lib/ledgerArchive'
import { useMlbStatusNight } from '../lib/useMlbStatus'
import { buildHeadlines, useLiveScores, scoreOrder } from '../lib/headlines'
import TickerPill from './TickerPill'
import Ticker from './Ticker'
import DateMode from './DateMode'
import SettingsSheet, { SheetLabel, SheetRow } from './SettingsSheet'
import SignUpPill from './SignUpPill'
import HeaderShell from './header/HeaderShell'

// The header's own translucent bar was hardcoded to rgba(9,9,11,...) — a
// literal copy of ember's C.bg — so even the four EXISTING dark palettes
// (mono/steel/regal) never actually changed the one bar that's on screen
// every tab, every scroll position. Not caught before because all four are
// dark enough that the mismatch reads as "fine." Light mode made it a dark
// bar sitting above a white page. Fixed generically: derive the translucent
// background from whichever C.bg is actually active, for every theme, not
// just this one. (2026-08-18)


// Keep the existing Moonshot look, but make the top rail answer only the
// questions people arrive with most often. The deeper tools stay one tap
// away in More instead of competing with the picks on every screen.
//
// ── LABELS COME FROM lib/routes.js NOW (2026-09-03) ─────────────────────────
//
// This file used to carry its own label list, MobileTabBar.js carried a second
// one, and routes.js a third. They disagreed: `board` was "Boards" here and
// "Charts" in the route table, `home` was "Home" here and "Tonight" on the
// phone. One table, three readers -- see the note above MLB_NAV.
//
// ── TONIGHT LEFT THE RAIL (2026-09-03) ──────────────────────────────────────
//
// Donovan: "Tonight -- but I'm wondering if that even needs a button, since
// it's the MOONSHOT home page. Maybe we just get a home button working for
// MOONSHOT specifically. Props needs a lane."
//
// He is right, and it frees the slot Props needed. The MOONSHOT WORDMARK is
// the home button now (see the note where it renders), which is where every
// site on the internet has put it for twenty-five years, so a whole tab was
// being spent on a job the header already had a place for.
//
// The 2026-08-28 note beside the logo said the wordmark must NOT be a link.
// That note was about linking it to the DASH front door -- "making the
// product's own name navigate away from the product". This does the opposite:
// it navigates to the product's own front page and never leaves MOONSHOT. The
// square mark still goes to the network. Two marks, two homes, neither
// pretending to be the other.


// ── THE ONE BAR (2026-09-06) ─────────────────────────────────────────────────
//
// Donovan picked "broadcast bar, with the instrument styling": the moving
// ticker is gone from the header and its six numbers became ONE LINE OF TEXT
// under the wordmark -- a scorebug -- so the centre of the bar is free for the
// tab rail. What used to be two rows (brand + tiles, then tabs) is one bar of
// ~56px, and the second row is gone on every page. On a phone the rail is
// hidden as before (the bottom bar owns tabs under 760px) and the scorebug is
// the slate context, one line, no swipe.
//
// The right cluster shrank to three things: the date with Today/Tmrw as a
// segmented control, the account pill, and one ⚙ that opens palette, theme
// and quiet in a small sheet. Three view settings did not each need a slot
// on a bar you look past a hundred times a night.
//
// SlateTiles.js still exists and is unchanged -- Home's hero row and anything
// else that wants the tiles keep them; only the header stopped mounting it.
// The `condensed` scroll logic went with the tiles: the bar no longer has a
// tall state to condense from. --hdr-h is still written for the jump strip.

function useProjection(mode) {
  const [projection, setProjection] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setProjection(null)
      try {
        const response = await fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache:'no-store' })
        if (!response.ok) return
        const text = await response.text()
        // Matches what the bot writes in today.txt ("projected HRs 36–45 ·
        // power grade Strong"); the old colon/capital form is kept as an alt.
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        if (!cancelled && range) {
          setProjection({ low: Number(range[1]), high: Number(range[2]), grade: (grade?.[1] || '').trim() })
        }
      } catch {
        if (!cancelled) setProjection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])
  return projection
}

// One fact of the scorebug: label in caps, number in the mono face, the one
// accent for anything live (HR capture once the first homer lands).
function Bug({ label, value, color, title, live = false }) {
  return (
    <span title={title} style={{ display:'inline-flex', alignItems:'baseline', gap:4, whiteSpace:'nowrap', cursor: title ? 'default' : undefined }}>
      {live && <span aria-hidden="true" style={{ width:5, height:5, borderRadius:'50%', background:color, alignSelf:'center', animation:'pulse 2s infinite' }} />}
      <span style={{ fontFamily:NUM_FONT, fontSize:11, fontWeight:900, color: color || C.text, letterSpacing:'-.01em' }}>{value}</span>
      <span style={{ fontSize:8.5, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:C.text3 }}>{label}</span>
    </span>
  )
}

function Scorebug({ players, results, games, mode, slateDate, runMeta, onPlayerClick, go }) {
  // ── THE TICKER IS BACK, AND IT SAYS SOMETHING (2026-09-06) ───────────────
  // Donovan, after the front page got its headlines strip: "I wanted those
  // aspects on the header ... maybe even the scoring updates across the slate
  // and NFL." So the scorebug line moves again -- but where the old ticker
  // rolled six site-telemetry tiles, this one rolls the night: the slate
  // facts, every live score (MLB from the schedule call the score rail
  // already makes, NFL from TUDDY's scoreboard call), and the same headline
  // cards the front page shows, compressed to one pill each. Every pill is a
  // tap: a hitter opens his modal, a score opens Live, an NFL score switches
  // to TUDDY. Pauses under the pointer. lib/headlines.js is the one source.
  const stats = useMemo(() => computeSlateStats(players, results, games), [players, results, games])
  const feedNight = useMlbStatusNight(results?.date || null)
  const homerStatuses = useMemo(() => {
    const d = results ? digestGradedNight(results, feedNight) : null
    if (!d?.hasCapture || !feedNight) return null
    const hrs = (st) => d.all.filter((r) => r.status === st).reduce((a, r) => a + r.hr, 0)
    return { called: hrs('called'), board: hrs('board'), off: hrs('off') }
  }, [results, feedNight])
  const clubHr = useClubHr()   // the league table the team model reads (lib/teamHr.js)
  const modelHr = useMemo(() => slateProjHr(players, clubHr), [players, clubHr])
  const projection = useProjection(mode)
  // ONE SPORT PER TICKER (2026-10-06): MOONSHOT's strip carries MOONSHOT's games only; the other
  // sports' live lines are behind the switcher (components/header/SportSwitch.js)
  const live = useLiveScores({ nfl: false, nhl: false })
  const isLive = live.items.some((i) => i.live) || (stats?.actual ?? 0) > 0
  const heads = useMemo(() => buildHeadlines({ players, results, isLive, headline: null, airRanked: [] }), [players, results, isLive])
  if (!stats) return <span style={{ fontSize:9.5, color:C.text3, fontFamily:NUM_FONT }}>loading the slate…</span>

  const expectedDate = mode === 'tomorrow'
    ? new Date(new Date(`${easternToday()}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)
    : easternToday()
  const staleSlate = !!slateDate && slateDate < expectedDate
  const proj = modelHr != null ? modelHr.toFixed(1) : projection ? ((projection.low + projection.high) / 2).toFixed(1) : null
  // onSheet can be null while actual > 0 (only total_hrs_on_slate published): no "null/7"
  // ON THE BOARD is ONE definition (2026-10-06, ledger audit P0-1): lib/callStatus.js via the statuses
  // /called prints (the top third of the night's board, or a call), not "anyone the sheet had".
  // Falls back to the sheet's own count only until the statuses arrive.
  const onBoardHrs = homerStatuses ? homerStatuses.called + homerStatuses.board : stats.onSheet
  const captured = stats.actual != null && stats.actual > 0 && onBoardHrs != null
  const pct = captured ? (100 * (onBoardHrs || 0)) / stats.actual : null
  const capCol = C.text2   // COLOUR DIET (2026-10-07): was sky / green / amber / red by capture rate; the count says it

  const items = []
  items.push({ k: 'games', label: 'games', value: stats.gameCount, nav: 'games', title: 'Games on this slate' })
  if (proj != null) items.push({ explain: true, k: 'proj', label: 'Expected HRs', value: proj, color: C.orange, nav: 'board', title: `${modelHr != null ? `The site's model projects ${modelHr.toFixed(1)} home runs across this slate. ` : ''}${projection ? `MOONSHOT's sheet says ${projection.low}–${projection.high}, power grade ${projection.grade || 'n/a'}.` : ''}` })
  items.push({ explain: true, k: 'cap', label: 'HRs on board', value: captured ? `${onBoardHrs}/${stats.actual}` : stats.actual > 0 ? `${stats.actual} HR` : 'no HR yet', color: capCol, live: true, nav: 'calledledger', title: captured ? `${onBoardHrs} of the slate's ${stats.actual} home runs so far were CALLED or ON THE BOARD (the top third of that night's board) before first pitch (${pct.toFixed(0)}%) -- the same count as the Called page. Fewer games are in while the slate is live.` : 'How many of tonight\'s home runs the board had before first pitch — fills in when the first one lands.' })
  // live scores ride between the facts and the headlines: live first, finals after
  const scores = scoreOrder(live.items, 'mlb')
  for (const i of scores.live) items.push({ k: i.k, hash: i.hash, label: i.sub || 'live', value: i.text, icon: i.icon, color: i.col, live: true, sport: i.sport, kind: i.kind, nav: 'scoreboard', title: i.kind === 'leader' ? `Leading tonight's line for this game` : (i.sport === 'nfl' ? 'Live on TUDDY — tap to switch' : 'Live — tap for the Live page') })
  for (const h of heads) items.push({ k: `h-${h.k}`, label: h.tag, value: h.name, icon: h.icon, color: h.col, p: h.p, nav: h.nav, title: h.why })
  items.push({ explain: true, k: 'lineups', label: staleSlate ? 'prev lineups' : 'lineups', value: `${stats.confirmedTeams}/${stats.lineupTeams}`, color: staleSlate ? C.text3 : C.text2, nav: 'games', title: 'Teams with a confirmed lineup' })
  // FRESHNESS PILL (2026-09-11, item 21). "MLB has no lineup freshness
  // indicator anywhere" -- unlike TUDDY's built_at_human clock. The bot has
  // published current/{mode}_run_meta.json with a generated_at timestamp
  // since 2026-08-21; this was the first time the site fetched it. Stale
  // threshold is 3h, not TUDDY's 24h -- TUDDY's cron is deliberately sparse
  // (~12 runs/week), MLB's runs many times an hour whenever the slate is
  // live, so a board that hasn't rebuilt in 3h during an active day is a
  // real signal something stalled (see item 26 -- a stale lineup silently
  // reading "confirmed" is exactly the failure mode this exists to catch).
  if (runMeta?.generated_at) {
    const builtMs = Date.parse(runMeta.generated_at)
    if (Number.isFinite(builtMs)) {
      const ageMin = Math.max(0, Math.round((Date.now() - builtMs) / 60000))
      const ageText = ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`
      const builtStale = ageMin > 180
      items.push({ explain: true, k: 'built', label: 'built', value: ageText, color: builtStale ? C.red : C.text3, title: `Board last built ${new Date(builtMs).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}${builtStale ? ' -- over 3h old' : ''}` })
    }
  }
  items.push({ explain: true, k: 'weak', label: 'weak', value: `★${stats.weak}`, color: C.text2, nav: 'board', title: 'Weak-spot matchups on the slate' })
  // Own finals and upcoming first, then the other sports' (scoreOrder).
  for (const i of scores.rest) {
    if (i.pregame) items.push({ k: i.k, hash: i.hash, label: i.sub || 'kickoff', value: i.text, icon: i.icon, color: C.text3, sport: i.sport, kind: i.kind, nav: 'scoreboard', title: i.title || (i.sport === 'nfl' ? 'Not underway yet — tap to switch to TUDDY' : 'Not underway yet') })
    else items.push({ k: i.k, hash: i.hash, label: i.sub || 'final', value: i.text, icon: i.icon, color: C.text3, sport: i.sport, kind: i.kind, nav: 'scoreboard', title: i.kind === 'leader' ? `${i.sub}'s final line` : (i.sub === 'last night' ? "Last night — sticks around till tonight's games start" : 'Final') })
  }
  // THE PREGAME PILLS WERE BUILT AND NEVER RENDERED (2026-09-18). useLiveScores
  // has produced a `pregame` item per not-yet-started game since 2026-09-16
  // (lib/headlines.js's own 'pre' branch, added so a between-slates ticker
  // wasn't empty) -- and this loop's `!x.pregame` filter plus the live loop's
  // `x.live` meant neither of them ever reached the strip. Found while putting
  // TUDDY's ticker into this exact order: TUDDY renders them, MOONSHOT didn't,
  // so the two strips could not agree. Both show them now, last, after the
  // finals.

  // A pill from another product's feed switches to that product (2026-09-26:
  // this was `sport === 'nfl' ? 'nfl' : 'scoreboard'`, so a hockey item would
  // have opened MOONSHOT's scoreboard). MOONSHOT's own go to its scoreboard.
  // A pill that names its destination (`hash`, e.g. LAMP's scores) goes there.
  // TAP TO EXPLAIN (2026-09-27): the shorthand pills (HR proj, HR capture,
  // lineups, built, weak ★) also put their explanation in the shell's explain
  // panel (lib/explain.js) -- it stays up across the page they open, so the
  // tap says what it was. Scores and headlines only navigate, as before.
  const open = (it) => { if (it.explain) explain(it.label, it.title); if (it.p) onPlayerClick?.(it.p); else if (it.hash) window.location.hash = it.hash; else if (it.sport && it.sport !== 'mlb') setSport(it.sport); else if (it.nav) go?.(it.nav) }
  // ONE SHAPE FOR EVERY PILL: same height, same padding, label over value in
  // a fixed two-line stack, a dot on the left slot whether live or not (so
  // the pills line up), value truncated at 150px. That shape now lives in
  // components/TickerPill.js and TUDDY's header renders the same one
  // (2026-09-18). Behaviour here is unchanged: every pill in MOONSHOT's strip
  // is tappable, so every one passes an onClick.
  const Pill = ({ it, echo }) => (
    <TickerPill
      label={it.label} value={it.value} icon={it.icon} color={it.color}
      live={it.live} title={it.title} echo={echo} onClick={() => open(it)} sport={it.sport || 'mlb'} game={it.kind === 'score'}
    />
  )
  // ── #97: -webkit-overflow-scrolling:touch FREEZES A JS-DRIVEN SCROLLLEFT
  // ON iOS SAFARI (2026-09-06) ─────────────────────────────────────────────
  // Donovan, on his phone: "the header and the headliners aren't moving."
  // Both this strip and Home's headline strip (same useAutoScroll hook,
  // same symptom) carried this property. It is a long-documented WebKit
  // quirk: once iOS puts a `touch`-momentum container into its own
  // compositing layer, it stops repainting for a plain `el.scrollLeft = x`
  // assignment made from JS while nobody's finger is on the screen -- the
  // layer only updates from a live touch gesture. Desktop Chrome has no such
  // layer and never showed this. iOS has applied momentum scrolling to any
  // plain `overflow-x: auto` container by default since iOS 13 (2019), so
  // the property is not doing anything a modern phone needs here -- it is
  // only doing the one thing it should not: silently pinning the auto-scroll
  // in place until the user manually swipes it once. Dropped from both
  // JS-driven strips; left alone on the ~16 other purely-manual-scroll
  // surfaces across the site, where it isn't in the way of anything.
  return (
    // the shell is components/Ticker.js (R9 #4); MOONSHOT's class and margin unchanged
    <Ticker className="hdr-scorebug" style={{ marginTop: 5 }} items={items}
      render={(it, echo) => <Pill key={echo ? `${it.k}-echo` : it.k} it={it} echo={echo || undefined} />} />
  )
}

// ── date + mode, as one control ───────────────────────────────────────────────


// ── ⚙ the view settings, in one sheet ─────────────────────────────────────────

// The gear shell is shared (components/SettingsSheet.js, 2026-09-26); these
// are MOONSHOT's switches and words, unchanged.
function MlbSettings() {
  return (
    <SettingsSheet theme={C} accent={C.orange} title="View settings — palette, light/dark, quiet mode"
      hint="Palette · light/dark · quiet mode. These stick on this device.">
      <SheetLabel theme={C}>View</SheetLabel>
      <SheetRow>
        <PaletteButton />
        <ThemeModeButton />
        <QuietButton />
      </SheetRow>
    </SettingsSheet>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Header({ tab, setTab, mode, setMode, lastNight = false, dateLabel, slateDate = '', results, players = [], games = [], runMeta = null, onPlayerClick = null }) {
  const go = (next) => setTab(next)
  // THE FRAME IS SHARED NOW (2026-09-29): components/header/HeaderShell.js
  // draws the bar, the mark, the wordmark, the other products' pills and the
  // phone rules for all three products. MOONSHOT's own pieces stay here.
  return (
    <HeaderShell sport="mlb" theme={C}
      wordmark={GRADIENT}
      onHome={() => go('home')} homeTitle="MOONSHOT home — tonight in one page"
      glow="rgba(249,115,22,0.35)" dot={{ color: C.green, pulse: true }}
      date={
        <DateMode
          label={dateLabel || 'Loading…'}
          value={mode}
          onChange={setMode}
          options={[
            // after the last game of a slate past ET midnight: 'Last night | Tonight' (Dashboard lastNight)
            { key: 'today', text: lastNight ? 'Last night' : 'Today', color: DAY_COLORS.today },
            { key: 'tomorrow', text: lastNight ? 'Tonight' : 'Tmrw', color: DAY_COLORS.tomorrow },
          ]}
        />
      }
      account={<SignUpPill onWatchlist={() => go('you')} />}
      settings={<MlbSettings />}>
      {/* ── row 2: THE MOVING HEADER, ABOVE THE TABS (2026-09-06) ─────────
          Donovan: "the moving header needs to be above [the tabs], with
          the stat i want." A full-width row of its own, so the leader pills
          (top hitter/performer per game) have room to be read. */}
      <Scorebug players={players} results={results} games={games} mode={mode} slateDate={slateDate} runMeta={runMeta} onPlayerClick={onPlayerClick} go={go} />
    </HeaderShell>
  )
}
