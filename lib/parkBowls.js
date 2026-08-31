// 🏟 SEATING SHAPE, per park — the half of a ballpark that parkWalls.js does
// not describe.
//
// parkWalls.js answers "where is the fence and how tall is it." That is enough
// to judge a batted ball and not nearly enough to draw a building: rendered
// from distances alone, all 32 venues come out as the same ring with different
// numbers on it. Fenway and Kauffman are unmistakable in person and identical
// on a distance chart.
//
// What actually separates them, in the order it reads from a seat behind home:
//
//   open    sectors with NO SEATS AT ALL. This is the single strongest tell
//           and the one nothing else encodes — McCovey Cove eats Oracle's
//           right field, the warehouse eats Camden's, the Allegheny eats PNC's,
//           the fountains eat Kauffman's. Angles, [from, to], -45 = LF line.
//   up      how far the upper deck wraps, or null where there isn't one.
//           Fenway ±30°, Yankee ±62°, PNC ±28°, Sutter Health none.
//   bleach  a detached low outfield bleacher band (Wrigley, Fenway, Dodger).
//   tiers   2 or 3 decks.
//   roof    'fixed' never opens (Tropicana). 'retract' is a VIEWING CHOICE and
//           must be exposed as one — a closed roof kills the sky, the light
//           towers and the skyline, so a renderer also has to hold the camera
//           inside the building or the user ends up staring at the outside of
//           an opaque disc. null for open air.
//
// KEYED BY VENUE NAME, exactly as parkWalls.js keys it, aliases included, so
// the two files can be read with the same lookup and cannot drift apart. If
// you add a venue there, add it here; `bowlFor()` falls back to a plain
// two-tier ring rather than throwing, so a missing entry degrades to what the
// renderer did before this file existed.
//
// PARAMETRIC, NOT SURVEYED. These are shaped to read as the right building at
// a glance, not measured off a seating manifest. Nothing scores off them and
// nothing should — they are for the eye only. Keep it that way: the moment a
// number here feeds a verdict, it needs a source it does not have.

const RING = { up: [-52, 52], tiers: 2, open: [], bleach: null, roof: null }
const B = (o) => ({ ...RING, ...o })

export const PARK_BOWLS = {
  'Fenway Park':                    B({ up: [-30, 30], bleach: [-6, 32], open: [[58, 72]] }),
  'Yankee Stadium':                 B({ up: [-62, 62], tiers: 3 }),
  'Coors Field':                    B({ up: [-55, 55], tiers: 3, open: [[-11, 11]] }),
  'Dodger Stadium':                 B({ up: [-46, 46], tiers: 3, bleach: [-40, 40], open: [[-7, 7]] }),
  'UNIQLO Field at Dodger Stadium': B({ up: [-46, 46], tiers: 3, bleach: [-40, 40], open: [[-7, 7]] }),
  'Oracle Park':                    B({ up: [-45, 14], open: [[28, 72]] }),
  'Wrigley Field':                  B({ up: [-42, 42], bleach: [-45, 45], open: [[-6, 6]] }),
  'Great American Ball Park':       B({ up: [-50, 50], open: [[20, 46]] }),
  'Oriole Park at Camden Yards':    B({ up: [-45, 45], open: [[28, 62]] }),
  'Truist Park':                    B({ up: [-52, 52], open: [[-7, 7]] }),
  'Citi Field':                     B({ up: [-50, 50], open: [[30, 56]] }),
  'Petco Park':                     B({ up: [-40, 40], open: [[-52, -26]] }),
  'Progressive Field':              B({ up: [-45, 45], open: [[-8, 8]] }),
  'Rogers Centre':                  B({ up: [-60, 60], tiers: 3, roof: 'retract' }),
  'Daikin Park':                    B({ up: [-50, 50], roof: 'retract' }),
  'T-Mobile Park':                  B({ up: [-48, 48], roof: 'retract' }),
  'Angel Stadium':                  B({ up: [-48, 48], open: [[-18, 18]] }),
  'Tropicana Field':                B({ up: [-40, 40], roof: 'fixed' }),
  'Sutter Health Park':             B({ up: null, open: [[-14, 14]] }),
  'Busch Stadium':                  B({ up: [-52, 52], tiers: 3, open: [[-8, 8]] }),
  'American Family Field':          B({ up: [-50, 50], roof: 'retract' }),
  'PNC Park':                       B({ up: [-28, 28], open: [[26, 72]] }),
  'Kauffman Stadium':               B({ up: [-35, 35], open: [[8, 50]] }),
  'Target Field':                   B({ up: [-48, 48], open: [[26, 52]] }),
  'Comerica Park':                  B({ up: [-42, 42], open: [[-9, 9]] }),
  'Guaranteed Rate Field':          B({ up: [-50, 50], tiers: 3 }),
  'Rate Field':                     B({ up: [-50, 50], tiers: 3 }),
  'Nationals Park':                 B({ up: [-48, 48], open: [[20, 46]] }),
  'Citizens Bank Park':             B({ up: [-52, 52], open: [[-13, 13]] }),
  'loanDepot park':                 B({ up: [-45, 45], roof: 'retract' }),
  'Chase Field':                    B({ up: [-50, 50], roof: 'retract', open: [[24, 40]] }),
  'Globe Life Field':               B({ up: [-54, 54], tiers: 3, roof: 'retract' }),
  'Field of Dreams':                B({ up: null, open: [[-72, -34], [34, 72]] }),
  'Journey Bank Ballpark':          B({ up: null, open: [[-20, 20]] }),
}

// Never throws on an unknown venue: a park we have walls for but no bowl for
// still draws, as a plain two-tier ring. That is the pre-bowl behaviour, which
// is the right thing to degrade to.
export function bowlFor(venue) {
  return PARK_BOWLS[venue] || RING
}

// True when a sector has no seating in this park. Renderers cut deck segments
// against this; anything else (props, scoreboards) can use it too.
export function isOpenSector(bowl, ang) {
  const o = (bowl && bowl.open) || []
  for (let i = 0; i < o.length; i++) if (ang >= o[i][0] && ang <= o[i][1]) return true
  return false
}

export default PARK_BOWLS
