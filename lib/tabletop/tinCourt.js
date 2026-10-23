// 🏀 THE TIN COURT (2026-10-23, BUCKETS prototype A). Donovan: basketball like the vintage tabletop games -- "the tin
// spring lever". Our original in the style of the lithographed tin games (no maker's name or mark): a tin tray printed as
// a maple court in a lithograph's flat colours and halftone, crowds printed on the tray's inner walls, a rolled tin rim,
// tin backboards on bent stands with wire rims and string nets, and flat tin cut-out players standing on spring-lever
// stations -- five a club on the half it attacks. A steel ball flies from the shot's real spot.
//
// FRAME: feet, X along the court (the home club attacks +X; rims at +/-41.75, 10 ft up), Z across, Y up. Returns
// { render({ L, sc, players, statusOf, dt, t, snap }), setScore(away, home, label), flash(f, t), focus } -- the scene
// comes from lib/tabletop/tinDirector.js.
import * as THREE from 'three'
import { TINCOURT as T } from '../nba/theme'
import { toCourt, rimOf, BASKET_X } from '../nba/plays'
import { wornMaterial } from './wear'
import { tinFigure, tinPrint } from './tinFigure'
import { HANDS } from './tinDirector'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const L = 94, W = 50
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const rnd = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
const tex = (cv, { repeat = null } = {}) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat) } return t }

