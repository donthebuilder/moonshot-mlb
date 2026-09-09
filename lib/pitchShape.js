// ── ONE SHAPE TABLE FOR BOTH SPRAY CHARTS (2026-09-01) ──────────────────────
//
// The flat chart has carried "shape = pitch" since it was built; the 3D field
// drew every ball as the same sphere, so a barrel and a routine fly looked
// identical once they were on the grass. Lifted out of SprayField so the
// stadium reads the same table rather than a second copy that could drift.
//
// Families, not codes: a slider, sweeper and slurve are one shape because at
// dot size six shapes is the ceiling of what reads, and those three are one
// question to a hitter.
export const PITCH_SHAPE = {
  FF: 'circle', FA: 'circle',
  SI: 'down',
  SL: 'up', ST: 'up', SV: 'up',
  CH: 'square', FS: 'square', FO: 'square',
  FC: 'diamond',
  CU: 'cross', KC: 'cross', CS: 'cross', EP: 'cross', KN: 'cross',
}
export const SHAPE_GLYPH = { circle: '●', down: '▼', up: '▲', square: '■', diamond: '◆', cross: '✚' }
export const shapeFor = (code) => PITCH_SHAPE[code] || 'circle'

// Marker size by result, shared too. The flat chart's radii are
// 5.2 / 4.4 / 3.8 / 3.2 (HR / XBH / hit / out); the 3D scales its unit sphere
// by the same ratios so the two charts agree on how loud a ball is.
export const resultScale = (h) => (h?.hr ? 1.6 : h?.xbh ? 1.35 : h?.hit ? 1.2 : 1)
