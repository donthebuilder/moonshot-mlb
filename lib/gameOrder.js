// ONE ORDER FOR A NIGHT OF GAMES (R8/R9, 2026-10-02): live first, then the
// games still to come by start time, then the finals. LAMP's ScoreTable said
// "same rank rule TUDDY's GameScoreboard uses, so the two products agree" --
// and kept its own copy. Each sport says what live / done means on its feed
// and where the start time is; the order is this one function.
export function rankGames(games = [], { phaseOf, startOf }) {
  return [...games].sort((a, b) => phaseOf(a) - phaseOf(b) || Date.parse(startOf(a) || 0) - Date.parse(startOf(b) || 0))
}
// The two feeds' words for it: 0 live, 1 still to come, 2 done.
export const NHL_GAME_ORDER = { phaseOf: (g) => (g.state === 'live' ? 0 : g.state === 'pre' ? 1 : 2), startOf: (g) => g.startUtc }
export const NFL_GAME_ORDER = { phaseOf: (g) => (g.state === 'in' ? 0 : g.completed || g.state === 'post' ? 2 : 1), startOf: (g) => g.kickoff }
// A goal's strength tag (ScoreTable's, moved: the game page and the scores
// reuse it and it is not a component).
const STR = { ev: 'EV', pp: 'PP', sh: 'SH' }
export const strengthTag = (g) => (g.modifier === 'empty-net' ? 'EN' : g.modifier === 'penalty-shot' ? 'PS' : STR[g.strength] || 'EV')
