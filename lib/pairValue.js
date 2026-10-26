// PAIR VALUE (2026-10-26, Donovan: "a pairing that hits together ... hit at 20% ... but the value is there, as far as the book prices, them
// two together"). Pure and browser-safe: American prices and a pair's own record in, what the pair WOULD HAVE PAID out. No fetch, no clock.
//
//   together(a, b)      the two legs sold as one parlay: decimal prices multiplied, back to American. A parlay's payout is the
//                       product of its legs' decimal prices; nothing here is a book's quoted parlay or same-game-parlay price (a book
//                       shortens a same-game pair for the correlation, so for two men in one game this is an UPPER bound).
//   pairReturn(rate, a, b)  what a unit bet on this pair at today's two prices would have returned over the pair's history, as a share of
//                       the stake: rate x together-decimal - 1. rate = the pair's joint hit rate (0-1) from the pair file. A record
//                       laid against a price, never a chance: it prints no probability, only a payout.
// Prices are the best any book listed for each man (lib/odds/pairPrices.js); the two best prices can be at different books.
export const decimalOf = (american) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american)
export const americanOfDecimal = (d) => (d >= 2 ? Math.round(100 * (d - 1)) : -Math.round(100 / (d - 1)))

/** Two American prices -> { decimal, american } of the parlay, or null when either is missing. */
export function together(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return null
  const decimal = decimalOf(a) * decimalOf(b)
  return { decimal, american: americanOfDecimal(decimal) }
}

/** The pair's record against tonight's two prices: percent returned per unit staked over its history (null without a rate or a price). */
export function pairReturn(rate, a, b) {
  const t = together(a, b)
  if (!t || !Number.isFinite(rate)) return null
  return Math.round((rate * t.decimal - 1) * 1000) / 10
}
