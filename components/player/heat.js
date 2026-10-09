import { alpha } from '../../lib/scales'

// THE PROPS HEAT (Donovan 2026-10-08, "a little bit of sauce", Option A): one accent, no red/green.
// A cell at GLOW_AT% or more glows in the product's accent; the middle is washed; the low end recedes.
// A window on fewer than `thin` games is a flat slab that makes no claim (its sample prints under it).
export const GLOW_AT = 60
export const STREAK_AT = 3

export function heatCell(pct, n, { accent, C, thin = 3 } = {}) {
  if (pct == null) return { background: 'transparent', color: C.text3 }
  if (n != null && n < thin) return { background: alpha(C.text3, 0.1), color: C.text2 }
  if (pct >= GLOW_AT) {
    return {
      background: alpha(accent, 0.2), color: C.text,
      boxShadow: `0 0 9px ${alpha(accent, 0.38)}, inset 0 0 0 1px ${alpha(accent, 0.55)}`,
    }
  }
  if (pct >= 40) return { background: alpha(accent, 0.09), color: C.text }
  if (pct >= 25) return { background: 'transparent', color: C.text2 }
  return { background: 'transparent', color: C.text3 }
}
