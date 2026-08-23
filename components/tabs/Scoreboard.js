'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n, clean,
  recent375, ihrVal,
  hrScore, hitScore, prodScore, tbScore, pitchMixScore, playerId, mlbId,
} from '../../lib/player'
import { tierRole, shortRole, isAligned, hrRank } from '../../lib/scoring'
import { designationOf } from '../../lib/verdict'
import { gameNumbers, gameNumOf, doubleheaderNote } from '../../lib/doubleheader'
import { PanelTitle, Empty, btnStyle, WhatThis } from '../ui'
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
import { DIV_FIELD } from '../../lib/scales'

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

// ── ANCHORS (2026-08-22) ────────────────────────────────────────────────────
//
// A batting average is not a magnitude; it is a distance from what everybody
// else does. Drawn on the sequential ramp against the slate's own min/max, a
// .251 hitter on a night of good bats came out black and a .251 hitter on a
// night of bad ones came out bright — the same number, two opposite readings,
// and neither of them the one that matters.
//
// TWO KINDS OF ANCHOR, AND THE DIFFERENCE IS NOT COSMETIC.
//
// LG holds real league marks — numbers I can defend independently of this
// payload, for stats whose definition is standard (AVG, OBP, ISO, SLG, ERA,
// WHIP, K/9, K%, BB%, HR/9, hard-hit, exit velocity, swinging strikes).
//
// TYPICAL holds the observed centre of a PUBLISHED FIELD whose denominator the
// payload does not state, so the textbook league figure does not apply to it.
// Measured across the live slate on 2026-08-22 and recorded with what was seen,
// because an anchor nobody can check is worse than no anchor:
//
//   pitcher_barrel_allowed       median 3.8   (range 0.0–8.4)   textbook ~8%
//   pitcher_fb_rate              median 26.0  (range 19.4–47.3) textbook ~36%
//   pitcher_pullair_allowed_pct  median 25.5  (range 17.3–33.3)
//   recent_barrel_rate (batter)  median 4.2   (range 0–28.6)    textbook ~8%
//
// Three of those are half the textbook value, which means the field is not
// counting what the textbook counts — a different denominator, almost
// certainly per plate appearance rather than per batted ball. Anchoring them
// at 8% would have painted almost the whole column cool and called every arm
// on the slate stingy. The tooltips on those columns say "typical", not
// "league", so the claim on screen matches the claim in the code.
//
// Recheck these when the bot's definitions change; nothing else here moves.
const LG = {
  avg: 0.245,
  obp: 0.315,
  iso: 0.160,      // slugging minus average
  slg: 0.405,
  hrPa: 0.032,     // homers per plate appearance
  bbRate: 8.5,     // %
  ev: 89.0,        // average exit velocity, mph
  kRate: 22.0,     // %
  hr9: 1.15,       // homers allowed per nine
  era: 4.10,
  whip: 1.28,      // walks + hits per inning
  hardHit: 39.0,   // % of batted balls hit hard
  evAllowed: 89.0,
  swStr: 11.0,     // % swinging strikes
  k9: 8.60,        // strikeouts per nine
  park: 1.00,      // a neutral building
}

// ── WHICH WAY IS WARM ───────────────────────────────────────────────────────
//
// One convention across the site: WARM IS GOOD FOR THE BAT. A diverging column
// sets `invert: true` ONLY when the good-for-the-bat side is the LOW side.
//
//   no invert   P ERA, P WHIP, P HR/9, P HH%, P FB%, P Brl%, P EV ag,
//               P PullAir% — a leaky arm is a hitter's friend, so above the
//               mark is warm.
//   invert      K% (his own), K risk, P K/9, P SwStr% — missing bats is what
//               stops a homer, so above the mark is cool.
//
// THE FIRST VERSION OF THIS PASS HAD THE WHOLE PITCHER BLOCK BACKWARDS, and
// only a screenshot caught it: sorting by P WHIP put a 1.48 arm — twenty
// points worse than league, exactly the arm you want — at the top of the board
// in cool blue, while the tooltip under it read "warm means he puts men on".
// The sort was right and the colour argued with it. Neither the build nor any
// of the three checkers can see that; it is only visible rendered.

