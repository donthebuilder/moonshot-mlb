// 🏟 PROP BUILDER for SprayFieldStadium (2026-09-01). Turns lib/parkProps.js
// entries into three.js objects and adds them to the scene. Kept out of the
// stadium component because that file is already the scene, the camera, the
// flights and the hover; the props are a vocabulary of their own.
//
// Everything here is drawn with the stadium's OWN helpers, passed in:
//   P(r, ang)  → Vector3 on the field plane (the one function every position
//                in the stadium routes through, so props cannot drift from
//                the walls or the balls)
//   wallD(ang) / wallH(ang) → the fence at that angle
// Angles beyond ±45 are clamped for the wall lookup, the same way the decks
// clamp, so a prop "beyond the wall" past the foul lines still has a radius.
//
// Materials are Lambert so the night rig lights them like the stands, with
// fog left ON for far things (rooftops, skyline) so they sit in the night
// rather than in front of it. Signs and water are Basic — they are their own
// light.
import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { propsFor } from './parkProps'

const DEG = Math.PI / 180
const clamp45 = (a) => Math.max(-45, Math.min(45, a))
// a numeric colour as a canvas fill — numbers, so the literal budget
// (scripts/check-scales) stays what it is
const css = (hex) => '#' + new THREE.Color(hex).getHexString()

// A phrase as a sprite, sized to its text. Same idea as the stadium's own
// labelSprite; duplicated here rather than exported from a component file.
function textSprite(text, hex, w, h, glow) {
  const cv = document.createElement('canvas')
  const g0 = cv.getContext('2d')
  g0.font = '900 48px SF Mono, Menlo, monospace'
  const tw = Math.ceil(g0.measureText(text).width) + 40
  cv.width = Math.max(tw, 160); cv.height = 72
  const g = cv.getContext('2d')
  g.font = '900 48px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  const col = '#' + new THREE.Color(hex).getHexString()
  if (glow) { g.shadowColor = col; g.shadowBlur = 18 }
  g.fillStyle = col
  g.globalAlpha = 0.95
  g.fillText(text, cv.width / 2, 38)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  // keep the text's own aspect; `w` is the width in feet, `h` a ceiling
  const asp = cv.width / cv.height
  const sw = w, sh = Math.min(h, w / asp)
  s.scale.set(sw, sh, 1)
  return s
}

// A window grid as a texture — a warehouse or a rooftop is a box, and a box
// with lit windows is a building.
function windowTex(cols, rows, base, lit) {
  const cv = document.createElement('canvas')
  cv.width = cols * 8; cv.height = rows * 8
  const g = cv.getContext('2d')
  g.fillStyle = '#' + new THREE.Color(base).getHexString()
  g.fillRect(0, 0, cv.width, cv.height)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const on = Math.random() < lit
    g.fillStyle = on ? `rgba(255,220,160,${0.55 + Math.random() * 0.4})` : 'rgba(0,0,0,.35)'
    g.fillRect(c * 8 + 2, r * 8 + 2, 4, 4)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.magFilter = THREE.NearestFilter
  return tex
}

// A water normal map, drawn rather than loaded: a heightfield of summed
// sines, differentiated into normals, encoded RGB. Tiles.
let waterNormals = null
function makeWaterNormals(size = 256) {
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2
    h[y * size + x] = Math.sin(u * 3 + v * 1.5) * 0.5 + Math.sin(u * 7 - v * 4) * 0.25 + Math.sin(u * 13 + v * 11) * 0.12 + Math.sin(v * 5 - u * 2) * 0.3 + Math.sin(u * 2.3 - v * 3.1 + 1.7) * 0.4
  }
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const img = g.createImageData(size, size)
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1)
    const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize()
    const i = (y * size + x) * 4
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}
// three's reflective Water on any flat geometry — the Cove, the Allegheny,
// the fountain pool, Chase's pool. Reflects the park and the sky, ripples
// with time. `steps` is the park's per-frame list.
// Water mirrors across the mesh's LOCAL +z, so the geometry must lie in
// the XY plane (like a PlaneGeometry) and the mesh is tilted flat here.
function liveWater(geo, color, steps, { size = 512, distortion = 2.4, y = 0.6, rotZ = 0 } = {}) {
  if (!waterNormals) waterNormals = makeWaterNormals()
  const w = new Water(geo, {
    textureWidth: size, textureHeight: size,
    waterNormals, sunDirection: new THREE.Vector3(0.3, -0.02, -0.9).normalize(),
    sunColor: 0xffd9ae, waterColor: new THREE.Color(color).multiplyScalar(0.55), distortionScale: distortion, fog: true, alpha: 0.9,
  })
  w.rotation.x = -Math.PI / 2
  w.rotation.z = rotZ
  w.position.y = y
  w.userData.noShadow = true
  steps.push((t) => { w.material.uniforms.time.value = t / 1000 * 0.6 })
  return w
}

