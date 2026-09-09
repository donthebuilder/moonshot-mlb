// 🧱 Real MLB park dimensions AND wall heights, one source, all 32 rendered
// venues (30 clubs + Field of Dreams + Journey Bank Ballpark).
//
// Pulled from Baseball Savant's Statcast Park Factors "dimensions" leaderboard
// (https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=dimensions&year=2026),
// which is the only public source that carries wall HEIGHT alongside distance —
// statsapi's `venues?hydrate=fieldInfo` (lib/walls.js) gives distance only.
// Regenerate with bots/fetch_park_dimensions.py in the MLB-HR-DASHBOARD-STREAMLIT
// repo (heights are known to shift between seasons — Savant itself flags 2022
// and 2025 as wall-change years, so re-pull per season, don't freeze this file
// across years).
//
// Format matches what SprayField/SprayFieldStadium already expect:
//   d = [LF line, LF-CF gap, CF, CF-RF gap, RF line], feet
//   h = wall height at those same five points, feet
//
// Keyed by venue name exactly as the bot publishes it in `venue_name` — kept
// as an object (not a Map) so it round-trips through JSON/import cleanly.
// Known aliases for the same physical park are duplicated under both names
// (Guaranteed Rate Field <-> Rate Field white-sox rename; Dodger Stadium's
// sponsor-name variant) rather than resolved through a second normalize step,
// same pattern the file this replaces used.
//
// Kauffman Stadium carries Savant's `is_diff_configuration` flag on its only
// row -- earlier venue-height work (2026-08-29 audit) found that filtering
// diff-only rows wholesale silently drops it. Nothing here filters on that
// flag; every row Savant returns for 2026 is kept.

