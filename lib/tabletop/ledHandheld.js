// 🔴 THE RED LED HANDHELD (2026-10-23, BUCKETS prototype B). Donovan: "the 70s LED". Our original in the style of the
// late-70s electronic handhelds (no maker's name or mark): a black plastic body lying on a table, a smoked red window over
// a grid of round LEDs with the court printed on the glass, a seven-segment score window above it, a four-way pad and a
// big red SHOOT key, a three-way power slide. The game plays on it as those games did: the shooter is the bright blip,
// the five defenders glow dim, the ball blip steps cell by cell to the basket and the basket blinks on a make.
//
// What sits where on the grid comes from the shot's real spot (the nearest cell); the defenders' cells are drawn (the
// play-by-play has no defenders) -- the caption says so. Units: inches x 2 (the body is 30 x 18). Returns the same
// { update(play, u, t, beat), idle(t), setScore(away, home, label), focus } as the tin court.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { LED, TINCOURT } from '../nba/theme'
import { toCourt, BASKET_X } from '../nba/plays'
import { wornPaint } from './wear'

const COLS = 11, ROWS = 5                 // the rims are the grid's end cells, middle row
const BW = 30, BD = 18, BH = 2.2          // the body
const SW = 22, SD = 7.4, SZ = 0            // the LED window (width, depth, its centre's z)
const SCW = 18.4, SCD = 1.8, SCZ = -6.0   // the score window
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }
const cellOf = (X, Z) => [Math.max(0, Math.min(COLS - 1, Math.round(((X + BASKET_X) / (2 * BASKET_X)) * (COLS - 1)))), Math.max(0, Math.min(ROWS - 1, Math.round(((Z + 25) / 50) * (ROWS - 1))))]
const RIM = { home: [COLS - 1, 2], away: [0, 2] }

// a seven-segment digit: which of a..g light
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' }
function digit(g, x, y, w, h, ch, lit, off) {
  const t = w * 0.16, on = SEG[ch] ?? ''
  const bar = (id, bx, by, bw, bh) => { g.fillStyle = on.includes(id) ? lit : off; g.beginPath(); g.roundRect(bx, by, bw, bh, t / 2); g.fill() }
  const sk = (yy) => x + (h - (yy - y)) * 0.08   // a slight lean, as the old displays had
  bar('a', sk(y) + t, y, w - 2 * t, t)
  bar('g', sk(y + h / 2) + t, y + h / 2 - t / 2, w - 2 * t, t)
  bar('d', sk(y + h) + t, y + h - t, w - 2 * t, t)
  bar('f', sk(y + h / 4), y + t * 0.6, t, h / 2 - t * 1.1); bar('b', sk(y + h / 4) + w - t, y + t * 0.6, t, h / 2 - t * 1.1)
  bar('e', sk(y + 3 * h / 4), y + h / 2 + t * 0.5, t, h / 2 - t * 1.1); bar('c', sk(y + 3 * h / 4) + w - t, y + h / 2 + t * 0.5, t, h / 2 - t * 1.1)
}

/** The printed top plate: lettering, key legends, the slide's positions, the clubs under their scores. Transparent where
 *  the black body shows. */
