// THE ONE PLACE the X posts read "is the opposing starting goalie confirmed?" (the Slate's NHL adapter,
// lib/posts/nhl.js, and the NHL poll adapter, lib/dash/polls/adapters/nhl.js). Both read the SAME source:
// the game's `starters` ({ away, home } entries with a `confirmed` flag) as lib/nhl/boardRead.js carries it
// on each game. Pure.
import { nhlNamingProblem } from '../dash/namingChecks'

/** The opposing goalie entry for a skater's row: the entry, null (a source, but no entry for that side), or undefined (no source for this game). */
export function oppGoalieOf(game, row) {
  const s = game?.starters
  if (!s || typeof s !== 'object') return undefined
  return s[row?.home ? 'away' : 'home'] || null
}

/**
 * Why a skater cannot be named yet, or null. No source for the game is a definite no (nothing to wait for);
 * a source with the goalie unconfirmed is pending (hold, then drop 30 minutes before puck drop).
 * @param g  a readBoard() game: { game: { startUtc, state }, starters, rows }
 */
export function nhlGoalieProblem(g, row, id) {
  const goalie = oppGoalieOf(g, row)
  if (goalie === undefined) return { id, reason: 'no starting-goalie source', pending: false }
  return nhlNamingProblem({ player_id: id, startsAt: g?.game?.startUtc, oppGoalieConfirmed: goalie?.confirmed === true })
}
