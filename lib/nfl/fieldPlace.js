// WHERE A TARGET SITS ON THE FIELD (BATCH-3D-V2 step 2). One placement for the
// 2D Field (components/nfl/TheField.js) and the 3D stadium (FieldArena.js), so
// the two cannot disagree: depth is the play's AIR YARDS (clamped -5.5..35, the
// span the chart draws), across is its LANE (the play-by-play's
// pass_location: a third of the field) plus a fixed scatter by its index in
// the file -- the exact spot across the lane isn't published, so the scatter
// only keeps two dots in one lane from sitting on each other, and never
// reshuffles when a window changes.
export const LANES3 = ['L', 'M', 'R']
export const AIR_MIN = -5.5, AIR_MAX = 35
export const clampAir = (a) => Math.max(AIR_MIN, Math.min(AIR_MAX, a))

/** A fixed scatter per play, -0.5..0.5 (by its index in the file). */
export function jitter(n) {
  const x = Math.sin((n + 1) * 78.233) * 43758.5453
  return x - Math.floor(x) - 0.5
}
/** Across the three lanes, 0 (left sideline) .. 1 (right). */
export const acrossOf = (p) => (LANES3.indexOf(p.lane) + 0.5 + jitter(p.i) * 0.72) / 3
/** A dot's radius in the 2D's pixels, by yards after catch (bigger = more YAC). */
export const dotRadiusPx = (yac, dotScale = 1) => (3.6 + (Math.min(25, yac || 0) / 25) * 4.4) * dotScale
