// ✂️ DIE-CUT PIECES (2026-10-23; Donovan, on the football and hockey men: "make them better and actually look like
// football players ... same with the NHL players"). The basketball tin pieces (lib/tabletop/tinFigure.js) read as real
// players because the detail is DRAWN: an illustration, die-cut and extruded, not a stack of capsules. This is that, for
// any sport: a pose draws itself twice -- once as a flat silhouette (traced into the piece's outline and extruded, so the
// edge shows) and once in print (the club's colours, keylines, halftone shading) -- and the years of play go on top
// (chips to the bare metal along the edges, scratches, rust low down). Printed both sides: the back reads mirrored, so a
// piece turned round faces the other way, as a lithographed toy does.
//
// A POSE: { key, CW, CH (its frame in px, y down), PX (px per world unit), footX, footY (the px under its feet: the
// piece's origin), draw(pen) }. The PEN draws parts; in silhouette mode every colour is one ink and every part grows by
// the die-cut margin, so the outline and the print can never disagree.
import * as THREE from 'three'

// the print's resolution: 1.5 px per frame px. Memory matters: a board of 22 men, two faces each, at 2x was ~200 MB of
// textures and blacked out the frame on a software GPU (and would on a phone).
const RES = 1.5
const rng = (seed) => { let s = (seed * 9301 + 49297) % 2147483647 || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/** The pen a pose draws with. sil: { ink, grow } draws the silhouette; otherwise the print. */
export function makePen(g, sil = null, mirror = false) {
  const grow = sil ? sil.grow : 0
  const col = (c) => (sil ? sil.ink : c)
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))) }
  const pen = {
    sil: Boolean(sil),
    mirror,
    g,
    /** a limb or any thick stroke along points (round ends) */
    limb: (pts, w, c) => { g.strokeStyle = col(c); g.lineWidth = w + grow * 2; g.lineCap = 'round'; g.lineJoin = 'round'; path(pts); g.stroke() },
    /** a filled polygon, smoothed through its points when `round` */
    shape: (pts, c, round = false) => {
      g.fillStyle = col(c); g.strokeStyle = col(c); g.lineJoin = 'round'
      if (round && pts.length > 2) {
        g.beginPath()
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const m0 = mid(pts[pts.length - 1], pts[0]); g.moveTo(m0[0], m0[1])
        pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % pts.length]); g.quadraticCurveTo(p[0], p[1], m[0], m[1]) })
        g.closePath()
      } else { path(pts); g.closePath() }
      g.fill(); if (grow) { g.lineWidth = grow * 2; g.stroke() }
    },
    oval: (x, y, rx, ry, c, rot = 0) => { g.fillStyle = col(c); g.beginPath(); g.ellipse(x, y, rx + grow, ry + grow, rot, 0, Math.PI * 2); g.fill() },
    /** print-only details (stripes, numbers, faces, laces): skipped in the silhouette */
    detail: (fn) => { if (!sil) { g.save(); fn(g); g.restore() } },
    /** a keyline round the last path (print only) */
    key: (ink, w = 1.6) => { if (!sil) { g.strokeStyle = ink; g.lineWidth = w; g.stroke() } },
  }
  return pen
}

const cache = { geo: new Map(), tex: new Map() }
const footXOf = (pose) => (pose.mirror ? pose.CW - pose.footX : pose.footX)
/** draw the pose into g (mirrored for a left-facing piece) */
function drawPose(g, pose, sil, ctx) {
  g.save()
  if (pose.mirror) { g.translate(pose.CW, 0); g.scale(-1, 1) }
  pose.draw(makePen(g, sil, Boolean(pose.mirror)), ctx)
  g.restore()
}
/** the same pose facing left: the drawing mirrored, its number still reading the right way round */
export const mirrorPose = (pose) => ({ ...pose, key: `${pose.key}-L`, mirror: true })

