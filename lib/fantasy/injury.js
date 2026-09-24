// WHO CANNOT PLAY THIS WEEK (2026-09-23).
//
// Donovan: "make sure teams don't start injured players. auto just in case."
//
// The bot's slate carries injury_status as the short codes it gets upstream --
// on Week 3: OUT (23), Q (17), D (6), otherwise null -- and the catalog sync
// copies it onto nfl_players every scoring run. InjuryTag already renders
// these; this is the one place that decides what they MEAN for a lineup.
//
// Not startable: out, doubtful, injured reserve, PUP, suspended. Doubtful is
// in on purpose: it plays roughly one time in five, and the auto-lineup is a
// safety net, not a gamble. QUESTIONABLE IS NOT -- most questionable players
// play, and benching every Q would bench a fifth of the league's starters on
// a Friday injury report.
const UNAVAILABLE = new Set(['out', 'o', 'doubtful', 'd', 'ir', 'injuredreserve', 'pup', 'suspended', 'susp', 'sus'])

export function injuryKey(status) {
  return String(status || '').trim().toLowerCase().replace(/[^a-z]/g, '')
}

/** True when this player should not be in a starting slot this week. */
export function isUnavailable(player) {
  return UNAVAILABLE.has(injuryKey(player?.injury_status))
}
