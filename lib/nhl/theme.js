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
const ICE = '#8ecbff'
const LAMP_RED = '#ff3b3b'
export const C = {
  ...CHASSIS,
  // ── ONE ACCENT, THE REST GREY (2026-10-07 colour diet, Donovan: colour only where it means something) ──
  // Ice is the product's one accent. The analytical teal, the cream display type, the amber warning, the
  // blue / lime / purple / yellow / orange / green the shared components reach for all resolve to ice or to
  // the chassis greys now, so no page can draw a second hue by asking for one. Red (the goal light) stays
  // for a goal and a live game. The rink's own paint (RINK, RINK_DARK, below) is the building, not UI.
  ice: ICE,             // primary: product accent, nav, live state chrome, standouts
  lamp: LAMP_RED,       // THE GOAL LIGHT: goals and live games only
  cream: CHASSIS.text,  // display type: the chassis white
  teal: ICE,      // was the analytical teal: ice
  green: ICE,     // "positive" for any shared component: ice, never green
  cyan: ICE,
  red: LAMP_RED,
  yellow: CHASSIS.text2,
  lime: ICE,
  purple: CHASSIS.text2,
  blue: ICE,
  orange: ICE,
  amber: CHASSIS.text2, // a caution is words in grey, not a hue
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

// One ordered ramp for anything sequential on LAMP (heat, meters): cold to hot, dark ice into bright
// ice (2026-10-07: the warm tail into red is gone, one accent). Never used for hit/miss.
export const RAMP = ['#1e3a5f', '#2f6ea8', C.ice, '#b9dfff', '#d4ecff', '#eaf6ff']
export function rampAt(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0))
  return RAMP[Math.min(RAMP.length - 1, Math.floor(x * RAMP.length))]
}
