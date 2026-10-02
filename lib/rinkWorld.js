// 🏒 THE RINK, IN 3D (2026-10-01, BATCH-NHL-3D). The sheet LAMP's shot map is
// drawn on, in the league's own feet -- the same numbers components/lamp/
// Rink.js and lib/nhl/shotMap.js use: 200 x 85 ft, 28 ft corners, the red
// centre line, blue lines at +-25, goal lines at +-89, faceoff circles
// (r 15) and dots at (+-69, +-22), the neutral-zone dots at (+-20, +-22), the
// centre circle, creases (r 6) and both nets.
//
// WORLD AXES: x along the rink (the attacking net at x = +89, as every shot is
// normalised to), y up, z = -(the rink's y). Facing the attacking net, the
// shot map's +y is on your LEFT, which is three.js's -z.
import * as THREE from 'three'
import { RINK } from './nhl/theme'

export const RINK_L = 200, RINK_W = 85, RINK_R = 28
export const GOAL_X = 89, BLUE_X = 25
/** A shot-map point (x, y) -> the world. */
export const rinkPoint = (x, y, h = 0) => new THREE.Vector3(x, h, -y)

function roundedRect(a, b, r) {
  const s = new THREE.Shape()
  s.moveTo(-a + r, -b)
  s.lineTo(a - r, -b); s.absarc(a - r, -b + r, r, -Math.PI / 2, 0, false)
  s.lineTo(a, b - r); s.absarc(a - r, b - r, r, 0, Math.PI / 2, false)
  s.lineTo(-a + r, b); s.absarc(-a + r, b - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-a, -b + r); s.absarc(-a + r, -b + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

// A faint scratched-ice texture: the sheet's tone, a few hundred hairline
// scrapes, a little grain. Drawn once on a canvas -- no file to fetch.
function scratchedIce(a, b) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 436
  const g = cv.getContext('2d')
  g.fillStyle = RINK.ice; g.fillRect(0, 0, cv.width, cv.height)
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  g.strokeStyle = RINK.iceShade; g.lineCap = 'round'
  for (let i = 0; i < 520; i++) {
    const x = rnd() * cv.width, y = rnd() * cv.height, len = 18 + rnd() * 90, ang = (rnd() - 0.5) * 0.9
    g.globalAlpha = 0.05 + rnd() * 0.12; g.lineWidth = 0.6 + rnd() * 1.1
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 6, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke()
  }
  g.globalAlpha = 0.04; g.fillStyle = RINK.iceShade
  for (let i = 0; i < 2600; i++) g.fillRect(rnd() * cv.width, rnd() * cv.height, 1.4, 1.4)
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  // ShapeGeometry UVs are the shape's own coordinates: map the sheet's feet to 0..1
  tex.repeat.set(1 / (2 * a), 1 / (2 * b)); tex.offset.set(0.5, 0.5)
  tex.anisotropy = 4
  return tex
}

export function buildRink(scene) {
  const a = RINK_L / 2, b = RINK_W / 2
  const flat = (geo, color, y = 0.02, opts = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, ...opts }))
    m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m
  }
  // the sheet -- the brightest surface in the building, on purpose. One step
  // off pure white, with a faint scratched-ice texture drawn on a canvas
  // (BATCH-3D-V2 1f: easy realism only; nothing downloaded) and a low sheen.
  const ice = flat(new THREE.ShapeGeometry(roundedRect(a, b, RINK_R), 48), RINK.ice, 0, { emissive: new THREE.Color(RINK.ice).multiplyScalar(0.12), map: scratchedIce(a, b) })
  // the texture already carries the sheet's tone; a white base keeps it from squaring
  if (ice.material.map) ice.material.color.setRGB(1, 1, 1)
  ice.userData.surface = 'ice'
  // lines: centre red, blue lines, goal lines (clipped to the rounded ends)
  const bar = (x, wid, color) => flat(new THREE.PlaneGeometry(wid, RINK_W - 1.5), color, 0.03)
  bar(0, 1, RINK.red)
  for (const s of [-1, 1]) {
    bar(s * BLUE_X, 1, RINK.blue).position.x = s * BLUE_X
    // a goal line runs between the boards at x = 89, where the corners cut in
    const dx = a - RINK_R, cut = GOAL_X > dx ? Math.sqrt(Math.max(0, RINK_R * RINK_R - (GOAL_X - dx) ** 2)) : RINK_R
    const half = b - RINK_R + cut
    const gl = flat(new THREE.PlaneGeometry(0.17, 2 * half - 0.6), RINK.red, 0.03); gl.position.x = s * GOAL_X
  }
  const ring = (x, y, r, wid, color, segs = 64) => { const m = flat(new THREE.RingGeometry(r - wid, r, segs), color, 0.035); m.position.set(x, 0.035, -y); return m }
  const dot = (x, y, r, color) => { const m = flat(new THREE.CircleGeometry(r, 32), color, 0.04); m.position.set(x, 0.04, -y); return m }
  // A FACEOFF DOT IS A THIN RING (BATCH-3D-V2 1b): a solid red dot read as a
  // goal puck from the BLUE LINE preset. Nothing on the ice is red-filled except a goal.
  const faceoff = (x, y) => ring(x, y, 1, 0.2, RINK.red, 32)
  ring(0, 0, 15, 0.17, RINK.blue); dot(0, 0, 0.5, RINK.blue)
  for (const s of [-1, 1]) {
    for (const y of [-22, 22]) { ring(s * 69, y, 15, 0.17, RINK.red); faceoff(s * 69, y); faceoff(s * 20, y) }
    // the crease: a 6 ft half-disc in front of the goal line, toward centre
    // half-disc facing centre ice: x < 89 at the attacking end, x > -89 at the other
    const cr = flat(new THREE.CircleGeometry(6, 32, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), RINK.crease, 0.032, { transparent: true, opacity: 0.85 })
    cr.position.x = s * GOAL_X
  }
  // boards: a 42-inch wall round the sheet, a yellow kick plate, a dark cap,
  // and glass above (see-through, so the crowd still reads)
  const wall = (h0, h1, color, opts = {}) => {
    const shape = roundedRect(a + 0.6, b + 0.6, RINK_R + 0.6)
    const hole = roundedRect(a, b, RINK_R)
    shape.holes.push(new THREE.Path(hole.getPoints(48)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false, curveSegments: 48 })
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), ...opts }))
    m.rotation.x = -Math.PI / 2; m.position.y = h0; scene.add(m); return m
  }
  wall(0, 0.8, RINK.kick); wall(0.8, 3.3, RINK.boards); wall(3.3, 3.5, RINK.cap)
  wall(3.5, 8, RINK.glass, { transparent: true, opacity: 0.12, depthWrite: false })
  // the nets: red posts and crossbar 6 ft x 4 ft on the goal line, a shallow
  // white mesh behind -- both ends; the attacking net is x = +89
  const post = new THREE.MeshLambertMaterial({ color: new THREE.Color(RINK.red) })
  const mesh = new THREE.MeshLambertMaterial({ color: new THREE.Color(RINK.boards), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  const nets = {}
  const lights = {}
  for (const s of [-1, 1]) {
    const g = new THREE.Group()
    for (const z of [-3, 3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4, 10), post); p.position.set(0, 2, z); g.add(p) }
    const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 6, 10), post); bar2.rotation.x = Math.PI / 2; bar2.position.set(0, 4, 0); g.add(bar2)
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.3, 4, 6), mesh); back.position.set(1.65, 2, 0); g.add(back)
    g.position.x = s * GOAL_X; if (s < 0) g.rotation.y = Math.PI
    scene.add(g)
    nets[s] = g
    // the goal light on the glass behind the net: off until a goal plays (1g)
    // a small red housing that reads as a light fixture when dark, not as a puck
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.4), new THREE.MeshStandardMaterial({ color: new THREE.Color(RINK.red), emissive: new THREE.Color(RINK.red), emissiveIntensity: 0.08 }))
    lamp.position.set(s * (a - 1.5), 9.2, 0)
    scene.add(lamp)
    lights[s] = lamp
  }
  return { ice, nets, lights }
}