function topPrint(home, away, accent) {
  const PX = 40, cv = canvas(BW * PX, BD * PX), g = cv.getContext('2d')
  const X = (x) => (x + BW / 2) * PX, Y = (z) => (z + BD / 2) * PX
  g.fillStyle = LED.print; g.textAlign = 'center'; g.textBaseline = 'middle'
  // a thin printed frame round the window, the product's stripe under it
  g.strokeStyle = LED.print; g.lineWidth = 3; g.beginPath(); g.roundRect(X(-SW / 2 - 1.1), Y(SCZ - SCD / 2 - 1.0), (SW + 2.2) * PX, (SZ + SD / 2 + 1.0 - (SCZ - SCD / 2 - 1.0)) * PX, 18); g.stroke()
  g.fillStyle = accent; g.fillRect(X(-SW / 2 - 1.1), Y(SZ + SD / 2 + 1.35), (SW + 2.2) * PX, 0.22 * PX)
  g.fillStyle = LED.print
  // the clubs over their scores, the quarter and the clock (the digits' centres in the score window)
  g.font = `800 ${0.55 * PX}px "Arial Narrow", Arial, sans-serif`
  const lab = SCZ - SCD / 2 - 1.35
  g.fillText(away.abbrev || 'AWAY', X(-6.35), Y(lab)); g.fillText('QTR', X(-3.16), Y(lab)); g.fillText('TIME', X(0.7), Y(lab)); g.fillText(home.abbrev || 'HOME', X(5.9), Y(lab))
  // the name, big, and the line under it
  g.font = `900 ${1.25 * PX}px Impact, "Arial Narrow", sans-serif`; g.fillText('BUCKETS', X(0), Y(6.25))
  g.font = `700 ${0.48 * PX}px "Arial Narrow", Arial, sans-serif`; g.fillText('E L E C T R O N I C   B A S K E T B A L L', X(0), Y(7.35))
  g.font = `800 ${0.42 * PX}px "Arial Narrow", Arial, sans-serif`; g.fillText('D A S H   N E T W O R K', X(0), Y(8.25))
  // the keys' legends
  g.font = `800 ${0.5 * PX}px "Arial Narrow", Arial, sans-serif`
  g.fillText('MOVE', X(-10.6), Y(8.25)); g.fillText('SHOOT', X(10.6), Y(8.25))
  g.font = `800 ${0.36 * PX}px "Arial Narrow", Arial, sans-serif`
  g.fillText('OFF', X(-13.6), Y(-5.2)); g.fillText('PRO 1', X(-12.3), Y(-5.2)); g.fillText('PRO 2', X(-11.0), Y(-5.2))
  // the speaker grille: a block of slots
  for (let k = 0; k < 6; k += 1) { g.fillStyle = LED.key; g.beginPath(); g.roundRect(X(10.7 + k * 0.5), Y(-6.0), 0.22 * PX, 1.4 * PX, 4); g.fill() }
  return tex(cv)
}

/** The court printed on the window glass, the LEDs under it (off, a dull red), and the lit layer (drawn each frame). */
function courtGlass() {
  const cv = canvas(1100, 370), g = cv.getContext('2d'), w = cv.width, h = cv.height
  g.fillStyle = LED.screen; g.fillRect(0, 0, w, h)
  g.strokeStyle = LED.on; g.globalAlpha = 0.28; g.lineWidth = 3
  g.strokeRect(14, 14, w - 28, h - 28)
  g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2, h - 14); g.stroke()
  g.beginPath(); g.arc(w / 2, h / 2, 46, 0, Math.PI * 2); g.stroke()
  for (const s of [-1, 1]) {
    const bx = s < 0 ? 14 : w - 14
    g.strokeRect(s < 0 ? 14 : w - 14 - 190, h / 2 - 70, 190, 140)
    g.beginPath(); g.arc(s < 0 ? 14 + 190 : w - 14 - 190, h / 2, 70, -Math.PI / 2, Math.PI / 2, s > 0); g.stroke()
    g.beginPath(); g.arc(bx, h / 2, 330, s < 0 ? -1.15 : Math.PI - 1.15, s < 0 ? 1.15 : Math.PI + 1.15); g.stroke()
  }
  g.globalAlpha = 1
  return cv
}
const cellPx = (c, r, w, h) => [60 + (c / (COLS - 1)) * (w - 120), 52 + (r / (ROWS - 1)) * (h - 104)]

