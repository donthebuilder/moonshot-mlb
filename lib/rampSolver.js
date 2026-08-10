'use client'

// 🎛️ RAMP SOLVER — the maths that built every palette, moved into the browser.
//
// 2026-08-10, Donovan: "is there a way to make it so I can just customise on
// the site?"
//
// Yes, and it is the right ask. We have now spent seven rounds where he
// describes a colour, I guess at it, and he tells me it is not it. That loop
// does not converge because the thing being communicated is a visual
// impression and the channel is words. Sliders end it: he moves them, sees the
// board recolour under his hand, and stops when it looks right.
//
// WHY THIS ISN'T JUST A COLOUR PICKER. Handing over three raw hex fields would
// reintroduce every failure the last two days were spent removing — a stop
// parked in the unreadable luminance gap, a bottom third that is a smear, four
// steps that collapse into one shade. The knobs are therefore not "pick a
// colour"; they are the three parameters the ramps were SOLVED against, and
// the solver still enforces every constraint underneath:
//
//   1. luminance rises at every step        (so it works in greyscale too)
//   2. no stop inside 0.170–0.189           (where neither ink is readable)
//   3. every stop clears 4.5:1 with an ink  (WCAG AA)
//   4. adjacent stops differ perceptibly    (no plateau)
//
// A slider position that would break one of those is simply not reachable —
// the solver clamps it. You cannot build an unreadable ramp here, which is the
// whole point of shipping a solver instead of a colour picker.

// ── colour maths (the same functions the offline solver used) ───────────────
const hexA = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (r, g, b) => `#${[r, g, b]
  .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
  .join('')}`

export function lum(h) {
  const p = hexA(h).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}

export function contrast(a, b) {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}

// "redmean" perceptual distance. Better than a contrast ratio for the question
// "do these two swatches look different", which is what a plateau check needs.
export function delta(a, b) {
  const [r1, g1, b1] = hexA(a)
  const [r2, g2, b2] = hexA(b)
  const rm = (r1 + r2) / 2
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2
    + (2 + (255 - rm) / 256) * (b1 - b2) ** 2)
}

export function hsl(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t0) => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return toHex(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255)
}

/** The lightness that puts hue+sat at a target luminance. Binary search. */
function atLuminance(h, s, target) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2
    if (lum(hsl(h, s, mid)) < target) lo = mid
    else hi = mid
  }
  return hsl(h, s, (lo + hi) / 2)
}

// The gap where neither #f4f4f5 nor #0a0a0b clears 4.5:1 on a saturated fill.
// Solved, not estimated — see lib/palette.js.
export const DEAD_LO = 0.170
export const DEAD_HI = 0.189

/**
 * A luminance ladder of `n` steps from `floor` to `ceil` that STEPS OVER the
 * dead zone rather than landing in it.
 *
 * This is the single constraint that separated the working ramps from every
 * earlier attempt, and it is easy to violate by accident because the gap is
 * only 0.019 wide and the failure is silent.
 */
export function ladder(n, floor, ceil) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    let t = floor + (ceil - floor) * (i / (n - 1))
    if (t > DEAD_LO && t < DEAD_HI) {
      // Push to whichever side is nearer, so the shape of the ladder is
      // disturbed as little as possible.
      t = (t - DEAD_LO) < (DEAD_HI - t) ? DEAD_LO - 0.004 : DEAD_HI + 0.004
    }
    out.push(t)
  }
  // Pushing a step can break the rise; nudge any tie upward.
  for (let i = 1; i < out.length; i += 1) {
    if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 0.006
  }
  return out
}

/**
 * Build a ramp from three knobs.
 *
 *   hueFrom / hueTo   where the colour starts and ends
 *   sat               overall intensity, 0..1 (the strain dial)
 *   brightness        how far up the ladder the top reaches, 0..1
 *   satShape          'rise' | 'arch' | 'dip' — the three shapes the shipped
 *                     ramps use, and the thing that actually distinguishes
 *                     them from each other
 */
