'use client'
import { useSyncExternalStore } from 'react'
import { solveRamp, auditRamp } from './rampSolver'

// 🎨 PALETTE — four heat scales, switchable, per device.
//
// The fourth (2026-08-10) is YOURS: solved live from sliders in the browser
// rather than written here. See RAMPS.custom and lib/rampSolver.js. Three
// fixed answers plus a knob, because seven rounds of me guessing at a colour
// from a written description is not a loop that converges.
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
//   EMBER    ONE hue, amber, 8 stops. Says HOW MUCH. Same shape as the ramp
//            that was live before today, with the whole ladder turned up.
//   SIGNAL   hue 2° → 142°, through amber. Says HOW GOOD, every step between
//            weak and strong visible. The one for ranking a column.
//   VERDICT  PropFinder's own reds and greens, sampled off the screenshot.
//            Says WHICH SIDE OF THE LINE, with nothing between.
//
// ── HOW SIGNAL AND VERDICT ARE BUILT ───────────────────────────────────────
//
// Hue path chosen by taste; LUMINANCE then forced onto a ladder, searching HSL
// lightness at each step until it hits target. Dark is bad, bright is good —
// the CELL carries the brightness, not the text. Measured:
//
//   ramp      worst text   closest neighbours   luminance
//   ember       4.78:1           Δ40           0.016 → 0.561
//   signal      4.77:1           Δ42           0.055 → 0.475
//   verdict     4.80:1           Δ33           0.016 → 0.393
//   yours       4.70:1           Δ46           0.034 → 0.516   (seed)
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
// a smear. The pre-today ember had already fixed that on 2026-08-07, which I
// had forgotten when I started rebuilding it this morning — most of why the
// palette went round in circles today.
//
// Each ramp switches ink exactly once, on the far side of the gap. Asserted.
//
// ── EVERY RAMP CARRIES ITS SPEC ────────────────────────────────────────────
// Each ramp records the @lum / @sat / @hue ladder it was solved against, and
// a test asserts those numbers still match the actual hexes. A comment that
// drifts from its code is worse than no comment — it is a confident lie, and
// this file has been rewritten six times in one day.
//
// The @ tags exist because the first version of that test matched PROSE. It
// looked for "luminance" followed by numbers and found the sentence "the top
// goes from luminance 0.483 to 0.561" instead of the table, then failed a
// correct ramp. A machine-readable tag cannot be confused with a paragraph.
//
// The SATURATION CURVES are where the three differ most, and reading them
// side by side is the fastest way to see why there are three:
//
//   ember    .11 → .97   rises with luminance      more of one thing
//   signal   .62 ↗ .82 ↘ .58   arch, peaks middle  a sweep you can rank
//   verdict  .51 ↗ .74 ↓ .10 ↗ .70   collapses     extremes only
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
    blurb: 'The original amber, turned up.',
    hint: 'Magnitude without judgement — the bottom means none, not bad.',
    // ── THE ORIGINAL, TURNED UP (2026-08-09, sixth pass) ────────────────
    // Donovan: "turn the ember on up."
    //
    // Same shape as the ramp he asked me to revert to an hour ago — eight
    // stops, cool charcoal at the bottom, one amber hue from step 3 up. The
    // only change is that the whole ladder is lifted: the top goes from
    // luminance 0.483 to 0.561 and the middle from 0.103 to 0.150, so the
    // warm half of the ramp reads as warm instead of as brown.
    //
    // The hue path is untouched (29-33°, the same amber), which is the part
    // he keeps asking me not to redesign. Brightness was the ask; hue was not.
    //
    // Eight stops, not nine, deliberately — everything reads the ramp's
    // length rather than assuming, and matching the original's shape matters
    // more than matching the other two.
    //
    // THE SPEC IT WAS SOLVED AGAINST, recorded so the next edit is an
    // adjustment rather than a fresh guess:
    //
    //   @lum .016 .028 .045 .085 .150 .265 .400 .561      rising
    //   @sat .11 .11 .11 .28 .59 .76 .82 .97               rising
    //   @hue 240 235 236 29 33 32 33 33
    //
    // Saturation rises WITH luminance here, which is what makes it read as
    // "more of the same thing" rather than as a scale from bad to good. The
    // three cool stops at the bottom are near-grey on purpose: they are the
    // absence end, and giving them amber would imply a small amount of
    // something rather than none of it.
    stops: ['#212129', '#2d2e38', '#3a3b48', '#654e39', '#926226', '#cb791c', '#eb9730', '#fdb863'],
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
    // ladder lifted off the neon version's 0.107 ceiling.
    //
    // THEN PULLED BACK DOWN (2026-08-10). Donovan: "Signal make it a little
    // darker, kinda like how it was originally." The 0.085 → 0.608 version
    // was brighter than the ramp he had before any of this started; it now
    // runs 0.055 → 0.475, which sits just under the original's feel while
    // keeping every readability constraint. Hue path unchanged.
    //
    // THE SPEC IT WAS SOLVED AGAINST:
    //
    //   @lum .055 .080 .108 .150 .204 .264 .330 .401 .475   rising
    //   @sat .62 .66 .70 .78 .82 .74 .62 .55 .58              arch
    //   @hue 2 10 20 32 45 62 88 110 142                       sweeping
    //
    // The saturation ARCH is the part that matters and the part I got wrong
    // twice. It peaks at .82 in the amber middle and falls to .55-.62 at both
    // ends. Flat-high saturation across a 140° sweep is what made the earlier
    // versions strain: the red and green ends fight each other for attention
    // when both are at full strength, and the middle disappears between them.
    // Letting the middle be the loudest step keeps the sweep legible as a
    // sweep. Verdict does the opposite on purpose — see below.
    stops: ['#7d201d', '#8f301d', '#97441b', '#9d5d13', '#9b780f', '#8e9216', '#6eac28', '#4fc138', '#4acf7b'],
  },
  verdict: {
    id: 'verdict',
    label: 'Verdict',
    blurb: 'Deep maroon to forest green. No amber anywhere.',
    hint: 'A verdict, not a gradient. Red is avoid, green is play, and the middle is grey because a middling number is not a recommendation.',
    // ── MATCHED TO THE SCREENSHOT (2026-08-09, sixth pass) ──────────────
    // Donovan: "try to match them PropFinder colours as close as possible."
    //
    // So I sampled the cells out of his screenshot rather than eyeballing a
    // red and a green:
    //
    //   reds    #3d1418 (354°, sat .51)  #7f1d24 (356°, .62)  #b91c1c (0°, .74)
    //   greens  #12351f (142°, .50)      #1a5c31 (141°, .56)  #22c55e (142°, .70)
    //
    // Those exact hues and saturations are what this ramp now uses — 354-0°
    // for the reds, 141-142° for the greens, saturation climbing .51 → .74
    // and .50 → .70 exactly as theirs does.
    //
    // ONE DELIBERATE DIFFERENCE, and it is worth naming rather than hiding.
    // Their scale is NOT ordered by brightness: their worst red (#b91c1c,
    // luminance 0.112) is BRIGHTER than their mid green (#1a5c31, 0.081).
    // Interpolating through their anchors verbatim produces a ramp that
    // scrambles in greyscale, which is the one thing that makes red/green
    // usable for the ~8% of men who cannot separate the hues. So the hues and
    // saturations are theirs and the luminance ladder is ours: 0.016 → 0.393,
    // rising the whole way.
    //
    // FOREST, NOT EMERALD (2026-08-10). Donovan: "is there any way to get
    // closer to the green and red from PropFinder — it's more of a forest
    // green." He was right; my green end was #26d767 at luminance 0.500, a
    // mint. Theirs sit at 0.028-0.081. The green half now tops out at 0.393
    // with saturation pulled from .70 to .58, which reads as forest while
    // still clearing the ladder. Going all the way down to their 0.081 would
    // put the whole green half below the red half and break the greyscale
    // ordering — this is as close as the monotonic constraint allows.
    //
    // The visible result is very close to the screenshot. The invisible
    // result is that it still works with the colour taken out.
    //
    // THE SPEC IT WAS SOLVED AGAINST:
    //
    //   @lum .016 .030 .050 .078 .119 .205 .263 .326 .393   rising
    //   @sat .51 .59 .66 .74 .10 .46 .50 .54 .58              two arcs
    //   @hue 354 355 357 0 150 143 142 141 141                 two families
    //
    // The saturation profile is the OPPOSITE of Signal's and that is the
    // whole difference between the two ramps. Signal peaks in the middle so
    // the sweep stays readable as a sweep. Verdict COLLAPSES in the middle,
    // to .10, and climbs to its loudest at both ends — because a verdict is
    // about the extremes and the middle is meant to be ignorable.
    //
    // Read the two saturation curves side by side and you can see the two
    // ramps are answering different questions, which is what "all should be
    // different" asked for.

    stops: ['#3e1418', '#5c181e', '#7b191e', '#9d1717', '#52655b', '#348d56', '#359f5c', '#34b060', '#33c065'],
  },
  custom: {
    id: 'custom',
    label: 'Yours',
    blurb: 'Built on the sliders. Yours, per device.',
    hint: 'Move the knobs until it looks right — the solver keeps it readable no matter where you put them.',
    // ── THE ONE HE BUILDS HIMSELF (2026-08-10) ──────────────────────────
    // Donovan: "is there a way to make it so I can just customise on the
    // site?"
    //
    // Yes, and it is the right ask. Seven rounds of me guessing at a colour
    // from a description is not a loop that converges — the thing being
    // communicated is a visual impression and the channel is words. He moves
    // sliders, the board recolours under his hand, he stops when it looks
    // right.
    //
    // THIS IS NOT A COLOUR PICKER. The knobs are the parameters the other
    // three were solved against — hue start/end, saturation, brightness,
    // saturation shape — and lib/rampSolver.js still enforces the rising
    // luminance ladder, the dead-zone step-over, 4.5:1 with an ink and the
    // no-plateau floor underneath. An unreadable ramp is not reachable from
    // the UI. Handing over nine hex fields instead would have reintroduced
    // every failure the last two days were spent removing.
    //
    // The stops below are the SEED — solveRamp's defaults, and what he sees
    // before he touches anything. Once he saves knobs they live in
    // localStorage and this array is replaced at runtime; the seed stays here
    // so the palette guard has something real to check and so a device with
    // no saved knobs still gets a legal ramp.
    //
    // THE SPEC THE SEED WAS SOLVED AGAINST:
    //
    //   @lum .034 .094 .153 .216 .273 .338 .399 .457 .516   rising
    //   @sat .44 .49 .55 .59 .60 .59 .55 .50 .43              arch
    //   @hue 2 19 37 55 72 90 107 125 143                      sweeping
    stops: ['#572422', '#81472c', '#8d6629', '#8b8224', '#829826', '#6eae2d', '#55c037', '#60ca68', '#84cea0'],
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
const KNOB_KEY = 'moonshot_ramp_knobs'

// ── the custom ramp's knobs ─────────────────────────────────────────────────
// Kept beside the store rather than inside the component, for the same reason
// the active ramp is: rampColor() is called from helpers that are not
// components, and the solved stops have to be readable from all of them.
export const DEFAULT_KNOBS = {
  hueFrom: 2, hueTo: 142, sat: 0.6, brightness: 0.6, satShape: 'arch', stops: 9, greyBottom: 0,
}
let _knobs = { ...DEFAULT_KNOBS }

export function getKnobs() { return { ..._knobs } }

/**
 * Re-solve the custom ramp. Called on every slider drag, so it does the work
 * and then emits once — the maths is ~200 binary-search steps, cheap enough to
 * run live, which is the entire point of the exercise.
 *
 * A rejected solve LEAVES THE OLD STOPS ALONE rather than shipping a broken
 * ramp. The solver clamps rather than fails in almost every case; this is the
 * belt to its braces.
 */
export function setKnobs(next, { persist = true } = {}) {
  const k = { ..._knobs, ...next }
  const solved = solveRamp(k)
  if (!auditRamp(solved).ok) return false
  _knobs = k
  RAMPS.custom.stops = solved
  if (persist) { try { localStorage.setItem(KNOB_KEY, JSON.stringify(k)) } catch { /* private mode */ } }
  emit()
  return true
}

export function resetKnobs() { return setKnobs(DEFAULT_KNOBS) }

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
    // Knobs first, so that if the saved ramp IS 'custom' the stops are already
    // his by the time the subscribers wake up — otherwise the board paints the
    // seed and then repaints, which reads as a flash of the wrong palette.
    const rawKnobs = localStorage.getItem(KNOB_KEY)
    if (rawKnobs) {
      const k = JSON.parse(rawKnobs)
      if (k && typeof k === 'object') setKnobs(k, { persist: false })
    }
  } catch { /* private mode, or knobs from an older shape */ }
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
