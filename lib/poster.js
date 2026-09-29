// THE SHARE-CARD POSTER, ONCE (2026-09-29, parity: "all pages take from MLB
// components"). MOONSHOT's poster drawing (components/shareCard.js) lifted out
// so TUDDY's cards (components/nfl/shareCard.js) stop carrying a copy with its
// own geometry: the dark field with two accent glows, the header (the product
// tile, DASH NETWORK, "<emoji> PRODUCT · label", the sub-line, the rule), the
// footer (note left, "DASH NETWORK · PRODUCT" right, the accent bar) and the
// 2x canvas + PNG save. A brand object carries the colours and words; the
// geometry is MOONSHOT's for everyone. MOONSHOT's brand is POSTER in
// lib/theme.js (same values it always drew with, so its PNGs are unchanged).
//
// brand: { bg, glowA: [rgba 0.16, rgba 0], glowB: [rgba a, rgba 0], tile
//   (colour, or [from, to] for a gradient), tileInk, tileWord, text, accent,
//   dim, faint, rule, product ('🌙 MOONSHOT'), footer ('DASH NETWORK · MOONSHOT') }

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
export const SANS = 'system-ui, -apple-system, sans-serif'
export const HEAD_H = 88

export function ellipsize(g, text, max) {
  const t0 = String(text ?? '')
  if (g.measureText(t0).width <= max) return t0
  let t = t0
  while (t.length > 2 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export function makePoster(brand) {
  function posterField(g, W, H) {
    g.fillStyle = brand.bg; g.fillRect(0, 0, W, H)
    let rg = g.createRadialGradient(90, 0, 0, 90, 0, Math.max(W, H) * 0.85)
    rg.addColorStop(0, brand.glowA[0]); rg.addColorStop(1, brand.glowA[1])
    g.fillStyle = rg; g.fillRect(0, 0, W, H)
    rg = g.createRadialGradient(W, H, 0, W, H, Math.max(W, H) * 0.9)
    rg.addColorStop(0, brand.glowB[0]); rg.addColorStop(1, brand.glowB[1])
    g.fillStyle = rg; g.fillRect(0, 0, W, H)
  }

  function posterHeader(g, W, label, sub) {
    if (Array.isArray(brand.tile)) {
      const grad = g.createLinearGradient(24, 0, 68, 0)
      grad.addColorStop(0, brand.tile[0]); grad.addColorStop(1, brand.tile[1])
      g.fillStyle = grad
    } else g.fillStyle = brand.tile
    g.beginPath(); g.roundRect(24, 22, 44, 44, 11); g.fill()
    g.fillStyle = brand.tileInk; g.font = `900 16px ${MONO}`
    g.textAlign = 'center'; g.fillText(brand.tileWord, 46, 45); g.textAlign = 'left'
    g.fillStyle = brand.text; g.font = `900 19px ${SANS}`
    g.fillText('DASH NETWORK', 82, 36)
    const wmW = g.measureText('DASH NETWORK').width
    g.fillStyle = brand.accent; g.font = `900 12px ${MONO}`
    g.fillText(brand.product + ' · ' + label, 84 + wmW + 10, 37)
    g.fillStyle = brand.dim; g.font = `600 11px ${MONO}`
    g.fillText(sub, 82, 58)
    g.strokeStyle = brand.rule
    g.beginPath(); g.moveTo(0, HEAD_H - 0.5); g.lineTo(W, HEAD_H - 0.5); g.stroke()
  }

  function posterFooter(g, W, H, note) {
    const fy = H - 23
    g.fillStyle = brand.faint; g.font = `600 10px ${MONO}`
    g.fillText(note, 24, fy)
    g.fillStyle = brand.dim; g.font = `800 10px ${MONO}`
    g.textAlign = 'right'
    g.fillText(brand.footer, W - 24, fy)
    g.textAlign = 'left'
    g.fillStyle = brand.accent; g.fillRect(0, H - 3, W, 3)
  }

  function newPoster(W, H) {
    const c = document.createElement('canvas')
    const scale = 2
    c.width = W * scale; c.height = H * scale
    const g = c.getContext('2d')
    g.scale(scale, scale)
    g.textBaseline = 'middle'
    posterField(g, W, H)
    return { c, g }
  }

  return { posterField, posterHeader, posterFooter, newPoster }
}

export function savePoster(c, filename) {
  const a = document.createElement('a')
  a.download = filename
  a.href = c.toDataURL('image/png')
  a.click()
}