export const PARK_WALLS = {
  'Fenway Park':                    { d: [308.5, 344.8, 388.5, 377.8, 299.3], h: [37.31, 37.31, 17.17, 3.96, 3.58] },
  'Yankee Stadium':                 { d: [317.5, 391.8, 408.0, 363.7, 313.4], h: [8.05, 8.12, 8.15, 8.31, 7.68] },
  'Coors Field':                    { d: [346.9, 407.5, 414.7, 385.1, 350.8], h: [12.41, 7.62, 7.63, 16.13, 16.23] },
  'Dodger Stadium':                 { d: [326.5, 371.9, 394.9, 371.6, 326.3], h: [3.64, 7.55, 7.51, 7.58, 3.47] },
  'UNIQLO Field at Dodger Stadium': { d: [326.5, 371.9, 394.9, 371.6, 326.3], h: [3.64, 7.55, 7.51, 7.58, 3.47] },
  'Oracle Park':                    { d: [339.8, 376.9, 391.2, 410.8, 304.1], h: [8.17, 8.19, 9.13, 6.56, 23.81] },
  'Wrigley Field':                  { d: [354.2, 356.2, 397.2, 378.9, 349.2], h: [11.33, 11.13, 10.90, 11.19, 11.05] },
  'Great American Ball Park':       { d: [327.8, 376.1, 403.6, 368.3, 324.4], h: [11.35, 11.31, 7.74, 7.58, 11.78] },
  'Oriole Park at Camden Yards':    { d: [332.9, 370.7, 399.6, 385.5, 317.8], h: [6.42, 6.34, 5.94, 5.94, 19.93] },
  'Truist Park':                    { d: [334.7, 386.1, 400.0, 378.8, 326.0], h: [5.30, 7.97, 7.99, 15.35, 15.33] },
  'Citi Field':                     { d: [334.3, 367.5, 407.4, 372.5, 329.5], h: [8.21, 7.80, 7.86, 7.53, 9.77] },
  'Petco Park':                     { d: [334.6, 380.5, 395.9, 388.7, 321.8], h: [4.39, 6.15, 7.13, 7.30, 10.45] },
  'Progressive Field':              { d: [324.8, 367.8, 400.0, 374.9, 324.6], h: [20.14, 19.97, 7.53, 7.53, 12.03] },
  'Rogers Centre':                  { d: [328.1, 381.2, 400.0, 373.3, 328.3], h: [14.11, 10.21, 7.66, 10.80, 12.33] },
  'Daikin Park':                    { d: [314.7, 367.3, 409.1, 377.6, 325.5], h: [18.18, 24.24, 9.35, 9.56, 6.26] },
  'T-Mobile Park':                  { d: [330.7, 378.9, 400.7, 382.0, 326.9], h: [7.66, 7.66, 7.68, 7.68, 7.61] },
  'Angel Stadium':                  { d: [329.6, 386.1, 398.3, 369.0, 329.6], h: [3.18, 6.56, 6.56, 6.55, 3.21] },
  'Tropicana Field':                { d: [313.2, 383.5, 404.0, 383.6, 319.9], h: [4.79, 11.35, 9.09, 11.24, 8.92] },
  'Sutter Health Park':             { d: [330.2, 385.7, 401.3, 375.4, 324.5], h: [7.92, 7.61, 7.90, 4.80, 13.25] },
  'Busch Stadium':                  { d: [334.8, 390.4, 399.6, 390.7, 334.9], h: [7.43, 7.40, 7.37, 7.34, 7.34] },
  'American Family Field':          { d: [340.8, 371.3, 399.1, 376.7, 344.5], h: [14.81, 6.72, 6.90, 6.77, 7.10] },
  'PNC Park':                       { d: [324.4, 399.9, 398.3, 377.9, 319.5], h: [4.83, 4.81, 9.59, 9.58, 22.05] },
  'Kauffman Stadium':               { d: [324.1, 384.4, 410.1, 385.1, 324.5], h: [8.00, 8.00, 8.00, 8.00, 8.00] },
  'Target Field':                   { d: [338.3, 382.3, 403.8, 373.4, 327.9], h: [7.69, 7.71, 7.61, 22.99, 20.41] },
  'Comerica Park':                  { d: [342.7, 383.8, 412.3, 390.9, 327.4], h: [7.89, 6.72, 6.71, 6.65, 9.04] },
  'Guaranteed Rate Field':          { d: [328.4, 378.9, 400.0, 379.8, 334.6], h: [6.55, 6.80, 6.75, 6.60, 6.54] },
  'Rate Field':                     { d: [328.4, 378.9, 400.0, 379.8, 334.6], h: [6.55, 6.80, 6.75, 6.60, 6.54] },
  'Nationals Park':                 { d: [336.3, 377.5, 401.6, 370.0, 334.9], h: [8.61, 7.67, 6.96, 14.14, 16.32] },
  'Citizens Bank Park':             { d: [328.3, 375.5, 401.8, 369.9, 329.6], h: [10.91, 9.58, 5.56, 12.47, 12.47] },
  'loanDepot park':                 { d: [343.8, 387.2, 396.3, 384.3, 334.6], h: [11.00, 11.03, 8.25, 8.09, 11.04] },
  'Chase Field':                    { d: [328.7, 388.7, 406.3, 389.3, 333.7], h: [8.04, 7.31, 24.46, 6.90, 8.29] },
  'Globe Life Field':               { d: [328.2, 380.7, 406.3, 372.9, 321.2], h: [7.97, 8.05, 8.05, 6.43, 8.03] },
  // Special-event parks Savant also carries a 2026 row for -- not a home venue
  // for any club, but the bot occasionally scores a game there (Field of
  // Dreams game) or a played-there exhibition (Journey Bank Ballpark).
  'Field of Dreams':                { d: [335.0, 378.5, 400.0, 378.5, 335.0], h: [7.00, 7.00, 12.00, 7.00, 7.00] },
  'Journey Bank Ballpark':          { d: [320.2, 364.0, 410.9, 384.8, 328.0], h: [8.00, 12.00, 16.00, 12.00, 8.00] },
}

export default PARK_WALLS
