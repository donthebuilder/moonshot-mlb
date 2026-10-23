// ⚾ THE DASH BALLPARK (2026-10-22, PREPLAY on MOONSHOT). The rink's tracking look (lib/rinkWorld.js buildTrackingRink /
// buildDashBowl) carried to a ballpark: a dark turf field with soft mow lanes, chalk lines, the infield dirt, a low dark
// wall shaped by the park's real published distances and heights (lib/parkWalls.js) with a thin lit cap and its five
// numbers, yellow foul poles, the DASH mark in shallow centre, and a smooth bowl of dark tiers with a ribbon board.
// Unlit (MeshBasic) and cheap: no shadows, no crowd, no building props. The field frame is lib/stadiumWorld.js's:
// home plate at the origin, centre field up +z, the right-field line on -x.
import * as THREE from 'three'
import { numberSprite } from './three/sprites'

const DEG = Math.PI / 180
/** (feet from the plate, degrees off centre; + = right-field side) -> world, at height h. */
export const parkPoint = (r, ang, h = 0) => new THREE.Vector3(-r * Math.sin(ang * DEG), h, r * Math.cos(ang * DEG))
/** The five published wall anchors (LF, LC, CF, RC, RF), interpolated across fair ground (lib/stadiumWorld.js lerp5). */
export const wallLerp = (arr, ang) => {
  const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
  const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
  return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
}
// the bases, in feet (the frame above): home, first, second, third
export const BASES = [parkPoint(0, 0), parkPoint(90, 45), parkPoint(127.28, 0), parkPoint(90, -45)]
export const MOUND = parkPoint(60.5, 0)

const flatMesh = (geo, color, opacity = 1, y = 0) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1 }))
  m.rotation.x = -Math.PI / 2; m.position.y = y
  return m
}
// a 2D shape in the field frame: Shape space (x, y) = world (x, -z) once laid flat (rotation.x = -90°)
const shapeOf = (pts) => { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(p.x, -p.z) : s.moveTo(p.x, -p.z))); s.closePath(); return s }

