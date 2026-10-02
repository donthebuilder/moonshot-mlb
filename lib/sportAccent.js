// EACH PRODUCT'S ACCENT, BY SPORT KEY (2026-10-01, 0g B4). Pages that list
// every product (the 404, the account page) draw a door per sport in the
// registry (lib/routes.js SPORT_KEYS x BRAND) in that product's own colour,
// read from its own theme -- a new sport adds one line here and its door
// appears everywhere.
import { C as MLB_C } from './theme'
import { ACCENT as NFL_ACCENT } from './nfl/theme'
import { ACCENT as NHL_ACCENT } from './nhl/theme'

export const SPORT_ACCENT = { mlb: MLB_C.orange, nfl: NFL_ACCENT, nhl: NHL_ACCENT }
