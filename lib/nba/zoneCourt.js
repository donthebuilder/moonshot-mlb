// THE ZONE COURT'S SHAPES (2026-10-20): the twelve zones of lib/nba/zones.js as SVG paths in court feet (x 0-50 across,
// y from the baseline, the rim at (25, 5.25), drawn to 40 ft). The 2D zone court fills them; the 3D floor draws the same
// strings onto a canvas (Path2D takes SVG path data), so both pictures are one shape. Built from the zone rules'
// own constants: if zones.js moves a line, these move with it.
import { RIM, THREE_R, CORNER_X, CORNER_Y, PAINT, RA_R, WING_DEG, MAX_Y, ZONE_KEYS } from './zones'

const r3 = (v) => Math.round(v * 1000) / 1000
const at = (deg, r) => [r3(RIM.x + r * Math.sin((deg * Math.PI) / 180)), r3(RIM.y + r * Math.cos((deg * Math.PI) / 180))]
const P = ([x, y]) => `${x} ${y}`
/** points along the three-point arc from angle a to b (degrees, 0 = straight up the floor, negative = the chart's left) */
const arc = (a, b, step = 2) => { const n = Math.max(2, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => at(a + ((b - a) * i) / n, THREE_R)) }
const poly = (pts) => `M ${pts.map(P).join(' L ')} Z`
const W = WING_DEG
const cornerDeg = (Math.atan2(CORNER_X - RIM.x, CORNER_Y - RIM.y) * 180) / Math.PI   // where the arc meets the left corner line (~ -67.8)
const tanW = Math.tan((W * Math.PI) / 180)
const rayAtY = (sign, y) => [r3(RIM.x + sign * (y - RIM.y) * tanW), y]   // the wing ray (sign -1 left, +1 right) at height y
const mirror = (pts) => pts.map(([x, y]) => [r3(50 - x), y])

const raCircle = Array.from({ length: 49 }, (_, i) => at(-180 + (360 * i) / 48, RA_R))
const LEFT = {
  midBL: [[CORNER_X, 0], [PAINT.x0, 0], [PAINT.x0, r3(CORNER_Y)], [CORNER_X, r3(CORNER_Y)]],
  midL: [[CORNER_X, r3(CORNER_Y)], [PAINT.x0, r3(CORNER_Y)], [PAINT.x0, PAINT.y1], rayAtY(-1, PAINT.y1), at(-W, THREE_R), ...arc(-W, cornerDeg).slice(1)],
  c3L: [[0, 0], [CORNER_X, 0], [CORNER_X, r3(CORNER_Y)], [0, r3(CORNER_Y)]],
  ab3L: [[0, r3(CORNER_Y)], ...arc(cornerDeg, -W), rayAtY(-1, MAX_Y), [0, MAX_Y]],
}
export const ZONE_PATHS = {
  ra: poly(raCircle),
  // the paint minus the restricted area (even-odd: the circle is a hole)
  paint: `${poly([[PAINT.x0, 0], [PAINT.x1, 0], [PAINT.x1, PAINT.y1], [PAINT.x0, PAINT.y1]])} ${poly(raCircle)}`,
  midBL: poly(LEFT.midBL), midBR: poly(mirror(LEFT.midBL)),
  midL: poly(LEFT.midL), midR: poly(mirror(LEFT.midL)),
  midC: poly([rayAtY(-1, PAINT.y1), rayAtY(1, PAINT.y1), at(W, THREE_R), ...arc(W, -W).slice(1)]),
  c3L: poly(LEFT.c3L), c3R: poly(mirror(LEFT.c3L)),
  ab3L: poly(LEFT.ab3L), ab3R: poly(mirror(LEFT.ab3L)),
  ab3C: poly([at(-W, THREE_R), rayAtY(-1, MAX_Y), rayAtY(1, MAX_Y), at(W, THREE_R), ...arc(W, -W).slice(1, -1)]),
}
// where each zone's number sits (feet); the corners are narrow, so their numbers turn on their side
export const ZONE_LABEL = {
  ra: [25, 8.2], paint: [25, 13.6], midBL: [10, 7.6], midBR: [40, 7.6], midL: [10.6, 19.6], midR: [39.4, 19.6], midC: [25, 26.6],
  c3L: [1.5, 7.6, true], c3R: [48.5, 7.6, true], ab3L: [5.8, 31.5], ab3R: [44.2, 31.5], ab3C: [25, 35],
}
export const ZONE_COURT_H = MAX_Y
if (ZONE_KEYS.some((k) => !ZONE_PATHS[k] || !ZONE_LABEL[k])) throw new Error('zoneCourt: a zone has no shape')
