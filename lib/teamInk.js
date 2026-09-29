// READABLE TEAM INK (2026-09-29, queue batch 5: "standings tile contrast first
// -- NE, PIT, BAL, CLE, IND, TEN, HOU, LV are near invisible"). A club's
// primary colour is its identity, but eight NFL primaries are near-black or
// deep navy (#101820, #002244, #03202f, #000000...) and vanish as text on the
// page (#09090b). The chip keeps the club colour for its tint; its TEXT takes
// the first of [primary, secondary] that clears WCAG AA against the page, and
// if neither does, the primary lifted toward white until it does. MLB's table
// already hand-picked readable colours (lib/mlbTeams.js), so for MLB this
// returns them unchanged.
const PAGE = '#09090b'
const hex = (h) => { const s = String(h || '').replace('#', ''); return s.length === 6 ? [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) : null }
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
export function contrast(a, b = PAGE) {
  const x = hex(a), y = hex(b)
  if (!x || !y) return 21
  const [hi, lo] = [lum(x), lum(y)].sort((m, n) => n - m)
  return (hi + 0.05) / (lo + 0.05)
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
export function readableInk(primary, secondary = null, min = 4.5) {
  if (contrast(primary) >= min) return primary
  if (secondary && contrast(secondary) >= min) return secondary
  const p = hex(primary)
  if (!p) return primary
  for (let t = 0.1; t <= 1.0001; t += 0.05) {
    const mixed = toHex(p.map((c) => c + (255 - c) * t))
    if (contrast(mixed) >= min) return mixed
  }
  return '#ffffff'
}
