// 🏈 THE FIGURES (2026-10-23, TUDDY's electric board). Small painted men on bases, our original in the style of the
// vibrating-football toy: each club's jersey colours so a fan spots his team at a glance, every base in the product's
// own colour (Donovan: "best for recognition and brand growth"). Painted plastic: a soft sheen, no textures but the
// number on the back. Only the man the play is about wears his real number; the rest are blank, because where they
// stand is drawn (a real formation, not tracking).
//
// FORMATIONS: in yards from the line of scrimmage, `back` behind it for the offence (positive), in front for the
// defence; `across` toward the offence's right. The 22 drift and shiver while a play runs (the buzz).
import * as THREE from 'three'
import { wornMaterial } from './wear'

const numberTex = new Map()
function numTex(num, ink, ground) {
  const key = `${num}|${ink}|${ground}`
  let t = numberTex.get(key)
  if (!t && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128
    const g = cv.getContext('2d'); g.fillStyle = ground; g.fillRect(0, 0, 128, 128)
    g.fillStyle = ink; g.font = '900 92px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 64, 70)
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; numberTex.set(key, t)
  }
  return t
}

const geo = {}
const G = () => {
  if (geo.base) return geo
  const shape = new THREE.Shape(); const w = 2.3, d = 1.55, r = 0.75
  shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r); shape.lineTo(w, d - r); shape.quadraticCurveTo(w, d, w - r, d)
  shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d)
  geo.base = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.14, bevelSegments: 3 }); geo.base.rotateX(-Math.PI / 2)
  geo.thigh = new THREE.CapsuleGeometry(0.44, 1.05, 6, 12)
  geo.shin = new THREE.CapsuleGeometry(0.34, 1.0, 6, 12)
  geo.sock = new THREE.CylinderGeometry(0.39, 0.37, 0.75, 14)
  geo.cleat = new THREE.BoxGeometry(0.95, 0.32, 0.52); geo.cleat.translate(0.2, 0, 0)
  geo.stripe = new THREE.BoxGeometry(0.12, 1.25, 0.1)
  geo.torso = new THREE.CapsuleGeometry(0.98, 1.2, 8, 18)
  geo.belt = new THREE.TorusGeometry(0.95, 0.09, 6, 24)
  geo.pads = new THREE.SphereGeometry(1.2, 20, 12); geo.pads.scale(1.2, 0.5, 0.92)
  geo.padCap = new THREE.SphereGeometry(0.62, 14, 10); geo.padCap.scale(1, 0.62, 1)
  geo.neck = new THREE.CylinderGeometry(0.34, 0.4, 0.5, 12)
  geo.upperArm = new THREE.CapsuleGeometry(0.36, 0.62, 6, 10)
  geo.forearm = new THREE.CapsuleGeometry(0.28, 0.66, 6, 10)
  geo.glove = new THREE.SphereGeometry(0.33, 12, 10); geo.glove.scale(1, 1.15, 0.8)
  geo.helmet = new THREE.SphereGeometry(0.95, 26, 18)
  geo.helmetStripe = new THREE.TorusGeometry(0.955, 0.075, 6, 28, Math.PI)
  geo.ear = new THREE.CircleGeometry(0.15, 12)
  geo.bar = new THREE.CylinderGeometry(0.055, 0.055, 1.25, 8)
  geo.post = new THREE.CylinderGeometry(0.055, 0.055, 0.62, 8)
  geo.number = new THREE.PlaneGeometry(1.15, 1.15)
  return geo
}
const paint = (color, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.38, metalness: 0.05, ...extra })

// THE POSES (2026-10-23, Donovan: "real toy poses"): molded like the toy's figures. Each pose sets the hip height, the
// upper body's lean forward, each thigh's swing (+ = knee forward; the knee bends so the cleat lands on the base), each
// arm's swing (+ = forward, from the upper body) and elbow bend, and how far the arms spread out to the sides.
const POSES = {
  stance3: { hip: 2.55, lean: 1.12, legs: [0.55, -0.35], arms: [1.12, 0.6], elbows: [0.05, 1.3], spread: 0.08 },  // lineman: a hand down, back flat
  ready: { hip: 3.05, lean: 0.38, legs: [0.32, -0.12], arms: [0.75, 0.6], elbows: [0.9, 0.9], spread: 0.2 },        // two-point: receivers, backers
  run: { hip: 3.0, lean: 0.48, legs: [1.0, -0.62], arms: [1.15, -0.45], elbows: [1.4, 1.2], spread: 0.08 },         // the man with the ball, mid-stride
  qb: { hip: 3.25, lean: 0.06, legs: [0.25, -0.18], arms: [1.25, -2.4], elbows: [0.5, -1.6], spread: 0.12 },        // the passer: ball cocked by his ear
  backpedal: { hip: 2.75, lean: 0.25, legs: [0.45, -0.05], arms: [0.5, 0.5], elbows: [0.8, 0.8], spread: 0.6 },     // the DB: low, arms out, weight back
  kick: { hip: 3.3, lean: -0.15, legs: [1.45, -0.15], arms: [-0.6, 0.95], elbows: [0.3, 0.3], spread: 0.5 },          // the kicker's leg through the ball
}
export const POSE_NAMES = Object.keys(POSES)
const THIGH = 1.55, SHIN = 1.4, FOOT_Y = 0.85   // (in the figure's own units; the base top is at FOOT_Y)

