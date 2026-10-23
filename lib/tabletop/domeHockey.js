// 🏒 THE BUBBLE DOME (2026-10-23, LAMP). Donovan: hockey like "the ones you turn the handle and play ... them little table
// games", the bubble dome, and "yes to the puck drop". Our original in the style of the arcade dome-hockey table (no
// maker's name or mark): a printed rink with the slots the players ride in, low white boards under a chrome rail, a dark
// cabinet with the rods' handles out each end, a clear dome over it all with a scoreboard tower on top -- the puck drops
// from the tower through the dome at the opening faceoff. Painted figures in molded poses, each club's colours, every base
// in LAMP's ice.
//
// SAME FRAME AS lib/rinkWorld.js: feet, the rink 200 x 85, x along it (goal lines at +/-89), z = -y, up y; the league's
// event spots land on it unchanged. Returns { nets, setScore(away, home), towerTop, slots, faceRot }.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RINK, DOME as D, PRINT } from '../nhl/theme'
import { diecutPair } from './diecut'
import { HOCKEY_POSES } from './poses'
import { roundedRect, buildNet, RINK_L, RINK_W, RINK_R, GOAL_X, BLUE_X } from '../rinkWorld'
import { wornMaterial } from './wear'

const A = RINK_L / 2, B = RINK_W / 2
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const rp = (x, y, h = 0) => new THREE.Vector3(x, h, -y)

// THE SLOTS: where each figure rides, for the club whose goal is at x = s * GOAL_X; [role, x0, y0, x1, y1] with x already
// signed by s. `lane` keeps the two centres off each other at the dot.
export function slotsFor(s, lane) {
  return [
    ['G', s * (GOAL_X - 4), -5, s * (GOAL_X - 4), 5],
    ['D', s * 72, 15, s * 28, 30], ['D', s * 72, -15, s * 28, -30],
    ['W', s * 34, 25, -s * 70, 21], ['W', s * 34, -25, -s * 70, -21],
    ['C', s * 22, lane * 3.5, -s * 74, lane * 3.5],
  ]
}
/** The nearest point on a slot to (x, y), and how far. */
export function onSlot([, x0, y0, x1, y1], x, y) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy
  const f = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)) : 0
  const px = x0 + dx * f, py = y0 + dy * f
  return { x: px, y: py, d: Math.hypot(x - px, y - py), f }
}

