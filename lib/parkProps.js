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
    // BATCH PASS v2 (2026-09-03), against photographs from the 300 level.
    //   CENTRE: a two-storey dark-green pavilion is the batter's eye; the
    //           136-ft board rides on top of it.
    //   LEFT / LEFT-CENTRE: ~24 rows, a small second deck, and behind them
    //           the tall wall of glass panels that lets the light in.
    //   RIGHT-CENTRE: the pool at the base of the stands, lit blue.
    //   CORNERS: both bullpens beyond the wall.
    //   ROOF, OPEN: the panels run the length of the building and park in
    //           stacks over the 1B and 3B sides; two long rails span the
    //           width. Green seats and walls, sandstone concrete.
    { kind: 'paint', from: -45, to: 45, color: 0x1f4a30 },
    { kind: 'building', a: 0, off: 6, w: 150, d: 44, h: 32, color: 0x163d27, windows: false },
    { kind: 'videoboard', a: 0, off: 28, y: 34, w: 136, h: 46, text: 'Chase Field' },
    { kind: 'pool', a: 27, off: 12, w: 34, d: 24, color: 0x1b8fd6 },
    { kind: 'pen', from: -45, to: -37, off: 2, depth: 14, color: 0x1f4a30 },
    { kind: 'pen', from: 37, to: 45, off: 2, depth: 12, color: 0x1f4a30 },
    { kind: 'glass', from: -44, to: -8, off: 118, y0: 48, y1: 150, color: 0x9fb3c8 },
    // (only the outfield half of each stack: the broadcast seat sits under
    //  the near half, and drawing it puts steel across the lens)
    { kind: 'roofstack', from: -112, to: -50, off: 150, gap: 22, n: 3, y: 196, color: 0x3d4652 },
    { kind: 'roofstack', from: 50, to: 112, off: 150, gap: 22, n: 3, y: 196, color: 0x3d4652 },
    { kind: 'trusses', from: -64, to: 64, off: 40, gap: 60, n: 2, y: 215, y0: 130 },
    { kind: 'skyline', from: -60, to: -20, off: 420, n: 7, h: 260, color: 0x2b3340 },
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
    // BATCH PASS v2 (2026-09-03), against a 2024 photograph from behind
    // the plate at dusk.
    //   LEFT: the Western Metal Supply building at the pole; two levels of
    //         seats along left with the board on top at the corner and a
    //         lattice light mast behind it.
    //   CENTRE: a dark two-storey block is the batter's eye, the bullpens
    //         in front of it; right of it the grass berm, palms behind.
    //   RIGHT: a full three-level grandstand to the pole, a light mast on
    //         its roof, a smaller board on its upper deck.
    //   BEYOND: downtown, tall and close, over left and centre.
    // Navy seats and walls, sandstone and white steel.
    { kind: 'paint', from: -45, to: 45, color: 0x1b2f5c },
    { kind: 'building', a: -47, off: 2, w: 60, d: 92, h: 78, color: 0x7a3f2e, windows: true, brick: true },
    { kind: 'sign', a: -47, off: 2, y: 86, w: 96, h: 10, text: 'WESTERN METAL SUPPLY CO.', color: 0xf4f4f5 },
    { kind: 'videoboard', a: -38, off: 60, y: 44, w: 124, h: 61, text: 'Petco Park' },
    { kind: 'mast', a: -40, off: 96, y: 0, h: 190, w: 30 },
    { kind: 'building', a: -6, off: 6, w: 120, d: 40, h: 30, color: 0x1e2430, windows: true },
    { kind: 'pen', from: -14, to: -6, off: 46, depth: 12, color: 0x1b2f5c },
    { kind: 'pen', from: -14, to: -6, off: 60, depth: 12, y: 7, color: 0x1b2f5c },
    { kind: 'berm', from: -2, to: 12, off: 14, depth: 110, h: 28, y0: 6, n: 320 },
    { kind: 'palms', a: 5, off: 126, n: 7, spread: 150, h: 34 },
    { kind: 'videoboard', a: 30, off: 150, y: 78, w: 60, h: 30, text: 'Petco Park' },
    { kind: 'mast', a: 36, off: 176, y: 124, h: 66, w: 30 },
    { kind: 'skyline', from: -70, to: 20, off: 300, n: 12, h: 340, color: 0x2b3340 },
    { kind: 'building', a: -56, off: 220, w: 90, d: 90, h: 360, color: 0x2b3340, windows: true },
    { kind: 'building', a: -20, off: 520, w: 110, d: 90, h: 420, color: 0x2b3340, windows: true },
  ],
  'Comerica Park': [
    // BATCH PASS v2 (2026-09-03), rebuilt against photographs from the
    // upper decks (Wikimedia Commons). What a seat behind the plate sees:
    //   LEFT: ~24 rows of bleachers under the giant board, which stands on
    //         steel legs with a lattice light mast either side; the
    //         bullpen in front of those seats (since 2005).
    //   LEFT-CENTRE: ten low rows, then the navy wall with the retired
    //         numbers, the walkway with the six bronze statues, the flag.
    //   CENTRE: the dark batter's eye with the fountain on top; behind it
    //         the parking structure and Adams Street.
    //   RIGHT: ~24 rows with the raised porch above; downtown's towers
    //         rise over centre-right.
    //   BEYOND LEFT: Ford Field's white roof, right across the street.
    // Brick fascias, green seats, green walls. No dirt path (gone 2025).
    { kind: 'paint', from: -45, to: 45, color: 0x1f4a30 },
    { kind: 'pen', from: -44, to: -27, off: 2, depth: 13, color: 0x1f4a30 },
    { kind: 'videoboard', a: -33, off: 62, y: 30, w: 160, h: 96, text: 'Comerica Park' },
    { kind: 'cats', a: -33, off: 62, y: 126, gap: 120 },
    { kind: 'mast', a: -43, off: 64, h: 150, w: 28 },
    { kind: 'mast', a: -23, off: 64, h: 150, w: 28 },
    { kind: 'numbers', from: -22, to: -8, off: 34, y: 10, h: 6, items: ['2', '5', '6', '11', '16', '23', '42'], color: 0x14233a },
    { kind: 'statues', from: -22, to: -8, off: 36, h: 12, n: 6 },
    { kind: 'flagpole', a: -12, off: 20, h: 95 },
    { kind: 'fountains', from: -5, to: 5, off: 6, n: 7, h: 30, y: 34 },
    { kind: 'boxes', from: 26, to: 44, off: 30, depth: 20, y: 30, h: 6, color: 0x1f4d33 },
    { kind: 'building', a: 2, off: 130, w: 320, d: 120, h: 62, color: 0x7a7f86, windows: false },
    { kind: 'dome', a: -58, off: 230, w: 600, d: 400, h: 130, color: 0xd8d6cf },
    { kind: 'skyline', from: 0, to: 48, off: 480, n: 10, h: 300, color: 0x2b3340 },
    { kind: 'building', a: 22, off: 700, w: 80, d: 80, h: 400, color: 0x2b3340, windows: true },
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
