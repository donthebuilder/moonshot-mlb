import { CHASSIS, NUM_FONT } from '../design/tokens'
import { C as LAMP } from '../nhl/theme'
// NFL palette + tab list.
//
// Same chassis as lib/theme.js — identical greys, identical contrast
// discipline, identical NUM_FONT — but a different accent family, because you
// should be able to tell which sport you're looking at from six feet away
// without reading a word.
//
//   MLB   orange → red      (#f97316 → #ef4444)   a ball leaving the yard
//   NFL   spectral jade → electric cyan (#00f5ad → #35cdff)   signal, not turf
//
// REPAINTED 2026-09-11 (Donovan: "more futuristic, innovate and original" —
// the old accents were #22c55e / #22d3ee, i.e. Tailwind's own green-500 and
// cyan-400, unmodified. Every dark-mode dashboard built on Tailwind defaults
// reaches for exactly that pair, which is the opposite of original no matter
// how it's laid out. Nothing else about the product changed -- every
// component below still just says C.green / C.cyan, so this one file is the
// whole repaint. The relationship the file's own naming promises (green
// stays green-family, cyan stays cyan-family) is kept on purpose: renaming
// the token keys themselves would mean touching call sites in 26 files
// blind, for zero visual benefit over just changing the values here.
//
// The new pair is built to read as LIVE SIGNAL rather than decoration --
// this product's whole job is finding the one soft spot in a defense and
// saying so in one sentence (Games/Matchups' DVP takeaways, The Six's
// headliner) -- a bio-luminescent jade against a near-void background reads
// like something actively tracking, not a status badge borrowed from a
// SaaS admin panel.
//
// The greys are deliberately NOT re-picked. They went through a readability
// pass on 2026-08-08 (both tiers stepped up so text2 clears ~7:1 and text3
// stops being squint-territory at 9px) and that work is sport-agnostic and
// still holds against the new, slightly deeper background below.

// ONE CHASSIS (2026-09-28, parity plan D): the surfaces, borders and ink are
// lib/design/tokens.js -- MOONSHOT's, so the network has one black, not two
// (this file ran a deeper #050608 / #0c0e14). Only TUDDY's accents live here.
const JADE = '#00f5ad'
export const C = {
  ...CHASSIS,
  // ── the NFL accents ──
  // STRENGTHENED 2026-09-13 (Donovan: "the colors of the whole TUDDY needs to
  // be more strong like moonshot"). MOONSHOT reads harder for two reasons, and
  // only one of them is the hue: #f97316 is a high-chroma orange, and it gets
  // used as a FILL rather than a 12%-alpha whisper. Both are addressed —
  // the accents step up in chroma and luminance here, and the tint alphas
  // across components/nfl step up with them. The hues themselves do not move
  // families: this is the same jade and the same signal-blue, turned up.
  green: JADE,
  // TURF (2026-09-13). The Map is drawn on a field now, so the field needs a
  // surface of its own: near-black with just enough green in it to read as
  // grass under the near-black page, and never used for a data value.
  // 2026-10-02 (Donovan: "darker and more turf realistic"): real grass green
  // at night, the mowing stripe a shade up, grain + a dark edge over both
  // (components/nfl/TheField.js turfLayers), so it reads as turf, not a chart.
  turf1: '#123620',    // the lighter mowing stripe (10-02: ~25% up, "a little too dark")
  turf2: '#0c2515',    // the base grass
  turfGrain: '#3f7d4a', // the light blades in the grain
  turfShade: '#010402', // the dark blades, and the edge under the lights
     // primary — spectral jade, was #00e0a4
  // COLOUR DIET (2026-10-07, Donovan: NFL "looks like puked colour, I don't even want to read it").
  // TUDDY has ONE accent (green) and greys. The old second hues are kept as KEYS so the ~280 call
  // sites still resolve, but they now answer with the accent or a grey -- colour appears only where
  // it MEANS something (status badges, role chips, the table standouts, team logos). red and yellow
  // stay: red is a miss / an out, yellow the one caution (questionable). Only the green is a hex now.
  cyan: JADE,      // was #35cdff -- the accent
  lime: JADE,      // was #a3e635 -- the accent
  yellow: '#facc15',    // caution only
  red: '#f87171',       // a miss, an out
  purple: CHASSIS.text2, // was #a78bfa -- grey
  blue: CHASSIS.text2,   // was #60a5fa -- grey
  orange: JADE,    // was #fb923c -- the accent
  amber: JADE,     // was #fbbf24 -- the accent
  // THE FIELD'S INKS (components/nfl/FieldChart.js): chalk and a line colour, not data.
  cream: LAMP.cream,
  ice: LAMP.ice,
  teal: CHASSIS.text2,   // was LAMP.teal -- grey
  pink: CHASSIS.text3,   // was #f472b6 -- grey
}

