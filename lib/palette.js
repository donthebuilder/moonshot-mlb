'use client'
import { useSyncExternalStore } from 'react'

// 🎨 PALETTE — two heat scales, switchable, per device.
//
// 2026-08-09, over three passes. Donovan asked for a toggle with his original
// amber, then for a PropFinder-style green-to-red, then — once he saw it —
// "don't put PropFinder on the site" and "for the traffic use the site's
// colour palette like the HR, hits, top pick and bases thing. Neon-esque.
// Deep green is best, dark red is bad."
//
// So two ramps, and they answer different questions:
//
//   EMBER  one hue, amber. Low is quiet, high glows. Says HOW MUCH — nothing
//          is bad on this scale, only less. His original look.
//   NEON   the site's own accent hues, red through orange and yellow to
//          green. Says HOW GOOD. Dark fill, lit number.
//
// ── HOW THESE ARE BUILT, and why it is not decoration ──────────────────────
//
// Every ramp this site has had before today was hand-picked hexes, and each
// failed one of two ways: the bottom third sat at 1.4:1 against a near-black
// page (a smear you can see but not read), or three adjacent steps collapsed
// into one shade (a plateau that hides differences).
//
// These are SOLVED. The hue path is chosen by taste; the LUMINANCE is then
// forced onto a ladder, searching HSL lightness at each step until it hits a
// target. Measured, not eyeballed:
//
//   ramp     worst text on fill   closest neighbours   fill luminance
//   ember          4.83:1               Δ30            0.075 → 0.573
//   neon           4.71:1               Δ30            0.046 → 0.104
//
// ── THE DEAD ZONE, computed ────────────────────────────────────────────────
// Solving both contrast equations for the two neutral inks:
//
//   white #f8f8f8 clears 4.5:1 on fills up to luminance   0.1697
//   near-black #0a0a0b clears 4.5:1 on fills from         0.1888
//
// 0.170–0.189 is a real gap where NEITHER neutral ink is readable, at any
// hue. It is 0.019 wide, which is exactly why it kept getting missed — easy
// to land in by accident, and the failure is silent. Earlier ramps had stops
// parked in it, and that, more than hue, is why they were hard to read.
//
// (An earlier version of this comment put the zone at 0.16–0.24. That was
// estimated by eye and wrong at both ends; the numbers above are solved.)
//
// EMBER straddles the gap — its ladder steps over it and switches to dark ink
// on the far side. NEON never approaches it: its fills top out at 0.104,
// because its ink is bright rather than neutral. That is the whole trick, and
// it is why neon can go darker than any ramp here has gone.
//
// ── COLOUR BLINDNESS ───────────────────────────────────────────────────────
// Red/green is the worst pair for deuteranopia (~8% of men), so luminance
// rises monotonically on both: strip the colour out entirely and each ramp is
// still correctly ordered dark → light. Hue is the fast read, lightness is
// the fallback that cannot lie.

export const RAMPS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    blurb: 'One colour, amber. Low is quiet, high glows.',
    hint: 'Magnitude without judgement — nothing is “bad” on this scale, just less.',
    stops: ['#764722', '#8d5626', '#9b6024', '#c67b26', '#d58c20', '#dc9f25', '#dbb140', '#dac263', '#dfd292'],
  },
  traffic: {
    id: 'traffic',
    label: 'Neon',
    blurb: 'The site’s own colours. Dark red bad, deep green best.',
    hint: 'Dark tinted cell, bright same-hue number. Reads as a signal rather than a block of paint.',
    // ── THE SITE'S PALETTE, LIT (2026-08-09, third pass) ────────────────
    // Donovan: "for the traffic use the site's colour palette like the HR,
    // hits, top pick and bases thing. Neon-esque. Deep green is best, dark
    // red is bad."
    //
    // The hue path is the site's own accents in order, so a heat cell speaks
    // the same colour language as the tabs and the market chips:
    //
    //   red #f87171 (0°) → orange #f97316 (25°) → yellow #f59e0b (38°)
    //   → green #4ade80 (142°)
    //
    // WHY THIS FINALLY LOOKS NEON, when two earlier attempts did not. Neon is
    // not a bright fill — a bright fill is paint. Neon is a DARK surface with
    // a LIT line on it. So the fill stays deep (luminance 0.046 → 0.104, all
    // of it darker than anything shipped before) and the NUMBER carries the
    // colour at full brightness in the same hue. The cell glows instead of
    // being coloured in.
    //
    // That inverts the usual constraint in a useful way. White-ink ramps are
    // capped at luminance 0.1697 because white has to stay readable on them.
    // Here the ink is bright and the fill is dark, so the fill can go as deep
    // as it likes — the contrast comes from the pair, not from the fill alone.
    // Worst ink-on-fill anywhere is 4.71:1, better than either white-ink ramp.
    //
    // `ink` and `edge` are per-stop and paired with the fill by index. The
    // edge is the same hue at mid brightness: without it a very dark cell at
    // the red end is hard to distinguish from the page (its fill is only
    // 1.82:1 against the background), and the outline is what says "there is
    // a cell here" without brightening the fill and killing the effect.
    stops: ['#7a1111', '#782211', '#6f3310', '#62410e', '#554c0c', '#39570c', '#11600e', '#0e6428', '#0f6842'],
    ink:   ['#fc8888', '#fc9b88', '#fcb288', '#fccd88', '#fcec88', '#cdfc88', '#8cfc88', '#88fcab', '#88fcca'],
    edge:  ['#9c1111', '#9c2811', '#9c4411', '#9c6511', '#9c8a11', '#659c11', '#169c11', '#119c3b', '#119c60'],
  },
}

