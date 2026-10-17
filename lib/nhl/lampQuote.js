// LAMP's price for a goal / shots card: the book's quote, only when the book's line IS the card's bar (GOAL 0.5, SHOTS 2.5). Moved out of
// components/lamp/LampProps.js (2026-10-17) so a player page's + slip reads the same rule.
const ODDS_MARKET = { GOAL: ['player_anytime_goal', 0.5], SOG: ['player_shots_on_goal', 2.5], NONE: ['player_anytime_goal', 0.5] }
export const lampQuoteOf = (odds, r, k) => {
  const [mk, line] = ODDS_MARKET[k] || []
  const q = mk ? odds?.by_player_id?.[String(r.id)]?.[mk] : null
  return q && Math.abs(Number(q.line) - line) < 1e-9 && Number.isFinite(Number(q.best_over ?? q.over)) ? q : null
}

// The other skater markets the odds feed carries (lib/odds/latest.js SPORTS.nhl.lines: pts, ast), as "also priced" words on a card
// (2026-10-17, Donovan: NHL Props mirrors MLB's). LAMP has no model for them, so they are never a call and never a card of their own:
// a price shows only when the book's line IS 0.5 (1+ point, 1+ assist), else nothing. Saves belong to goalies, who are not on the board.
const ALSO = [['player_points', 'pt'], ['player_assists', 'ast']]
export const lampAlsoPriced = (odds, id) => {
  const by = odds?.by_player_id?.[String(id)]
  if (!by) return []
  const out = []
  for (const [mk, word] of ALSO) {
    const q = by[mk]
    const px = Number(q?.best_over ?? q?.over)
    if (q && Math.abs(Number(q.line) - 0.5) < 1e-9 && Number.isFinite(px) && px !== 0) out.push({ word: `1+ ${word}`, price: px })
  }
  return out
}
