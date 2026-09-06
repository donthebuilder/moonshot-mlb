// How a player's opponent reads, in one place — because a man on a bye is not
// a man with a missing opponent, and "—" says the wrong thing about both.
//
// The bot publishes `on_bye` on every row in week mode. Bye players are carried
// in the payload on purpose: FRANCHISE builds its draft board, team pages and
// wire from the same `players` array, and dropping them made a rostered man
// vanish from his own team page on his bye week. They never reach TUDDY's
// boards because every board filters on Number.isFinite(scores[market]) and a
// bye row's `scores` is empty — but the player portal, the watchlist, search
// and the research table all find him, and those are the places that need to
// say BYE out loud.

export const onBye = (player) => Boolean(player?.on_bye)

/** "vs BUF" / "BYE" / "—" — for a line of text next to a name. */
export const oppLabel = (player) =>
  (onBye(player) ? 'BYE' : player?.opp ? `vs ${player.opp}` : '—')

/** "BUF" / "BYE" / "—" — for a bare cell or a stat tile. */
export const oppShort = (player) =>
  (onBye(player) ? 'BYE' : player?.opp || '—')
