'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { btnStyle } from '../ui'
import RankedBoard from './RankedBoard'
import Runs from './Runs'
import PowerTab from './Power'
import BlankBoard from '../BlankBoard'
import PlayerCard from '../PlayerCard'
import HitterHeat from '../HitterHeat'
import { playerId } from '../../lib/player'

// Which BoardFilters score-slider a view means by "Score" — mirrors the keys
// BoardFilters.js's own SCORE_FOR_TYPE understands. weakspot/aligned/
// matchupedge/blank aren't single-score rankings, so they fall through to
// null and the Score slider simply doesn't render for them.
const SCORE_TYPE_FOR_VIEW = { top: 'top', hr: 'hr', hit: 'hit', hrr: 'hrr', contact: 'contact' }

// 📊 BOARDS — the nine ranked lenses, plus the power page and the streak page
// they share a roof with.
//
// ── THE CONSOLIDATION (2026-08-16) ───────────────────────────────────────────
//
// Boards absorbs the Power tab. The plan named the danger in advance: "The
// Boards merge is the one that could go wrong. It would put twelve lenses in
// one row — nine current plus Farthest, Overdue and Parks. Twelve pills is its
// own kind of mess, and I'd want to group them (by market / by power / by
// pattern) rather than lay them flat." So the grouping IS the design, not a
// nicety: the top row is three GROUPS (📊 Boards · 🚀 Power · 🔥 Patterns),
// and Power keeps its own three-lens row inside its group exactly as Power.js
// built it. Nothing is flattened into the nine-lens sticky row, which stays
// exactly as it was within the Boards group.
//
// ── THE CHROME PASS (2026-08-15) ─────────────────────────────────────────────
//
// Donovan: "i think the over boards page acan be better", plus the standing
// complaint that pages feel "all over the place" and that he keeps having to
// "scroll up to scroll back down".
//
// WHAT WAS WRONG. Between the top of the tab and the first ranked row sat
// FOUR stacked things: a pill pair (Boards / Patterns), a bordered card whose
// left half was a "What this answers" paragraph and whose right half was nine
// lens buttons, a second bordered gradient banner carrying the per-view proof
// paragraph, and only then the filter bar. Two containers and roughly a
// screenful of furniture ahead of the content — and because the lens buttons
// lived at the top of all of it, changing boards meant scrolling back up past
// every word of it. That is the "scroll up to scroll back down" complaint
// literally described.
//
// WHAT CHANGED — FORM ONLY, NOT ONE FACT DROPPED.
//   · ONE STICKY ROW carries the view pills AND all nine lenses. It follows
//     you down the board (same idiom as the Games page's sticky game strip),
//     so switching lenses never costs a scroll. The bordered card around them
//     is gone; the buttons themselves are the header now.
//   · THE "WHAT THIS ANSWERS" LINE AND THE PROOF HEADLINE ARE ONE SENTENCE.
//     Same words, same per-view text, now a line instead of a card plus a
//     banner. Tiles and boxes lose to sentences.
//   · THE PROOF PARAGRAPH — the measured archive numbers, quoted verbatim,
//     which are the whole reason to trust a board — hangs one tap off the end
//     of that sentence, behind its own headline. Same disclosure idiom as the
//     Games legend ("what do the symbols mean") and ParkBoard's "show all
//     parks". Nothing is hidden that isn't named by the thing you tap.
//   · The three signal sections below lost their gradient header boxes for a
//     left rule and a sentence, and their standalone description paragraphs
//     folded into that same sentence — those paragraphs were repeating the
//     validated-rate pill's own tooltip a line above them.
//
// Every button, caption, tooltip and measured number that existed before is
// still on this page, in the same words.