/** The printed floor: maple boards, the lines, each club's key, a halftone border band with the network's name. */
function floorPrint(home, away, accent) {
  const PX = 20, cw = (L + 8) * PX, ch = (W + 8) * PX, cv = canvas(cw, ch), g = cv.getContext('2d'), r = rnd(5)
  const X = (x) => (x + L / 2 + 4) * PX, Y = (z) => (z + W / 2 + 4) * PX
  // the border band (printed red with a halftone) and the floor inside it
  g.fillStyle = T.litho; g.fillRect(0, 0, cw, ch)
  g.fillStyle = T.lithoBlue; for (let y = 6; y < ch; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < cw; x += 14) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill() }
  g.fillStyle = T.maple; g.fillRect(X(-L / 2), Y(-W / 2), L * PX, W * PX)
  // boards: printed lines along the court, a few darker planks, a halftone grain
  for (let z = -W / 2; z < W / 2; z += 1.6) { g.globalAlpha = 0.22; g.fillStyle = T.mapleDark; g.fillRect(X(-L / 2), Y(z), L * PX, 1.5); if (r() < 0.3) { g.globalAlpha = 0.08; g.fillRect(X(-L / 2), Y(z), L * PX, 1.6 * PX) } }
  g.globalAlpha = 0.1; g.fillStyle = T.mapleDark; for (let k = 0; k < 2400; k += 1) { g.beginPath(); g.arc(X(-L / 2) + r() * L * PX, Y(-W / 2) + r() * W * PX, 1.5 + r() * 2, 0, Math.PI * 2); g.fill() }
  g.globalAlpha = 1
  // the keys in each club's colour (the end it defends: home defends -X)
  for (const [club, s] of [[home, -1], [away, 1]]) {
    g.fillStyle = club.color || T.litho; g.fillRect(Math.min(X(s * L / 2), X(s * (L / 2 - 19))), Y(-8), 19 * PX, 16 * PX)
  }
  // the lines
  g.strokeStyle = T.line; g.lineWidth = 0.35 * PX
  g.strokeRect(X(-L / 2), Y(-W / 2), L * PX, W * PX)
  g.beginPath(); g.moveTo(X(0), Y(-W / 2)); g.lineTo(X(0), Y(W / 2)); g.stroke()
  g.beginPath(); g.arc(X(0), Y(0), 6 * PX, 0, Math.PI * 2); g.stroke()
  for (const s of [-1, 1]) {
    const rx = X(s * BASKET_X)
    g.strokeRect(Math.min(X(s * L / 2), X(s * (L / 2 - 19))), Y(-8), 19 * PX, 16 * PX)
    g.beginPath(); g.arc(X(s * (L / 2 - 19)), Y(0), 6 * PX, 0, Math.PI * 2); g.stroke()
    // the three-point line: straight in the corners (22 ft), the 23.75 ft arc round the rim
    const a0 = Math.asin(22 / 23.75)
    g.beginPath(); g.moveTo(X(s * L / 2), Y(-22)); g.lineTo(X(s * BASKET_X) - s * Math.cos(a0) * 23.75 * PX, Y(-22))
    g.arc(rx, Y(0), 23.75 * PX, s > 0 ? Math.PI + a0 : -a0, s > 0 ? Math.PI - a0 : a0, s > 0)
    g.lineTo(X(s * L / 2), Y(22)); g.stroke()
  }
  // centre court: the product's name, printed big in its colour
  g.fillStyle = accent; g.font = `900 ${5 * PX}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `900 ${3.2 * PX}px Impact, "Arial Narrow", sans-serif`; g.fillText('BUCKETS', X(0), Y(0))
  // the band's lettering
  g.fillStyle = T.line; g.font = `900 ${2.6 * PX}px Impact, "Arial Narrow", sans-serif`
  for (const y of [Y(-W / 2) - 2 * PX, Y(W / 2) + 2 * PX]) for (let x = 14 * PX; x < cw; x += 34 * PX) g.fillText('DASH NETWORK', x, y)
  // THE YEARS OF PLAY on the floor: a worn ring round every lever (the levers rub the print to the tin), scratches where
  // the steel ball skids, chipped edges along the band, a few rust freckles
  const wr = rnd(23)
  for (const club of ['home', 'away']) for (const st of STATIONS) {
    const at = toCourt(st, club), cx = X(at.X), cy = Y(at.Z)
    for (let k = 0; k < 40; k += 1) {
      const a = wr() * Math.PI * 2, rr = (1.8 + wr() * 1.4) * PX
      g.globalAlpha = 0.25 + wr() * 0.35; g.strokeStyle = T.bare; g.lineWidth = 1 + wr() * 2
      g.beginPath(); g.arc(cx, cy, rr, a, a + 0.2 + wr() * 0.6); g.stroke()
    }
  }
  for (let k = 0; k < 140; k += 1) {
    const x = wr() * cw, y = wr() * ch, a = wr() * Math.PI, l = (0.6 + wr() * 3.5) * PX
    g.globalAlpha = 0.18 + wr() * 0.3; g.strokeStyle = T.bare; g.lineWidth = 0.6 + wr() * 1.2
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4); g.stroke()
  }
  for (let k = 0; k < 45; k += 1) {
    const edge = wr() < 0.5, x = edge ? wr() * cw : (wr() < 0.5 ? wr() * 3 * PX : cw - wr() * 3 * PX), y = edge ? (wr() < 0.5 ? wr() * 3 * PX : ch - wr() * 3 * PX) : wr() * ch, rad = (0.08 + wr() * 0.22) * PX
    g.globalAlpha = 0.8; g.fillStyle = T.bare; g.beginPath()
    for (let i = 0; i < 6; i += 1) { const a = (i / 6) * Math.PI * 2, rr = rad * (0.5 + wr() * 0.8); if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
    g.closePath(); g.fill()
  }
  for (let k = 0; k < 60; k += 1) { g.globalAlpha = 0.2 + wr() * 0.35; g.fillStyle = T.rust; g.beginPath(); g.arc(wr() * cw, wr() < 0.5 ? wr() * 4 * PX : ch - wr() * 4 * PX, (0.05 + wr() * 0.18) * PX, 0, Math.PI * 2); g.fill() }
  g.globalAlpha = 1
  return tex(cv)
}

/** A printed crowd for the tray's inner walls: rows of little heads in a lithograph's few colours. */
function crowdStrip(home, away) {
  const cv = canvas(2048, 160), g = cv.getContext('2d'), r = rnd(9)
  g.fillStyle = T.lithoBlue; g.fillRect(0, 0, 2048, 160)
  const inks = [home.color, away.color, T.line, T.maple, T.litho].filter(Boolean)
  for (let row = 0; row < 7; row += 1) for (let x = 6 + (row % 2) * 8; x < 2048; x += 16) {
    g.fillStyle = inks[Math.floor(r() * inks.length)]; g.beginPath(); g.arc(x, 20 + row * 19, 6, 0, Math.PI * 2); g.fill()
    g.fillRect(x - 6, 26 + row * 19, 12, 8)
  }
  return tex(cv, { repeat: [2, 1] })
}

// where the pieces stand most (ESPN's frame: x across, y out from the rim end): the floor is worn round these
const STATIONS = [{ x: 3, y: 4 }, { x: 9, y: 19 }, { x: 25, y: 26 }, { x: 41, y: 19 }, { x: 47, y: 4 }]

export function buildTinCourt(scene, renderer, { home, away, accent, players = {} }) {
  const out = { focus: new THREE.Vector3(), render: () => {}, setScore: () => {}, flash: () => {} }
  if (typeof document === 'undefined') return out
  scene.background = new THREE.Color(T.night)
  // the table and the light
  const table = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.table), roughness: 0.75 }))
  table.rotation.x = -Math.PI / 2; table.position.y = -3; table.receiveShadow = true; scene.add(table)
  // reflections for the tin: a room, so the rim and the stands read as metal (kept soft on the printed pieces)
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.HemisphereLight(new THREE.Color(T.lamp), new THREE.Color(T.night), 0.7))
  const fill = new THREE.DirectionalLight(new THREE.Color(T.lamp), 0.35); fill.position.set(40, 60, 140); scene.add(fill)
  const key = new THREE.DirectionalLight(new THREE.Color(T.lamp), 1.8); key.position.set(-50, 160, 90); key.castShadow = true
  const sc = key.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 50; sc.bottom = -50; sc.near = 20; sc.far = 400; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.3
  scene.add(key); scene.add(key.target)
  // the tray: a tin box, the printed floor, inner walls with crowds, a rolled rim
  const tin = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tin), metalness: 0.75, roughness: 0.32, envMap: env, envMapIntensity: 0.8 })
  const tray = new THREE.Mesh(new THREE.BoxGeometry(L + 14, 3, W + 14), tin); tray.position.y = -1.5; tray.receiveShadow = true; tray.castShadow = true; scene.add(tray)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, W + 8), new THREE.MeshStandardMaterial({ map: floorPrint(home, away, accent), roughness: 0.38, metalness: 0.2 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; scene.add(floor)
  const crowd = crowdStrip(home, away)
  const wall = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.5), new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }))
    m.position.set(x, 2.25, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m)
  }
  wall(L + 14, 0, -(W / 2 + 7), 0); wall(W + 14, -(L / 2 + 7), 0, Math.PI / 2); wall(W + 14, L / 2 + 7, 0, -Math.PI / 2)   // (the near side open to the camera)
  const roll = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 12), tin); m.rotation.set(0, ry, Math.PI / 2); m.position.set(x, 4.6, z); m.castShadow = true; scene.add(m) }
  roll(L + 14, 0, -(W / 2 + 7), 0); roll(W + 14, -(L / 2 + 7), 0, Math.PI / 2); roll(W + 14, L / 2 + 7, 0, Math.PI / 2)
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, L + 14, 12), tin); lip.rotation.z = Math.PI / 2; lip.position.set(0, 0.4, W / 2 + 7); scene.add(lip)
  // the baskets: a bent tin stand, a printed backboard, a wire rim, a string net
  const nets = {}
  for (const s of [-1, 1]) {
    const bx = s * BASKET_X
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 13, 2.2), tin); stand.position.set(s * (L / 2 + 3), 6.5, 0); stand.castShadow = true; scene.add(stand)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 1.6), tin); arm.position.set(s * (L / 2 - 0.5), 12.6, 0); arm.castShadow = true; scene.add(arm)
    const bcv = canvas(256, 160), bg = bcv.getContext('2d'); bg.fillStyle = T.backboard; bg.fillRect(0, 0, 256, 160)
    bg.strokeStyle = T.rim; bg.lineWidth = 8; bg.strokeRect(6, 6, 244, 148); bg.strokeRect(90, 70, 76, 60)
    const print = new THREE.MeshStandardMaterial({ map: tex(bcv), roughness: 0.4 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 6), [print, print, tin, tin, tin, tin])
    board.position.set(s * (L / 2 - 4), 11.25, 0); board.castShadow = true; scene.add(board)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.rim), metalness: 0.5, roughness: 0.35 }))
    rim.rotation.x = Math.PI / 2; rim.position.set(bx, 10, 0); rim.castShadow = true; scene.add(rim)
    const net = new THREE.Group(); net.position.set(bx, 10, 0); scene.add(net)
    const netMat = new THREE.LineBasicMaterial({ color: new THREE.Color(T.line), transparent: true, opacity: 0.85 })
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2, b = a + 0.5
      net.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75), new THREE.Vector3(Math.cos(b) * 0.45, -1.5, Math.sin(b) * 0.45)]), netMat))
    }
    for (const y of [-0.5, -1.0]) { const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2, r = 0.75 - (0.3 * -y) / 1.5; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r) })), netMat); net.add(ring) }
    nets[s] = net
  }
  // THE PIECES: five tin cut-outs a club, each riveted to a bracket on a spring lever on a round magnet base; they slide
  // over the tin to their spots (rattling, as the electric games do), hop to shoot, rebound and block, spin to celebrate.
  // A called man's base glows in the product's colour with a CALLED tag over him.
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, k) => new THREE.Vector3(Math.cos(k * 0.8) * 0.45, k * 0.035, Math.sin(k * 0.8) * 0.45))), 120, 0.07, 6)
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.line), metalness: 0.95, roughness: 0.2, envMap: env, envMapIntensity: 1 })
  const glow = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), emissive: new THREE.Color(accent), emissiveIntensity: 2.4, roughness: 0.4 })
  const tagTex = (() => {
    const cv = canvas(256, 72), g = cv.getContext('2d')
    g.fillStyle = T.ink; g.beginPath(); g.roundRect(4, 4, 248, 64, 10); g.fill()
    g.strokeStyle = accent; g.lineWidth = 5; g.stroke()
    g.fillStyle = accent; g.font = '900 44px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CALLED', 128, 38)
    return tex(cv)
  })()
  const figs = { home: [], away: [] }
  for (const club of ['home', 'away']) {
    const team = club === 'home' ? home : away
    for (let k = 0; k < 5; k += 1) {
      const variant = k + (club === 'home' ? 0 : 2)
      const g = new THREE.Group(); g.position.set((club === 'home' ? -1 : 1) * (10 + k * 4), 0, -10 + k * 5); scene.add(g)
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.35, 24), wornMaterial(team.color || T.tinDark, 'base', variant, { roughness: 0.32 })); plate.position.y = 0.18; plate.castShadow = true; g.add(plate)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 8, 40), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; ring.visible = false; g.add(ring)
      const body = new THREE.Group(); g.add(body)
      const coil = new THREE.Mesh(spring, steel); coil.position.y = 0.35; body.add(coil)
      const flipper = new THREE.Group(); flipper.position.set(0, 1.8, 0); body.add(flipper)
      const armMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.5), tin); armMesh.position.x = 1.2; armMesh.castShadow = true; flipper.add(armMesh)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.35), tin); post.position.y = 1.15; post.castShadow = true; body.add(post)
      const figure = tinFigure({ jersey: team.color || T.litho, trim: team.alt || T.line, num: null, variant, edge: tin })
      figure.position.y = 1.9; body.add(figure)
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false })); tag.scale.set(4.4, 1.24, 1); tag.position.y = 12.4; tag.visible = false; g.add(tag)
      figs[club].push({ g, body, flipper, figure, ring, tag, team, variant, id: null, num: undefined, flip: null, moving: 0, phase: k * 1.7 + (club === 'home' ? 0 : 0.9) })
    }
  }
  const reprint = (f, num) => { if (f.num === num) return; f.num = num; const face = f.figure.material[0]; face.map = tinPrint(f.team.color || T.litho, f.team.alt || T.line, num, f.variant); face.needsUpdate = true }
  // the steel ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.95, 26, 18), steel); ball.castShadow = true; ball.visible = false; scene.add(ball)
  // the scoreboard: a tin flip board on a stand off the far side
  const sbCv = canvas(512, 160), sbTex = tex(sbCv)
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), new THREE.MeshStandardMaterial({ map: sbTex, roughness: 0.45, metalness: 0.3 }))
  sb.position.set(0, 9.5, -(W / 2 + 6.8)); scene.add(sb)
  out.setScore = (as, hs, label = '') => {
    const g = sbCv.getContext('2d'); g.fillStyle = T.lithoBlue; g.fillRect(0, 0, 512, 160)
    g.fillStyle = T.litho; g.fillRect(0, 0, 512, 10); g.fillRect(0, 150, 512, 10)
    g.font = '900 30px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = T.line; g.fillText(away.abbrev || '', 90, 38); g.fillText(home.abbrev || '', 422, 38); g.fillText(label, 256, 38)
    for (const [x, v] of [[90, as], [422, hs]]) { g.fillStyle = T.backboard; g.fillRect(x - 70, 62, 140, 80); g.fillStyle = T.ink; g.font = '900 70px Impact, "Arial Narrow", sans-serif'; g.fillText(String(v), x, 104) }
    sbTex.needsUpdate = true
  }
  out.setScore(0, 0, 'Q1')
  // FLASH BULBS in the printed crowd (the first basket, a called man clearing his bar): little white bursts and a light
  const bulbs = Array.from({ length: 26 }, (_, k) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(T.lamp), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    const onFar = k < 16, x = onFar ? -L / 2 + (k + 0.5) * (L / 16) : (k % 2 ? 1 : -1) * (L / 2 + 6.8), z = onFar ? -(W / 2 + 6.7) : -W / 2 + ((k - 16) / 10) * W
    sp.position.set(x, 1.4 + ((k * 37) % 5) * 0.6, z); sp.scale.set(1.6, 1.6, 1); scene.add(sp); return { sp, ph: (k * 53) % 17 }
  })
  const pop = new THREE.PointLight(new THREE.Color(T.lamp), 0, 220, 1.2); pop.position.set(0, 70, -40); scene.add(pop)
  out.flash = (f, t) => {
    let lit = 0
    for (const b of bulbs) { const on = f > 0 && Math.floor(t / 90 + b.ph) % 7 === 0 ? f : 0; b.sp.material.opacity = on; lit += on }
    pop.intensity = Math.min(1, lit / 4) * 260
  }
  // EACH FRAME: the director's scene (lib/tabletop/tinDirector.js sceneAt) for the ten men on the floor. dt is replay ms
  // (the pieces slide at a toy's pace in game time); snap puts every man straight on his spot (a jump in the replay).
  const V = 0.11, MIN = 3.4
  const figOf = {}
  out.render = ({ L, sc, players: who = players, statusOf = () => 'off', dt = 16, t = 0, snap = false }) => {
    for (const k of Object.keys(figOf)) delete figOf[k]
    for (const club of ['home', 'away']) figs[club].forEach((f, j) => {
      const id = L?.[club]?.[j] || null
      // a substitution: the piece spins on its bracket and comes round as the new man
      if (f.id !== id) { if (f.id == null || snap) { f.id = id; reprint(f, who[id]?.jersey ?? null) } else if (!f.flip) f.flip = { p: 0, to: id } }
      if (f.flip) { f.flip.p += dt / 380; if (f.flip.p >= 0.5 && f.id !== f.flip.to) { f.id = f.flip.to; reprint(f, who[f.id]?.jersey ?? null) } if (f.flip.p >= 1) f.flip = null }
      figOf[id] = f
    })
    // slide toward each spot (a pinned man -- the shooter at his release -- gets there fast)
    const all = [...figs.home, ...figs.away]
    for (const f of all) {
      const to = sc.spots?.[f.id]
      if (!to) { f.moving = 0; continue }
      const dx = to.x - f.g.position.x, dz = to.z - f.g.position.z, d = Math.hypot(dx, dz)
      const step = snap ? d : Math.min(d, dt * V * (sc.pin?.includes(f.id) ? 4 : 1))
      if (d > 0.001) { f.g.position.x += (dx / d) * step; f.g.position.z += (dz / d) * step }
      f.moving = snap ? 0 : Math.min(1, step / Math.max(1, dt * V * 0.5))
    }
    // no two bases on top of each other (a pinned man holds his spot; the other gives way)
    for (let a = 0; a < all.length; a += 1) for (let b = a + 1; b < all.length; b += 1) {
      const A = all[a], B = all[b], dx = B.g.position.x - A.g.position.x, dz = B.g.position.z - A.g.position.z, d = Math.hypot(dx, dz)
      if (d >= MIN || !A.id || !B.id) continue
      const push = (MIN - d) / 2, nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0
      const ap = sc.pin?.includes(A.id), bp = sc.pin?.includes(B.id)
      if (!ap) { A.g.position.x -= nx * push * (bp ? 2 : 1); A.g.position.z -= nz * push * (bp ? 2 : 1) }
      if (!bp) { B.g.position.x += nx * push * (ap ? 2 : 1); B.g.position.z += nz * push * (ap ? 2 : 1) }
    }
    // the pose: the hop, the spin, the lever toward his rim, the rattle while he slides, the called glow
    for (const club of ['home', 'away']) for (const f of figs[club]) {
      const a = sc.acts?.[f.id] || {}, rim = rimOf(club)
      const rattle = f.moving * (0.16 + 0.1 * Math.sin(t * 0.07 + f.phase))
      f.body.position.y = (a.hop || 0) + Math.abs(Math.sin(t * 0.09 + f.phase)) * rattle
      f.body.rotation.z = Math.sin(t * 0.11 + f.phase) * 0.07 * f.moving
      f.figure.rotation.y = (a.spin || 0) + (f.flip ? f.flip.p * Math.PI * 2 : 0)
      f.flipper.rotation.y = Math.atan2(-(rim.Z - f.g.position.z), rim.X - f.g.position.x)
      f.flipper.rotation.z = (a.lever || 0) * 0.9
      // the ring always; the tag only while he is in the play (the ball is his, or he is the one acting), so a floor of
      // called men doesn't read as a wall of labels
      const called = statusOf(f.id) === 'called', inPlay = sc.ball?.hold === f.id || sc.ev?.who === f.id || Boolean(a.hop || a.spin)
      f.ring.visible = called; f.tag.visible = called && inPlay
      if (called) { f.tag.position.y = 12.4 + (a.hop || 0); f.ring.material.emissiveIntensity = 2 + Math.sin(t * 0.006) * 0.6 }
    }
    // the ball: in a man's hands, or where the director says
    const bl = sc.ball || {}
    if (bl.hold && figOf[bl.hold]) { const f = figOf[bl.hold]; ball.position.set(f.g.position.x, HANDS + f.body.position.y, f.g.position.z + 0.45) }
    else if (Number.isFinite(bl.x)) ball.position.set(bl.x, bl.y, bl.z)
    ball.visible = true
    for (const sx of [-1, 1]) nets[sx].rotation.x = bl.made != null && Math.sign(bl.x) === sx ? Math.sin(bl.made * Math.PI * 3) * 0.14 * (1 - bl.made) : 0
    out.focus.copy(ball.position)
    out.figAt = (id) => figOf[id]?.g.position || null
  }
  out.dispose = () => { pmrem.dispose(); env.dispose() }
  return out
}
