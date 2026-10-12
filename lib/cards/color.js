// #rrggbb -> rgba(). Tokens are hex; a card needs them with an alpha. ONE definition for the server card kit (lib/cards/cardKit.js) and the
// browser canvas kit (lib/cards/kit.js); pure, no server or browser API, so either can import it.
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return `rgba(255,255,255,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}
