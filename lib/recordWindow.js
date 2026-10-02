// "THE RECORD" -- ONE WINDOW PER SPORT (2026-10-01, 0g D4). /start, /called
// and the front door each quoted the record over their own span (10 calendar
// days everywhere / 28-then-10-game-days / 28 and 14 days), so the three
// public pages printed three different "N of M" figures for one sport. This
// is /called's definition, the honest one, for all three: read `fetchDays`
// back, then keep the newest `gameDays` days that actually had games. For
// baseball the two are the same; football plays three days a week, so ten
// calendar days were ~3 game days.
export const RECORD_WINDOW = {
  mlb: { fetchDays: 10, gameDays: 10 },
  nfl: { fetchDays: 28, gameDays: 10 },
  nhl: { fetchDays: 14, gameDays: 10 },
}
export const windowFor = (sport) => RECORD_WINDOW[sport] || RECORD_WINDOW.mlb

/** The newest `n` distinct dates, oldest first. */
export const lastGameDays = (dates, n) => [...new Set(dates.filter(Boolean))].sort().slice(-n)

// THE POOL THE CALLS COVER (0g D4): TUDDY's TD calls cover RB / WR / TE, so a
// QB touchdown is counted beside a day, never inside its capture -- /called's
// rule since TUDDY depth step 6, now read by /start and the front door too, so
// all three quote one "N of M".
export const OUTSIDE_POOL = {
  nfl: (e) => String(e?.payload?.position || '').toUpperCase() === 'QB',
}
export const inPool = (sport) => (e) => !(OUTSIDE_POOL[sport] || (() => false))(e)
