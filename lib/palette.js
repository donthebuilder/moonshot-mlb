'use client'
import { useSyncExternalStore } from 'react'

// 🎨 PALETTE — three heat scales, switchable, per device.
//
// 2026-08-09, over five passes. Recorded honestly because four of them were me
// over-reading the instruction before:
//
//   1. "toggle with my original amber" → built one ramp
//   2. "PropFinder-esque green to red, yellow for okay stats" → built it
//   3. "don't put PropFinder on the site" → I deleted the PALETTE. He meant
//      the NAME. Restored as Verdict.
//   4. "the third picture is the best palette" → I read a props screenshot as
//      "go neon" and made dark cells with bright lit numbers, which is the
//      opposite of "bright is good, dark is bad".
//   5. "Signal back to the style before, just not neon and brighter. Verdict
//      strictly red to green. The original amber reverts." ← where it landed.
//
// THE THREE ARE GENUINELY DIFFERENT, which was the other half of pass 5 ("all
// should be different"). At one point Signal and Verdict were the same
// construction with slightly different numbers — a toggle with nothing behind
// it. They now answer three different questions:
//
//   EMBER    ONE hue, amber, 8 stops. Says HOW MUCH. The bottom means none,
//            not bad. Reverted verbatim to the pre-today ramp.
//   SIGNAL   hue 2° → 142°, through amber. Says HOW GOOD, every step between
//            weak and strong visible. The one for ranking a column.
//   VERDICT  hue 356° and 146°, nothing between. Says WHICH SIDE OF THE LINE.
//            Grey in the middle, because a middling number is not a
//            recommendation.
//
// ── HOW SIGNAL AND VERDICT ARE BUILT ───────────────────────────────────────
//
// Hue path chosen by taste; LUMINANCE then forced onto a ladder, searching HSL
// lightness at each step until it hits target. Dark is bad, bright is good —
// the CELL carries the brightness, not the text. Measured:
//
//   ramp      worst text   closest neighbours   luminance
//   ember       4.64:1           Δ30           0.009 → 0.483
//   signal      4.64:1           Δ45           0.085 → 0.608
//   verdict     4.81:1           Δ47           0.060 → 0.561
//
// ── THE DEAD ZONE, computed ────────────────────────────────────────────────
// Solving both contrast equations for the two inks:
//
//   white #f4f4f5 clears 4.5:1 on fills up to luminance   ~0.170
//   near-black #0a0a0b clears 4.5:1 on fills from         ~0.189
//
// 0.170–0.189 is a gap where NEITHER ink is readable, at any hue. It is 0.019
// wide — easy to land in by accident, and the failure is silent. All three
// step over it and a test asserts no stop lands inside. That single check is
// what separated the rebuilt ramps from the old ones; the pre-2026-08-07
// versions had two or three stops parked in the gap, which is what made them
// a smear. The current ember already fixed that on 2026-08-07, which I had
// forgotten when I started rebuilding it this morning.
//
// Each ramp switches ink exactly once, on the far side of the gap. Asserted.
//
// ── COLOUR BLINDNESS ───────────────────────────────────────────────────────
// Red/green is the worst pair for deuteranopia (~8% of men), so luminance
// rises monotonically on all three: strip the colour out and each is still
// correctly ordered dark → light. Hue is the fast read, lightness is the
// fallback that cannot lie. Verdict leans on red/green hardest, which is why
// its middle is grey rather than a third hue.

