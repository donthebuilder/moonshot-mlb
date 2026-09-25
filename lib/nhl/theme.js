// 🏒 LAMP palette — the NHL product inside DASH Network.
//
// Same chassis as lib/theme.js and lib/nfl/theme.js: identical greys,
// identical contrast discipline, identical NUM_FONT. Only the accent family
// changes, for the same reason TUDDY's did (2026-09-11): you should be able
// to tell which sport you are looking at from six feet away.
//
//   MLB   orange → red        a ball leaving the yard
//   NFL   spectral jade → cyan signal, not turf
//   NHL   ice → cream, and one red lamp
//
// THE LAMP IS THE BRAND. "Lighting the lamp" is the goal light behind the
// net, so on this product RED MEANS EXACTLY ONE THING: a goal, or a game
// that is live. It is never a miss, never an error, never a bad number.
// A miss on LAMP is dim grey, the way TUDDY renders one. Product accent is
// ice (cold, arena glass); analytical accent is teal, sparingly, per the
// DASH colour rules. MOONSHOT keeps orange, TUDDY keeps jade.
//
// Every key the shared components reach for (C.orange, C.green, C.cyan,
// C.red, C.yellow …) still resolves here, so PageHeader / DenseTable /
// TabNotFound render inside this shell without a second file existing.

export const C = {
  bg: '#050608',
  bg2: '#0c0e14',
  bg3: '#12141e',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.09)',
  border2: 'rgba(255,255,255,0.15)',
  text: '#f4f4f5',
  text2: '#b4b4bc',
  text3: '#8b8b95',
  // ── the LAMP accents ──
  ice: '#8ecbff',       // primary — product accent, nav, live state chrome
  cream: '#f1ead9',     // editorial display type (DASH brand secondary)
  lamp: '#ff3b3b',      // THE GOAL LIGHT — goals and live games only
  teal: '#2dd4bf',      // analytical — sparingly
  // ── shared-component compatibility (same values TUDDY carries) ──
  green: '#2dd4bf',     // "positive" for any shared component; teal family here
  cyan: '#8ecbff',      // shared components asking for the sport's cool accent get ice
  red: '#ff3b3b',
  yellow: '#facc15',
  lime: '#a3e635',
  purple: '#a78bfa',
  blue: '#60a5fa',
  orange: '#f97316',    // DASH orange stays DASH's; kept so C.orange resolves
  amber: '#fbbf24',
}

export const ACCENT = C.ice
/** The wordmark gradient: ice into cream, the way TUDDY's runs amber into jade. */
export const GRADIENT = `linear-gradient(120deg, ${C.ice}, ${C.cream})`

export const NUM_FONT = "'Roboto Mono','SF Mono','Cascadia Mono',Menlo,Consolas,monospace"
export { TYPE } from '../theme'

// One ordered ramp for anything sequential on LAMP (heat, meters): cold to
// hot, ice into the lamp. Never used for hit/miss.
export const RAMP = ['#1e3a5f', '#2f6ea8', C.ice, '#ffd6a8', '#ff8a5b', C.lamp]
export function rampAt(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0))
  return RAMP[Math.min(RAMP.length - 1, Math.floor(x * RAMP.length))]
}
