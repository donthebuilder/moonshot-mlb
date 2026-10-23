// 🏈 THE FIGURES (2026-10-23, TUDDY's electric board; v2 the same day: die-cut printed pieces, lib/tabletop/diecut.js).
// Small men on bases, our original in the style of the vibrating-football toy: each club's jersey colours so a fan spots
// his team at a glance, every base in the product's own colour (Donovan: "best for recognition and brand growth"). Only
// the man the play is about wears his real number; the rest are blank, because where they stand is drawn (a real
// formation, not tracking).
//
// FORMATIONS: in yards from the line of scrimmage, `back` behind it for the offence (positive), in front for the
// defence; `across` toward the offence's right. The 22 drift and shiver while a play runs (the buzz).
import * as THREE from 'three'
import { wornMaterial } from './wear'
import { diecutPair } from './diecut'
import { FOOTBALL_POSES } from './poses'
import { TABLETOP, PRINT } from '../nfl/theme'

const geo = {}
const baseGeo = () => {
  if (geo.base) return geo.base
  const shape = new THREE.Shape(); const w = 2.3, d = 1.55, r = 0.75
  shape.moveTo(-w + r, -d); shape.lineTo(w - r, -d); shape.quadraticCurveTo(w, -d, w, -d + r); shape.lineTo(w, d - r); shape.quadraticCurveTo(w, d, w - r, d)
  shape.lineTo(-w + r, d); shape.quadraticCurveTo(-w, d, -w, d - r); shape.lineTo(-w, -d + r); shape.quadraticCurveTo(-w, -d, -w + r, -d)
  geo.base = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.14, bevelSegments: 3 }); geo.base.rotateX(-Math.PI / 2)
  return geo.base
}
let edgeMat = null
export const POSE_NAMES = Object.keys(FOOTBALL_POSES)

/** One man (2026-10-23 v2, Donovan: "make them better and actually look like football players"): a die-cut piece drawn
 *  in profile (lib/tabletop/poses.js: stance3 / ready / run / qb / backpedal / kick) in his club's colours -- helmet with
 *  its stripe and facemask, pads under the jersey, his number, pants with the stripe, socks, cleats -- standing on the
 *  electric board's base. jersey / pants / helmet / mask / sock / dark / stripe / numInk: colours; accent: the base;
 *  num: a number or null; variant: which wear (0..3). Faces +x; turned round (his back face) he faces -x.
 *  userData.body is what shivers. */
export function makeFigure({ jersey, pants, helmet, accent, mask, numInk = null, num = null, pose = 'ready', arm = null, stripe = null, sock = null, dark = null, variant = 0 }) {
  const fig = new THREE.Group(), body = new THREE.Group()
  const v = variant & 3
  const base = new THREE.Mesh(baseGeo(), wornMaterial(accent, 'base', v, { roughness: 0.3 })); base.position.y = 0.14; base.castShadow = true; base.receiveShadow = true; fig.add(base)
  edgeMat ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(TABLETOP.tin), metalness: 0.7, roughness: 0.35 })
  const kit = { jersey, pants: pants || jersey, helmet, mask: mask || PRINT.steel, trim: stripe || mask || PRINT.cream, sock: sock || jersey, dark: dark || PRINT.dark, numInk: numInk || PRINT.cream }
  const P = FOOTBALL_POSES[arm === 'throw' ? 'qb' : pose] || FOOTBALL_POSES.ready
  const piece = diecutPair({ pose: P, kit, num, variant: v, T: PRINT, edge: edgeMat })
  piece.position.y = 0.78; body.add(piece)
  fig.add(body); fig.userData.body = body; fig.userData.piece = piece
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
