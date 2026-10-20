// THE BOOK'S GAME LINE: SPREAD + MONEYLINE (2026-10-19, BUCKETS "our line"). Pure; no fetch.
//
// An SGO event carries each game's moneyline and spread in the SAME object the odds tick already pays for
// (checked live 10-19 on BOS@DET):
//   points-home-game-sp-home / points-away-game-sp-away   bookSpread (consensus, that side's number), bookOdds,
//                                                         openBookSpread, byBookmaker[book].spread / .odds
//   points-home-game-ml-home / points-away-game-ml-away   bookOdds, openBookOdds, byBookmaker[book].odds
// ("points" is the score; first-to-score and first-to-20 moneylines share the betTypeID, so the statID is matched.)
// One compact row per game per snapshot goes to odds_game_lines. NBA only for now.
//
// Honesty rules (as lib/odds/gameTotal.js): a spread is kept only when a book still offering it quotes exactly that
// consensus number on both sides, and the two sides' numbers are opposite; a moneyline only when both sides have a
// price and at least one live book. Otherwise that half is null; a row with neither half is no row. SGO's fair
// prices are NOT kept (a no-cut price is a probability in another form, and BUCKETS never prints one).
import { easternDate } from '../data'
import { bookTeamKey } from './gameTotal'

export const BOOK_LINE_LEAGUES = { NBA: 'nba' }

const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const american = (v) => {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'EVEN' || s === 'EV') return 100
  const n = Number(s.replace(/^\+/, ''))
  return Number.isInteger(n) && n !== 0 ? n : null
}
const liveBooks = (o, ok) => Object.values(o?.byBookmaker || {}).filter((b) => b?.available !== false && american(b.odds) != null && ok(b)).length

/** The spread half: { spread_home, spread_home_odds, spread_away_odds, spread_books, open_spread_home } or nulls. */
export function spreadOf(ev) {
  const h = ev?.odds?.['points-home-game-sp-home'], a = ev?.odds?.['points-away-game-sp-away']
  const none = { spread_home: null, spread_home_odds: null, spread_away_odds: null, spread_books: null, open_spread_home: null }
  if (!h || !a) return none
  const sh = numOrNull(h.bookSpread), sa = numOrNull(a.bookSpread)
  if (sh == null || sa == null || Math.abs(sh + sa) > 1e-9) return none
  const books = Math.min(liveBooks(h, (b) => numOrNull(b.spread) === sh), liveBooks(a, (b) => numOrNull(b.spread) === sa))
  if (!books) return none
  return { spread_home: sh, spread_home_odds: american(h.bookOdds), spread_away_odds: american(a.bookOdds), spread_books: books, open_spread_home: numOrNull(h.openBookSpread) }
}

/** The moneyline half: { ml_home, ml_away, ml_books, open_ml_home, open_ml_away } or nulls. */
export function moneylineOf(ev) {
  const h = ev?.odds?.['points-home-game-ml-home'], a = ev?.odds?.['points-away-game-ml-away']
  const mh = american(h?.bookOdds), ma = american(a?.bookOdds)
  const books = h && a ? Math.min(liveBooks(h, () => true), liveBooks(a, () => true)) : 0
  if (mh == null || ma == null || !books) return { ml_home: null, ml_away: null, ml_books: null, open_ml_home: null, open_ml_away: null }
  return { ml_home: mh, ml_away: ma, ml_books: books, open_ml_home: american(h.openBookOdds), open_ml_away: american(a.openBookOdds) }
}

/** The game-line row for one event and one snapshot kind, or null (not a league we keep, no start, no line). */
export function gameLineRow(ev, snap, takenAt) {
  const sport = BOOK_LINE_LEAGUES[ev?.leagueID]
  if (!sport) return null
  const start = ev.status?.startsAt
  if (!start || !Number.isFinite(Date.parse(start))) return null
  const sp = spreadOf(ev), ml = moneylineOf(ev)
  if (sp.spread_home == null && ml.ml_home == null) return null
  return {
    sport, event_id: ev.eventID, game_date: easternDate(Date.parse(start)), starts_at: start, snap, taken_at: takenAt,
    away: ev.teams?.away?.names?.short || null, home: ev.teams?.home?.names?.short || null, ...sp, ...ml,
  }
}

/**
 * The stored book line for each game, as of `now`: the NEWEST odds_game_lines row taken before both `now` and the
 * game's start whose club pair matches (bookTeamKey) and whose start is within 6 hours of the game's.
 * games = [{ game_id, away, home, start_ms }]. -> Map(game_id -> { spread_home, ml_home, ml_away, taken_at, event_id, ... })
 */
export function bookLinesFor(sport, games, rows, now) {
  const out = new Map()
  for (const g of games || []) {
    const a = bookTeamKey(sport, g.away), h = bookTeamKey(sport, g.home)
    let best = null
    for (const b of rows || []) {
      if (b.sport !== sport || bookTeamKey(sport, b.away) !== a || bookTeamKey(sport, b.home) !== h) continue
      const t = Date.parse(b.taken_at)
      if (!Number.isFinite(t) || t >= now || t >= g.start_ms) continue
      if (Math.abs(Date.parse(b.starts_at) - g.start_ms) > 6 * 3600e3) continue
      if (!best || t > best.t) best = { t, b }
    }
    if (best) {
      const b = best.b
      out.set(String(g.game_id), {
        spread_home: numOrNull(b.spread_home), spread_home_odds: numOrNull(b.spread_home_odds), spread_away_odds: numOrNull(b.spread_away_odds),
        ml_home: numOrNull(b.ml_home), ml_away: numOrNull(b.ml_away), books: numOrNull(b.spread_books) ?? numOrNull(b.ml_books),
        taken_at: new Date(best.t).toISOString(), event_id: String(b.event_id), snap: b.snap,
      })
    }
  }
  return out
}