// Observed centres of published fields whose denominator is not stated. See
// the note above — these are labelled "typical" on screen, never "league".
const TYPICAL = {
  barrel: 4.2,     // recent_barrel_rate, batter side
  pBarrel: 3.8,    // pitcher_barrel_allowed
  pFbRate: 26.0,   // pitcher_fb_rate
  pPullAir: 25.5,  // pitcher_pullair_allowed_pct
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
  { key: 'team',    label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
  ...(dhOn ? [DH_COLUMN] : []),
  { key: 'opp',     label: 'Opp',    heat: false, w: 34, mono: true, dim: true },
  { key: 'role',    label: 'Role',   heat: false, w: 104, dim: true },
  { key: 'spot',    label: 'Spot',   heat: false, w: 40, mono: true, dim: true,
    fmt: (v) => (v == null ? '—' : String(v)) },
  { key: 'weak',    label: '★',      flag: true, mark: '★', w: 32 },
  { key: 'aligned', label: '◆',      flag: true, mark: '◆', w: 32 },
  { key: 'edge',    label: '▲',      flag: true, mark: '▲', w: 32 },

// ── WHY EVERY SCORE COLUMN DIVERGES AGAINST TONIGHT'S FIELD ─────────────────
//
// Donovan, 2026-08-22, pointing at the AVG column: make that the site's
// colour scheme, put it on all the other scoring, and show the arrows on the
// scoring too "when it's valid."
//
// AVG could diverge because it has a stated zero — the league mark. A 0-100
// model score has no league mark and never will; the only honest zero it has
// is the middle of the slate you are actually choosing from tonight. That is
// what `anchor: DIV_FIELD` resolves to, from the rows on screen, and it is
// still not a probability: it says "above the middle of tonight's board",
// which is a comparison, not a claim about how often the ball leaves.
//
// `domain` stays declared on every one of them. It is the fallback: when the
// field is too small or too flat to anchor honestly (fewer than eight rows, a
// dead spread), lib/scales.js hands back null, the column paints its plain
// sequential fill and NO ARROW IS DRAWN. That is the "when it's valid".
//
// The arrow always points the way the number went. `invert` flips which end
// is warm, never the arrow — see the WHICH WAY IS WARM block below.
  // The board's lead. `primary` keeps it lit whatever you sort by, because
  // "how does this hitter's HR score compare" is the question the page is for
  // and losing it while you sort by something else would cost the through-line.
  { key: 'hr',      label: 'HR',     w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true },
  { key: 'dmg',     label: 'Damage', w: 54, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  // NOT A 0-100 SCORE, and it was sitting between six that are. Measured on
  // the live slate 2026-08-22: pitch_type_match_score runs 0 to 120 with a
  // MEDIAN OF ZERO — 25 of 269 rows clear 100 outright. Drawn against [0,100]
  // it would clip a fifth of the column at full brightness and read as "these
  // are maxed", and drawn against the slate min/max it would make the median
  // hitter's ZERO look like a low score rather than an absence. So: its own
  // stated domain, its own /120 in the header, and the tooltip says the zero
  // out loud.
  { key: 'pmatch',  label: 'PMatch', w: 58, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 120],
    // A zero here is an ABSENCE — no pitch match was found — not the worst
    // match on the board, and the median hitter has one. Painted, it turned
    // half the column into a wall of near-black that read as failure.
    blankWhen: (v) => !(v > 0),
    fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(1) : '—'),
    title: 'Pitch-type match: how well tonight’s starter’s mix lines up with what this hitter punishes. Runs 0–120, not 0–100. A dash means no match was found — which is most of the slate — not a bad match.' },
  { key: 'hrr',     label: 'HRR',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'hit',     label: 'Hit',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
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
  { key: 'rbiScore', label: 'RBI',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'A composite RBI-production read: season RBI rate, lineup spot (peaks at the 4-hole), tonight\'s matchup average, and recent RBI form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'runScore', label: 'Run',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'A composite run-production read: season run rate, lineup spot (peaks at the 1-2 hole), season OBP, and recent run form. Not a bot field, not calibrated — a transparent blend, same caveat as K risk.' },
  { key: 'tb',      label: 'TB',     w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'hrw',     label: 'HRW',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
    title: 'The HR-window score. The 🌋 🚀 ⚡ 🌤️ 🧊 band on a hitter card is this number — see lib/hrwBand.js.' },
  { key: 'due',     label: 'Due',    w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'longest', label: 'Long',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
  { key: 'pmix',    label: 'PMix',   w: 48, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100] },
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
  { key: 'kRisk',  label: 'K risk', w: 54, dp: 0, invert: true, scale: 'div', anchor: DIV_FIELD, domain: [0, 100],
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

  // ══ MORE STATS (2026-08-22) ══════════════════════════════════════════════
  //
  // Donovan: "I just wanted more stat columns added."
  //
  // Grouped the way he asked for on the Games tab — recent form, season line,
  // the split that matches tonight's arm, statcast, then the pitcher — and
  // every one of them sortable, which is the point ("I like all those stats
  // to sort by"). All published on the slate row already.
  //
  // They print PLAIN and light up when you sort by them. The ones carrying a
  // `div` scale are the ones with a real league mark behind them, so sorting
  // by P WHIP tells you not just the order but which side of average each arm
  // is on. Counts have no league mark and no midpoint, so they stay numbers.

  // ── recent form ──────────────────────────────────────────────────────────
  { key: 'l5hr',   label: 'L5 HR',   w: 46,
    title: 'Home runs in his last five games.' },
  { key: 'l10hr',  label: 'L10 HR',  w: 50,
    title: 'Home runs in his last ten games.' },
  { key: 'l5h',    label: 'L5 H',    w: 44,
    title: 'Hits in his last five games.' },
  { key: 'drought', label: 'Drought', w: 54,
    title: 'Games since his last home run. Read it next to HR/PA — a long drought on a bat with no power is not a drought, it is who he is.' },

  // ── the season line ──────────────────────────────────────────────────────
  { key: 'sznHr',  label: 'Szn HR',  w: 52,
    title: 'Home runs this season.' },
  { key: 'pa',     label: 'PA',      w: 44,
    title: 'Season plate appearances — the denominator under HR/PA, ISO and SLG.' },
  { key: 'iso',    label: 'ISO',     w: 48, dp: 3, scale: 'div', anchor: LG.iso, ceiling: 0.100,
    anchorLabel: `league ${LG.iso.toFixed(3).replace(/^0/, '')}`,
    title: `Isolated power — slugging minus average, against a league mark of ${LG.iso.toFixed(3).replace(/^0/, '')}. The archive's strongest single HR predictor: sub-.130 bats homered 8.2% of the time, .230+ homered 22.2%.` },
  { key: 'slg',    label: 'SLG',     w: 48, dp: 3, scale: 'div', anchor: LG.slg, ceiling: 0.130,
    anchorLabel: `league ${LG.slg.toFixed(3).replace(/^0/, '')}`,
    title: `Season slugging, against a league mark of ${LG.slg.toFixed(3).replace(/^0/, '')}.` },
  { key: 'hrPa',   label: 'HR/PA',   w: 52, dp: 3, scale: 'div', anchor: LG.hrPa, ceiling: 0.030,
    anchorLabel: `league ${LG.hrPa.toFixed(3).replace(/^0/, '')}`,
    title: `Home runs per plate appearance — his own rate, against a league mark of ${LG.hrPa.toFixed(3).replace(/^0/, '')}. This is a measured frequency; its denominator is the PA column.` },
  { key: 'bb',     label: 'BB%',     w: 46, dp: 1, scale: 'div', anchor: LG.bbRate, ceiling: 5,
    anchorLabel: `league ${LG.bbRate.toFixed(1)}%`,
    title: `Walk rate, against a league mark of ${LG.bbRate.toFixed(1)}%. High walks means fewer swings, which cuts both ways on a homer board.` },

  // ── the split that matches tonight's arm ─────────────────────────────────
  { key: 'isoHand', label: 'ISO vs hand', w: 64, dp: 3, scale: 'div', anchor: LG.iso, ceiling: 0.100,
    anchorLabel: `league ${LG.iso.toFixed(3).replace(/^0/, '')}`,
    title: "His isolated power against the hand tonight's starter actually throws (iso_vs_lhp or iso_vs_rhp). Falls back to season ISO when the split or the pitcher's hand is missing — the power twin of the vs Hand column." },

  // ── statcast ─────────────────────────────────────────────────────────────
  { key: 'ev',     label: 'EV',      w: 46, dp: 1, scale: 'div', anchor: LG.ev, ceiling: 4,
    anchorLabel: `league ${LG.ev.toFixed(1)}`,
    title: `Recent average exit velocity, against a league mark of ${LG.ev.toFixed(1)} mph.` },
  { key: 'brl',    label: 'Brl%',    w: 48, dp: 1, scale: 'div', anchor: TYPICAL.barrel, ceiling: 6,
    anchorLabel: `typical ${TYPICAL.barrel.toFixed(1)}%`,
    title: `Recent barrel rate, against a TYPICAL ${TYPICAL.barrel.toFixed(1)}% — the middle of what this field actually publishes, not the textbook 8% barrel rate, because the payload does not state this one's denominator. Blank where the bot has not tracked enough batted balls to publish one.` },
  { key: 'd350',   label: '350+%',   w: 52, dp: 0,
    title: 'Share of his tracked batted balls travelling 350+ ft. A rate, so it survives a small sample better than a raw count — the denominator is recent_350_den.' },

  // ── the arm ──────────────────────────────────────────────────────────────
  { key: 'pEra',   label: 'P ERA',   w: 50, dp: 2, scale: 'div', anchor: LG.era, ceiling: 2,
    anchorLabel: `league ${LG.era.toFixed(2)}`,
    title: `Tonight's starter's earned run average, against a league mark of ${LG.era.toFixed(2)}. Warm is the arm that gives runs up, which is the good side for the bat.` },
  { key: 'pWhip',  label: 'P WHIP',  w: 54, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
    anchorLabel: `league ${LG.whip.toFixed(2)}`,
    title: `Walks and hits per inning allowed, against a league mark of ${LG.whip.toFixed(2)}. Warm means he puts men on.` },
  { key: 'pK9',    label: 'P K/9',   w: 50, dp: 2, scale: 'div', anchor: LG.k9, ceiling: 3, invert: true,
    anchorLabel: `league ${LG.k9.toFixed(2)}`,
    title: `Strikeouts per nine, against a league mark of ${LG.k9.toFixed(2)}. Inverted, so cool is the dangerous arm: missing bats is what stops a homer.` },
  { key: 'pHH',    label: 'P HH%',   w: 52, dp: 1, scale: 'div', anchor: LG.hardHit, ceiling: 12,
    anchorLabel: `league ${LG.hardHit.toFixed(1)}%`,
    title: `Hard-hit rate he allows, against a league mark of ${LG.hardHit.toFixed(1)}%. Warm is the arm that gets squared up.` },
  { key: 'pFB',    label: 'P FB%',   w: 50, dp: 1, scale: 'div', anchor: TYPICAL.pFbRate, ceiling: 9,
    anchorLabel: `typical ${TYPICAL.pFbRate.toFixed(1)}%`,
    title: `Fly balls he allows, against a TYPICAL ${TYPICAL.pFbRate.toFixed(1)}% — measured off this field rather than assumed. Warm is the arm that supplies air, and distance needs air under it.` },
  { key: 'pBrl',   label: 'P Brl%',  w: 52, dp: 1, scale: 'div', anchor: TYPICAL.pBarrel, ceiling: 4,
    anchorLabel: `typical ${TYPICAL.pBarrel.toFixed(1)}%`,
    title: `Barrel rate he allows, against a TYPICAL ${TYPICAL.pBarrel.toFixed(1)}% — the middle of tonight's thirty starters, not the textbook 8%, because this field's denominator is not stated. Warm is the arm that gives up barrels, which is the contact that actually leaves.` },
  { key: 'pEV',    label: 'P EV ag', w: 54, dp: 1, scale: 'div', anchor: LG.evAllowed, ceiling: 4,
    anchorLabel: `league ${LG.evAllowed.toFixed(1)}`,
    title: `Average exit velocity he gives up, against a league mark of ${LG.evAllowed.toFixed(1)} mph. Warm is the arm hit hardest.` },
  { key: 'pSw',    label: 'P SwStr%', w: 58, dp: 1, scale: 'div', anchor: LG.swStr, ceiling: 5, invert: true,
    anchorLabel: `league ${LG.swStr.toFixed(1)}%`,
    title: `Swinging-strike rate, against a league mark of ${LG.swStr.toFixed(1)}%. Inverted, so cool is the dangerous arm — same direction as K/9.` },
  { key: 'pPull',  label: 'P PullAir%', w: 66, dp: 1, scale: 'div', anchor: TYPICAL.pPullAir, ceiling: 7,
    anchorLabel: `typical ${TYPICAL.pPullAir.toFixed(1)}%`,
    title: `How often he concedes pulled air contact — the shortest route over a fence — against a TYPICAL ${TYPICAL.pPullAir.toFixed(1)}%. Warm is the arm that concedes it.` },
  { key: 'pL3Era', label: 'P L3 ERA', w: 58, dp: 2, scale: 'div', anchor: LG.era, ceiling: 2,
    anchorLabel: `league ${LG.era.toFixed(2)}`,
    blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
    title: 'ERA over his last three starts. Read against the season column beside it — a gap either way is the trend.' },
  { key: 'pL3Whip', label: 'P L3 WHIP', w: 62, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
    anchorLabel: `league ${LG.whip.toFixed(2)}`,
    blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
    title: 'WHIP over his last three starts. A 0.00 is a gap in the feed, not a perfect run, so it blanks.' },
  { key: 'pL3Hr9', label: 'P L3 HR/9', w: 62, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
    anchorLabel: `league ${LG.hr9.toFixed(2)}`,
    title: 'Homers per nine over his last three starts, against the same league mark as P HR/9. Where it runs above the season figure, the arm is trending into trouble.' },
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
      {answers && <WhatThis maxWidth={640}>{answers}</WhatThis>}
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
      // THE DESIGNATION LEADS (2026-08-23). Donovan: "i dont see the watch
    // on the role row." This printed the MODEL's tier (Power / Contact /
    // HR Bet) and never the bot's designation — so WATCH, which exists
    // only as a designation, was invisible in every dense table on the
    // site while tonight's slate carried 45 of them. An undesignated bat
    // still gets his tier; nothing was removed.
    role: designationOf(p) || shortRole(p),
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
      // ── MORE STATS TO SORT BY (2026-08-22) ─────────────────────────────
      // Donovan: "I just wanted more stat columns added." Everything here is
      // already on the slate row and was going unread. Grouped the way he
      // asked for on the Games tab and applied here: recent form, the season
      // line, the split that matches tonight's arm, statcast, then the
      // pitcher. Nothing computed, nothing invented — where a field is not
      // published the cell is blank rather than zero-filled.
      l5hr: n(p?.last5_hr, null),
      l10hr: n(p?.last10_hr, null),
      l5h: n(p?.last5_hits, null),
      drought: n(p?.games_since_last_hr, null),
      sznHr: n(p?.season_hr, null),
      pa: n(p?.season_pa, null),
      iso: n(p?.season_iso, null),
      slg: n(p?.season_slg, null),
      hrPa: n(p?.hr_per_pa, null),
      bb: (() => { const v = n(p?.season_bb_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      // The split that matches the hand tonight's starter actually throws —
      // same idea as the vs Hand average already on the board, for power.
      isoHand: (() => {
        const hand = String(p?.pitcher_hand || p?.pitcher_throws || '').toUpperCase()
        const v = hand.startsWith('L') ? n(p?.iso_vs_lhp, null) : n(p?.iso_vs_rhp, null)
        return v == null ? n(p?.season_iso, null) : v
      })(),
      ev: n(p?.recent_ev, null),
      brl: (() => { const v = n(p?.recent_barrel_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      d350: (() => {
        const num = n(p?.recent_350_num, null); const den = n(p?.recent_350_den, 0)
        return num == null || !(den > 0) ? null : (100 * num) / den
      })(),
      pEra: n(p?.pitcher_era, null),
      pWhip: n(p?.pitcher_whip, null),
      pK9: n(p?.pitcher_k9, null),
      pHH: (() => { const v = n(p?.pitcher_hardhit_allowed, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pFB: (() => { const v = n(p?.pitcher_fb_rate, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pBrl: (() => { const v = n(p?.pitcher_barrel_allowed, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pEV: n(p?.pitcher_ev_allowed, null),
      pSw: (() => { const v = n(p?.pitcher_swstr_pct, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pPull: (() => { const v = n(p?.pitcher_pullair_allowed_pct, null); return v == null ? null : (v <= 1 ? v * 100 : v) })(),
      pL3Era: n(p?.pitcher_l3_era, null),
      pL3Whip: n(p?.pitcher_l3_whip, null),
      pL3Hr9: n(p?.pitcher_l3_hr9, null),
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
            fmt: (v) => (v == null ? '—' : `#${v}`) },
          { key: 'name', label: 'Player', heat: false, w: 132, bold: true, sticky: true },
          { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
          // explicit: here "HR" is homers hit TONIGHT, not the HR score the
          // glossary would otherwise attach to that label
          { key: 'hr',   label: 'HR',     w: 34,
            explain: 'How many home runs he has already hit tonight.' },
          { key: 'score', label: 'HR score', w: 58, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true },
          { key: 'role', label: 'Role',   heat: false, w: 104, dim: true },
          // ── the arm he did it against ──────────────────────────────────
          { key: 'pName',  label: 'Arm',     heat: false, w: 120, dim: true },
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
                    {/* CONDITIONS ON THE LEADER ONLY (2026-08-23) — two full
                        weather parentheticals inside one sentence is the same
                        wall the Angles line had. The second park keeps its in
                        the tooltip this span already carries. */}
                    {i === 0 && airParts(p).length > 0 && <span style={{ color: C.text3 }}> ({airParts(p).map((x) => x.text).join(', ')})</span>}
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

      <WhatThis>
        who to look at first tonight. It&apos;s
        every hitter on the slate, sorted by home-run score — <b style={{ color: C.text2 }}>you can
        use the order without reading a single column</b>. Sort by any other header to ask a
        different question (Hit for contact plays, Park for launch pads, K risk for the ones likely
        to strike out), and click any row to open that hitter.{' '}
        <b style={{ color: C.text2 }}>Don&apos;t know what a column means? Tap the ⓘ next to its
        name</b> — it says so in plain English, no baseball background needed.
      </WhatThis>

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
        caption={"Every stat here sorts — click a header, shift-click to add a tiebreaker. Columns run in groups: the model scores, then the season line, then the split against the hand tonight's starter throws, then statcast, then the arm itself. Colour follows what you sort by, plus HR, which stays lit as the through-line. Where a column is drawn against a league mark, ▲ means above it and ▼ below, and a number sitting on league reads blank because that is not a finding — hover any header for the mark it uses. P ERA, P WHIP, P HH%, P FB%, P Brl%, P EV and P PullAir% run warm-is-good-for-the-bat; P K/9 and P SwStr% run the other way, because missing bats is what stops a homer. Blank cells are unpublished, not zero."}
      />
    </div>
  )
}
