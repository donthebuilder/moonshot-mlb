// A SLIP LEG'S GRADE (2026-10-25, Add a leg). Pure. Each part is optional and silent when we cannot read it: nothing is guessed.
//   status  'called' when the product called this exact bet tonight (its published CALLED picks, components/props/slipCalls.js), else null.
//           The members gate holds: a pick outside the free four is only 'called' for a member (same rule as calledLegs in core.js), so a
//           non-member's slip can never reveal a call the boards hide. We only know the calls of the product whose Props board is open,
//           so for the other products the answer is null, never "not on the board".
/** @param pub  { cands: [{ key, free }] } the published calls of this leg's sport, or null */
export function callStatusOf(leg, pub, memberState) {
  const hit = pub?.cands?.find((c) => c.key === leg?.key || c.leg?.key === leg?.key)
  if (!hit) return null
  return memberState === 'member' || hit.free ? 'called' : null
}

// HIT RATE + THE DEFENSE'S HIT RATE (2026-10-25). Source: main's Hit Rater rows (lib/hitRater.js hitRaterRow, served whole by /api/trending): one row
// per lined man x lane, `own` = how often HE went over the book's line (L5 / L10 / L20 / Season) and `dvp` = how often players at his spot went over
// it against tonight's defense. A count of games that happened, never a chance and never the book's implied %. No row for the leg = no strip (silent).
// The leg's market code -> the Hit Rater lane key (BUCKETS / TUDDY lane keys are the codes already; LAMP's differ).
const LANE_OF = { nhl: { GOAL: 'g', SOG: 'sog' } }
const laneOf = (leg) => {
  const code = String(leg?.key || '').split('|').pop()
  return LANE_OF[leg?.sport]?.[code] || code
}
const lineOf = (leg) => { const n = Number(String(leg?.line ?? '').replace(/^[ou]/i, '')); return Number.isFinite(n) ? n : null }
export const hitKey = (sport, id, lane, line) => `${sport}:${id}:${lane}:${line}`

/** The rows -> Map(hitKey -> row). Over side only (the slip's legs are overs). */
export function hitIndex(rows) {
  const m = new Map()
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.side !== 'under') m.set(hitKey(r.sport, r.id, r.lane, Number(r.line)), r)
  return m
}
const cell = (c) => (c && c.n >= 1 && c.pct != null ? { pct: c.pct, ok: c.ok, n: c.n, thin: c.n < 5 } : null)
/** { own: {pct, ok, n, thin}|null, dvp: ...|null } for a leg, or null when we hold no row for it. */
export function hitRateOf(leg, index) {
  const line = lineOf(leg)
  if (!index || line == null || !leg?.sport || leg.id == null) return null
  const r = index.get(hitKey(leg.sport, leg.id, laneOf(leg), line))
  if (!r) return null
  const own = cell(r.own?.L10)
  const dvp = cell(r.dvp?.L10)
  return own || dvp ? { own, dvp } : null
}
/** "70% 7/10" (percent first, the count small after it). */
export const hitWords = (c) => `${c.pct}% ${c.ok}/${c.n}`
