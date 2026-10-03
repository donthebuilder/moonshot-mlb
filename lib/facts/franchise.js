// ONE FRANCHISE, ONE CODE (BATCH-FACT-ENGINE, 2026-10-02). A relocated club is
// the same franchise: Cowork's first count had KC vs the Raiders at 12 games
// since 1999 because OAK and LV were two codes. Every head-to-head and
// "since" count runs its team codes through this table FIRST. Old code -> the
// franchise's current code, per sport (Donovan's map, 10-02).
export const FRANCHISE = {
  nfl: { OAK: 'LV', SD: 'LAC', STL: 'LA' },
  mlb: { OAK: 'ATH', MON: 'WSH' },
  nhl: { ARI: 'UTA', ATL: 'WPG' },
  nba: { SEA: 'OKC', NJN: 'BKN', NOH: 'NOP', NOK: 'NOP' },   // the Charlotte Bobcats are CHA already
}
/** The franchise's current code for any code it has played under. */
export const franchiseOf = (sport, code) => {
  const c = String(code || '').toUpperCase()
  return FRANCHISE[sport]?.[c] || c
}
/** One key for a pair of franchises, order-free. */
export const pairKey = (sport, a, b) => [franchiseOf(sport, a), franchiseOf(sport, b)].sort().join('-')
