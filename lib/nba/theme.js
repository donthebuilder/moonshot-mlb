// BUCKETS' TOKENS (2026-10-02): the DASH chassis (lib/design/tokens.js) with
// BUCKETS' accents, the same shape as LAMP's lib/nhl/theme.js so every shared
// component (SportTheme, DenseTable, HeaderShell, CallStatusBadge ...) takes it
// as-is. Purple is the product (Donovan 10-02, "purple"); rim orange is a made
// bucket and a live game only, as LAMP's lamp red is a goal.
import { CHASSIS, NUM_FONT } from '../design/tokens'

export const C = {
  ...CHASSIS,
  // ── the BUCKETS accents ──
  purple: '#a78bfa',    // primary -- product accent, nav, live state chrome (MOONSHOT's purple)
  cream: '#f1ead9',     // editorial display type (DASH brand secondary)
  rim: '#ff6a2a',       // THE RIM -- made buckets and live games only
  teal: '#2dd4bf',      // analytical -- sparingly
  // ── shared-component compatibility (the names LAMP and TUDDY carry) ──
  ice: '#a78bfa',       // components asking LAMP's accent get BUCKETS' purple
  green: '#2dd4bf',
  cyan: '#a78bfa',
  red: '#ff6a2a',
  yellow: '#facc15',
  lime: '#a3e635',
  blue: '#60a5fa',
  orange: '#f97316',
  amber: '#fbbf24',
}
export const ACCENT = C.purple
// One hue, like NFL's / NHL's: the dim grey recedes into the accent (PlayerBoardFrame's score chips), built from the tokens.
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16))
const mixHex = (a, b, t) => '#' + hexRgb(a).map((x, i) => Math.round(x + (hexRgb(b)[i] - x) * t).toString(16).padStart(2, '0')).join('')
export const RAMP = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => mixHex(C.text3, C.purple, t))
export const GRADIENT = `linear-gradient(120deg, ${C.purple}, ${C.cream})`
export { NUM_FONT }
export { TYPE } from '../theme'
// the hardwood (lib/courtWorld.js) lives beside MOONSHOT's tokens; BUCKETS re-exports it
export { COURT } from '../theme'
