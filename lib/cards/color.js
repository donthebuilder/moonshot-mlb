// #rrggbb (or rgb(r,g,b), what lib/cards/clubTone.js returns) -> rgba(). Tokens are hex; a card needs them with an alpha. ONE definition for the server card kit
// (lib/cards/cardKit.js); pure, no server or browser API, so anything can import it.
export function alpha(hex, a) {
  const s = String(hex || '')
  const m = /^#?([0-9a-f]{6})$/i.exec(s)
  if (m) {
    const v = parseInt(m[1], 16)
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
  }
  const r = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (r) return `rgba(${r[1]},${r[2]},${r[3]},${a})`
  return `rgba(255,255,255,${a})`
}
