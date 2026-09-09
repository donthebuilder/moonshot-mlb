// 🎨 WHAT COLOUR IS A BATTED BALL — one function, two charts.
//
// Created 2026-08-31. Donovan, of the 3D spray: "I want the hits that aren't
// home runs at least lit differently, like the other spray chart."
//
// He was right and the cause was the usual one: SprayFieldStadium had its own
// four-colour ladder — HR, off-the-wall, HIT, OUT — where every non-HR hit,
// single through triple, was ONE grey. The flat chart beside it has always
// drawn five: red HR, purple 3B, green 2B, blue 1B, near-black out. Same
// balls, same page, two vocabularies.
//
// ── WHY THIS FILE EXISTS RATHER THAN AN IMPORT ──────────────────────────────
//
// SprayField dynamically imports SprayFieldStadium, so a static import back
// the other way would close a cycle that only the bundler's laziness keeps
// from biting. A third file that neither owns is the honest shape.
//
// ── AND WHY IT IS A FUNCTION, NOT A TABLE ───────────────────────────────────
//
// lib/theme.js switches themes with Object.assign(C, ...) — it MUTATES C in
// place, after hydration. A module-scope object literal evaluates once, at
// import, BEFORE that mutation, so any C-derived colour baked into a table is
// frozen at whatever the first theme was. SprayField's own RESULT_COLORS
// carries exactly that hazard and its comment flags it; routing every read
// through a call fixes it for both charts at once rather than copying it into
// a second file.
//
// ── THE THREE DELIBERATE DIVERGENCES FROM catColor ──────────────────────────
//
// Kept byte-for-byte from SprayField, including the reasons, because this is a
// move and not a redesign:
//
//   home_run  C.red, not catColor('result','home_run') (= C.orange). Orange is
//             the site accent and would make every homer compete with the UI.
//   double    C.green, not catColor('result','double') (= C.cyan).
//   out       a near-black grey, not catColor('result','out') (= C.text3).
//             The majority case, kept deliberately silent against a dark
//             field. The 2026-08-22 colour audit flags this one: on a LIGHT
//             theme it reads as a hard dark mark rather than a quiet one, and
//             C.text3 would stay quiet in all five. Reported, not resolved —
//             it wants Donovan's eyes in light mode, not a diff.
//
// triple and single are byte-identical to the registry, so they route through
// catColor and follow the theme.
import { C } from './theme'
import { catColor } from './scales'

// OUTS, 2026-08-31. Donovan: "the outs need to be more visible."
//
// This was #3f3f46 — two steps off the background, chosen when the field was
// bright and an out could still be picked out against it. Since the park went
// dark it is barely a mark, and outs are the MAJORITY of any spray chart: a
// hitter's shape is as much where he makes outs as where he does not, so a
// chart that hides most of its own balls is answering half the question.
//
// Raised to a legible slate. Still the quietest thing on the chart by a wide
// margin — every result colour is a saturated hue and this is neutral — but
// now it is a mark rather than a rumour.
const OUT_GREY = '#6b7280'

/**
 * The colour for one batted ball, resolved at CALL TIME.
 * Accepts either shape the two charts use: { hr, event } is all it needs.
 */
export function resultColor(h) {
  if (!h) return OUT_GREY
  if (h.hr || h.event === 'home_run') return C.red
  if (h.event === 'triple') return catColor('result', 'triple')
  if (h.event === 'double') return C.green
  if (h.event === 'single') return catColor('result', 'single')
  return OUT_GREY
}

/** True when this ball was a hit that did NOT leave the yard. */
export function isNonHrHit(h) {
  if (!h || h.hr || h.event === 'home_run') return false
  return h.hit === true
    || h.event === 'triple' || h.event === 'double' || h.event === 'single'
}