export function addParkProps(scene, { venue, P, wallD, wallH, steps = [], extra = [] }) {
  // `extra`: props the WORLD adds for every park of a kind (the generic
  // videoboard, the roof trusses) — same vocabulary, decided in stadiumWorld
  const props = [...propsFor(venue), ...extra]
  if (!props.length) return
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra })
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...extra })
  // a point `off` feet beyond the wall at `a`, optionally raised
  const beyond = (a, off, y = 0) => { const v = P(wallD(clamp45(a)) + off, a); v.y = y; return v }
  // face the plate: a mesh whose +Z should look at home
  const faceHome = (m) => { m.lookAt(0, m.position.y, 0) }

  // a curved sheet following the wall arc from `y0` to `y1`, `off` beyond
  // the wall, from angle `from` to `to`. Used by paint, boxes, arcade, frieze.
  const sheet = (from, to, off, y0, y1, mat, steps = 2) => {
    const pos = []
    for (let a = from; a < to; a += steps) {
      const b = Math.min(to, a + steps)
      const p0 = beyond(a, off), p1 = beyond(b, off)
      pos.push(
        p0.x, y0, p0.z, p1.x, y0, p1.z, p0.x, y1, p0.z,
        p1.x, y0, p1.z, p1.x, y1, p1.z, p0.x, y1, p0.z,
      )
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat)
    scene.add(m)
    return m
  }
  // a flat wedge of the plane between two radii and two angles (water, pool)
  const wedge = (from, to, r0f, r1f, y, mat) => {
    const pos = []
    for (let a = from; a < to; a += 2) {
      const b = Math.min(to, a + 2)
      const i0 = P(r0f(a), a), i1 = P(r0f(b), b), o0 = P(r1f(a), a), o1 = P(r1f(b), b)
      pos.push(i0.x, y, i0.z, i1.x, y, i1.z, o1.x, y, o1.z, i0.x, y, i0.z, o1.x, y, o1.z, o0.x, y, o0.z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat)
    scene.add(m)
    return m
  }

  props.forEach((p) => {
    switch (p.kind) {
      // ── PAINT: the wall's face in the park's own colour (Monster green,
      //    Wrigley ivy). Drawn a hair inside the wall so it wins the depth
      //    test, at the wall's real height at every angle.
      case 'paint': {
        const pos = []
        for (let a = p.from; a < p.to; a += 1) {
          const b = Math.min(p.to, a + 1)
          const p0 = P(wallD(a) - 0.4, a), p1 = P(wallD(b) - 0.4, b)
          const h0 = wallH(a), h1 = wallH(b)
          pos.push(p0.x, 0, p0.z, p1.x, 0, p1.z, p0.x, h0, p0.z, p1.x, 0, p1.z, p1.x, h1, p1.z, p0.x, h0, p0.z)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        // the night rig is dim by design (the balls are the light), so the
        // paint carries a little of its own or the Monster reads as black
        scene.add(new THREE.Mesh(g, lam(p.color, { emissive: p.color, emissiveIntensity: 0.5 })))
        break
      }
      // ── LADDER: two rails and rungs up the wall face at one angle
      case 'ladder': {
        const base = P(wallD(p.a) - 1.0, p.a)
        const rail = basic(0x3a3f45)
        const dir = P(1, p.a + 90).normalize()   // along the wall
        for (const s of [-1, 1]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, p.h, 0.5), rail)
          r.position.set(base.x + dir.x * s * 1.1, p.y + p.h / 2, base.z + dir.z * s * 1.1)
          scene.add(r)
        }
        for (let k = 0; k < Math.floor(p.h / 1.6); k++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), rail)
          rung.position.set(base.x, p.y + 0.8 + k * 1.6, base.z)
          rung.rotation.y = -p.a * DEG
          scene.add(rung)
        }
        break
      }
      // ── BOXES: a slab of seats riding the top of a wall (Monster seats,
      //    Crawford Boxes) — a short deck with a lit rail
      case 'boxes': {
        sheet(p.from, p.to, p.off, p.y, p.y + p.h, lam(p.color, { emissive: p.color, emissiveIntensity: 0.35 }))
        // the flat top, a little darker
        wedge(p.from, p.to, (a) => wallD(clamp45(a)) + p.off, (a) => wallD(clamp45(a)) + p.off + p.depth, p.y + p.h,
          lam(new THREE.Color(p.color).multiplyScalar(0.8)))
        sheet(p.from, p.to, p.off + p.depth, p.y + p.h - 2, p.y + p.h, basic(0xf59e0b))
        break
      }
      // ── SIGN: a lit phrase floating at a height, facing home
      case 'sign': {
        const s = textSprite(p.text, p.color, p.w, p.h, p.glow)
        const v = beyond(p.a, p.off, p.y)
        s.position.copy(v)
        scene.add(s)
        if (p.glow) {
          const pl = new THREE.PointLight(p.color, 0.35, 260)
          pl.position.copy(v); scene.add(pl)
        }
        break
      }
      // ── BOARD: a scoreboard box with a lit face (Wrigley's hand board)
      case 'board': {
        const v = beyond(p.a, p.off, p.y + p.h / 2)
        const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 6), lam(p.color))
        box.position.copy(v); faceHome(box); scene.add(box)
        const face = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 0.9, p.h * 0.8),
          new THREE.MeshBasicMaterial({ map: windowTex(18, 8, 0x1e2e22, 0.5), side: THREE.DoubleSide }))
        face.position.copy(v); faceHome(face); face.translateZ(3.2); scene.add(face)
        if (p.text) {
          const s = textSprite(p.text, 0xf4f4f5, p.w * 0.9, 6, false)
          s.position.set(v.x, p.y + p.h + 4, v.z); scene.add(s)
        }
        // legs
        const leg = lam(0x1a1e24)
        for (const s of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(2, p.y, 2), leg)
          const dir = P(1, p.a + 90).normalize()
          l.position.set(v.x + dir.x * s * p.w * 0.4, p.y / 2, v.z + dir.z * s * p.w * 0.4)
          scene.add(l)
        }
        break
      }
      // ── ROOFTOPS: a row of buildings across the street, lit windows on
      //    top — the Wrigley rooftops. Fog stays on: they are across a street.
      case 'rooftops': {
        const step = (p.to - p.from) / p.n
        for (let i = 0; i < p.n; i++) {
          const a = p.from + step * (i + 0.5)
          const h = p.h * (0.8 + Math.random() * 0.4)
          const w = 52
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 40),
            new THREE.MeshLambertMaterial({ map: windowTex(6, Math.round(h / 8), p.color, 0.35) }))
          const v = beyond(a, p.off, h / 2)
          b.position.copy(v); faceHome(b); scene.add(b)
          // the rooftop bleacher — a small lit rail on top
          const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.2, 1.2), basic(0xf4d58d))
          rail.position.set(v.x, h + 0.6, v.z); rail.rotation.y = b.rotation.y; rail.translateZ(-18); scene.add(rail)
        }
        break
      }
      // ── ROCKS: a pile of grey boulders in the open sector (Coors)
      case 'rocks': {
        const c = beyond(p.a, p.off)
        const dir = P(1, p.a + 90).normalize()
        for (let i = 0; i < p.n; i++) {
          const r = 4 + Math.random() * 6
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0),
            lam(new THREE.Color(p.color).multiplyScalar(0.75 + Math.random() * 0.4)))
          const t = (i / (p.n - 1) - 0.5) * p.spread
          m.position.set(c.x + dir.x * t, r * 0.6, c.z + dir.z * t + (Math.random() - 0.5) * 14)
          m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
          scene.add(m)
        }
        break
      }
      // ── PINES / PALMS: cones on sticks, spread along an arc
      case 'pines': {
        const c = beyond(p.a, p.off)
        const dir = P(1, p.a + 90).normalize()
        for (let i = 0; i < p.n; i++) {
          const h = p.h * (0.75 + Math.random() * 0.5)
          const t = (i / Math.max(1, p.n - 1) - 0.5) * p.spread
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, h * 0.55, 6), lam(0x3b2a1e))
          trunk.position.set(c.x + dir.x * t, h * 0.275, c.z + dir.z * t); scene.add(trunk)
          const crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.22, h * 0.6, 7), lam(0x1f4a2c))
          crown.position.set(c.x + dir.x * t, h * 0.55 + h * 0.3, c.z + dir.z * t); scene.add(crown)
        }
        break
      }
      // ── WATER: a flat sheet beyond the wall in an open sector (the Cove,
      //    the Allegheny, the fountain pool). Basic, slightly glossy, with a
      //    faint moon-lit rim so it reads as water and not asphalt.
      case 'water': {
        // real water (2026-09-02): the wedge's geometry, built flat at y=0 in
        // the XZ plane, handed to three's Water, which reflects the park
        // and the sky in it and ripples with time
        const flat = wedge(p.from, p.to, (a) => wallD(clamp45(a)) + p.off, (a) => wallD(clamp45(a)) + p.off + p.depth, 0, basic(p.color))
        scene.remove(flat)
        const geo = flat.geometry
        // Water's shader expects a geometry facing +y with UVs; the wedge
        // has none, so give it planar ones
        const pp = geo.getAttribute('position'); const uv = []
        for (let i = 0; i < pp.count; i++) uv.push(pp.getX(i) / 220, pp.getZ(i) / 220)
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        // XZ → XY so the mesh's -90° tilt puts it back flat with +z up
        geo.rotateX(Math.PI / 2)
        scene.add(liveWater(geo, p.color, steps, { y: 0.6 }))
        break
      }
      // ── POOL: Chase's rectangle, bright blue, with a pale deck
      case 'pool': {
        const v = beyond(p.a, p.off + p.d / 2)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(p.w + 10, 1.2, p.d + 10), lam(0xcfc6b8))
        deck.position.set(v.x, 0.6, v.z); faceHome(deck); scene.add(deck)
        const pg = new THREE.PlaneGeometry(p.w, p.d)
        const pool = liveWater(pg, p.color, steps, { size: 256, distortion: 1.2, y: 1.3, rotZ: -p.a * DEG })
        pool.position.x = v.x; pool.position.z = v.z
        scene.add(pool)
        const pl = new THREE.PointLight(p.color, 0.5, 120)
        pl.position.set(v.x, 8, v.z); scene.add(pl)
        break
      }
      // ── FOUNTAINS: columns of spray, lit from below (Kauffman, Coors)
      case 'fountains': {
        const step = (p.to - p.from) / Math.max(1, p.n - 1)
        for (let i = 0; i < p.n; i++) {
          const a = p.n === 1 ? (p.from + p.to) / 2 : p.from + step * i
          const h = p.h * (i % 2 === 0 ? 1 : 0.7)
          const v = beyond(a, p.off, p.y || 0)
          // a plume: narrow at the nozzle, wide at the top, and a soft
          // cap of mist — water, not a lamp post
          const jet = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, 0.6, h, 10, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }))
          jet.position.set(v.x, v.y + h / 2, v.z); scene.add(jet)
          const mist = new THREE.Mesh(new THREE.SphereGeometry(h * 0.22, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0xe0f0ff, transparent: true, opacity: 0.32, depthWrite: false, fog: false }))
          mist.position.set(v.x, v.y + h * 0.98, v.z); mist.scale.y = 0.55; scene.add(mist)
          if (i % 2 === 0) {
            const pl = new THREE.PointLight(0xbfdbfe, 0.35, 110)
            pl.position.set(v.x, v.y + 6, v.z); scene.add(pl)
          }
        }
        break
      }
      // ── ARCADE: a brick wall with a row of arches (Oracle's RF)
      case 'arcade': {
        sheet(p.from, p.to, p.off + 0.6, 0, p.h, lam(p.color))
        const n = Math.max(3, Math.round((p.to - p.from) / 1.6))
        for (let i = 0; i < n; i++) {
          const a = p.from + ((i + 0.5) / n) * (p.to - p.from)
          const v = beyond(a, p.off + 0.2, p.h * 0.32)
          const arch = new THREE.Mesh(new THREE.CircleGeometry(p.h * 0.26, 16, 0, Math.PI), basic(0x14100e))
          arch.position.copy(v); faceHome(arch); scene.add(arch)
          const leg = new THREE.Mesh(new THREE.PlaneGeometry(p.h * 0.52, p.h * 0.32), basic(0x14100e))
          leg.position.set(v.x, p.h * 0.16, v.z); faceHome(leg); scene.add(leg)
        }
        break
      }
      // ── FRIEZE: the scalloped white band along the top of the upper deck
      case 'frieze': {
        sheet(p.from, p.to, p.off, p.y, p.y + p.h, basic(p.color, { transparent: true, opacity: 0.6 }), 2)
        // the scallops: a row of half-discs hanging under the band
        for (let a = p.from; a < p.to; a += 2.5) {
          const v = beyond(a + 1.25, p.off - 0.5, p.y)
          const sc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 12, Math.PI, Math.PI), basic(p.color, { transparent: true, opacity: 0.6 }))
          sc.position.copy(v); faceHome(sc); scene.add(sc)
        }
        break
      }
      // ── BRIDGE: a lit span across the open sector, with two towers
      case 'bridge': {
        const a0 = beyond(p.from, p.off, p.y), a1 = beyond(p.to, p.off, p.y)
        const len = a0.distanceTo(a1)
        const mid = a0.clone().add(a1).multiplyScalar(0.5)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 14), lam(p.color))
        deck.position.copy(mid); deck.lookAt(a1.x, p.y, a1.z); deck.rotateY(Math.PI / 2); scene.add(deck)
        // two suspension arcs, one each side of the deck
        const side = P(1, (p.from + p.to) / 2).normalize()   // radial, i.e. across the deck
        for (const s of [-1, 1]) {
          const o = side.clone().multiplyScalar(s * 6)
          const curve = new THREE.QuadraticBezierCurve3(
            a0.clone().add(o), new THREE.Vector3(mid.x, p.y + len * 0.16, mid.z).add(o), a1.clone().add(o))
          scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.2, 6, false), basic(p.color)))
        }
        for (const t of [0.22, 0.78]) {
          const v = a0.clone().lerp(a1, t)
          const tower = new THREE.Mesh(new THREE.BoxGeometry(4, p.y + len * 0.16, 4), lam(p.color))
          tower.position.set(v.x, (p.y + len * 0.16) / 2, v.z); scene.add(tower)
        }
        for (let i = 0; i <= 12; i++) {
          const v = a0.clone().lerp(a1, i / 12)
          const pl = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 6), basic(0xfff1b8, { fog: false }))
          pl.position.set(v.x, p.y + 2.6, v.z); scene.add(pl)
        }
        break
      }
      // ── SKYLINE: a row of tall dark blocks far beyond the open sector
      case 'skyline': {
        const step = (p.to - p.from) / p.n
        for (let i = 0; i < p.n; i++) {
          const a = p.from + step * (i + 0.5)
          const h = p.h * (0.45 + Math.random() * 0.8)
          const b = new THREE.Mesh(new THREE.BoxGeometry(48 + Math.random() * 30, h, 40),
            new THREE.MeshLambertMaterial({ map: windowTex(6, Math.round(h / 10), p.color, 0.3) }))
          const v = beyond(a, p.off + Math.random() * 120, h / 2)
          b.position.copy(v); faceHome(b); scene.add(b)
        }
        break
      }
      // ── BUILDING: one long box with windows (the warehouse)
      case 'building': {
        const v = beyond(p.a, p.off + p.d / 2, p.h / 2)
        const b = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d),
          new THREE.MeshLambertMaterial({ map: p.windows ? windowTex(Math.round(p.w / 12), Math.round(p.h / 9), p.color, 0.28) : null, color: p.windows ? 0xffffff : p.color }))
        b.position.copy(v); faceHome(b); scene.add(b)
        break
      }
      // ── ORB: one lit sphere (the apple)
      case 'orb': {
        const v = beyond(p.a, p.off, p.y)
        const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 18, 14), lam(p.color, { emissive: p.color, emissiveIntensity: 0.35 }))
        m.position.copy(v); scene.add(m)
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, p.r * 0.6, 6), lam(0x3b2a1e))
        stem.position.set(v.x, p.y + p.r, v.z); scene.add(stem)
        break
      }
      // ══ THE DETAIL PASS (2026-09-02). Donovan: "go crazy, make the parks
      //    more detailed now that you have upgrades." Eighteen new kinds, all
      //    things a fan would name from a seat behind the plate. Still no
      //    logos: a scoreboard is a scoreboard, a train is a train.

      // ── WALLBOARD: the hand-operated line score set INTO a wall (the
      //    Monster). A dark panel with a grid of lit number cells.
      case 'wallboard': {
        const p0 = beyond(p.from, -1.2), p1 = beyond(p.to, -1.2)
        const w = p0.distanceTo(p1)
        const cv = document.createElement('canvas')
        cv.width = 512; cv.height = 128
        const g = cv.getContext('2d')
        g.fillStyle = css(p.color || 0x17301f)
        g.fillRect(0, 0, 512, 128)
        const cols = 22, rows = 4
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const on = Math.random() < 0.55
          g.fillStyle = on ? (r < 2 ? 'rgba(255,240,200,.9)' : 'rgba(255,220,90,.9)') : 'rgba(0,0,0,.4)'
          g.fillRect(6 + c * 23, 10 + r * 28, 15, 20)
        }
        const tex = new THREE.CanvasTexture(cv)
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, p.h),
          new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }))
        const mid = p0.clone().lerp(p1, 0.5); mid.y = p.y + p.h / 2
        m.position.copy(mid); faceHome(m); scene.add(m)
        break
      }
      // ── BASKET: the chain-link basket that leans out over the field from
      //    the wall top (Wrigley). A wireframe strip, tilted.
      case 'basket': {
        const pos = []
        for (let a = p.from; a < p.to; a += 1.5) {
          const b = Math.min(p.to, a + 1.5)
          const i0 = P(wallD(clamp45(a)) - 0.2, a), i1 = P(wallD(clamp45(b)) - 0.2, b)
          const o0 = P(wallD(clamp45(a)) - 3.6, a), o1 = P(wallD(clamp45(b)) - 3.6, b)
          const y0 = wallH(clamp45(a)) - 3.2, y1 = wallH(clamp45(b)) - 3.2
          pos.push(i0.x, y0, i0.z, i1.x, y1, i1.z, o0.x, y0 + 3.6, o0.z, i1.x, y1, i1.z, o1.x, y1 + 3.6, o1.z, o0.x, y0 + 3.6, o0.z)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        const m = new THREE.Mesh(g, basic(0x8a949e, { wireframe: true, transparent: true, opacity: 0.55 }))
        m.userData.noShadow = true; scene.add(m)
        break
      }
      // ── GARDEN: a low plaque wall with a hedge behind it (Monument Park)
      case 'garden': {
        sheet(p.from, p.to, p.off, 0, p.h, lam(0x2c3440))
        for (let a = p.from + 1; a < p.to; a += 2) {
          const v = beyond(a, p.off - 0.3, p.h * 0.55)
          const pl = new THREE.Mesh(new THREE.CircleGeometry(0.9, 10), basic(0xc9a781))
          pl.position.copy(v); faceHome(pl); scene.add(pl)
        }
        for (let a = p.from; a <= p.to; a += 2.5) {
          const v = beyond(a, p.off + 5)
          const bush = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 1.5, 8, 6), lam(0x1e4028))
          bush.position.set(v.x, 2.4, v.z); bush.scale.y = 0.8; scene.add(bush)
        }
        break
      }
      // ── HEXBOARD: a hexagonal scoreboard on two legs (Dodger's pair)
      case 'hexboard': {
        const v = beyond(p.a, p.off, p.y)
        const grp = new THREE.Group()
        const hex = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 4, 6), lam(p.color || 0x1b2a44))
        hex.rotation.x = Math.PI / 2; hex.rotation.y = Math.PI / 6; grp.add(hex)
        const face = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.8, 6),
          new THREE.MeshBasicMaterial({ map: windowTex(16, 12, 0x0d1830, 0.45), side: THREE.DoubleSide }))
        face.rotation.z = Math.PI / 6; face.position.z = 2.2; grp.add(face)
        grp.position.copy(v); faceHome(grp); scene.add(grp)
        const leg = lam(0x1a1e24)
        const dir = P(1, p.a + 90).normalize()
        for (const s of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(2, p.y, 2), leg)
          l.position.set(v.x + dir.x * s * p.r * 0.5, p.y / 2, v.z + dir.z * s * p.r * 0.5); scene.add(l)
        }
        break
      }
      // ── ZIGZAG: the folded-plate roof over the outfield pavilions (Dodger)
      case 'zigzag': {
        const pos = []
        let i = 0
        for (let a = p.from; a < p.to; a += 3, i++) {
          const b = Math.min(p.to, a + 3)
          const p0 = beyond(a, p.off, p.y), p1 = beyond(b, p.off, p.y)
          const q0 = beyond(a, p.off + p.depth, p.y + (i % 2 ? p.h : 0)), q1 = beyond(b, p.off + p.depth, p.y + (i % 2 ? 0 : p.h))
          pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, q0.x, q0.y, q0.z, p1.x, p1.y, p1.z, q1.x, q1.y, q1.z, q0.x, q0.y, q0.z)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        scene.add(new THREE.Mesh(g, lam(p.color || 0xdad8d0, { emissive: p.color || 0xdad8d0, emissiveIntensity: 0.18 })))
        // the posts holding it up
        for (let a = p.from; a <= p.to; a += 6) {
          const v = beyond(a, p.off + p.depth * 0.5)
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, p.y, 6), lam(0x2a3038))
          post.position.set(v.x, p.y / 2, v.z); scene.add(post)
        }
        break
      }
      // ── SEATROW: one row of seats in a colour (Coors' purple row at a mile)
      case 'seatrow': {
        sheet(p.from, p.to, p.off, p.y, p.y + 1.8, basic(p.color, { transparent: true, opacity: 0.9 }))
        break
      }
      // ── BOTTLE: the giant soda bottle leaning over the LF stands (Oracle)
      case 'bottle': {
        const v = beyond(p.a, p.off, p.y)
        const grp = new THREE.Group()
        const glass = lam(p.color || 0x2f9a4f, { transparent: true, opacity: 0.85, emissive: p.color || 0x2f9a4f, emissiveIntensity: 0.25 })
        const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 0.92, p.h * 0.62, 14), glass)
        body.position.y = p.h * 0.31; grp.add(body)
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.45, p.r, p.h * 0.2, 14), glass)
        shoulder.position.y = p.h * 0.72; grp.add(shoulder)
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.4, p.r * 0.45, p.h * 0.14, 12), glass)
        neck.position.y = p.h * 0.89; grp.add(neck)
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.46, p.r * 0.46, p.h * 0.05, 12), lam(0xc0282f))
        cap.position.y = p.h * 0.985; grp.add(cap)
        grp.rotation.z = (p.tilt || 22) * DEG
        grp.position.copy(v); grp.rotateY(-p.a * DEG); scene.add(grp)
        break
      }
      // ── GLOVE: the old four-fingered mitt (Oracle), a flattened brown ball
      //    with a thumb, tilted toward the plate
      case 'glove': {
        const v = beyond(p.a, p.off, p.y)
        const grp = new THREE.Group()
        const leather = lam(p.color || 0x6b4526)
        const palm = new THREE.Mesh(new THREE.SphereGeometry(p.r, 16, 12), leather)
        palm.scale.set(1, 1.05, 0.42); grp.add(palm)
        for (let i = 0; i < 4; i++) {
          const f = new THREE.Mesh(new THREE.CapsuleGeometry(p.r * 0.2, p.r * 0.5, 4, 8), leather)
          f.position.set((i - 1.5) * p.r * 0.42, p.r * 0.95, 0); grp.add(f)
        }
        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(p.r * 0.2, p.r * 0.45, 4, 8), leather)
        thumb.position.set(-p.r * 0.95, p.r * 0.2, 0); thumb.rotation.z = 0.8; grp.add(thumb)
        grp.position.copy(v); faceHome(grp); grp.rotateX(-0.35); scene.add(grp)
        break
      }
      // ── CROWN: the crown-topped scoreboard in centre (Kauffman)
      case 'crown': {
        const v = beyond(p.a, p.off, p.y + p.h / 2)
        const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 8), lam(0x1f2937))
        box.position.copy(v); faceHome(box); scene.add(box)
        const face = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 0.9, p.h * 0.82),
          new THREE.MeshBasicMaterial({ map: windowTex(24, 14, 0x0b1a2e, 0.5), side: THREE.DoubleSide }))
        face.position.copy(v); faceHome(face); face.translateZ(4.2); scene.add(face)
        const gold = lam(p.color || 0xd4a72c, { emissive: p.color || 0xd4a72c, emissiveIntensity: 0.45 })
        const dir = P(1, p.a + 90).normalize()
        const n = 5
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1) - 0.5) * p.w * 0.8
          const sh = p.h * (i === 2 ? 0.55 : i % 2 ? 0.4 : 0.3)
          const spike = new THREE.Mesh(new THREE.ConeGeometry(p.w * 0.08, sh, 4), gold)
          spike.position.set(v.x + dir.x * t, p.y + p.h + sh / 2, v.z + dir.z * t); spike.rotation.y = -p.a * DEG; scene.add(spike)
          const tip = new THREE.Mesh(new THREE.SphereGeometry(p.w * 0.03, 8, 6), basic(0xfff1b8, { fog: false }))
          tip.position.set(v.x + dir.x * t, p.y + p.h + sh + 1, v.z + dir.z * t); scene.add(tip)
        }
        const base = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.95, 3, 10), gold)
        base.position.set(v.x, p.y + p.h + 1, v.z); faceHome(base); scene.add(base)
        for (const s of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(3, p.y, 3), lam(0x1a1e24))
          l.position.set(v.x + dir.x * s * p.w * 0.35, p.y / 2, v.z + dir.z * s * p.w * 0.35); scene.add(l)
        }
        break
      }
      // ── TRUSSES: the steel arches a retractable roof rides on. Drawn
      //    OPEN — the panels are parked beyond the outfield, the arches stay.
      case 'trusses': {
        const steel = lam(p.color || 0x3d4652)
        const n = p.n || 3
        for (let k = 0; k < n; k++) {
          const off = p.off + k * (p.gap || 42)
          const a0 = beyond(p.from, off, p.y0 || 60), a1 = beyond(p.to, off, p.y0 || 60)
          const mid = a0.clone().add(a1).multiplyScalar(0.5)
          const peak = new THREE.Vector3(mid.x, p.y, mid.z)
          const top = new THREE.QuadraticBezierCurve3(a0, new THREE.Vector3(mid.x, p.y * 2 - (p.y0 || 60), mid.z), a1)
          scene.add(new THREE.Mesh(new THREE.TubeGeometry(top, 40, 2.2, 6, false), steel))
          const lo = new THREE.QuadraticBezierCurve3(a0.clone().setY(a0.y - 12), new THREE.Vector3(mid.x, p.y * 2 - (p.y0 || 60) - 24, mid.z), a1.clone().setY(a1.y - 12))
          scene.add(new THREE.Mesh(new THREE.TubeGeometry(lo, 40, 1.4, 6, false), steel))
          for (let i = 1; i < 16; i++) {
            const t = i / 16
            const u = top.getPoint(t), d = lo.getPoint(t)
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, u.distanceTo(d), 4), steel)
            strut.position.copy(u.clone().lerp(d, 0.5)); scene.add(strut)
            if (i % 3 === 0) {
              const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 6), basic(0xfff1b8, { fog: false }))
              lamp.position.copy(u); lamp.position.y += 2.6; scene.add(lamp)
            }
          }
          for (const e of [a0, a1]) {
            const col = new THREE.Mesh(new THREE.BoxGeometry(6, e.y, 6), steel)
            col.position.set(e.x, e.y / 2, e.z); scene.add(col)
          }
          void peak
        }
        break
      }
      // ── TRAIN: the locomotive on its track along the top of the LF wall
      //    (Daikin), pulling a car of oranges. Slides a few feet and back.
      case 'train': {
        const p0 = beyond(p.from, p.off, p.y), p1 = beyond(p.to, p.off, p.y)
        const len = p0.distanceTo(p1)
        const mid = p0.clone().lerp(p1, 0.5)
        const along = p1.clone().sub(p0).normalize()
        const heading = Math.atan2(along.x, along.z)
        for (const s of [-1.6, 1.6]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, len), basic(0x6b7280))
          rail.position.set(mid.x, p.y, mid.z); rail.rotation.y = heading; rail.translateX(s); scene.add(rail)
        }
        const grp = new THREE.Group()
        const black = lam(0x15181d), orange = lam(p.color || 0xe8701a, { emissive: p.color || 0xe8701a, emissiveIntensity: 0.25 })
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 20, 12), black)
        boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 4.6, 6); grp.add(boiler)
        const cab = new THREE.Mesh(new THREE.BoxGeometry(7.5, 8, 8), orange)
        cab.position.set(0, 5.2, -8); grp.add(cab)
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 5, 8), black)
        stack.position.set(0, 10, 12); grp.add(stack)
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), basic(0xfff1b8, { fog: false }))
        lamp.position.set(0, 5.4, 16.4); grp.add(lamp)
        const hl = new THREE.PointLight(0xffe9c0, 0.35, 90); hl.position.set(0, 5, 20); grp.add(hl)
        for (const s of [-3.6, 3.6]) for (const z of [-9, -2, 5, 11]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.6, 12), black)
          w.rotation.z = Math.PI / 2; w.position.set(s, 2, z); grp.add(w)
        }
        // the tender: a low car heaped with oranges
        const car = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 14), black)
        car.position.set(0, 3.4, -22); grp.add(car)
        for (let i = 0; i < 26; i++) {
          const o = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), orange)
          o.position.set((Math.random() - 0.5) * 5.5, 6 + Math.random() * 1.6, -22 + (Math.random() - 0.5) * 12); grp.add(o)
        }
        grp.position.copy(mid); grp.rotation.y = heading
        scene.add(grp)
        const base = mid.clone()
        steps.push((t) => {
          const d = Math.sin(t / 1000 * 0.35) * Math.min(40, len * 0.3)
          grp.position.set(base.x + along.x * d, base.y, base.z + along.z * d)
        })
        break
      }
      // ── ARCH: a great parabolic arch in the skyline (Busch's Gateway)
      case 'arch': {
        const c = beyond(p.a, p.off)
        const dir = P(1, p.a + 90).normalize()
        const e0 = c.clone().add(dir.clone().multiplyScalar(-p.w / 2)), e1 = c.clone().add(dir.clone().multiplyScalar(p.w / 2))
        const curve = new THREE.QuadraticBezierCurve3(e0, new THREE.Vector3(c.x, p.h * 2, c.z), e1)
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, p.w * 0.03, 8, false),
          lam(p.color || 0xb9bfc7, { emissive: p.color || 0xb9bfc7, emissiveIntensity: 0.2 }))
        scene.add(m)
        break
      }
      // ── STACKS: twin smokestacks beyond the wall with a lit crown, and a
      //    slow plume (Great American)
      case 'stacks': {
        const dir = P(1, p.a + 90).normalize()
        const c = beyond(p.a, p.off)
        for (const s of [-1, 1]) {
          const x = c.x + dir.x * s * p.gap / 2, z = c.z + dir.z * s * p.gap / 2
          const st = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.8, p.r, p.h, 12), lam(p.color || 0x8a2a2a))
          st.position.set(x, p.h / 2, z); scene.add(st)
          const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r * 0.85, 0.6, 6, 18), basic(0xfff1b8, { fog: false }))
          ring.rotation.x = Math.PI / 2; ring.position.set(x, p.h - 3, z); scene.add(ring)
          const pl = new THREE.PointLight(0xffb070, 0.4, 160); pl.position.set(x, p.h + 4, z); scene.add(pl)
          const plume = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.3, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xcfd6dd, transparent: true, opacity: 0.18, depthWrite: false }))
          plume.position.set(x, p.h + p.r * 1.5, z); plume.userData.noShadow = true; scene.add(plume)
          steps.push((t) => { const k = 1 + 0.25 * Math.sin(t / 1000 * 0.7 + s); plume.scale.set(k, 1.4 * k, k); plume.position.y = p.h + p.r * 1.5 + 2 * Math.sin(t / 1000 * 0.4) })
        }
        break
      }
      // ── PINWHEELS: the row of spinning pinwheels atop the board (Rate Field)
      case 'pinwheels': {
        const v = beyond(p.a, p.off, p.y + p.h / 2)
        const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 6), lam(0x1f2937))
        box.position.copy(v); faceHome(box); scene.add(box)
        const face = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 0.9, p.h * 0.8),
          new THREE.MeshBasicMaterial({ map: windowTex(24, 10, 0x101a2a, 0.5), side: THREE.DoubleSide }))
        face.position.copy(v); faceHome(face); face.translateZ(3.2); scene.add(face)
        const cv = document.createElement('canvas'); cv.width = cv.height = 128
        const g = cv.getContext('2d')
        const cols = [0xe8e8e8, 0xd7263d, 0xe8e8e8, 0x1e5bc6, 0xe8e8e8, 0xf4c430, 0xe8e8e8, 0x2f9a4f].map(css)
        for (let i = 0; i < 8; i++) {
          g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 62, i * Math.PI / 4, (i + 1) * Math.PI / 4); g.closePath()
          g.fillStyle = cols[i]; g.fill()
        }
        const tex = new THREE.CanvasTexture(cv)
        const dir = P(1, p.a + 90).normalize()
        const n = p.n || 7, r = p.h * 0.36
        const wheels = []
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1) - 0.5) * p.w * 0.84
          const w = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }))
          w.position.set(v.x + dir.x * t, p.y + p.h + r + 1.5, v.z + dir.z * t); faceHome(w); scene.add(w); wheels.push(w)
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, r + 2, 6), lam(0x1a1e24))
          stem.position.set(v.x + dir.x * t, p.y + p.h + (r + 2) / 2, v.z + dir.z * t); scene.add(stem)
        }
        steps.push((t) => { wheels.forEach((w, i) => { w.rotation.z = t / 1000 * (0.6 + i * 0.07) }) })
        for (const s of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(2, p.y, 2), lam(0x1a1e24))
          l.position.set(v.x + dir.x * s * p.w * 0.4, p.y / 2, v.z + dir.z * s * p.w * 0.4); scene.add(l)
        }
        break
      }
      // ── BIGA: the giant letter with a halo (Angel's, out in the lot)
      case 'biga': {
        const v = beyond(p.a, p.off)
        const grp = new THREE.Group()
        const red = lam(p.color || 0xc8102e, { emissive: p.color || 0xc8102e, emissiveIntensity: 0.3 })
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(p.h * 0.1, p.h, p.h * 0.06), red)
          leg.position.set(s * p.h * 0.16, p.h / 2, 0); leg.rotation.z = -s * 0.3; grp.add(leg)
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(p.h * 0.34, p.h * 0.08, p.h * 0.06), red)
        bar.position.y = p.h * 0.42; grp.add(bar)
        const halo = new THREE.Mesh(new THREE.TorusGeometry(p.h * 0.16, p.h * 0.022, 8, 28), basic(0xfff1b8, { fog: false }))
        halo.position.y = p.h * 1.06; halo.rotation.x = 1.25; grp.add(halo)
        const pl = new THREE.PointLight(0xfff1b8, 0.5, 220); pl.position.y = p.h * 1.06; grp.add(pl)
        grp.position.copy(v); faceHome(grp); scene.add(grp)
        break
      }
      // ── BELL: a bronze bell hanging in a yoke, lit (Citizens Bank)
      case 'bell': {
        const v = beyond(p.a, p.off, p.y)
        const pts = []
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(p.r * (0.25 + 0.75 * Math.pow(t, 1.8)), p.r * 1.4 * (1 - t))) }
        const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), lam(p.color || 0xb08d57, { emissive: p.color || 0xb08d57, emissiveIntensity: 0.4 }))
        bell.position.copy(v); scene.add(bell)
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(p.r * 3, p.r * 0.4, p.r * 0.6), lam(0x3b2a1e))
        yoke.position.set(v.x, p.y + p.r * 1.5, v.z); faceHome(yoke); scene.add(yoke)
        const dir = P(1, p.a + 90).normalize()
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, p.y + p.r * 1.6, 1.5), lam(0x3b2a1e))
          post.position.set(v.x + dir.x * s * p.r * 1.4, (p.y + p.r * 1.6) / 2, v.z + dir.z * s * p.r * 1.4); scene.add(post)
        }
        const pl = new THREE.PointLight(0xffd9a0, 0.4, 140); pl.position.set(v.x, p.y - 2, v.z); scene.add(pl)
        steps.push((t) => { bell.rotation.z = Math.sin(t / 1000 * 1.1) * 0.08 })
        break
      }
      // ── CORN: rows of it, where the seats aren't (Field of Dreams)
      case 'corn': {
        const geo = new THREE.ConeGeometry(1.3, 9, 5)
        const mat = lam(0x5f8a3a)
        const n = p.n || 1400
        const im = new THREE.InstancedMesh(geo, mat, n)
        const M = new THREE.Matrix4(), col = new THREE.Color()
        for (let i = 0; i < n; i++) {
          const a = p.from + Math.random() * (p.to - p.from)
          const v = beyond(a, p.off + Math.random() * p.depth)
          const h = 0.8 + Math.random() * 0.5
          M.makeScale(1, h, 1); M.setPosition(v.x, 4.5 * h, v.z)
          im.setMatrixAt(i, M)
          im.setColorAt(i, col.setHSL(0.2 + Math.random() * 0.06, 0.5, 0.42 + Math.random() * 0.16))
        }
        im.instanceMatrix.needsUpdate = true
        scene.add(im)
        break
      }
      // ── VIDEOBOARD: the big screen every modern park has beyond the
      //    outfield. Its face is a dim mosaic, its caption the park's name —
      //    never a logo (Donovan: "keep it true to the baseball parks").
      case 'videoboard': {
        const v = beyond(p.a, p.off, p.y + p.h / 2)
        const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 7), lam(0x1a2029))
        box.position.copy(v); faceHome(box); scene.add(box)
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128
        const g = cv.getContext('2d')
        const grd = g.createLinearGradient(0, 0, 256, 128)
        grd.addColorStop(0, css(0x0d1b2e)); grd.addColorStop(1, css(0x1b2b45))
        g.fillStyle = grd; g.fillRect(0, 0, 256, 128)
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(${120 + Math.random() * 135},${150 + Math.random() * 80},${200},${0.08 + Math.random() * 0.22})`
          g.fillRect(Math.random() * 256, Math.random() * 128, 6 + Math.random() * 30, 3 + Math.random() * 10)
        }
        g.fillStyle = 'rgba(255,255,255,.85)'
        g.font = '900 22px SF Mono, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(String(p.text || '').toUpperCase(), 128, 64)
        const tex = new THREE.CanvasTexture(cv)
        const face = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 0.92, p.h * 0.84),
          new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }))
        face.position.copy(v); faceHome(face); face.translateZ(3.8); scene.add(face)
        const pl = new THREE.PointLight(0x9fc4ff, 0.3, 320); pl.position.copy(v); pl.translateZ(-12); scene.add(pl)
        const dir = P(1, p.a + 90).normalize()
        for (const s of [-1, 0, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, p.y, 2.4), lam(0x1a1e24))
          l.position.set(v.x + dir.x * s * p.w * 0.38, p.y / 2, v.z + dir.z * s * p.w * 0.38); scene.add(l)
        }
        break
      }
      // ── CLOCK: a lit clock face on a scoreboard or a wall
      case 'clock': {
        const v = beyond(p.a, p.off, p.y)
        const grp = new THREE.Group()
        const face = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), basic(0xf4efe0)); grp.add(face)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r, p.r * 0.08, 6, 24), lam(0x1a1e24)); grp.add(rim)
        const hand = (len, w, ang) => {
          const pivot = new THREE.Group()
          const h = new THREE.Mesh(new THREE.PlaneGeometry(w, len), basic(0x1a1e24))
          h.position.set(0, len / 2, 0.3); pivot.add(h); pivot.rotation.z = ang; grp.add(pivot)
          return pivot
        }
        hand(p.r * 0.55, p.r * 0.1, -2.1)
        const mn = hand(p.r * 0.85, p.r * 0.06, 0.4)
        grp.position.copy(v); faceHome(grp); scene.add(grp)
        steps.push((t) => { mn.rotation.z = 0.4 - (t / 1000) * 0.02 })
        break
      }

      // ══ BATCH PASS (2026-09-03). Donovan: "hyper-focus on a batch of parks,
      //    get them all the way right." Kinds the first batch (Comerica,
      //    Chase, Petco) needed that the vocabulary did not have.

      // ── PEN: a bullpen BEYOND the wall (Comerica's in left, Petco's pair
      //    behind centre, Chase's in the corners): a strip of dirt with two
      //    mounds and rubbers, a plate, and a low fence in front, optionally
      //    raised (`y`) for the upper tier of a stacked pen.
      case 'pen': {
        const y = p.y || 0
        const flat = wedge(p.from, p.to, (a) => wallD(clamp45(a)) + p.off, (a) => wallD(clamp45(a)) + p.off + p.depth, y + 0.15, lam(0x6a4a30))
        void flat
        const mid = (p.from + p.to) / 2
        const along = P(1, mid + 90).normalize()
        for (const k of [-1, 1]) {
          const v = beyond(mid, p.off + p.depth * 0.7, y)
          const m = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x8a6540))
          m.scale.y = 0.14
          m.position.set(v.x + along.x * k * 9, y + 0.2, v.z + along.z * k * 9); scene.add(m)
          const rub = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.5), basic(0xf4f4f5))
          rub.position.set(v.x + along.x * k * 9, y + 0.8, v.z + along.z * k * 9); rub.rotation.y = -mid * DEG; scene.add(rub)
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), basic(0xf4f4f5))
          const w = beyond(mid, p.off + p.depth * 0.15, y)
          pl.rotation.x = -Math.PI / 2; pl.position.set(w.x + along.x * k * 9, y + 0.25, w.z + along.z * k * 9); scene.add(pl)
        }
        // the low fence in front and a lit strip along it
        sheet(p.from, p.to, p.off - 0.5, y, y + 3.5, lam(p.color || 0x1c3a48))
        sheet(p.from, p.to, p.off - 0.6, y + 3.1, y + 3.5, basic(0xf59e0b))
        break
      }
      // ── BERM: a grass slope beyond the wall with people on it (Petco's
      //    Park at the Park). Rises from the wall top outward.
      case 'berm': {
        const pos = [], col = []
        const g0 = new THREE.Color(0x2f6b3a), g1 = new THREE.Color(0x3d8a48)
        for (let a = p.from; a < p.to; a += 2) {
          const b = Math.min(p.to, a + 2)
          const i0 = beyond(a, p.off, p.y0 || 2), i1 = beyond(b, p.off, p.y0 || 2)
          const o0 = beyond(a, p.off + p.depth, p.h), o1 = beyond(b, p.off + p.depth, p.h)
          pos.push(i0.x, i0.y, i0.z, i1.x, i1.y, i1.z, o1.x, o1.y, o1.z, i0.x, i0.y, i0.z, o1.x, o1.y, o1.z, o0.x, o0.y, o0.z)
          for (let k = 0; k < 6; k++) { const c = k === 2 || k === 3 || k === 5 ? g1 : g0; col.push(c.r, c.g, c.b) }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
        g.computeVertexNormals()
        scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })))
        // the people on the grass
        const pts = [], cc = []
        const warmA = new THREE.Color(0xc9a781), coolA = new THREE.Color(0x8fa3bd)
        for (let i = 0; i < (p.n || 260); i++) {
          const a = p.from + Math.random() * (p.to - p.from), t = Math.random()
          const v = beyond(a, p.off + p.depth * t, (p.y0 || 2) + (p.h - (p.y0 || 2)) * t + 0.8)
          pts.push(v.x, v.y, v.z)
          const c = Math.random() > 0.6 ? coolA : warmA, j = 0.6 + Math.random() * 0.5
          cc.push(c.r * j, c.g * j, c.b * j)
        }
        const pg = new THREE.BufferGeometry()
        pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        pg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3))
        scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ vertexColors: true, size: 2.6, transparent: true, opacity: 0.5 })))
        break
      }
      // ── PALMS: a trunk and a burst of fronds (Petco, Chase's plaza)
      case 'palms': {
        const c = beyond(p.a, p.off)
        const dir = P(1, p.a + 90).normalize()
        for (let i = 0; i < p.n; i++) {
          const h = p.h * (0.75 + Math.random() * 0.5)
          const t = (i / Math.max(1, p.n - 1) - 0.5) * p.spread + (Math.random() - 0.5) * 8
          const x = c.x + dir.x * t, z = c.z + dir.z * t
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, h, 6), lam(0x6b5340))
          trunk.position.set(x, h / 2, z); trunk.rotation.z = (Math.random() - 0.5) * 0.12; scene.add(trunk)
          for (let k = 0; k < 7; k++) {
            const frond = new THREE.Mesh(new THREE.ConeGeometry(1.2, h * 0.34, 4), lam(0x2e6b34))
            frond.position.set(x, h, z)
            frond.rotation.z = Math.PI / 2 + 0.5; frond.rotation.y = (k / 7) * Math.PI * 2
            frond.rotateOnAxis(new THREE.Vector3(1, 0, 0), 0.55)
            frond.translateY(-h * 0.14); scene.add(frond)
          }
        }
        break
      }
      // ── FLAGPOLE: one tall white pole with a flag, beyond the wall
      case 'flagpole': {
        const v = beyond(p.a, p.off)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, p.h, 8), lam(0xe6e8ec))
        pole.position.set(v.x, p.h / 2, v.z); scene.add(pole)
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), lam(p.color || 0xb3202f, { side: THREE.DoubleSide }))
        flag.position.set(v.x, p.h - 5, v.z); flag.lookAt(0, p.h - 5, 0); flag.translateX(7.2); scene.add(flag)
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), basic(0xfff1b8, { fog: false }))
        ball.position.set(v.x, p.h + 1, v.z); scene.add(ball)
        break
      }
      // ── STATUES: a row of dark bronze figures on pedestals along a low
      //    wall (Comerica's Hall of Famers along the left-centre wall)
      case 'statues': {
        sheet(p.from, p.to, p.off, 0, p.h, lam(0x3a3f47))
        const n = p.n || 6
        for (let i = 0; i < n; i++) {
          const a = p.from + ((i + 0.5) / n) * (p.to - p.from)
          const v = beyond(a, p.off + 3, p.h)
          const ped = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3.2), lam(0x5a5f66))
          ped.position.set(v.x, p.h + 1.1, v.z); scene.add(ped)
          const fig = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.4, 4, 8), lam(0x4a3a24, { emissive: 0x4a3a24, emissiveIntensity: 0.25 }))
          fig.position.set(v.x, p.h + 2.2 + 2.8, v.z); scene.add(fig)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), lam(0x4a3a24))
          head.position.set(v.x, p.h + 2.2 + 5.6, v.z); scene.add(head)
          const pl = new THREE.PointLight(0xffe0b0, 0.12, 30); pl.position.set(v.x, p.h + 1, v.z + 2); scene.add(pl)
        }
        break
      }
      // ── CATS: the two tigers prowling the top of the left-field board
      //    (Comerica). Orange, striped, a tail — an animal, not a mark.
      case 'cats': {
        const dir = P(1, p.a + 90).normalize()
        const c = beyond(p.a, p.off, p.y)
        const fur = lam(0xd9782a, { emissive: 0xd9782a, emissiveIntensity: 0.2 })
        const dark = lam(0x1a1410)
        for (const s of [-1, 1]) {
          const grp = new THREE.Group()
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 8, 4, 10), fur)
          body.rotation.z = Math.PI / 2; body.position.y = 4.2; grp.add(body)
          for (let k = -2; k <= 2; k++) {
            const stripe = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.35, 6, 14), dark)
            stripe.rotation.y = Math.PI / 2; stripe.position.set(k * 2.1, 4.2, 0); grp.add(stripe)
          }
          const head = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 10), fur)
          head.position.set(6.4, 5.6, 0); grp.add(head)
          for (const e of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 6), fur)
            ear.position.set(6.4, 7.8, e * 1.3); grp.add(ear)
          }
          for (const l of [[-3.5, -1.3], [-3.5, 1.3], [3, -1.3], [3, 1.3]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 4, 8), fur)
            leg.position.set(l[0], 2, l[1]); grp.add(leg)
          }
          const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-6, 5, 0), new THREE.Vector3(-10, 8.5, 0), new THREE.Vector3(-11, 5.5, 1)), 10, 0.45, 6, false), fur)
          grp.add(tail)
          grp.position.set(c.x + dir.x * s * p.gap / 2, c.y, c.z + dir.z * s * p.gap / 2)
          grp.rotation.y = -p.a * DEG + (s < 0 ? Math.PI : 0)
          scene.add(grp)
        }
        break
      }
      // ── ROOFSTACK: the parked panels of a retractable roof — a stack of
      //    thin slabs over one side of the stands (Chase, when open)
      case 'roofstack': {
        const steel = lam(p.color || 0x3d4652)
        for (let k = 0; k < (p.n || 3); k++) {
          const off = p.off + k * (p.gap || 18)
          const a0 = beyond(p.from, off, p.y + k * 4), a1 = beyond(p.to, off, p.y + k * 4)
          const len = a0.distanceTo(a1)
          const mid = a0.clone().add(a1).multiplyScalar(0.5)
          const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 3, (p.gap || 18) - 4), steel)
          slab.position.copy(mid); slab.lookAt(a1.x, mid.y, a1.z); slab.rotateY(Math.PI / 2); scene.add(slab)
          const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 1.2), basic(0xfff1b8, { fog: false, transparent: true, opacity: 0.5 }))
          rail.position.copy(mid); rail.position.y += 2.2; rail.rotation.copy(slab.rotation); scene.add(rail)
        }
        break
      }

      default:
        break
    }
  })
}
