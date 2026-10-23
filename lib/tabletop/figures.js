// 🏈 THE FIGURES (2026-10-23, TUDDY's electric board). Small painted men on bases, our original in the style of the
// vibrating-football toy: each club's jersey colours so a fan spots his team at a glance, every base in the product's
// own colour (Donovan: "best for recognition and brand growth"). Painted plastic: a soft sheen, no textures but the
// number on the back. Only the man the play is about wears his real number; the rest are blank, because where they
// stand is drawn (a real formation, not tracking).
//
// FORMATIONS: in yards from the line of scrimmage, `back` behind it for the offence (positive), in front for the
// defence; `across` toward the offence's right. The 22 drift and shiver while a play runs (the buzz).
import * as THREE from 'three'

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
  const shape = new THREE.Shape(); const w = 2.6, d = 1.7, r = 0.8
  shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r); shape.lineTo(w, d - r); shape.quadraticCurveTo(w, d, w - r, d)
  shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d)
  geo.base = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 }); geo.base.rotateX(-Math.PI / 2)
  geo.leg = new THREE.CapsuleGeometry(0.42, 2.0, 4, 10)
  geo.torso = new THREE.CapsuleGeometry(1.0, 1.3, 6, 14)
  geo.pads = new THREE.SphereGeometry(1.25, 16, 10); geo.pads.scale(1.25, 0.55, 0.85)
  geo.arm = new THREE.CapsuleGeometry(0.34, 1.5, 4, 8)
  geo.helmet = new THREE.SphereGeometry(0.95, 20, 14)
  geo.mask = new THREE.TorusGeometry(0.72, 0.09, 6, 16, Math.PI)
  geo.number = new THREE.PlaneGeometry(1.3, 1.3)
  return geo
}
const paint = (color, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.38, metalness: 0.05, ...extra })

// THE POSES (2026-10-23, Donovan: "real toy poses"): molded like the toy's figures, one piece a limb. Each pose sets the
// hip height, the upper body's lean forward, each leg's swing (+ = foot forward) and each arm's swing (+ = forward,
// measured from the upper body), and how far the arms spread out to the sides.
const POSES = {
  stance3: { hip: 2.4, lean: 1.15, legs: [0.35, -0.45], arms: [1.15, 0.55], spread: 0 },       // lineman: one hand down, back flat
  ready: { hip: 3.2, lean: 0.35, legs: [0.2, -0.2], arms: [0.65, 0.55], spread: 0.15 },         // two-point: receivers, backers
  run: { hip: 3.1, lean: 0.45, legs: [0.85, -0.7], arms: [1.05, -0.35], spread: 0.1 },          // the man with the ball, mid-stride
  qb: { hip: 3.3, lean: 0.08, legs: [0.18, -0.15], arms: [1.3, -2.6], spread: 0.1 },            // the passer: ball cocked by his ear
  backpedal: { hip: 2.9, lean: 0.28, legs: [0.32, -0.12], arms: [0.45, 0.45], spread: 0.55 },   // the DB: low, arms out, weight back
  kick: { hip: 3.3, lean: -0.12, legs: [1.35, -0.2], arms: [-0.6, 0.9], spread: 0.45 },          // the kicker's leg through the ball
}
export const POSE_NAMES = Object.keys(POSES)

/** One figure. jersey / pants / helmet / mask: colours; accent: the base; num: a number or null (numInk its paint);
 *  pose: one of POSES. Faces +x. userData.body is what shivers. */
