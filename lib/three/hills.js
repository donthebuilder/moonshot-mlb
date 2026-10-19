// THE 3D HILLS, SHARED (2026-10-19, Donovan: "use the 3D hills as the shared 3D look"). The flat charts' contour ground
// (lib/charts/terrain.js densityGrid) lifted into a surface: height = sqrt(density) above a floor level, so it passes
// smoothly under the surface where there is little and only real hills show, with clean edges. Coloured per vertex by
// the caller (e.g. the product's accent where a zone beats the league, a pale neutral otherwise). Quiet: matte,
// semi-transparent, no glow, shaded by its own fixed light. Each sport maps grid cells to its own world (toWorld).
import * as THREE from 'three'

/**
 * g: densityGrid result; toWorld(gx, gy, h) -> THREE.Vector3 (gx, gy in the grid's units);
 * colorAt(gx, gy) -> [r, g, b] in 0-1; height: world units at the peak; floor: the fraction of the peak that sits at 0;
 * fade: the surface melts away where there is little (for a view with no ground to hide the floor under, e.g. the upright
 * strike zone).
 */
export function buildHills(g, { toWorld, colorAt = () => [0.95, 0.93, 0.9], height = 7, floor = 0.08, opacity = 0.62, fade = false }) {
  const n = g.gw * g.gh
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), alpha = fade ? new Float32Array(n) : null
  const base = Math.sqrt(floor), top = 1 - base
  for (let j = 0; j < g.gh; j++) for (let i = 0; i < g.gw; i++) {
    const k = j * g.gw + i, gx = i * g.cell, gy = j * g.cell
    const v = g.vmax ? g.grid[k] / g.vmax : 0
    const h = ((Math.sqrt(v) - base) / top) * height
    const p = toWorld(gx, gy, h)
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z
    if (alpha) alpha[k] = Math.min(1, Math.max(0, (v - floor) / (floor * 2)))
    const c = colorAt(gx, gy); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]
  }
  const idx = []
  for (let j = 0; j < g.gh - 1; j++) for (let i = 0; i < g.gw - 1; i++) {
    const a = j * g.gw + i, b = a + 1, c = a + g.gw, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx); geo.computeVertexNormals()
  // ITS OWN LIGHT (10-19): every arena lights differently (warm floods, cold rinks), which tinted the hills; the shading is
  // baked from one fixed light so the colours read the same in every sport, and the material ignores the scene's lights
  const nrm = geo.attributes.normal, L = new THREE.Vector3(-0.4, 0.85, 0.35).normalize()
  for (let k = 0; k < n; k++) { const d = Math.max(0, nrm.getX(k) * L.x + nrm.getY(k) * L.y + nrm.getZ(k) * L.z); const sh = 0.55 + 0.42 * d; col[k * 3] *= sh; col[k * 3 + 1] *= sh; col[k * 3 + 2] *= sh }
  geo.attributes.color.needsUpdate = true
  if (alpha) {   // rgba per vertex, so the floor fades out instead of standing as a sheet
    const rgba = new Float32Array(n * 4)
    for (let k = 0; k < n; k++) { rgba[k * 4] = col[k * 3]; rgba[k * 4 + 1] = col[k * 3 + 1]; rgba[k * 4 + 2] = col[k * 3 + 2]; rgba[k * 4 + 3] = alpha[k] }
    geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4))
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
  mesh.renderOrder = 2
  return mesh
}

/** a theme token's hex -> [r, g, b] in 0-1 (so callers pass their theme token) */
export const rgb01 = (hex) => { const h = String(hex).replace('#', ''); return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16) / 255) }
