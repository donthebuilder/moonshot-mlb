// 🥫 A TIN CUT-OUT PLAYER (2026-10-23, the tin court; Donovan: the figures "need to be super detailed ... if they've been
// battling with each other for years, chip painting"). A jump shooter die-cut from sheet tin: a real outline with an edge
// you can see (traced from the print, then extruded), lithographed in his club's colours -- jersey with trim at the neck
// and armholes, his number, shorts with a side stripe, striped socks, sneakers, a printed face and hair, a keyline round
// every part, halftone shading on the side away from the lamp -- and years of play on it: chips worn through to the
// bare tin along the edges, scratches, rust freckles at the feet. Printed both sides (the back reads mirrored, as a
// lithographed toy's does). Every colour is a token or the club's own.
import * as THREE from 'three'
import { TINCOURT as T } from '../nba/theme'

const CW = 256, CH = 512, RES = 2          // the print's frame (drawn at 2x for the close shots)
const FW = 4, FH = 8                      // the piece in feet
const rng = (seed) => { let s = (seed * 9301 + 49297) % 2147483647 || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

// the parts, in the print's frame (y down). A jumper at the top of his shot: the ball over his head, one knee bent.
const PARTS = {
  ball: [150, 44, 25],
  armL: [[90, 160], [82, 112], [122, 66]], armR: [[150, 158], [178, 108], [166, 68]], armW: 25,
  handL: [124, 66, 13], handR: [166, 68, 13],
  head: [120, 110, 23, 28],
  neck: [109, 128, 22, 26],
  torso: [[82, 152], [158, 148], [162, 196], [151, 282], [89, 284], [80, 204]],
  shorts: [[86, 272], [154, 270], [166, 340], [127, 346], [120, 318], [113, 346], [76, 340]],
  legL: [[98, 336], [93, 410], [97, 466]], legR: [[142, 336], [158, 398], [147, 462]], legW: 23,
  shoeL: [94, 478, 27, 13, 0.04], shoeR: [150, 472, 27, 12, -0.16],
}
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath() }
const line = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))) }
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2) }

/** The whole silhouette in one colour, grown by `grow` px (the die-cut margin). */
function silhouette(g, fill, grow) {
  g.fillStyle = fill; g.strokeStyle = fill; g.lineJoin = 'round'; g.lineCap = 'round'
  const P = PARTS
  const blob = (draw) => { draw(); g.fill(); if (grow > 0) { g.lineWidth = grow * 2; g.stroke() } }
  blob(() => ell(g, P.ball[0], P.ball[1], P.ball[2], P.ball[2]))
  for (const a of [P.armL, P.armR]) { line(g, a); g.lineWidth = P.armW + grow * 2; g.stroke() }
  for (const h of [P.handL, P.handR]) blob(() => ell(g, h[0], h[1], h[2], h[2]))
  blob(() => ell(g, P.head[0], P.head[1], P.head[2], P.head[3]))
  blob(() => { g.beginPath(); g.rect(...P.neck) })
  blob(() => poly(g, P.torso)); blob(() => poly(g, P.shorts))
  for (const l of [P.legL, P.legR]) { line(g, l); g.lineWidth = P.legW + grow * 2; g.stroke() }
  for (const s of [P.shoeL, P.shoeR]) blob(() => ell(g, ...s))
}

/** The outline: the grown silhouette traced (Moore neighbour) on a half-size mask, thinned, smoothed. Feet units. */
let OUTLINE = null
function outline() {
  if (OUTLINE) return OUTLINE
  const w = CW / 2, h = CH / 2, cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const g = cv.getContext('2d'); g.scale(0.5, 0.5); silhouette(g, T.line, 7)   // (a mask: only its coverage is read)
  const a = g.getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127
  let sx = -1, sy = -1
  for (let y = 0; y < h && sx < 0; y += 1) for (let x = 0; x < w; x += 1) if (on(x, y)) { sx = x; sy = y; break }
  const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const pts = [[sx, sy]]
  let cx = sx, cy = sy, dir = 0
  for (let n = 0; n < 20000; n += 1) {
    let moved = false
    for (let i = 0; i < 8; i += 1) {
      const d = (dir + 5 + i) % 8, nx = cx + D[d][0], ny = cy + D[d][1]
      if (on(nx, ny)) { cx = nx; cy = ny; dir = d; moved = true; break }
    }
    if (!moved || (cx === sx && cy === sy)) break
    pts.push([cx, cy])
  }
  // every other point, then one round of corner cutting (Chaikin): a die-cut edge, not a staircase
  let p = pts.filter((_, i) => i % 2 === 0)
  const cut = []
  p.forEach((q, i) => { const r = p[(i + 1) % p.length]; cut.push([q[0] * 0.75 + r[0] * 0.25, q[1] * 0.75 + r[1] * 0.25], [q[0] * 0.25 + r[0] * 0.75, q[1] * 0.25 + r[1] * 0.75]) })
  p = cut
  OUTLINE = p.map(([x, y]) => new THREE.Vector2(((x * 2) / CW) * FW - FW / 2, ((CH - y * 2) / CH) * FH))
  return OUTLINE
}

