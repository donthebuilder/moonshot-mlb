'use client'
import { useSyncExternalStore } from 'react'

// 🎨 PALETTE — three heat scales, switchable, per device.
//
// 2026-08-09, over four passes, which is worth recording because each pass
// corrected a wrong reading of the last one:
//
//   1. amber toggle asked for → built one ramp
//   2. "PropFinder-esque green to red, with a yellow for okay stats"
//   3. "don't put PropFinder on the site" → I removed the PALETTE. He meant
//      the NAME: "no I wanted the propfinder on there, I just didn't want the
//      name showing." Restored as Verdict.
//   4. "the third picture is the best palette, make that the traffic" — a
//      props table with deep tinted cells and bright same-hue numbers.
//
// The three now:
//
//   EMBER    one hue, amber, BLACK at the worst end. Says HOW MUCH — the
//            bottom is empty rather than bad.
//   SIGNAL   deep cell, lit number, red through amber to green. Says HOW
//            GOOD, with every step in between visible.
//   VERDICT  a diverging scale — neon red for avoid, GREY for nothing to
//            say, neon green for play. No yellow: the middle desaturates
//            rather than rotating through amber.
//
// ── HOW THESE ARE BUILT, and why it is not decoration ──────────────────────
//
// Every ramp this site had before today was hand-picked hexes, and each failed
// one of two ways: the bottom third sat at 1.4:1 against a near-black page (a
// smear you can see but not read), or three adjacent steps collapsed into one
// shade (a plateau that hides differences).
//
// These are SOLVED. Hue path chosen by taste; LUMINANCE then forced onto a
// ladder, searching HSL lightness at each step until it hits target. Then the
// INK is solved too — same hue as its fill, walked up in lightness until it
// clears 5:1 — so readability is guaranteed by construction rather than hoped
// for. Measured:
//
//   ramp      worst ink-on-fill   closest neighbours   fill luminance
//   ember           4.76:1              Δ42            0.004 → 0.345
//   signal          5.00:1              Δ23            0.022 → 0.107
//   verdict         5.00:1              Δ25            0.014 → 0.134
//
// ── THE DEAD ZONE, computed ────────────────────────────────────────────────
// Solving both contrast equations for the two NEUTRAL inks:
//
//   white #f8f8f8 clears 4.5:1 on fills up to luminance   0.1697
//   near-black #0a0a0b clears 4.5:1 on fills from         0.1888
//
// 0.170–0.189 is a gap where neither neutral ink is readable, at any hue. It
// is 0.019 wide — easy to land in by accident, and the failure is silent.
//
// EMBER uses neutral ink so it straddles the gap, stepping over it and
// switching to dark ink on the far side (exactly one switch, asserted).
// SIGNAL and VERDICT never approach it: their fills top out at 0.107 and
// 0.134 because their ink is BRIGHT rather than neutral. That is the trick
// that lets them go so dark — the contrast comes from the pair.
//
// ── COLOUR BLINDNESS ───────────────────────────────────────────────────────
// Red/green is the worst pair for deuteranopia (~8% of men), so luminance
// rises monotonically on all three: strip the colour out entirely and each is
// still correctly ordered dark → light. Hue is the fast read, lightness is the
// fallback that cannot lie.

export const RAMPS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    blurb: 'Black at the worst, amber climbing out of it.',
    hint: 'Magnitude without judgement — the bottom is empty rather than bad.',
    // BLACK FLOOR (2026-08-09, by request: "bring the black for the worst on
    // the original amber heat map"). Floor luminance is 0.0037 — the page
    // itself — so the weakest cell reads as ABSENCE rather than as a colour.
    // That is the honest thing for this scale: ember says HOW MUCH, and the
    // bottom of "how much" is nothing. Every other ramp here has to keep its
    // floor visible because its floor means "bad"; this one's means "none".
    stops: ['#0c0c0e', '#462a0d', '#5d3810', '#724613', '#875414', '#996317', '#aa731c', '#b98523', '#c7972f'],
  },
  traffic: {
    id: 'traffic',
    label: 'Signal',
    blurb: 'Dark cell, lit number. Red weak, green strong.',
    hint: 'Every step between weak and strong is visible — the one to use when ranking a whole column.',
    // ── THE PROPS-TABLE LOOK (2026-08-09, third screenshot) ─────────────
    // Donovan: "honestly the third picture is the best palette, make that the
    // traffic." That table is a deep tinted cell with a bright same-hue
    // number in it, running red through amber to green.
    //
    // Nine hue steps from 0° to 155°, fills held between luminance 0.022 and
    // 0.107 — darker than any white-ink scale could be, because the ink is
    // bright rather than neutral. Every number clears 5.0:1 on its own cell.
    stops: ['#530e0e', '#551e10', '#512d12', '#4c3a12', '#464511', '#3f4f13', '#215b13', '#106321', '#136945'],
    ink:   ['#f66a6a', '#f57c5e', '#f38d3f', '#e4a40f', '#c5be0d', '#9ed30d', '#3beb0f', '#3df361', '#74f6c0'],
    edge:  ['#7e1616', '#802c17', '#7c4216', '#715514', '#686512', '#5a7314', '#2c8217', '#198d30', '#1a9361'],
  },
  verdict: {
    id: 'verdict',
    label: 'Verdict',
    blurb: 'Avoid or play. Red, neutral, neon green — no middle colour.',
    hint: 'A verdict, not a gradient. The middle is deliberately grey: it means the number has nothing to say.',
    // ── NO YELLOW (2026-08-09, by request) ──────────────────────────────
    // Donovan: "no yellow for the verdict one."
    //
    // Getting from red to green without passing through amber means the
    // middle cannot rotate through hue 45 — it has to DESATURATE instead.
    // So this is a diverging scale with a neutral midpoint: saturation runs
    // 0.92 → 0.06 → 0.94 while hue jumps the yellow band entirely.
    //
    // That turns out to say something truer than the amber version did. On a
    // three-tier scale amber reads as "okay", which is a claim. Grey reads as
    // "nothing to say", which is what a middling number actually means. The
    // extremes are the whole point of this ramp; the middle should get out of
    // the way rather than compete for attention.
    //
    // Asserted in test: no fill, ink or edge lands in hue 35-70 with any real
    // saturation. That check exists because "no yellow" is easy to violate by
    // accident — a desaturated orange at hue 40 still reads as dirty yellow.
    stops: ['#4c0306', '#5e0a0a', '#671d18', '#4d3c33', '#42474a', '#3c524e', '#176238', '#0c6c32', '#04762e'],
    ink:   ['#fb585e', '#fb7171', '#fc867e', '#bcb3ae', '#b6bfc3', '#c0cbc9', '#06f66e', '#71fba9', '#befdd5'],
    edge:  ['#74060a', '#8f0808', '#a51309', '#6a5b53', '#58676f', '#5b746f', '#078d41', '#089942', '#09a542'],
  },

}

// NAMING, since it caused a round trip. These are OUR names for OUR scales.
// "PropFinder" named a competitor inside our own settings, which is the one
// place a product should not be pointing at somebody else. Signal and Verdict
// describe what each one does; if the palettes drift over time the names still
// hold.

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
