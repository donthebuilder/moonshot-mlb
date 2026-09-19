'use client'
import { nameParts } from '../namePatterns'

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

export const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

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

export const dayRootOf = (birthDate) => {
  const d = Number(String(birthDate || '').slice(8, 10))
  return d > 0 ? digitRoot(d) : null
}
export const lifePathOf = (birthDate) => {
  const digits = String(birthDate || '').replace(/[^0-9]/g, '')
  if (digits.length < 8) return null
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
  if (!(root >= 1 && root <= 9)) return null
  let axisTotal = 0
  const members = []
  rows.forEach((a) => {
    const keys = Object.entries(a.axes).filter(([, v]) => v != null)
    axisTotal += keys.length
    const hit = keys.filter(([, v]) => v === root).map(([k]) => k)
    if (hit.length) members.push({ a, keys: hit, strength: hit.length })
  })
  members.sort((x, y) => (y.strength - x.strength) || (y.a.tdScore - x.a.tdScore))
  const expectedMemberships = axisTotal / 9
  const expectedTwoPlus = rows.reduce((sum, a) => {
    const k = Object.values(a.axes).filter((v) => v != null).length
    if (k < 2) return sum
    const q = 8 / 9
    const pNone = q ** k
    const pOne = k * (1 / 9) * (q ** (k - 1))
    return sum + (1 - pNone - pOne)
  }, 0)
  const med = (xs) => {
    const a = xs.filter((v) => Number.isFinite(v)).sort((x, y) => x - y)
    if (!a.length) return null
    const m = Math.floor(a.length / 2)
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  }
  const twoPlusMembers = members.filter((m) => m.strength >= 2)
  return {
    root,
    members,
    total: members.length,
    twoPlus: twoPlusMembers.length,
    expectedMemberships,
    expectedTwoPlus,
    byBotScore: [...twoPlusMembers].sort((x, y) => (y.a.tdScore - x.a.tdScore) || (y.strength - x.strength)),
    medianScoreAligned: med(twoPlusMembers.map((m) => m.a.tdScore)),
    medianScoreSlate: med(rows.map((a) => a.tdScore)),
  }
}

/**
 * The whole slate, aligned. Ported verbatim from lib/alignments.js's
 * slateAlignments -- clubs (per root 1-9), braids (a player whose own axes
 * agree with each other), and names (first/last families with enough members
 * to not be pure noise: surnames at 2+, first names at 3+).
 */
export function slateAlignments(players = []) {
  const rows = (players || []).map((p) => axesOf(p)).filter((a) => a.pid)

  const clubs = new Map()
  for (let r = 1; r <= 9; r += 1) clubs.set(r, { root: r, members: [], count: 0 })
  rows.forEach((a) => {
    const byRoot = new Map()
    Object.entries(a.axes).forEach(([k, v]) => {
      if (v == null) return
      if (!byRoot.has(v)) byRoot.set(v, [])
      byRoot.get(v).push(k)
    })
    byRoot.forEach((axisKeys, root) => {
      const c = clubs.get(root)
      if (!c) return
      c.members.push({ a, axisKeys })
      c.count += axisKeys.length
    })
  })
  const totalMemberships = [...clubs.values()].reduce((s, c) => s + c.count, 0)

  const braids = rows
    .map((a) => {
      const tally = new Map()
      Object.entries(a.axes).forEach(([k, v]) => {
        if (v == null) return
        if (!tally.has(v)) tally.set(v, [])
        tally.get(v).push(k)
      })
      let best = null
      tally.forEach((keys, root) => {
        if (keys.length >= 2 && (!best || keys.length > best.keys.length)) best = { root, keys }
      })
      return best ? { a, root: best.root, keys: best.keys, strength: best.keys.length } : null
    })
    .filter(Boolean)
    .sort((x, y) => (y.strength - x.strength) || (y.a.tdScore - x.a.tdScore))

  const first = new Map(); const last = new Map()
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
  const seen = new Set()
  rows.forEach((a) => {
    if (!a.parts) return
    const key = `${a.parts.firstKey}|${a.parts.lastKey}`
    if (seen.has(key)) return
    seen.add(key)
    const push = (m, k) => { if (!k || SUFFIXES.has(k)) return; if (!m.has(k)) m.set(k, []); m.get(k).push(a) }
    push(first, a.parts.firstKey)
    push(last, a.parts.lastKey)
  })
  const names = []
  first.forEach((list, k) => { if (list.length >= 3) names.push({ kind: 'first', key: k, list }) })
  last.forEach((list, k) => { if (list.length >= 2) names.push({ kind: 'last', key: k, list }) })
  names.sort((x, y) => y.list.length - x.list.length)

  return { rows, clubs: [...clubs.values()], totalMemberships, braids, names }
}
