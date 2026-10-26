// PAIR PRICES (2026-10-26, pair value). Server only. Each priced man's best price for the next slate with a game still to start, from our
// own odds_snap (the NEWEST snapshot per man, lib/odds/longshots.js latestPrices: the one read the longshots page already shares). The pair
// tables join it by player id to lay each pair's record against what the two legs pay together (lib/pairValue.js). A man with no price
// has no entry: never a guessed one. NBA has no anytime-scorer market in odds_snap, so it has no prices here.
import { latestPrices, nextPricedDate } from './longshots'

/** { sport, date, priced, prices: { [playerId]: { best, book, books, median, event, startsAt } } } */
export async function readPairPrices(db, sport, { date = null } = {}) {
  const day = date || (await nextPricedDate(db, sport))
  if (!day) return { sport, date: null, priced: 0, prices: {} }
  const map = await latestPrices(db, sport, day)
  const prices = {}
  for (const [id, p] of map) prices[String(id)] = { best: p.best, book: p.best_book, books: p.books, median: p.median, event: p.event_id, startsAt: p.starts_at }
  return { sport, date: day, priced: map.size, prices }
}
