// THE OLD ODDS KEYS, ONE LIST (2026-10-07). True Price and Moves & gaps were deleted (Donovan's call) and the
// Line shop is a view of the Odds page; what was worth keeping lives on the Odds board (its Move / Market /
// His nights groups). Every old key, and the words people would type for them, opens #tab=odds on every sport
// that has an Odds page (all four), so no old link 404s. Spread into each sport's alias map; held by
// scripts/check-odds-alias.mjs.
export const ODDS_OLD_KEYS = [
  'trueprice', 'true-price', 'price',
  'signals', 'moves', 'gaps', 'movesgaps', 'moves-gaps', 'moves-and-gaps', 'movesandgaps',
  'lineshop', 'line-shop', 'shop',
]
export const ODDS_ALIASES = Object.fromEntries(ODDS_OLD_KEYS.map((k) => [k, 'odds']))