// ── THE RAMP ─────────────────────────────────────────────────────────────────
// 2026-09-13, Donovan, on the first pass of the new charts: "the green just
// doesn't offset the orange of the moonshot site."
//
// The fix is not to repaint TUDDY orange — that undoes the whole point of
// 09-11, which was that you can tell the two sports apart from six feet away —
// but the complaint underneath it is real in a second way the eye gets to
// first: a jade→cyan ramp has almost no contrast between adjacent steps, so a
// stacked bar of three components read as one green smear and the site looked
// flatter than the data in it.
//
// So: one shared SEQUENTIAL ramp, warm to cool, amber into jade. It has real
// separation at every step, it warms TUDDY toward MOONSHOT's family without
// becoming it, and it is one array so every ordered scale on the NFL side is
// the same scale. Use it for anything ordered — stacked contributions, meters,
// heat. Do NOT use it for hit/miss: cleared stays jade and missed stays dim,
// because a bettor reads green-vs-grey instantly and no amount of house style
// is worth spending that.
// Built from the tokens at both ends rather than respelling them: the warm
// stop IS C.amber and the cool stop IS C.green, so a repaint of either moves
// the ramp with it and the two can never drift apart.
// COLOUR DIET (2026-10-07): the ramp is ONE hue now -- the dim grey recedes into the accent -- so a
// table's low end quiets down and its top glows (DenseTable v2 standouts), never amber-lime-green.
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16))
const mixHex = (a, b, t) => '#' + hexRgb(a).map((x, i) => Math.round(x + (hexRgb(b)[i] - x) * t).toString(16).padStart(2, '0')).join('')
export const RAMP = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => mixHex(C.text3, C.green, t))

// A colour anywhere along the ramp, t in 0..1 — for scales with more steps
// than the array has stops.
export function rampAt(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0)) * (RAMP.length - 1)
  return RAMP[Math.round(x)]
}

// The 3D stadium's paint (components/nfl/FieldArena.js). NIGHT, LIKE MOONSHOT
// (BATCH-3D-V2 step 2; Donovan: the bright daytime field was "a mess"): the
// grass is near-black green like the 2D's turf (C.turf1/2), the chalk dim, so
// the 2D chart's own ink -- laid on the turf as its texture -- is what reads.
export const FIELD3D = {
  // the grass is the 2D's grass (C.turf2 / C.turf1, 2026-10-02), grained in lib/fieldWorld.js
  turf: C.turf2, stripe: C.turf1, endzone: '#061409', chalk: '#7d8a80',
  post: '#f2c94c', surround: '#030806', seat: '#2a3346', fascia: '#2c3442', sky: '#03050a',
}
// THE PROPS BARS' PAINT (2026-10-07, Donovan: the old bars "look wack", "give it some real
// style"; no reference picture, so TUDDY's own): a game that CLEARS the line wears the
// product accent, a game that misses is a desaturated neutral grey -- never red, never a
// second hue -- so the eye reads "lit or not lit". The line is a white dashed rule.
// Read by components/BroadcastBars.js (ValueBars variant="broadcast") and PropsGrid's rate cells.
export const BARS = {
  clear: C.green,      // a bar over the line
  miss: '#5d6170',     // a bar under it: neutral grey, ~3.4:1 on the page
  missInk: C.text2,    // its number
  rule: C.text,        // the line
  thin: '#2b2e38',     // a rate on under four games: grey slab, no claim
}
export const ACCENT = C.green
// The masthead gradient now runs the ramp rather than green→cyan, so the
// wordmark and every ordered chart under it are visibly the same system.
export const GRADIENT = `linear-gradient(120deg, ${RAMP[0]}, ${RAMP[2]}, ${RAMP[5]})`