export const RAMPS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    blurb: 'The original. One colour, dark to bright amber.',
    hint: 'Magnitude without judgement — the bottom means none, not bad.',
    // ── REVERTED VERBATIM (2026-08-09, fifth pass) ──────────────────────
    // Donovan: "the original amber one should revert back to how it was
    // before the colour changing."
    //
    // These are the exact eight hexes from commit d4d4793, the ramp that was
    // live before any of today's work. Not rebuilt, not re-solved, not
    // "improved" — copied. I spent four passes making this ramp better by my
    // own measure and he asked for it back, which is the correct answer: it
    // is his site, he reads these boards every night, and a contrast number
    // is not an argument against someone who can see the thing.
    //
    // It is also, for the record, fine: worst text 4.64:1, nothing parked in
    // the 0.170-0.189 dead zone, one ink switch, closest neighbours Δ30. The
    // problem it once had was fixed in v2 back on 2026-08-07 and I had
    // forgotten that when I started rebuilding it this morning.
    //
    // Eight stops, not nine. Everything reads the ramp's length rather than
    // assuming, so it does not matter — and matching the original exactly
    // matters more than matching the others.
    stops: ['#17171b', '#1f2027', '#2b2c35', '#4b3a2a', '#7a5220', '#b06a18', '#e08616', '#fca63a'],
  },
  traffic: {
    id: 'traffic',
    label: 'Signal',
    blurb: 'Red through amber to green. Dark is bad, bright is good.',
    hint: 'Every step between weak and strong is visible — the one to use when ranking a whole column.',
    // ── BACK TO THE PRE-NEON STYLE, BRIGHTER (2026-08-09, fifth pass) ────
    // Donovan: "Signal needs to go back to the colour style before, just not
    // neon, and can be brighter."
    //
    // So this is the traffic-light from before the neon detour — hue walking
    // 2° to 142°, red through orange and yellow to green — with the whole
    // ladder lifted. Luminance now runs 0.085 → 0.608 where the muted version
    // topped out at 0.545 and the neon one at 0.107. The green end is a
    // genuinely bright green rather than a dark cell with a lit number.
    stops: ['#9a2824', '#ae3b24', '#b35120', '#c17218', '#bc9113', '#a8ad1a', '#80c72f', '#7dd46b', '#88dfa8'],
  },
  verdict: {
    id: 'verdict',
    label: 'Verdict',
    blurb: 'Strictly red to green. No amber anywhere.',
    hint: 'A verdict, not a gradient. Red is avoid, green is play, and the middle is grey because a middling number is not a recommendation.',
    // ── STRICTLY RED TO GREEN (2026-08-09, fifth pass) ──────────────────
    // Donovan: "Verdict is strictly red to green, I attached a picture."
    //
    // Two hues and nothing else. Getting from red to green without touching
    // amber means the middle cannot rotate through hue 45 — it DESATURATES,
    // to 0.05 at the midpoint, then climbs back out into green. Hue never
    // sits between 20° and 140°.
    //
    // THE THREE ARE NOW GENUINELY DIFFERENT, which was the other half of the
    // note ("all should be different"). Before this pass Signal and Verdict
    // were the same construction with slightly different numbers, and that is
    // a toggle with nothing behind it:
    //
    //   ember    one hue, 8 stops   — how much
    //   signal   hue 2° → 142°      — how good, every step visible
    //   verdict  hue 356° and 146°  — which side of the line, nothing between
    //
    // Asserted in test: Signal passes through amber, Verdict never does, and
    // Ember never leaves it.
    stops: ['#812229', '#9b2c30', '#b23c38', '#ab6d63', '#858b91', '#5ea883', '#3cbe74', '#61ca8f', '#8cd5ac'],
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
 * Border for a fill. No ramp uses one any more; kept so the ~2 call sites that
 * ask for it keep working.
 *
 * The neon pass (2026-08-09) needed an outline because its fills were too dark
 * to locate on the page. That is gone — every ramp now climbs into genuinely
 * bright territory at the good end — so this returns null and the tables draw
 * no ring. Removing the callers as well would be a wider diff for no gain.
 */
export function edgeOn() {
  return null
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
  // ONE RULE FOR EVERY RAMP: whichever neutral ink wins on this fill.
  //
  // Per-stop ink was tried and removed the same day. It let a ramp opt out of
  // the dead-zone constraint (0.170-0.189, where neither neutral ink is
  // readable) by supplying its own bright colour — which is exactly how a
  // future ramp would quietly become unreadable for anyone who did not know
  // that rule existed. Solving contrast per colour, every time, cannot drift.
  return _ratio(bg, INK_DARK) > _ratio(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT
}
