import { CHASSIS, NUM_FONT } from '../design/tokens'
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

// ONE CHASSIS (2026-09-28, parity plan D): surfaces, borders and ink are
// lib/design/tokens.js -- MOONSHOT's. Only LAMP's accents live here.
export const C = {
  ...CHASSIS,
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

// THE RINK'S PAINT (2026-10-01, BATCH-NHL-3D): the arena view's ice, lines,
// boards and glass. Real rink colours (the league's red line and blue lines,
// white boards), named here so components/lamp/RinkArena.js and lib/rinkWorld.js
// hold no hex of their own.
export const RINK = {
  ice: '#dfe7ee',       // the sheet -- one step off white (BATCH-3D-V2 1f; was #e8eff5)
  iceShade: '#cfdbe6',  // the ice just inside the boards, where it reads greyer
  red: '#c8102e',       // centre line, goal lines, faceoff circles and dots
  blue: '#0b3d91',      // the blue lines, the centre circle and dot
  crease: '#7fb6e6',    // the goal crease fill
  boards: '#f4f6f8',
  kick: '#f2c94c',      // the yellow kick plate at the foot of the boards
  cap: '#2b2f36',       // the rail on top of the boards
  glass: '#bfe3ff',
  seat: '#34405a',      // the decks (lit from the banks above, so a shade up)
  ceiling: '#0c0f15',
  bank: '#fff6e6',      // the light banks under the roof
  // THE MARKS (BATCH-3D-V2 1a): real pucks are black, so the marks are dark on
  // the ice -- on net a charcoal disc with a thin light rim, a miss a small
  // dark x, a block a short dark stub. Only a goal is red (C.lamp).
  puck: '#16191e',
  puckRim: '#c9d4de',
  missInk: '#3b424c',
  iceLine: '#9fb0bf',   // the 2D sheet's distance arcs and circles, on the ice
  // ONE COLOUR PER RESULT (Donovan 10-02: "just like mlb has different colors
  // for different events"): every shot is a puck, coloured by what happened.
  save: '#1d5fd1',      // on net, saved
  miss: '#d97706',      // missed the net
  block: '#5b6470',     // blocked
}

// THE BROADCAST RINK (2026-10-07, Donovan: "give it some real style"; the pale rink was the only
// light surface on the site). The 2D shot map is DARK ICE under the arena lights: thin white lines,
// a blue line, the zones as glowing areas in LAMP's blue and the goals as the bright lamp-red marks.
// Red stays the goal and nothing else (no red faceoff circles here). The 3D arena keeps RINK above.
export const RINK_DARK = {
  ice: '#0b1523',       // the sheet
  iceEdge: '#16263b',   // the ice just inside the boards
  boards: '#35547a',    // the rail
  line: '#dce8f5',      // white lines: circles, goal line, arcs (drawn thin / translucent)
  blueLine: '#2f6ea8',  // the blue line
  crease: '#1d4f86',    // the crease fill
  zone: '#2f6ea8',      // a zone's fill; its brightness is its share of the shots
  miss: '#9fb0bf',      // a missed shot: hollow ring
  block: '#8a96a3',     // a blocked shot: a small x
}

export const ACCENT = C.ice
/** The wordmark gradient: ice into cream, the way TUDDY's runs amber into jade. */
export const GRADIENT = `linear-gradient(120deg, ${C.ice}, ${C.cream})`

export { NUM_FONT }
export { TYPE } from '../theme'

// One ordered ramp for anything sequential on LAMP (heat, meters): cold to
// hot, ice into the lamp. Never used for hit/miss.
export const RAMP = ['#1e3a5f', '#2f6ea8', C.ice, '#ffd6a8', '#ff8a5b', C.lamp]
export function rampAt(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0))
  return RAMP[Math.min(RAMP.length - 1, Math.floor(x * RAMP.length))]
}
