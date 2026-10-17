// LAMP's price for a goal / shots card: the book's quote, only when the book's line IS the card's bar (GOAL 0.5, SHOTS 2.5). Moved out of
// components/lamp/LampProps.js (2026-10-17) so a player page's + slip reads the same rule.
const ODDS_MARKET = { GOAL: ['player_anytime_goal', 0.5], SOG: ['player_shots_on_goal', 2.5], NONE: ['player_anytime_goal', 0.5] }
export const lampQuoteOf = (odds, r, k) => {
  const [mk, line] = ODDS_MARKET[k] || []
  const q = mk ? odds?.by_player_id?.[String(r.id)]?.[mk] : null
  return q && Math.abs(Number(q.line) - line) < 1e-9 && Number.isFinite(Number(q.best_over ?? q.over)) ? q : null
}
