'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore, playerId, mlbId,
} from '../../lib/player'
import { tierRole, shortRole, isAligned, hrRank } from '../../lib/scoring'
import { gameNumbers, gameNumOf, doubleheaderNote } from '../../lib/doubleheader'
import { PanelTitle, Empty, btnStyle } from '../ui'
import DenseTable from '../DenseTable'
import { kRiskScore, matchupAvg, rbiScore, runScore } from '../../lib/scoring_additions'
import BotPicksStrip from '../BotPicksStrip'
import StartHere from '../StartHere'
import SlatePulse from '../SlatePulse'
import HomerLedger from '../HomerLedger'
import LiveWire from '../LiveWire'
import NearMisses, { nearMissRows } from '../NearMisses'
import ProjectedOutput, { slateProjHr } from '../ProjectedOutput'
import { groupPitchers, groupGames } from '../../lib/data'
import { airParts, airVerdict } from '../../lib/conditions'

// ── FOLD LIVES AT MODULE SCOPE, NOT INSIDE Scoreboard() (fixed 2026-08-18) ──
//
// Donovan: "the projected output is glitching... a lot of the site with the
// stuff that refreshes its glitches or closes when open and refreshes."
//
// This was it. `Fold` used to be declared INSIDE the Scoreboard function
// body, which means every render created a BRAND NEW function — and React
// treats a JSX element's `type` by function identity, not by what the
// function does. A new identity for <Fold> every render is a different
// component as far as React is concerned, so it unmounted the old <details>
// and mounted a fresh one — on every single re-render, including the silent
// background poll (every 45s live, 5min idle; see Dashboard.js). A user-
// opened <details> is native, uncontrolled DOM state, and unmounting it
// throws that state away. The "open" fold you were reading would slam shut
// the next time the slate silently refreshed underneath you — not a data
// problem, a component-identity problem. Same bug, hoisted the same way, in
// Results.js (PitcherWeaknessDigest's Group/Row, and the overview tab's
// Fold/Flow) — grep the codebase for "const Fold = (" or similar nested
// component declarations before adding another one anywhere on the site.
const Fold = ({ label, open = false, children }) => (
  <details open={open} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 10 }}>
    <summary style={{ padding: '8px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
    <div style={{ padding: '2px 12px 10px' }}>{children}</div>
  </details>
)

// Scoreboard — every hitter on the slate, every column, sortable.
//
// This page was already a sortable table; what it lacked was colour. At 15+
// numeric columns an uncoloured grid gets read one cell at a time, which is
// the opposite of what a scoreboard is for. It now shares DenseTable with
// Games and the boards, so sorting, the ramp and the row-click behave
// identically everywhere instead of three tables each doing it their own way.
//
// The bespoke table this replaces carried its own comparator with a
// null-handling fix in it. DenseTable covers the same case: non-numeric values
// fall through to a string compare, and a missing lineup spot renders as '—'
// rather than a sentinel number.
//
// ── FLOW PASS (2026-08-16, Donovan: pages "all over the palace or scrroll up
// to scoll back down") ───────────────────────────────────────────────────────
//
// Two things were wrong with the running order, and neither was a missing
// panel — everything on this page earns its place, it was arranged badly.
//
//   1. THE HOMER SECTIONS WERE SPLIT. Pre-game the order ran picks → near
//      misses → wire → LEDGER → pulse → GONE YARD → weak spots, so the two
//      panels about tonight's home runs — who has hit one (Gone yard) and what
//      number it was for him and from which lineup spot (the Ledger) — had
//      two unrelated sections wedged between them. Reading one meant scrolling
//      past the other and back. They are one subject and they now sit as one
//      block, with Near misses (the homers that almost happened) beside them.
//
//   2. REFERENCE MATERIAL FLOATED ABOVE THE THING IT EXPLAINS. Weak spots is
//      the roster behind the board's ★ column; it was stranded mid-page in one
//      order and above the orientation panel in the other. It is now the last
//      thing before the 266-row board in both orders — fold it open and the
//      column it explains is right there.
//
// The page also opens on a stated line instead of a symbol code. The header
// sub used to read "266 batters · ★12 weak spot · ◆9 aligned · ▲41 matchup
// edge", which is only legible if you already know all three glyphs; the same
// counts are now a sentence that says what each mark means, plus how tonight's
// air is playing (lib/conditions, not a fifth private chip strip) and how many
// balls have already left the yard. Every count is printed with its
// denominator — k of n — because that is the only honest form for a frequency.

const matchupEdge = (p) => {
  const weak = clean(p?.pitcher_weak_side || p?.weak_side, '')
  const bats = clean(p?.bats || p?.handedness, '')
  if (!weak || !bats) return 0
  return (weak === 'LHB' && bats === 'L') || (weak === 'RHB' && bats === 'R') ? 1 : 0
}

// ── THE G COLUMN (2026-08-17) ────────────────────────────────────────────────
// Donovan: "names also duplicated idk whats thats about."
//
// They were not duplicated. On 08-17, STL @ CIN was a DOUBLEHEADER — two
// game_pks, 17:40 and 22:40 — so all 17 twice-listed player_ids were St. Louis
// and Cincinnati bats appearing once per game. Alec Burleson genuinely hits
// twice. Deduping would have deleted a real plate appearance and halved a
// team's presence on the board on precisely the day they play most.
//
// The reason it read as a bug is that the two rows were IDENTICAL on screen:
// this board has no first-pitch column, so nothing distinguished them. So the
// fix is a label, not a filter. Injected only when a matchup actually repeats —
// see lib/doubleheader.js, including why sorting on game_pk would have numbered
// this particular doubleheader backwards.
const DH_COLUMN = {
  key: 'g',
  label: 'G',
  heat: false,
  w: 28,
  mono: true,
  dim: true,
  fmt: (v) => (v ? `G${v}` : '—'),
  title: 'Which game of a doubleheader. G1 is the earlier first pitch. A hitter '
    + 'whose team plays twice appears once per game and both rows are real.',
}

// ── LEAGUE ANCHORS (2026-08-22) ─────────────────────────────────────────────
//
// A batting average is not a magnitude; it is a distance from what everybody
// else does. Drawn on the sequential ramp against the slate's own min/max, a
// .251 hitter on a night of good bats came out black and a .251 hitter on a
// night of bad ones came out bright — the same number, two opposite readings,
// and neither of them the one that matters.
//
// These are the 2026 league marks the diverging columns are anchored on. Stated
// here rather than inline so they are arguable: if the league moves, one edit
// moves every board that reads them.
const LG = {
  avg: 0.245,
  obp: 0.315,
  kRate: 22.0,     // %
  hr9: 1.15,       // homers allowed per nine
  whip: 1.28,      // walks + hits per inning
  hardHit: 39.0,   // % of batted balls hit hard
  k9: 8.60,        // strikeouts per nine
  park: 1.00,      // a neutral building
}

// ── THE RUNDOWN'S COLOUR (2026-08-22, pass 2) ───────────────────────────────
//
// Donovan: "Rundown is the most-used page. Make it visually better."
//
// Thirty numeric columns, every one of them heat-painted against its own
// min/max. On the page you open first. The problem is not that thirty columns
// is too many — you sort by all of them, which is the point of the page — it is
// that thirty columns coloured at once means colour has stopped saying
// anything except "there is a number here".
//
// So the board keeps every column and every value, and the colour goes onto
// the three questions the numbers actually answer:
//
//   SEQUENTIAL, on a stated 0-100 — the model scores. Their header now says
//     /100, so a score can never be misread as a percentage.
//   DIVERGING, against a league mark — AVG, OBP, vs Hand, K%, the arm's HR/9
//     and the park factor. Every one of those is a distance from a normal, and
//     was being drawn as a magnitude.
//   PLAIN — counts (375+, P375, P400) and IHR. A count has no ceiling and no
//     midpoint; painting one is decoration.
//
// Everything else follows the sort. Nothing was removed.
const buildColumns = (onWatch, dhOn = false) => [
  { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
  { key: 'name',    label: 'Player', heat: false, w: 168, bold: true, sticky: true },
  // ── FOLDED ON A PHONE (2026-08-22) ──────────────────────────────────────
  // Tm, Opp, Role and Spot are 184px of identity, and together with the star
  // and the name they used to fill a 430px screen edge to edge — so the most-
  // used board on the site showed a phone no numbers at all. They now drop to
  // a sub-line under the player's name below 860px. Same values, same row,
  // same labels; about four numeric columns' worth of screen back.
  // Bare on the fold line: "CHC · vs SEA · HR Bet · #1" reads as a sentence,
  // where "Tm CHC · Opp SEA · Role HR Bet · Spot 1" is 40% labels and ran off
  // the end of a 168px name cell.
  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true, fold: true, foldLabel: false },
  ...(dhOn ? [{ ...DH_COLUMN, fold: true, foldLabel: false }] : []),
  { key: 'opp',     label: 'Opp',    heat: false, w: 34, mono: true, dim: true, fold: true, foldLabel: 'vs' },
  { key: 'role',    label: 'Role',   heat: false, w: 76, dim: true, fold: true, foldLabel: false },
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, dim: true, fold: true, foldLabel: '#',
    fmt: (v) => (v == null ? '—' : String(v)) },
  // The three marks fold to a glyph run beside the name. They were 96px of
  // column showing '·' on most rows; lit, they are three characters.
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 32, fold: true,
    title: 'Weak spot — the arm has a hole in this lineup slot' },
  { key: 'aligned', label: '◆',      flag: true, mark: '◆', w: 32, fold: true,
    title: 'Aligned with tonight’s numbers' },
  { key: 'edge',    label: '▲',      flag: true, mark: '▲', w: 32, fold: true,
    title: 'Matchup edge' },
  // The board's lead. `primary` keeps it lit whatever you sort by, because
  // "how does this hitter's HR score compare" is the question the page is for
  // and losing it while you sort by something else would cost the through-line.
  { key: 'hr',      label: 'HR',     w: 48, dp: 1, scale: 'seq', domain: [0, 100], primary: true },
  { key: 'dmg',     label: 'Damage', w: 54, dp: 1, scale: 'seq', domain: [0, 100] },
  // NOT A 0-100 SCORE, and it was sitting between six that are. Measured on
  // the live slate 2026-08-22: pitch_type_match_score runs 0 to 120 with a
  // MEDIAN OF ZERO — 25 of 269 rows clear 100 outright. Drawn against [0,100]
  // it would clip a fifth of the column at full brightness and read as "these
  // are maxed", and drawn against the slate min/max it would make the median
  // hitter's ZERO look like a low score rather than an absence. So: its own
  // stated domain, its own /120 in the header, and the tooltip says the zero
  // out loud.
  { key: 'pmatch',  label: 'PMatch', w: 58, dp: 1, scale: 'seq', domain: [0, 120],
    // A zero here is an ABSENCE — no pitch match was found — not the worst
    // match on the board, and the median hitter has one. Painted, it turned
    // half the column into a wall of near-black that read as failure.
    blankWhen: (v) => !(v > 0),
    fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(1) : '—'),
    title: 'Pitch-type match: how well tonight’s starter’s mix lines up with what this hitter punishes. Runs 0–120, not 0–100. A dash means no match was found — which is most of the slate — not a bad match.' },
  { key: 'hrr',     label: 'HRR',    w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'hit',     label: 'Hit',    w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  // ── SPLITS & AVERAGES (2026-08-21, Donovan: "stats like the batter splits
  // and avgs... I like all those stats to sort by") ─────────────────────────
  // The board had fifteen columns of HR-family scores and not one plain
  // batting average — the raw rate every one of those scores is trying to
  // predict never got its own sortable column. AVG and OBP are season rates,
  // already on every slate row. vs Hand resolves to a real matchup number —
  // the hitter's own average against LHP or RHP, picked by the hand tonight's
  // actual starter throws (lib/scoring_additions.js matchupAvg) — instead of
  // a generic split pair nobody's chosen between.
  { key: 'avg',     label: 'AVG',    w: 50, dp: 3, scale: 'div', anchor: LG.avg, ceiling: 0.080,
    anchorLabel: `league ${LG.avg.toFixed(3).replace(/^0/, '')}`,
    title: `Season batting average, against a league mark of ${LG.avg.toFixed(3).replace(/^0/, '')}. ▲ above it, ▼ below, blank when he is league-average — which is a fact about him, not a finding.` },
  { key: 'obp',     label: 'OBP',    w: 50, dp: 3, scale: 'div', anchor: LG.obp, ceiling: 0.080,
    anchorLabel: `league ${LG.obp.toFixed(3).replace(/^0/, '')}`,
    title: `Season on-base percentage, against a league mark of ${LG.obp.toFixed(3).replace(/^0/, '')}.` },
  { key: 'vsHand',  label: 'vs Hand', w: 54, dp: 3, scale: 'div', anchor: LG.avg, ceiling: 0.080,
    anchorLabel: `league ${LG.avg.toFixed(3).replace(/^0/, '')}`,
    title: "The hitter's own average against the hand tonight's starter actually throws (avg_vs_lhp or avg_vs_rhp), drawn against the same league mark as AVG so the two columns can be read side by side. Falls back to season AVG when that split or the pitcher's hand is missing." },
  // RBI / RUN SCORE (same request, "what do you think of player run and rbi
  // scoring same with hit scoring"). Composites, not bot fields — same
  // "not calibrated" status as K risk below: a transparent blend of
  // published rates (opportunity × ability × tonight's matchup × recent
  // form), not yet walk-forward tested against the graded archive's own
  // actual_rbi/actual_runs. See lib/scoring_additions.js for the weights.
  { key: 'rbiScore', label: 'RBI',   w: 48, dp: 1, scale: 'seq', domain: [0, 100],
    title: 'A composite RBI-production read: season RBI rate, lineup spot (peaks at the 4-hole), tonight\'s matchup average, and recent RBI form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'runScore', label: 'Run',   w: 48, dp: 1, scale: 'seq', domain: [0, 100],
    title: 'A composite run-production read: season run rate, lineup spot (peaks at the 1-2 hole), season OBP, and recent run form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'tb',      label: 'TB',     w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'hrw',     label: 'HRW',    w: 48, dp: 1, scale: 'seq', domain: [0, 100],
    title: 'The HR-window score. The 🌋 🚀 ⚡ 🌤️ 🧊 band on a hitter card is this number — see lib/hrwBand.js.' },
  { key: 'due',     label: 'Due',    w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'longest', label: 'Long',   w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'pmix',    label: 'PMix',   w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  // Counts. No ceiling, no midpoint — a number, drawn as a number.
  { key: 'd375',    label: '375+',   w: 42,
    title: 'Count of 375ft+ batted balls in his recent tracked window. A count, so it prints plain — colour follows it only when you sort by it.' },
  { key: 'p375',    label: 'P375 ag', w: 50,
    title: 'Balls of 375ft+ this pitcher has allowed' },
  { key: 'p400',    label: 'P400 ag', w: 50,
    title: 'Balls of 400ft+ this pitcher has allowed' },
  { key: 'ihr',     label: 'IHR',    w: 46, dp: 3,
    title: 'Ideal HR contact rate — the EV/launch window that produces homers.' },
  // A high strikeout rate is bad for the hitter, so this column runs the other
  // way. Left alone, the most strikeout-prone bats on the slate glow brightest.
  // K% was `invert: true` on the sequential ramp, which is a diverging idea
  // wearing a sequential coat: the reason to invert is that there IS a normal
  // and being above it is bad. So say so — league K%, ▲ worse for the bat.
  { key: 'k',       label: 'K%',     w: 46, dp: 1, scale: 'div', anchor: LG.kRate, ceiling: 10, invert: true,
    anchorLabel: `league ${LG.kRate.toFixed(1)}%`,
    title: `Season strikeout rate against a league mark of ${LG.kRate.toFixed(1)}%. Inverted — cool is good for the bat, because striking out more than league is the bad side of this line.` },
  { key: 'kRisk',  label: 'K risk', w: 54, dp: 0, invert: true, scale: 'seq', domain: [0, 100],
    title: 'Strikeout risk: hitter K% 40%, pitcher K% 25%, SwStr 20%, putaway 15%. Inverted — low is good for the bat. Composite, not a bot field, and not calibrated: the graded archive has no strikeout outcome to check it against.' },
  { key: 'hr9',     label: 'P HR/9', w: 50, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
    anchorLabel: `league ${LG.hr9.toFixed(2)}`,
    title: `Homers allowed per nine by tonight's starter, against a league mark of ${LG.hr9.toFixed(2)}. ▲ he gives up more than league — good for the bat.` },
  // PARK (2026-08-09). The one piece of tonight's context this table never
  // carried. The Park board ranks buildings and every board on the site talks
  // about carry, but the sheet with all 268 hitters on it had no way to ask
  // "who's in a launch pad tonight" — you had to read the park board, memorise
  // the venues, then come back and scan by opponent. It's park_hr_factor, the
  // same field the park board ranks on, already stamped on every slate row.
  { key: 'park',    label: 'Park',   w: 50, dp: 2, scale: 'div', anchor: LG.park, ceiling: 0.25,
    anchorLabel: '1.00 (a neutral building)',
    fmt: (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `×${Number(v).toFixed(2)}`),
    title: "The bot's park HR factor for tonight's building. 1.00 is neutral, ×1.10 means the park adds about 10% of home-run rate. Bright is hitter-friendly, same as every other column. Park only — the weather adjustment lives on the Park board, not in this number. A dash means no factor was published for that game." },
]

// Two trackers above the grid, ported from Streamlit. Both answer questions
// the 268-row table can't: who has ALREADY gone deep tonight, and which arms
// have soft spots the lineup can reach. Neither is derivable by sorting.
// `answers` is not optional in practice — the 2026-08-09 spoon-feed pass:
// every panel says in one plain sentence what decision it helps with, and it
// has to sit inside the panel rather than in the fold label, because in live
// mode these render open with no label at all.
function Tracker({ title, count, children, note, answers }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: answers ? 2 : 6 }}>
        {title} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontWeight: 600 }}>({count})</span>
      </div>
      {answers && (
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.55, marginBottom: 7 }}>
          <b style={{ color: C.text2 }}>What this answers:</b> {answers}
        </div>
      )}
      {children}
      {note && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

export default function Scoreboard({ players, mode = 'today', slateDate = '', results, backtest, onWatch, watchIds, onPlayerClick, onNavigate, odds = null }) {
  const [alignedOnly, setAlignedOnly] = useState(false)

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  // Off the FULL slate, not the filtered pool: whether a matchup repeats is a
  // fact about tonight's schedule, and it must not switch off because the
  // aligned-only toggle happened to hide one half of the doubleheader.
  const dh = useMemo(() => gameNumbers(players), [players])
  const dhNote = useMemo(() => doubleheaderNote(players), [players])

  const rows = useMemo(() => {
    const pool = alignedOnly ? players.filter(isAligned) : players
    return pool.map((p, i) => ({
      // game_pk in the key: on a doubleheader one player_id is legitimately two
      // rows, and a duplicate React key drops one of them silently — which
      // would "fix" the complaint by deleting a game.
      _key: `${p?.player_id ?? nameOf(p)}-${p?.game_pk ?? ''}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      g: gameNumOf(p, dh),
      opp: oppOf(p),
      role: shortRole(p),
      spot: p?.lineup_spot == null || p?.lineup_spot === '' ? null : n(p.lineup_spot, null),
      weak: p?.weak_spot_flag ? 1 : 0,
      aligned: isAligned(p) ? 1 : 0,
      edge: matchupEdge(p),
      hr: hrScore(p),
      dmg: n(p?.damage_conversion_score, 0),
      pmatch: n(p?.pitch_type_match_score, 0),
      hrr: prodScore(p),
      hit: hitScore(p),
      avg: n(p?.season_avg, 0),
      obp: n(p?.season_obp, 0),
      vsHand: matchupAvg(p) ?? 0,
      rbiScore: rbiScore(p),
      runScore: runScore(p),
      tb: tbScore(p),
      hrw: n(p?.hrw_score, 0),
      due: n(p?.hr_due_score, 0),
      longest: n(p?.longest_hr_score, 0),
      pmix: pitchMixScore(p),
      d375: recent375(p),
      p375: n(p?.pitcher_375_allowed, 0),
      p400: n(p?.pitcher_400_allowed, 0),
      ihr: ihrVal(p),
      k: n(p?.season_k_rate, 0) * 100,
      hr9: n(p?.pitcher_hr9, 0),
      // null rather than 0 when the field is absent — a park factor of zero
      // isn't a thing, and a 0.00 in this column would read as "worst park on
      // the slate" instead of "not published".
      park: n(p?.park_hr_factor, 0) > 0 ? n(p?.park_hr_factor, 0) : null,
      kRisk: kRiskScore(p),
      watched: watchIds?.has(playerId(p)) ? 1 : 0,
    }))
  }, [players, alignedOnly, watchIds, dh])

  // Who has already homered tonight, matched back to where the board had him.
  // The board rank is the point: a scoreboard that only lists the homers tells
  // you nothing about whether the model saw them coming.
  const goneYard = useMemo(() => {
    const homers = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    // 🔒 THE rank, not a local one (2026-08-11). hrRank in lib/scoring.js is
    // the single source of the HR ordering — the HR board shows these same
    // numbers, so a hitter is #4 here and #4 there and nowhere else. Enforced
    // by scripts/check-rank-lock.mjs; do not reintroduce a local sort.
    const rankOf = hrRank(players)
    // JOIN BY ID, NOT BY NAME. The id is on these entries — the _key below
    // already used it — and this joined on a letters-only squash of the name
    // instead. MLB carries same-named hitters, and findIndex on a list sorted
    // by HR score returns whichever of them scores higher, so the homer got
    // the wrong man's board rank, HR score and tier role. Any name the two
    // sources spell differently (accents, a suffix) silently rendered no rank
    // at all. tabs/Derby.js joins the identical array by player_id already.
    const byId = new Map(players.map((p) => [mlbId(p), p]).filter(([k2]) => k2))
    return homers.map((h, i) => {
      const p = byId.get(Number(h?.player_id)) || null
      return {
        _key: `${h?.player_id ?? h?.name}-${i}`,
        _raw: p,
        rank: p ? rankOf.get(mlbId(p)) ?? null : null,
        name: clean(h?.name, '—'),
        team: clean(h?.team, ''),
        // n(h?.hr, 1) invented "1 HR" whenever the field was absent, under a
        // column captioned "how many home runs he has already hit tonight".
        // A missing count is unknown, and reads as one.
        hr: Number.isFinite(Number(h?.hr)) ? Number(h.hr) : null,
        score: p ? hrScore(p) : 0,
        role: p ? tierRole(p) : '—',
        // ── THE PITCHER LINE (2026-08-22) ────────────────────────────────
        // Donovan: "'GONE YARD' on the Rundown carries the pitcher line:
        // HR/9, H9, L3 H/9, WHIP weakness, HH, K/9, L3 K/9, HR luck ± —
        // just presented well."
        //
        // Seven of the eight are published on every slate row and are read
        // straight off it. THE EIGHTH IS NOT: there is no pitcher_l3_k9 in
        // the payload (l3 covers era, whip and hr9 only), so that column
        // does not render rather than being faked from the season figure.
        // The caption says which one is missing and why.
        //
        // "WHIP weakness" is read as the SIDE split — his WHIP against the
        // hand this hitter bats from, which is the number that was actually
        // weak for this homer, not the aggregate.
        pName: p ? clean(p.pitcher_name, 'TBD') : '—',
        pHr9: p ? n(p.pitcher_hr9, null) : null,
        pWhip: p ? n(p.pitcher_whip, null) : null,
        pL3Whip: p ? n(p.pitcher_l3_whip, null) : null,
        pL3Hr9: p ? n(p.pitcher_l3_hr9, null) : null,
        pWhipSide: p
          ? (String(p.bats || '').toUpperCase().startsWith('L')
              ? n(p.pitcher_whip_vs_lhb, n(p.pitcher_whip, null))
              : n(p.pitcher_whip_vs_rhb, n(p.pitcher_whip, null)))
          : null,
        pHH: p ? (() => {
          const v = n(p.pitcher_hardhit_allowed, null)
          return v == null ? null : (v <= 1 ? v * 100 : v)
        })() : null,
        pK9: p ? n(p.pitcher_k9, null) : null,
        pLuck: p ? n(p.pitcher_hr_luck, null) : null,
      }
    })
  }, [results, players])

  // Every starter with at least one weak lineup slot the opposing order fills.
  const weakSpots = useMemo(() => {
    return groupPitchers(players)
      .map((e, i) => {
        const hit = (e.lineup || []).filter((b) => b.weak_spot_flag)
        if (!hit.length) return null
        return {
          _key: e.pitcher_id ?? e.pitcher_name ?? i,
          pitcher: clean(e.pitcher_name, 'Unknown'),
          hr9: n(e.pitcher_hr9, 0),
          spots: hit.map((b) => b.lineup_spot).filter((x) => x != null).join(', '),
          hitters: hit.map((b) => b.name).join(', '),
          damage: Math.max(...hit.map((b) => n(b.raw?.pitcher_spot_damage_score, 0)), 0),
        }
      })
      .filter(Boolean)
  }, [players])

  // ── how the air is playing, one game per game_pk (2026-08-16) ────────────
  // The Park column at the far right of the board carries the factor per
  // hitter, and the ranked ladder with weather lives on Power — but the page
  // opened with no statement of whether tonight is a carrying slate at all.
  // airVerdict only speaks when temp, wind direction and park agree strongly
  // enough to claim something, and returns '' otherwise, so a neutral night
  // counts as neither. Counted, never averaged: k of n, with n stated.
  const airRead = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk ?? `${teamOf(p)}-${oppOf(p)}`
      if (!seen.has(pk)) seen.set(pk, p)
    })
    const rows2 = [...seen.values()]
    const carrying = rows2.filter((p) => airVerdict(p) === 'carrying')
    const dead = rows2.filter((p) => airVerdict(p) === 'dead')
    return { games: rows2.length, carrying, dead }
  }, [players])

  if (!players.length) return <Empty text="No players yet." />

  const lit = (k) => rows.filter((r) => r[k]).length

  // ── SECTION ORDER (2026-08-08 rearrange): live first when live ──────────
  // Pre-game the page reads top-down as a plan: how to read it → the picks →
  // the pulse. Once games are live it reads as a broadcast: the wire and
  // who's gone yard jump to the top, and the orientation panels step back.
  // Heavy panels (storylines, weak spots, and gone-yard pre-live) collapse
  // by default so the first screen is calm — everything is one click deep,
  // nothing is gone.
  const liveNow = results?.live_mode === true

  // Fold now lives at module scope, above this function — see the long
  // comment there for why that fixes the "closes when it refreshes" bug.

  const secStart = <StartHere key="start" onNavigate={onNavigate} />
  const secWire = <LiveWire key="wire" players={players} mode={mode} results={results} watchIds={watchIds} odds={odds} onPlayerClick={onPlayerClick} />
  const secPulse = <SlatePulse key="pulse" players={players} slateDate={slateDate} backtest={backtest} onPlayerClick={onPlayerClick} />
  const secPicks = <BotPicksStrip key="picks" players={players} onPlayerClick={onPlayerClick} />
  // 🧱 NEAR MISSES replaced Storylines AND the slate-strength fold here
  // (2026-08-15, Donovan, this page only: "take storylines off and put near
  // misses from players who haven't gone yard in 2+ games, and statcast
  // when... the tonight's board one you can just remove"). Storylines still
  // lives on Home and in every game's deep dive; SlateStrength still renders
  // inside Boards. This page is the one you watch between innings, and the
  // between-innings question is who's been hitting homers without getting
  // one — that's the drought most likely to end tonight.
  // ── CLOSED BY DEFAULT ON THIS PAGE (2026-08-18, second flow pass) ────────
  // Donovan, again, today: "rearrange the rundown page to flow better."
  // These two used to force `open` — reasonable back when they were a few
  // lines each, wrong now: the SAME day's earlier work gave Near Misses a
  // distance bar and an expandable spray chart per hitter, and gave Projected
  // Output a full sorted bar chart on top of its podium and heat table. Two
  // small panels became two tall ones, and the page's own stated headline
  // — "every hitter, one sortable table" — was buried under both of them
  // PLUS the wire, the homer block and the picks before a reader ever saw a
  // single row of the actual board. Nothing is removed — see the counts
  // below, computed off the same helpers the open panels use, so a closed
  // fold still states its headline fact instead of hiding it behind a click.
  const nearCount = useMemo(() => nearMissRows(players).length, [players])
  const secNear = (
    <Fold key="near" label={`🧱 Near misses (${nearCount}) — the contact that says one's coming`}>
      <NearMisses players={players} onPlayerClick={onPlayerClick} />
    </Fold>
  )
  // 📈 PROJECTED OUTPUT, MOVED HERE FROM GAMES (2026-08-18). Donovan: "put the
  // projected output on the scoreboard page" — Games is a per-game browsing
  // tool, and this is a slate-wide check ("did the model see what I'm looking
  // at"), which belongs beside the rest of this page's whole-board panels
  // rather than at the foot of a card grid it has nothing to do with.
  // groupGames() is the same helper Games.js used to build its own `games`
  // prop — imported fresh here rather than threaded through as a prop, since
  // Scoreboard already receives the flat `players` list this page is built
  // from and grouping it is a one-line memo, not new data.
  const projGames = useMemo(() => groupGames(players), [players])
  const projHr = useMemo(() => slateProjHr(players), [players])
  const secProjected = (
    <Fold key="projected" label={`📈 Projected output — ${projHr != null ? `${projHr.toFixed(1)} HR projected slate-wide` : "the slate's expected count"}`}>
      <ProjectedOutput games={projGames} players={players} />
    </Fold>
  )
  // 🧾 the ledger builds through the night — lives with the live layer.
  // 2026-08-13: passes `results` now instead of HomerLedger fetching its own
  // copy of the identical payload — see the note in HomerLedger.js.
  const secLedger = <HomerLedger key="ledger" players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} />
  // Does the slate carry an HR-luck reading at all tonight? See the note on
  // the column below — the field ships zero-filled and a zero-filled column
  // reads as a finding.
  const hasLuck = goneYard.some((r) => Number.isFinite(r.pLuck) && r.pLuck !== 0)
  const goneTable = goneYard.length > 0 && (
    <Tracker
      title="💥 Gone yard"
      count={goneYard.length}
      answers="is the model seeing tonight coming? Every homer already hit, next to where this board had that hitter ranked."
      note={`${goneYard.filter((r) => r.rank && r.rank <= 15).length} of ${goneYard.length} came from the top 15 of the board.`}
    >
      <DenseTable
        rows={goneYard}
        columns={[
          { key: 'rank', label: 'Board', heat: false, w: 46, mono: true, dim: true,
            fold: true, foldLabel: 'board',
            fmt: (v) => (v == null ? '—' : `#${v}`) },
          { key: 'name', label: 'Player', heat: false, w: 132, bold: true, sticky: true },
          { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true,
            fold: true, foldLabel: false },
          // explicit: here "HR" is homers hit TONIGHT, not the HR score the
          // glossary would otherwise attach to that label
          { key: 'hr',   label: 'HR',     w: 34,
            explain: 'How many home runs he has already hit tonight.' },
          { key: 'score', label: 'HR score', w: 58, dp: 1, scale: 'seq', domain: [0, 100], primary: true },
          { key: 'role', label: 'Role',   heat: false, w: 78, dim: true,
            fold: true, foldLabel: false },
          // ── the arm he did it against ──────────────────────────────────
          { key: 'pName',  label: 'Arm',     heat: false, w: 120, dim: true,
            fold: true, foldLabel: 'off' },
          { key: 'pHr9',   label: 'HR/9',    w: 50, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
            anchorLabel: `league ${LG.hr9.toFixed(2)}`,
            title: `Homers allowed per nine, against a league mark of ${LG.hr9.toFixed(2)}. ▲ he was already giving them up.` },
          { key: 'pL3Hr9', label: 'L3 HR/9', w: 58, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
            anchorLabel: `league ${LG.hr9.toFixed(2)}`,
            title: 'Homers per nine over his last three starts — the recent version of the column beside it. Where it runs above the season figure, the arm was trending into this.' },
          { key: 'pWhip',  label: 'WHIP',    w: 50, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: `Walks and hits per inning, against a league mark of ${LG.whip.toFixed(2)}.` },
          // A WHIP of exactly 0.00 over three starts is not a measurement,
          // it is a gap in the feed — one starter on tonight's slate carries
          // it. Blank rather than drawn as the best WHIP on the board.
          { key: 'pL3Whip', label: 'L3 WHIP', w: 58, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: 'WHIP over his last three starts.' },
          { key: 'pWhipSide', label: 'WHIP side', w: 64, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: 'His WHIP against the hand THIS hitter bats from — the weakness that was actually on the field for this homer, rather than the aggregate. Falls back to overall WHIP when the split is not published.' },
          { key: 'pHH',    label: 'HH%',     w: 50, dp: 1, scale: 'div', anchor: LG.hardHit, ceiling: 12,
            anchorLabel: `league ${LG.hardHit.toFixed(1)}%`,
            title: `Hard-hit rate allowed, against a league mark of ${LG.hardHit.toFixed(1)}%.` },
          { key: 'pK9',    label: 'K/9',     w: 48, dp: 2, scale: 'div', anchor: LG.k9, ceiling: 3, invert: true,
            anchorLabel: `league ${LG.k9.toFixed(2)}`,
            title: `Strikeouts per nine, against a league mark of ${LG.k9.toFixed(2)}. Inverted — cool is the dangerous arm, because missing bats is what stops this from happening.` },
          // ── HR LUCK RENDERS ONLY IF IT HAS ANYTHING TO SAY ──────────────
          // pitcher_hr_luck is published on every row and is 0.00 for ALL 30
          // starters on tonight's slate — the field exists, the data does not.
          // A column of "0.00 ·" is worse than no column: it looks measured.
          // It appears the day the bot starts filling it and not before.
          ...(hasLuck ? [{
            key: 'pLuck', label: 'HR luck', w: 58, dp: 2, scale: 'div', anchor: 0, ceiling: 6,
            anchorLabel: '0 (homers matching contact)',
            title: 'Homers allowed against what his contact profile deserved. ▲ he had been giving up more than his contact says he should; ▼ he had been getting away with it, and tonight is the correction.',
          }] : []),
        ]}
        onRowClick={onPlayerClick}
        initialSort="score"
        heatMode="sorted"
        maxHeight={280}
        caption="Every homer already hit tonight, next to where this board had the hitter — and the line the arm was carrying into it. The pitcher columns are drawn against league marks, so ▲ means he was already worse than average at that and ▼ means he was better. Two columns from the ask are not here, and both on purpose: there is no last-three-starts K/9 in the payload (L3 covers ERA, WHIP and HR/9 only), and HR luck ships zero-filled for every starter tonight — it appears the day it carries a reading. Inventing either from the season figure would be a number that looks measured and is not."
      />
    </Tracker>
  )
  // Live: who's gone yard is the news — it renders open, right under the
  // wire. Pre-live (or an empty list) it stays out of the way.
  const secGone = goneYard.length > 0 && (
    liveNow
      ? <div key="gone" style={{ marginBottom: 14 }}>{goneTable}</div>
      : <Fold key="gone" label={`💥 Gone yard (${goneYard.length}) — tonight's homers vs where the board had them`}>{goneTable}</Fold>
  )
  const secWeak = weakSpots.length > 0 && (
    <Fold key="weak" label={`★ Weak spots (${weakSpots.length}) — the arms with reachable soft spots tonight`}>
      <Tracker
        title="★ Weak spots"
        count={weakSpots.length}
        answers="which starters have a soft lineup slot tonight, and which hitters are standing in it."
        note="Damage is how hard that pitcher gets hit in those spots. Sorted hardest first."
      >
        <DenseTable
          rows={weakSpots}
          columns={[
            { key: 'pitcher', label: 'Pitcher', heat: false, w: 126, bold: true },
            { key: 'hr9',     label: 'HR/9',    w: 44, dp: 2 },
            { key: 'spots',   label: 'Spots',   heat: false, w: 54, mono: true, dim: true },
            { key: 'hitters', label: 'Hitters', heat: false, w: 190, dim: true },
            { key: 'damage',  label: 'Damage',  w: 52, dp: 1 },
          ]}
          initialSort="damage"
          maxHeight={260}
          caption=""
        />
      </Tracker>
    </Fold>
  )

  // ── RUNNING ORDER (2026-08-16 flow pass; see the note above the imports) ──
  //
  // Live — the page is a broadcast, and the lead is what just happened:
  //   wire → THE HOMER BLOCK (gone yard, the ledger, the near misses that
  //   nearly joined them) → how to read this → the picks → the picks' own
  //   clock and what changed since yesterday → weak spots → the board.
  //
  // Pre-game — the page is a plan, and the lead is THE FOUR:
  //   how to read this → THE FOUR → the picks' clock + yesterday's diff →
  //   near misses → the wire (renders nothing until something is live) →
  //   the homer block → weak spots → the board.
  //
  // Two rules drive both: panels read together sit together (gone yard beside
  // the ledger; the pick strip beside the unconfirmed countdown that is about
  // those same picks), and reference sits below what it supports (weak spots
  // immediately above the board whose ★ column it lists).
  //
  // StartHere sits directly above the pick strip in BOTH orders now. It used
  // to be last in live mode, where its own first step — "The Four, right
  // below" — pointed at the bottom of the page. It is self-dismissing and
  // collapses to a single "?" chip once you've read it, so it costs a
  // returning visitor one line.
  // ── THE FOUR LEADS. ASKED FOR REPEATEDLY (2026-08-17) ─────────────────────
  // Donovan: "how hard is it to put the four at the top of the scoreboard like
  // ive asked you to rearrange alot of the site to flow better you didnt do
  // that."
  //
  // It was second in both orders, behind StartHere — a self-dismissing
  // explainer — and in live mode behind three more blocks. The page's own
  // StartHere text says "Tonight's picks is The Four, immediately below", so
  // the explainer was pointing at something that was not immediately below.
  // The picks go first. StartHere follows them, which is also where an
  // explainer belongs: after the thing it explains, for the reader who wants it.
  //
  // ── THIRD FLOW PASS (2026-08-18): THE ORDER WASN'T THE PROBLEM ANYMORE ──
  // Donovan, again: "rearrange the rundown page to flow better." The order
  // below already matches the two rules stated above and hasn't changed
  // this round — what changed is that Near Misses and Projected Output each
  // grew a real chart earlier today (a distance bar + expandable spray field;
  // a full sorted bar chart), so the SAME order now reads as a much longer
  // wall before the page's own promised centerpiece — "every hitter, one
  // sortable table" — at the foot of the page. Reordering again would have
  // been the fourth attempt at the same knob; the actual fix was weight, so
  // those two now default CLOSED with their headline number stated right on
  // the fold (see where they're built, above) instead of force-open. Gone
  // yard stays open live — it's the moment's actual news, not analysis.
  const order = liveNow
    ? [secPicks, secWire, secGone, secLedger, secNear, secProjected, secStart, secPulse, secWeak]
    : [secPicks, secStart, secPulse, secNear, secProjected, secWire, secGone, secLedger, secWeak]

  return (
    <div>
      <PanelTitle
        title="Rundown"
        sub={`${rows.length} batters on the board${alignedOnly ? ' (aligned only — the filter is on)' : ''}${liveNow ? ' · live — the wire and tonight’s homers lead' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {alignedCount > 0 && (
              <button
                onClick={() => setAlignedOnly((v) => !v)}
                title="Weak-spot + pitch-match + real recent contact quality all stacking together"
                style={btnStyle(C.purple, alignedOnly)}
              >
                ◆ Aligned only ({alignedCount})
              </button>
            )}
            {/* The Park column below gives you the raw factor per hitter; the
                ranked board with weather, wind, rain and first pitch lives on
                Power. A link, not a second copy of the board — this page
                already carries seven panels. */}
            {onNavigate && (
              <button
                onClick={() => onNavigate('longest')}
                title="Tonight's parks ranked — park factor plus weather, wind, rain risk and first pitch, on the Power tab"
                style={btnStyle(C.orange, false)}
              >
                🏟 Parks ranked →
              </button>
            )}
          </div>
        }
      />

      {/* ── THE SLATE, STATED (2026-08-16) ──────────────────────────────────
          What stood here was the header's own sub-line: "266 batters · ★12
          weak spot · ◆9 aligned · ▲41 matchup edge". Four counts in a glyph
          code you have to already know, above a page that then opened on a
          four-tile orientation strip. Same four counts, plus the two facts the
          page never stated out loud — how the air is playing tonight, and how
          many balls have already gone — as one sentence that names each mark
          as it uses it. Every mark still has its own column on the board
          below, and each count keeps its denominator. */}
      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.7, margin: '0 0 12px', maxWidth: 760 }}>
        <b style={{ color: C.text, fontFamily: NUM_FONT }}>{rows.length}</b> hitters
        {alignedOnly ? ' pass the ◆ aligned filter' : ' are on tonight’s board'}, across{' '}
        <b style={{ color: C.text, fontFamily: NUM_FONT }}>{airRead.games}</b> games.{' '}
        <span title="Weak spot: this pitcher has been hurt by the lineup slot this hitter is standing in. The validated flag — 18.0% vs 13.9% — and its own ★ column on the board.">
          <b style={{ color: C.text, fontFamily: NUM_FONT }}>{lit('weak')}</b> of them stand in a
          ★ weak lineup spot against tonight&apos;s arm
        </span>,{' '}
        <span title="Aligned: weak spot, pitch-type match and real recent contact quality all stacking on the same hitter. Its own ◆ column, and the filter button above.">
          <b style={{ color: C.purple, fontFamily: NUM_FONT }}>{lit('aligned')}</b> are ◆ aligned
        </span>{' '}and{' '}
        <span title="Matchup edge: the hitter bats from the side this pitcher is weakest against. Its own ▲ column on the board.">
          <b style={{ color: C.text, fontFamily: NUM_FONT }}>{lit('edge')}</b> hold the ▲ handedness edge
        </span>.{' '}
        {/* The air, spoken by lib/conditions. Silent when no game is strong
            enough either way — a neutral slate is a finding, not a gap. */}
        {(airRead.carrying.length > 0 || airRead.dead.length > 0) && (
          <>
            {airRead.carrying.length > 0 && (
              <>The air is carrying in{' '}
                <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{airRead.carrying.length} of {airRead.games}</b>{' '}
                games —{' '}
                {airRead.carrying.slice(0, 2).map((p, i) => (
                  <span key={i} title={airParts(p).map((x) => `${x.text} — ${x.title}`).join('\n')} style={{ cursor: 'help' }}>
                    {i > 0 && '; '}
                    <b style={{ color: C.text }}>{clean(p?.venue_name, `${teamOf(p)} vs ${oppOf(p)}`)}</b>
                    {airParts(p).length > 0 && <span style={{ color: C.text3 }}> ({airParts(p).map((x) => x.text).join(', ')})</span>}
                  </span>
                ))}
                {airRead.carrying.length > 2 && <span style={{ color: C.text3 }}> and {airRead.carrying.length - 2} more</span>}
                {airRead.dead.length > 0 ? ', and ' : '. '}
              </>
            )}
            {airRead.dead.length > 0 && (
              <>{airRead.carrying.length > 0 ? 'playing dead in ' : 'The air is playing dead in '}
                <b style={{ color: C.blue, fontFamily: NUM_FONT }}>{airRead.dead.length} of {airRead.games}</b>
                {airRead.carrying.length > 0 ? '. ' : ' games. '}
              </>
            )}
          </>
        )}
        {goneYard.length > 0 && (
          <>
            <b style={{ color: C.green, fontFamily: NUM_FONT }}>{goneYard.length}</b> ball
            {goneYard.length === 1 ? ' has' : 's have'} already left the yard tonight, and{' '}
            <b style={{ color: C.green, fontFamily: NUM_FONT }}>
              {goneYard.filter((r) => r.rank && r.rank <= 15).length} of {goneYard.length}
            </b>{' '}
            came from the top 15 of this board — Gone yard has the full list against its ranks.{' '}
          </>
        )}
        <span style={{ color: C.text3 }}>
          {liveNow
            ? 'Live: the wire and tonight’s homers lead, the picks and the plan sit under them.'
            : 'The Four — the bot’s headline pick per category, three deep — leads below; the full board is at the foot of the page.'}
        </span>
      </div>

      {order}

      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, margin: '4px 0 8px', maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> who to look at first tonight. It&apos;s
        every hitter on the slate, sorted by home-run score — <b style={{ color: C.text2 }}>you can
        use the order without reading a single column</b>. Sort by any other header to ask a
        different question (Hit for contact plays, Park for launch pads, K risk for the ones likely
        to strike out), and click any row to open that hitter.{' '}
        <b style={{ color: C.text2 }}>Don&apos;t know what a column means? Tap the ⓘ next to its
        name</b> — it says so in plain English, no baseball background needed.
      </div>

      {/* Why a name is on this board twice, answered before it is asked.
          A sentence, not a symbol legend — the question is about the schedule.
          Empty on every ordinary slate, so nothing renders and nothing is
          explained that isn't happening. */}
      {dhNote && (
        <div style={{
          fontSize: 10.5, color: C.text3, lineHeight: 1.65, maxWidth: 820,
          margin: '0 0 8px',
        }}>
          ⚾⚾ {dhNote}
        </div>
      )}

      <DenseTable
        rows={rows}
        columns={buildColumns(onWatch, dh.size > 0)}
        onRowClick={onPlayerClick}
        initialSort="hr"
        heatMode="sorted"
        maxHeight={640}
        caption={"Colour answers three questions here and nothing else. Model scores — HR, Damage, PMatch, HRR, Hit, RBI, Run, TB, HRW, Due, Long, PMix, K risk — are drawn on a stated 0–100, which is why their headers say /100: they order hitters, they are not probabilities. AVG, OBP, vs Hand, K%, P HR/9 and Park are drawn against a league mark, so ▲ means above it and ▼ below, and a hitter sitting on league reads blank because that is not a finding. Counts (375+, P375, P400) and IHR print plain. Every other column lights up when you sort by it. K% and K risk run cool-is-good, because striking out more than league is the bad side of that line. Click a header to sort, a row to open the hitter."}
      />
    </div>
  )
}
