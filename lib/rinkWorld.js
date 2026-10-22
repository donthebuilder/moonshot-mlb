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

// THE TRACKING LOOK (2026-10-22, PREPLAY on LAMP): `tracking` = { floor, line } colours from the caller's theme. A dark
// sheet, the league's own line colours, thin, unlit (MeshBasic: no lights needed); the boards and the nets as thin
// outlines instead of walls and glass. The same feet as the shipped rink, so a spot lands in the same place on both.
export function buildRink(scene, { tracking = null } = {}) {
  const a = RINK_L / 2, b = RINK_W / 2
  const flat = (geo, color, y = 0.02, opts = {}) => {
    const { emissive, ...rest } = opts   // unlit: no emissive; a map (the ice texture, the mark) is kept
    const mat = tracking ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, ...rest })
      : new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, ...opts })
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m
  }
  if (tracking) return buildTrackingRink(scene, flat, a, b, tracking)
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

/** DASH ICE (2026-10-22): the dark sheet's own texture -- the floor colour, a few hundred faint skate scrapes, a little
 *  grain and a soft sheen where the lights hit the middle. Drawn once on a canvas; nothing fetched. */
function darkIce(a, b, floor, line) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 872
  const g = cv.getContext('2d')
  g.fillStyle = `#${new THREE.Color(floor).getHexString()}`; g.fillRect(0, 0, cv.width, cv.height)
  const sheen = g.createRadialGradient(cv.width / 2, cv.height / 2, 40, cv.width / 2, cv.height / 2, cv.width * 0.55)
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)'); sheen.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = sheen; g.fillRect(0, 0, cv.width, cv.height)
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  g.strokeStyle = line; g.lineCap = 'round'
  for (let i = 0; i < 900; i++) {
    const x = rnd() * cv.width, y = rnd() * cv.height, len = 30 + rnd() * 160, ang = (rnd() - 0.5) * 0.7
    g.globalAlpha = 0.012 + rnd() * 0.035; g.lineWidth = 0.6 + rnd() * 1.4
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 10, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke()
  }
  g.globalAlpha = 0.025; g.fillStyle = line
  for (let i = 0; i < 6000; i++) g.fillRect(rnd() * cv.width, rnd() * cv.height, 1.5, 1.5)
  g.globalAlpha = 1
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.repeat.set(1 / (2 * a), 1 / (2 * b)); tex.offset.set(0.5, 0.5)
  tex.anisotropy = 8
  return tex
}

/** A goal net: red posts and crossbar as tubes, the bottom frame curving back, a white mesh with a real net weave.
 *  Built facing +x's net (the group is turned for the other end). userData.mesh is the netting (a goal ripples it). */
function buildNet(line) {
  const g = new THREE.Group()
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(RINK.red) })
  const tube = (pts, r = 0.12) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v))), 24, r, 8, false), red)
  g.add(tube([[0, 0, -3], [0, 4, -3]])); g.add(tube([[0, 0, 3], [0, 4, 3]])); g.add(tube([[0, 4, -3], [0, 4, 3]]))
  // the base frame: from post to post round the back, 40 inches deep
  const base = [[0, 0.05, -3], [1.6, 0.05, -3.4], [3.2, 0.05, -2], [3.4, 0.05, 0], [3.2, 0.05, 2], [1.6, 0.05, 3.4], [0, 0.05, 3]]
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(base.map((v) => new THREE.Vector3(...v))), 48, 0.09, 6, false), red))
  // the netting: a weave drawn on a canvas, on a shell from the crossbar back to the base
  let weave = null
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256
    const c = cv.getContext('2d')
    c.strokeStyle = line; c.globalAlpha = 0.85; c.lineWidth = 2
    for (let i = 0; i <= 256; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke() }
    weave = new THREE.CanvasTexture(cv); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(6, 3)
  }
  const shape = new THREE.CatmullRomCurve3(base.map(([x, , z]) => new THREE.Vector3(x, 0, z)))
  const N = 24, top = new THREE.CatmullRomCurve3([[0, 4, -3], [1.2, 3.2, -2.6], [1.8, 2.4, 0], [1.2, 3.2, 2.6], [0, 4, 3]].map((v) => new THREE.Vector3(...v)))
  const pos = [], uv = [], idx = []
  for (let i = 0; i <= N; i++) {
    const u = i / N, lo = shape.getPoint(u), hi = top.getPoint(u)
    pos.push(lo.x, 0.05, lo.z, hi.x, hi.y, hi.z); uv.push(u, 0, u, 1)
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(line), map: weave, transparent: true, opacity: weave ? 0.55 : 0.2, side: THREE.DoubleSide, depthWrite: false }))
  g.add(mesh); g.userData.mesh = mesh
  return g
}

