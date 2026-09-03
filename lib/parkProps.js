// 🏟 SIGNATURE PROPS, per park (2026-09-01; the detail pass 2026-09-02) — the
// things that make a ballpark recognisable from a seat behind home, which
// neither the walls file nor the bowl file describes.
//
// parkWalls.js says where the fence is. parkBowls.js says where the seats
// aren't. Both are real geometry, and neither is identity: drawn from those
// two alone Fenway is a tall wall on the left and Wrigley is a ring with
// numbers on it. What a person actually recognises is the Monster's green and
// its ladder, the rooftops across Sheffield, the fountains, the Cove, the
// bridge, the warehouse, the pool. Donovan said "yes to both" when offered
// props and bowls; the bowls shipped, these did not, until now.
//
// A SMALL VOCABULARY, NOT FREEHAND. Every prop is one of the kinds that
// lib/stadiumProps.js knows how to build from three.js primitives. Adding a
// park is a data edit here; adding a kind is a renderer edit there. Angles
// follow the rest of the stadium: -45 = LF line, 0 = dead centre, +45 = RF
// line. Distances are FEET FROM HOME along that angle, or `off` feet beyond
// the wall at that angle.
//
// THE DETAIL PASS (2026-09-02). Donovan: "go crazy, make the parks more
// detailed now that you have upgrades." Every one of the 32 rendered venues
// has an entry now, and the vocabulary grew from a dozen kinds to thirty:
// the Monster's hand board and the Wrigley basket, Monument Park, the Dodger
// hex boards and the pavilion zigzag, the purple row, the bottle and the
// glove, the crown, the train, the Gateway Arch, the smokestacks, the
// pinwheels, the Big A, the Liberty Bell, the corn. Still no logos and no
// club marks: Donovan, "keep it true to the baseball parks." A videoboard
// shows the park's own name and nothing else.
//
// PARAMETRIC, NOT SURVEYED — same rule as parkBowls.js. Nothing scores off
// these and nothing should; they are for the eye. The one exception that
// touches data is the Monster: its HEIGHT comes from parkWalls (37.31 ft),
// this file only paints it.
//
// KEYED BY VENUE NAME exactly as parkWalls.js keys it, aliases included.
// `propsFor()` returns [] for a venue with no entry, so a park without props
// draws exactly as it did before this file existed. The world adds a generic
// videoboard (and roof trusses where the bowl has a roof) to any park whose
// list has no board of its own — see lib/stadiumWorld.

