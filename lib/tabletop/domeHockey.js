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
import { RINK, DOME as D } from '../nhl/theme'
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

// ── THE FIGURES: molded hockey players on a turntable base, in real toy poses ──
const numTex = new Map()
function numberTex(num, ink, ground) {
  const key = `${num}|${ink}|${ground}`
  let t = numTex.get(key)
  if (!t) {
    const cv = canvas(128, 128), g = cv.getContext('2d'); g.fillStyle = ground; g.fillRect(0, 0, 128, 128)
    g.fillStyle = ink; g.font = '900 88px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 64, 70)
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; numTex.set(key, t)
  }
  return t
}
const paint = (c, o = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.36, metalness: 0.04, ...o })
const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m }

/** A skater (pose 'stride': front knee bent, back leg driving, a lean over the stick on the ice) or a goalie ('goalie':
 *  ribbed pads down, chest protector, blocker and catching glove out, a caged mask, the stick's paddle on the ice). Detailed
 *  and played-with (Donovan 2026-10-23: "super detailed ... chip painting"): breezers with a stripe, striped socks, boots
 *  on chrome blades, hem and sleeve stripes, gloves with cuffs, a visor, a taped stick. jersey / pants / helmet / numInk /
 *  stripe: colours; accent: the base; variant: which wear (0..3). Faces +x. userData.body turns on the turntable. */
