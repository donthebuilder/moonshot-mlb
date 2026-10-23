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
  orange: '#a78bfa',    // components asking MOONSHOT's accent get BUCKETS' purple (2026-10-20: the Odds page's pills were orange; LAMP's orange is ice)
  amber: '#fbbf24',
  // THE SHOT CHART'S FLOOR (2026-10-19, the contour court Donovan picked): dark-stained hardwood boards and the line paint
  wood1: '#3a2a1d',
  wood2: '#402e20',
  courtLine: '#f3eadf',
}
// THE TABLETOP PROTOTYPES (2026-10-23, Donovan: basketball like the vintage games -- "the 70s LED and the tin spring
// lever ... I just want to see a prototype"). Their own paint, read by lib/tabletop/tinCourt.js and ledHandheld.js.
export const TINCOURT = {
  maple: '#e9b45c',      // the printed floor (a lithograph's flat maple)
  mapleDark: '#c48a3a',  // its board lines and the printed grain
  line: '#fdf6e3',       // the printed court lines
  litho: '#c8102e',      // the lithograph's red (borders, the halftone band)
  lithoBlue: '#1d3f8f',  // its blue
  tin: '#c9a85c',        // the tin rim and stands
  tinDark: '#7a6332',
  backboard: '#f7f3ea',
  rim: '#ff6a2a',
  ink: '#1b1712',
  table: '#1d140d',
  night: '#05070c',
  lamp: '#fff1d0',
  skin: '#b07a52',       // the cut-outs' printed skin
  hair: '#2a1d14',
  bare: '#d4d6d2',       // tin showing through where the print is chipped or scratched
  rust: '#8a4b22',       // the freckles a tin toy picks up
}
export const LED = {
  body: '#131315',       // the handheld's black plastic
  bezel: '#2a2a2e',
  screen: '#1a0606',     // the smoked red window, off
  on: '#ff2a1f',         // a lit LED
  dim: '#5a0c08',        // an LED half lit (the defenders)
  off: '#2e0a08',        // an LED off, seen through the window
  print: '#d9d4c7',      // the printed labels on the body
  key: '#3a3a3f',        // the buttons
  shoot: '#c8102e',      // the big SHOOT button
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
