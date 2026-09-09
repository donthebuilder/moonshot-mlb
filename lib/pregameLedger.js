// ═══════════════════════════════════════════════════════════════════════════
// 🔮 THE LEDGER BEFORE THE FIRST PITCH — pregame numerology
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-17: "pregame numerology suggestions like the storylines
// would be helpful for the ledger, that way i can see where it lies even when
// slate hasn't fully kicked off."
//
// The Homer Ledger only ever had something to say AFTER a ball left the yard,
// which is why he asked three times where it was. An empty panel that fills up
// later is not discoverable — you have to already know it exists to catch it.
// A blank "no homers yet" strip would fix the finding problem and nothing else.
//
// This is the better answer: the ledger's own angles, computed off tonight's
// slate, BEFORE anything happens. Same questions it asks after the fact — what
// number is this homer, which lineup spot did it come from, do the names rhyme —
// asked forward instead of backward.
//
// ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
// It is NOT a prediction and nothing here feeds any score. Every item is a
// COUNTABLE FACT about tonight's board — "nine men sit one homer from a round
// number" is either true or false and you can check it. The ledger's own
// numerology has never been graded as predictive, and the panel says so in the
// copy rather than in a footnote, because a number with a mystical framing and
// no disclaimer is the most misleading thing this site could print.
//
// Every claim carries its denominator, per the house rule: a measured frequency
// with its denominator is honest, a bare percentage is not.

import { n, clean, nameOf, teamOf } from './player'
import { nameParts } from './namePatterns'
import { uniqueByPerson } from './doubleheader'

// "Jr." is not a surname. The first run of this file reported
// `last: jr -> Rafael Flores Jr., Bobby Witt Jr.` as a shared-last-name echo,
// which is a coincidence of English naming convention and nothing else — and it
// would have been the very first "pattern" the panel ever showed a reader.
// Anything on this list can never form a family.
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Round numbers people actually notice. */
export const MILESTONES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60]

const isDesignated = (p) => !!clean(p?.game_pick_role, '')

/**
 * One homer away from a round number.
 *
 * The ledger's oldest question — "what number home run is this" — pointed at
 * the men for whom tonight's would be a number worth noticing.
 */
export function milestoneWatch(rows = []) {
  const out = []
  for (const p of rows || []) {
    const hr = n(p?.season_hr, 0)
    if (hr <= 0) continue
    const next = hr + 1
    if (!MILESTONES.includes(next)) continue
    out.push({
      name: nameOf(p), team: teamOf(p), at: hr, next,
      designated: isDesignated(p),
      spot: n(p?.lineup_spot, 0) || null,
      _raw: p,
    })
  }
  // The bot's own picks first, then the biggest number — a 49 chasing 50 is a
  // better line than a 9 chasing 10, and a designated 9 beats an undesignated 49
  // because this panel sits inside a betting site, not a record book.
  return out.sort((a, b) => (b.designated - a.designated) || (b.next - a.next))
}

/**
 * His jersey number and his home run count, meeting.
 *
 * Pure coincidence-spotting, and labelled as such. Included because it is
 * exactly the kind of thing the ledger noticed after the fact and could never
 * point at beforehand.
 */
export function jerseyEchoes(rows = []) {
  const out = []
  for (const p of rows || []) {
    const jersey = n(p?.jersey_number, 0)
    const hr = n(p?.season_hr, 0)
    if (jersey <= 0 || hr <= 0) continue
    if (hr + 1 === jersey) {
      out.push({ kind: 'reaches', name: nameOf(p), team: teamOf(p), jersey, hr, designated: isDesignated(p), _raw: p })
    } else if (hr === jersey) {
      out.push({ kind: 'level', name: nameOf(p), team: teamOf(p), jersey, hr, designated: isDesignated(p), _raw: p })
    }
  }
  return out.sort((a, b) => (b.designated - a.designated) || (b.jersey - a.jersey))
}

/**
 * Where the bot's picks are stacked in the batting order.
 *
 * The ledger reports which spot the night's homers came from. Pregame, the
 * answerable version is which spot the picks are sitting in — with the count and
 * the denominator, so it is a description and not an omen.
 */
export function spotStack(rows = []) {
  const picks = (rows || []).filter(isDesignated)
  if (picks.length < 3) return null
  const by = new Map()
  for (const p of picks) {
    const s = n(p?.lineup_spot, 0)
    if (s < 1 || s > 9) continue
    by.set(s, (by.get(s) || 0) + 1)
  }
  if (!by.size) return null
  let spot = 0; let count = -1
  for (const s of [...by.keys()].sort((a, b) => a - b)) {
    if (by.get(s) > count) { count = by.get(s); spot = s }
  }
  const placed = [...by.values()].reduce((a, b) => a + b, 0)
  return { spot, count, placed, spots: by }
}

/**
 * Do tonight's designated names rhyme with each other?
 *
 * The shipped name-echo panel runs on the men who actually homered and
 * Monte-Carlo-corrects against the slate population. There is no equivalent
 * significance test available pregame — the "population" and the "sample" would
 * be the same set of people, so any test would be circular. So this reports
 * shared first and last names among the PICKS only, as raw counts, and never
 * claims anything about likelihood. Two Petes is two Petes.
 */
export function pickNameEchoes(rows = []) {
  const picks = (rows || []).filter(isDesignated)
  const first = new Map()
  const last = new Map()
  const seen = new Set()
  for (const p of picks) {
    const parts = nameParts(nameOf(p))
    if (!parts) continue
    const key = `${parts.firstKey}|${parts.lastKey}`
    if (seen.has(key)) continue        // a man designated twice is one man
    seen.add(key)
    const push = (m, k) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(nameOf(p)) }
    push(first, parts.firstKey)
    push(last, parts.lastKey)
  }
  const fam = []
  for (const [k, names] of first) {
    if (names.length >= 2 && !SUFFIXES.has(k)) fam.push({ kind: 'first', key: k, names })
  }
  for (const [k, names] of last) {
    if (names.length >= 2 && !SUFFIXES.has(k)) fam.push({ kind: 'last', key: k, names })
  }
  return fam.sort((a, b) => b.names.length - a.names.length).slice(0, 4)
}

/** Everything the pregame panel needs, or null when there is nothing honest to say. */
export function pregameLedger(rows = []) {
  // ONE ENTRY PER MAN. On a doubleheader slate the raw rows carry a hitter
  // twice, and the first run of this file duly listed "Sal Stewart #27, 26 HR"
  // as two separate findings. A panel about coincidences must not manufacture
  // its own — that is the exact failure mode this whole session keeps meeting.
  const list = uniqueByPerson(Array.isArray(rows) ? rows : [])
  if (!list.length) return null
  const milestones = milestoneWatch(list)
  const jerseys = jerseyEchoes(list)
  const stack = spotStack(list)
  const echoes = pickNameEchoes(list)
  const picks = list.filter(isDesignated).length
  if (!milestones.length && !jerseys.length && !stack && !echoes.length) return null
  return { milestones, jerseys, stack, echoes, picks, total: list.length }
}
