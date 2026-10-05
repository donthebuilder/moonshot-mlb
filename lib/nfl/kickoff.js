// Kickoff time lookup — lifted out of Touchdowns.js (2026-09-16 rebuild) so
// Boards.js can offer the exact same "Earliest kickoff" sort without a second
// copy of the same three lines drifting from the first (project rule #21:
// one place, not copy-pasted into every page that wants it).
//
// `player.team`/`.opp` and `games[].away`/`.home`/`.kickoff` are the same
// fields every NFL page already reads off the live payload — nothing new.
export function kickoffFor(games, player) {
  const g = (games || []).find((row) => row.away === player.team || row.home === player.team)
  return g?.kickoff ? Date.parse(g.kickoff) : null
}

/**
 * Players still to play: the slate rows whose game has NOT kicked off, and
 * (when `day` is given) whose game is on that ET calendar day -- the game's own
 * date, not "today". A board / poll posted at a given time must not name
 * someone whose game is already underway or over, nor Monday night's player
 * on Sunday's board. NFL has no live index here, so kickoff time is the gate.
 *
 * A player whose game has no usable kickoff is kept only when no `day` window
 * is asked for (we cannot show it started); with a `day` it is dropped, since
 * we cannot show it is in that window either.
 */
export function yetToKickOff(players, games, { now = Date.now(), day = '', dayOf = null } = {}) {
  return (players || []).filter((p) => {
    const t = kickoffFor(games, p)
    if (t == null || !Number.isFinite(t)) return !day
    if (t <= now) return false
    return !day || !dayOf || dayOf(t) === day
  })
}
