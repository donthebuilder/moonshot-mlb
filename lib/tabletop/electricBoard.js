// 🏈 THE ELECTRIC BOARD (2026-10-23, TUDDY). Donovan: make the football replay look like "them little vibrating football
// games" -- a 70s classic board played as a night game. Our original in the style of the toy (no maker's name or mark):
// a painted tin field with a gold-tint tin rim, cream enamel lines and numbers, paint worn through to the tin where hands
// and figures rub it, the end zones painted in each club's colours, a printed-cardboard crowd backdrop with a DASH
// scoreboard, four little light towers, all on a walnut table in a dark room.
//
// SAME FRAME AS lib/fieldWorld.js: feet, x downfield (the 50 at x = 0, the home goal line at x = -150), z across, y up;
// lib/nfl/drives.js paths land on it unchanged. Returns { lamps, focusFloor }.
import * as THREE from 'three'
import { TABLETOP as T } from '../nfl/theme'

export const BOARD = { L: 360, W: 160, RIM: 14, EZ: 30 }   // the painted field (120 x 53.3 yd in feet), the rim, an end zone

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const rnd = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

/** The painted field, as one canvas: stripes, enamel lines with a hand-painted wobble, the numbers, hashes, the end
 *  zones in the clubs' colours with their names, and wear down to the tin. 8 px a foot along, 8 across. */
