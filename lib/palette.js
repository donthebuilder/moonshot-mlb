'use client'
import { useSyncExternalStore } from 'react'

// 🎨 PALETTE — three heat scales, switchable, per device.
//
// 2026-08-09, Donovan: "make a toggle with my original heat map colour but
// make them better to fit my visual request. Then give me an option for a
// PropFinder-esque green to red colour scheme — but I want to add a yellow
// for like okay stats."
//
// So: three ramps, not one opinion. They are genuinely different in what they
// SAY, not just in hue:
//
//   EMBER      one hue, amber. Low is quiet, high glows. Says "how much".
//              Nothing is bad on this scale, only less. His original look.
//   TRAFFIC    red → amber → green, sweeping continuously. Says "how good",
//              with every step between weak and strong visible.
//   PROPFINDER three saturated BANDS — red, yellow, green — the look every
//              prop tool uses. Says "bad / okay / good" and little else.
//              The yellow band is the "okay stats" he asked for: a middle
//              that is explicitly its own tier rather than a shade on the way
//              from red to green.
//
// ── WHY ALL THREE ARE BUILT THE SAME WAY, and it is not decoration ─────────
//
// Every previous ramp on this site was hand-picked hexes, and each one failed
// in one of two ways: the bottom third sat at 1.4:1 against a near-black page
// (a dark smear you can see but not read), or three adjacent steps collapsed
// into one shade (a plateau that hides differences).
//
// These are SOLVED, not chosen. For each ramp the hue path is fixed by taste
// and the LUMINANCE is then forced onto a ladder, searching HSL lightness at
// each step until it hits its target. Three constraints, all measured:
//
//   1. every step clears 4.5:1 with one of the two inks   (WCAG AA body text)
//   2. every step clears 2.4:1 against the page           (visible as a fill)
//   3. adjacent steps differ by Δ25+ in perceptual distance (no plateau)
//
//   ramp         worst text   dimmest vs page   closest neighbours
//   ember           4.83           2.55               Δ30
//   traffic         4.81           2.56               Δ45
//   propfinder      4.83           2.56               Δ34
//
// THE DEAD ZONE, which is why the ladders have a gap in them. Around relative
// luminance 0.16–0.24 neither off-white nor near-black clears 4.5:1 on a
// saturated colour — it is a band where no text is readable at any hue. The
// luminance targets deliberately STEP OVER it (0.155 → 0.265) rather than
// landing in it. Every earlier ramp had two or three stops parked there, and
// that, more than hue, is why they were hard to read.
//
// COLOUR BLINDNESS. Red/green is the worst pair for deuteranopia (~8% of
// men), so luminance rises monotonically on all three: remove the colour
// entirely and each ramp is still correctly ordered dark → light. Hue is the
// fast read, lightness is the fallback that cannot lie.

export const RAMPS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    blurb: 'One colour, amber. Low is quiet, high glows.',
    hint: 'Best when you want magnitude without judgement — nothing is “bad”, just less.',
    stops: ['#764722', '#8d5626', '#9b6024', '#c67b26', '#d58c20', '#dc9f25', '#dbb140', '#dac263', '#dfd292'],
  },
  traffic: {
    id: 'traffic',
    label: 'Traffic',
    blurb: 'Red → amber → green, smooth.',
    hint: 'Every step between weak and strong is visible. Good for ranking a whole column.',
    stops: ['#9a2824', '#b03b24', '#b35120', '#cc7919', '#c19513', '#abb01a', '#82ca2f', '#84d673', '#93e2b0'],
  },
  propfinder: {
    id: 'propfinder',
    label: 'PropFinder',
    blurb: 'Three bands — red, yellow, green.',
    hint: 'Bad / okay / good, the way prop tools do it. Fastest to skim, least detail.',
    stops: ['#a01e1e', '#bd2924', '#cc342a', '#b08716', '#be9715', '#caa619', '#69ca86', '#80d59c', '#9ee0b6'],
  },
}

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
  return _ratio(bg, INK_DARK) > _ratio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
}