/** The shin's swing for a thigh swing so the foot lands at FOOT_Y, the knee bending the natural way (forward). */
function shinFor(hip, a) {
  const v = Math.max(-1, Math.min(1, (hip - FOOT_Y - THIGH * Math.cos(a)) / SHIN)), m = Math.acos(v)
  const ok = [m, -m].filter((b) => b <= a + 1e-6)
  return ok.length ? Math.max(...ok) : a
}

/** One figure, detailed and played-with. jersey / pants / helmet / mask / sock / dark (cleats, sleeves): colours;
 *  stripe: the pants stripe and the helmet stripe; accent: the base; num: a number or null (numInk its paint); pose: one
 *  of POSES; variant: which wear (0..3). Faces +x. userData.body is what shivers. */
export function makeFigure({ jersey, pants, helmet, accent, mask, numInk = null, num = null, pose = 'ready', arm = null, stripe = null, sock = null, dark = null, variant = 0 }) {
  const P = POSES[arm === 'throw' ? 'qb' : pose] || POSES.ready
  const g0 = G(), fig = new THREE.Group(), body = new THREE.Group()
  const v = variant & 3
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m }
  const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh }
  const base = shadowy(new THREE.Mesh(g0.base, wornMaterial(accent, 'base', v, { roughness: 0.3 }))); base.position.y = 0.14; fig.add(base)
  const jm = wornMaterial(jersey, 'cloth', v), pm = wornMaterial(pants, 'cloth', v + 1), hm = wornMaterial(helmet, 'hard', v, { roughness: 0.2 })
  const sm = wornMaterial(sock || helmet, 'cloth', v + 2), dm = wornMaterial(dark || helmet, 'hard', v + 3, { roughness: 0.5 })
  const stm = paint(stripe || mask), mm = paint(mask, { metalness: 0.35, roughness: 0.35 })
  // THE LEGS: thigh (pants, a stripe down the outside), knee, shin (sock), cleat -- the foot on the base
  P.legs.forEach((a, i) => {
    const s = i ? -1 : 1, hipJ = new THREE.Group(); hipJ.position.set(0, P.hip, s * 0.52); hipJ.rotation.z = a
    hipJ.add(shadowy(at(new THREE.Mesh(g0.thigh, pm), 0, -THIGH / 2, 0)))
    hipJ.add(at(new THREE.Mesh(g0.stripe, stm), 0, -THIGH / 2, s * 0.45))
    const knee = new THREE.Group(); knee.position.y = -THIGH; knee.rotation.z = shinFor(P.hip, a) - a; hipJ.add(knee)
    knee.add(shadowy(at(new THREE.Mesh(g0.shin, sm), 0, -SHIN / 2, 0)))
    knee.add(shadowy(at(new THREE.Mesh(g0.sock, sm), 0, -SHIN + 0.45, 0)))
    const foot = shadowy(at(new THREE.Mesh(g0.cleat, dm), 0, -SHIN - 0.08, 0)); foot.rotation.z = -shinFor(P.hip, a); knee.add(foot)
    body.add(hipJ)
  })
  // THE UPPER BODY, leaned from the hip: jersey, belt, pads with shoulder caps, neck, helmet (stripe, ear holes, a real
  // facemask: two bars and a centre post), arms (sleeve, elbow, dark forearm sleeve, glove)
  const upper = new THREE.Group(); upper.position.y = P.hip; upper.rotation.z = -P.lean; body.add(upper)
  const t = shadowy(at(new THREE.Mesh(g0.torso, jm), 0, 1.12, 0)); upper.add(t)
  const belt = at(new THREE.Mesh(g0.belt, dm), 0, 0.2, 0); belt.rotation.x = Math.PI / 2; upper.add(belt)
  upper.add(shadowy(at(new THREE.Mesh(g0.pads, jm), 0, 2.0, 0)))
  for (const s of [-1, 1]) upper.add(shadowy(at(new THREE.Mesh(g0.padCap, jm), 0, 2.12, s * 1.05)))
  upper.add(at(new THREE.Mesh(g0.neck, dm), 0.05, 2.45, 0))
  const head = new THREE.Group(); head.position.set(0.08, 3.15, 0); head.rotation.z = P.lean * 0.55; upper.add(head)   // he looks up the field
  head.add(shadowy(new THREE.Mesh(g0.helmet, hm)))
  const hs = new THREE.Mesh(g0.helmetStripe, stm); hs.rotation.set(Math.PI / 2, 0, Math.PI / 2); head.add(hs)
  for (const s of [-1, 1]) { const e = at(new THREE.Mesh(g0.ear, dm), 0, -0.05, s * 0.955); e.rotation.y = s > 0 ? 0 : Math.PI; head.add(e) }
  for (const y of [-0.12, -0.42]) { const bar = at(new THREE.Mesh(g0.bar, mm), 0.9, y, 0); bar.rotation.x = Math.PI / 2; head.add(bar) }
  head.add(at(new THREE.Mesh(g0.post, mm), 0.95, -0.27, 0))
  for (const s of [-1, 1]) { const side = at(new THREE.Mesh(g0.post, mm), 0.72, -0.27, s * 0.6); side.rotation.x = s * 0.5; head.add(side) }
  P.arms.forEach((a, i) => {
    const s = i ? -1 : 1, sh = new THREE.Group(); sh.position.set(0, 1.92, s * 1.3); sh.rotation.set(s * P.spread, 0, a)
    sh.add(shadowy(at(new THREE.Mesh(g0.upperArm, jm), 0, -0.55, 0)))
    const el = new THREE.Group(); el.position.y = -1.1; el.rotation.z = P.elbows?.[i] ?? 0.4; sh.add(el)
    el.add(shadowy(at(new THREE.Mesh(g0.forearm, dm), 0, -0.5, 0)))
    el.add(shadowy(at(new THREE.Mesh(g0.glove, sm), 0, -1.05, 0)))
    upper.add(sh)
  })
  if (num != null) {
    const tex = numTex(num, numInk || helmet, jersey)
    for (const [x, ry] of [[-1.0, -Math.PI / 2], [1.0, Math.PI / 2]]) { const n = new THREE.Mesh(g0.number, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })); n.position.set(x, 0.1, 0); n.rotation.y = ry; t.add(n) }
  }
  fig.add(body); fig.userData.body = body
  fig.scale.setScalar(1.12)
  return fig
}