/** The tracking look's rink (DASH ice): the textured dark sheet, the league's lines, circles and creases, the DASH mark
 *  under centre ice (mark: a same-origin image url, optional), low dark boards with a light cap, and real nets.
 *  Returns { ice, nets, lights }. */
function buildTrackingRink(scene, flat, a, b, { floor, line, mark = null }) {
  const ice = flat(new THREE.ShapeGeometry(roundedRect(a, b, RINK_R), 48), 0xffffff, 0, { map: darkIce(a, b, floor, line) })
  if (!ice.material.map) ice.material.color.set(floor)
  ice.userData.surface = 'ice'
  if (mark && typeof window !== 'undefined') {
    // the mark is drawn light on black: added light, the black drops out, it sits "under the ice"
    new THREE.TextureLoader().load(mark, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      const m = flat(new THREE.PlaneGeometry(26, 26), 0xffffff, 0.025, { map: t, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })
      m.position.set(0, 0.025, 0)
    }, undefined, () => {})
  }
  const soft = { transparent: true, opacity: 0.85 }
  const bar = (x, wid, color) => { const m = flat(new THREE.PlaneGeometry(wid, RINK_W - 1.5), color, 0.03, soft); m.position.x = x; return m }
  bar(0, 1, RINK.red)
  for (const s of [-1, 1]) {
    bar(s * BLUE_X, 1, RINK.blue)
    const dx = a - RINK_R, cut = GOAL_X > dx ? Math.sqrt(Math.max(0, RINK_R * RINK_R - (GOAL_X - dx) ** 2)) : RINK_R
    const gl = flat(new THREE.PlaneGeometry(0.2, 2 * (b - RINK_R + cut) - 0.6), RINK.red, 0.03, soft); gl.position.x = s * GOAL_X
  }
  const ring = (x, y, r, wid, color, opts = soft) => { const m = flat(new THREE.RingGeometry(r - wid, r, 64), color, 0.035, opts); m.position.set(x, 0.035, -y); return m }
  ring(0, 0, 15, 0.2, RINK.blue)
  for (const s of [-1, 1]) {
    for (const y of [-22, 22]) { ring(s * 69, y, 15, 0.2, RINK.red); ring(s * 69, y, 1, 0.22, RINK.red); ring(s * 20, y, 1, 0.22, RINK.red) }
    const cr = flat(new THREE.CircleGeometry(6, 32, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), RINK.crease, 0.032, { transparent: true, opacity: 0.32 })
    cr.position.x = s * GOAL_X
  }
  // the boards: a low dark wall (42 in) round the sheet with a light cap line, so the rink has an edge you can feel
  const shape = roundedRect(a + 0.6, b + 0.6, RINK_R + 0.6)
  shape.holes.push(new THREE.Path(roundedRect(a, b, RINK_R).getPoints(64)))
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: false, curveSegments: 64 })
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(0.55) }))
  wall.rotation.x = -Math.PI / 2; scene.add(wall)
  const capPts = roundedRect(a + 0.3, b + 0.3, RINK_R + 0.3).getPoints(128).map((p) => new THREE.Vector3(p.x, 3.55, -p.y))
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(capPts), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.55 })))
  const footPts = roundedRect(a, b, RINK_R).getPoints(128).map((p) => new THREE.Vector3(p.x, 0.06, -p.y))
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(footPts), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.35 })))
  const nets = {}
  for (const s of [-1, 1]) {
    const n = buildNet(line)
    n.position.x = s * GOAL_X; if (s < 0) n.rotation.y = Math.PI
    scene.add(n); nets[s] = n
  }
  return { ice, nets, lights: {} }
}
