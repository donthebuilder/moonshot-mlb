// One place that decides what availability badge a player wears.
//
// 2026-09-07. Ten TUDDY surfaces render `player.questionable` as a yellow "Q".
// That flag was published as `false` for every player all season, because
// nflverse's load_injuries() raises outright for 2026 ("Season must be between
// 2009 and 2025"), so the tag has never once appeared. The bot now takes the
// designation from ESPN instead and publishes `injury_status` alongside it.
//
// `questionable` alone cannot say everything the report says. Michael Penix Jr.
// is OUT and sits on the Week 1 passing-yards board at 46; under the old flag he
// would wear nothing at all, while a merely questionable player wears a Q —
// exactly backwards. So the badge reads `injury_status` first and falls back to
// the old boolean, which is the same precedence lib/nfl/playerCatalog.js already
// uses when it syncs to FRANCHISE.
//
// Codes come from the bot's STATUS_MAP: Q, D, OUT, IR, SUSP, PUP, NFI.
// A player with nothing to report carries no field and gets no badge — absence
// means "not on the injury report", which is the truth and not a gap.

// Anything here means he is not playing, as opposed to might not.
const OUT_CODES = new Set(['OUT', 'IR', 'SUSP', 'PUP', 'NFI'])

/** The code to show, or null. */
export function injuryTag(player) {
  const raw = player?.injury_status
  if (typeof raw === 'string' && raw.trim()) return raw.trim().toUpperCase()
  return player?.questionable ? 'Q' : null
}

/** True when the designation means he is out, not doubtful. */
export function isOut(tag) {
  return OUT_CODES.has(String(tag || '').toUpperCase())
}

/** Badge colour: red for "not playing", yellow for "might not". */
export function injuryColor(tag, C) {
  return isOut(tag) ? C.red : C.yellow
}

/** Hover text, so a two-letter badge is not the only explanation. */
export function injuryTitle(tag) {
  switch (String(tag || '').toUpperCase()) {
    case 'Q': return 'Questionable — listed on the injury report, check before kickoff'
    case 'D': return 'Doubtful — unlikely to play'
    case 'OUT': return 'Out — not playing this week'
    case 'IR': return 'Injured reserve'
    case 'SUSP': return 'Suspended'
    case 'PUP': return 'Physically unable to perform'
    case 'NFI': return 'Non-football injury'
    default: return 'Listed on the injury report'
  }
}
