// THE SHOT MAP'S SHAPE, BROWSER-SAFE (BATCH-3D-V2). lib/nhl/shotMap.js is
// server-only (it reads the database), but the page needs the same slot and
// grid to print its numbers; both read these.
export const SLOT = { x0: 69, x1: 89, y: 22 }
export const GRID = { x0: 25, x1: 100, cols: 5, y0: -42.5, y1: 42.5, rows: 5 }
// the league-wide games a season needs before its zone averages shade a comparison (~10 a club)
export const LEAGUE_MIN_GAMES = 160
