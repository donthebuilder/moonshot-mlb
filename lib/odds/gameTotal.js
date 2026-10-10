// THE BOOK'S GAME TOTAL (2026-10-09, TOP TOTALS book line). Pure; no fetch.
//
// An SGO event already carries the combined-score over/under for every game it lists, in the SAME object the
// odds tick already pays for (checked live 10-09 on a NHL and a NBA event):
//   points-all-game-ou-over / points-all-game-ou-under   statEntityID 'all', periodID 'game'
//   bookOverUnder (SGO's consensus line), bookOdds, fairOverUnder, openBookOverUnder, byBookmaker[book].overUnder
// ("points" is SGO's word for goals in hockey, as in lib/odds/snap.js.) The player-prop readers skip it because
// it has no player, so until now it was dropped. This keeps one compact row per game per snapshot.
//
// ONLY like-for-like units: NHL total GOALS and NBA total POINTS are what the books quote and what Top Totals
// counts. MLB (books: runs; we count home runs) and NFL (books: points; we count touchdowns) are NOT here and
// must never be mixed in.
//
// Honesty rules: a line is a row only when a book that is still offering it (available) quotes exactly that
// consensus number on both the over and the under; otherwise there is no row, and Top Totals keeps its own
// projection as the line. Nothing is estimated.
import { easternDate } from '../data'

export const BOOK_TOTAL_LEAGUES = { NHL: 'nhl', NBA: 'nba' }
export const bookTotalSport = (leagueID) => BOOK_TOTAL_LEAGUES[leagueID] || null

const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const american = (v) => {
  const n = Number(String(v ?? '').replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}

// SGO's team shorts differ from ours for some clubs (checked against its /teams list 10-09). Both sides are
// reduced to one key before they are compared; a club not in the table compares as itself.
const TEAM_KEY = {
  nhl: { NJ: 'NJD', TB: 'TBL', SJ: 'SJS', LA: 'LAK', UTAH: 'UTA', WAS: 'WSH', MON: 'MTL', VEG: 'VGK' },
  nba: { GSW: 'GS', NYK: 'NY', NOP: 'NO', SAS: 'SA', WAS: 'WSH', UTA: 'UTAH', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' },
}
export const bookTeamKey = (sport, abbr) => {
  const a = String(abbr || '').trim().toUpperCase()
  return TEAM_KEY[sport]?.[a] || a
}

/** The game-total row for one event and one snapshot kind, or null when no book is quoting a total. */
export function gameTotalRow(ev, snap, takenAt) {
  const sport = bookTotalSport(ev?.leagueID)
  if (!sport) return null
  const over = ev.odds?.['points-all-game-ou-over']
  const under = ev.odds?.['points-all-game-ou-under']
  if (!over || !under) return null
  const line = numOrNull(over.bookOverUnder)
  if (line == null || line <= 0 || numOrNull(under.bookOverUnder) !== line) return null
  // books still offering exactly this number, on both sides
  const live = (o) => Object.values(o.byBookmaker || {}).filter((b) => b?.available !== false && numOrNull(b.overUnder) === line && american(b.odds) != null).length
  const books = Math.min(live(over), live(under))
  if (!books) return null
  const start = ev.status?.startsAt
  if (!start || !Number.isFinite(Date.parse(start))) return null
  return {
    sport, event_id: ev.eventID, game_date: easternDate(Date.parse(start)), starts_at: start, snap, taken_at: takenAt,
    away: ev.teams?.away?.names?.short || null, home: ev.teams?.home?.names?.short || null,
    line, over_odds: american(over.bookOdds), under_odds: american(under.bookOdds),
    fair_line: numOrNull(over.fairOverUnder), open_line: numOrNull(over.openBookOverUnder), books,
  }
}

/**
 * The stored book total for each of a slate's games, as of `now`. `books` = odds_game_totals rows. A game takes
 * the NEWEST row taken before both `now` and its own start whose club pair matches (club shorts reduced by
 * bookTeamKey) and whose start is within 6 hours of the game's. A game with no such row is absent from the map.
 * @returns Map(game_id -> { line, taken_at, books, event_id })
 */
export function bookTotalsFor(sport, games, books, now) {
  const out = new Map()
  for (const g of games || []) {
    const a = bookTeamKey(sport, g.away); const h = bookTeamKey(sport, g.home)
    let best = null
    for (const b of books || []) {
      if (b.sport !== sport || bookTeamKey(sport, b.away) !== a || bookTeamKey(sport, b.home) !== h) continue
      const taken = Date.parse(b.taken_at)
      if (!Number.isFinite(taken) || taken >= now || taken >= g.start_ms) continue
      if (Math.abs(Date.parse(b.starts_at) - g.start_ms) > 6 * 3600e3) continue
      const line = numOrNull(b.line)
      if (line == null || line <= 0) continue
      if (!best || taken > best.t) best = { t: taken, line, taken_at: new Date(taken).toISOString(), books: Number(b.books) || null, event_id: String(b.event_id) }
    }
    if (best) out.set(String(g.game_id), { line: best.line, taken_at: best.taken_at, books: best.books, event_id: best.event_id })
  }
  return out
}