/** The piece's outline in world units, traced from the silhouette (Moore neighbour, half resolution), thinned, smoothed. */
function outlineOf(pose, margin) {
  const w = Math.ceil(pose.CW / 2), h = Math.ceil(pose.CH / 2)
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d'); g.scale(0.5, 0.5)
  drawPose(g, pose, { ink: 'rgb(0,0,0)', grow: margin })   // (a mask: only its coverage is read)
  const a = g.getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127
  let sx = -1, sy = -1
  for (let y = 0; y < h && sx < 0; y += 1) for (let x = 0; x < w; x += 1) if (on(x, y)) { sx = x; sy = y; break }
  const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const pts = [[sx, sy]]
  let cx = sx, cy = sy, dir = 0
  for (let n = 0; n < 40000; n += 1) {
    let moved = false
    for (let i = 0; i < 8; i += 1) { const d = (dir + 5 + i) % 8, nx = cx + D[d][0], ny = cy + D[d][1]; if (on(nx, ny)) { cx = nx; cy = ny; dir = d; moved = true; break } }
    if (!moved || (cx === sx && cy === sy)) break
    pts.push([cx, cy])
  }
  // simplify (Ramer-Douglas-Peucker, ~0.7 px): a traced staircase has a point every pixel, which made each piece ~17k
  // vertices; the shape needs a few hundred
  const rdp = (pl, eps) => {
    if (pl.length < 3) return pl
    const [ax, ay] = pl[0], [bx, by] = pl[pl.length - 1], L = Math.hypot(bx - ax, by - ay) || 1
    let far = 0, at = 0
    for (let i = 1; i < pl.length - 1; i += 1) { const d = Math.abs((bx - ax) * (ay - pl[i][1]) - (ax - pl[i][0]) * (by - ay)) / L; if (d > far) { far = d; at = i } }
    return far > eps ? [...rdp(pl.slice(0, at + 1), eps).slice(0, -1), ...rdp(pl.slice(at), eps)] : [pl[0], pl[pl.length - 1]]
  }
  const half = Math.floor(pts.length / 2)
  let p = [...rdp(pts.slice(0, half + 1), 0.7).slice(0, -1), ...rdp([...pts.slice(half), pts[0]], 0.7).slice(0, -1)]
  const cut = []
  p.forEach((q, i) => { const r = p[(i + 1) % p.length]; cut.push([q[0] * 0.75 + r[0] * 0.25, q[1] * 0.75 + r[1] * 0.25], [q[0] * 0.25 + r[0] * 0.75, q[1] * 0.25 + r[1] * 0.75]) })
  p = cut
  const fx = footXOf(pose)
  return p.map(([x, y]) => new THREE.Vector2((x * 2 - fx) / pose.PX, (pose.footY - y * 2) / pose.PX))
}

/** The print: the pose in colour, then the wear. kit: the colours the pose reads; T: the wear inks { cream, ink, bare, rust,
 *  tinDark }. */
function printOf(pose, kit, num, variant, T) {
  const cv = document.createElement('canvas'); cv.width = pose.CW * RES; cv.height = pose.CH * RES
  const g = cv.getContext('2d'); g.scale(RES, RES)
  const margin = pose.margin ?? 7
  // the cream bleeds past the cut, then the ink keyline, then the pose in print
  drawPose(g, pose, { ink: T.cream, grow: margin + 1 })
  drawPose(g, pose, { ink: T.ink, grow: 2 })
  drawPose(g, pose, null, { kit, num, T })
  // SHADING: halftone on the side away from the lamp (behind him), only on the print
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = T.ink
  const lit0 = pose.lightX ?? pose.CW * 0.6, lit = pose.mirror ? pose.CW - lit0 : lit0, side = pose.mirror ? -1 : 1   // shade behind him
  for (let y = 0; y < pose.CH; y += 5) for (let x = (y / 5) % 2 ? 2.5 : 0; x < pose.CW; x += 5) {
    const sh = Math.max(0, Math.min(1, ((lit - x) * side) / (pose.CW * 0.3))) * 0.85
    if (sh <= 0.06) continue
    g.globalAlpha = 0.28; g.beginPath(); g.arc(x, y, 0.4 + sh * 1.5, 0, Math.PI * 2); g.fill()
  }
  // THE YEARS OF PLAY: chips to the bare metal, mostly on the edges a thumb flicks; scratches; rust low down
  g.globalAlpha = 1
  const mask = document.createElement('canvas'); mask.width = pose.CW; mask.height = pose.CH
  const mg = mask.getContext('2d'); drawPose(mg, pose, { ink: T.ink, grow: margin })
  const md = mg.getImageData(0, 0, pose.CW, pose.CH).data
  const inside = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < pose.CW && yi < pose.CH && md[(yi * pose.CW + xi) * 4 + 3] > 127 }
  const edgeish = (x, y) => inside(x, y) && (!inside(x + 7, y) || !inside(x - 7, y) || !inside(x, y + 7) || !inside(x, y - 7))
  const r = rng(11 + (variant & 3) * 17 + pose.key.length * 5)
  let made = 0
  for (let k = 0; k < 5000 && made < 60; k += 1) {
    const x = 4 + r() * (pose.CW - 8), y = 4 + r() * (pose.CH - 8)
    if (!edgeish(x, y) && !(inside(x, y) && r() < 0.05)) continue
    made += 1
    const rad = 1.2 + r() * (edgeish(x, y) ? 4.2 : 2.3)
    g.beginPath()
    for (let i = 0; i < 7; i += 1) { const a = (i / 7) * Math.PI * 2, rr = rad * (0.45 + r() * 0.85); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py) }
    g.closePath(); g.fillStyle = T.bare; g.fill(); g.globalAlpha = 0.5; g.strokeStyle = T.tinDark; g.lineWidth = 0.7; g.stroke(); g.globalAlpha = 1
  }
  for (let k = 0; k < 14; k += 1) {
    const x = r() * pose.CW, y = r() * pose.CH, a = r() * Math.PI, l = 6 + r() * 24
    if (!inside(x, y)) continue
    g.globalAlpha = 0.3 + r() * 0.35; g.strokeStyle = T.bare; g.lineWidth = 0.5 + r() * 0.6
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
  }
  for (let k = 0; k < 30; k += 1) { const x = r() * pose.CW, y = pose.footY - r() * 70; if (!inside(x, y)) continue; g.globalAlpha = 0.25 + r() * 0.4; g.fillStyle = T.rust; g.beginPath(); g.ellipse(x, y, 0.8 + r() * 2, 0.8 + r() * 1.6, 0, 0, Math.PI * 2); g.fill() }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  // the extruded caps' UVs are the outline's world units: map them back onto the print
  t.repeat.set(pose.PX / pose.CW, pose.PX / pose.CH); t.offset.set(footXOf(pose) / pose.CW, (pose.CH - pose.footY) / pose.CH)
  return t
}