export function solveRamp({
  hueFrom = 2, hueTo = 142, sat = 0.6, brightness = 0.6,
  satShape = 'arch', stops = 9, greyBottom = 0,
} = {}) {
  const floor = 0.014 + 0.05 * (1 - brightness)
  const ceil = 0.30 + 0.36 * brightness
  const L = ladder(stops, floor, Math.max(floor + 0.15, ceil))
  const out = []
  for (let i = 0; i < stops; i += 1) {
    const t = stops === 1 ? 0 : i / (stops - 1)
    // Hue takes the short way round the wheel, so red→green never detours
    // through blue.
    let span = hueTo - hueFrom
    if (span > 180) span -= 360
    if (span < -180) span += 360
    const h = hueFrom + span * t
    let s = sat
    if (satShape === 'arch') s = sat * (0.72 + 0.28 * Math.sin(Math.PI * t))
    else if (satShape === 'dip') s = sat * (0.14 + 0.86 * Math.abs(2 * t - 1))
    else if (satShape === 'rise') s = sat * (0.14 + 0.86 * t)
    // A grey bottom is how Ember says "none" rather than "a little".
    if (i < greyBottom) s = Math.min(s, 0.12)
    out.push(atLuminance(h, Math.max(0.03, Math.min(1, s)), L[i]))
  }
  return out
}

/**
 * The two constructions, behind one call.
 *
 * 2026-08-10, second half of the day. Donovan sent the props sheet and said
 * "make Signal this palette" — a deep tinted cell with a LIT NUMBER rather
 * than the bright cell with neutral ink every other ramp uses. That style was
 * not reachable from the sliders, which made the studio's whole promise
 * ("stop describing colours to me") half true. It is reachable now.
 *
 * LIT MODE IS NOT JUST A DARKER RAMP. The fill ceiling and the ink floor are
 * COUPLED: the number has to clear 4.5:1 on its own cell, so pushing the cells
 * brighter forces the numbers brighter with them. That relationship is solved
 * here rather than left to the person dragging, which is the difference
 * between a slider and a trap.
 */
export function solveScale(k = {}) {
  const knobs = { litNumbers: false, ...k }
  if (!knobs.litNumbers) return { stops: solveRamp(knobs), inks: null }

  // TWO CLAMPS THAT ONLY EXIST IN LIT MODE, both measured rather than guessed.
  //
  // Lit mode confines the fills to luminance 0.012-0.095, and inside a band
  // that narrow the only thing that can separate one cell from the next is
  // HUE and SATURATION. Eleven steps across the same hue span put neighbours
  // at Δ20 (the floor is 22), and dropping intensity to 0.30 put them at Δ9 —
  // a smear, exactly the failure this whole file exists to prevent. So lit
  // mode tops out at nine steps and holds a saturation floor. Without these
  // two clamps a third of the slider range silently refused to take.
  const n = Math.max(3, Math.min(9, knobs.stops ?? 9))
  const sat = knobs.sat ?? 0.6
  const shape = knobs.satShape ?? 'arch'
  const bright = knobs.brightness ?? 0.6

  // BRIGHTNESS MOVES THE NUMBERS, NOT THE CELLS — and that is a correction.
  //
  // The first version had brightness drive the fill ceiling, which sounds
  // right and made two thirds of the slider range unreachable: lit mode already
  // confines fills to luminance 0.012-0.085, and shrinking that band further
  // pushed neighbouring cells under the Δ22 plateau floor. Swept the whole
  // knob space and only 454 of 1080 combinations solved.
  //
  // So the fill ladder is FIXED at the span that works, and brightness lifts
  // the ink ladder instead. That also matches what the knob means on this
  // construction: in lit mode the number is what you read, so "brightness"
  // asking about the number is the honest reading of the word.
  const fillTop = 0.085
  const inkFloor = 0.30 + 0.10 * bright
  const inkTop = Math.max(0.57, inkFloor + 0.24 + 0.09 * bright)

  const stops = []
  const inks = []
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1)
    let span = (knobs.hueTo ?? 142) - (knobs.hueFrom ?? 2)
    if (span > 180) span -= 360
    if (span < -180) span += 360
    const h = (knobs.hueFrom ?? 2) + span * t
    // The shapes are FLATTER here than in the bright construction, and the dip
    // flattest of all. A collapse to 0.30 saturation is legible when the cell
    // is bright — Verdict's grey middle is the point of Verdict — but inside
    // a 0.012-0.085 luminance band a desaturated cell is indistinguishable
    // from its neighbours. Measured: the dip was the only shape that failed,
    // and it failed every single time until its floor came up to 0.60.
    let sh = 1
    if (shape === 'arch') sh = 0.80 + 0.20 * Math.sin(Math.PI * t)
    else if (shape === 'dip') sh = 0.60 + 0.40 * Math.abs(2 * t - 1)
    else if (shape === 'rise') sh = 0.55 + 0.45 * t
    // NO GREY FLOOR IN LIT MODE. It is an Ember idea — three near-grey cells
    // saying "none of this thing rather than a bad amount of it" — and it
    // needs a bright cell to read as grey rather than as black. Down here a
    // desaturated fill is just another dark rectangle, and it took the plateau
    // check down with it in almost every combination that used one. The studio
    // hides the slider in lit mode rather than offering a knob that refuses.
    const fs = Math.max(0.50, Math.min(1, sat * 1.35 * sh))
    stops.push(atLuminance(h, fs, 0.012 + (fillTop - 0.012) * t))
    inks.push(atLuminance(h, Math.max(0.55, Math.min(1, sat * 1.45 * sh)),
      inkFloor + (inkTop - inkFloor) * t))
  }
  return { stops, inks }
}