/** The print. variant 0..3 picks where the years of play wore it. */
function print(jersey, trim, num, variant) {
  const cv = document.createElement('canvas'); cv.width = CW * RES; cv.height = CH * RES
  const g = cv.getContext('2d'); g.scale(RES, RES)
  const P = PARTS, r = rng(11 + variant * 17)
  // the margin: printed cream to the die-cut edge, the tin's keyline inside it
  silhouette(g, T.line, 8); silhouette(g, T.ink, 2)   // (the cream bleeds past the cut, so the edge is printed to the tin)
  // skin: arms, hands, neck, head; then the legs (skin above the socks)
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.strokeStyle = T.skin
  for (const a of [P.armL, P.armR]) { line(g, a); g.lineWidth = P.armW - 3; g.stroke() }
  g.fillStyle = T.skin
  for (const hd of [P.handL, P.handR]) { ell(g, hd[0], hd[1], hd[2] - 1.5, hd[2] - 1.5); g.fill() }
  g.fillRect(P.neck[0] + 1.5, P.neck[1], P.neck[2] - 3, P.neck[3]); ell(g, P.head[0], P.head[1], P.head[2] - 1.5, P.head[3] - 1.5); g.fill()
  for (const l of [P.legL, P.legR]) { line(g, l); g.lineWidth = P.legW - 3; g.stroke() }
  // the socks: white with two stripes in the trim, from mid-shin down
  for (const l of [P.legL, P.legR]) {
    const [, k, an] = l, s0 = [k[0] + (an[0] - k[0]) * 0.35, k[1] + (an[1] - k[1]) * 0.35]
    g.strokeStyle = T.line; g.lineWidth = P.legW - 3; line(g, [s0, an]); g.stroke()
    for (const f of [0.45, 0.58]) { const y = k[1] + (an[1] - k[1]) * f, x = k[0] + (an[0] - k[0]) * f; g.strokeStyle = trim; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.stroke() }
  }
  // the jersey: the body in the club's colour, the trim at the neck and round the armholes, the number big on the chest
  g.fillStyle = jersey; poly(g, P.torso); g.fill()
  g.strokeStyle = trim; g.lineWidth = 4
  g.beginPath(); g.moveTo(108, 151); g.quadraticCurveTo(120, 172, 132, 150); g.stroke()
  g.beginPath(); g.moveTo(86, 156); g.quadraticCurveTo(98, 182, 92, 206); g.stroke()
  g.beginPath(); g.moveTo(154, 152); g.quadraticCurveTo(144, 180, 152, 204); g.stroke()
  if (num != null) {
    const n = String(num), size = n.length > 1 ? 48 : 58
    g.font = `900 ${size}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 5; g.strokeStyle = T.line; g.strokeText(n, 121, 222); g.fillStyle = trim; g.fillText(n, 121, 222)
  }
  // the shorts: the club's colour, a waistband, a stripe down each side
  g.fillStyle = jersey; poly(g, P.shorts); g.fill()
  g.fillStyle = trim; g.fillRect(86, 270, 68, 7)
  g.strokeStyle = trim; g.lineWidth = 5; line(g, [[88, 280], [80, 336]]); g.stroke(); line(g, [[152, 278], [162, 334]]); g.stroke()
  // sneakers: white uppers, a stripe in the trim, a dark sole
  for (const s of [P.shoeL, P.shoeR]) {
    g.save(); g.translate(s[0], s[1]); g.rotate(s[4])
    g.fillStyle = T.line; ell(g, 0, -2, s[2] - 2, s[3] - 3); g.fill()
    g.fillStyle = T.ink; g.fillRect(-s[2] + 3, s[3] - 7, (s[2] - 3) * 2, 4.5)
    g.strokeStyle = trim; g.lineWidth = 3; g.beginPath(); g.moveTo(-12, 2); g.quadraticCurveTo(0, -8, 14, -1); g.stroke()
    g.restore()
  }
  // the face: hair, an ear, the eye and brow looking up at the ball, a little highlight
  const [hx, hy, hrx, hry] = P.head
  g.fillStyle = T.hair; g.beginPath(); g.ellipse(hx, hy - 6, hrx - 1, hry - 7, 0, Math.PI, Math.PI * 2); g.fill()
  g.fillStyle = T.ink; ell(g, hx + 9, hy - 3, 2.6, 3.4); g.fill()
  g.strokeStyle = T.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(hx + 4, hy - 10); g.lineTo(hx + 15, hy - 12); g.stroke()
  g.beginPath(); g.moveTo(hx + 4, hy + 13); g.quadraticCurveTo(hx + 10, hy + 16, hx + 15, hy + 12); g.stroke()
  g.fillStyle = T.mapleDark; ell(g, hx - 13, hy + 1, 4.5, 7); g.fill()
  // the ball: orange with its seams
  g.fillStyle = T.rim; ell(g, P.ball[0], P.ball[1], P.ball[2] - 2, P.ball[2] - 2); g.fill()
  g.strokeStyle = T.ink; g.lineWidth = 2
  g.beginPath(); g.moveTo(P.ball[0] - 23, P.ball[1]); g.lineTo(P.ball[0] + 23, P.ball[1]); g.stroke()
  g.beginPath(); g.moveTo(P.ball[0], P.ball[1] - 23); g.lineTo(P.ball[0], P.ball[1] + 23); g.stroke()
  g.beginPath(); g.arc(P.ball[0] - 30, P.ball[1], 22, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(P.ball[0] + 30, P.ball[1], 22, Math.PI - 0.8, Math.PI + 0.8); g.stroke()
  // the keylines: every part edged in ink, as a lithograph's black plate
  g.strokeStyle = T.ink; g.lineWidth = 1.6
  poly(g, P.torso); g.stroke(); poly(g, P.shorts); g.stroke(); ell(g, hx, hy, hrx - 1, hry - 1); g.stroke()
  // shading: halftone dots on the side away from the lamp (the lamp is up and to his right), only on the print
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = T.ink
  for (let y = 0; y < CH; y += 5) for (let x = (y / 5) % 2 ? 2.5 : 0; x < CW; x += 5) {
    const sh = Math.max(0, Math.min(1, (130 - x) / 70)) * 0.9 + (y > 300 ? 0.15 : 0)
    if (sh <= 0.05) continue
    g.globalAlpha = 0.32; g.beginPath(); g.arc(x, y, 0.4 + sh * 1.6, 0, Math.PI * 2); g.fill()
  }
  // THE YEARS OF PLAY: chips to the bare tin, heaviest on the edges a thumb flicks (the margin) and the feet; scratches;
  // rust freckles low down
  g.globalAlpha = 1
  const mask = document.createElement('canvas'); mask.width = CW; mask.height = CH
  const mg = mask.getContext('2d'); silhouette(mg, T.ink, 7); const md = mg.getImageData(0, 0, CW, CH).data
  const inside = (x, y) => md[((Math.round(y) * CW) + Math.round(x)) * 4 + 3] > 127
  const edgeish = (x, y) => inside(x, y) && (!inside(x + 7, y) || !inside(x - 7, y) || !inside(x, y + 7) || !inside(x, y - 7))
  let made = 0
  for (let k = 0; k < 4000 && made < 70; k += 1) {
    const x = 4 + r() * (CW - 8), y = 4 + r() * (CH - 8)
    if (!edgeish(x, y) && !(inside(x, y) && r() < 0.06)) continue
    made += 1
    const rad = 1.2 + r() * (edgeish(x, y) ? 4.5 : 2.5)
    g.beginPath()
    for (let i = 0; i < 7; i += 1) { const a = (i / 7) * Math.PI * 2, rr = rad * (0.45 + r() * 0.85); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py) }
    g.closePath(); g.fillStyle = T.bare; g.fill(); g.globalAlpha = 0.5; g.strokeStyle = T.tinDark; g.lineWidth = 0.7; g.stroke(); g.globalAlpha = 1
  }
  for (let k = 0; k < 16; k += 1) {
    const x = 70 + r() * 110, y = 60 + r() * 400, a = r() * Math.PI, l = 6 + r() * 26
    g.globalAlpha = 0.35 + r() * 0.35; g.strokeStyle = T.bare; g.lineWidth = 0.5 + r() * 0.6
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
  }
  for (let k = 0; k < 26; k += 1) { const x = 70 + r() * 110, y = 420 + r() * 80; if (!inside(x, y)) continue; g.globalAlpha = 0.25 + r() * 0.4; g.fillStyle = T.rust; ell(g, x, y, 0.8 + r() * 2.2, 0.8 + r() * 1.8); g.fill() }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  t.repeat.set(1 / FW, 1 / FH); t.offset.set(0.5, 0)        // the extruded caps' UVs are the outline's feet
  return t
}

const prints = new Map()
/** The print for a man (cached by club colours, number and wear). */
export function tinPrint(jersey, trim, num, variant = 0) {
  if (typeof document === 'undefined') return null
  const key = `${jersey}|${trim}|${num ?? ''}|${variant & 3}`
  if (!prints.has(key)) prints.set(key, print(jersey, trim, num, variant & 3))
  return prints.get(key)
}

let GEO = null
/** The die-cut piece: its feet at y 0, its print facing +Z. Material 0 the print (both caps), 1 the tin edge. */
export function tinFigure({ jersey, trim, num = null, variant = 0, edge }) {
  if (!GEO) {
    const shape = new THREE.Shape(outline())
    GEO = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 4 })
    GEO.translate(0, 0, -0.06)
  }
  const face = new THREE.MeshStandardMaterial({ map: tinPrint(jersey, trim, num, variant), roughness: 0.38, metalness: 0.12, alphaTest: 0.5 })
  const mesh = new THREE.Mesh(GEO, [face, edge])
  mesh.castShadow = true; mesh.receiveShadow = true
  return mesh
}
