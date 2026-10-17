// A ROW'S SLIP LEG (2026-10-17, Donovan: "every prop and player gets an add-to-slip tap"). Pure, no React: the one place that turns a board row +
// the books' quote into a leg for the shared slip (lib/slip/core.js, store.js), so every row control (components/SlipPlus.js, the tables' slip
// column) builds the same leg the player pages and the Props cards do. The rules, in order:
//   - a leg has a REAL book price (American, non-zero) or there is no leg: no control, never a made-up number
//   - the book's line IS the bar (`std`) or there is no leg: a price on another line is a different bet
//   - source is always 'player': a row tap is an add BY HAND. It never carries the 'called' shortcut's source, and it carries no status, so a
//     pick hidden from a non-member (components/MemberGate.js) is reachable only the way any prop is, and reveals nothing about the call.
import { quoteFor as mlbQuote } from '../odds'
import { nameOf as mlbName, teamOf as mlbTeam, oppOf as mlbOpp } from '../player'
import { quoteFor as nflQuote, CATEGORY_MARKET as NFL_MARKET } from '../nfl/oddsMatch'
import { lampQuoteOf } from '../nhl/lampQuote'
import { nbaQuote, NBA_ODDS_KEY } from '../nba/oddsQuote'
import { NBA_MARKETS } from '../nba/model'

/** The book's best real price in a quote, or null. */
export const quotePrice = (q) => {
  const v = Number(q?.best_over ?? q?.over)
  return Number.isFinite(v) && v !== 0 ? v : null
}

/** { key, label } for the game a row is in; null without both clubs. */
export const gameOfClubs = (team, opp) => (team && opp ? { key: [team, opp].sort().join('-'), label: [team, opp].sort().join(' · ') } : null)

/** The price code a market key is saved under, per sport (the code the Props cards and player pages already use, so one bet is one leg). */
const CODES = {
  mlb: { batter_home_runs: 'HR', batter_hits: 'HIT', batter_hits_runs_rbis: 'HRR', batter_total_bases: 'TB' },
  nfl: Object.fromEntries(Object.entries(NFL_MARKET).map(([code, mk]) => [mk, code])),
  nhl: { player_anytime_goal: 'GOAL', player_shots_on_goal: 'SOG' },
  nba: Object.fromEntries(Object.entries(NBA_ODDS_KEY).map(([code, mk]) => [mk, code])),
}
export const marketCode = (sport, marketKey, fallback = '') => CODES[sport]?.[marketKey] || String(fallback || marketKey || '').toUpperCase()

/**
 * The generic row leg. `q` is the books' quote ({ line, over, best_over }), `std` the bar the board measures (null = take the book's own line).
 * Returns null unless there is a real price and, when `std` is given, the book's line equals it.
 */
export function rowLeg({ sport, id, keyId = null, code, label = null, name, team = null, opp = null, q, std = null }) {
  const price = quotePrice(q)
  if (price == null || id == null || id === '' || !name || !code) return null
  const line = Number(q?.line)
  if (std != null && !(Number.isFinite(line) && Math.abs(line - std) < 1e-9)) return null
  return {
    key: `${keyId ?? id}|${code}`, sport, id: String(id), name, team, market: label || code,
    line: Number.isFinite(line) ? `o${line}` : null, side: 'over', price, game: gameOfClubs(team, opp), source: 'player',
  }
}

// ── per sport, the board's own bet ────────────────────────────────────────────
/** MLB: the home-run price on the 0.5 bar (lib/odds quoteFor already refuses another line). `p` is a slate row. */
export function mlbHrLeg(odds, p) {
  const q = mlbQuote(odds, p, 'HR')
  if (!q || q.matches === false) return null
  return rowLeg({ sport: 'mlb', id: p.player_id, keyId: p.game_pk != null ? `${p.player_id}-${p.game_pk}` : p.player_id, code: 'HR', label: 'HR', name: mlbName(p), team: mlbTeam(p) || null, opp: mlbOpp(p) || null, q })
}
/** NFL: one nfl_scoring market's price on its bar (TD = anytime TD). `p` is a week row. */
export function nflLeg(odds, p, market = 'TD', label = null) {
  const q = nflQuote(odds, p, market)
  if (!q || q.matches === false) return null
  return rowLeg({ sport: 'nfl', id: p.player_id, code: String(market).toUpperCase(), label: label || String(market).toUpperCase(), name: p.name, team: p.team ?? null, opp: p.opp ?? null, q })
}
/** NHL: the goal (1+) price, only where the book's line is 0.5 (lib/nhl/lampQuote). `r` carries id (or playerId), name, team, opp. */
export function nhlGoalLeg(odds, r) {
  const id = r.playerId ?? r.player_id ?? r.id
  const q = lampQuoteOf(odds, { id }, 'GOAL')
  return q ? rowLeg({ sport: 'nhl', id, code: 'GOAL', label: 'Goal', name: r.name, team: r.team ?? null, opp: r.opp ?? null, q }) : null
}
/** BUCKETS: a board market's price on the card's bar (lib/nba/oddsQuote nbaQuote). */
export function nbaLeg(odds, r, market = 'pts') {
  const id = r.playerId ?? r.player_id ?? r.id
  const q = nbaQuote(odds, id, market)
  return q ? rowLeg({ sport: 'nba', id, code: market, label: NBA_MARKETS[market]?.label || market, name: r.name, team: r.team ?? null, opp: r.opp ?? null, q }) : null
}

/** LONGSHOTS rows (lib/odds/longshots.js): the anytime market of the sport (MLB HR, NFL TD, NHL goal) at the best book's real price. All three are the 0.5 bar. */
const LONGSHOT = { mlb: ['HR', 'HR'], nfl: ['TD', 'TD'], nhl: ['GOAL', 'Goal'] }
export function longshotLeg(sport, r) {
  const m = LONGSHOT[sport]
  if (!m || !r) return null
  return rowLeg({ sport, id: r.id, code: m[0], label: m[1], name: r.name, team: r.team ?? null, opp: r.opp ?? null, q: { line: 0.5, over: r.best } })
}

/** The ODDS board's row (components/tabs/OddsBoard.js): any market the books price, only on the board's standard bar. */
export function oddsRowLeg(sport, p, marketKey, label, q, std, keyId = null) {
  const id = p?.player_id ?? p?.playerId ?? p?.id
  return rowLeg({ sport, id, keyId, code: marketCode(sport, marketKey, label), label, name: p?.name || p?.player_name, team: p?.team ?? null, opp: p?.opp ?? p?.opponent ?? null, q, std })
}