// What each lens is FOR, in the market's own language. The proof line below
// says why to trust a board; this says which bet it belongs to — nine buttons
// that all look like rankings needed one line naming the market each answers.
// (2026-08-09 spoon-feed pass; text unchanged, lifted to module scope so the
// header sentence and the lens row can both read it.)
const ANSWERS = {
  top: 'if you were making one play per game, who would it be.',
  hr: 'who to back to hit a home run tonight.',
  hit: 'who to back for a 1+ hit prop — the site’s most reliable market.',
  hrr: 'who to back for 2+ hits+runs+RBI.',
  contact: 'who to back for 2+ total bases.',
  weakspot: 'which hitters are standing in a slot tonight’s starter has already been beaten in.',
  aligned: 'which hitters have every flag that grades out firing at once.',
  matchupedge: 'which hitters get to face the exact pitches they punish.',
  blank: 'who went hitless last time out — and whether his own bounce-back record beats what the book is charging.',
}
const ANSWER_FALLBACK = 'every ranked board in one place, each with its record stated, not implied.'

// THE PROOF. This tab covers the categories the archive says actually work —
// HIT picks delivered 64.5% and hit_score is the second-best-calibrated score
// in the system; hrr_score is THE best-calibrated (+13.3 quartile spread). The
// HR tab can't make those claims; this one can, so it does — per view, with
// the numbers, so the tab reads as the site's proven product rather than the
// undercard. Was a full-width gradient banner; now the head is a line you can
// read at a glance and the body is one tap behind it. Wording untouched: these
// are measured archive figures and they get quoted, not paraphrased.
const PROOF = {
  top: {
    color: C.yellow,
    head: 'The bot’s overall ranking — graded as an HR bet, honestly',
    body: 'top_board_score_v2 blends every lane into one number; the TOP pick is the bot’s single favorite play per game. Graded on homers across 62 nights and 811 games TOP delivered 21.3% (172/807) — decent for an any-HR bet — and the same man got a hit 70.8% of the time (571/807), which is the bar that actually decides how this board should be read. Since a TOP designation is "best in his game", his 🤖 lights here only when he IS tonight’s TOP pick.',
  },
  hr: {
    color: C.orange,
    head: 'Ranked on the bot’s own HR score — and here’s why',
    body: 'This board ranks on the bot’s raw hr_score, untouched. It used to multiply that by the measured HR rate of the hitter’s ISO band — real research, across 3,973 graded picks ISO bands ran 8.2% to 22.2% while raw-score quartiles managed +4.7 points — but that multiplier was removed on 2026-08-09 for two checkable reasons: hr_score ALREADY carries ISO through season_power, so the band counted it twice, and it corrupted the projection bands, which were measured against the raw score. The ISO column still sits beside the score so you can see it, and The Read applies the band as an explicit second opinion rather than folding it back in.',
  },
  hit: {
    color: C.purple,
    head: 'The site’s most reliable product',
    body: 'HIT picks got their hit 69.6% of the time — 968 of 1,391 across 62 graded nights — and hit_score separates cleanly (59.7% bottom quartile → 71.3% top on the full archive). Restated 2026-08-16 from the 62-night sweep; the old banner quoted 64.5% on 3,973 picks over 39 days, and both the rate AND the sample moved. The "When picked" column below is each hitter’s own delivery record in this exact category.',
  },
  hrr: {
    color: C.cyan,
    head: 'The best-calibrated score in the system',
    body: 'HRR picks cleared their 2+ H+R+RBI bar 50.9% of the time — 709 of 1,392 across 62 graded nights (restated 2026-08-16; the earlier 48% came from the 39-day sample). hrr_score’s calibration claim is under re-measurement on the bigger archive — the v2 extract does not carry hrr_total, so its quartile spread cannot be recomputed yet and the old 41.2→54.5 figure is retired rather than repeated.',
  },
  contact: {
    color: C.blue,
    head: 'Two singles clear it — which is why the power scores are wrong here',
    body: 'TWO BASES IS THE ODD BAR ON THIS SITE, and it is the key to reading this board: it can be cleared without any power at all. A double does it, and so do two singles. That is not a technicality — it is measurable, and it runs the opposite way to intuition. Sorting tonight’s field on the 2+ HITS outcome, hit_score separates hardest (19.0% bottom quartile to 29.8% top, +10.8) while hr_score runs BACKWARDS at −3.8 and top_board_score_v2 at −6.0. Sluggers strike out; the men who pile up bases two at a time are contact hitters. So a total-bases play is a frequency bet wearing a power bet’s clothes, and the power boards are the wrong place to shop for it. CONTACT picks cleared 2+ TB 39.9% of the time (316/791) — and the graded files record no walks, so a pick who walked twice is scored a failure; read these as a floor. The score itself was re-measured on 2026-08-15 against its OWN bar across 4,971 tracked hitters: the bottom three quartiles are indistinguishable (39.3%, 40.3%, 38.3% — Q1 vs Q3 z=0.49, no difference) and only the top quartile separates (44.9%, z=2.83 vs Q1). It is also unstable across time — spreads by chronological quarter ran +5.4, +0.5, −1.0, +17.4, a standard deviation larger than the mean. So: being IN the top quarter of this board is the signal; the order inside the rest of it is not one. Five candidate replacements were fitted on the first 31 nights and tested on the last 21; none beat it out of sample with non-overlapping intervals, so nothing was retuned.',
  },
  weakspot: {
    color: C.yellow,
    head: 'Validated: ⭐ hitters homer more',
    body: 'A weak spot means tonight’s starter has given up real damage to this lineup slot. Measured across the archive: flagged hitters homered 18.0% vs 13.9% unflagged, and cleared 2+ TB 41.3% vs 37.5%. One of only three flags on the site that survives grading.',
  },
  aligned: {
    color: C.purple,
    head: 'Rebuilt on the two flags that grade out — the old 🧩 didn’t',
    body: 'The bot’s 🧩 tag graded at 15.4% vs 14.6% baseline on 39 samples — nothing. Aligned now means the measured stack instead: weak spot ⭐ AND pitch match 🎯 AND ISO ≥ .18. That trio homered 29.2% across 154 graded slots — more than double the 12.9% rate of hitters with neither flag, the strongest composite on the site.',
  },
  matchupedge: {
    color: C.orange,
    head: 'Validated: 🎯 pitch match is a real HR signal',
    body: 'The hitter’s damage pitches overlap what tonight’s arm actually throws. Measured: matched hitters homered 18.4% vs 13.6% unmatched across 1,669 graded slots — the same size edge as the weak-spot flag, and the two stack: both together homered 23.3%.',
  },
}

