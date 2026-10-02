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

export function buildField(scene, { los = 0 } = {}) {
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
  for (let yd = 0; yd < 100; yd += 5) flat(FIELD_W, 5 * YD, (yd / 5) % 2 ? FIELD3D.stripe : FIELD3D.turf, mid - PLAY_L / 2 + (yd + 2.5) * YD, 0, 0)
  for (const s of [-1, 1]) flat(FIELD_W, 10 * YD, FIELD3D.endzone, mid + s * (PLAY_L / 2 + 5 * YD), 0, 0)
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
