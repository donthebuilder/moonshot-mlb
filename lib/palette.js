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
// ── THE PROPFINDER TREATMENT (2026-08-09, second pass) ─────────────────────
//
// Donovan sent a PropFinder screenshot: "make the traffic one how I'd like the
// propfinder one, then just keep the propfinder one like their style."
//
// The screenshot made one thing obvious that I had got wrong. Their cells are
// DEEP, SATURATED, AND CARRY WHITE TEXT — every single one. My first pass ran
// the ramp from dark up to pale mint, so the strong end was light fills with
// near-black ink. That reads as two different tables stacked on top of each
// other, and it is not what he was pointing at.
//
// White ink on every cell is not a style choice, it is a HARD CONSTRAINT, and
// it is the whole reason PropFinder looks the way it does:
//
//   white (#f8f8f8) at 4.5:1  →  the fill's luminance must be ≤ 0.171
//   visible against the page  →  the fill's luminance must be ≥ 0.079
//
// Nine stops have to fit inside 0.082–0.169. That is a band barely twice as
// bright at the top as at the bottom, so LIGHTNESS cannot do the separating —
// hue and saturation have to, which forces the deep jewel tones. Working
// backwards from "white text everywhere" gets you their palette almost
// exactly; it was never an aesthetic anyone chose freehand.
//
// TRAFFIC AND PROPFINDER NOW SHARE THAT TREATMENT and differ in one thing:
// how much hue moves in the middle. PropFinder holds three tight bands
// (crimson / olive / forest) so a cell announces its TIER. Traffic sweeps the
// hue continuously so adjacent steps stay distinguishable and you can rank a
// whole column. Same look, different resolution.
//
// EMBER is deliberately left alone. It is the one scale that says "how much"
// rather than "how good", it does not need a red end, and it is his original.
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
//   ember           4.83           2.55               Δ30   (mixed ink)
//   traffic         4.52           2.49               Δ29   (white ink throughout)
//   propfinder      4.52           2.50               Δ40   (white ink throughout)
//
// THE DEAD ZONE, computed rather than eyeballed. Solving both contrast
// equations against the two inks:
//
//   white #f8f8f8 clears 4.5:1 on fills up to luminance   0.1697
//   near-black #0a0a0b clears 4.5:1 on fills from         0.1888
//
// so 0.170–0.189 is a real gap where NEITHER ink is readable, at any hue.
// It is 0.019 wide, which is exactly why it kept getting missed: it is easy to
// land a stop in a 0.02-wide band by accident and the failure is silent.
// Every earlier ramp here had a stop or two parked in it, and that, more than
// hue, is why they were hard to read.
//
// (An earlier version of this comment said the zone was 0.16–0.24. That was
// estimated by eye and wrong on both ends — the numbers above are solved.)
//
// The three ramps avoid it in two different ways, which is worth knowing when
// editing them:
//
//   EMBER uses BOTH inks, so it straddles the zone: its ladder steps over the
//   gap (0.155 → 0.265) and switches to dark ink on the far side.
//
//   TRAFFIC and PROPFINDER use white ink only, so they stop just short of the
//   gap: everything lives in 0.082–0.169, with the top stop 0.002 below the
//   white-ink ceiling (0.1697). Under the gap rather than across it.
//
// Practical consequence: you cannot brighten traffic or propfinder "a little"
// without crossing into the dead zone and making a row unreadable. If they
// ever need to go lighter, the ink has to change too.
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
    blurb: 'Deep red → olive → deep green.',
    hint: 'The PropFinder treatment with more hue in the middle, so you can rank a whole column and not just read its tier.',
    stops: ['#a1141d', '#95391c', '#854e1f', '#81590a', '#766406', '#686e0c', '#397b12', '#1a8125', '#1e8253'],
  },
  propfinder: {
    id: 'propfinder',
    label: 'PropFinder',
    blurb: 'Strictly red → yellow → green. Green good, red bad.',
    hint: 'Bad / okay / good, the way the prop tools do it. Fastest to skim, least detail.',
    // 2026-08-09, second correction. Donovan: "PropFinder is strictly green
    // to red, green is good red is bad." The floor was #a01238 — a crimson
    // sitting at hue 344, which is on the magenta side of red. On a nine-cell
    // row that reads as a fourth colour and quietly breaks the only rule the
    // scale has. Every stop is now inside hue 2-150: pure red, through
    // yellow, to green, and it never wraps past 300 into pink.
    stops: ['#a2130e', '#9f2e1c', '#944427', '#8d5306', '#816005', '#756a0c', '#127e0e', '#17812f', '#208251'],
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
