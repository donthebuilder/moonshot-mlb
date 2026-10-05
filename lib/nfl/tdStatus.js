// ONE ANSWER TO "IS HE CALLED?" ON TUDDY'S PAGES (2026-10-05, Donovan: game calls
// read CALLED on the TD board too). The rule is lib/nfl/tdFeed onBotFor -- the
// TD ladder, then his game's call -- and the words are lib/callStatus
// tdCallStatus (ON THE BOARD = the week board's top third). Before kickoff a
// game's current calls are its calls (they lock unchanged at kickoff; the
// write-up names them CALLED), so they stand here as locked.
// Used by: the TD board's Status column, its "how to read" row, Home's TONIGHT strip.
import { onBotFor } from './tdFeed'
import { tdCallStatus } from '../callStatus'

/**
 * @param picksCard  nfl_picks.json card (picks.card)
 * @param gameCalls  nfl_game_calls.json (useGameCalls())
 * @param games      the week's games (to find a player's game id by team)
 * @param board      tdPool(slate).rows -- the week's TD board in order (rank / of)
 * @returns { statusOf(p) -> 'called'|'board'|'off', onBotOf(p) }
 */
export function tdStatusFor({ picksCard = null, gameCalls = null, games = [], board = [] } = {}) {
  const standing = gameCalls?.games ? { ...gameCalls, games: gameCalls.games.map((g) => ({ ...g, locked: true })) } : null
  const gameOf = new Map()
  for (const g of games || []) { if (g.home) gameOf.set(g.home, g.game_id); if (g.away) gameOf.set(g.away, g.game_id) }
  const rankOf = new Map((board || []).map((p, i) => [String(p.player_id), i + 1]))
  const of = (board || []).length
  const onBotOf = (p) => (p?.player_id ? onBotFor(picksCard, p.player_id, { gameCalls: standing, gameId: gameOf.get(p.team) }) : null)
  const statusOf = (p) => tdCallStatus({ on_bot: onBotOf(p), td_board: rankOf.has(String(p?.player_id)) ? { rank: rankOf.get(String(p.player_id)), of } : null })
  return { statusOf, onBotOf }
}