function rinkPrint({ home, away }, slots) {
  const PX = 10, cw = RINK_L * PX, ch = RINK_W * PX, cv = canvas(cw, ch), g = cv.getContext('2d')
  const X = (x) => (x + A) * PX, Y = (y) => (B - y) * PX
  g.fillStyle = D.ice; g.fillRect(0, 0, cw, ch)
  // the slots, cut in the ice: dark grooves with a light lip
  for (const [, x0, y0, x1, y1] of slots) {
    g.lineCap = 'round'
    g.strokeStyle = D.boards; g.lineWidth = 2.2 * PX; g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke()
    g.strokeStyle = D.groove; g.lineWidth = 1.2 * PX; g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke()
  }
  // the league's paint, printed
  const band = (x, w, c) => { g.fillStyle = c; g.globalAlpha = 0.9; g.fillRect(X(x - w / 2), 0, w * PX, ch); g.globalAlpha = 1 }
  band(0, 1.2, RINK.red); band(-BLUE_X, 1.2, RINK.blue); band(BLUE_X, 1.2, RINK.blue); band(-GOAL_X, 0.4, RINK.red); band(GOAL_X, 0.4, RINK.red)
  const circle = (x, y, r, c, w = 0.35) => { g.strokeStyle = c; g.lineWidth = w * PX; g.beginPath(); g.arc(X(x), Y(y), r * PX, 0, Math.PI * 2); g.stroke() }
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(X(x), Y(y), r * PX, 0, Math.PI * 2); g.fill() }
  circle(0, 0, 15, RINK.blue); dot(0, 0, 0.6, RINK.blue)
  for (const s of [-1, 1]) {
    for (const y of [-22, 22]) { circle(s * 69, y, 15, RINK.red); dot(s * 69, y, 1, RINK.red); dot(s * 20, y, 1, RINK.red) }
    g.fillStyle = RINK.crease; g.globalAlpha = 0.6; g.beginPath(); g.arc(X(s * GOAL_X), Y(0), 6 * PX, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); g.fill(); g.globalAlpha = 1
  }
  // centre ice: the LAMP wordmark; each end: the club that defends it
  g.fillStyle = RINK.blue; g.font = `900 ${8 * PX}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('LAMP', X(0), Y(0))
  for (const [side, x] of [[home, -80], [away, 80]]) {
    g.save(); g.translate(X(x), Y(0)); g.rotate(x < 0 ? -Math.PI / 2 : Math.PI / 2); g.fillStyle = side.color || RINK.red; g.globalAlpha = 0.85
    g.font = `900 ${7 * PX}px Impact, "Arial Narrow", sans-serif`; g.fillText(String(side.abbrev || ''), 0, 0); g.restore()
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

function scoreFace() {
  const cv = canvas(512, 256), t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const draw = (a, h, as, hs, status = '') => {
    const g = cv.getContext('2d')
    g.fillStyle = D.cabinet; g.fillRect(0, 0, 512, 256)
    g.fillStyle = D.trim; g.fillRect(0, 0, 512, 10); g.fillRect(0, 246, 512, 10)
    g.font = '900 54px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = D.boards; g.fillText(a, 128, 72); g.fillText(h, 384, 72)
    g.fillStyle = RINK.kick; g.font = '900 110px Impact, "Arial Narrow", sans-serif'; g.fillText(String(as), 128, 170); g.fillText(String(hs), 384, 170)
    // a status between the scores: END 1, PP NYR, GOAL
    if (status) { g.fillStyle = RINK.red; g.fillRect(196, 132, 120, 76); g.fillStyle = D.boards; g.font = '900 34px Impact, "Arial Narrow", sans-serif'; String(status).split(' ').forEach((w, i, all) => g.fillText(w, 256, 170 + (i - (all.length - 1) / 2) * 32)) }
    t.needsUpdate = true
  }
  return { t, draw }
}

/** Build the table in `scene`. home / away: { abbrev, color, alt }. Returns what the stage moves. */
export function buildDomeHockey(scene, renderer, { home, away }) {
  const out = { nets: {}, setScore: () => {}, towerTop: new THREE.Vector3(0, 52, 0) }
  if (typeof document === 'undefined') return out
  scene.background = new THREE.Color(D.night)
  // reflections for the dome and the chrome: a room environment, kept off the painted things (set per material)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  // the table and the light
  const table = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: new THREE.Color(D.table), roughness: 0.75 }))
  table.rotation.x = -Math.PI / 2; table.position.y = -34; table.receiveShadow = true; scene.add(table)
  const hemi = new THREE.HemisphereLight(new THREE.Color(D.lamp), new THREE.Color(D.night), 0.55); scene.add(hemi)
  const key = new THREE.DirectionalLight(new THREE.Color(D.lamp), 1.5)
  key.position.set(-60, 260, 120); key.castShadow = true
  const sc = key.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 80; sc.bottom = -80; sc.near = 50; sc.far = 600
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.4
  scene.add(key); scene.add(key.target)
  const over = new THREE.SpotLight(new THREE.Color(D.lamp), 2.4, 600, 0.7, 0.55, 1); over.position.set(0, 220, 0); over.target.position.set(0, 0, 0); scene.add(over); scene.add(over.target)
  // the room's light, for the beat it dims between periods (1 = full)
  out.dim = (f) => { hemi.intensity = 0.55 * f; key.intensity = 1.5 * f; over.intensity = 2.4 * f }
  // the cabinet: a rounded dark body under the rink with a chrome band
  const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color(D.trim), metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 1.1 })
  const body = (off, top, depth, mat) => {
    const geo = new THREE.ExtrudeGeometry(roundedRect(A + off, B + off, RINK_R + off), { depth, bevelEnabled: false, curveSegments: 48 })
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = top - depth; m.receiveShadow = true; m.castShadow = true; scene.add(m); return m
  }
  body(9, -0.2, 33, new THREE.MeshStandardMaterial({ color: new THREE.Color(D.cabinet), roughness: 0.45, metalness: 0.2 }))
  body(9.6, -3, 1.6, chrome)
  // the rink: the printed sheet
  const slots = [...slotsFor(-1, 1).map((x) => ['home', ...x]), ...slotsFor(1, -1).map((x) => ['away', ...x])]
  out.slots = slots
  const sheet = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(A, B, RINK_R), 48), new THREE.MeshStandardMaterial({ map: rinkPrint({ home, away }, slots.map(([, ...r]) => r)), roughness: 0.3, metalness: 0 }))
  // ShapeGeometry's uv is in feet: map it onto the canvas
  const uv = sheet.geometry.attributes.uv, pos = sheet.geometry.attributes.position
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (pos.getX(i) + A) / RINK_L, (pos.getY(i) + B) / RINK_W)
  sheet.rotation.x = -Math.PI / 2; sheet.receiveShadow = true; scene.add(sheet)
  // the boards: low white walls, a yellow kick plate at their foot, a chrome rail on top
  const ring = (o0, o1, h, mat, y = 0) => {
    const shape = roundedRect(A + o1, B + o1, RINK_R + o1); shape.holes.push(new THREE.Path(roundedRect(A + o0, B + o0, RINK_R + o0).getPoints(96)))
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 64 }), mat)
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.castShadow = true; m.receiveShadow = true; scene.add(m); return m
  }
  ring(0, 1.4, 5, new THREE.MeshStandardMaterial({ color: new THREE.Color(D.boards), roughness: 0.35 }))
  ring(-0.02, 0.1, 0.8, new THREE.MeshStandardMaterial({ color: new THREE.Color(RINK.kick), roughness: 0.4 }), 0.01)
  const railPts = roundedRect(A + 0.7, B + 0.7, RINK_R + 0.7).getPoints(160).map((p) => new THREE.Vector3(p.x, 5.2, -p.y))
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true), 320, 0.55, 10, true), chrome))
  // the nets
  for (const s of [-1, 1]) { const n = buildNet(RINK.boards); n.position.x = s * GOAL_X; if (s < 0) n.rotation.y = Math.PI; n.traverse((o) => { o.castShadow = true }); scene.add(n); out.nets[s] = n }
  // THE GOAL LAMPS: a red lamp on the rail behind each net, dark until a goal (then it glows and throws red on the ice)
  const lamps = {}
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(RINK.red), emissive: new THREE.Color(RINK.red), emissiveIntensity: 0, roughness: 0.25 }))
    m.position.set(s * (A + 0.7), 5.6, 0); scene.add(m)
    const light = new THREE.PointLight(new THREE.Color(RINK.red), 0, 70, 1.6); light.position.set(s * (A - 4), 9, 0); scene.add(light)
    lamps[s] = { m, light }
  }
  out.lamp = (s, f) => { const l = lamps[s]; if (!l) return; l.m.material.emissiveIntensity = 5 * f; l.light.intensity = 900 * f }
  // the rods' handles out each end of the cabinet: six a club (its goalie's end), chrome with a black knob
  const knob = new THREE.MeshStandardMaterial({ color: new THREE.Color(D.cabinet), roughness: 0.3 })
  out.knobs = []
  for (const s of [-1, 1]) for (let k = 0; k < 6; k += 1) {
    const z = -40 + k * 16, rod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 18, 10), chrome)
    rod.rotation.z = Math.PI / 2; rod.position.set(s * (A + 18), -10 - (k % 2) * 4, z); rod.castShadow = true; scene.add(rod)
    const k1 = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), knob); k1.position.set(s * (A + 27), rod.position.y, z); k1.castShadow = true; scene.add(k1)
    // a handle you can tap: it turns its man (the club whose goal is at this end; slot k)
    k1.userData.knob = { club: s < 0 ? 'home' : 'away', j: k }; rod.userData.knob = k1.userData.knob; out.knobs.push(k1, rod)
  }
  // THE DOME: clear plastic, a long half-shell over the boards, reflections only (no fill): it never washes the rink out
  const domeGeo = new THREE.SphereGeometry(1, 96, 40, 0, Math.PI * 2, 0, Math.PI / 2)
  // (FrontSide: from inside the dome you see out, to the tower; from outside, a highlight on its edges, never a haze)
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(D.dome), metalness: 0, roughness: 0.04, transmission: 0, transparent: true, opacity: 0.025,
    envMap: env, envMapIntensity: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.FrontSide, depthWrite: false }))
  dome.scale.set(A + 6, 46, B + 6); dome.position.y = 4; dome.renderOrder = 10; scene.add(dome)
  out.dome = dome
  // the scoreboard tower at the top: a chrome collar and four faces with the score, the hole the puck drops from
  const face = scoreFace(); face.draw(away.abbrev || '', home.abbrev || '', 0, 0)
  const tower = new THREE.Group(); tower.position.set(0, 50, 0)
  const faceMat = new THREE.MeshStandardMaterial({ map: face.t, roughness: 0.4, emissive: new THREE.Color(D.boards), emissiveMap: face.t, emissiveIntensity: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(D.cabinet), roughness: 0.4, metalness: 0.3 })
  const box = new THREE.Mesh(new THREE.BoxGeometry(13, 6.5, 13), [faceMat, faceMat, dark, dark, faceMat, faceMat]); box.position.y = 3.25; box.userData.tower = true; tower.add(box)
  out.tower = box
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 2.4, 24), chrome); collar.position.y = -0.8; tower.add(collar)
  scene.add(tower)
  out.towerTop = new THREE.Vector3(0, 46, 0)   // the puck hangs just under the hole until it drops
  let last = [0, 0, '']
  out.setScore = (as, hs, status = last[2]) => { last = [as, hs, status]; face.draw(away.abbrev || '', home.abbrev || '', as, hs, status) }
  out.setStatus = (status) => out.setScore(last[0], last[1], status)
  out.flash = (f) => { faceMat.emissiveIntensity = 0.6 + 1.8 * f }
  out.dispose = () => { env.dispose(); pmrem.dispose() }
  return out
}

// ── THE FIGURES: die-cut hockey players on a turntable base ──
const paint = (c, o = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.36, metalness: 0.04, ...o })
const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m }

/** One rod-hockey man (2026-10-23 v2, Donovan: "make them better and actually look like ... NHL players"): a die-cut
 *  piece drawn in profile (lib/tabletop/poses.js stride / goalie) in his club's colours with his number, on the
 *  turntable disc and chrome pin the rod turns. Faces +x; turned round (his back face) he faces -x. jersey / pants /
 *  helmet / numInk / stripe: colours; accent: the base; variant: which wear (0..3). userData.body turns on the
 *  turntable. */
const pieceEdge = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(D.trim), metalness: 0.8, roughness: 0.3 })
export function makeSkater({ jersey, pants, helmet, numInk, accent, num = null, pose = 'stride', stripe = null, variant = 0 }) {
  const fig = new THREE.Group(), body = new THREE.Group(), v = variant & 3
  const steel = paint(D.trim, { metalness: 0.95, roughness: 0.15 })
  // the base: a turntable disc on a chrome pin (the rod turns it)
  fig.add(part(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 32), wornMaterial(accent, 'base', v, { roughness: 0.3 }), 0, 0.25, 0))
  fig.add(part(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12), steel, 0, 0.6, 0))
  const kit = { jersey, pants: pants || jersey, helmet, trim: stripe || helmet, sock: jersey, dark: PRINT.dark, pad: PRINT.pad, numInk: numInk || PRINT.cream }
  const piece = diecutPair({ pose: HOCKEY_POSES[pose === 'goalie' ? 'goalie' : 'stride'], kit, num, variant: v, T: PRINT, edge: pieceEdge() })
  piece.position.set(0, 0.5, 0); body.add(piece)
  fig.add(body); fig.userData.body = body; fig.userData.piece = piece
  fig.scale.setScalar(1.55)
  return fig
}
