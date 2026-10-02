// 🏈 THE FIELD, IN 3D (2026-10-01, BATCH-NFL-3D). The field TUDDY's targets are
// drawn on, in feet: 120 x 53.3 yd (360 x 160 ft) with 10-yd end zones, yard
// lines every 5, the hash marks, the sidelines and both goalposts.
//
// WORLD AXES: x downfield (the line of scrimmage at x = 0, the offence going
// +x, as components/nfl/TheField.js draws air yards "up"), y up, z across. From
// behind the offence looking downfield, the LEFT lane is -z (as the rink's).
import * as THREE from 'three'
import { FIELD3D } from './nfl/theme'

export const YD = 3                       // feet per yard
export const FIELD_L = 120 * YD, FIELD_W = 160, PLAY_L = 100 * YD
export const LANE_W = FIELD_W / 3         // TheField's three lanes, left / middle / right
export const LANE_Z = { L: -LANE_W, M: 0, R: LANE_W }
/** air yards + a lane (+ a lane offset, -0.5..0.5) -> the world */
//  (air clamped to -5.5..35, as TheField's Y() clamps it, so a long screen sits where the 2D puts it)
export const fieldPoint = (air, lane, off = 0, h = 0) => new THREE.Vector3(Math.max(-5.5, Math.min(35, air)) * YD, h, (LANE_Z[lane] ?? 0) + off * LANE_W)

// THE GRAIN (2026-10-02, Donovan: "more turf realistic"): a seeded canvas of
// short blades, light and dark, on a mid grey; the paint colour is lifted by
// 1/BASE so the grass keeps its token colour on average. The same every load.
const BASE = 0.7
function grainTexture() {
  if (typeof document === 'undefined') return null
  const N = 256, cv = document.createElement('canvas'); cv.width = N; cv.height = N
  const ctx = cv.getContext('2d'), v = Math.round(255 * BASE)
  ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, 0, N, N)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9000; i++) {
    const light = rnd() < 0.5, g = light ? 255 : Math.round(255 * BASE * 0.45)
    ctx.globalAlpha = 0.25 + rnd() * 0.45
    ctx.fillStyle = `rgb(${g},${g},${g})`
    ctx.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 3, 1) // a blade, long downfield (u = downfield)
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

export function buildField(scene, { los = 0 } = {}) {
  const grain = grainTexture()
  // a grass mesh: its token colour, lifted for the grain, the grain tiled every ~12 ft
  const grass = (w, l) => (grain ? (() => { const t = grain.clone(); t.needsUpdate = true; t.repeat.set(l / 12, w / 12); return { map: t, toneMapped: false } })() : { toneMapped: false })
  // (the map is sRGB, so its grey is undone in linear light, where three multiplies)
  const LIN = new THREE.Color().setRGB(BASE, BASE, BASE, THREE.SRGBColorSpace).r
  const lift = (color) => (grain ? new THREE.Color(color).multiplyScalar(1 / LIN) : new THREE.Color(color))
  const flat = (w, l, color, x, z, y, opts = {}) => {
    // flat-lit: the paint reads as painted under any rig (a stadium's turf is lit evenly)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, w), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), ...opts }))
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m
  }
  // the line of scrimmage sits at x = 0; the field's middle is the 50 -- put
  // the offence on its own 35 so the 36 air yards the 2D draws all fit
  const mid = los + 15 * YD
  flat(FIELD_W + 80, FIELD_L + 120, FIELD3D.surround, mid, 0, -0.05)
  // grass in 5-yd stripes
  for (let yd = 0; yd < 100; yd += 5) { const m = flat(FIELD_W, 5 * YD, (yd / 5) % 2 ? FIELD3D.stripe : FIELD3D.turf, mid - PLAY_L / 2 + (yd + 2.5) * YD, 0, 0, grass(FIELD_W, 5 * YD)); m.material.color = lift(m.material.color) }
  for (const s of [-1, 1]) { const m = flat(FIELD_W, 10 * YD, FIELD3D.endzone, mid + s * (PLAY_L / 2 + 5 * YD), 0, 0, grass(FIELD_W, 10 * YD)); m.material.color = lift(m.material.color) }
  // chalk: yard lines every 5, goal lines, sidelines, end lines, hashes
  const chalk = (w, l, x, z) => flat(w, l, FIELD3D.chalk, x, z, 0.04)
  for (let yd = 0; yd <= 100; yd += 5) chalk(FIELD_W, yd % 50 === 0 || yd === 0 || yd === 100 ? 0.8 : 0.5, mid - PLAY_L / 2 + yd * YD, 0)
  for (const s of [-1, 1]) { chalk(2, FIELD_L + 2, mid, s * (FIELD_W / 2 + 1)); chalk(FIELD_W + 4, 2, mid + s * (FIELD_L / 2 + 1), 0) }
  for (let yd = 1; yd < 100; yd++) for (const z of [-FIELD_W / 2 + 2, -9.25, 9.25, FIELD_W / 2 - 2]) chalk(2, 0.35, mid - PLAY_L / 2 + yd * YD, z)
  // goalposts: a gooseneck, an 18.5-ft crossbar 10 ft up, uprights to 40 ft
  const post = new THREE.MeshLambertMaterial({ color: new THREE.Color(FIELD3D.post), emissive: new THREE.Color(FIELD3D.post).multiplyScalar(0.25) })
  for (const s of [-1, 1]) {
    const g = new THREE.Group()
    const cyl = (r, h, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), post); m.position.set(x, y, z); m.rotation.x = rx; g.add(m) }
    cyl(0.45, 10, 0, 5, 0)
    cyl(0.3, 18.5, 0, 10, 0, Math.PI / 2)
    for (const z of [-9.25, 9.25]) cyl(0.25, 30, 0, 25, z)
    g.position.x = mid + s * (FIELD_L / 2); scene.add(g)
  }
  return { mid }
}