/** The geometry for a pose (cached): the outline extruded `depth` thick, its feet at the origin, its print facing +Z. */
export function diecutGeometry(pose, depth = 0.14) {
  if (typeof document === 'undefined') return null
  const k = `${pose.key}|${depth}`
  if (!cache.geo.has(k)) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(outlineOf(pose, pose.margin ?? 7)), { depth, bevelEnabled: true, bevelThickness: depth * 0.2, bevelSize: depth * 0.2, bevelSegments: 1, curveSegments: 4 })
    geo.translate(0, 0, -depth / 2)
    cache.geo.set(k, geo)
  }
  return cache.geo.get(k)
}

/** The print for a pose, a kit, a number and a wear (cached). */
export function diecutPrint(pose, kit, num, variant, T) {
  if (typeof document === 'undefined') return null
  // a man with no number wears one of two wear patterns (a numbered man his own): fewer prints to hold
  const v = num == null ? variant & 1 : variant & 3
  const k = `${pose.key}|${JSON.stringify(kit)}|${num ?? ''}|${v}`
  if (!cache.tex.has(k)) cache.tex.set(k, printOf(pose, kit, num, v, T))
  return cache.tex.get(k)
}

/** A finished piece: the print on both faces, the metal on its edge. */
export function diecutPiece({ pose, kit, num = null, variant = 0, T, edge, depth = 0.14, roughness = 0.4, metalness = 0.12, glow = 0.32 }) {
  // the print lights itself a little: an upright piece under an overhead lamp otherwise reads dull
  const map = diecutPrint(pose, kit, num, variant, T)
  const face = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: glow, roughness, metalness, alphaTest: 0.5 })
  const mesh = new THREE.Mesh(diecutGeometry(pose, depth), [face, edge])
  mesh.castShadow = true; mesh.receiveShadow = true
  mesh.userData.reprint = (k2, n2, v2 = variant) => { face.map = diecutPrint(pose, k2, n2, v2, T); face.emissiveMap = face.map; face.needsUpdate = true }
  return mesh
}

/** A piece that can face either way: the right-facing print and its mirrored twin, one shown at a time.
 *  userData.setFacing(+1 | -1); userData.reprint(kit, num, variant) reprints both. */
export function diecutPair({ pose, ...rest }) {
  const g = new THREE.Group()
  let args = rest
  const R = diecutPiece({ pose, ...rest })
  let L = null   // the left-facing twin is made the first time he faces left (half the prints for men who never do)
  g.add(R)
  g.userData.setFacing = (s) => {
    if (s < 0 && !L) { L = diecutPiece({ pose: mirrorPose(pose), ...args }); g.add(L) }
    R.visible = s >= 0; if (L) L.visible = s < 0
  }
  g.userData.reprint = (k2, n2, v2) => { args = { ...args, kit: k2, num: n2, variant: v2 ?? args.variant }; R.userData.reprint(k2, n2, v2); L?.userData.reprint(k2, n2, v2) }
  return g
}

/** Turn every piece's face to the camera (call each frame, after the camera moves): a flat piece is never seen edge-on.
 *  figs: objects whose userData.piece is a diecutPair; userData.spin (radians) is a celebration spin to keep. */
export function faceCamera(figs, camera) {
  for (const f of figs) {
    const pc = f?.userData?.piece
    if (!pc || !f.visible) continue
    const yaw = Math.atan2(camera.position.x - f.position.x, camera.position.z - f.position.z)
    pc.rotation.y = yaw - f.rotation.y + (f.userData.spin || 0)
  }
}
