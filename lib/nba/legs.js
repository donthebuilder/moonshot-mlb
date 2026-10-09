// BUCKETS' leg words and formats -- one place for the board, the slate, the
// admin page and the player's board rows. The legs themselves are
// lib/nba/model.js NBA_MARKETS[market].legs (pure, client-safe).
import { NBA_MARKETS } from './model'
export { NBA_MARKETS }

export const LEG_LABEL = { ptsPg: 'PTS/G', rebPg: 'REB/G', astPg: 'AST/G', minPg: 'MIN', fgaPg: 'FGA/G', ftaPg: 'FTA/G', tpmPg: '3PM/G', tpaPg: '3PA/G', tpPct: '3P%', praPg: 'PRA/G', fgaShare: 'SHOT SHARE', ddRate: 'DD GAMES', ddRecent: 'DD LAST 10', tdRate: 'TD GAMES', ddAdj: 'DD GAMES × OPP', ddRecentAdj: 'DD LAST 10 × OPP', tdAdj: 'TD GAMES × OPP', oppPts: 'OPP PTS', oppReb: 'OPP REB', oppAst: 'OPP AST', oppTpm: 'OPP 3PM' }
// the game-log rates are shares of his games (0-1): printed as a whole percent of games, never as a chance
export const RATE_LEGS = new Set(['ddRate', 'ddRecent', 'tdRate', 'ddAdj', 'ddRecentAdj', 'tdAdj'])
// the opponent-adjusted legs rank him; the numbers SHOWN are his own measured rates (never the adjusted one: it is a score input, not a stat)
export const RAW_OF = { ddAdj: 'ddRate', ddRecentAdj: 'ddRecent', tdAdj: 'tdRate' }
export const fmtLeg = (k, v) => (v == null ? '—' : RATE_LEGS.has(k) ? `${Math.round(v * 100)}%` : k === 'tpPct' || k === 'fgaShare' ? `${(v * 100).toFixed(1)}%` : Number(v).toFixed(1))
/** The market chips, in the definition's order: [{ key, text }] */
export const MARKET_OPTIONS = Object.entries(NBA_MARKETS).map(([k, d]) => ({ key: k, text: d.label }))
/** What a graded row's `actual` means for its market. */
export const ACTUAL_WORD = { pts: 'PTS', reb: 'REB', ast: 'AST', '3pm': '3PM', pra: 'PRA', dd: 'TENS', td: 'TENS', first: 'FIRST' }
