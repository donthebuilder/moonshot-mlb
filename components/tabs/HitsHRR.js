'use client'
import WatchBox from '../WatchBox'
import { leaveTarget } from '../../lib/openTarget'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import LensRow, { LensAnswer } from '../LensRow'
import RankedBoard from './RankedBoard'
import Runs from './Runs'
import StealBoard from './StealBoard'
import GapBoard from './GapBoard'
import PowerTab from './Power'
import BlankBoard from '../BlankBoard'
import PlayerCard from '../PlayerCard'
import { usePreview, ShowMoreButton } from '../ListPreview'
import MobileFold, { useIsPhone } from '../MobileFold'
import { DrawerSection, drawerLabel } from '../FiltersDrawer'
import { useHashFilter } from '../../lib/filterHash'
import { COLUMN_VIEWS, columnViewKey } from '../../lib/boardColumns'
import HowToRead from '../HowToRead'
import { hrRank } from '../../lib/scoring'
// HitterHeat (the heat-painted 'top 15 profile' tables) left this page 2026-09-06 -- Donovan:
// "I don't like those ones." The cards below carry the same names.
import { hrScore, mlbId, nameOf, playerId, teamOf } from '../../lib/player'
import { useSetupHomers, useBackToBack } from '../../lib/b2b'
import { dedupeGraded } from '../../lib/graded'
import { useLockedRecord } from '../../lib/useLockedRecord'
import { pickRate, lockedCallsLine } from '../../lib/record/lockedRecord'

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
// HOW TO READ THIS, MOONSHOT's words (components/HowToRead.js draws them).
// Every line describes what the page shows; none claims a hit rate.
const HOW_NOTES = [
  { title: 'Board rank', text: 'His place on tonight\u2019s board, #1 first. It blends his HR score, his season home runs and how hard he hits the ball.' },
  { title: 'The player', text: 'Tap any row to open his card: why he\u2019s up there, and what\u2019s working against him.' },
  { title: 'HR score', text: 'How good tonight looks for him to go deep, 0\u2013100. It\u2019s a ranking, not a percent: a 78 sits above a 62, it isn\u2019t a 78% chance.' },
  { title: 'The bot\u2019s pick', text: 'The bot makes two calls in every game: TOP, its single best play, and HR, its home-run pick. In the table, the \ud83e\udd16 dot marks the HR pick and the Pick column says TOP.' },
  { title: 'Facing', text: 'Tonight\u2019s starting pitcher. Tap his name to open him.' },
]
const HOW_STEPS = [
  { icon: '👆', text: 'Tap a row to see why he\u2019s up there.' },
  { icon: '☆', text: 'Watch him to keep him on your watchlist.' },
  { icon: '✅', text: 'After the game, every pick is graded in public.' },
]

const ANSWERS = {
  top: 'if you were making one play per game, who would it be.',
  hr: 'who to back to hit a home run tonight.',
  hit: 'who to back for a 1+ hit prop.',
  hrr: 'who to back for 2+ hits+runs+RBI.',
  contact: 'who to back for 2+ total bases.',
  weakspot: 'which hitters are standing in a slot tonight’s starter has already been beaten in.',
  aligned: 'which hitters have the weak spot, the pitch match and power firing at once.',
  matchupedge: 'which hitters get to face the exact pitches they punish.',
  blank: 'who went hitless last time out — and whether his own bounce-back record beats what the book is charging.',
}
const ANSWER_FALLBACK = 'every ranked board in one place, each with its record stated, not implied.'

