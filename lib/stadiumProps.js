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
import { propsFor } from './parkProps'

const DEG = Math.PI / 180
const clamp45 = (a) => Math.max(-45, Math.min(45, a))

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

export function addParkProps(scene, { venue, P, wallD, wallH }) {
  const props = propsFor(venue)
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
        const w = wedge(p.from, p.to, (a) => wallD(clamp45(a)) + p.off, (a) => wallD(clamp45(a)) + p.off + p.depth, 0.6,
          basic(p.color, { transparent: true, opacity: 0.9 }))
        w.material.fog = false
        // ripple highlights — a few hundred dim points
        const pts = []
        for (let i = 0; i < 260; i++) {
          const a = p.from + Math.random() * (p.to - p.from)
          const r = wallD(clamp45(a)) + p.off + Math.random() * p.depth
          const v = P(r, a); pts.push(v.x, 0.9, v.z)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbcd8ee, size: 1.6, transparent: true, opacity: 0.35, fog: false })))
        break
      }
      // ── POOL: Chase's rectangle, bright blue, with a pale deck
      case 'pool': {
        const v = beyond(p.a, p.off + p.d / 2)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(p.w + 10, 1.2, p.d + 10), lam(0xcfc6b8))
        deck.position.set(v.x, 0.6, v.z); faceHome(deck); scene.add(deck)
        const water = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), basic(p.color, { fog: false }))
        water.rotation.x = -Math.PI / 2
        water.position.set(v.x, 1.3, v.z); water.rotation.z = -p.a * DEG; scene.add(water)
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
          const v = beyond(a, p.off)
          // a plume: narrow at the nozzle, wide at the top, and a soft
          // cap of mist — water, not a lamp post
          const jet = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, 0.6, h, 10, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }))
          jet.position.set(v.x, h / 2, v.z); scene.add(jet)
          const mist = new THREE.Mesh(new THREE.SphereGeometry(h * 0.22, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0xe0f0ff, transparent: true, opacity: 0.32, depthWrite: false, fog: false }))
          mist.position.set(v.x, h * 0.98, v.z); mist.scale.y = 0.55; scene.add(mist)
          if (i % 2 === 0) {
            const pl = new THREE.PointLight(0xbfdbfe, 0.35, 110)
            pl.position.set(v.x, 6, v.z); scene.add(pl)
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
      default:
        break
    }
  })
}
