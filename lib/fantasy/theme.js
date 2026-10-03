// FRANCHISE'S TOKENS (2026-10-03, COMPONENT-REUSE R10, Donovan 10-01 "stay
// gold"): the DASH chassis (lib/design/tokens.js) plus gold, FRANCHISE's one
// accent -- the same shape as lib/nhl/theme.js and lib/nba/theme.js. The CSS
// side reads the same values as --fx-* (app/fantasy/theme-tokens.css on the
// --dx-* chassis vars). The data hues are the chassis palette's own.
import { CHASSIS, NUM_FONT } from '../design/tokens'
import { THEMES } from '../themes'

const E = THEMES.ember.C
export const C = {
  ...CHASSIS,
  gold: '#f6a928',   // FRANCHISE -- the one accent (unchanged since launch)
  red: E.red, green: E.green, cyan: E.cyan, purple: E.purple, yellow: E.yellow, orange: E.orange, blue: E.blue,
}
export const ACCENT = C.gold
export { NUM_FONT }
