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
  const draw = (a, h, as, hs) => {
    const g = cv.getContext('2d')
    g.fillStyle = D.cabinet; g.fillRect(0, 0, 512, 256)
    g.fillStyle = D.trim; g.fillRect(0, 0, 512, 10); g.fillRect(0, 246, 512, 10)
    g.font = '900 54px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = D.boards; g.fillText(a, 128, 72); g.fillText(h, 384, 72)
    g.fillStyle = RINK.kick; g.font = '900 110px Impact, "Arial Narrow", sans-serif'; g.fillText(String(as), 128, 170); g.fillText(String(hs), 384, 170)
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
  scene.add(new THREE.HemisphereLight(new THREE.Color(D.lamp), new THREE.Color(D.night), 0.55))
  const key = new THREE.DirectionalLight(new THREE.Color(D.lamp), 1.5)
  key.position.set(-60, 260, 120); key.castShadow = true
  const sc = key.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 80; sc.bottom = -80; sc.near = 50; sc.far = 600
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.4
  scene.add(key); scene.add(key.target)
  const over = new THREE.SpotLight(new THREE.Color(D.lamp), 2.4, 600, 0.7, 0.55, 1); over.position.set(0, 220, 0); over.target.position.set(0, 0, 0); scene.add(over); scene.add(over.target)
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
  // the rods' handles out each end of the cabinet: six a club (its goalie's end), chrome with a black knob
  const knob = new THREE.MeshStandardMaterial({ color: new THREE.Color(D.cabinet), roughness: 0.3 })
  for (const s of [-1, 1]) for (let k = 0; k < 6; k += 1) {
    const z = -40 + k * 16, rod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 18, 10), chrome)
    rod.rotation.z = Math.PI / 2; rod.position.set(s * (A + 18), -10 - (k % 2) * 4, z); rod.castShadow = true; scene.add(rod)
    const k1 = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), knob); k1.position.set(s * (A + 27), rod.position.y, z); k1.castShadow = true; scene.add(k1)
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
  const box = new THREE.Mesh(new THREE.BoxGeometry(13, 6.5, 13), [faceMat, faceMat, dark, dark, faceMat, faceMat]); box.position.y = 3.25; tower.add(box)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 2.4, 24), chrome); collar.position.y = -0.8; tower.add(collar)
  scene.add(tower)
  out.towerTop = new THREE.Vector3(0, 46, 0)   // the puck hangs just under the hole until it drops
  out.setScore = (as, hs) => face.draw(away.abbrev || '', home.abbrev || '', as, hs)
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

/** A skater (pose 'stride': one skate driving back, knees bent, stick on the ice ahead) or a goalie ('goalie': pads
 *  down, blocker and glove out, the stick flat in front). jersey / pants / helmet / numInk: colours; accent: the base.
 *  Faces +x. userData.body turns on the turntable (a shot is a spin). */
export function makeSkater({ jersey, pants, helmet, numInk, accent, num = null, pose = 'stride' }) {
  const fig = new THREE.Group(), body = new THREE.Group()
  const jm = paint(jersey), pm = paint(pants), hm = paint(helmet, { roughness: 0.22 }), sk = paint(D.groove, { roughness: 0.5 }), steel = paint(D.trim, { metalness: 0.9, roughness: 0.2 })
  fig.add(part(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 28), paint(accent, { roughness: 0.25 }), 0, 0.25, 0))
  const leg = new THREE.CapsuleGeometry(0.42, 1.6, 4, 10), arm = new THREE.CapsuleGeometry(0.3, 1.3, 4, 8)
  if (pose === 'goalie') {
    const pad = new THREE.BoxGeometry(1.0, 2.6, 1.0)
    for (const s of [-1, 1]) { body.add(part(pad, paint(D.boards), 0.4, 1.5, s * 0.8, 0, 0, 0.15)); body.add(part(new THREE.BoxGeometry(1.3, 0.3, 0.7), sk, 0.5, 0.35, s * 0.8)) }
    body.add(part(new THREE.CapsuleGeometry(1.15, 1.0, 6, 14), jm, 0, 3.7, 0, 0, 0, -0.25))
    body.add(part(new THREE.SphereGeometry(1.35, 16, 10).scale(1.1, 0.6, 1.2), jm, 0.1, 4.6, 0))
    body.add(part(new THREE.BoxGeometry(0.4, 1.4, 1.1), paint(D.boards), 1.0, 3.4, 1.6))                  // the blocker
    body.add(part(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16), paint(D.boards), 1.0, 3.8, -1.7, Math.PI / 2, 0, 0))  // the glove
    body.add(part(new THREE.SphereGeometry(0.9, 18, 14), paint(D.boards, { roughness: 0.2 }), 0.15, 5.6, 0))  // the mask
    body.add(part(new THREE.BoxGeometry(0.15, 0.7, 1.4), sk, 1.95, 0.4, 0.2))                                  // the paddle on the ice
  } else {
    // the stride: the front leg bent under him, the back leg driving out behind, a lean over the stick
    body.add(part(leg, pm, 0.55, 1.35, 0.5, 0, 0, 0.35)); body.add(part(leg, pm, -0.75, 1.25, -0.5, 0, 0, -0.75))
    body.add(part(new THREE.BoxGeometry(1.5, 0.35, 0.55), sk, 0.95, 0.3, 0.5)); body.add(part(new THREE.BoxGeometry(1.5, 0.35, 0.55), sk, -1.55, 0.45, -0.6, 0, 0, -0.2))
    body.add(part(new THREE.BoxGeometry(1.7, 0.08, 0.12), steel, 0.95, 0.1, 0.5))
    const torso = new THREE.Group(); torso.position.set(0.1, 2.6, 0); torso.rotation.z = -0.55
    torso.add(part(new THREE.CapsuleGeometry(0.95, 1.2, 6, 14), jm, 0, 1.0, 0))
    torso.add(part(new THREE.SphereGeometry(1.15, 16, 10).scale(1.0, 0.55, 1.25), jm, 0, 1.9, 0))
    torso.add(part(new THREE.SphereGeometry(0.78, 18, 14), hm, 0.15, 2.85, 0))
    torso.add(part(new THREE.SphereGeometry(0.3, 10, 8), paint(D.skin), 0.75, 2.75, 0))
    // both arms down and forward to the stick
    torso.add(part(arm, jm, 0.7, 1.3, 0.9, 0.3, 0, 0.95)); torso.add(part(arm, jm, 0.8, 0.9, -0.6, -0.2, 0, 1.25))
    if (num != null) {
      const tex = numberTex(num, numInk, jersey)
      torso.add(part(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), -0.97, 1.15, 0, 0, -Math.PI / 2, 0))
    }
    body.add(torso)
    // the stick: from the hands down to the ice ahead, the taped blade flat on the ice
    const shaft = part(new THREE.BoxGeometry(0.16, 4.2, 0.16), paint(D.cabinet), 2.2, 1.5, 0.15, 0, 0, 0.95); body.add(shaft)
    body.add(part(new THREE.BoxGeometry(1.3, 0.25, 0.14), paint(D.cabinet), 3.95, 0.2, 0.45, 0, -0.35, 0))
  }
  fig.add(body); fig.userData.body = body
  fig.scale.setScalar(1.6)
  return fig
}
