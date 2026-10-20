// BUCKETS' TWELVE SHOT ZONES (2026-10-20, Donovan: "instead of dots, zones lit up by shot percentages and where the team is weak").
// One place decides which zone a shot is in, so the 2D zone court, the 3D floor and the measured league / defense
// baselines (lib/nba/zoneBaselines.js, scripts/measure-nba-zones.mjs) can never disagree.
//
// Feet, the feed's own frame (lib/nba/api.js reduceShots): x 0-50 across, the RIM at feed y 1. Drawn with the baseline
// at 0, so court y = feed y + 4.25 and the rim is court (25, 5.25). Left / right are the chart's left and right.
// The split: restricted area (4 ft), the rest of the paint, mid-range in five (two baselines, two wings, the middle),
// the two corner threes, above-the-break threes in three. Wings start 25 degrees off the rim's straight line up the
// floor. A shot past 40 ft (a heave) belongs to no zone, as the box score's shot charts leave them out.
export const FEED_TO_COURT = 4.25
export const RIM = { x: 25, y: 5.25 }
export const THREE_R = 23.75
export const CORNER_X = 3                                   // the corner three line, 22 ft from the rim
export const CORNER_Y = RIM.y + THREE_R * Math.sin(Math.acos((25 - CORNER_X) / THREE_R))   // where the arc meets the corner line (14.2)
export const PAINT = { x0: 17, x1: 33, y1: 19 }
export const RA_R = 4
export const WING_DEG = 25
export const MAX_Y = 40

export const ZONES12 = [
  { k: 'ra', label: 'Restricted area', short: 'RIM', group: 'rim' },
  { k: 'paint', label: 'Paint', short: 'PAINT', group: 'paint' },
  { k: 'midBL', label: 'Left baseline mid', short: 'L BASE', group: 'mid' },
  { k: 'midL', label: 'Left wing mid', short: 'L WING', group: 'mid' },
  { k: 'midC', label: 'Middle mid', short: 'MID', group: 'mid' },
  { k: 'midR', label: 'Right wing mid', short: 'R WING', group: 'mid' },
  { k: 'midBR', label: 'Right baseline mid', short: 'R BASE', group: 'mid' },
  { k: 'c3L', label: 'Left corner 3', short: 'L CORNER', group: 'corner3' },
  { k: 'ab3L', label: 'Left wing 3', short: 'L WING 3', group: 'above3' },
  { k: 'ab3C', label: 'Top of the key 3', short: 'TOP 3', group: 'above3' },
  { k: 'ab3R', label: 'Right wing 3', short: 'R WING 3', group: 'above3' },
  { k: 'c3R', label: 'Right corner 3', short: 'R CORNER', group: 'corner3' },
]
export const ZONE12 = Object.fromEntries(ZONES12.map((z) => [z.k, z]))
export const ZONE_KEYS = ZONES12.map((z) => z.k)

/** The zone of a point on the court (court feet, baseline at 0) given whether it was a three. null = a heave / off the half court. */
export function zoneAt(cx, cy, three) {
  if (!(cy >= 0) || cy > MAX_Y || cx < 0 || cx > 50) return null
  const dx = cx - RIM.x, dy = cy - RIM.y
  const ang = (Math.atan2(dx, Math.max(dy, 0.0001)) * 180) / Math.PI
  if (three) {
    if (cy <= CORNER_Y && Math.abs(dx) >= 25 - CORNER_X - 1) return dx < 0 ? 'c3L' : 'c3R'
    return ang < -WING_DEG ? 'ab3L' : ang > WING_DEG ? 'ab3R' : 'ab3C'
  }
  if (Math.hypot(dx, dy) <= RA_R) return 'ra'
  if (cx >= PAINT.x0 && cx <= PAINT.x1 && cy <= PAINT.y1) return 'paint'
  if (cy <= CORNER_Y) return dx < 0 ? 'midBL' : 'midBR'
  return ang < -WING_DEG ? 'midL' : ang > WING_DEG ? 'midR' : 'midC'
}
/** A shot's zone (a reduceShots / unpackShots row: feed x, feed y, three). */
export const zoneOfShot = (s) => zoneAt(s.x, s.y + FEED_TO_COURT, Boolean(s.three))
/** Is a court point beyond the three-point line (for painting the floor where no shot says so)? */
export function isThreeAt(cx, cy) {
  const dx = cx - RIM.x
  if (cy <= CORNER_Y) return Math.abs(dx) > 25 - CORNER_X
  return Math.hypot(dx, cy - RIM.y) > THREE_R
}
/** The zone a point of the floor belongs to (no shot flag: the line decides). */
export const floorZone = (cx, cy) => zoneAt(cx, cy, isThreeAt(cx, cy))

/** Makes / attempts per zone for a list of shots. */
export function zoneCounts(shots) {
  const out = Object.fromEntries(ZONE_KEYS.map((k) => [k, { a: 0, m: 0 }]))
  let total = 0
  for (const s of shots) {
    const k = zoneOfShot(s)
    if (!k) continue
    out[k].a += 1; if (s.made) out[k].m += 1
    total += 1
  }
  return { zones: out, total }
}
