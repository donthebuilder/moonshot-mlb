// THE PRICE AT LOCK (odds plan step 3 prep, 2026-09-27). Server only, read-only.
//
// For a player on a game date: what the books offered in the 'lock' snapshot
// (odds_snap, written by /api/odds/tick 50-70 min before the start; NHL's
// lock is 5-15 min). One answer per (sport, game_date, our_player_id):
//
//   best     the longest price any book offered (available books only)
//   median   the middle of the available books' prices, in implied-probability
//            terms (American odds don't average), converted back
//   books    how many books listed him; fair / open = the feed's market-wide
//            no-vig price and opening line, as stored
//
// NEVER A GUESSED PRICE: no lock row means no price. A player with lock rows
// in two different events that date (a doubleheader) is ambiguous and left
// out -- counted in `ambiguous`, never picked between.
import { readPaged } from '../record/paged'

/** American odds -> implied probability (with the book's vig in it). */
export const impliedOf = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100))
/** Implied probability -> American odds, rounded to a whole number. */
export const americanOf = (p) => (p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p))
/** Profit on a 1-unit stake that wins at American odds `a`. */
export const winProfit = (a) => (a > 0 ? a / 100 : 100 / -a)

function median(nums) {
  const s = [...nums].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Group lock rows into one price per player-date. Pure; exported for tests. */
export function pricesFromRows(rows) {
  const by = new Map()
  for (const r of rows) {
    if (!r.our_player_id) continue
    const k = `${r.sport}:${r.game_date}:${r.our_player_id}`
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(r)
  }
  const out = new Map()
  let ambiguous = 0
  for (const [k, list] of by) {
    if (new Set(list.map((r) => r.event_id)).size > 1) { ambiguous += 1; continue }
    const live = list.filter((r) => r.available && Number.isInteger(r.odds))
    if (!live.length) continue
    const top = live.reduce((a, b) => (b.odds > a.odds ? b : a))
    out.set(k, {
      event_id: list[0].event_id,
      best: top.odds, best_book: top.book,
      median: americanOf(median(live.map((r) => impliedOf(r.odds)))),
      books: live.length,
      fair: list[0].fair_odds ?? null, open: list[0].open_odds ?? null,
      taken_at: list[0].taken_at,
    })
  }
  return { prices: out, ambiguous }
}

/**
 * Lock prices for one sport between two game dates (inclusive).
 * @returns {{ prices: Map<string, object>, ambiguous: number, error: object|null }}
 *   keyed `${sport}:${game_date}:${our_player_id}` (priceKey).
 */
export async function readLockPrices(db, { sport, since = null, until = null }) {
  const { data, error } = await readPaged(() => {
    let q = db.from('odds_snap')
      .select('sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at')
      .eq('sport', sport).eq('snap', 'lock').not('our_player_id', 'is', null)
    if (since) q = q.gte('game_date', since)
    if (until) q = q.lte('game_date', until)
    return q.order('game_date', { ascending: true }).order('event_id', { ascending: true }).order('odd_id', { ascending: true }).order('book', { ascending: true })
  })
  if (error) return { prices: new Map(), ambiguous: 0, error }
  return { ...pricesFromRows(data), error: null }
}

export const priceKey = (sport, gameDate, playerId) => `${sport}:${gameDate}:${playerId}`
