'use client'
import { nameParts } from '../namePatterns'
import { digitRoot, dayRootOf, lifePathOf } from '../numerology/core'
import { alignedWithBy, alignModel } from '../numerology/align'
const TD_SCORE = (a) => a.tdScore

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 TUDDY NUMEROLOGY — the NFL clone of lib/alignments.js (B10(d), 2026-09-15)
// ════════════════════════════════════════════════════════
//
// Donovan approved porting MLB's Alignments/numerology feature to TUDDY, same
// disclosure line MLB uses everywhere: "pattern watching, not evidence." MLB's
// own 08-28 sweep tested 18 axes -- gematria, birthdate eight ways, jersey,
// lineup-spot root, season-HR root, letters -- against 4,238 real
// player-nights and found ZERO significant axes. This ports the same honest,
// no-signal-claimed method, not a claim that football numbers predict
// anything either.
//
// SAME REDUCTION RULE AS MLB: digitRoot, add the digits until one is left
// (17 -> 8), so a match across different kinds of number means what it looks
// like it means. NOTHING HERE FEEDS A SCORE. Not the model, not a board, not
// a rank -- exactly the same rule lib/alignments.js states for itself.
//
// ── FIVE AXES, NOT SEVEN -- TWO ARE DROPPED, NOT FAKED ──────────────────────
//
// MLB has: next HR, season HR, jersey, birth day, life path, batting-order
// spot (1-9), fielding position code (1-9). The last two are real numbers
// baseball already publishes for every plate appearance -- there is no
// football equivalent to a batting order or a scorekeeper's position code,
// so this file does not invent one. What ports honestly:
//
//   NEXT   the root of his next touchdown (season_td + 1)
//   TD     the root of his season touchdown count so far (when > 0)
//   JERSEY the root of his jersey number
//   DAY    the root of his birth day-of-month
//   PATH   his life path -- every digit of the full birthdate, reduced
//
// jersey_number, birth_date and season_td all come straight off each player
// object in nfl_week.json -- bots/nfl/nfl_numerology.py's header explains
// where each one is sourced and why season_td only counts COMPLETED weeks
// (leak-free, same discipline as everywhere else in this pipeline). A player
// missing a field simply sits out that axis; nothing here defaults a missing
// number to zero, which would manufacture a false root.
//
// ── WHAT DIDN'T PORT (deferred, not forgotten) ──────────────────────────────
//
// MLB's Alignments view also reads back an "aligned with today's number"
// archive that HomerLedger writes live off real graded results, and lets a
// picked player seed the Builder view. NFL has no per-game live results
// writer at TUDDY's cadence yet (games run Thu/Sun/Mon, not nightly) and no
// Builder-equivalent anchor hand-off wired to this view -- both stay out of
// this ship rather than being half-built. What's here is the pregame slate
// engine, the same core MLB's own Alignments view leads with.

// digitRoot / dayRootOf / lifePathOf: one copy, lib/numerology/core.js (2026-09-27).
export { digitRoot, dayRootOf, lifePathOf }

