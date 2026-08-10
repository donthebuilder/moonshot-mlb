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

/** Everything the guard checks, run in the browser so the UI can show it. */
export function auditRamp(stops, inkDark = '#0a0a0b', inkLight = '#f4f4f5') {
  const ink = stops.map((c) => (contrast(c, inkDark) > contrast(c, inkLight) ? inkDark : inkLight))
  const worst = Math.min(...stops.map((c, i) => contrast(c, ink[i])))
  let closest = Infinity
  for (let i = 1; i < stops.length; i += 1) closest = Math.min(closest, delta(stops[i], stops[i - 1]))
  return {
    worstText: worst,
    closest,
    monotonic: stops.every((c, i) => i === 0 || lum(c) > lum(stops[i - 1])),
    inDeadZone: stops.filter((c) => lum(c) > DEAD_LO && lum(c) < DEAD_HI).length,
    inkSwitches: ink.filter((v, i) => i > 0 && v !== ink[i - 1]).length,
    ok: worst >= 4.5 && closest >= 22
      && stops.every((c, i) => i === 0 || lum(c) > lum(stops[i - 1]))
      && !stops.some((c) => lum(c) > DEAD_LO && lum(c) < DEAD_HI),
  }
}
