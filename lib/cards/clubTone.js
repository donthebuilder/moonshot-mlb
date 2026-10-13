// A CLUB'S COLOUR, MADE SAFE FOR A CARD (pure, no server API: scripts import it too). The game card paints each club's colour as a diagonal wash
// behind its logo and as a glow behind a player's photo; the words on top stay the card's cream ink, so the wash must never be bright enough
// to cost that ink its contrast. heroTone() takes a club colour (a #rrggbb from the club tables, or an rgb() read off its logo) and returns an
// rgb() string no lighter than LUM_MAX, or the product's accent when the colour is missing, grey or black (nothing to paint).
// Contrast: cream ink on the WORST wash (this colour at WASH_MAX over the card's dark chassis) is checked >= 4.5:1 by scripts/check-share-card-fit.mjs.

export const WASH_MAX = 0.78     // the strongest alpha any wash is painted at
export const LUM_MAX = 0.16      // relative luminance ceiling of a painted club colour

/** { r, g, b } from '#rrggbb', '#rgb' or 'rgb(r,g,b)' / 'rgba(r,g,b,a)'; null when it is none of them. */
export function parseColor(c) {
  const s = String(c || '').trim()
  let m = /^#?([0-9a-f]{6})$/i.exec(s)
  if (m) { const v = parseInt(m[1], 16); return { r: v >> 16, g: (v >> 8) & 255, b: v & 255 } }
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s)
  if (m) return { r: parseInt(m[1] + m[1], 16), g: parseInt(m[2] + m[2], 16), b: parseInt(m[3] + m[3], 16) }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (m) return { r: Math.min(255, +m[1]), g: Math.min(255, +m[2]), b: Math.min(255, +m[3]) }
  return null
}
const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
/** WCAG relative luminance of { r, g, b }. */
export const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
/** WCAG contrast ratio of two { r, g, b }. */
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** `c` painted at alpha `a` over `under`, as { r, g, b }. */
export const over = (c, a, under) => ({ r: Math.round(c.r * a + under.r * (1 - a)), g: Math.round(c.g * a + under.g * (1 - a)), b: Math.round(c.b * a + under.b * (1 - a)) })
export const rgbOf = ({ r, g, b }) => `rgb(${r},${g},${b})`

/** The club colour a card may paint: darkened until it is under LUM_MAX; the accent when it is missing, grey (no chroma) or black. */
export function heroTone(tone, accent) {
  let c = parseColor(tone)
  const chroma = c ? Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) : 0
  if (!c || chroma < 28 || lum(c) < 0.008) c = parseColor(accent) || { r: 120, g: 120, b: 120 }
  let guard = 0
  while (lum(c) > LUM_MAX && guard < 40) { c = { r: Math.round(c.r * 0.9), g: Math.round(c.g * 0.9), b: Math.round(c.b * 0.9) }; guard += 1 }
  return rgbOf(c)
}
