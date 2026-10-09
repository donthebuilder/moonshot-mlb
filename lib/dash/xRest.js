// POSTS RESTED (a shelf for kinds switched off on purpose). EMPTY since 2026-10-09.
//
// The vote posts (botpoll, community_pick, nfl_botpoll, nfl_community) were rested here on
// 2026-09-28 and are NOT rested any more: polls are back, as new kinds (lib/dash/polls: poll_pick,
// poll_over, poll_guess, poll_streak, poll_board, poll_result and their nfl_/nhl_/nba_ twins),
// on in code. The old kinds' history rows stay; their builders and slots are gone.
// To rest a kind again, list it in RESTED (code, not env). The only env switch for polls is the
// emergency one, X_POLLS_PAUSE=on (lib/dash/polls/post.js).
const RESTED = []

export function isRested(kind) {
  return RESTED.includes(kind)
}
export const RESTED_KINDS = RESTED