// PROPFINDER WAS REMOVED 2026-08-09, same day it shipped. Donovan: "don't put
// PropFinder on the site." It was a faithful copy of someone else's tool, and
// the whole point of this site is that it does not look like or behave like
// the tools it competes with. The two that remain are ours: ember says HOW
// MUCH, neon says HOW GOOD in the site's own colours. The solved-ramp method
// that built it is still in this file and still worth having; the palette
// itself is gone.

export const RAMP_IDS = Object.keys(RAMPS)
export const DEFAULT_RAMP = 'traffic'
const KEY = 'moonshot_ramp'

// ── the store ───────────────────────────────────────────────────────────────
// A module-level store rather than React context, for one reason: rampColor()
// is called from deep inside table cell renderers and a few plain helpers that
// are not components at all. Threading a provider through every one of those
// would touch fifty files to change a colour. useSyncExternalStore gives the
// components that DO need to re-render a correct subscription, and everything
// else can read activeStops() directly.
let _current = DEFAULT_RAMP
const _subs = new Set()

const emit = () => _subs.forEach((fn) => fn())

export function subscribe(fn) {
  _subs.add(fn)
  return () => _subs.delete(fn)
}

export function getRamp() { return _current }

export function setRamp(id) {
  if (!RAMPS[id] || id === _current) return
  _current = id
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  emit()
}

/**
 * Load the saved choice. MUST be called from an effect, never during render.
 *
 * The server has no localStorage, so reading it while rendering makes the
 * server and the first client render disagree and React throws the hydrated
 * tree away. Same rule as every other per-device flag here — and the reason
 * getServerSnapshot below always returns the default.
 */
export function hydrateRamp() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && RAMPS[saved] && saved !== _current) {
      _current = saved
      emit()
    }
  } catch { /* private mode */ }
}

export function usePalette() {
  return useSyncExternalStore(subscribe, getRamp, () => DEFAULT_RAMP)
}

/** The active ramp's stops. Safe to call outside React. */
export function activeStops() {
  return (RAMPS[_current] || RAMPS[DEFAULT_RAMP]).stops
}

/** The active ramp, whole. */
export function activeRamp() {
  return RAMPS[_current] || RAMPS[DEFAULT_RAMP]
}

/**
 * The border for a fill, or null when the ramp doesn't use one.
 *
 * Only neon does. Its darkest cell is 1.82:1 against the page — visible, but
 * only just — and the outline is what says "there is a cell here" without
 * brightening the fill and killing the effect.
 */
export function edgeOn(bg) {
  const r = activeRamp()
  if (!r.edge) return null
  const i = r.stops.indexOf(bg)
  return i >= 0 ? r.edge[i] : null
}

// ── ink ─────────────────────────────────────────────────────────────────────
export const INK_DARK = '#0a0a0b'
export const INK_LIGHT = '#f8f8f8'

const _lum = (h) => {
  const p = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}
const _ratio = (a, b) => {
  const [hi, lo] = _lum(a) > _lum(b) ? [_lum(a), _lum(b)] : [_lum(b), _lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Which ink to put on a fill.
 *
 * COMPUTED FROM THE COLOUR ITSELF, not from an index into a ramp. Every time
 * a ramp changed on this site, a hard-coded "switch to dark ink at step N"
 * was left behind and cells silently got harder to read as they got brighter.
 * With three switchable ramps that failure mode would now be three times as
 * likely, so the threshold is gone entirely — this just asks which ink wins.
 */
export function inkOn(bg) {
  if (typeof bg !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(bg)) return INK_LIGHT
  // A ramp may carry its own per-stop ink. Neon does: a bright same-hue
  // number on a deep fill is the entire reason it reads as lit rather than
  // painted, and no neutral ink can produce that.
  const r = activeRamp()
  if (r.ink) {
    const i = r.stops.indexOf(bg)
    if (i >= 0) return r.ink[i]
  }
  return _ratio(bg, INK_DARK) > _ratio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
}
