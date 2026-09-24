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

// NOT IN THIS WEEK'S DATA (2026-09-24). The bot's week slate leaves a player
// out entirely when he has nothing to price -- in practice, injured. Josh
// Jacobs in Week 3 had no row at all, so his injury_status never changed and
// isUnavailable() could not see him. A player whose club PLAYS this week but
// who is missing from a full-size slate is treated as not available.
//
// Guarded twice, because a half-published slate would otherwise bench
// everyone: the slate must carry at least MIN_SLATE players, and D/ST is never
// judged this way (defences are synthesised, not listed per player).
export const MIN_SLATE = 300

/** @param {Set<string>|null} slateIds source_player_ids on this week's slate */
export function offSlate(player, slateIds, clubPlays = () => true, idOf = (p) => p.source_player_id) {
  if (!slateIds || slateIds.size < MIN_SLATE || !player) return false
  if (player.position === 'DEF') return false
  if (!clubPlays(player)) return false          // a bye is a bye, not an injury
  return !slateIds.has(String(idOf(player) || ''))
}
