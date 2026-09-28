// THE NETWORK'S CHASSIS, ONCE (2026-09-28, MLB-PARITY-BOARDS plan D).
//
// Donovan: "style wise why are things looking different". One reason was
// three theme files: MOONSHOT's lib/theme.js, TUDDY's lib/nfl/theme.js and
// LAMP's lib/nhl/theme.js each spelled out the page surfaces by hand, and
// TUDDY/LAMP had drifted to a deeper ground (#050608 / #0c0e14 against
// MOONSHOT's #09090b / #111113) -- same brand, two blacks.
//
// This file is the part every product shares: the surfaces, the borders, the
// three ink tiers and the number font. The values are MOONSHOT's shipped
// palette (lib/themes.js "ember", which lib/theme.js's C starts from), read
// from there rather than typed again, so there is still one place a grey is
// written. A product theme spreads CHASSIS and adds ONLY its own accents
// (MOONSHOT orange, TUDDY jade, LAMP ice) and its own ramps.
//
// Static on purpose: MOONSHOT's C is repainted at runtime by applyTheme
// (light mode, palettes); TUDDY and LAMP are dark-only today and this keeps
// them that way -- they share the shipped dark chassis, not the switch.
import { THEMES } from '../themes'

const E = THEMES.ember.C

export const CHASSIS = {
  bg: E.bg, bg2: E.bg2, bg3: E.bg3,
  glass: E.glass,
  border: E.border, border2: E.border2,
  text: E.text, text2: E.text2, text3: E.text3,
}

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