export { NUM_FONT }

// ── THE TYPE SCALE (2026-09-15) ─────────────────────────────────────────────
// Re-exported from lib/theme.js rather than redefined here. Donovan: "i dont
// want to do the visual pass of cloning mlb to nfl... i want there to be
// visually little difference and feel from moonshot to tuddy" -- resolved as
// keep the jade/cyan sport-accent identity above (that stays exactly as-is,
// see the RAMP writeup below), but bring typography/spacing/layout into one
// family. TYPE is the one place that decision is concrete: MOONSHOT and TUDDY
// share the literal same six-step object -- display/title/name/body/label/
// micro -- picked by ROLE, not by nearest existing pixel value (see
// lib/theme.js for the full guide). A second, separately-defined copy here
// could drift step-by-step the same way the colors deliberately do NOT; a
// re-export can't drift. See STATUS.md for what's migrated on the NFL side.
export { TYPE } from '../theme'

// The seven markets, in board order. Mirrors MARKETS in nfl_scoring.py —
// if you add one there, add it here.
export const MARKETS = [
  ['TD',       'Anytime TD',       '1+ rush or rec TD'],
  ['REC_YDS',  'Receiving yards',  'default bar 40'],
  ['REC',      'Receptions',       'default bar 4'],
  ['RUSH_YDS', 'Rushing yards',    'default bar 50'],
  ['RUSH_ATT', 'Rush attempts',    'default bar 12'],
  ['PASS_YDS', 'Passing yards',    'default bar 225'],
  ['KICK_PTS', 'Kicking points',   'FG×3 + PAT, bar 6'],
  // DEF_TD (2026-09-21) -- Donovan: "everyone ranked, just like MLB... and
  // special teams and defense." nfl_scoring.py's V1_MODELS, not MODELS: one
  // real component (each team's own trailing def_tds + special_teams_tds
  // rate), percentile-ranked, but not weighted/backtested like the other
  // seven yet -- the payload flags it "v1": true and Boards.js shows that
  // flag rather than hiding it. pos is Team DEF, the same unit FRANCHISE
  // already scores as one roster slot, never an individual defender.
  ['DEF_TD',   'Defense/ST TD',    '1+ def or return TD'],
]

// The column-head form of each market (2026-09-29): MOONSHOT's StatStrip on the
// player card has room for a short uppercase label per tile; the full name
// (MARKETS[1]) rides in the tile's title and in the rates section below it.
export const MARKET_SHORT = {
  TD: 'ANY TD', REC_YDS: 'REC YDS', REC: 'REC', RUSH_YDS: 'RUSH YDS',
  RUSH_ATT: 'RUSH ATT', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK PTS', DEF_TD: 'DEF TD',
}

// Score → grade. THE SAME LADDER AS MLB, deliberately — lib/scoring.js
// gradeFor(): A+ 78 / A 70 / A- 62 / B+ 54 / B 46 / C+ below.
//
// Those cutoffs only mean anything because the NFL score is now built on the
// same distribution as hr_score. It used to be a percentile inside the slate,
// which forced a uniform 0-100 every week: the best goal-line back among six
// teams scored 100 whether he was Bijan Robinson or a backup, and a 100 on a
// three-game preseason card read exactly like a 100 on a full Sunday.
//
// nfl_bot now ranks each component against the whole league, ranks the
// composite against the league's composites, and lands the result at mean 47 /
// sd 11 — measured off a published MLB slate (min ~24, median ~45, max ~57).
// So the numbers transfer: an NFL 78 is as rare as an MLB 78, and a thin card
// scores thin instead of manufacturing an A+ out of whoever showed up.
export function gradeFor(score) {
  const s = Number(score)
  if (!Number.isFinite(s)) return { label: '—', color: C.text3 }
  if (s >= 78) return { label: 'A+', color: C.green }
  if (s >= 70) return { label: 'A',  color: C.green }
  if (s >= 62) return { label: 'A-', color: C.green }
  if (s >= 54) return { label: 'B+', color: C.text }
  if (s >= 46) return { label: 'B',  color: C.text2 }
  return { label: 'C+', color: C.text3 }
}
