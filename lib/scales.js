'use client'
import { C } from './theme'
import { activeStops, activeChips, inkOn } from './palette'

// ══ THE COLOUR SYSTEM ═══════════════════════════════════════════════════════
//
// Donovan, twice, in the same notebook: "Colors as information, not
// decoration" and "the colour and chart system has to get fixed."
//
// The audit (claude/moonshot-colour-chart-system-audit.md, 2026-08-22) found
// nineteen separate colour scales and 1,161 hard-coded hex literals across 113
// files. Four of the nineteen were principled. The other fifteen were each
// file inventing its own answer, which is how #4ade80 came to mean "he reached
// base", "the pitcher struck him out", "the game is live", "the arm gave up
// the homer we called" and "CONTACT" simultaneously.
//
// THE RULE THIS FILE EXISTS TO ENFORCE:
//
//   A colour answers exactly one question, and the number it encodes is
//   always printed beside it.
//
// Three consequences, and they are the whole design:
//
//   1. Colour never carries a fact alone. Delete every colour on the page and
//      nothing is LOST — the page just gets slower to read.
//   2. A quantity's KIND picks its scale, not the file it happens to live in.
//      Magnitude -> sequential. Signed distance from a real zero -> diverging.
//      Identity -> categorical. Nothing else gets colour at all.
//   3. A 0-100 model score and a measured frequency never share a scale, a
//      legend or a column strip. A score is an ORDERING. A frequency is a
//      CLAIM WITH A DENOMINATOR. They are not the same kind of number and
//      they must not look alike.
//
// ── WHY THE TWO SCALES LOOK STRUCTURALLY DIFFERENT, NOT JUST DIFFERENT ──────
//
// Sequential paints a SOLID FILL with computed ink on top. Diverging paints a
// TRANSPARENT TINT with a sign glyph. That is deliberate and it is doing work:
// you can tell which kind of question a column is answering from across the
// room, before you read a single number. A solid cell says "how much". A
// tinted cell with an arrow says "which side of the line, and how far".
//
// ── WHY DIVERGING CARRIES A GLYPH ───────────────────────────────────────────
//
// Sequential survives greyscale because lib/palette.js forces luminance to
// rise monotonically — that is the single most valuable property in this repo
// and the reason the ramps went through five passes. Diverging CANNOT have
// that property: its luminance is a V, high at both ends, and a V cannot be
// ordered by lightness. So the sign has to be carried by something that is not
// colour at all. Hence the arrow, on every cell, always. It is not decoration
// and it is not optional — it is what makes red/green-blindness a non-event.
//
// For the same reason the ends are ORANGE and BLUE, not red and green.
// Red/green is the worst pair for deuteranopia (~8% of men), and #f87171 /
// #4ade80 are already the two most overloaded hexes on the site.
//
// ── WHY THESE READ FROM `C` AND NOT FROM HEXES ──────────────────────────────
//
// lib/theme.js mutates C in place when a theme is applied. Everything here
// resolves at CALL time, so the whole system follows light/dark for free. That
// is the fix for the dark-variant ask as much as it is the fix for the colour
// ask: they are the same job. A literal hex in a chart is a chart that cannot
// be themed, and there are currently 1,161 of them.

// ── hex helpers ─────────────────────────────────────────────────────────────
// Small, local, and deliberately tolerant: C can hold a 6-digit hex from any
// of the five themes, and a caller that passes something else gets a safe
// neutral rather than a crash mid-render.
const HEX = /^#([0-9a-fA-F]{6})$/