/** The pose for a role in a formation (the carrier runs, the passer throws). */
export const poseFor = (role) => ({ C: 'stance3', G: 'stance3', T: 'stance3', TE: 'stance3', DL: 'stance3', DE: 'stance3',
  CB: 'backpedal', S: 'backpedal', K: 'kick', QB: 'qb' }[role] || 'ready')

// [role, back (yd behind the line), across (yd, + = the offence's right)]
export const FORMATION = {
  // (2026-10-23: the line spaced 2.2 yd so no two bases touch, and the two lines 2.4 yd apart nose to nose, so the men
  // in a three-point stance lean in without their helmets passing through each other)
  offense: [['C', 1.1, 0], ['G', 1.1, -2.2], ['G', 1.1, 2.2], ['T', 1.2, -4.4], ['T', 1.2, 4.4], ['TE', 1.4, 6.6],
    ['WR', 1.0, -21], ['WR', 1.0, 20], ['SL', 1.6, 13], ['QB', 5.5, 0], ['RB', 5.5, 2.3]],
  defense: [['DL', 1.3, -1.1], ['DL', 1.3, 1.1], ['DE', 1.3, -5.5], ['DE', 1.3, 5.5], ['LB', 5.2, 0], ['LB', 4.8, -3.6], ['LB', 4.8, 3.6],
    ['CB', 7, -20.5], ['CB', 7, 19.5], ['S', 12, -8], ['S', 13, 8]],
  // kicks: the kicking side spread across its own line, the receivers in a front line and the returner deep
  kick: [...[-24, -19, -14, -9, -4, 0, 4, 9, 14, 19, 24].map((z, i) => [i === 5 ? 'K' : 'KC', i === 5 ? 3 : 0.5, z])],
  receive: [...[-20, -12, -4, 4, 12, 20].map((z) => ['FL', 12, z]), ...[-14, -5, 5, 14].map((z) => ['ML', 22, z]), ['KR', 40, 0]],
}

/** The man for a pass by its side of the field: the left wide out, the right one, or the slot / tight end. */
export const targetRole = (lane) => (lane === 'L' ? 0 : lane === 'R' ? 1 : 2)
