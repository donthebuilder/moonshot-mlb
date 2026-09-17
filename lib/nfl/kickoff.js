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
