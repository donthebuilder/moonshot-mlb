// A ROUTE'S SHAPE (2026-10-02, ROUTES). nflverse's participation file charts
// the TARGETED receiver's route by name (QUICK OUT, IN/DIG, GO ...) -- not the
// path he ran; tracked paths (Next Gen Stats) aren't public. So the line drawn
// for a target is the SHAPE its route name means, ending exactly where the
// ball went: the target's real lane and air yards (lib/nfl/fieldPlace.js
// acrossOf / clampAir, the same spot as its dot). Only how he got there is
// drawn from the name, and the page says so ("route shapes, not tracked
// paths"). Where he lined up isn't charted either, so a route starts on the
// line of scrimmage, a back's routes (SWING, TEXAS/ANGLE) from the backfield.
//
// Coordinates: [across 0 (left sideline) .. 1 (right), yards past the line].
// "Outside" is toward the nearer sideline of the end point; an IN that ends in
// the middle came from outside it.
import { acrossOf, clampAir } from './fieldPlace'

export const YD_ACROSS = 1 / 53.3   // one yard, across the field
const cl = (u) => Math.max(0.02, Math.min(0.98, u))

export const ROUTE_WORD = {
  'QUICK OUT': 'quick out', 'HITCH/CURL': 'hitch / curl', SCREEN: 'screen', 'IN/DIG': 'in / dig',
  GO: 'go', 'DEEP OUT': 'deep out', 'SHALLOW CROSS/DRAG': 'shallow cross / drag', SLANT: 'slant',
  POST: 'post', SWING: 'swing', CORNER: 'corner', 'TEXAS/ANGLE': 'texas / angle', WHEEL: 'wheel',
}
export const ROUTES = Object.keys(ROUTE_WORD)

/** [[u, yards], ...] for one target {i, lane, air, rt}; null when it can't be placed. */
export function routeShape(p) {
  if (!p || !p.lane || p.air == null) return null
  const ue = acrossOf(p), ae = clampAir(p.air)
  const s = ue < 0.5 ? -1 : 1          // +1 = outside is toward the right sideline
  const out = (yd) => cl(ue + s * yd * YD_ACROSS)   // a point `yd` yards outside the end
  const inn = (yd) => cl(ue - s * yd * YD_ACROSS)   // ... inside it
  const E = [ue, ae]
  switch (p.rt) {
    case 'GO': return [[inn(2), 0], [inn(1), ae * 0.5], E]
    case 'HITCH/CURL': return [[out(1), 0], [out(0.5), ae + 2], E]
    case 'QUICK OUT':
    case 'DEEP OUT': return [[inn(5), 0], [inn(5), ae], E]
    case 'IN/DIG': return [[out(6), 0], [out(6), ae], E]
    case 'SLANT': return [[out(5), 0], [out(5), Math.min(1.5, ae)], E]
    case 'POST': return [[out(5), 0], [out(5), ae * 0.55], E]
    case 'CORNER': return [[inn(5), 0], [inn(5), ae * 0.55], E]
    case 'SHALLOW CROSS/DRAG': return [[out(14), 0], [out(12), Math.max(1, ae)], E]
    case 'SCREEN': return [[inn(3), 0], E]
    case 'WHEEL': return [[inn(8), 0], [ue, Math.min(3, ae)], E]
    case 'SWING': return [[0.5, -5], [cl((0.5 + ue) / 2), Math.min(-4, ae - 1)], E]
    case 'TEXAS/ANGLE': return [[0.5, -4], [out(4), Math.min(2, ae)], E]
    default: return [[ue, 0], E]       // uncharted: a straight line to where the ball went
  }
}
