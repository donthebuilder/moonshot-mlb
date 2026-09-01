// 🏟 SIGNATURE PROPS, per park (2026-09-01) — the things that make a ballpark
// recognisable from a seat behind home, which neither the walls file nor the
// bowl file describes.
//
// parkWalls.js says where the fence is. parkBowls.js says where the seats
// aren't. Both are real geometry, and neither is identity: drawn from those
// two alone Fenway is a tall wall on the left and Wrigley is a ring with
// numbers on it. What a person actually recognises is the Monster's green and
// its ladder, the rooftops across Sheffield, the fountains, the Cove, the
// bridge, the warehouse, the pool. Donovan said "yes to both" when offered
// props and bowls; the bowls shipped, these did not, until now.
//
// A SMALL VOCABULARY, NOT FREEHAND. Every prop is one of a dozen kinds that
// lib/stadiumProps.js knows how to build from three.js primitives. Adding a
// park is a data edit here; adding a kind is a renderer edit there. Angles
// follow the rest of the stadium: -45 = LF line, 0 = dead centre, +45 = RF
// line. Distances are FEET FROM HOME along that angle, or `off` feet beyond
// the wall at that angle.
//
// PARAMETRIC, NOT SURVEYED — same rule as parkBowls.js. Nothing scores off
// these and nothing should; they are for the eye. The one exception that
// touches data is the Monster: its HEIGHT comes from parkWalls (37.31 ft),
// this file only paints it.
//
// KEYED BY VENUE NAME exactly as parkWalls.js keys it, aliases included.
// `propsFor()` returns [] for a venue with no entry, so a park without props
// draws exactly as it did before this file existed.

export const PARK_PROPS = {
  'Fenway Park': [
    // the Monster: painted over the wall the heights already make tall, the
    // ladder that used to be for retrieving balls from the net, and the
    // Monster seats on top
    { kind: 'paint', from: -45, to: -18, color: 0x2f6b47 },
    { kind: 'ladder', a: -34, h: 13, y: 24 },
    { kind: 'boxes', from: -43, to: -19, off: 1, depth: 14, y: 37.3, h: 5, color: 0x2a4a3a },
    // the triangle is already in the wall's own shape (388.5 at LC) — no prop
    { kind: 'sign', a: -14, off: 300, y: 118, w: 60, h: 22, text: 'CITGO', color: 0xe23d28, glow: true },
  ],
  'Wrigley Field': [
    { kind: 'paint', from: -45, to: 45, color: 0x2f5a35 },                          // the ivy
    { kind: 'board', a: 0, off: 72, y: 34, w: 60, h: 34, color: 0x243b2b, text: 'WRIGLEY FIELD' }, // the manual board over CF
    { kind: 'rooftops', from: -44, to: -22, off: 250, n: 5, h: 42, color: 0x5a3f34 }, // Waveland
    { kind: 'rooftops', from: 22, to: 44, off: 250, n: 5, h: 42, color: 0x5a3f34 },   // Sheffield
  ],
  'Coors Field': [
    { kind: 'rocks', a: 0, off: 60, n: 9, spread: 46, color: 0x6b6f72 },              // the rockpile
    { kind: 'fountains', from: -6, to: 6, off: 48, n: 5, h: 22 },                     // and its water
    { kind: 'pines', a: 0, off: 78, n: 7, spread: 60, h: 24 },
  ],
  'Oracle Park': [
    { kind: 'water', from: 28, to: 72, off: 30, depth: 420, color: 0x0f2f4a },        // McCovey Cove
    { kind: 'arcade', from: 34, to: 45, off: 0, h: 24, color: 0x8a4b36 },              // the brick arcade under the RF wall
    { kind: 'sign', a: -30, off: 80, y: 58, w: 64, h: 18, text: 'ORACLE PARK', color: 0xf4f4f5 },
  ],
  'Daikin Park': [
    { kind: 'boxes', from: -45, to: -30, off: 1, depth: 22, y: 19, h: 6, color: 0x7a4a30 },     // Crawford Boxes
    { kind: 'sign', a: -37, off: 6, y: 27, w: 52, h: 8, text: 'CRAWFORD BOXES', color: 0xf4f4f5 },
  ],
  'Yankee Stadium': [
    { kind: 'frieze', from: -62, to: 62, off: 212, y: 116, h: 7, color: 0xd8d4c8 },  // the frieze along the upper deck
  ],
  'PNC Park': [
    { kind: 'water', from: 26, to: 72, off: 40, depth: 480, color: 0x1a2c3a },        // the Allegheny
    { kind: 'bridge', from: 30, to: 66, off: 300, y: 52, color: 0xf2c230 },           // the Clemente Bridge
    { kind: 'skyline', from: 20, to: 72, off: 700, n: 9, h: 180, color: 0x2b3340 },
  ],
  'Oriole Park at Camden Yards': [
    { kind: 'building', a: 40, off: 120, w: 520, d: 50, h: 64, color: 0x6e3a2c, windows: true }, // the B&O Warehouse
    { kind: 'sign', a: 40, off: 120, y: 72, w: 90, h: 12, text: 'B&O WAREHOUSE', color: 0xf4f4f5 },
  ],
  'Kauffman Stadium': [
    { kind: 'water', from: 8, to: 50, off: 12, depth: 60, color: 0x143a5a },           // the fountains' pool
    { kind: 'fountains', from: 12, to: 46, off: 34, n: 9, h: 40 },
  ],
  'Chase Field': [
    { kind: 'pool', a: 27, off: 12, w: 34, d: 24, color: 0x1b8fd6 },                   // the pool
  ],
  'Dodger Stadium': [
    { kind: 'sign', a: -30, off: 130, y: 96, w: 70, h: 26, text: 'DODGERS', color: 0x1e5bc6, glow: true },
    { kind: 'pines', a: 0, off: 140, n: 9, spread: 240, h: 40 },                       // the palms over the pavilions read as trees from here
  ],
  'Citi Field': [
    { kind: 'orb', a: 5, off: 60, y: 30, r: 14, color: 0xd7263d },                      // the Home Run Apple
  ],
}
// Aliases the walls file also carries, pointed at the same list.
PARK_PROPS['UNIQLO Field at Dodger Stadium'] = PARK_PROPS['Dodger Stadium']

export function propsFor(venue) {
  return PARK_PROPS[venue] || []
}