/** Everything the guard checks, run in the browser so the UI can show it. */
export function auditRamp(stops, inksOrDark, inkLightArg) {
  // Overloaded on purpose: auditRamp(stops) keeps working for the three fixed
  // ramps, auditRamp(stops, inks) measures a lit-number ramp against its own
  // inks. The alternative was two near-identical functions and a call site
  // that has to know which construction it is holding.
  const own = Array.isArray(inksOrDark) ? inksOrDark : null
  const inkDark = (!own && typeof inksOrDark === 'string') ? inksOrDark : '#0a0a0b'
  const inkLight = inkLightArg || '#f4f4f5'
  const ink = own || stops.map((c) => (contrast(c, inkDark) > contrast(c, inkLight) ? inkDark : inkLight))
  const worst = Math.min(...stops.map((c, i) => contrast(c, ink[i])))
  let closest = Infinity
  for (let i = 1; i < stops.length; i += 1) closest = Math.min(closest, delta(stops[i], stops[i - 1]))
  // On a lit-number ramp the INK is what the eye reads, so it carries the same
  // two guarantees the fills do — ordered in greyscale, no two neighbours
  // collapsing — plus one the fills don't need: it has to be findable against
  // the PAGE, not only against its own cell.
  let inkClosest = Infinity
  let inkMono = true
  let onPage = Infinity
  if (own) {
    for (let i = 1; i < own.length; i += 1) inkClosest = Math.min(inkClosest, delta(own[i], own[i - 1]))
    inkMono = own.every((c, i) => i === 0 || lum(c) > lum(own[i - 1]))
    onPage = Math.min(...own.map((c) => contrast(c, '#111113')))
  }
  const monotonic = stops.every((c, i) => i === 0 || lum(c) > lum(stops[i - 1]))
  // The dead zone is a fact about the two NEUTRAL inks — it is the band where
  // neither clears 4.5:1 — so it does not apply to a ramp that brings its own.
  const dead = own ? 0 : stops.filter((c) => lum(c) > DEAD_LO && lum(c) < DEAD_HI).length
  return {
    worstText: worst,
    closest,
    monotonic,
    inDeadZone: dead,
    inkSwitches: ink.filter((v, i) => i > 0 && v !== ink[i - 1]).length,
    ok: worst >= 4.5 && closest >= 22 && monotonic && !dead
      && (!own || (inkMono && inkClosest >= 22 && onPage >= 4.5)),
  }
}