export function makeSkater({ jersey, pants, helmet, numInk, accent, num = null, pose = 'stride', stripe = null, variant = 0 }) {
  const fig = new THREE.Group(), body = new THREE.Group(), v = variant & 3
  const jm = wornMaterial(jersey, 'cloth', v), pm = wornMaterial(pants, 'cloth', v + 1), hm = wornMaterial(helmet, 'hard', v, { roughness: 0.2 })
  const st = paint(stripe || helmet), dk = wornMaterial(D.cabinet, 'hard', v + 2, { roughness: 0.45 }), steel = paint(D.trim, { metalness: 0.95, roughness: 0.15 })
  const white = wornMaterial(D.boards, 'hard', v + 3, { roughness: 0.4 }), tape = paint(D.boards, { roughness: 0.8 })
  const ring = (r, tube = 0.07) => new THREE.TorusGeometry(r, tube, 6, 22)
  // the base: a turntable disc on a chrome pin (the rod turns it)
  fig.add(part(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 32), wornMaterial(accent, 'base', v, { roughness: 0.3 }), 0, 0.25, 0))
  fig.add(part(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12), steel, 0, 0.6, 0))
  const skate = (parent, y, z = 0) => {
    parent.add(part(new THREE.BoxGeometry(1.25, 0.5, 0.55), dk, 0.15, y + 0.28, z))                  // the boot
    parent.add(part(new THREE.BoxGeometry(0.5, 0.35, 0.5), dk, -0.05, y + 0.65, z))                   // its ankle
    parent.add(part(new THREE.BoxGeometry(1.5, 0.1, 0.09), steel, 0.15, y - 0.03, z))                 // the blade
  }
  if (pose === 'goalie') {
    // the stance: pads down and wide, knees in, the body upright and square to the puck
    for (const s of [-1, 1]) {
      const pad = new THREE.Group(); pad.position.set(0.45, 1.55, s * 0.85); pad.rotation.x = s * 0.12; body.add(pad)
      pad.add(part(new THREE.BoxGeometry(0.95, 2.7, 1.05), white, 0, 0, 0))
      for (const y of [-0.8, -0.2, 0.4, 1.0]) pad.add(part(new THREE.BoxGeometry(1.0, 0.12, 1.1), st, 0.02, y, 0))   // the rolls
      skate(body, 0.05, s * 0.85)
    }
    body.add(part(new THREE.CapsuleGeometry(1.2, 1.05, 8, 16), jm, 0, 3.65, 0, 0, 0, -0.2))
    body.add(part(ring(1.18), st, -0.05, 3.0, 0, Math.PI / 2, 0, 0)); body.add(part(ring(1.18), st, -0.05, 3.25, 0, Math.PI / 2, 0, 0))
    body.add(part(new THREE.SphereGeometry(1.4, 18, 12).scale(1.1, 0.6, 1.25), jm, 0.1, 4.6, 0))       // the chest protector's shoulders
    // the blocker (a board on his stick hand) and the catching glove (a mitt, thumb up)
    body.add(part(new THREE.BoxGeometry(0.35, 1.45, 1.15), wornMaterial(helmet, 'hard', v + 1), 1.05, 3.4, 1.65))
    body.add(part(new THREE.BoxGeometry(0.4, 1.2, 0.95), white, 1.25, 3.4, 1.65))
    const mitt = new THREE.Group(); mitt.position.set(1.0, 3.8, -1.75); body.add(mitt)
    mitt.add(part(new THREE.CylinderGeometry(0.85, 0.75, 0.55, 18), wornMaterial(helmet, 'hard', v + 2), 0, 0, 0, Math.PI / 2, 0, 0))
    mitt.add(part(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), white, 0.2, 0.75, 0.1))
    // the mask: a helmet with a cage across the face
    body.add(part(new THREE.SphereGeometry(0.92, 22, 16), white, 0.12, 5.65, 0))
    for (const y of [-0.35, -0.1, 0.15]) body.add(part(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), steel, 0.95, 5.55 + y, 0, Math.PI / 2, 0, 0))
    for (const z of [-0.3, 0, 0.3]) body.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.65, 6), steel, 0.98, 5.45, z))
    // the stick: its wide paddle flat on the ice in front of the pads
    body.add(part(new THREE.BoxGeometry(0.14, 3.0, 0.14), dk, 1.4, 1.6, 0.8, 0, 0, 0.2))
    body.add(part(new THREE.BoxGeometry(0.16, 0.85, 0.35), dk, 1.7, 0.5, 0.8))
    body.add(part(new THREE.BoxGeometry(1.4, 0.3, 0.16), tape, 2.2, 0.15, 0.6, 0, -0.3, 0))
    if (num != null) body.add(part(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: numberTex(num, numInk, jersey), roughness: 0.45 }), -1.22, 3.75, 0, 0, -Math.PI / 2, 0))
  } else {
    // THE STRIDE: the front knee bent over the skate, the back leg driving out behind
    const leg = (hipZ, thighSwing, kneeBend) => {
      const hip = new THREE.Group(); hip.position.set(0, 2.55, hipZ); hip.rotation.z = thighSwing; body.add(hip)
      hip.add(part(new THREE.CapsuleGeometry(0.52, 0.7, 6, 12), pm, 0, -0.6, 0))                        // the breezers
      hip.add(part(new THREE.BoxGeometry(0.1, 0.9, 0.08), st, 0, -0.6, hipZ > 0 ? 0.52 : -0.52))       // the stripe down the side
      const knee = new THREE.Group(); knee.position.y = -1.3; knee.rotation.z = kneeBend; hip.add(knee)
      knee.add(part(new THREE.CapsuleGeometry(0.36, 0.85, 6, 12), jm, 0, -0.6, 0))                      // the sock
      knee.add(part(ring(0.38, 0.06), st, 0, -0.35, 0, Math.PI / 2, 0, 0)); knee.add(part(ring(0.38, 0.06), st, 0, -0.6, 0, Math.PI / 2, 0, 0))
      const foot = new THREE.Group(); foot.position.y = -1.25; foot.rotation.z = -(thighSwing + kneeBend); knee.add(foot)
      skate(foot, -0.3)
    }
    leg(0.5, 0.75, -1.05); leg(-0.5, -0.95, 0.15)
    const torso = new THREE.Group(); torso.position.set(0.05, 2.65, 0); torso.rotation.z = -0.62; body.add(torso)
    torso.add(part(new THREE.CapsuleGeometry(0.95, 1.15, 8, 16), jm, 0, 1.0, 0))
    for (const y of [0.22, 0.42]) torso.add(part(ring(0.97), st, 0, y, 0, Math.PI / 2, 0, 0))            // the hem stripes
    torso.add(part(new THREE.SphereGeometry(1.15, 18, 12).scale(1.0, 0.55, 1.22), jm, 0, 1.92, 0))
    // the helmet: shell, a visor across the eyes, ear guards, chin strap
    torso.add(part(new THREE.SphereGeometry(0.76, 22, 16), hm, 0.18, 2.88, 0))
    torso.add(part(new THREE.SphereGeometry(0.79, 18, 8, -Math.PI / 3, Math.PI * 0.66, Math.PI * 0.42, Math.PI * 0.2), paint(D.groove, { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 }), 0.18, 2.88, 0, 0, 0, 0))
    for (const s of [-1, 1]) torso.add(part(new THREE.SphereGeometry(0.28, 10, 8), hm, 0.15, 2.7, s * 0.72))
    torso.add(part(new THREE.SphereGeometry(0.3, 12, 10), paint(D.skin), 0.78, 2.72, 0))
    // arms: sleeve (a stripe at the elbow), forearm, glove with its cuff -- both down and forward to the stick
    const armTo = (z, swing, bend) => {
      const sh = new THREE.Group(); sh.position.set(0, 1.85, z); sh.rotation.z = swing; torso.add(sh)
      sh.add(part(new THREE.CapsuleGeometry(0.32, 0.55, 6, 10), jm, 0, -0.45, 0))
      sh.add(part(ring(0.34, 0.06), st, 0, -0.75, 0, Math.PI / 2, 0, 0))
      const el = new THREE.Group(); el.position.y = -0.95; el.rotation.z = bend; sh.add(el)
      el.add(part(new THREE.CapsuleGeometry(0.28, 0.5, 6, 10), jm, 0, -0.4, 0))
      el.add(part(new THREE.BoxGeometry(0.62, 0.55, 0.6), wornMaterial(helmet, 'hard', v + 1), 0, -0.95, 0))   // the glove
      el.add(part(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12), wornMaterial(helmet, 'hard', v + 2), 0, -0.62, 0))   // its cuff
    }
    armTo(0.95, 1.15, 0.5); armTo(-0.85, 1.45, 0.25)
    if (num != null) {
      const tex = numberTex(num, numInk, jersey)
      torso.add(part(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), -0.97, 1.15, 0, 0, -Math.PI / 2, 0))
    }
    // the stick: from the hands down to the ice ahead, a white knob at the top, the taped blade flat on the ice
    body.add(part(new THREE.BoxGeometry(0.16, 4.3, 0.16), dk, 2.25, 1.55, 0.15, 0, 0, 0.95))
    body.add(part(new THREE.BoxGeometry(0.2, 0.35, 0.2), tape, 0.6, 3.0, 0.15, 0, 0, 0.95))
    body.add(part(new THREE.BoxGeometry(1.3, 0.28, 0.16), dk, 4.0, 0.2, 0.45, 0, -0.35, 0))
    body.add(part(new THREE.BoxGeometry(0.75, 0.3, 0.18), tape, 4.15, 0.2, 0.5, 0, -0.35, 0))
  }
  fig.add(body); fig.userData.body = body
  fig.scale.setScalar(1.55)
  return fig
}
