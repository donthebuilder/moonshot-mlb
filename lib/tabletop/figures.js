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

/** One figure. jersey / pants / helmet / mask: colours; accent: the base; num: a number or null (numInk its paint);
 *  lean: forward tilt; arm: 'down' or 'throw'. Faces +x. */
export function makeFigure({ jersey, pants, helmet, accent, mask, numInk = null, num = null, lean = 0.12, arm = 'down' }) {
  const g0 = G(), fig = new THREE.Group(), body = new THREE.Group()
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m }
  const base = shadowy(new THREE.Mesh(g0.base, paint(accent, { roughness: 0.25 }))); base.position.y = 0.15; fig.add(base)
  const pm = paint(pants), jm = paint(jersey), hm = paint(helmet, { roughness: 0.22 })
  for (const s of [-1, 1]) { const l = shadowy(new THREE.Mesh(g0.leg, pm)); l.position.set(s * 0.25, 2.0, s * 0.55); l.rotation.z = s * 0.12; body.add(l) }
  const t = shadowy(new THREE.Mesh(g0.torso, jm)); t.position.y = 4.35; body.add(t)
  const p = shadowy(new THREE.Mesh(g0.pads, jm)); p.position.y = 5.3; body.add(p)
  for (const s of [-1, 1]) {
    const a = shadowy(new THREE.Mesh(g0.arm, jm)); a.position.set(0.25, 3.85, s * 1.35); a.rotation.x = s * 0.12
    if (arm === 'throw' && s < 0) { a.position.set(-0.3, 6.0, -1.3); a.rotation.set(0.3, 0, 2.6) }
    body.add(a)
  }
  const h = shadowy(new THREE.Mesh(g0.helmet, hm)); h.position.y = 6.55; body.add(h)
  const m = new THREE.Mesh(g0.mask, paint(mask, { metalness: 0.4 })); m.position.set(0.72, 6.35, 0); m.rotation.set(0, Math.PI / 2, -Math.PI / 2); body.add(m)
  if (num != null) {
    const tex = numTex(num, numInk || helmet, jersey)
    for (const [x, ry] of [[-1.02, -Math.PI / 2], [1.02, Math.PI / 2]]) { const n = new THREE.Mesh(g0.number, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, transparent: false })); n.position.set(x, 4.4, 0); n.rotation.y = ry; body.add(n) }
  }
  body.rotation.z = -lean
  fig.add(body); fig.userData.body = body
  fig.scale.setScalar(1.25)
  return fig
}

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
