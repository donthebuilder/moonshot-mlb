// A BUCKETS board market's price in the books' feed (/api/odds/latest?sport=nba, lib/odds/latest.js SPORTS.nba), for the
// line-moved chip (components/LineMoveChip.js, 2026-10-13). Same rule as LAMP's cards: a quote counts only when the book's
// line IS the card's bar (PTS 25+ = the 24.5 line), so "opened +110, now -105" is about the bet the card names. No quote on
// file (NBA prices are captured once BUCKETS opens), or a different line, is null: no chip, never a guess.
import { NBA_MARKETS } from './model'

/** board market -> the books' market key. DD, TD and first basket have no like-for-like book line here. */
export const NBA_ODDS_KEY = { pts: 'player_points', reb: 'player_rebounds', ast: 'player_assists', '3pm': 'player_threes', pra: 'player_points_rebounds_assists' }

export function nbaQuote(odds, playerId, market) {
  const key = NBA_ODDS_KEY[market]
  const bar = NBA_MARKETS[market]?.bar
  const q = key && bar != null ? odds?.by_player_id?.[String(playerId)]?.[key] : null
  return q && Math.abs(Number(q.line) - (bar - 0.5)) < 1e-9 && Number.isFinite(Number(q.best_over ?? q.over)) ? q : null
}