// Calendar-day arithmetic on a 'YYYY-MM-DD' key. Anchored at UTC noon so a
// +/-1 shift never lands on the wrong side of a DST transition -- ported
// verbatim from lib/alignments.js's shiftDateKey.
export function shiftDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The calendar date itself, reduced -- ported verbatim from
// lib/alignments.js's dateDigitRoot. Its own comment explains why this is
// the one archive-free piece of MLB's yesterday/today/tomorrow check: "next
// day" alignment doesn't need tomorrow's roster (nobody has one yet), so a
// player's OWN axes (jersey, birthday, life path -- none of which change day
// to day) can be checked against what TOMORROW's date reduces to without
// reading back any real results. See Numerology.js for why only this half
// of MLB's three-way check ships for NFL.
export function dateDigitRoot(dateKey) {
  const digits = String(dateKey || '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const sum = digits.split('').reduce((a, c) => a + Number(c), 0)
  return sum > 0 ? digitRoot(sum) : null
}


/** Every axis for one NFL player. Null axes are absent, never zero. */
export function axesOf(p) {
  const seasonTd = Number(p?.season_td)
  const hasTd = Number.isFinite(seasonTd) && p?.season_td != null
  // ── ABSENT IS NOT ZERO (fixed 2026-09-18) ────────────────────────────────
  // This read `(hasTd ? seasonTd : 0) + 1`, so a player with NO season_td at
  // all came out as "his next touchdown is #1" and landed in club 1. Measured
  // on the live week-2 slate: 152 of 528 players have no season_td -- Alvin
  // Kamara and Brock Bowers among them, because the field only exists for men
  // with a stats row in a COMPLETED week and those two had not played one.
  // So club 1 was carrying 152 fabricated memberships, 29% of the slate, on
  // the one axis every player was guaranteed to have.
  //
  // bots/nfl/nfl_numerology.py says it plainly in its own docstring: "Missing
  // a row (no roster match, no stats yet) means the field is simply absent --
  // never zero standing in for unknown. The site skips a null axis rather
  // than rendering it as a false root." The bot kept that promise. This file's
  // own header repeats it -- "nothing here defaults a missing number to zero,
  // which would manufacture a false root" -- and then did exactly that.
  //
  // A real 0 is different from absent and stays: a man who has played and not
  // scored is genuinely sitting on 0, and his next touchdown is genuinely #1.
  const nextTd = hasTd ? seasonTd + 1 : null
  const jersey = Number(p?.jersey_number) || 0
  const birthDate = String(p?.birth_date || '')
  return {
    pid: p?.player_id,
    p,
    name: p?.name,
    team: p?.team,
    tdScore: Number(p?.scores?.TD) || 0,
    nextTd,
    seasonTd: hasTd ? seasonTd : null,
    jersey: jersey > 0 ? jersey : null,
    birthDate,
    axes: {
      next: nextTd != null ? digitRoot(nextTd) : null,
      td: hasTd && seasonTd > 0 ? digitRoot(seasonTd) : null,
      jersey: jersey > 0 ? digitRoot(jersey) : null,
      day: dayRootOf(birthDate),
      path: lifePathOf(birthDate),
    },
    parts: nameParts(p?.name),
  }
}

// `raw` is the number BEFORE the reduction -- every axis has one, and every
// surface should print it beside the root, same reasoning as MLB's own
// AXIS_META: "10" and "19" are two different ways of reaching the same 1.
export const AXIS_META = {
  next: { label: 'next TD', why: (a) => (a.nextTd == null ? 'no completed game yet' : `his next touchdown is #${a.nextTd}`), raw: (a) => a.nextTd },
  td: { label: 'season TD', why: (a) => `sitting on ${a.seasonTd}`, raw: (a) => a.seasonTd },
  jersey: { label: 'jersey', why: (a) => `jersey #${a.jersey}`, raw: (a) => a.jersey },
  day: { label: 'birth day', why: (a) => `born on the ${String(a.birthDate).slice(8, 10)}`, raw: (a) => Number(String(a.birthDate).slice(8, 10)) || null },
  path: { label: 'life path', why: (a) => `life path from ${a.birthDate}`, raw: () => null },
}

/**
 * Everyone whose numbers land on ONE root, ranked by how many of them do.
 * Ported verbatim from lib/alignments.js's alignedWith -- same honesty rule:
 * the EXPECTED count ships beside the actual one, every time, from the same
 * call, so a reader can see this is arithmetic before mistaking it for a
 * finding. Five axes over ~500 players is a smaller number space than MLB's
 * seven over ~250, so the arithmetic baseline is recomputed here, not
 * assumed to match MLB's own numbers.
 */
export function alignedWith(root, rows = []) {
  return alignedWithBy(root, rows, TD_SCORE)
}

/**
 * The whole slate, aligned. Ported verbatim from lib/alignments.js's
 * slateAlignments -- clubs (per root 1-9), braids (a player whose own axes
 * agree with each other), and names (first/last families with enough members
 * to not be pure noise: surnames at 2+, first names at 3+).
 */
export function slateAlignments(players = []) {
  const rows = (players || []).map((p) => axesOf(p)).filter((a) => a.pid)
  return alignModel(rows, TD_SCORE)
}
