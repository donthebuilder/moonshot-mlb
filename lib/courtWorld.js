// BUCKETS' COURT (B7, 2026-10-02): a half court in feet, the 3D twin of
// components/buckets/ShotChart.js -- the same coordinates (ESPN feet, the rim
// at feed y 1 = court y 5.25 from the baseline). Hardwood is a canvas texture,
// the lines are flat meshes; colours are lib/theme.js COURT only.
import * as THREE from 'three'
import { COURT } from './theme'

export const COURT_W = 50, HALF_L = 47, FEED_TO_COURT = 4.25
export const RIM = { x: 25, y: 5.25, h: 10 }
/** A shot (feed x, y) -> the world: x across, z from the baseline toward half court. */
export const courtPoint = (x, y, h = 0) => new THREE.Vector3(x - 25, h, (y + FEED_TO_COURT) - HALF_L / 2)
export const rimPoint = () => new THREE.Vector3(0, RIM.h, RIM.y - HALF_L / 2)

function hardwood() {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 960
  const g = cv.getContext('2d')
  g.fillStyle = COURT.wood; g.fillRect(0, 0, cv.width, cv.height)
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const plank = cv.width / 50 * 0.75   // ~9-inch boards
  for (let x = 0; x < cv.width; x += plank) {
    g.globalAlpha = 0.06 + rnd() * 0.08; g.fillStyle = COURT.woodDark; g.fillRect(x, 0, plank * (0.4 + rnd() * 0.5), cv.height)
    g.globalAlpha = 0.25; g.fillRect(x, 0, 1, cv.height)
    for (let y = rnd() * 200; y < cv.height; y += 120 + rnd() * 260) { g.globalAlpha = 0.18; g.fillRect(x, y, plank, 1) }
  }
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  return tex
}

export function buildCourt(scene) {
  const flat = (geo, color, y = 0.02, opts = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, ...opts }))
    m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m
  }
  // the apron, then the floor
  flat(new THREE.PlaneGeometry(COURT_W + 16, HALF_L + 12), COURT.apron, -0.01).position.z = 2
  const floor = flat(new THREE.PlaneGeometry(COURT_W, HALF_L), COURT.wood, 0, { map: hardwood() })
  if (floor.material.map) floor.material.color.setRGB(1, 1, 1)
  floor.userData.surface = 'court'
  const z0 = -HALF_L / 2   // the baseline
  const line = (w, l, x, z) => { const m = flat(new THREE.PlaneGeometry(w, l), COURT.line, 0.03); m.position.x = x; m.position.z = z; return m }
  const arc = (cx, cz, r, a0, a1, wid = 0.17) => { const m = flat(new THREE.RingGeometry(r - wid, r, 64, 1, a0, a1 - a0), COURT.line, 0.03); m.position.set(cx, 0.03, cz); return m }
  // the paint, its lines, the free-throw circle
  const key = flat(new THREE.PlaneGeometry(16, 19), COURT.paint, 0.015, { transparent: true, opacity: 0.85 }); key.position.z = z0 + 9.5
  line(0.17, 19, -8, z0 + 9.5); line(0.17, 19, 8, z0 + 9.5); line(16, 0.17, 0, z0 + 19)
  arc(0, z0 + 19, 6, 0, Math.PI * 2)
  // the boundary and half court
  line(COURT_W, 0.17, 0, z0); line(COURT_W, 0.17, 0, z0 + HALF_L); line(0.17, HALF_L, -25, 0); line(0.17, HALF_L, 25, 0)
  // the three: corners 22 ft out to where the 23.75 ft arc meets them, then the arc
  const a = Math.acos(22 / 23.75), cornerZ = RIM.y + 23.75 * Math.sin(a)
  line(0.17, cornerZ, -22, z0 + cornerZ / 2); line(0.17, cornerZ, 22, z0 + cornerZ / 2)
  // RingGeometry angles run from +x; the arc faces away from the baseline (toward +z = -y in the ring's plane)
  arc(0, z0 + RIM.y, 23.75, -Math.PI + a, -a)
  arc(0, z0 + RIM.y, 4, -Math.PI, 0)   // the restricted area
  // the hoop: backboard and rim
  const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), ...o })
  const bb = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 0.15), mat(COURT.board, { transparent: true, opacity: 0.55 })); bb.position.set(0, 11.6, z0 + 4); scene.add(bb)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), mat(COURT.rim)); rim.rotation.x = Math.PI / 2; rim.position.copy(rimPoint()); scene.add(rim)
  // no stanchion: from the baseline camera it stood in front of every shot
  return { floor, rim }
}

/** The arc a shot is DRAWN on to the rim: a parabola, apex 4 ft over the rim's
 *  height plus a tenth of the distance. No release point or arc is published,
 *  so this is geometry, not a measurement (said on the view). */
export function shotArc(x, y, made) {
  const from = courtPoint(x, y, 7), to = rimPoint().clone()
  // a miss lands off the rim, the same way every time for the same shot (no randomness)
  if (!made) { const k = ((x * 7.3 + y * 3.1) % 1 + 1) % 1; to.add(new THREE.Vector3((k - 0.5) * 1.4, 0.3, 0.5 + k * 0.4)) }
  const d = from.distanceTo(to), apex = RIM.h + 4 + d / 10
  const pts = []
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40, p = from.clone().lerp(to, t)
    p.y = from.y + (to.y - from.y) * t + 4 * (apex - Math.max(from.y, to.y)) * t * (1 - t)
    pts.push(p)
  }
  return pts
}