export function makeFigure({ jersey, pants, helmet, accent, mask, numInk = null, num = null, pose = 'ready', arm = null }) {
  const P = POSES[arm === 'throw' ? 'qb' : pose] || POSES.ready
  const g0 = G(), fig = new THREE.Group(), body = new THREE.Group()
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m }
  const base = shadowy(new THREE.Mesh(g0.base, paint(accent, { roughness: 0.25 }))); base.position.y = 0.15; fig.add(base)
  const pm = paint(pants), jm = paint(jersey), hm = paint(helmet, { roughness: 0.22 })
  // the legs: one piece each, swung from the hip
  P.legs.forEach((swing, i) => {
    const s = i ? -1 : 1, hipJ = new THREE.Group(); hipJ.position.set(0, P.hip, s * 0.55); hipJ.rotation.z = swing
    const l = shadowy(new THREE.Mesh(g0.leg, pm)); l.position.y = -1.42; hipJ.add(l); body.add(hipJ)
  })
  // the upper body: torso, pads, helmet, mask, arms -- leaned forward from the hip
  const upper = new THREE.Group(); upper.position.y = P.hip; upper.rotation.z = -P.lean; body.add(upper)
  const t = shadowy(new THREE.Mesh(g0.torso, jm)); t.position.y = 1.15; upper.add(t)
  upper.add(shadowy(Object.assign(new THREE.Mesh(g0.pads, jm), { position: new THREE.Vector3(0, 2.05, 0) })))
  upper.add(shadowy(Object.assign(new THREE.Mesh(g0.helmet, hm), { position: new THREE.Vector3(0.05, 3.2, 0) })))
  const m = new THREE.Mesh(g0.mask, paint(mask, { metalness: 0.4 })); m.position.set(0.77, 3.0, 0); m.rotation.set(0, Math.PI / 2, -Math.PI / 2); upper.add(m)
  P.arms.forEach((swing, i) => {
    const s = i ? -1 : 1, sh = new THREE.Group(); sh.position.set(0, 1.95, s * 1.35); sh.rotation.set(s * P.spread, 0, swing)
    const a = shadowy(new THREE.Mesh(g0.arm, jm)); a.position.y = -1.05; sh.add(a); upper.add(sh)
  })
  if (num != null) {
    const tex = numTex(num, numInk || helmet, jersey)
    for (const [x, ry] of [[-1.02, -Math.PI / 2], [1.02, Math.PI / 2]]) { const n = new THREE.Mesh(g0.number, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })); n.position.set(x, 0.05, 0); n.rotation.y = ry; t.add(n) }
  }
  fig.add(body); fig.userData.body = body
  fig.scale.setScalar(1.25)
  return fig
}

/** The pose for a role in a formation (the carrier runs, the passer throws). */
export const poseFor = (role) => ({ C: 'stance3', G: 'stance3', T: 'stance3', TE: 'stance3', DL: 'stance3', DE: 'stance3',
  CB: 'backpedal', S: 'backpedal', K: 'kick', QB: 'qb' }[role] || 'ready')

// [role, back (yd behind the line), across (yd, + = the offence's right)]
export const FORMATION = {
  offense: [['C', 0.6, 0], ['G', 0.6, -1.5], ['G', 0.6, 1.5], ['T', 0.7, -3], ['T', 0.7, 3], ['TE', 0.9, 4.6],
    ['WR', 0.8, -21], ['WR', 0.8, 20], ['SL', 1.2, 13], ['QB', 5, 0], ['RB', 5, 2]],
  defense: [['DL', 0.9, -1], ['DL', 0.9, 1], ['DE', 0.9, -4], ['DE', 0.9, 4.2], ['LB', 5, 0], ['LB', 4.5, -5], ['LB', 4.5, 5],
    ['CB', 7, -20.5], ['CB', 7, 19.5], ['S', 12, -8], ['S', 13, 8]],
  // kicks: the kicking side spread across its own line, the receivers in a front line and the returner deep
  kick: [...[-24, -19, -14, -9, -4, 0, 4, 9, 14, 19, 24].map((z, i) => [i === 5 ? 'K' : 'KC', i === 5 ? 3 : 0.5, z])],
  receive: [...[-20, -12, -4, 4, 12, 20].map((z) => ['FL', 12, z]), ...[-14, -5, 5, 14].map((z) => ['ML', 22, z]), ['KR', 40, 0]],
}

/** The man for a pass by its side of the field: the left wide out, the right one, or the slot / tight end. */
export const targetRole = (lane) => (lane === 'L' ? 0 : lane === 'R' ? 1 : 2)
