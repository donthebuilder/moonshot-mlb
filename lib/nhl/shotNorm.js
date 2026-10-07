// 🏒 ONE SHOT ROW, TURNED TO ATTACK THE RIGHT-HAND NET (2026-10-07, the mirrored-shot bug).
// Pure: no fetch, no clock. The shot map's dots, zone grid, slot share and distances all read this.
//
// THE BUG: the map used to flip every shot with x < 0 onto the right-hand end, assuming the shooter
// was at the end he attacks. A shot ON GOAL taken from the shooter's OWN end (zone 'D': a pulled
// goalie, a penalty-kill clear) sits behind him, so it was mirrored onto the NEAR net: about 2,300
// phantom close shots in 2025-26 on the dots, the slot share and the league grid. The xG model already
// read the zone (lib/nhl/xgFeatures.js normShot); the map now reads it too, so both agree, and a
// shot from the shooter's own end lands on the far side (x < 0) where the attacking half does not draw it.
import { normShot } from './xgFeatures'

/** the row with its x / y turned toward the net it attacked; null with no usable location */
export function normRow(s) {
  const n = normShot(s)
  return n ? { ...s, x: n.x, y: n.y } : null
}

/** a normalised shot the attacking half can draw (the shooter's own end has no place on it) */
export const drawable = (n) => n.x >= 0