export function rgbOf(hex) {
  const m = HEX.exec(String(hex || ''))
  if (!m) return [128, 128, 128]
  const h = m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/** `#f97316` + 0.24 -> `rgba(249,115,22,0.24)`. */
export function alpha(hex, a) {
  const [r, g, b] = rgbOf(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const num = (v) => {
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}

// ══ SEQUENTIAL ══════════════════════════════════════════════════════════════
//
// The four ramps in lib/palette.js, unchanged. They are contrast-audited,
// dead-zone-checked and greyscale-ordered, and Donovan picked Ember as the
// default after a night with the alternatives. Re-solving those colours would
// be the seventh pass on a closed question.
//
// WHAT CHANGES IS THE DOMAIN, and that is most of the "Due seems lazy" fix.
//
// Today every numeric column min/max-normalises against itself. That
// GUARANTEES each column has a black end and a bright end whether or not
// anything interesting happened in it — the colour is generated rather than
// earned, which is exactly what "lazy" describes. A 0-100 score drawn against
// [0,100] can come out entirely dim, and on a weak night it should.
//
// `domain: 'auto'` is still reachable, because on a genuinely relative
// question (who is farthest tonight) it is the right answer. It just has to be
// asked for now, and it is drawn with a hatched legend so the reader knows the
// ends are relative to this slate rather than absolute.

export const SEQ_AUTO = 'auto'

/**
 * seqColor(value, domain) -> hex | null
 *
 * domain is [lo, hi], or SEQ_AUTO with the auto range passed as `autoRange`.
 * Returns null for a non-number, which callers render as a plain cell — a
 * blank is not a zero and must never be painted like one.
 */
export function seqColor(value, domain, autoRange) {
  const f = num(value)
  if (f == null) return null
  const [lo, hi] = domain === SEQ_AUTO ? (autoRange || [0, 1]) : (domain || [0, 1])
  const stops = activeStops()
  const span = hi - lo
  const pos = span <= 0 ? 0 : clamp((f - lo) / span, 0, 1)
  return stops[Math.min(stops.length - 1, Math.floor(pos * stops.length))]
}

/** The same scale for marks with no text on them — bars, dots, wedges. */
export function seqChip(value, domain, autoRange) {
  const f = num(value)
  if (f == null) return null
  const [lo, hi] = domain === SEQ_AUTO ? (autoRange || [0, 1]) : (domain || [0, 1])
  const chips = activeChips()
  const span = hi - lo
  const pos = span <= 0 ? 0 : clamp((f - lo) / span, 0, 1)
  return chips[Math.min(chips.length - 1, Math.floor(pos * chips.length))]
}

export const seqInk = inkOn

// Named domains, so a score's scale is stated in one place rather than
// re-guessed per board. A 0-100 model score is the commonest by far.
export const DOMAIN = {
  score: [0, 100],
  pct: [0, 100],
  rate01: [0, 1],
}

// ══ DIVERGING ═══════════════════════════════════════════════════════════════
//
// Seven components had rolled their own version of this before the audit —
// ParkBoard, BlankBoard, LuckReport, Watchlist, OddsBoard, TheRead, Runs — and
// ScoreBands.tint() was the only one that got it right. This is that one,
// generalised.
//
// THE DEAD BAND IS THE POINT, and it is inherited from ScoreBands: inside
// ±deadband the cell is transparent with quiet ink, because a middling number
// is not a recommendation and letting it glow is the mistake the whole idea
// exists to prevent.
//
// `ceiling` saturates the ramp so one outlier cannot compress everything real
// into a single hue. It must be stated by the caller — an unstated ceiling is
// an auto-domain wearing a diverging coat.

export const DIV_UP = '▲'
export const DIV_DOWN = '▼'
export const DIV_FLAT = '·'

/**
 * divTone(value, { anchor, ceiling, deadband, invert })
 *
 * Returns { bg, fg, glyph, t } where
 *   bg    a translucent tint in the theme's warm/cool token (or 'transparent')
 *   fg    ink for the number
 *   glyph ▲ / ▼ / · — the redundant, colour-blind-safe encoding of the sign
 *   t     the signed, clamped position in [-1, 1], for callers drawing bars
 *
 * `invert: true` means low is the good side (a pitcher's HR/9, a break-even
 * price). It flips WHICH SIDE IS WARM, never the arrow: the arrow always
 * points the way the number went, because that is a fact about the number and
 * not an opinion about it. Conflating those two is how BoxTable ended up
 * painting a hitter's RBI and a pitcher's strikeout the same green.
 */
export function divTone(value, opts = {}) {
  const {
    anchor = 0, ceiling = 1, deadband = 0.08, invert = false,
    // TINT STRENGTH. A table cell sits in a grid of other cells and 0.40 at
    // full is plenty — push it further and a sorted column starts competing
    // with the sequential fills beside it. A STANDALONE HEAT GRID (the strike
    // zone) has nothing next to it to compete with and needs to read from
    // arm's length on a phone, so it asks for more. Stated by the caller
    // rather than guessed per component, which is how the site ended up with
    // eleven versions of this in the first place.
    floor = 0.07, max = 0.40,
  } = opts
  const f = num(value)
  if (f == null || !(ceiling > 0)) {
    return { bg: 'transparent', fg: C.text3, glyph: '', t: null }
  }
  const t = clamp((f - anchor) / ceiling, -1, 1)
  const a = Math.abs(t)
  const glyph = a < deadband ? DIV_FLAT : t > 0 ? DIV_UP : DIV_DOWN
  if (a < deadband) return { bg: 'transparent', fg: C.text2, glyph, t }
  // Which END is warm can flip; which way the arrow points cannot.
  const warm = invert ? t < 0 : t > 0
  const hue = warm ? C.orange : C.blue
  return {
    bg: alpha(hue, floor + (max - floor) * a),
    fg: C.text,
    glyph,
    t,
  }
}

// ── THE FIELD ANCHOR ────────────────────────────────────────────────────────
//
// Donovan, 2026-08-22: "whatever colour path is on the Rundown AVG columns,
// make that site-wide, and make all the other scoring show that — I like the
// up and down arrows too, show those on the scoring when it's valid."
//
// AVG could go diverging because it HAS a stated zero: the league mark. A
// 0-100 model score does not. There is no league HR score, and inventing one
// (50? the model's own midpoint?) would be a made-up number drawn as if it
// were measured — the exact failure the rest of this file exists to prevent.
//
// The one anchor a score does honestly have is TONIGHT'S FIELD. "Above the
// middle of the slate you are actually choosing from" is a real, printable
// claim, it is the comparison the page is for, and it is still emphatically
// not a probability. So a score column asks for `anchor: DIV_FIELD` and the
// table resolves it from the rows on screen.
//
// "WHEN IT'S VALID" IS THE LOAD-BEARING HALF OF THE ASK, and it is what this
// function returns null for:
//
//   - Fewer than MIN_N finite values. A pitcher's nine lineup spots are not a
//     field, and a median of six numbers is a coin-flip dressed as a centre.
//     Twelve is the floor because at nine the tenth and ninetieth percentile
//     ARE the min and max, and the ceiling stops being a ceiling.
//   - A degenerate spread. If the tenth and ninetieth percentile sit on the
//     same number, every arrow on the column would be noise.
//
// In both cases the column falls back to its plain sequential fill and draws
// NO arrow, because an arrow that cannot be justified is worse than none: it
// looks exactly as confident as one that can.
//
// The ceiling is the wider of the two tails at TAIL/1-TAIL rather than the
// outright min/max, so one 99 cannot compress the other 267 rows into a
// single flat hue — the same reason `ceiling` is mandatory everywhere else.

export const DIV_FIELD = 'field'

const MIN_N = 12
const TAIL = 0.10

function quantile(sortedVals, p) {
  const n = sortedVals.length
  if (!n) return null
  const i = (n - 1) * p
  const lo = Math.floor(i), hi = Math.ceil(i)
  if (lo === hi) return sortedVals[lo]
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (i - lo)
}

/**
 * fieldAnchor(values) -> { anchor, ceiling, n } | null
 *
 * null means "this column has no honest anchor tonight" — see above.
 */
export function fieldAnchor(values) {
  const v = (values || []).map(num).filter((x) => x != null).sort((a, b) => a - b)
  if (v.length < MIN_N) return null
  const med = quantile(v, 0.5)
  const hi = quantile(v, 1 - TAIL)
  const lo = quantile(v, TAIL)
  const ceiling = Math.max(hi - med, med - lo)
  if (!(ceiling > 0)) return null
  return { anchor: med, ceiling, n: v.length }
}

/**
 * SCORE — the one spread every 0-100 model score on the site now wears.
 *
 *   { key: 'hrw', label: 'HRW', w: 46, dp: 0, ...SCORE }
 *
 * Diverging against the middle of the rows on screen, with 0-100 kept as the
 * declared fallback for when that middle cannot be justified. One object so
 * that a score's treatment is decided here and imported, not re-guessed in
 * twenty files — which is how the site got nineteen colour scales.
 */
export const SCORE = { scale: 'div', anchor: DIV_FIELD, domain: [0, 100] }

/**
 * How a field-anchored column names its zero, in the cell tooltip.
 *
 * ROWS, NOT "TONIGHT'S FIELD". On the Rundown those are the same thing — 269
 * rows is the slate. On a top-25 board they are emphatically not, and a
 * tooltip that said "tonight's field" there would be claiming a comparison
 * against 269 hitters while actually comparing against 25 already-selected
 * ones. Name the denominator that was actually used.
 */
export function fieldLabel(f, dp = 1) {
  if (!f) return ''
  return `the middle of these ${f.n} rows (${f.anchor.toFixed(dp)})`
}

/** The bare hue for a diverging value — bars, ticks, chips with no fill. */
export function divChip(value, opts = {}) {
  const { anchor = 0, deadband = 0.08, ceiling = 1, invert = false } = opts
  const f = num(value)
  if (f == null) return C.text3
  const t = clamp((f - anchor) / ceiling, -1, 1)
  if (Math.abs(t) < deadband) return C.text3
  const warm = invert ? t < 0 : t > 0
  return warm ? C.orange : C.blue
}

// ══ CATEGORICAL ═════════════════════════════════════════════════════════════
//
// Six colours, because six is where hue identification on a phone stops being
// reliable — and they are TOKEN NAMES rather than hexes, so the set themes.
// lib/roleBadge.js has stored tone names rather than hexes since it was
// written and is the model the rest of this follows.
//
// Luminance is spread across the six so that even the categorical set degrades
// to a legible greyscale rather than to mush.
//
// EVERY MAP BELOW REPLACES SEVERAL. The audit found eleven separate pick-role
// palettes that disagreed on three of five roles (HIT was purple in three
// files and blue in two; CONTACT was green in three and violet in two), and
// tabs/Games.js contradicted ITSELF — ROLE_CONFIG said HRR was #34D399 while
// CAT_COLOR, declared twice in the same file, said #22d3ee. There is now one
// answer and it is imported, not retyped.

const TOKENS = ['orange', 'cyan', 'purple', 'blue', 'yellow', 'green']

/** Resolve a token name against the live theme. */
export function tone(name) {
  return C[name] || C.text2
}

// The concept registry. Keys are the values that appear in the data.
export const CAT = {
  // Pick role — replaces the eleven maps listed in the audit.
  role: {
    TOP: 'yellow',
    HR: 'orange',
    HIT: 'purple',
    HRR: 'cyan',
    CONTACT: 'blue',
  },
  // Pitch family — replaces three dictionaries that disagreed on SL, CU and
  // CH. Grouped by FAMILY rather than by code, because twelve pitch codes on
  // one chart is past the six-hue limit and a sweeper and a slider are not
  // two different answers to a hitter's question.
  pitch: {
    FF: 'orange', FA: 'orange',
    SI: 'yellow', FT: 'yellow',
    FC: 'green',
    SL: 'cyan', ST: 'cyan', SV: 'cyan',
    CU: 'purple', KC: 'purple', CS: 'purple', SC: 'purple',
    CH: 'blue', FS: 'blue', FO: 'blue', KN: 'blue',
  },
  // Batted-ball outcome — SprayField's five, which is the one categorical set
  // on the site where colour is currently the SOLE encoding on canvas.
  result: {
    home_run: 'orange',
    triple: 'purple',
    double: 'cyan',
    single: 'blue',
    out: 'text3',
  },
}

/**
 * catColor(concept, key) -> hex
 *
 * An unknown key returns the quiet grey rather than a random hue, so a new
 * pitch code shows up as "we do not have a colour for this" instead of
 * silently borrowing somebody else's meaning.
 */
export function catColor(concept, key) {
  const map = CAT[concept]
  if (!map) return C.text3
  const t = map[key] || map[String(key || '').toUpperCase()]
  return t ? tone(t) : C.text3
}

export const CAT_TOKENS = TOKENS

// ══ STATE — not a scale ═════════════════════════════════════════════════════
//
// Selected, live, stale, watched, changed. These are not measurements and they
// must stop looking like measurements: today they are drawn in C.orange,
// #4ade80 and #FCD34D, which are the same hues the data uses, so a live game
// and a hot number are the same green.
//
// State is BORDER + GLYPH + WEIGHT on the theme accent. Never a cell fill.

export const STATE = {
  on: () => ({ borderColor: C.orange, color: C.orange, fontWeight: 800 }),
  off: () => ({ borderColor: C.border, color: C.text3, fontWeight: 600 }),
  live: () => ({ borderColor: C.orange, color: C.text, fontWeight: 800 }),
  stale: () => ({ borderColor: C.border, color: C.text3, fontWeight: 600, opacity: 0.7 }),
}

// ══ SAMPLE CONFIDENCE — also not a scale ════════════════════════════════════
//
// One treatment, replacing three. The audit found thin samples expressed as an
// amber chip (AltLooks, HomerShape), as a dim to C.text3 (BlankBoard,
// GameLineup) and as opacity 0.5 (HRPitchProfile) — one idea, three visual
// languages, no rule.
//
// "I do not trust this number" is not a value ON the scale; it is a statement
// ABOUT the scale. So it desaturates toward neutral and prints its
// denominator. It never gets a hue of its own, because a hue would put it back
// on the scale it is trying to step off.

/**
 * sampleDim(n, min) -> { thin, opacity, title }
 * Callers spread `opacity` and print `n` next to the rate.
 */
export function sampleDim(n, min) {
  const v = num(n)
  if (v == null) return { thin: true, opacity: 0.45, title: 'no sample' }
  if (v >= min) return { thin: false, opacity: 1, title: `${v} in sample` }
  // Linear from 0.45 at zero to 1 at the bar, so "nearly enough" reads as
  // nearly enough rather than falling off a cliff.
  return { thin: true, opacity: 0.45 + 0.55 * (v / min), title: `${v} of ${min} needed — read lightly` }
}

// ══ FREQUENCY vs SCORE ══════════════════════════════════════════════════════
//
// Donovan's constraint, made mechanical: "A 0-100 score is not a probability;
// a measured frequency with its denominator is. Never blur the two."
//
// tabs/OddsBoard.js currently puts `need` (a break-even probability), `score`
// (a 0-100 bot confidence) and `rate` (a measured frequency) in ONE DenseTable
// on ONE ramp — and the score column's own tooltip reads "Not a probability —
// never compare it to NEED." The colour invites exactly the comparison the
// tooltip forbids.
//
// A frequency printed through here always carries its denominator. If there is
// no denominator it is not a frequency and it does not get to be drawn as one.

export function freq(numer, denom, dp = 1) {
  const a = num(numer)
  const b = num(denom)
  if (a == null || b == null || b <= 0) return { text: '—', pct: null, of: null }
  const pct = (100 * a) / b
  return { text: `${pct.toFixed(dp)}%`, pct, of: `${a}/${b}` }
}

// ══ THE VERDICT PAIR — the site-wide up/down (Donovan, 2026-08-23) ══════════
//
// "the color system for the up and down — make the verdict one — that to be
// the site wide colors now." The pitcher modal's split tiles read one
// direction end to end through divTone: WARM = the good side / up, COOL =
// the bad side / down, arrow glyph carrying the sign for colour-blind
// readers. That pair is now the site-wide rule for every up/down,
// good/bad, win/loss ink — retiring the ad-hoc green/red literals
// (#4ade80/#f87171) file by file. Green/red survives ONLY where it is a
// domain colour (a field graphic), never as a verdict.
//
// verdictInk(up)            -> ink + glyph for a binary verdict
// verdictWash(up, a=0.10)   -> the matching translucent tint
export function verdictInk(up) {
  if (up == null) return { color: C.text3, glyph: DIV_FLAT }
  return up ? { color: C.orange, glyph: DIV_UP } : { color: C.blue, glyph: DIV_DOWN }
}
export function verdictWash(up, a = 0.10) {
  if (up == null) return 'transparent'
  return alpha(up ? C.orange : C.blue, a)
}

/** A 0-100 model score. Printed without a % sign, ever. */
export function score(v, dp = 1) {
  const f = num(v)
  return f == null ? '—' : f.toFixed(dp)
}
