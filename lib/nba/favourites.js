// 💰 HOW BIG FAVOURITES DID, 2025-26 (2026-10-22, Donovan: "blowout watches help with ... moneyline odds"). MEASURED by
// scripts/measure-nba-favourites.mjs on every regular-season final with the book's CLOSING spread (ESPN's odds feed,
// 1,231 games): the favourite's spread band, games, how many the favourite won, how many by BLOWOUT_FINAL (15)+, and the
// favourite's median moneyline. Real results against the book's own price; nothing modelled, no chance printed.
// Re-measure after 2026-27 (backtest-nba-gamelines --cache, then this script).
export const FAVOURITES_SEASON = '2025-26'
export const FAVOURITES = [
  { lo: 0.5, hi: 4.5, games: 487, won: 269, big: 90, medianMl: -148 },
  { lo: 5, hi: 9.5, games: 425, won: 314, big: 118, medianMl: -278 },
  { lo: 10, hi: 12.5, games: 155, won: 116, big: 53, medianMl: -550 },
  { lo: 13, hi: 99, games: 164, won: 152, big: 100, medianMl: -1100 },
]

/** The band a spread (either sign) falls in, or null. */
export function favouriteBand(spread) {
  const s = Math.abs(Number(spread))
  if (!Number.isFinite(s) || s === 0) return null
  return FAVOURITES.find((b) => s >= b.lo && s <= b.hi) || null
}

/** -550 -> '-550', 120 -> '+120', null -> null */
export const fmtMl = (ml) => (ml == null || !Number.isFinite(Number(ml)) ? null : `${Number(ml) > 0 ? '+' : ''}${Number(ml)}`)