export const PARK_PROPS = {
  'Fenway Park': [
    // the Monster: painted over the wall the heights already make tall, the
    // hand-operated scoreboard set into it, the ladder that used to be for
    // retrieving balls from the net, and the Monster seats on top
    { kind: 'paint', from: -45, to: -18, color: 0x2f6b47 },
    { kind: 'wallboard', from: -37, to: -22, y: 6, h: 17, color: 0x17301f },
    { kind: 'ladder', a: -34, h: 13, y: 24 },
    { kind: 'boxes', from: -43, to: -19, off: 1, depth: 14, y: 37.3, h: 5, color: 0x2a4a3a },
    // the triangle is already in the wall's own shape (388.5 at LC) — no prop
    { kind: 'videoboard', a: -8, off: 96, y: 62, w: 88, h: 34, text: 'Fenway Park' },
    { kind: 'sign', a: -14, off: 300, y: 118, w: 60, h: 22, text: 'CITGO', color: 0xe23d28, glow: true },
    { kind: 'skyline', from: -40, to: 40, off: 620, n: 8, h: 150, color: 0x2b3340 },
  ],
  'Wrigley Field': [
    { kind: 'paint', from: -45, to: 45, color: 0x2f5a35 },                          // the ivy
    { kind: 'basket', from: -44, to: 44 },                                          // the basket
    { kind: 'board', a: 0, off: 72, y: 34, w: 60, h: 34, color: 0x243b2b, text: 'WRIGLEY FIELD' }, // the manual board over CF
    { kind: 'clock', a: 0, off: 69, y: 74, r: 5 },                                  // the clock on top of it
    { kind: 'rooftops', from: -44, to: -22, off: 250, n: 5, h: 42, color: 0x5a3f34 }, // Waveland
    { kind: 'rooftops', from: 22, to: 44, off: 250, n: 5, h: 42, color: 0x5a3f34 },   // Sheffield
  ],
  'Coors Field': [
    { kind: 'rocks', a: 0, off: 60, n: 9, spread: 46, color: 0x6b6f72 },              // the rockpile
    { kind: 'fountains', from: -6, to: 6, off: 48, n: 5, h: 22 },                     // and its water
    { kind: 'pines', a: 0, off: 78, n: 7, spread: 60, h: 24 },
    { kind: 'seatrow', from: -55, to: 55, off: 176, y: 92, color: 0x6b3fa0 },        // the purple row, a mile up
    { kind: 'videoboard', a: -22, off: 110, y: 78, w: 100, h: 42, text: 'Coors Field' },
    { kind: 'skyline', from: -60, to: -20, off: 700, n: 8, h: 220, color: 0x2b3340 },
  ],
  'Oracle Park': [
    { kind: 'water', from: 28, to: 72, off: 30, depth: 420, color: 0x0f2f4a },        // McCovey Cove
    { kind: 'arcade', from: 34, to: 45, off: 0, h: 24, color: 0x8a4b36 },              // the brick arcade under the RF wall
    { kind: 'bottle', a: -34, off: 70, y: 56, r: 7, h: 80, color: 0x2f9a4f, tilt: 24 }, // the bottle over the LF stands
    { kind: 'glove', a: -22, off: 74, y: 70, r: 15, color: 0x6b4526 },                 // and the mitt beside it
    { kind: 'videoboard', a: 0, off: 84, y: 60, w: 110, h: 44, text: 'Oracle Park' },
    { kind: 'bridge', from: 40, to: 74, off: 900, y: 90, color: 0x8a949e },            // the Bay Bridge, far
  ],
  'Daikin Park': [
    { kind: 'boxes', from: -45, to: -30, off: 1, depth: 22, y: 19, h: 6, color: 0x7a4a30 },     // Crawford Boxes
    { kind: 'sign', a: -37, off: 6, y: 27, w: 52, h: 8, text: 'CRAWFORD BOXES', color: 0xf4f4f5 },
    { kind: 'train', from: -44, to: -14, off: 46, y: 46, color: 0xe8701a },            // the train on the LF wall
    { kind: 'videoboard', a: 8, off: 90, y: 60, w: 120, h: 46, text: 'Daikin Park' },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 46, n: 3, y: 205, y0: 112 },
  ],
  'Yankee Stadium': [
    { kind: 'frieze', from: -62, to: 62, off: 212, y: 116, h: 7, color: 0xd8d4c8 },  // the frieze along the upper deck
    { kind: 'garden', from: -18, to: -4, off: 14, h: 5 },                             // Monument Park, behind the CF wall
    { kind: 'videoboard', a: 6, off: 100, y: 68, w: 120, h: 50, text: 'Yankee Stadium' },
  ],
  'PNC Park': [
    { kind: 'water', from: 26, to: 72, off: 40, depth: 480, color: 0x1a2c3a },        // the Allegheny
    { kind: 'bridge', from: 30, to: 66, off: 300, y: 52, color: 0xf2c230 },           // the Clemente Bridge
    { kind: 'skyline', from: 20, to: 72, off: 700, n: 9, h: 180, color: 0x2b3340 },
    { kind: 'videoboard', a: -30, off: 80, y: 56, w: 90, h: 38, text: 'PNC Park' },
  ],
  'Oriole Park at Camden Yards': [
    { kind: 'building', a: 40, off: 120, w: 520, d: 50, h: 64, color: 0x6e3a2c, windows: true }, // the B&O Warehouse
    { kind: 'sign', a: 40, off: 120, y: 72, w: 90, h: 12, text: 'B&O WAREHOUSE', color: 0xf4f4f5 },
    { kind: 'clock', a: 40, off: 118, y: 54, r: 6 },
    { kind: 'videoboard', a: 0, off: 90, y: 60, w: 96, h: 40, text: 'Camden Yards' },
  ],
  'Kauffman Stadium': [
    { kind: 'water', from: 8, to: 50, off: 12, depth: 60, color: 0x143a5a },           // the fountains' pool
    { kind: 'fountains', from: 12, to: 46, off: 34, n: 9, h: 40 },
    { kind: 'crown', a: 0, off: 84, y: 60, w: 104, h: 60, color: 0xd4a72c },          // the crown board
  ],
  'Chase Field': [
    // BATCH PASS (2026-09-03), from photographs. The pool at the base of
    // the right-centre stands, the wide board over the batter's eye in
    // centre, the bullpens in both corners beyond the wall, the retractable
    // roof drawn OPEN: its panels parked in stacks over the stands down
    // both lines, the rear truss across the outfield. Green seats and
    // walls, sandstone concrete. No dirt path (gone with the turf, 2019).
    { kind: 'paint', from: -45, to: 45, color: 0x1f4a30 },
    { kind: 'pool', a: 27, off: 12, w: 34, d: 24, color: 0x1b8fd6 },
    { kind: 'videoboard', a: 0, off: 30, y: 44, w: 136, h: 46, text: 'Chase Field' },
    { kind: 'pen', from: -45, to: -37, off: 2, depth: 14, color: 0x1f4a30 },
    { kind: 'pen', from: 37, to: 45, off: 2, depth: 12, color: 0x1f4a30 },
    { kind: 'roofstack', from: -72, to: -46, off: 60, gap: 20, n: 3, y: 150, color: 0x3d4652 },
    { kind: 'roofstack', from: 46, to: 72, off: 60, gap: 20, n: 3, y: 150, color: 0x3d4652 },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 46, n: 2, y: 205, y0: 112 },
  ],
  'Dodger Stadium': [
    { kind: 'zigzag', from: -44, to: -12, off: 60, depth: 40, y: 34, h: 6, color: 0xdad8d0 },   // the pavilion roofs
    { kind: 'zigzag', from: 12, to: 44, off: 60, depth: 40, y: 34, h: 6, color: 0xdad8d0 },
    { kind: 'hexboard', a: -28, off: 112, y: 92, r: 30, color: 0x1b2a44 },                     // the two hex boards
    { kind: 'hexboard', a: 28, off: 112, y: 92, r: 30, color: 0x1b2a44 },
    { kind: 'pines', a: 0, off: 140, n: 11, spread: 300, h: 44 },                      // the palms over the pavilions
    { kind: 'rocks', a: 0, off: 300, n: 12, spread: 500, color: 0x3a4a3a },            // the hills of Elysian Park
  ],
  'Citi Field': [
    { kind: 'orb', a: 5, off: 60, y: 30, r: 14, color: 0xd7263d },                      // the Home Run Apple
    { kind: 'videoboard', a: -24, off: 92, y: 62, w: 100, h: 44, text: 'Citi Field' },
    { kind: 'bridge', from: 30, to: 56, off: 260, y: 40, color: 0x3a4250 },             // the Shea Bridge
  ],
  'Busch Stadium': [
    { kind: 'arch', a: 8, off: 900, w: 420, h: 420, color: 0xb9bfc7 },                  // the Gateway Arch
    { kind: 'skyline', from: -30, to: 34, off: 720, n: 10, h: 220, color: 0x2b3340 },
    { kind: 'videoboard', a: -18, off: 100, y: 70, w: 110, h: 46, text: 'Busch Stadium' },
  ],
  'Great American Ball Park': [
    { kind: 'stacks', a: 30, off: 90, gap: 44, r: 6, h: 64, color: 0x8a2a2a },          // the riverboat stacks
    { kind: 'water', from: 20, to: 46, off: 130, depth: 400, color: 0x1a2c3a },         // the Ohio
    { kind: 'videoboard', a: -16, off: 96, y: 66, w: 110, h: 46, text: 'Great American Ball Park' },
  ],
  'Rate Field': [
    { kind: 'pinwheels', a: 0, off: 100, y: 68, w: 110, h: 40, n: 7 },                  // the exploding scoreboard
  ],
  'Angel Stadium': [
    { kind: 'rocks', a: -16, off: 20, n: 10, spread: 70, color: 0x6b6f72 },             // the rock pile in LCF
    { kind: 'fountains', from: -20, to: -12, off: 26, n: 4, h: 26 },                    // and its falls
    { kind: 'biga', a: 44, off: 520, h: 150, color: 0xc8102e },                         // the Big A in the lot
    { kind: 'videoboard', a: 22, off: 100, y: 64, w: 100, h: 42, text: 'Angel Stadium' },
  ],
  'Petco Park': [
    // BATCH PASS (2026-09-03), from photographs. The Western Metal Supply
    // building IS the left-field pole, the board over the left-field seats,
    // both bullpens stacked behind the centre-field wall (since 2013), the
    // grass berm of the Park at the Park where centre's seats would be,
    // palms, and downtown over left. Navy seats and walls, sandstone and
    // white steel.
    { kind: 'paint', from: -45, to: 45, color: 0x1b2f5c },
    { kind: 'building', a: -47, off: 2, w: 60, d: 92, h: 78, color: 0x7a3f2e, windows: true },
    { kind: 'sign', a: -47, off: 2, y: 86, w: 96, h: 10, text: 'WESTERN METAL SUPPLY CO.', color: 0xf4f4f5 },
    { kind: 'videoboard', a: -30, off: 32, y: 34, w: 124, h: 61, text: 'Petco Park' },
    { kind: 'pen', from: -15, to: -7, off: 6, depth: 12, color: 0x1b2f5c },
    { kind: 'pen', from: -15, to: -7, off: 20, depth: 12, y: 7, color: 0x1b2f5c },
    { kind: 'berm', from: -7, to: 10, off: 22, depth: 110, h: 28, y0: 8, n: 320 },
    { kind: 'palms', a: 2, off: 136, n: 7, spread: 170, h: 34 },
    { kind: 'palms', a: -28, off: 210, n: 5, spread: 120, h: 30 },
    { kind: 'skyline', from: -72, to: -30, off: 420, n: 9, h: 300, color: 0x2b3340 },
    { kind: 'building', a: -60, off: 300, w: 90, d: 90, h: 330, color: 0x2b3340, windows: true },
    { kind: 'pines', a: 4, off: 520, n: 12, spread: 520, h: 60 },
  ],
  'Comerica Park': [
    // BATCH PASS (2026-09-03), from photographs. Seen from the plate: the
    // huge board over the left-field seats with two tigers on top, the
    // bullpens in front of those seats since 2005, the six statues along
    // the left-centre wall, the flagpole (out of play now), the fountain
    // on the batter's eye in centre, the raised porch over right, and the
    // Detroit skyline over left. Brick fascias, green seats, green walls.
    // The dirt path to the mound is GONE (2025) — not drawn.
    { kind: 'paint', from: -45, to: 45, color: 0x1f4a30 },
    { kind: 'pen', from: -44, to: -27, off: 2, depth: 13, color: 0x1f4a30 },
    { kind: 'videoboard', a: -33, off: 52, y: 36, w: 150, h: 92, text: 'Comerica Park' },
    { kind: 'cats', a: -33, off: 52, y: 128, gap: 112 },
    { kind: 'statues', from: -23, to: -9, off: 3, h: 4, n: 6 },
    { kind: 'flagpole', a: -14, off: 14, h: 95 },
    { kind: 'fountains', from: -5, to: 5, off: 6, n: 7, h: 30, y: 34 },
    { kind: 'boxes', from: 30, to: 44, off: 24, depth: 18, y: 26, h: 6, color: 0x1f4d33 },
    { kind: 'skyline', from: -70, to: -18, off: 480, n: 9, h: 260, color: 0x2b3340 },
    { kind: 'building', a: -40, off: 640, w: 70, d: 70, h: 360, color: 0x2b3340, windows: true },
  ],
  'Citizens Bank Park': [
    { kind: 'bell', a: 30, off: 104, y: 98, r: 10, color: 0xb08d57 },                  // the Liberty Bell
    { kind: 'videoboard', a: -24, off: 96, y: 66, w: 110, h: 46, text: 'Citizens Bank Park' },
  ],
  'Target Field': [
    { kind: 'videoboard', a: -20, off: 90, y: 64, w: 100, h: 42, text: 'Target Field' },
    { kind: 'skyline', from: 26, to: 60, off: 520, n: 8, h: 280, color: 0x2b3340 },
    { kind: 'pines', a: 0, off: 70, n: 9, spread: 90, h: 26 },                          // the spruce beyond CF
  ],
  'Truist Park': [
    { kind: 'building', a: 42, off: 110, w: 160, d: 60, h: 70, color: 0x5a3f34, windows: true }, // the Chop House
    { kind: 'videoboard', a: -18, off: 96, y: 64, w: 110, h: 46, text: 'Truist Park' },
  ],
  'Progressive Field': [
    { kind: 'paint', from: -45, to: -20, color: 0x2a3f5c },                             // the tall LF wall, blue
    { kind: 'videoboard', a: -26, off: 60, y: 44, w: 130, h: 56, text: 'Progressive Field' }, // one of the biggest boards
    { kind: 'skyline', from: -10, to: 40, off: 560, n: 8, h: 300, color: 0x2b3340 },
  ],
  'Nationals Park': [
    { kind: 'videoboard', a: 30, off: 96, y: 64, w: 110, h: 46, text: 'Nationals Park' },
    { kind: 'pines', a: -6, off: 60, n: 7, spread: 120, h: 30 },                        // the cherry trees, in silhouette
    { kind: 'skyline', from: -20, to: 20, off: 800, n: 6, h: 160, color: 0x2b3340 },
  ],
  'American Family Field': [
    { kind: 'videoboard', a: -10, off: 96, y: 66, w: 110, h: 46, text: 'American Family Field' },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 46, n: 4, y: 205, y0: 112 },     // the fan roof
  ],
  'loanDepot park': [
    { kind: 'paint', from: -45, to: 45, color: 0x1e3f5c },                              // the blue walls
    { kind: 'videoboard', a: -12, off: 96, y: 66, w: 110, h: 46, text: 'loanDepot park' },
    { kind: 'water', from: 30, to: 45, off: 8, depth: 40, color: 0x1b6f8f },            // the bobblehead-era pool, a tank
  ],
  'Globe Life Field': [
    { kind: 'videoboard', a: 10, off: 96, y: 68, w: 130, h: 52, text: 'Globe Life Field' },
  ],
  'T-Mobile Park': [
    { kind: 'videoboard', a: -8, off: 96, y: 66, w: 120, h: 50, text: 'T-Mobile Park' },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 50, n: 3, y: 205, y0: 112 },
    { kind: 'skyline', from: -50, to: -10, off: 700, n: 8, h: 300, color: 0x2b3340 },
  ],
  'Rogers Centre': [
    { kind: 'videoboard', a: 0, off: 96, y: 70, w: 130, h: 52, text: 'Rogers Centre' },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 46, n: 3, y: 205, y0: 112 },
  ],
  'Tropicana Field': [
    { kind: 'videoboard', a: 0, off: 90, y: 62, w: 110, h: 46, text: 'Tropicana Field' },
    { kind: 'water', from: 14, to: 24, off: 4, depth: 24, color: 0x1b6f8f },            // the rays tank
  ],
  'Sutter Health Park': [
    { kind: 'pines', a: 0, off: 40, n: 9, spread: 200, h: 34 },
    { kind: 'water', from: -14, to: 14, off: 220, depth: 300, color: 0x1a2c3a },        // the Sacramento River
    { kind: 'bridge', from: -12, to: 12, off: 300, y: 48, color: 0xd4a72c },            // Tower Bridge, gold
    { kind: 'videoboard', a: -26, off: 60, y: 44, w: 80, h: 34, text: 'Sutter Health Park' },
  ],
  'Field of Dreams': [
    { kind: 'corn', from: -72, to: 72, off: 4, depth: 220, n: 1800 },                   // the corn
  ],
  'Journey Bank Ballpark': [
    { kind: 'pines', a: 0, off: 40, n: 11, spread: 260, h: 36 },
    { kind: 'videoboard', a: 0, off: 60, y: 40, w: 70, h: 30, text: 'Journey Bank Ballpark' },
  ],
}
// Aliases the walls file also carries, pointed at the same list.
PARK_PROPS['UNIQLO Field at Dodger Stadium'] = PARK_PROPS['Dodger Stadium']
PARK_PROPS['Guaranteed Rate Field'] = PARK_PROPS['Rate Field']

export function propsFor(venue) {
  return PARK_PROPS[venue] || []
}
