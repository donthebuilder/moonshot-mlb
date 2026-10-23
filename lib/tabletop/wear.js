// 🎨 PAINT THAT'S BEEN PLAYED WITH (2026-10-23, Donovan: the figures "need to be super detailed ... if they've been
// battling with each other for years, chip painting"). A painted-plastic surface for the tabletop figures: the paint
// colour, chips worn through to the bare plastic underneath (lighter, duller), grime in the low spots, fine scratches; and
// a matching bump map so a chip has an edge you can see. Four variants per colour (seeded, the same every load) so
// neighbours never wear the same way. Nothing here is a hex: every colour comes from the paint it's given.
import * as THREE from 'three'

const cache = new Map()
const rng = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/** { map, bumpMap } for a paint colour. kind: 'cloth' (jerseys, pants: soft chips, grime), 'hard' (helmets: scratches,
 *  sharp chips), 'base' (the bases: scuffs round the edge). variant 0..3. */
export function wornPaint(color, kind = 'cloth', variant = 0) {
  if (typeof document === 'undefined') return {}
  const key = `${color}|${kind}|${variant & 3}`
  if (cache.has(key)) return cache.get(key)
  const N = 256, r = rng(1 + (variant & 3) * 7 + kind.length * 13)
  const paint = new THREE.Color(color)
  // the plastic under the paint: a step lighter and duller (less on a hard hat's glossy shell, where a chip is a scuff)
  const bare = paint.clone().lerp(new THREE.Color(1, 1, 1), kind === 'hard' ? 0.32 : 0.5).multiplyScalar(0.92)
  const grime = paint.clone().multiplyScalar(0.35)
  const css = (c) => `#${c.getHexString()}`
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N
  const bv = document.createElement('canvas'); bv.width = N; bv.height = N
  const g = cv.getContext('2d'), b = bv.getContext('2d')
  g.fillStyle = css(paint); g.fillRect(0, 0, N, N)
  b.fillStyle = 'rgb(200,200,200)'; b.fillRect(0, 0, N, N)
  // a soft mottle in the paint: no two inches of a hand-painted figure are the same shade
  for (let k = 0; k < 140; k += 1) {
    g.globalAlpha = 0.05 + r() * 0.06; g.fillStyle = r() < 0.5 ? css(grime) : css(bare)
    g.beginPath(); g.arc(r() * N, r() * N, 6 + r() * 22, 0, Math.PI * 2); g.fill()
  }
  // chips: irregular flakes worn to the plastic (fewer on cloth, more and sharper on hard hats and bases)
  const chips = kind === 'cloth' ? 24 : kind === 'hard' ? 14 : 55
  for (let k = 0; k < chips; k += 1) {
    const cx = r() * N, cy = kind === 'base' ? (r() < 0.5 ? r() * 30 : N - r() * 30) : r() * N, rad = 1.5 + r() * (kind === 'cloth' ? 5 : 7)
    const pts = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2, rr = rad * (0.5 + r() * 0.8); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] })
    const path = () => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p }
    g.globalAlpha = 0.85; g.fillStyle = css(bare); g.fill(path())
    b.globalAlpha = 1; b.fillStyle = 'rgb(90,90,90)'; b.fill(path())                     // a chip sits lower than the paint
    g.globalAlpha = 0.5; g.strokeStyle = css(grime); g.lineWidth = 0.8; g.stroke(path())   // with a dark edge where dirt caught
  }
  // scratches on the hard surfaces
  if (kind !== 'cloth') for (let k = 0; k < (kind === 'hard' ? 12 : 22); k += 1) {
    const x = r() * N, y = r() * N, a = r() * Math.PI, l = 8 + r() * 30
    g.globalAlpha = 0.35 + r() * 0.3; g.strokeStyle = css(bare); g.lineWidth = 0.6 + r() * 0.7
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
    b.globalAlpha = 0.8; b.strokeStyle = 'rgb(120,120,120)'; b.lineWidth = 0.8; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke()
  }
  // grime: fine dark specks
  for (let k = 0; k < 260; k += 1) { g.globalAlpha = 0.15 + r() * 0.25; g.fillStyle = css(grime); g.fillRect(r() * N, r() * N, 1 + r(), 1 + r()) }
  g.globalAlpha = 1; b.globalAlpha = 1
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4
  const bumpMap = new THREE.CanvasTexture(bv); bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping
  const out = { map, bumpMap }
  cache.set(key, out)
  return out
}

/** A painted-plastic material with that wear. */
export function wornMaterial(color, kind = 'cloth', variant = 0, extra = {}) {
  const w = wornPaint(color, kind, variant)
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1), map: w.map || null, bumpMap: w.bumpMap || null, bumpScale: 0.6,
    roughness: kind === 'hard' ? 0.28 : 0.45, metalness: 0.04, ...(w.map ? {} : { color: new THREE.Color(color) }), ...extra })
}
