// THE CONTOUR GROUND, SHARED (2026-10-19, Donovan picked it for BUCKETS' shot chart and as every sport's 3D look; TUDDY's
// Throw map draws the same thing on a perspective field). Points on a flat surface -> a smooth density (a gaussian bump
// per point, summed on a grid) -> faint stepped terraces and their isolines, like elevation on a topo map: higher
// ground = more of them. Pure math except terraceImage (a canvas, browser only). Units are the caller's (feet, yards).

/** points [{x, y, w?}] on a w x h surface -> { grid, gw, gh, cell, vmax } (cell = grid step in the same units) */
export function densityGrid(points, { w, h, cell = 1, sigma = 2.2 }) {
  const gw = Math.round(w / cell) + 1, gh = Math.round(h / cell) + 1
  const grid = new Float32Array(gw * gh)
  const reach = sigma * 3, two = 2 * sigma * sigma
  for (const p of points) {
    const wt = p.w ?? 1
    const i0 = Math.max(0, Math.floor((p.x - reach) / cell)), i1 = Math.min(gw - 1, Math.ceil((p.x + reach) / cell))
    const j0 = Math.max(0, Math.floor((p.y - reach) / cell)), j1 = Math.min(gh - 1, Math.ceil((p.y + reach) / cell))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = p.x - i * cell, dy = p.y - j * cell
      grid[j * gw + i] += wt * Math.exp(-(dx * dx + dy * dy) / two)
    }
  }
  let vmax = 0
  for (let k = 0; k < grid.length; k++) if (grid[k] > vmax) vmax = grid[k]
  return { grid, gw, gh, cell, vmax }
}

/** the band edges, as fractions of the peak (five quiet bands by default) */
export const levelsOf = (g, fr = [0.08, 0.18, 0.32, 0.5, 0.72]) => fr.map((q) => q * g.vmax)

const sample = (g, fx, fy) => {
  const i0 = Math.min(g.gw - 2, Math.max(0, Math.floor(fx))), j0 = Math.min(g.gh - 2, Math.max(0, Math.floor(fy)))
  const tx = fx - i0, ty = fy - j0, G = g.grid, W = g.gw
  return G[j0 * W + i0] * (1 - tx) * (1 - ty) + G[j0 * W + i0 + 1] * tx * (1 - ty) + G[(j0 + 1) * W + i0] * (1 - tx) * ty + G[(j0 + 1) * W + i0 + 1] * tx * ty
}

/** the terraces as one PNG data URL (white, each band a little more opaque); null outside a browser */
export function terraceImage(g, levels, { scale = 4, step = 0.05, rgb = [255, 255, 255] } = {}) {
  if (typeof document === 'undefined') return null
  const cw = (g.gw - 1) * scale, ch = (g.gh - 1) * scale
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  const c2 = cv.getContext('2d'); if (!c2) return null
  const im = c2.createImageData(cw, ch)
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const v = sample(g, px / scale, py / scale)
    let b = 0; while (b < levels.length && v >= levels[b]) b++
    const k = (py * cw + px) * 4
    im.data[k] = rgb[0]; im.data[k + 1] = rgb[1]; im.data[k + 2] = rgb[2]; im.data[k + 3] = Math.round(b * step * 255)
  }
  c2.putImageData(im, 0, 0)
  return cv.toDataURL()
}

const SEG = { 1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [0, 1], 5: [3, 0, 2, 1], 6: [0, 2], 7: [3, 0], 8: [3, 0], 9: [0, 2], 10: [0, 1, 3, 2], 11: [0, 1], 12: [3, 1], 13: [2, 1], 14: [3, 2] }
/** marching squares: one SVG path string per level, in the surface's own units */
export function isolines(g, levels) {
  const G = g.grid, W = g.gw, s = g.cell
  return levels.map((lv) => {
    let d = ''
    for (let j = 0; j < g.gh - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a0 = G[j * W + i], a1 = G[j * W + i + 1], a2 = G[(j + 1) * W + i + 1], a3 = G[(j + 1) * W + i]
      const c = (a0 >= lv ? 8 : 0) | (a1 >= lv ? 4 : 0) | (a2 >= lv ? 2 : 0) | (a3 >= lv ? 1 : 0)
      if (c === 0 || c === 15) continue
      const x = i * s, y = j * s, L = (p, q) => (lv - p) / ((q - p) || 1e-6)
      const E = [[x + s * L(a0, a1), y], [x + s, y + s * L(a1, a2)], [x + s * L(a3, a2), y + s], [x, y + s * L(a0, a3)]]   // top, right, bottom, left
      const seg = SEG[c]
      for (let q = 0; q < seg.length; q += 2) d += `M${E[seg[q]][0].toFixed(2)} ${E[seg[q]][1].toFixed(2)}L${E[seg[q + 1]][0].toFixed(2)} ${E[seg[q + 1]][1].toFixed(2)}`
    }
    return d
  })
}