function fieldPaint({ home, away }) {
  const PX = 8, cw = BOARD.L * PX, ch = BOARD.W * PX
  const cv = canvas(cw, ch), g = cv.getContext('2d'), r = rnd(11)
  const X = (ft) => (ft + BOARD.L / 2) * PX   // world x -> canvas x
  const Z = (ft) => (ft + BOARD.W / 2) * PX
  // the tin under it all, then the paint
  g.fillStyle = T.tin; g.fillRect(0, 0, cw, ch)
  for (let k = 0; k < 20; k += 1) { g.fillStyle = k % 2 ? T.paint2 : T.paint; g.fillRect(X(-150 + k * 15), 0, 15 * PX + 1, ch) }
  // end zones: each club's colour, its name painted across
  for (const [side, x0] of [[home, -180], [away, 150]]) {
    g.fillStyle = side.color || T.paint2; g.fillRect(X(x0), 0, BOARD.EZ * PX, ch)
    g.save(); g.translate(X(x0 + BOARD.EZ / 2), ch / 2); g.rotate(x0 < 0 ? -Math.PI / 2 : Math.PI / 2)
    g.fillStyle = side.alt || T.enamel; g.font = `900 ${18 * PX}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(String(side.abbrev || ''), 0, 0); g.restore()
  }
  // enamel: a line drawn by hand -- a little wobble, a little thicker in places
  const line = (x0, z0, x1, z1, wpx) => {
    g.strokeStyle = T.enamel; g.lineWidth = wpx; g.lineCap = 'round'; g.beginPath()
    const n = 12; for (let k = 0; k <= n; k += 1) { const f = k / n; const x = x0 + (x1 - x0) * f + (r() - 0.5) * 0.25, z = z0 + (z1 - z0) * f + (r() - 0.5) * 0.25; if (k) g.lineTo(X(x), Z(z)); else g.moveTo(X(x), Z(z)) }
    g.stroke()
  }
  for (let yd = 0; yd <= 100; yd += 5) line(-150 + yd * 3, -80, -150 + yd * 3, 80, yd % 50 === 0 || yd === 0 || yd === 100 ? 9 : 6)
  line(-180, -80, 180, -80, 10); line(-180, 80, 180, 80, 10); line(-180, -80, -180, 80, 10); line(180, -80, 180, 80, 10)
  for (let yd = 1; yd < 100; yd += 1) for (const z of [-78, -9.25, 9.25, 78]) { const x = -150 + yd * 3; line(x, z - 1, x, z + 1, 4) }
  // the numbers, both sides, upright to each sideline
  g.fillStyle = T.enamel; g.font = `900 ${9 * PX}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  for (let yd = 10; yd <= 90; yd += 10) {
    const n = String(yd <= 50 ? yd : 100 - yd), x = -150 + yd * 3
    for (const [z, rot] of [[-56, Math.PI], [56, 0]]) { g.save(); g.translate(X(x), Z(z)); g.rotate(rot); g.fillText(n, 0, 0); g.restore() }
  }
  // WEAR: the paint rubbed through to the tin where it's played most -- between the hashes and along the lines
  // (short scuffs along the field, the way figures drag; most between the hashes)
  for (let k = 0; k < 700; k += 1) {
    const x = (r() - 0.5) * 300, z = (r() - 0.5) * (r() < 0.7 ? 24 : 150)
    g.globalAlpha = 0.04 + r() * 0.1; g.fillStyle = T.tin
    g.beginPath(); g.ellipse(X(x), Z(z), (0.6 + r() * 2.2) * PX, (0.12 + r() * 0.3) * PX, (r() - 0.5) * 0.3, 0, Math.PI * 2); g.fill()
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

/** The printed crowd backdrop: cardboard, rows of tiny heads in a halftone of colours, a DASH scoreboard in the middle. */
function crowdPrint({ home, away, accent }) {
  const cv = canvas(3072, 640), g = cv.getContext('2d'), r = rnd(23)
  g.fillStyle = T.card; g.fillRect(0, 0, 3072, 640)
  const inks = [home.color, away.color, home.alt, away.alt, T.ink, T.tin].filter(Boolean)
  for (let row = 0; row < 26; row += 1) {
    const y = 120 + row * 19, rad = 4 + row * 0.2
    for (let x = 6 + (row % 2) * 9; x < 3072; x += 17) {
      g.globalAlpha = 0.55 + r() * 0.4; g.fillStyle = inks[Math.floor(r() * inks.length)]
      g.beginPath(); g.arc(x + (r() - 0.5) * 4, y, rad * (0.7 + r() * 0.5), 0, Math.PI * 2); g.fill()
    }
  }
  g.globalAlpha = 1
  // the roof line and the scoreboard
  g.fillStyle = T.ink; g.fillRect(0, 0, 3072, 70); g.fillRect(0, 96, 3072, 8)
  g.fillRect(1236, 10, 600, 180)
  g.fillStyle = accent; g.fillRect(1250, 24, 572, 10)
  g.fillStyle = T.card; g.font = '900 72px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('DASH NETWORK', 1536, 92); g.font = '900 44px Impact, "Arial Narrow", sans-serif'; g.fillStyle = accent; g.fillText('TUDDY', 1536, 152)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

function woodTable() {
  const cv = canvas(1024, 1024), g = cv.getContext('2d'), r = rnd(5)
  g.fillStyle = T.table; g.fillRect(0, 0, 1024, 1024)
  for (let k = 0; k < 220; k += 1) { g.globalAlpha = 0.15 + r() * 0.3; g.strokeStyle = T.tableGrain; g.lineWidth = 1 + r() * 3; g.beginPath(); const y = r() * 1024; g.moveTo(0, y); g.bezierCurveTo(300, y + (r() - 0.5) * 40, 700, y + (r() - 0.5) * 40, 1024, y + (r() - 0.5) * 30); g.stroke() }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3)
  return t
}

/** Build the board in `scene`. home / away: { abbrev, color, alt } (ESPN's club colours). accent: the product's colour. */
export function buildElectricBoard(scene, { home, away, accent }) {
  const out = { lamps: [] }
  if (typeof document === 'undefined') return out
  scene.background = new THREE.Color(T.night)
  scene.fog = new THREE.Fog(new THREE.Color(T.night), 700, 1500)
  // the table
  const table = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: woodTable(), roughness: 0.7, metalness: 0 }))
  table.rotation.x = -Math.PI / 2; table.position.y = -6; table.receiveShadow = true; scene.add(table)
  // the board: a tin tray (the field plate, a raised rim), painted on top
  const tin = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tin), metalness: 0.75, roughness: 0.35 })
  const plate = new THREE.Mesh(new THREE.BoxGeometry(BOARD.L + 2 * BOARD.RIM, 5, BOARD.W + 2 * BOARD.RIM), tin)
  plate.position.y = -2.6; plate.receiveShadow = true; scene.add(plate)
  const field = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.L, BOARD.W), new THREE.MeshStandardMaterial({ map: fieldPaint({ home, away }), metalness: 0.25, roughness: 0.42 }))
  field.rotation.x = -Math.PI / 2; field.position.y = 0.02; field.receiveShadow = true; scene.add(field)
  out.field = field
  // the rim: four raised tin rails, rolled edge
  const rail = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, len, 16, 1), tin)
    m.rotation.z = Math.PI / 2; m.rotation.y = rotY; m.position.set(x, 1.6, z); m.castShadow = true; scene.add(m)
  }
  rail(BOARD.L + 2 * BOARD.RIM, 0, -(BOARD.W / 2 + BOARD.RIM - 2), 0); rail(BOARD.L + 2 * BOARD.RIM, 0, BOARD.W / 2 + BOARD.RIM - 2, 0)
  rail(BOARD.W + 2 * BOARD.RIM, -(BOARD.L / 2 + BOARD.RIM - 2), 0, Math.PI / 2); rail(BOARD.W + 2 * BOARD.RIM, BOARD.L / 2 + BOARD.RIM - 2, 0, Math.PI / 2)
  // goalposts: thin gold wire on the end lines
  const wire = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tin), metalness: 0.8, roughness: 0.3 })
  for (const s of [-1, 1]) {
    const gp = new THREE.Group(), cyl = (rad, h, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 10), wire); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; gp.add(m) }
    cyl(0.5, 12, 0, 6, 0); cyl(0.4, 20, 0, 12, 0, Math.PI / 2); for (const z of [-10, 10]) cyl(0.35, 26, 0, 25, z)
    gp.position.x = s * (BOARD.L / 2); scene.add(gp)
  }
  // the backdrop: printed cardboard standing behind the far sideline, leaning back a touch, on a little tin stand
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.L + 40, 76), new THREE.MeshStandardMaterial({ map: crowdPrint({ home, away, accent }), roughness: 0.9, metalness: 0, side: THREE.DoubleSide }))
  back.position.set(0, 36, -(BOARD.W / 2 + BOARD.RIM + 6)); back.rotation.x = -0.12; back.castShadow = true; back.receiveShadow = true; scene.add(back)
  // NIGHT GAME: four little light towers at the corners, each a lit bank and a warm spot on the field; a key light for
  // the figures' shadows; the room barely lit
  scene.add(new THREE.HemisphereLight(new THREE.Color(T.lamp), new THREE.Color(T.night), 0.35))
  const key = new THREE.DirectionalLight(new THREE.Color(T.lamp), 1.25)
  key.position.set(-160, 420, 260); key.castShadow = true
  const c = key.shadow.camera; c.left = -260; c.right = 260; c.top = 200; c.bottom = -200; c.near = 50; c.far = 1200
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.5
  scene.add(key); scene.add(key.target)
  const towerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tinDark), metalness: 0.6, roughness: 0.5 })
  const bankMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(T.lamp) })
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (BOARD.L / 2 + BOARD.RIM + 10), z = sz * (BOARD.W / 2 + BOARD.RIM + 10)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 120, 10), towerMat); pole.position.set(x, 54, z); pole.castShadow = true; scene.add(pole)
    const bank = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 3), bankMat); bank.position.set(x, 116, z); bank.lookAt(0, 0, 0); scene.add(bank)
    const spot = new THREE.SpotLight(new THREE.Color(T.lamp), 2.2, 900, 0.55, 0.6, 1)
    spot.position.set(x, 116, z); spot.target.position.set(-sx * 40, 0, -sz * 20); scene.add(spot); scene.add(spot.target)
    out.lamps.push(bank)
  }
  return out
}
