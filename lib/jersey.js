// A JERSEY NUMBER, ONE RULE (2026-10-21, KNOWN-ISSUES #13). ESPN's Oct 21 roster pull had William Eklund as OTT #727; jerseys are 0-99 in
// every league we cover. A value outside that (or not a whole number, or blank) is no jersey: null, never a made-up one. "00" reads as 0, the
// way the feeds send it. Every ESPN roster reader and the shared numerology entry points go through this; byNumbers and the name twins
// script had their own copy of the same rule and now use this one.
export const JERSEY_MAX = 99

/** v (number or string) -> a whole number 0..99, or null. Pure. */
export function jerseyNumber(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || !/^\d{1,3}$/.test(s)) return null
  const n = Number(s)
  return n >= 0 && n <= JERSEY_MAX ? n : null
}
