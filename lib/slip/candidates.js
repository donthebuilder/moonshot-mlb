// ADD A LEG, THE CANDIDATES (2026-10-25, Donovan: no screenshot scanner; "plug and play the people" instead). Pure, no React, no fetch.
// A typed name -> the players it matches in each product's own index (lib/search/sources.js loadPlayers) -> for each, the legs the books
// ACTUALLY price for him tonight (the odds payload, /api/odds/latest). The legs are the existing per-sport builders' (lib/slip/rowLegs.js),
// so one bet is one leg whichever door it came through, and the rule holds: no real price on the bet's own bar, no leg, no chip.
// A leg added here carries no opponent or game (the name index has none): it just skips the same-game warning. Never invented.
import { searchPlayers } from '../search/engine'
import { mlbHrLeg, nflLeg, nhlGoalLeg, nbaLeg, rowLeg, marketCode } from './rowLegs'
import { CATEGORY_MARKET as NFL_MARKET } from '../nfl/oddsMatch'
import { NBA_ODDS_KEY } from '../nba/oddsQuote'
import { SLIP_SPORTS } from './core'

const NFL_LABEL = { TD: 'TD', REC_YDS: 'REC YDS', REC: 'REC', RUSH_YDS: 'RUSH YDS', RUSH_ATT: 'RUSH ATT', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK PTS' }

/** The legs the books price for one indexed player ({ id, name, team }), in the sport's own order. */
export function playerLegs(sport, p, odds) {
  if (!odds || !p) return []
  const row = { player_id: p.id, playerId: p.id, id: p.id, name: p.name, team: p.team || null }
  const legs = []
  if (sport === 'mlb') legs.push(mlbHrLeg(odds, row))
  else if (sport === 'nfl') for (const k of Object.keys(NFL_MARKET)) legs.push(nflLeg(odds, row, k, NFL_LABEL[k] || k))
  else if (sport === 'nhl') legs.push(nhlGoalLeg(odds, row))
  else if (sport === 'nba') for (const m of Object.keys(NBA_ODDS_KEY)) legs.push(nbaLeg(odds, row, m))
  const board = legs.filter(Boolean)
  // THE BOOK'S OWN LINE (2026-10-25): a bet the user plugs in by hand is whatever the book posts (PTS o9.5 for a role player), not only the bar the board
  // grades on. It is a different leg from the board's (key `code@line`, the line in its label) and carries the real price, never a made-up one.
  const have = new Set(board.map((l) => String(l.key).split('|').pop()))
  const quotes = odds.by_player_id?.[String(p.id)] || {}
  const own = []
  for (const [mk, q] of Object.entries(quotes)) {
    const code = marketCode(sport, mk, '')
    if (!code || code === String(mk).toUpperCase() || have.has(code)) continue   // unmapped market, or the board's bet is already a chip
    const line = Number(q?.line)
    if (!Number.isFinite(line) || line <= 0) continue
    const leg = rowLeg({ sport, id: p.id, code: `${code}@${line}`, label: `${String(code).toUpperCase()} o${line}`, name: p.name, team: p.team || null, q })
    if (leg) own.push(leg)
  }
  return [...board, ...own]
}

/**
 * @param q        the typed text (under 2 letters finds nothing)
 * @param indexes  { mlb: [{ id, name, team, pos }], ... } (a product that has not loaded is simply absent)
 * @param oddsBy   { mlb: oddsPayload|null, ... }
 * @returns [{ sport, id, name, team, legs }] best match first, only players with at least one priced leg
 */
export function findLegs(q, indexes = {}, oddsBy = {}, { cap = 8, perSport = 6 } = {}) {
  if (String(q || '').trim().length < 2) return []
  const out = []
  for (const sport of SLIP_SPORTS) {
    const index = indexes[sport]
    if (!index || !oddsBy[sport]) continue
    // search wider than we show: many people in the index have no price tonight and drop out below
    for (const h of searchPlayers(sport, q, index, perSport * 6)) {
      const legs = playerLegs(sport, h, oddsBy[sport])
      if (legs.length) out.push({ sport, id: h.id, name: h.name, team: h.team, legs, rank: h.rank })
    }
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, cap).map(({ rank, ...r }) => r)
}
