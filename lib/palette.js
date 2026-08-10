'use client'
import { useSyncExternalStore } from 'react'

// 🎨 PALETTE — three heat scales, switchable, per device.
//
// 2026-08-09, over five passes. Worth recording, because most of them were me
// over-reading the last instruction:
//
//   1. amber toggle asked for → built one ramp
//   2. "PropFinder-esque green to red, with a yellow for okay stats"
//   3. "don't put PropFinder on the site" → I deleted the PALETTE. He meant
//      the NAME. Restored as Verdict.
//   4. "the third picture is the best palette" → I read a props screenshot as
//      "go neon" and built dark cells with bright lit numbers.
//   5. "don't use neon… bright is good, dark is bad… not visually straining"
//      → which is the correction that matters, below.
//
// WHAT PASS 4 GOT WRONG, since it is the interesting one. Putting a bright
// number on a dark cell at EVERY step means the good end and the bad end are
// equally dark, and only hue separates them. That reads as a style, not as a
// scale — and it is the exact opposite of "bright is good, dark is bad". The
// cell itself has to carry the brightness. All three ramps now climb from
// luminance ~0.01 to ~0.55 and use plain neutral ink.
//
// AND SATURATION IS CAPPED AT ~0.55. Twenty-five columns of fully saturated
// colour is what "visually straining" means. None of that intensity was
// carrying information — hue does the same work at half the strength.
//
// The three:
//
//   EMBER    the original amber, unchanged in hue, with a BLACK floor. Says
//            HOW MUCH — the bottom means none, not bad.
//   SIGNAL   red → amber → green, dark to bright. Says HOW GOOD, with every
//            step in between visible.
//   VERDICT  red → grey → green, no yellow anywhere. Says WHICH TIER; the
//            grey middle means the number has nothing to say.
//
// ── HOW THESE ARE BUILT ────────────────────────────────────────────────────
//
// Every ramp this site had before today was hand-picked hexes, and each failed
// one of two ways: the bottom third sat at 1.4:1 against a near-black page (a
// smear you can see but not read), or three adjacent steps collapsed into one
// shade (a plateau that hides differences).
//
// These are SOLVED. Hue path chosen by taste; LUMINANCE forced onto a ladder,
// searching HSL lightness at each step until it hits target. Measured:
//
//   ramp      worst text   closest neighbours   luminance      max saturation
//   ember       4.89:1           Δ54           0.004 → 0.547        0.58
//   signal      4.88:1           Δ36           0.016 → 0.545        0.51
//   verdict     4.88:1           Δ38           0.016 → 0.544        0.54
//
// ── THE DEAD ZONE, computed ────────────────────────────────────────────────
// Solving both contrast equations for the two inks:
//
//   white #f4f4f5 clears 4.5:1 on fills up to luminance   ~0.170
//   near-black #0a0a0b clears 4.5:1 on fills from         ~0.189
//
// 0.170–0.189 is a gap where NEITHER ink is readable, at any hue. It is 0.019
// wide — easy to land in by accident, and the failure is silent. Every ramp
// here steps over it, and a test asserts no stop lands inside. That single
// check is what separates these from every earlier attempt: the old ramps all
// had two or three stops parked in the gap.
//
// Each ramp switches ink exactly once, on the far side of the gap. Asserted.
//
// ── COLOUR BLINDNESS ───────────────────────────────────────────────────────
// Red/green is the worst pair for deuteranopia (~8% of men), so luminance
// rises monotonically on all three: strip the colour out entirely and each is
// still correctly ordered dark → light. Hue is the fast read, lightness is the
// fallback that cannot lie. Verdict leans on red/green hardest, which is why
// its middle is grey rather than a third hue.

export const RAMPS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    blurb: 'The original amber. Black at the bottom, warm at the top.',
    hint: 'Magnitude without judgement — the bottom means none, not bad.',
    // BACK TO THE ORIGINAL (2026-08-09, fourth pass). Donovan: "for the
    // original amber one go back to original, just help with seeing it
    // visually." So the hue path is the amber it always was (30°–43°) and
    // nothing else changed except the two things that made it hard to read:
    //   · the floor is BLACK on purpose, per his earlier ask — on this scale
    //     the bottom means "none", so it should look like nothing.
    //   · every step above it now clears 4.5:1 with one of the two inks, and
    //     the ladder steps OVER the 0.170–0.189 dead zone instead of parking
    //     two stops in it, which is what made the old one a smear.
    // Worst text anywhere 4.89:1; closest neighbours Δ54.
    stops: ['#0c0c0e', '#402a13', '#593d19', '#735020', '#8b6325', '#ad8031', '#c1943d', '#c9ac6c', '#d3c297'],
  },
  traffic: {
    id: 'traffic',
    label: 'Signal',
    blurb: 'Dark is bad, bright is good. Red through amber to green.',
    hint: 'Every step between weak and strong is visible — the one to use when ranking a whole column.',
    // ── NO NEON (2026-08-09, fourth pass) ───────────────────────────────
    // Donovan: "don't use neon for the other colour schemes, I like the
    // palette just not the neon vibe… bright is good, dark is bad, just make
    // sure it's easy to read and useful and not visually straining."
    //
    // Two real changes, and the first one reverses a decision I made an hour
    // earlier. The neon version put a BRIGHT NUMBER on a DARK CELL at every
    // step, which meant the good end and the bad end were equally dark and
    // the only thing separating them was hue. That is the opposite of "bright
    // is good, dark is bad" — the cell has to carry the brightness, so the
    // ramp climbs from luminance 0.016 to 0.545 and the ink goes back to
    // plain light-on-dark, dark-on-light.
    //
    // Second: saturation is capped at 0.51. Fully saturated fills at this
    // density are what "visually straining" means — twenty-five columns of
    // pure colour is a headache, and none of that saturation was carrying
    // information. Hue does the work at half the intensity.
    stops: ['#3d1614', '#49251a', '#5a3c21', '#6a5427', '#736c2d', '#76913e', '#61ad51', '#7cbe89', '#9cceb4'],
  },
  verdict: {
    id: 'verdict',
    label: 'Verdict',
    blurb: 'Avoid or play. Red, neutral, green — no yellow.',
    hint: 'A verdict, not a gradient. The middle is deliberately grey: the number has nothing to say.',
    // Same muted treatment as Signal, same dark-to-bright direction, with one
    // difference that is the whole reason it exists: NO YELLOW, per "no
    // yellow for the verdict one". Getting red to green without amber means
    // the middle cannot rotate through hue 45 — it DESATURATES instead, to
    // 0.05 at the midpoint before climbing back into green.
    //
    // Which says something truer than amber did. On a three-tier scale amber
    // reads as "okay", and that is a claim. Grey reads as "nothing to say",
    // which is what a middling number actually means.
    stops: ['#401314', '#541c1c', '#6a322b', '#625547', '#646c6f', '#6c8f89', '#57ac74', '#72bf8e', '#8fd1ac'],
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