function turfTexture(turf, lane) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256
  const g = cv.getContext('2d')
  g.fillStyle = `#${new THREE.Color(turf).getHexString()}`; g.fillRect(0, 0, 256, 256)
  // two mow lanes per tile, one a shade lighter, and a fine grain
  g.fillStyle = `#${new THREE.Color(lane).getHexString()}`; g.globalAlpha = 0.035; g.fillRect(0, 0, 128, 256)
  g.globalAlpha = 0.04
  for (let i = 0; i < 1800; i += 1) { g.fillStyle = Math.random() > 0.5 ? '#000' : `#${new THREE.Color(lane).getHexString()}`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Build the park into `scene`.
 *   dims / heights  the park's five wall distances and heights (lib/parkWalls.js)
 *   turf, dirt, line, pole, floor  colours (the caller passes its theme's tokens)
 *   mark            an image for the DASH mark in shallow centre
 *   ribbon          the words on the ribbon board; accent its colour
 *   posted          the park's posted numbers (lib/parkWalls.js PARK_POSTED): painted above the wall; its backstop and
 *                   the height of the home-run line on a tall pad
 *   panels          [{ text, color }]: the panels along the wall (our products, in their own accents)
 * Returns { wallAt(ang), group, seatPoint(ang, off), scoreboard: { canvas, texture } | null, ONDECK / DUGOUT: { first, third } }.
 */
export function buildTrackingPark(scene, { dims, heights, turf, dirt, line, pole, floor, mark = null, ribbon = 'DASH NETWORK', accent, posted = null, panels = [] }) {
  const group = new THREE.Group(); scene.add(group)
  const wallAt = (ang) => wallLerp(dims, ang)
  const hAt = (ang) => wallLerp(heights, ang)
  // the ground the park sits on
  group.add(flatMesh(new THREE.CircleGeometry(1400, 64), floor, 1, -0.2))

  // the playing field: fair ground to the wall, foul ground out to the stands' front edge (THE OUTLINE below)
  const FOUL = 42    // feet of foul ground off each line
  const outline = []
  for (let a = -45; a <= 45; a += 1) outline.push(parkPoint(wallAt(a) + 2, a))
  // RF pole -> back down the line, FOUL ft into foul ground -> round behind the plate -> up the LF line
  // a point on a foul line, moved FOUL ft straight out into foul ground (side +1 = the right-field line)
  const off = (r, side) => parkPoint(r, 45 * side).add(new THREE.Vector3(-side, 0, -1).normalize().multiplyScalar(FOUL))
  outline.push(off(wallAt(45) * 0.98, 1), off(40, 1))
  // behind the plate, at the park's own backstop distance
  const BACKSTOP = posted?.backstop || 60
  for (let a = 135; a <= 225; a += 5) outline.push(parkPoint(BACKSTOP, a))
  outline.push(off(40, -1), off(wallAt(-45) * 0.98, -1))
  const turfTex = turfTexture(turf, line)
  const field = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(outline), 64), new THREE.MeshBasicMaterial({ color: 0xffffff, map: turfTex }))
  if (turfTex) { turfTex.repeat.set(1 / 32, 1 / 32); turfTex.rotation = Math.PI / 4 }
  // the planar UVs from the shape's own x/y keep the mow lanes the same width everywhere
  {
    const p = field.geometry.getAttribute('position'), uv = []
    for (let i = 0; i < p.count; i += 1) uv.push(p.getX(i), p.getY(i))
    field.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  }
  field.rotation.x = -Math.PI / 2; group.add(field)

  // the warning track: 15 ft of dirt inside the wall
  {
    const pts = []
    for (let a = -45; a <= 45; a += 1) pts.push(parkPoint(wallAt(a), a))
    for (let a = 45; a >= -45; a -= 1) pts.push(parkPoint(wallAt(a) - 15, a))
    group.add(flatMesh(new THREE.ShapeGeometry(shapeOf(pts), 2), dirt, 0.9, 0.03))
  }
  // the infield dirt: the arc 95 ft round the rubber, between the lines, then the grass square inside the bases
  {
    const pts = [parkPoint(0, 0)]
    for (let a = -47; a <= 47; a += 1) {
      // where the line from the plate at angle a meets the circle of 95 ft round the mound (60.5 ft out)
      const c = Math.cos(a * DEG), r = 60.5 * c + Math.sqrt(95 * 95 - (60.5 * Math.sin(a * DEG)) ** 2)
      pts.push(parkPoint(r, a))
    }
    group.add(flatMesh(new THREE.ShapeGeometry(shapeOf(pts), 48), dirt, 1, 0.05))
    const inset = 9   // the base paths stay dirt
    const sq = [parkPoint(inset * 1.6, 0), parkPoint(90 - inset, 45).add(new THREE.Vector3(inset * 0.5, 0, 0)), parkPoint(127.28 - inset * 1.4, 0), parkPoint(90 - inset, -45).add(new THREE.Vector3(-inset * 0.5, 0, 0))]
    const grass = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(sq)), new THREE.MeshBasicMaterial({ color: 0xffffff, map: turfTex }))
    { const p = grass.geometry.getAttribute('position'), uv = []; for (let i = 0; i < p.count; i += 1) uv.push(p.getX(i), p.getY(i)); grass.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)) }
    grass.rotation.x = -Math.PI / 2; grass.position.y = 0.07; group.add(grass)
    // the plate's circle and the mound
    const home = flatMesh(new THREE.CircleGeometry(13, 40), dirt, 1, 0.09); group.add(home)
    const mound = flatMesh(new THREE.CircleGeometry(9, 40), dirt, 1, 0.09); mound.position.x = MOUND.x; mound.position.z = MOUND.z; group.add(mound)
  }
  // the chalk: foul lines to the wall, the boxes, the plate, the bases, the rubber
  const chalk = new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.7 })
  const seg = (a, b, y = 0.12) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().setY(y), b.clone().setY(y)]), chalk))
  seg(parkPoint(0, 0), parkPoint(wallAt(45), 45)); seg(parkPoint(0, 0), parkPoint(wallAt(-45), -45))
  for (const sx of [-1, 1]) {
    const x0 = sx * 2.4, x1 = sx * 6.4
    const box = [new THREE.Vector3(x0, 0, -3), new THREE.Vector3(x1, 0, -3), new THREE.Vector3(x1, 0, 3), new THREE.Vector3(x0, 0, 3), new THREE.Vector3(x0, 0, -3)]
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(box.map((v) => v.setY(0.12))), chalk))
  }
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(line) })
  BASES.slice(1).forEach((b) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), white); m.position.set(b.x, 0.3, b.z); m.rotation.y = Math.PI / 4; group.add(m) })
  {
    const s = new THREE.Shape(); s.moveTo(-1.4, 0); s.lineTo(1.4, 0); s.lineTo(1.4, -1.4); s.lineTo(0, -2.6); s.lineTo(-1.4, -1.4); s.closePath()
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), white); m.rotation.x = -Math.PI / 2; m.position.y = 0.13; group.add(m)
    const rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 0.5), white); rub.position.set(MOUND.x, 0.6, MOUND.z); group.add(rub)
  }
  // the DASH mark, low in shallow centre (like centre ice)
  if (mark && typeof document !== 'undefined') {
    const tex = new THREE.TextureLoader().load(mark); tex.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.position.copy(parkPoint(232, 0, 0.15)); group.add(m)
  }

  // THE WALL (v2, 2026-10-22, Donovan: "make the walls better ... still our world"): its measured distance and height at
  // every degree, with a real thickness. The face is the padding: dark, with our products' panels in their own accents
  // and faint seams. A yellow line runs the top (all yellow lines are in play), and where the pad stands taller than the
  // park's line height (American Family Field's left-field corner), a second yellow line marks home run above it. The
  // posted numbers ride above the wall, where the press box can read them.
  {
    const A = []; for (let a = -45; a <= 45; a += 0.5) A.push(a)
    const lens = [0]
    for (let i = 1; i < A.length; i += 1) lens.push(lens[i - 1] + parkPoint(wallAt(A[i]), A[i]).distanceTo(parkPoint(wallAt(A[i - 1]), A[i - 1])))
    const L = lens[lens.length - 1]
    const FACE_FT = 16    // the face texture covers 16 ft of height; an 8 ft wall shows its lower half
    let faceTex = null
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 128
      const g = cv.getContext('2d')
      const pad = new THREE.Color(floor).multiplyScalar(2.1)
      g.fillStyle = `#${pad.getHexString()}`; g.fillRect(0, 0, cv.width, cv.height)
      const pxFt = cv.width / L, y8 = cv.height / 2   // the canvas's lower half is the wall's first 8 ft
      // the panels: our products, in turn, between the seams
      const PANEL = 36
      let k = 0
      for (let x = 10; x + PANEL < L - 10; x += PANEL + 6, k += 1) {
        if (!panels.length) break
        const pn = panels[k % panels.length]
        g.fillStyle = `#${new THREE.Color(pad).multiplyScalar(0.72).getHexString()}`; g.fillRect(x * pxFt, y8 + 10, PANEL * pxFt, y8 - 22)
        g.fillStyle = pn.color; g.globalAlpha = 0.9
        g.font = `900 ${Math.round(y8 * 0.42)}px SF Mono, Menlo, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(pn.text, (x + PANEL / 2) * pxFt, y8 + y8 / 2 - 2, PANEL * pxFt - 8)
        g.globalAlpha = 1
      }
      // the seams between the pads
      g.fillStyle = `#${new THREE.Color(pad).multiplyScalar(0.55).getHexString()}`
      for (let x = 0; x < L; x += 6) g.fillRect(x * pxFt, 0, 1, cv.height)
      faceTex = new THREE.CanvasTexture(cv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4
    }
    const pos = [], uv = [], idx = [], top = [], tidx = []
    A.forEach((a, i) => {
      const p = parkPoint(wallAt(a), a), q = parkPoint(wallAt(a) + 2.2, a), h = hAt(a)
      pos.push(p.x, 0, p.z, p.x, h, p.z); uv.push(lens[i] / L, 0, lens[i] / L, Math.min(1, h / FACE_FT))
      top.push(p.x, h, p.z, q.x, h, q.z)
      if (i < A.length - 1) { const k2 = i * 2; idx.push(k2, k2 + 2, k2 + 1, k2 + 1, k2 + 2, k2 + 3); tidx.push(k2, k2 + 2, k2 + 1, k2 + 1, k2 + 2, k2 + 3) }
    })
    const face = new THREE.BufferGeometry(); face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); face.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); face.setIndex(idx)
    group.add(new THREE.Mesh(face, faceTex ? new THREE.MeshBasicMaterial({ map: faceTex, side: THREE.DoubleSide }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(2), side: THREE.DoubleSide })))
    const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); cap.setIndex(tidx)
    group.add(new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(1.3), side: THREE.DoubleSide })))
    // the yellow lines: a band along the top, and the home-run line on a pad taller than the park's line height
    const band = (yOf, w) => {
      const bp = [], bi = []
      A.forEach((a, i) => { const p = parkPoint(wallAt(a) - 0.12, a), y = yOf(a); bp.push(p.x, y - w, p.z, p.x, y, p.z); if (i < A.length - 1) { const k2 = i * 2; bi.push(k2, k2 + 2, k2 + 1, k2 + 1, k2 + 2, k2 + 3) } })
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); geo.setIndex(bi)
      group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(pole), side: THREE.DoubleSide })))
    }
    band((a) => hAt(a), 0.7)
    const lineH = posted?.line || 0
    if (lineH && heights.some((h) => h > lineH + 1)) band((a) => (hAt(a) > lineH + 1 ? lineH + 0.35 : -5), 0.7)
    const foot = []; for (const a of A) foot.push(parkPoint(wallAt(a) - 0.4, a, 0.2))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(foot), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.25 })))
    if (typeof document !== 'undefined') {
      const nums = posted?.d || dims.map((d) => Math.round(d))
      ;[-45, -22.5, 0, 22.5, 45].forEach((a, i) => {
        const sp = numberSprite(String(nums[i]))
        sp.scale.multiplyScalar(0.62); sp.position.copy(parkPoint(wallAt(a) - 1, a, hAt(a) + 6.5)); group.add(sp)
      })
    }
  }
  // the foul poles, each with its screen
  for (const a of [-45, 45]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 74, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(pole) }))
    m.position.copy(parkPoint(wallAt(a) + 0.5, a, 37)); group.add(m)
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 58), new THREE.MeshBasicMaterial({ color: new THREE.Color(pole), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }))
    const side = Math.sign(a)
    fin.position.copy(parkPoint(wallAt(a) + 0.5, a, 44)).add(new THREE.Vector3(side * 1.9, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0))
    fin.rotation.y = -a * DEG; group.add(fin)
  }

  // THE GAME'S FURNITURE, where a real field has it: the dugouts in foul ground (dark, recessed, a lit rail), the
  // on-deck circles, the base coaches' boxes and the running lane up the first-base line
  const ONDECK = {}, DUGOUT = {}
  {
    const dark = new THREE.Color(floor).multiplyScalar(0.55)
    for (const side of [1, -1]) {   // +1 = the first-base side
      const along = (r, outward) => parkPoint(r, 45 * side).add(new THREE.Vector3(-side, 0, -1).normalize().multiplyScalar(outward))
      // the dugout: 70 ft along the line, starting 45 ft from the plate, set into the front of the stands
      const d0 = along(45, FOUL - 9), d1 = along(115, FOUL - 9), d2 = along(115, FOUL - 1), d3 = along(45, FOUL - 1)
      group.add(flatMesh(new THREE.ShapeGeometry(shapeOf([d0, d1, d2, d3])), dark, 1, 0.1))
      const rail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([d0.clone().setY(3.2), d1.clone().setY(3.2)]), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.5 }))
      group.add(rail)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(1.4) }))
      roof.position.copy(along(80, FOUL - 5).setY(3.6)); roof.rotation.y = side > 0 ? -45 * DEG : 45 * DEG; group.add(roof)
      // the on-deck circle (5 ft across), between the plate and the dugout
      const od = along(30, 22)
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2; ring.position.copy(od).setY(0.12); group.add(ring)
      ONDECK[side > 0 ? 'first' : 'third'] = od
      DUGOUT[side > 0 ? 'first' : 'third'] = along(80, FOUL - 5)
      // the coach's box: 20 x 10 ft, 15 ft off the line, centred a little short of the bag
      const c0 = along(70, 15), c1 = along(90, 15), c2 = along(90, 25), c3 = along(70, 25)
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([c0, c1, c2, c3, c0].map((v) => v.clone().setY(0.12))), chalk))
    }
    // the running lane: the last 45 ft to first, 3 ft outside the line
    const lane = (r) => parkPoint(r, 45).add(new THREE.Vector3(-1, 0, -1).normalize().multiplyScalar(3))
    seg(lane(45), lane(90))
  }

  // THE SCOREBOARD: above the centre-field wall, the way the park has its own (the caller paints it: the line score)
  let scoreboard = null
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 360
    const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4
    // just behind the centre-field wall and low, so the press-box camera has it in frame above the 400
    const W = 168, H = W * cv.height / cv.width
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide }))
    const at = parkPoint(wallAt(0) + 18, 0, 20 + H / 2)
    board.position.copy(at); board.rotation.y = Math.PI   // faces the plate
    group.add(board)
    const frameM = new THREE.Mesh(new THREE.BoxGeometry(W + 4, H + 4, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(0.7) }))
    frameM.position.copy(at).add(new THREE.Vector3(0, 0, 1.4)); group.add(frameM)
    const legs = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 20, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(0.7) }))
    legs.position.copy(parkPoint(wallAt(0) + 20, 0, 10)); group.add(legs)
    scoreboard = { canvas: cv, texture }
  }
  // a point on the first tier's seats, `off` ft behind the wall at angle `ang` (where a homer lands, the crowd is)
  const seatPoint = (ang, off) => parkPoint(wallAt(ang) + 8 + off, ang, 12 + Math.max(0, off - 2) * (28 / 64) + 1.5)

  // THE BOWL: three smooth dark tiers rising away from the field's outline, faint seat rows, a lit rail on each front,
  // and the ribbon board on the face between the first and second tiers
  {
    // outward normals of the outline (it runs LF wall -> CF -> RF wall -> behind the plate -> back), averaged per vertex
    const n = outline.length
    const normals = outline.map((p, i) => {
      const a = outline[(i - 1 + n) % n], b = outline[(i + 1) % n]
      const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize()
      // the field is on the left of travel LF -> CF -> RF seen from above (+y), so outward = travel x up
      return new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(-1)
    })
    // make sure they point AWAY from the middle of the field
    const mid = parkPoint(180, 0)
    normals.forEach((v, i) => { if (v.dot(new THREE.Vector3().subVectors(outline[i], mid)) < 0) v.multiplyScalar(-1) })
    const ringAt = (d, y) => outline.map((p, i) => p.clone().addScaledVector(normals[i], d).setY(y))
    const rowsTex = (() => {
      if (typeof document === 'undefined') return null
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256
      const g = cv.getContext('2d'); g.fillStyle = `#${new THREE.Color(floor).multiplyScalar(1.5).getHexString()}`; g.fillRect(0, 0, 64, 256)
      g.fillStyle = `#${new THREE.Color(line).getHexString()}`; for (let y = 0; y < 256; y += 16) { g.globalAlpha = 0.08; g.fillRect(0, y, 64, 2) }
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(160, 1); t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const loft = (a, b) => {
      const pos = [], uv = [], idx = []
      for (let i = 0; i <= n; i += 1) {
        const p = a[i % n], q = b[i % n]
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z); uv.push(i / n, 0, i / n, 1)
        if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx)
      return geo
    }
    const tiers = [[6, 12, 70, 40], [74, 52, 132, 82], [136, 92, 186, 120]]   // [inner offset, inner height, outer offset, outer height], feet
    tiers.forEach(([o0, h0, o1, h1], k) => {
      const m = new THREE.Mesh(loft(ringAt(o0, h0), ringAt(o1, h1)), new THREE.MeshBasicMaterial({ color: 0xffffff, map: rowsTex, side: THREE.DoubleSide }))
      m.material.color.setScalar(0.8 - k * 0.17); group.add(m)
      const rail = ringAt(o0, h0 + 0.1); rail.push(rail[0])
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rail), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.16 })))
      // the face below each tier's front, down to the tier before it
      const below = k === 0 ? 0 : tiers[k - 1][3]
      const face = new THREE.Mesh(loft(ringAt(o0, below), ringAt(o0, h0)), new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(0.9), side: THREE.DoubleSide }))
      group.add(face)
    })
    // the ribbon board on the second tier's face
    if (typeof document !== 'undefined') {
      // one tile = the words once and a gap, so a repeat never cuts a word in half
      const font = '900 46px SF Mono, Menlo, monospace'
      const probe = document.createElement('canvas').getContext('2d'); probe.font = font
      const words = `${ribbon}  ·  `
      const cv = document.createElement('canvas'); cv.width = Math.ceil(probe.measureText(words).width) + 40; cv.height = 64
      const g = cv.getContext('2d'); g.fillStyle = `#${new THREE.Color(floor).multiplyScalar(0.6).getHexString()}`; g.fillRect(0, 0, cv.width, 64)
      g.font = font; g.textBaseline = 'middle'; g.fillStyle = accent; g.globalAlpha = 0.95; g.fillText(words, 20, 35)
      // as many whole tiles as fit round the band (11 ft tall) with the letters at their own shape
      let len = 0; for (let i = 0; i < outline.length; i += 1) len += outline[i].distanceTo(outline[(i + 1) % outline.length])
      const tiles = Math.max(3, Math.round(len / (11 * cv.width / 64)))
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(tiles, 1); t.colorSpace = THREE.SRGBColorSpace
      const [o0] = tiers[1], top = tiers[0][3] + 12
      const band = new THREE.Mesh(loft(ringAt(o0 - 0.5, tiers[0][3] + 1), ringAt(o0 - 0.5, top)), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }))
      group.add(band)
    }
  }
  return { wallAt, group, seatPoint, scoreboard, ONDECK, DUGOUT }
}