/**
 * How far down the page the sticky lens row has to pin.
 *
 * The app header (components/Header.js) is ITSELF `position: sticky; top: 0`
 * at z-index 50, and its height changes with the width because the tab rail
 * wraps. So a child that pins at `top: 0` does not sit under your eye — it
 * slides underneath the header and disappears, which is worse than not being
 * sticky at all. (The Games page's sticky game strip pins at 0 and has that
 * problem; the scrollMarginTop: 160 sprinkled around this codebase is the
 * same header height, guessed by hand.) Measuring it once and on resize is
 * cheaper than another guessed constant and cannot drift when the header
 * changes.
 */
function useHeaderOffset() {
  const [top, setTop] = useState(0)
  useEffect(() => {
    const measure = () => {
      const h = typeof document !== 'undefined' ? document.querySelector('header') : null
      const stuck = h && getComputedStyle(h).position === 'sticky'
      setTop(stuck ? Math.round(h.getBoundingClientRect().height) : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return top
}

/**
 * A signal section's header, as one line.
 *
 * WAS: a tinted gradient bar (emoji + title + validated-rate pill + count),
 * and under it, for two of the three sections, a separate grey paragraph that
 * said in prose exactly what the pill's own tooltip already said — the
 * "check whether the top one is repeating the bottom one" trap. Now it is a
 * left rule and a sentence: same emoji, same title, same pill with the same
 * tooltip, same count, and the description reading on as the rest of the
 * sentence rather than as a second block.
 */
function SectionHead({ color, icon, title, rate, rateTitle, count, children }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{title}</span>
        <span title={rateTitle} style={{
          fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color, cursor: 'help',
          border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 8px',
        }}>{rate}</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{count} players</span>
      </div>
      {children && (
        <div style={{ fontSize: 10.5, color: C.text3, marginTop: 3, lineHeight: 1.5, maxWidth: 720 }}>{children}</div>
      )}
    </div>
  )
}

function WeakSpotSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const ws = players
    .filter(p => p?.weak_spot_flag === true)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!ws.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={ws}
        type="hr"
        title="Weak spot matchups"
        onPlayerClick={onPlayerClick}
      />
      <SectionHead
        color="#f59e0b" icon="⭐" title="Weak Spot Matchups"
        rate="18.0% HR"
        rateTitle="Validated: flagged hitters homered 18.0% vs 13.9% baseline across the graded archive"
        count={ws.length}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {ws.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function AlignedSignalsSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const aligned = players
    .filter(p => (p?.top_board_tags || []).some(t => String(t).includes('🧩')))
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!aligned.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={aligned}
        type="hr"
        title="Aligned signals"
        onPlayerClick={onPlayerClick}
      />
      <SectionHead
        color="#a78bfa" icon="🧩" title="Aligned Signals"
        rate="29.2% HR"
        rateTitle="The measured stack: 29.2% HR across 154 graded slots — the strongest validated combo on the site"
        count={aligned.length}
      >
        Weak-spot lineup matchup, pitch-type match, and real recent contact quality all line up —
        the strongest validated signal combo found in backtesting.
      </SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {aligned.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function MatchupEdgeSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const edge = players
    .filter(p => Number(p?.pitch_type_match_score || 0) > 0)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!edge.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={edge}
        type="hr"
        title="Matchup edge"
        onPlayerClick={onPlayerClick}
      />
      <SectionHead
        color="#22d3ee" icon="🎯" title="Matchup Edge"
        rate="23.9% HR"
        rateTitle="Backtested separator: 23.9% HR with the flag vs 9.5% without"
        count={edge.length}
      >
        Documented batter-vs-pitch exploit — backtested separator: players with this flag hit
        23.9% vs 9.5% without it.
      </SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {edge.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

// The three groups the top row can open. Kept as a list so the deep-link
// guard below and the pill row can never disagree about what exists.
// 'scoreboard' and 'boxes' joined this row on 2026-08-17, when Home lost its own
// pill row. They are boards, so they belong in the Boards group rather than as a
// second navigation row on the front page. They route out to the existing
// #tab= handlers rather than mounting here, so there is exactly one copy of each.
const GROUPS = [['boards', '📊 Boards'], ['power', '🚀 Power'], ['patterns', '🔥 Patterns']]

/**
 * New props, all optional so the CURRENT Dashboard mount keeps rendering
 * unchanged — this lands BEFORE the routes are rewired:
 *   · results      — passed straight through to PowerTab (LongestBoard wants
 *                    it). null until the owner rewires the mount to hand over
 *                    the real resultsForSlate.
 *   · initialView  — which GROUP opens first, so the old #tab=longest and
 *                    #tab=due deep links can land on the Power group instead
 *                    of dying. Anything unrecognized falls back to 'boards'.
 *   · powerInitial — forwarded as PowerTab's own `initial` prop, so #tab=due
 *                    can still open Overdue specifically. Power's default.
 */
export default function HitsHRR({ players, allPlayers = [], odds = null, onAdd, onWatch, watchIds, onPlayerClick, slateDate = null, results = null, initialView = 'boards', powerInitial = 'longest', onNavigate = null }) {
  const [bview, setBview] = useState(() => (GROUPS.some(([k]) => k === initialView) ? initialView : 'boards'))
  const [view, setView] = useState('hr')
  const [proofOpen, setProofOpen] = useState(false)
  const stickTop = useHeaderOffset()
  // Scoped to whichever lens is open (view), so the Score slider in
  // BoardFilters reads hr_score on the HR board, hit_score on Hits, etc.,
  // rather than guessing. Lifted here (not left inside RankedBoard) so the
  // filter panel — bar, band, score range, games, chips — survives a lens
  // switch instead of silently resetting every time view changes.
  const filterState = useBoardFilter(players, SCORE_TYPE_FOR_VIEW[view] || null)
  const { filtered, state } = filterState

  const boards = bview === 'boards'
  const pr = PROOF[view]

  return (
    <div>
      {/* ── THE ONLY HEADER ──────────────────────────────────────────────
          Sticky, because the lens you want next should always be one tap away
          and never one scroll up — that is the "scroll up to scroll back
          down" complaint, answered. It pins BELOW the app header rather than
          at 0; see useHeaderOffset above for why that distinction matters. */}
      {/* ── NOT STICKY ON PHONES (2026-08-17) ────────────────────────────────
          Donovan's screenshot: this pill row pinned itself mid-screen on
          mobile and the page scrolled behind it, cutting the Power lead in
          half — "the page like breaks or follows when you scroll down". On a
          phone the condensed header animates its height, so any fixed
          stickTop is wrong for part of every scroll; and a 3-pill row is not
          worth pinning on a 6-inch screen anyway. The class carries the
          coarse-pointer override in MobileCSS; desktop keeps the sticky. */}
      <div className="board-pill-row" style={{
        position: 'sticky', top: stickTop, zIndex: 20, background: C.bg,
        paddingTop: 4, paddingBottom: 7, marginBottom: 10,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {GROUPS.map(([k, label]) => (
          <button key={k} onClick={() => setBview(k)} style={{
            padding: '6px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
            fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
            border: `1px solid ${bview === k ? C.orange : C.border}`,
            background: bview === k ? 'rgba(249,115,22,.14)' : 'transparent',
            color: bview === k ? C.orange : C.text3,
          }}>{label}</button>
        ))}
        {/* The 'Full slate' / 'Box scores' LINKS that used to sit here are gone
            (2026-08-17, "when you click on certain it navigates you out of the
            area — it's bad"). They silently jumped you to another tab, which
            reads as the page throwing you somewhere. Slate is a top-level tab
            now and Boxes is one tap from Home, so nothing became unreachable —
            this row just stopped teleporting people. */}
        {boards && (
          <>
            <span style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 3px' }} />
            <button onClick={() => setView('top')}     style={btnStyle(C.yellow, view === 'top')}     title={`Top — ${ANSWERS.top}`}>🥇 Top</button>
            <button onClick={() => setView('hr')}      style={btnStyle(C.orange, view === 'hr')}      title={`HR — ${ANSWERS.hr}`}>HR</button>
            <button onClick={() => setView('hit')}     style={btnStyle(C.purple, view === 'hit')}     title={`Hits — ${ANSWERS.hit}`}>Hits</button>
            <button onClick={() => setView('hrr')}     style={btnStyle(C.cyan,   view === 'hrr')}     title={`HRR — ${ANSWERS.hrr}`}>HRR</button>
            <button onClick={() => setView('contact')} style={btnStyle(C.blue,   view === 'contact')} title={`Contact — ${ANSWERS.contact}`}>⚾ Contact</button>
            <button onClick={() => setView('weakspot')} style={btnStyle(C.yellow, view === 'weakspot')} title={`Weak Spot — ${ANSWERS.weakspot}`}>⭐ Weak Spot</button>
            <button onClick={() => setView('aligned')} style={btnStyle(C.purple, view === 'aligned')} title={`Aligned — ${ANSWERS.aligned}`}>🧩 Aligned</button>
            <button onClick={() => setView('matchupedge')} style={btnStyle(C.orange, view === 'matchupedge')} title={`Matchup Edge — ${ANSWERS.matchupedge}`}>🎯 Matchup Edge</button>
            {/* 🧊 AFTER A BLANK (2026-08-15) — Donovan: "show all the players who
                blanked in their last game ... on a chart, have a column with
                price [and hit] rate for hits and 1 HRR." A ninth lens rather
                than a tab: it is a board, it ranks, and it belongs beside the
                other eight. */}
            <button onClick={() => setView('blank')} style={btnStyle(C.cyan, view === 'blank')} title={`After a Blank — ${ANSWERS.blank}`}>🧊 After a Blank</button>
          </>
        )}
      </div>

      {bview === 'patterns' ? (
        /* allPlayers: a streak board silently narrowed by the header's team
           filter reads as the whole board — the audit's wrong-number find. */
        <Runs players={allPlayers.length ? allPlayers : players} onPlayerClick={onPlayerClick} />
      ) : bview === 'power' ? (
        /* 🚀 POWER, mounted whole. Its three lenses (Farthest / Overdue /
           Parks) stay INSIDE it, on its own row — folding them into the nine-
           lens row above is exactly the twelve-pill flat mess the plan said
           it wanted grouped instead. slateDate: Power declares '' as its
           default where this tab declares null, so null is normalized rather
           than handed a shape Power never planned for. */
        <PowerTab
          players={players}
          slateDate={slateDate || ''}
          results={results}
          onWatch={onWatch}
          watchIds={watchIds}
          onPlayerClick={onPlayerClick}
          initial={powerInitial}
        />
      ) : (
        <>
          {/* ONE SENTENCE, TWO OLD BLOCKS. The market this board is for, then
              the archive's verdict on it as a tap-to-open clause. The full
              measured paragraph is behind the headline that names it — read
              the claim, open the receipts. */}
          <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.65, maxWidth: 840, marginBottom: pr && proofOpen ? 7 : 12 }}>
            <b style={{ color: C.text }}>What this answers:</b> {ANSWERS[view] || ANSWER_FALLBACK}
            {pr && (
              <>
                {' '}
                <button
                  onClick={() => setProofOpen((v) => !v)}
                  title={proofOpen ? 'Hide the measured record' : 'Open the measured record behind this board — the archive rates, in full'}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    font: 'inherit', cursor: 'pointer', color: pr.color, fontWeight: 800,
                    borderBottom: `1px dashed ${pr.color}66`, textAlign: 'left',
                  }}
                >✓ {pr.head} {proofOpen ? '▴' : '▾'}</button>
              </>
            )}
          </div>
          {pr && proofOpen && (
            <div style={{
              fontSize: 10.5, color: C.text2, lineHeight: 1.6, maxWidth: 780,
              borderLeft: `2px solid ${pr.color}66`, paddingLeft: 11, marginBottom: 12,
            }}>{pr.body}</div>
          )}

          {/* The three signal sections get the filter bar here. The hrr/hit/contact
              views delegate to RankedBoard, which carries its own — showing two
              filter bars stacked would be worse than either. */}
          {['weakspot', 'aligned', 'matchupedge'].includes(view) && (
            <BoardFilters state={state} total={players.length} shown={filtered.length} />
          )}

          {view === 'blank'
            ? <BlankBoard players={allPlayers.length ? allPlayers : players} odds={odds} onPlayerClick={onPlayerClick} />
            : view === 'weakspot'
            ? <WeakSpotSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
            : view === 'aligned'
            ? <AlignedSignalsSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
            : view === 'matchupedge'
            ? <MatchupEdgeSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
            : <RankedBoard players={players} type={view} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} slateDate={slateDate} filterState={filterState} />
          }
        </>
      )}
    </div>
  )
}
