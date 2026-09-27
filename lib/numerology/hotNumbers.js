// 🔢 HOT NUMBERS (2026-09-27, BATCH-NUMEROLOGY step 6b). Pure.
//
// For one sport x night: for each number KIND and VALUE, how many of the
// night's homers / TDs / goals landed on it (`events`) against how many would
// have by chance -- the value's share of everyone who played, times the
// night's events (`expected`). Written to numerology_numbers at grading time
// (lib/numerology/record.js callers), read back by /api/numerology/hot.
//
// KINDS (each a real field; a player missing one sits that kind out):
//   jersey        his jersey number              jersey_root  its digit root
//   life_path     every birth digit, reduced     personal_day his personal day that date (root)
//   name_root     full name, English Ordinal, reduced
//   first_letter  the first letter of his first name
import { digitRoot, lifePathOf, personal } from './core'
import { gematria, letters } from './gematria'

const KINDS = {
  jersey: (p) => (p.jersey > 0 ? String(p.jersey) : null),
  jersey_root: (p) => (p.jersey > 0 ? String(digitRoot(p.jersey)) : null),
  life_path: (p) => { const v = lifePathOf(p.birthDate); return v ? String(v) : null },
  personal_day: (p, date) => { const v = personal(p.birthDate, date); return v ? String(v.day.root) : null },
  name_root: (p) => { const g = gematria(p.name); return g?.full ? String(g.full.ordinal.root) : null },
  first_letter: (p) => letters(p.name)?.firstLetter || null,
}
export const HOT_KINDS = Object.keys(KINDS)
export const KIND_LABEL = { jersey: 'Jersey', jersey_root: 'Jersey root', life_path: 'Life path', personal_day: 'Personal day', name_root: 'Name root', first_letter: 'First letter' }

/**
 * players: [{ player_id, name, jersey, birthDate }] -- everyone who PLAYED;
 * hits: Set(player_id) with an event (one per player-night, a two-homer man
 * counts once: the question is who, not how many). Returns rows for
 * numerology_numbers (no sport/day -- the caller adds them).
 */
export function numbersNight(players, hits, date) {
  const out = []
  const events = players.filter((p) => hits.has(String(p.player_id))).length
  for (const [kind, of] of Object.entries(KINDS)) {
    const counts = new Map()
    let pool = 0
    for (const p of players) {
      const v = of(p, date)
      if (v == null) continue
      pool++
      const c = counts.get(v) || { players: 0, events: 0 }
      c.players++
      if (hits.has(String(p.player_id))) c.events++
      counts.set(v, c)
    }
    const kindEvents = [...counts.values()].reduce((a, c) => a + c.events, 0)
    for (const [value, c] of counts) {
      out.push({ kind, value, events: c.events, players: c.players, expected: pool ? Math.round((c.players / pool) * kindEvents * 1000) / 1000 : 0 })
    }
  }
  return { rows: out, events }
}

/** The top values by events above chance: [{ kind, value, events, expected, lift }], ties by events. */
export function hottest(rows, n = 3, { minEvents = 2 } = {}) {
  return (rows || [])
    .filter((r) => r.events >= minEvents && r.events > r.expected)
    .map((r) => ({ ...r, lift: r.events - r.expected }))
    .sort((a, b) => (b.lift - a.lift) || (b.events - a.events))
    .slice(0, n)
}