// ── NINE LENSES, TWO KINDS (2026-09-03) ─────────────────────────────────────
//
// They were one undifferentiated run of nine pills. Five of them are BET TYPES
// -- the thing you came to this page to back -- and four are SCREENS over the
// same field, angles you reach for once you know what you are looking for.
// Splitting them is not a way of making the row shorter; it is the difference
// between "which bet" and "which way of finding one", and somebody who wants a
// home run pick should not have to read past "Matchup Edge" to find HR.
//
// Colours are the ones each lens already had -- see the btnStyle calls this
// replaced. They are lens identity here, not data colour.
// ONE BOARD (2026-09-25). Donovan: "they should be one thing, it's very
// confusing." The Top lens (top_board_score_v2) is gone; the HR lens IS The
// Board -- the same order as #tab=fullboard, the alerts and the tweet
// (lib/boardOrder.js). A saved or shared view=top lands here.
const MARKET_LENSES = [
  { key: 'hr',      label: 'The Board', color: C.orange },
  { key: 'hit',     label: 'Hits',    color: C.purple },
  { key: 'hrr',     label: 'HRR',     color: C.cyan },
  { key: 'contact', label: 'Contact', color: C.blue },
]
const ANGLE_LENSES = [
  { key: 'weakspot',    label: 'Weak Spot',    color: C.yellow },
  { key: 'aligned',     label: 'Aligned',      color: C.purple },
  { key: 'matchupedge', label: 'Matchup Edge', color: C.orange },
  // 🧊 AFTER A BLANK (2026-08-15) -- Donovan: "show all the players who blanked
  // in their last game ... on a chart, have a column with price [and hit] rate
  // for hits and 1 HRR." A lens rather than a tab: it is a board, it ranks, and
  // it belongs beside the other eight.
  { key: 'blank',       label: 'After a Blank', color: C.cyan },
]
const LENS_TITLE = (o) => `${o.label} — ${ANSWERS[o.key] || ''}`

// THE PROOF. Once "the categories the archive says actually work": measured on
// post-game graded files. The numbers now come from the LOCKED record (the
// calibration reader, lib/record/lockedRecord.js; 2026-10-06 -- the hard-coded
// Sep 9-30 rates counted nights stamped after first pitch). Each head states the
// bar and the base; the body prints the live rate with its n and window.
// The head is a line you can read at a glance; the body is one tap behind it.
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const PROOF = (rec) => ({
  top: {
    color: C.yellow,
    head: 'The bot’s overall ranking',
    body: 'top_board_score_v2 blends every lane into one number; the TOP pick is the bot’s single favorite play per game. Since a TOP designation is "best in his game", his 🤖 lights here only when he IS tonight’s TOP pick.',
  },
  hr: {
    color: C.orange,
    head: 'The Board — one order, everywhere on the site',
    body: 'Every hitter tonight, ranked once: the HR score, his season home run count and his season exit velocity, each turned into a rank within tonight\u2019s slate and averaged. This is the same order as the full board (#tab=fullboard), the homer alerts\u2019 "#N on the board" and the MOONSHOT BOARD post. The old Top lens (top_board_score_v2) is folded into it \u2014 two boards with one name was the confusion.',
  },
  hit: {
    color: C.purple,
    head: 'Hit calls against the base rate, on the locked record',
    body: `HIT picks are graded on getting at least one hit. ${rec?.picks?.HIT ? `On the ${rec.source} (${lockedCallsLine(rec, rec.picks.HIT.n)}) they got one ${pickRate(rec.picks.HIT)}, against ${rec.picks.HIT.base?.toFixed(1)}% for every hitter on the board.` : 'The locked record is loading.'} The "When picked" column below is each hitter’s own delivery record in this exact category, from the post-game graded files.`,
  },
  hrr: {
    color: C.cyan,
    head: '2+ hits, runs and RBI',
    body: `HRR picks are graded on clearing 2+ H+R+RBI.${rec?.picks?.HRR ? ` On the ${rec.source}: ${pickRate(rec.picks.HRR)}, against ${rec.picks.HRR.base?.toFixed(1)}% for every hitter on the board.` : ''}`,
  },
  contact: {
    color: C.blue,
    head: 'Two singles clear it — which is why the power scores are wrong here',
    body: `TWO BASES IS THE ODD BAR ON THIS SITE, and it is the key to reading this board: it can be cleared without any power at all. A double does it, and so do two singles. Sluggers strike out; the men who pile up bases two at a time are contact hitters. So a total-bases play is a frequency bet wearing a power bet’s clothes, and the power boards are the wrong place to shop for it. The graded files record no walks, so a pick who walked twice is scored a failure. ${rec?.picks?.CONTACT ? `On the ${rec.source}, CONTACT picks cleared 2+ bases ${pickRate(rec.picks.CONTACT)}, against ${rec.picks.CONTACT.base?.toFixed(1)}% for every hitter on the board.` : ''}`,
  },
  weakspot: {
    color: C.yellow,
    head: 'Weak spot: the starter has been hit in this slot',
    body: 'A weak spot means tonight’s starter has given up real damage to this lineup slot.',
  },
  aligned: {
    color: C.purple,
    head: 'Aligned: weak spot, pitch match and power at once',
    body: 'Aligned means a stack: weak spot ⭐ AND pitch match 🎯 AND ISO ≥ .18. None of the three has been measured on the clean pregame record yet.',
  },
  matchupedge: {
    color: C.orange,
    head: '🎯 Pitch match: his damage pitches, tonight',
    body: 'The hitter’s damage pitches overlap what tonight’s arm actually throws.',
  },
})

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
        <span style={{ fontSize: TYPE.name, fontWeight: 800, color: C.text }}>{title}</span>
        {rate && <span title={rateTitle} style={{
          fontSize: TYPE.micro, fontWeight: 900, fontFamily: NUM_FONT, color, cursor: 'default',
          border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 8px',
        }}>{rate}</span>}
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{count} players</span>
      </div>
      {children && (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginTop: 3, lineHeight: 1.5, maxWidth: 720 }}>{children}</div>
      )}
    </div>
  )
}

function WeakSpotSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const ws = players
    .filter(p => p?.weak_spot_flag === true)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  // Phase 1 simplify pass, 2026-09-11: this rendered a full PlayerCard grid
  // for every qualifying hitter with nothing collapsed -- the same
  // uncapped-card-wall pattern fixed on RankedBoard's Cards view earlier
  // today, just filtered by a signal instead of by rank. Hook called
  // unconditionally, before the early return below (Rules of Hooks).
  const wsPreview = usePreview(ws, 5)

  if (!ws.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionHead
        color={C.yellow} icon="⭐" title="Weak Spot Matchups"
        count={ws.length}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {wsPreview.shown.map(p => (
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
      <ShowMoreButton {...wsPreview} itemWord="players" />
    </div>
  )
}

function AlignedSignalsSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const aligned = players
    .filter(p => (p?.top_board_tags || []).some(t => String(t).includes('🧩')))
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  // Same fix as WeakSpotSection above -- see its comment.
  const alignedPreview = usePreview(aligned, 5)

  if (!aligned.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <SectionHead
        color={C.purple} icon="🧩" title="Aligned Signals"
        count={aligned.length}
      >
        Weak-spot lineup matchup, pitch-type match, and real recent contact quality all line up.
      </SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {alignedPreview.shown.map(p => (
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
      <ShowMoreButton {...alignedPreview} itemWord="players" />
    </div>
  )
}

function MatchupEdgeSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const edge = players
    .filter(p => Number(p?.pitch_type_match_score || 0) > 0)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  // Same fix as WeakSpotSection above -- see its comment.
  const edgePreview = usePreview(edge, 5)

  if (!edge.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <SectionHead
        color={C.cyan} icon="🎯" title="Matchup Edge"
        count={edge.length}
      >
        Documented batter-vs-pitch exploit.
      </SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {edgePreview.shown.map(p => (
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
      <ShowMoreButton {...edgePreview} itemWord="players" />
    </div>
  )
}

// The three groups the top row can open. Kept as a list so the deep-link
// guard below and the pill row can never disagree about what exists.
// 'scoreboard' and 'boxes' joined this row on 2026-08-17, when Home lost its own
// pill row. They are boards, so they belong in the Boards group rather than as a
// second navigation row on the front page. They route out to the existing
// #tab= handlers rather than mounting here, so there is exactly one copy of each.
// 🏃 STEALS joins the group row (2026-08-23). Donovan asked for stolen-base
// looks on 08-22 with the deadline "now", SB v1 landed the fields the next
// morning, and "then do the stolen base thing its simple" is the go-ahead. It
// belongs in Charts because Charts answers "who should I back, ranked" and
// that is exactly what it is — a ranked board, on published counts, with no
// model behind it.
// 2026-08-24: labels went text-only (Donovan wants secondary/sub-tab pill
// rows emoji-free site-wide — only the top-level nav tabs get emoji prefixes).
// 2026-09-03: 'Gap' joins the row rather than becoming a tab — same
// decision as Steals, same reason (Donovan: "unsure about the use of
// more tabs, we have to get that under control"). Doubles and triples
// are one board: same swing, same park geometry, same audience.
const GROUPS = [['boards', 'Rankings'], ['power', 'Power'], ['patterns', 'Patterns'], ['steals', 'Steals'], ['gap', 'Gap']]

// 🌙 DAY-OFF SPLIT (2026-08-30, Donovan: "i also like to track day offs like
// instead of back back games the me[i]ss the back to back and go a 'day off'
// or a game off add that as well also if you can run the data on the
// percentage"). lib/b2b.js now tags every proven player with `_b2bGapDays` --
// 1 for a literal back-to-back (played the very next day), 2+ for however
// many calendar days he sat in between. Split the one list into two rows
// instead of quietly folding a day-off return into "back-to-back", which
// they no longer are.
// The box itself is components/WatchBox.js now (2026-09-28): the same markup,
// shared with TUDDY's TD WATCH and LAMP's GOAL WATCH. What stays here is
// MOONSHOT's: the rows, the archive rates and the words.
function b2bItems(players, cashed, onPlayerClick) {
  return players.map((player) => {
    const id = mlbId(player)
    return {
      key: id || nameOf(player), tile: teamOf(player) || 'MLB', name: nameOf(player),
      line: `HR score ${Math.round(hrScore(player) || 0)}`,
      hit: cashed.has(id), hitText: '✓ HOMERED AGAIN',
      onClick: () => onPlayerClick?.(player),
    }
  })
}

function B2BStrip({ list, verified, loading, cashed, onPlayerClick }) {
  const strict = list.filter((p) => (p._b2bGapDays ?? 1) <= 1)
  const dayOff = list.filter((p) => (p._b2bGapDays ?? 1) > 1)
  return (
    <WatchBox logoSport="mlb"
      icon="🔁" title="B2B WATCH" accent={C.orange}
      status={loading ? 'checking the setup game…' : !verified ? 'setup proof unavailable' : list.length ? `${list.length} verified encore chase${list.length === 1 ? '' : 's'}` : 'no verified encore chases on this slate'}
      note="last-game homer proven · no hit-rate claim"
      rows={[
        { key: 'b2b', label: '🔁 back-to-back — played the very next game', items: b2bItems(strict, cashed, onPlayerClick) },
        { key: 'off', label: '🌙 returning from a day off', accent: C.blue || C.orange, items: b2bItems(dayOff, cashed, onPlayerClick) },
      ]}
    />
  )
}

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
export default function HitsHRR({ players, allPlayers = [], odds = null, onAdd, onWatch, watchIds, onPlayerClick, onOpenCard = null, slateDate = null, results = null, initialView = 'boards', powerInitial = 'longest', onNavigate = null }) {
  const [bview, setBview] = useState(() => (GROUPS.some(([k]) => k === initialView) ? initialView : 'boards'))
  const [view, setView] = useState('hr')
  const viewKey = view === 'top' ? 'hr' : view
  const [proofOpen, setProofOpen] = useState(false)
  // ONE RANKINGS PAGE (2026-10-06): mounted on the Boards group (Dashboard's `fullboard`), this is Rankings.
  // The same component still hosts Power / Patterns / Steals / Gap under their own tab keys.
  const rankings = initialView === 'boards'
  const phone = useIsPhone()
  const phoneRank = rankings && phone
  // the board's column layout (cols=read | lean, absent = all), kept in the address like the other view params
  const [colsRaw, setColsRaw] = useHashFilter('cols')
  const colsView = columnViewKey(colsRaw)
  const setColsView = (k) => setColsRaw(k === 'all' ? '' : k)
  const [layout, setLayout] = useState('list')   // Rankings' List / Cards switch (the page owns it, the table reads it)
  // Scoped to whichever lens is open (view), so the Score slider in
  // BoardFilters reads hr_score on the HR board, hit_score on Hits, etc.,
  // rather than guessing. Lifted here (not left inside RankedBoard) so the
  // filter panel — bar, band, score range, games, chips — survives a lens
  // switch instead of silently resetting every time view changes.
  const filterState = useBoardFilter(players, SCORE_TYPE_FOR_VIEW[viewKey] || null)
  const { filtered, state } = filterState
  const setupHomers = useSetupHomers(slateDate)
  // useBackToBack, not backToBack: the watch accumulates for the slate so a
  // hitter cannot fall off it when his own game finishes and the bot's
  // last-game fields roll forward. See the note at the foot of lib/b2b.js.
  const b2b = useBackToBack(allPlayers.length ? allPlayers : players, setupHomers, hrScore, slateDate)
  const b2bCashed = useMemo(() => {
    const ids = new Set()
    if (!results || (slateDate && results.date && String(results.date) !== String(slateDate))) return ids
    dedupeGraded(results?.graded_slots || results?.results || []).forEach((row) => {
      if (Number(row?.actual_hr) > 0) ids.add(Number(row?.player_id))
    })
    return ids
  }, [results, slateDate])

  const boards = bview === 'boards'
  const lockedRec = useLockedRecord()
  const pr = PROOF(lockedRec)[viewKey]
  // The row the "How to read this" picture draws: tonight's real #1 on the
  // board (lib/scoring hrRank, the same order the # column prints).
  const howRow = useMemo(() => {
    const pool = allPlayers?.length ? allPlayers : players
    if (viewKey !== 'hr' || !pool?.length) return null
    const ranks = hrRank(pool)
    const top = pool.find((p) => ranks.get(mlbId(p)) === 1)
    if (!top) return null
    return {
      sport: 'mlb', faceId: mlbId(top), team: teamOf(top), opp: String(top?.opponent || top?.opp || ''),
      name: nameOf(top), rank: 1, score: { label: 'HR', value: hrScore(top) },
      pick: (() => {  // his role in his game, read the way RankedBoard reads it
        const role = String(top?.game_pick_role || '').split('/')[0].trim().toUpperCase()
        return role === 'TOP' || role === 'HR' ? `${role} pick` : null
      })(),
      fifth: { label: 'Facing', value: top?.pitcher_name || 'TBD' },
    }
  }, [allPlayers, players, viewKey])

  const b2bFold = (
    <MobileFold title="🔁 B2B Watch" summary={b2b.list?.length ? `${b2b.list.length} encore chase${b2b.list.length === 1 ? '' : 's'}` : 'no back-to-back setups tonight'} count={b2b.list?.length || null} accent={C.orange} rememberKey="fold_b2b_v1">
      <B2BStrip
        list={b2b.list}
        verified={b2b.verified}
        loading={setupHomers === undefined}
        cashed={b2bCashed}
        onPlayerClick={onPlayerClick}
      />
    </MobileFold>
  )
  // HOW TO READ THIS: tonight's #1 row taken apart. A small button on a phone, a pill in the sentence on a desktop.
  const howBtn = viewKey === 'hr' && howRow
    ? <HowToRead id="mlb-hr-board" accent={C.orange} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />
    : null
  // PHONE: the market chips are one scrolling row beside the one Filters button; everything else
  // (angles, List / Cards, what this board answers) is the top of that button's panel.
  const chip44 = (on, accent) => ({
    flex: '0 0 auto', minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
    border: `1px solid ${on ? accent : C.border}`, background: on ? `${accent}22` : 'transparent', color: on ? accent : C.text3,
  })
  const phoneBeside = (
    <div role="group" aria-label="Market" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none' }}>
      {MARKET_LENSES.map((o) => (
        <button key={o.key} type="button" onClick={() => setView(o.key)} aria-pressed={o.key === view} title={LENS_TITLE(o)} style={chip44(o.key === view, o.color)}>{o.label}</button>
      ))}
    </div>
  )
  const phoneLead = (
    <>
      <DrawerSection label="View">
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {[['list', '☰ List'], ['cards', '▦ Cards']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setLayout(k)} aria-pressed={layout === k} style={chip44(layout === k, C.orange)}>{l}</button>
          ))}
        </div>
      </DrawerSection>
      <DrawerSection label="Columns" hint="The same board laid out the way you read it.">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {COLUMN_VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setColsView(v.key)} aria-pressed={colsView === v.key} title={v.title} style={chip44(colsView === v.key, C.orange)}>{v.label}</button>
          ))}
        </div>
      </DrawerSection>
      <DrawerSection label="Angle" hint="A different way to find a name on tonight's board.">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {ANGLE_LENSES.map((o) => (
            <button key={o.key} type="button" onClick={() => setView(o.key)} aria-pressed={o.key === view} title={LENS_TITLE(o)} style={chip44(o.key === view, o.color)}>{o.label}</button>
          ))}
        </div>
      </DrawerSection>
      <DrawerSection label="About this board">
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.55, marginTop: 4 }}>
          {(ANSWERS[viewKey] || ANSWER_FALLBACK).replace(/^./, (c) => c.toUpperCase())}
          {pr && (<>
            {' '}
            <button type="button" onClick={() => setProofOpen((v) => !v)} style={{ background: 'transparent', border: 'none', padding: 0, minHeight: 44, font: 'inherit', cursor: 'pointer', color: pr.color, fontWeight: 800, textAlign: 'left' }}>{pr.head} {proofOpen ? '▴' : '▾'}</button>
          </>)}
        </div>
        {pr && proofOpen && <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6, borderLeft: `2px solid ${pr.color}66`, paddingLeft: 11 }}>{pr.body}</div>}
      </DrawerSection>
    </>
  )

  return (
    <div>
      {/* ── THE ONLY HEADER ──────────────────────────────────────────────
          Used to be sticky (pinned below the app header, following you down
          the board) so the lens you want next was always one tap away. That
          made it a SECOND thing pinned to the viewport on desktop, on top of
          the site's actual sticky header — 2026-08-24, Donovan's screenshot:
          this row was sticking to the top of the viewport while scrolling
          Charts, and only the main nav/header should ever do that. It was
          already forced non-sticky on phones (see the class below, still
          carried by MobileCSS); now it's plain in-flow on desktop too. */}
      {!rankings && <div className="board-pill-row" style={{
        background: C.bg,
        paddingTop: 4, paddingBottom: 7, marginBottom: 10,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* THE PARENT TIER, AND IT LOOKS LIKE ONE (2026-09-03). A shade
            larger and heavier than the Market/Angle pills below the rule, so
            "which tool am I in" and "which board within it" are told apart by
            shape before anyone reads a word. */}
        {GROUPS.map(([k, label]) => (
          <button key={k} onClick={() => (k === 'boards' && onNavigate ? onNavigate('fullboard') : setBview(k))} style={{
            padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body,
            fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
            letterSpacing: '.02em',
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
      </div>}

      {/* ── THE SECOND TIER, NAMED (2026-09-03) ───────────────────────────
          The nine lenses used to run on after the four group pills above,
          separated by a one-pixel divider and nothing else. See
          components/LensRow.js for why that divider could never do the job it
          was being asked to do. */}
      {phoneRank && boards && (
        <BoardFilters state={state} total={players.length} shown={filtered.length} compact beside={phoneBeside} lead={phoneLead} ledger={rankings ? 'mlb' : null} />
      )}
      {boards && !phoneRank && (
        // ── ONE ROW, NOT TWO (2026-09-14, MOONSHOT batch 3) ────────────────
        // Donovan, off the brand audit: "three rows of filter pills ... one
        // filter row." Market and Angle stay two named groups — that split is
        // still real, see LensRow.js — they just sit on the same flex line
        // now instead of stacked, wrapping together onto a second line only
        // when a phone is too narrow to fit both. The Group tier above this
        // (Boards/Power/Patterns/Steals/Gap) is tool navigation, not a filter,
        // so it keeps its own row same as the tab rail above it.
        <div className="lens-rows" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 4, marginBottom: 4 }}>
          <LensRow
            label="Market"
            options={MARKET_LENSES.map((o) => ({ ...o, title: LENS_TITLE(o) }))}
            value={view}
            onChange={setView}
          />
          <LensRow
            label="Angle"
            options={ANGLE_LENSES.map((o) => ({ ...o, title: LENS_TITLE(o) }))}
            value={view}
            onChange={setView}
          />
        </div>
      )}

      {/* PHONE (2026-09-24 audit): on a 390px screen the Boards page put ~920px
          of chrome before the first ranked row, and this strip was 200px of
          it -- three card rows and two paragraphs above the board the tab is
          named for. Folded to one line on a phone; desktop unchanged. */}
      {!phoneRank && b2bFold}

      {bview === 'gap' ? (
        <GapBoard players={players} odds={odds} onPlayerClick={onPlayerClick} />
      ) : bview === 'steals' ? (
        <StealBoard players={players} odds={odds} onPlayerClick={onPlayerClick} />
      ) : bview === 'patterns' ? (
        /* allPlayers: a streak board silently narrowed by the header's team
           filter reads as the whole board — the audit's wrong-number find. */
        <Runs players={allPlayers.length ? allPlayers : players} onPlayerClick={onPlayerClick} onOpenPitcher={onNavigate ? (pid) => { leaveTarget('pitcher', pid); onNavigate('pitchers') } : null} />
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
          {phoneRank && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', margin: '0 0 8px' }}>
                {/* WHO WE RANK, ONE LINE (2026-10-06): the subtitle every sport's Rankings page carries. */}
                <div style={{ minWidth: 0, color: C.text2, fontSize: 13, lineHeight: 1.3 }}>Who we rank tonight, and why.</div>
                {howBtn}
              </div>
            </>
          )}
          {/* ONE SENTENCE, TWO OLD BLOCKS. The market this board is for, then
              the archive's verdict on it as a tap-to-open clause. The full
              measured paragraph is behind the headline that names it — read
              the claim, open the receipts. */}
          {!phoneRank && <div className="quiet-note" style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, maxWidth: 840, marginBottom: pr && proofOpen ? 7 : 12 }}>
            {/* The sentence folds; the proof button does NOT (2026-08-23).
                Hiding "✓ 68% over 27 nights ▾" behind a fold would bury the
                one clause on this page that is a measured record and an
                affordance at the same time. */}
            {/* PRINTED, NOT FOLDED (2026-09-03). This sentence spent three
                weeks inside a <details> that was shut by default behind a 9px
                "what this answers" summary -- the one line on the page written
                specifically to stop somebody feeling lost, hidden behind a
                click, and duplicated into a title= tooltip a phone cannot show
                at all. The receipts clause below still folds: a measured
                record is worth a tap, an orientation sentence is not. */}
            {/* HOW TO READ THIS (2026-10-01): tonight's #1 row, taken apart.
                HR and TOP only -- the notes describe the HR score. Inside the
                sentence, so it costs no line of its own. */}
            <LensAnswer maxWidth={840}>
              {ANSWERS[viewKey] || ANSWER_FALLBACK}
              {howBtn}
            </LensAnswer>
            {pr && (
              <>
                <button
                  onClick={() => setProofOpen((v) => !v)}
                  title={proofOpen ? 'Hide the note' : 'Open the note behind this board: what it is graded on, and its clean pregame record where one exists'}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    font: 'inherit', cursor: 'pointer', color: pr.color, fontWeight: 800,
                    borderBottom: `1px dashed ${pr.color}66`, textAlign: 'left',
                  }}
                >{pr.head} {proofOpen ? '▴' : '▾'}</button>
              </>
            )}
          </div>}
          {!phoneRank && pr && proofOpen && (
            <div style={{
              fontSize: TYPE.label, color: C.text2, lineHeight: 1.6, maxWidth: 780,
              borderLeft: `2px solid ${pr.color}66`, paddingLeft: 11, marginBottom: 12,
            }}>{pr.body}</div>
          )}

          {/* The three signal sections get the filter bar here. The hrr/hit/contact
              views delegate to RankedBoard, which carries its own — showing two
              filter bars stacked would be worse than either. */}
          {!phoneRank && ['weakspot', 'aligned', 'matchupedge'].includes(view) && (
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
            : <RankedBoard players={players} type={viewKey} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} onOpenPitcher={onNavigate ? (pid) => { leaveTarget('pitcher', pid); onNavigate('pitchers') } : null} slateDate={slateDate} filterState={filterState} setupHomers={setupHomers}
                onOpenCard={onOpenCard} rankings={rankings} compact={phoneRank} colsView={colsView} onColsView={setColsView} slate={allPlayers.length ? allPlayers : players} viewMode={layout} onViewMode={setLayout} />
          }
          {phoneRank && b2bFold}
        </>
      )}
    </div>
  )
}