export function buildLedHandheld(scene, renderer, { home, away, accent }) {
  const out = { focus: new THREE.Vector3(), update: () => {}, idle: () => {}, setScore: () => {} }
  if (typeof document === 'undefined') return out
  scene.background = new THREE.Color(LED.screen).multiplyScalar(0.18)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  // the table and a desk lamp
  const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: new THREE.Color(TINCOURT.table), roughness: 0.7 }))
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table)
  scene.add(new THREE.HemisphereLight(new THREE.Color(TINCOURT.lamp), new THREE.Color(TINCOURT.night), 0.35))
  const lamp = new THREE.SpotLight(new THREE.Color(TINCOURT.lamp), 900, 160, 0.55, 0.6, 1.6); lamp.position.set(-26, 60, -14); lamp.castShadow = true
  lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.05
  scene.add(lamp); scene.add(lamp.target)
  // the body: black plastic, worn (the scuffs a toy gets in a schoolbag), with a seam round its middle
  const dev = new THREE.Group(); dev.rotation.y = -0.05; scene.add(dev)
  // plastic, not paint: it scuffs and scratches (the wear map's relief) but has no paint to chip
  const scuffed = (color, v, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), bumpMap: wornPaint(color, 'hard', v).bumpMap || null, bumpScale: 0.25, roughness: 0.45, envMap: env, envMapIntensity: 0.35, ...extra })
  const bodyMat = scuffed(LED.body, 1)
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 6, 1.4), bodyMat); body.position.y = BH / 2 + 0.05; body.castShadow = true; body.receiveShadow = true; dev.add(body)
  const seam = new THREE.Mesh(new RoundedBoxGeometry(BW + 0.06, 0.08, BD + 0.06, 4, 1.4), new THREE.MeshStandardMaterial({ color: new THREE.Color(LED.bezel), roughness: 0.6 })); seam.position.y = BH * 0.42; dev.add(seam)
  const top = BH + 0.06
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshStandardMaterial({ map: topPrint(home, away, accent), transparent: true, roughness: 0.5, depthWrite: false }))
  plate.rotation.x = -Math.PI / 2; plate.position.y = top + 0.005; dev.add(plate)
  // the window: a raised bezel, the LED panel under smoked glass
  const bezelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(LED.bezel), roughness: 0.35, envMap: env, envMapIntensity: 0.5 })
  const frame = (w, d, z, y = top) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.6, -d / 2 - 0.6); s.lineTo(w / 2 + 0.6, -d / 2 - 0.6); s.lineTo(w / 2 + 0.6, d / 2 + 0.6); s.lineTo(-w / 2 - 0.6, d / 2 + 0.6)
    const hole = new THREE.Path(); hole.moveTo(-w / 2, -d / 2); hole.lineTo(-w / 2, d / 2); hole.lineTo(w / 2, d / 2); hole.lineTo(w / 2, -d / 2); s.holes.push(hole)
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }), bezelMat)
    m.rotation.x = -Math.PI / 2; m.position.set(0, y - 0.05, z); m.castShadow = true; dev.add(m)
  }
  frame(SW, SD, SZ); frame(SCW, SCD, SCZ)
  const glassCv = courtGlass(), base = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), new THREE.MeshBasicMaterial({ map: tex(glassCv), color: new THREE.Color(1.9, 1.9, 1.9) }))
  base.rotation.x = -Math.PI / 2; base.position.set(0, top + 0.012, SZ); dev.add(base)
  // the lit layer: an additive plane, bright enough that the bloom catches each LED
  const litCv = canvas(glassCv.width, glassCv.height), litTex = tex(litCv)
  const lit = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), new THREE.MeshBasicMaterial({ map: litTex, color: new THREE.Color(3.2, 3.2, 3.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: true }))
  lit.rotation.x = -Math.PI / 2; lit.position.set(0, top + 0.024, SZ); dev.add(lit)
  // the smoked glass on top: it catches the lamp
  const glassMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(LED.screen), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.08, envMap: env, envMapIntensity: 0.22 })
  for (const [w, d, z] of [[SW, SD, SZ], [SCW, SCD, SCZ]]) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), glassMat); gl.rotation.x = -Math.PI / 2; gl.position.set(0, top + 0.28, z); dev.add(gl) }
  // the score window (seven-segment digits, under the same glass)
  const segCv = canvas(1024, 100), segTex = tex(segCv)
  const seg = new THREE.Mesh(new THREE.PlaneGeometry(SCW, SCD), new THREE.MeshBasicMaterial({ map: segTex, color: new THREE.Color(2.6, 2.6, 2.6) }))
  seg.rotation.x = -Math.PI / 2; seg.position.set(0, top + 0.012, SCZ); dev.add(seg)
  // the keys: a four-way pad on the left, the big SHOOT on the right, the power slide in its slot
  const keyMat = scuffed(LED.key, 2, { roughness: 0.4, envMapIntensity: 0.4 })
  const pad = new THREE.Group(); pad.position.set(-10.6, top, 6.4); dev.add(pad)
  const pads = []
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const k = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.5, 1.1, 3, 0.18), keyMat); k.position.set(dx * 1.15, 0.25, dz * 1.15); k.castShadow = true; pad.add(k); pads.push(k)
  }
  const shoot = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.7, 40), scuffed(LED.shoot, 3, { roughness: 0.3, envMapIntensity: 0.6 }))
  shoot.position.set(10.6, top + 0.35, 6.2); shoot.castShadow = true; dev.add(shoot)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: new THREE.Color(LED.screen).multiplyScalar(0.2) })); slot.position.set(-12.3, top + 0.01, -6.0); dev.add(slot)
  const slide = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.5, 0.7, 2, 0.12), keyMat); slide.position.set(-12.3, top + 0.25, -6.0); slide.castShadow = true; dev.add(slide)
  // four screws on the back corners show at the top edge; a battery cover seam on the bottom (it's lying flat: unseen)
  for (const [x, z] of [[-13.4, -7.6], [13.4, -7.6], [-13.4, 7.6], [13.4, 7.6]]) {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(TINCOURT.tin), metalness: 0.9, roughness: 0.3, envMap: env })); sc.position.set(x, top + 0.01, z); dev.add(sc)
  }
  // world position of a grid cell (for the focus)
  const cellWorld = (c, r) => dev.localToWorld(new THREE.Vector3(-SW / 2 + ((cellPx(c, r, litCv.width, litCv.height)[0]) / litCv.width) * SW, top, SZ - SD / 2 + (cellPx(c, r, litCv.width, litCv.height)[1] / litCv.height) * SD))

  // THE GRID, drawn each frame: a cell's glow and its hot centre
  const lg = litCv.getContext('2d')
  const offG = glassCv.getContext('2d')
  for (let c = 0; c < COLS; c += 1) for (let r = 0; r < ROWS; r += 1) { const [x, y] = cellPx(c, r, glassCv.width, glassCv.height); offG.fillStyle = LED.off; offG.beginPath(); offG.arc(x, y, 12, 0, Math.PI * 2); offG.fill(); offG.strokeStyle = LED.dim; offG.lineWidth = 2; offG.stroke() }
  base.material.map.needsUpdate = true
  const blip = (c, r, level) => {
    if (level <= 0) return
    const [x, y] = cellPx(c, r, litCv.width, litCv.height)
    const grad = lg.createRadialGradient(x, y, 0, x, y, 24)
    const col = new THREE.Color(LED.on)
    const rgba = (a) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`
    grad.addColorStop(0, rgba(level)); grad.addColorStop(0.42, rgba(level * 0.9)); grad.addColorStop(0.55, rgba(level * 0.25)); grad.addColorStop(1, rgba(0))
    lg.fillStyle = grad; lg.beginPath(); lg.arc(x, y, 24, 0, Math.PI * 2); lg.fill()
  }
  let shown = { as: 0, hs: 0, label: '' }
  const drawSeg = () => {
    const g = segCv.getContext('2d'); g.clearRect(0, 0, 1024, 100)
    const on = LED.on, off = LED.off
    const num = (v, n) => String(Math.max(0, v ?? 0)).padStart(n, ' ').slice(-n)
    const [q, clk] = shown.label.split(' ')
    const row = [...num(shown.as, 3), ' ', ...(q || ' ').replace(/\D/g, '').slice(-1).padStart(1, ' '), ' ', ...(clk || '    ').replace(':', '').padStart(4, ' ').slice(-4), ' ', ...num(shown.hs, 3)]
    let x = 47
    row.forEach((ch, k) => {
      if (ch === ' ' && (k === 3 || k === 5 || k === 10)) { x += 30; return }
      digit(g, x, 12, 52, 76, ch, on, off); x += 74
      if (k === 7) { g.fillStyle = on; g.beginPath(); g.arc(x - 8, 36, 4.5, 0, Math.PI * 2); g.moveTo(x - 7, 66); g.arc(x - 12, 66, 4.5, 0, Math.PI * 2); g.fill() }   // the clock's colon
    })
    segTex.needsUpdate = true
  }
  out.setScore = (as, hs, label = '') => { if (as === shown.as && hs === shown.hs && label === shown.label) return; shown = { as, hs, label }; drawSeg() }
  drawSeg()
  // a seeded spread of five defenders round the basket the shooter attacks (drawn, not data)
  const defenders = (club, sc, seed) => {
    const [rc, rr] = RIM[club], dir = club === 'home' ? -1 : 1
    const cells = [[rc + dir * 1, 1], [rc + dir * 1, 3], [rc + dir * 2, 2], [rc + dir * 3, 0], [rc + dir * 3, 4]]
    // one defender steps toward the shooter (he's guarded)
    const g = [sc[0] - dir * 0 + (sc[0] > rc ? -1 : sc[0] < rc ? 1 : 0), sc[1] + (sc[1] > rr ? -1 : sc[1] < rr ? 1 : 0)]
    cells[seed % 5] = g
    return cells.filter(([c, r]) => !(c === sc[0] && r === sc[1]) && c >= 0 && c < COLS)
  }
  let cur = null
  out.update = (p, u, t, beat = 'shot') => {
    lg.clearRect(0, 0, litCv.width, litCv.height)
    if (!p) { litTex.needsUpdate = true; return }
    if (!cur || cur.p !== p) {
      const s = p.club === 'home' ? 1 : -1
      const from = p.spot ? toCourt(p.spot, p.club) : { X: s * (BASKET_X - 13.75), Z: 0 }
      let sc = cellOf(from.X, from.Z)
      if (sc[0] === RIM[p.club][0] && sc[1] === RIM[p.club][1]) sc = [sc[0] - s, sc[1]]   // a dunk: he stands one cell out
      cur = { p, sc, rim: RIM[p.club], def: defenders(p.club, sc, (p.n * 31) % 97) }
    }
    const { sc, rim, def } = cur
    if (beat === 'quarter') {
      // the break: the grid chases left to right, as the old games did between quarters
      const col = Math.floor(t / 70) % COLS
      for (let r = 0; r < ROWS; r += 1) blip(col, r, 0.9)
      litTex.needsUpdate = true; out.focus.copy(cellWorld(5, 2)); return
    }
    const blink = (hz) => (Math.floor(t / (500 / hz)) % 2 ? 1 : 0)
    for (const [c, r] of def) blip(c, r, 0.28)
    blip(sc[0], sc[1], 1)
    // the ball: held (blinking with him), then it steps cell by cell to the rim
    const steps = Math.max(1, Math.max(Math.abs(rim[0] - sc[0]), Math.abs(rim[1] - sc[1])))
    let ballCell = sc
    if (beat === 'three') { ballCell = rim; blip(rim[0], rim[1], blink(8)); for (const [c, r] of def) blip(c, r, blink(4) * 0.5) }
    else if (u < 0.18) blip(sc[0], sc[1], blink(10) * 0.6 + 0.4)
    else if (u < 0.78) {
      const k = Math.min(steps, Math.floor(((u - 0.18) / 0.6) * (steps + 1)))
      ballCell = [Math.round(sc[0] + ((rim[0] - sc[0]) * k) / steps), Math.round(sc[1] + ((rim[1] - sc[1]) * k) / steps)]
      blip(ballCell[0], ballCell[1], 1)
    } else if (p.made) { ballCell = rim; blip(rim[0], rim[1], blink(10)) }
    else {
      // a miss: the rim blinks once, the ball comes off one cell to the side and goes dark
      const f = (u - 0.78) / 0.22
      if (f < 0.35) blip(rim[0], rim[1], 1)
      else if (f < 0.85) { ballCell = [rim[0] + (p.club === 'home' ? -1 : 1), (rim[1] + (p.n % 2 ? 1 : -1))]; blip(ballCell[0], ballCell[1], 0.8) }
    }
    // the keys: SHOOT goes down as he lets it go, the pad's arrow toward the rim as the ball travels
    shoot.position.y = top + 0.35 - (u > 0.1 && u < 0.24 && beat === 'shot' ? 0.22 : 0)
    pads.forEach((k, i) => { k.position.y = 0.25 - (beat === 'shot' && u > 0.24 && u < 0.7 && i === (p.club === 'home' ? 3 : 2) ? 0.16 : 0) })
    litTex.needsUpdate = true
    out.focus.copy(cellWorld(ballCell[0], ballCell[1]))
  }
  out.idle = () => { lg.clearRect(0, 0, litCv.width, litCv.height); litTex.needsUpdate = true }
  out.dispose = () => { pmrem.dispose(); env.dispose() }
  out.device = dev
  return out
}
