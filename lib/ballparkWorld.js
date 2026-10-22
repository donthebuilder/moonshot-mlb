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
 * Returns { wallAt(ang), group }.
 */
export function buildTrackingPark(scene, { dims, heights, turf, dirt, line, pole, floor, mark = null, ribbon = 'DASH NETWORK', accent }) {
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
  for (let a = 135; a <= 225; a += 5) outline.push(parkPoint(62, a))
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

  // THE WALL: its real distance and height at every degree, dark, a thin lit cap line, the five numbers on top
  {
    const pos = [], idx = []
    let k = 0
    for (let a = -45; a <= 45; a += 1) {
      const p = parkPoint(wallAt(a), a), h = hAt(a)
      pos.push(p.x, 0, p.z, p.x, h, p.z)
      if (a < 45) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
      k += 2
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx)
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(floor).multiplyScalar(1.6), side: THREE.DoubleSide })))
    const cap = []; for (let a = -45; a <= 45; a += 0.5) cap.push(parkPoint(wallAt(a), a, hAt(a) + 0.15))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cap), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.85 })))
    const foot = []; for (let a = -45; a <= 45; a += 0.5) foot.push(parkPoint(wallAt(a) - 0.4, a, 0.2))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(foot), new THREE.LineBasicMaterial({ color: new THREE.Color(line), transparent: true, opacity: 0.25 })))
    if (typeof document !== 'undefined') {
      ;[-45, -22.5, 0, 22.5, 45].forEach((a, i) => {
        const s = numberSprite(String(Math.round(dims[i])))
        s.scale.multiplyScalar(0.62); s.position.copy(parkPoint(wallAt(a) - 1, a, hAt(a) + 6.5)); group.add(s)
      })
    }
  }
  // the foul poles
  for (const a of [-45, 45]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 72, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(pole) }))
    m.position.copy(parkPoint(wallAt(a) + 0.5, a, 36)); group.add(m)
  }

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
  return { wallAt, group }
}
