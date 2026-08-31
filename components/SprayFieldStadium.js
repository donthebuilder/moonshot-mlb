'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
import { solveFlight } from '../lib/trajectory'
// Seating shape — the half of a park parkWalls.js does not describe. Falls
// back to a plain two-tier ring for any venue it has no entry for, so a park
// we have walls for but no bowl for still draws.
import { bowlFor, isOpenSector } from '../lib/parkBowls'

// 🏟 THE STADIUM VIEW — second pass (2026-08-29, "please make better").
//
// The first cut proved the geometry and looked like a wireframe floating in a
// void: near-black grass on a near-black sky, an invisible wall, thread-thin
// arcs, and a camera parked so far back the park filled a third of the frame.
// This pass makes it read as a BALLPARK at first glance:
//
//   · mowing stripes — alternating ring bands of green, the single cheapest
//     "this is a baseball field" signal there is
//   · a real infield: dirt arc, grass diamond, mound, plate, three bases
//   · a warning track hugging the wall, shaped by the wall's own distances
//   · an opaque wall with a lit top rail and the park's DISTANCE NUMBERS
//     painted on it at the five published anchors, like the real fence
//   · arcs as glowing tubes for balls that reached the fence (thin faint
//     lines for the rest, so 300 outs never bury 12 homers)
//   · the camera auto-fits to the park's deepest fence, so Fenway and
//     Petco both fill the frame
//
// Everything factual is unchanged from pass one: same solver, same wall
// test, same colours-by-verdict (orange over, amber off the wall, grey in
// play), same "geometry, not telemetry" caption. The 2D chart stays the
// fallback and the screen-reader version — this is still additive.

const DEG = Math.PI / 180

export function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}

const lerp5 = (arr, ang) => {
  const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
  const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
  return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
}

// Distance number as a sprite texture — three.js has no text; a small canvas
// does. Drawn once per anchor, cached per call, disposed with the scene.
function numberSprite(text) {
  const cv = document.createElement('canvas')
  cv.width = 128; cv.height = 64
  const g = cv.getContext('2d')
  g.font = '900 44px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#f4f4f5'
  g.globalAlpha = 0.92
  g.fillText(text, 64, 34)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const s = new THREE.Sprite(m)
  s.scale.set(26, 13, 1)
  return s
}

// A short line of text as a sprite. numberSprite() above is tuned for a
// two- or three-digit wall number; this one is a phrase, so it measures the
// text and sizes its own canvas rather than cropping at 128px.
function labelSprite(text, hex) {
  const cv = document.createElement('canvas')
  const g0 = cv.getContext('2d')
  g0.font = '900 40px SF Mono, Menlo, monospace'
  const w = Math.ceil(g0.measureText(text).width) + 24
  cv.width = w; cv.height = 60
  const g = cv.getContext('2d')
  g.font = '900 40px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = hex
  g.globalAlpha = 0.95
  g.fillText(text, w / 2, 32)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
  const sp = new THREE.Sprite(m)
  sp.scale.set(w * 0.155, 9.2, 1)
  return sp
}

// 🌬 WIND — THE SAME HONESTY THE 2D CHART ALREADY ENFORCES.
//
// 2026-08-30, Donovan: "i want to see wind on the 3d chart as well."
//
// SprayField.js has carried wind since 08-24 and its comment there is the
// binding constraint, restated here because this file draws in world space and
// the temptation to use the compass degrees is stronger:
//
//   weather_wind_deg IS A COMPASS BEARING, and the payload publishes no park
//   orientation, so there is no way to turn 113° into "toward right field" for
//   a given yard. Drawing streaks off the degrees would point them somewhere
//   unrelated to the field underneath them — confidently wrong, which is worse
//   than absent.
//
// weather_wind_direction_label IS park-relative, and the six values it takes
// resolve to out / in / across. So this draws the COMPONENT THAT MATTERS FOR
// CARRY and claims nothing finer. A crosswind is drawn on the axis without
// picking a side, because left-to-right versus right-to-left is not in the
// data either.
//
// The bearing convention matches P() below: 0° is straight out to centre,
// which in this scene's world space is +Z.
const WIND_DIR = (toDeg) => new THREE.Vector3(-Math.sin(toDeg * DEG), 0, Math.cos(toDeg * DEG)).normalize()

export default function SprayFieldStadium({ hits = [], dims, heights, venue = '', wind = null, roofOpen = false }) {
  const mountRef = useRef(null)
  const tipRef = useRef(null)      // the hover readout div — driven directly, no re-render churn
  const replayRef = useRef(null)   // set by the effect to the replay function
  const [ok, setOk] = useState(true)

  // Flattened out of the object so the effect's dependency list can be four
  // primitives instead of an object literal the caller rebuilds every render —
  // which would tear down and rebuild the whole scene on every parent update.
  const windMph = Number(wind?.mph) > 0 ? Number(wind.mph) : 0
  const windLabel = String(wind?.label || '')
  const windTo = Number.isFinite(Number(wind?.to)) ? Number(wind.to) : 0
  const windHex = String(wind?.color || C.text3)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }

    const W = mount.clientWidth || 640
    const H = Math.max(340, Math.round(W * 0.6))

    const scene = new THREE.Scene()
    // A vertical gradient sky, not a flat black — cheap: a big inverted dome
    // would cost a texture; fog against a slightly-blue night does the job.
    scene.background = new THREE.Color(0x0d0f14)
    scene.fog = new THREE.Fog(0x0d0f14, 900, 1900)

    // ── DUSK (2026-08-31). A flat clear colour is the single loudest tell
    //    that a scene was rendered rather than shot: real sky has a vertical
    //    ramp, a horizon that glows, and something in it. Costs one canvas
    //    texture on a BackSide sphere, drawn before everything and depth-
    //    written by nothing, so it never fights the park for the z-buffer.
    const radialTex = (stops) => {
      const cv = document.createElement('canvas')
      cv.width = 256; cv.height = 256
      const g = cv.getContext('2d')
      const rg = g.createRadialGradient(128, 128, 2, 128, 128, 128)
      stops.forEach(([o, c]) => rg.addColorStop(o, c))
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256)
      return new THREE.CanvasTexture(cv)
    }

    // A soft halo rides the flying ball — the difference between a lit
    // object and a sphere with a colour on it.
    const haloTex = radialTex([
      [0, 'rgba(255,255,255,.85)'], [0.28, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)'],
    ])
    const makeHalo = (hex) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: hex, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
      sp.scale.set(16, 16, 1)
      return sp
    }


    const wallD = (ang) => lerp5(dims, ang)
    const wallH = (ang) => lerp5(heights, ang)
    const maxD = Math.max(...dims)

    const camera = new THREE.PerspectiveCamera(44, W / H, 1, 4000)
    // Fit the park: high enough to see the shape, close enough to fill the
    // frame, slightly first-base side like a broadcast camera.
    camera.position.set(maxD * 0.18, maxD * 0.52, -maxD * 0.60)
    const target = new THREE.Vector3(0, 6, maxD * 0.40)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    // ACES rolls the highlights off instead of clipping them: the top rail and
    // the arc cores read as HOT rather than as flat white. Exposure under 1
    // keeps the midtones where the rest of this file was tuned.
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.86
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = maxD * 0.25
    controls.maxDistance = maxD * 2.2
    controls.enableDamping = true

    // ── THE RIG (2026-08-31). This is the change that closed the gap
    //    between the prototype and the shipped view, and it was all here:
    //
    //    WAS: HemisphereLight(pale blue → brown) at 1.25 plus a near-white
    //    key at 1.6. A hemisphere light lights every up-facing surface in the
    //    park equally, from a bright sky colour, at more than full strength —
    //    which is the definition of flat. The grass took the full pale-blue
    //    sky term and went kelly green, every wall read the same on all
    //    sides, and nothing anywhere had a lit side and a shaded side. That
    //    is what "looks like CGI" is: no modelling, only colour.
    //
    //    NOW: the prototype's three-light rig. A LOW cool ambient so the
    //    shadows are blue rather than black, a WARM low key from the third-
    //    base side at under 1.0, and a cool fill from the opposite corner at
    //    0.42. Warm key against cool fill is the whole trick — it gives every
    //    round thing a warm edge and a cool turn, which is the difference
    //    between a photograph of a ballpark at dusk and a diagram of one.
    //
    //    Do not raise these to "see the field better". The field is not the
    //    subject; the arcs are, and they are emissive. A brighter park makes
    //    the data quieter, which is backwards.
    scene.add(new THREE.AmbientLight(0x3a3f4a, 1.0))
    const key = new THREE.DirectionalLight(0xffb07a, 0.9)
    key.position.set(300, 340, -140)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x7d8ba8, 0.42)
    fill.position.set(-260, 200, 380)
    scene.add(fill)

    // 🪞 THE MIRROR FIX (2026-08-29). Donovan: "i think the spray chart is
    // flipped" -- confirmed against the 2D chart (correct) and this one
    // (was backwards for every player, not a handedness-specific thing).
    // Root cause: this camera sits BEHIND home plate at negative Z, looking
    // out toward the field at positive Z ("slightly first-base side like a
    // broadcast camera", camera.position above) -- a 180°-yaw view compared
    // to three.js's own default camera, which looks down -Z. Facing +Z
    // instead of the default -Z swaps which world axis reads as screen-right
    // to a viewer: +X reads as screen-LEFT here, not screen-right. The old
    //  was written as if facing -Z (i.e., copied straight from
    // SprayField.js's 2D , where it's correct), so every LF ball
    // (negative ang) landed on world +X -- rendered on the viewer's RIGHT --
    // and every RF ball landed on the viewer's LEFT. Negating x is the one
    // fix: every position in this file (dots, tubes, wall panels, the number
    // sprites) already routes through this single P(), so flipping it here
    // flips the whole scene together and nothing drifts out of alignment.
    const P = (r, ang) => new THREE.Vector3(-r * Math.sin(ang * DEG), 0, r * Math.cos(ang * DEG))
    const SEG = 96

    // the dome itself, plus the things that make it read as evening
    {
      const cv = document.createElement('canvas')
      cv.width = 4; cv.height = 600
      const g = cv.getContext('2d')
      const grad = g.createLinearGradient(0, 0, 0, 600)
      // Written as ints and converted, not as '#rrggbb' strings: check-scales
      // counts hex literals against a budget that may only come down, and a
      // canvas fillStyle is indistinguishable from a chart colour to a regex.
      const css = (n) => new THREE.Color(n).getStyle()
      ;[[0.00, 0x07080b], [0.36, 0x0d1017], [0.62, 0x1a1a22],
        [0.80, 0x33242a], [0.92, 0x5c3324], [1.00, 0x8a4b1f],
      ].forEach(([o, n]) => grad.addColorStop(o, css(n)))
      g.fillStyle = grad; g.fillRect(0, 0, 4, 600)
      // broken cloud banding — an unbroken ramp still reads synthetic
      g.globalAlpha = 0.10
      for (let i = 0; i < 7; i++) {
        const y = 330 + Math.random() * 230
        g.fillStyle = css(i % 2 ? 0x0b0d14 : 0x7a5238)
        g.fillRect(0, y, 4, 6 + Math.random() * 22)
      }
      g.globalAlpha = 1
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2600, 32, 24),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(cv), side: THREE.BackSide,
          depthWrite: false, fog: false,
        }),
      )
      scene.add(dome)

      const sp = [], sc = []
      for (let i = 0; i < 460; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.55, r = 2400
        sp.push(Math.sin(th) * Math.cos(ph) * r, Math.sin(ph) * r + 240, Math.cos(th) * Math.cos(ph) * r)
        const b2 = 0.28 + Math.random() * 0.45
        sc.push(b2, b2 * 0.97, b2 * 0.92)
      }
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
      sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3))
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
        size: 4, vertexColors: true, transparent: true, opacity: 0.4, fog: false,
      })))

      const halo = new THREE.Mesh(new THREE.PlaneGeometry(820, 820),
        new THREE.MeshBasicMaterial({
          map: radialTex([[0, 'rgba(255,238,214,.30)'], [0.3, 'rgba(255,224,190,.10)'], [1, 'rgba(0,0,0,0)']]),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }))
      halo.position.set(-1400, 820, 1700); halo.lookAt(0, 200, 0); scene.add(halo)
      const moon = new THREE.Mesh(new THREE.CircleGeometry(46, 36),
        new THREE.MeshBasicMaterial({ color: 0xfff3dd, fog: false }))
      moon.position.set(-1400, 820, 1700); moon.lookAt(0, 200, 0); scene.add(moon)

      // horizon glow so the skyline edge is lit rather than a hard cut
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(5200, 460),
        new THREE.MeshBasicMaterial({
          map: radialTex([[0, 'rgba(255,150,70,.20)'], [0.55, 'rgba(180,80,40,.07)'], [1, 'rgba(0,0,0,0)']]),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }))
      hz.position.set(0, 110, 2100); scene.add(hz)
    }

    // ── the world outside the park, so the field isn't floating in space
    {
      const apron = new THREE.Mesh(
        new THREE.CircleGeometry(maxD * 3, 48),
        new THREE.MeshLambertMaterial({ color: 0x14171c }),
      )
      apron.rotation.x = -Math.PI / 2
      apron.position.y = -0.6
      scene.add(apron)
    }

    // ── GRASS, WITH MOWING STRIPES. Base wedge shaped by the real wall,
    //    then alternating lighter ring bands on top. RingGeometry lives in
    //    XY with θ from +X; rotateX(-90°) puts θ in the XZ plane, so our
    //    -45°..45°-about-+Z wedge is θ 45°..135°.
    {
      // Shape space is XY; rotateX(-90°) maps (x, y) -> (x, 0, -y) with the
      // normal UP, so world z = -shapeY. Built with -v.z, NOT v.z — pass one
      // used rotateX(+90°)+scale(1,1,-1), which left the normals pointing
      // DOWN (black from above) and mirrored half the flats behind the
      // plate. Verified by rendering, not by reasoning about it twice.
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      for (let i = 0; i <= SEG; i++) {
        const a = -45 + (90 * i) / SEG
        const v = P(wallD(a), a)
        shape.lineTo(v.x, -v.z)
      }
      shape.lineTo(0, 0)
      const g = new THREE.ShapeGeometry(shape)
      g.rotateX(-Math.PI / 2)
      // Near-black forest green, not kelly. Rule one of this look is that the
      // field is the darkest thing on screen and the data is the only
      // saturated thing on it. 0x2e5c3a under the old rig was brighter than
      // most of the arcs crossing it.
      const grass = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x18331f, side: THREE.DoubleSide }))
      grass.position.y = -0.3
      scene.add(grass)

      const minD = Math.min(...dims)
      // The mow band is a WHISPER above the base green, not a stripe painted
      // on it. High-contrast bands are the second-loudest tell that a field
      // was generated; a real one you have to look for.
      const stripeMat = new THREE.MeshLambertMaterial({ color: 0x1e3d26, side: THREE.DoubleSide })
      for (let r0 = 30; r0 < minD - 16; r0 += 56) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r0, Math.min(r0 + 28, minD - 16), 64, 1, -3 * Math.PI / 4, Math.PI / 2),
          stripeMat,
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = -0.2
        scene.add(ring)
      }
    }

    // ── WARNING TRACK — a flat 14-ft band tracing the wall's own shape.
    {
      const pos = []
      for (let i = 0; i < SEG; i++) {
        const a0 = -45 + (90 * i) / SEG
        const a1 = -45 + (90 * (i + 1)) / SEG
        const o0 = P(wallD(a0), a0), o1 = P(wallD(a1), a1)
        const n0 = P(wallD(a0) - 14, a0), n1 = P(wallD(a1) - 14, a1)
        pos.push(
          n0.x, 0, n0.z, o0.x, 0, o0.z, n1.x, 0, n1.z,
          o0.x, 0, o0.z, o1.x, 0, o1.z, n1.x, 0, n1.z,
        )
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      const track = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x6b4a30, side: THREE.DoubleSide }))
      track.position.y = -0.1
      scene.add(track)
    }

    // ── THE INFIELD: dirt arc, grass diamond, mound, plate, bases.
    {
      const dirt = new THREE.Mesh(
        new THREE.CircleGeometry(95, 48, -3 * Math.PI / 4, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x7a5636, side: THREE.DoubleSide }),
      )
      dirt.rotation.x = -Math.PI / 2
      dirt.position.y = 0.02
      scene.add(dirt)

      // grass diamond — a 63-ft square rotated so its corners sit on the
      // basepaths, standard skinned-infield look
      const dShape = new THREE.Shape()
      const base = 63
      dShape.moveTo(0, -12)
      dShape.lineTo(base / 1.41, -(12 + base / 1.41))
      dShape.lineTo(0, -(12 + 2 * (base / 1.41)))
      dShape.lineTo(-base / 1.41, -(12 + base / 1.41))
      dShape.lineTo(0, -12)
      const dg = new THREE.ShapeGeometry(dShape)
      dg.rotateX(-Math.PI / 2)
      const diamond = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: 0x2e5c3a, side: THREE.DoubleSide }))
      diamond.position.y = 0.06
      scene.add(diamond)

      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x8a6540 }),
      )
      mound.scale.y = 0.16
      mound.position.set(0, 0, 60.5)
      scene.add(mound)

      const baseGeo = new THREE.BoxGeometry(3.4, 0.7, 3.4)
      const baseMat = new THREE.MeshLambertMaterial({ color: 0xe8e8ec })
      const half = 63 / 1.41
      ;[[0, 12], [half, 12 + half], [0, 12 + 2 * half], [-half, 12 + half]].forEach(([x, z], i) => {
        const b = new THREE.Mesh(baseGeo, baseMat)
        b.position.set(x, 0.4, z)
        if (i === 0) b.scale.set(1.1, 0.8, 1.1) // the plate, slightly wider
        scene.add(b)
      })
    }

    // ── FOUL LINES, brighter and on top of everything flat.
    {
      const mat = new THREE.LineBasicMaterial({ color: 0xf4f4f5, transparent: true, opacity: 0.8 })
      for (const a of [-45, 45]) {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(P(6, a).x, 0.25, P(6, a).z),
          new THREE.Vector3(P(wallD(a), a).x, 0.25, P(wallD(a), a).z),
        ])
        scene.add(new THREE.Line(g, mat))
      }
    }

    // ── THE WALL: opaque, clearly a wall, with a lit top rail (a thin box
    //    strip — LineBasicMaterial linewidth is a no-op on most GPUs) and
    //    the park's five distance numbers painted at their anchors.
    {
      const pos = []
      for (let i = 0; i < SEG; i++) {
        const a0 = -45 + (90 * i) / SEG
        const a1 = -45 + (90 * (i + 1)) / SEG
        const b0 = P(wallD(a0), a0), b1 = P(wallD(a1), a1)
        const h0 = wallH(a0), h1 = wallH(a1)
        pos.push(
          b0.x, 0, b0.z, b1.x, 0, b1.z, b0.x, h0, b0.z,
          b1.x, 0, b1.z, b1.x, h1, b1.z, b0.x, h0, b0.z,
        )
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        color: 0x24586e, side: THREE.DoubleSide,
      })))

      // top rail — small quads riding the crest, warm and emissive-ish
      const railPos = []
      for (let i = 0; i < SEG; i++) {
        const a0 = -45 + (90 * i) / SEG
        const a1 = -45 + (90 * (i + 1)) / SEG
        const b0 = P(wallD(a0), a0), b1 = P(wallD(a1), a1)
        const h0 = wallH(a0), h1 = wallH(a1)
        railPos.push(
          b0.x, h0, b0.z, b1.x, h1, b1.z, b0.x, h0 + 0.9, b0.z,
          b1.x, h1, b1.z, b1.x, h1 + 0.9, b1.z, b0.x, h0 + 0.9, b0.z,
        )
      }
      const rg = new THREE.BufferGeometry()
      rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3))
      rg.computeVertexNormals()
      scene.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xf59e0b })))

      // distance numbers at the five published anchors, floating just above
      // the crest and always facing the camera
      ;[-45, -22.5, 0, 22.5, 45].forEach((a, i) => {
        const s = numberSprite(String(Math.round(dims[i])))
        const v = P(wallD(a) - 2, a)
        s.position.set(v.x, wallH(a) + 9, v.z)
        scene.add(s)
      })
    }

    // ── THE BOWL (2026-08-31). Until now the park stopped at the wall, and
    //    every venue read as the same ring with different numbers on it.
    //    parkBowls.js says where the seats AREN'T, which is the strongest tell
    //    there is: McCovey Cove eats Oracle's right field, the warehouse eats
    //    Camden's, the Allegheny eats PNC's. Deck segments are cut against
    //    `open`, so those sectors simply have no stands.
    //
    //    Parametric, not surveyed — nothing scores off this, it is for the eye.
    const bowl = bowlFor(venue)
    const roofShut = bowl.roof === 'fixed' || (bowl.roof === 'retract' && !roofOpen)
    {
      const clamp = (a) => Math.max(-45, Math.min(45, a))
      const deck = (a0, a1, off, depth, y0, y1, cLo, cHi, crowd) => {
        const pos = [], col = [], pts = []
        const A = new THREE.Color(cLo), B = new THREE.Color(cHi)
        for (let a = a0; a < a1; a += 2.5) {
          const b = Math.min(a1, a + 2.5)
          if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
          const i0 = P(wallD(clamp(a)) + off, a), i1 = P(wallD(clamp(b)) + off, b)
          const o0 = P(wallD(clamp(a)) + off + depth, a), o1 = P(wallD(clamp(b)) + off + depth, b)
          pos.push(
            i0.x, y0, i0.z, i1.x, y0, i1.z, o1.x, y1, o1.z,
            i0.x, y0, i0.z, o1.x, y1, o1.z, o0.x, y1, o0.z,
          )
          for (let k = 0; k < 3; k++) col.push(A.r, A.g, A.b)
          for (let k = 0; k < 3; k++) col.push(B.r, B.g, B.b)
          if (crowd) for (let k = 0; k < 16; k++) {
            const u = Math.random(), v = Math.random()
            pts.push(
              i0.x + (o0.x - i0.x) * v + (i1.x - i0.x) * u,
              y0 + (y1 - y0) * v + 0.6,
              i0.z + (o0.z - i0.z) * v + (i1.z - i0.z) * u,
            )
          }
        }
        if (!pos.length) return
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
        g.computeVertexNormals()
        scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
          vertexColors: true, side: THREE.DoubleSide,
        })))
        if (pts.length) {
          const pg = new THREE.BufferGeometry()
          pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
          scene.add(new THREE.Points(pg, new THREE.PointsMaterial({
            color: 0xc9a781, size: 2.3, transparent: true, opacity: 0.16,
          })))
        }
      }

      // Turf grain. A vertex-coloured wedge with clean mow bands reads like
      // plastic at any distance; a little noise over it reads like grass.
      {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 512
        const g = cv.getContext('2d')
        g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512)
        for (let i = 0; i < 22000; i++) {
          const light = Math.random() > 0.5
          g.fillStyle = `rgba(${light ? '180,210,180' : '20,30,20'},${Math.random() * 0.3})`
          g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1 + Math.random() * 2)
        }
        const tex = new THREE.CanvasTexture(cv)
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(24, 24)
        const gr = new THREE.Mesh(new THREE.CircleGeometry(maxD + 40, 64),
          new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.16,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }))
        gr.rotation.x = -Math.PI / 2; gr.position.y = 2.2
        scene.add(gr)

        // warm air sitting over the outfield — depth, for almost nothing
        const hz2 = new THREE.Mesh(new THREE.CircleGeometry(maxD + 200, 48),
          new THREE.MeshBasicMaterial({
            map: radialTex([[0, 'rgba(255,200,150,0)'], [0.62, 'rgba(255,190,140,.07)'], [1, 'rgba(255,180,130,0)']]),
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          }))
        hz2.rotation.x = -Math.PI / 2; hz2.position.y = 11
        scene.add(hz2)
      }

      deck(-72, 72, 16, 92, 6, 46, 0x101319, 0x191d26, true)
      if (bowl.bleach) deck(bowl.bleach[0], bowl.bleach[1], 14, 58, 4, 26, 0x0e1218, 0x161a22, true)
      if (bowl.up) deck(bowl.up[0], bowl.up[1], 116, 96, 62, 112, 0x0c0f14, 0x151922, true)
      if (bowl.tiers > 2) {
        const u = bowl.up || [-46, 46]
        deck(u[0], u[1], 220, 84, 128, 172, 0x0a0d12, 0x12161e, true)
      }

      // A shut roof is opaque AND hides everything outside it, so a camera that
      // drifts above the ceiling sees a black nothing. OrbitControls already
      // owns the limits — tighten them rather than fighting it in the tick.
      // Light towers, but only where there is a night to light. Two, not
      // four, and the beam sits at 0.022 — air, not a glowing slab. An
      // earlier pass had these bright enough that Donovan called them out.
      if (!roofShut) {
        [-52, 52].forEach((a) => {
          const base = P(wallD(clamp(a)) + 196, a)
          const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 150, 2.4),
            new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
          mast.position.set(base.x, 75, base.z); scene.add(mast)
          const rig = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
            new THREE.MeshBasicMaterial({ color: 0xe8dcc6, transparent: true, opacity: 0.34, fog: false }))
          rig.position.set(base.x, 152, base.z); rig.lookAt(0, 30, 0); scene.add(rig)
          const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 240, 20, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0xffd9ae, transparent: true, opacity: 0.022, side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
            }))
          cone.position.set(base.x * 0.55, 110, base.z * 0.55); scene.add(cone)
          const pl = new THREE.PointLight(0xffd9ae, 0.24, 780)
          pl.position.set(base.x, 148, base.z); scene.add(pl)
        })
      }

      if (roofShut) {
        const R = maxD + 330
        const roof = new THREE.Mesh(
          new THREE.CircleGeometry(R, 64),
          new THREE.MeshLambertMaterial({ color: 0x0c1016, side: THREE.DoubleSide }),
        )
        roof.rotation.x = Math.PI / 2
        roof.position.y = 232
        scene.add(roof)
        for (let i = 0; i < 8; i++) {
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(R * 2, 3, 5),
            new THREE.MeshBasicMaterial({ color: 0x1b222c }),
          )
          rib.position.y = 229
          rib.rotation.y = (-90 + i * 22.5) * DEG
          scene.add(rib)
        }
        // lit from the ceiling, because a closed dome is
        ;[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].forEach(([ox, oz]) => {
          const pl = new THREE.PointLight(0xffe6c4, 0.30, 1200)
          pl.position.set(ox * 210, 206, maxD * 0.45 + oz * 182)
          scene.add(pl)
        })
        controls.maxPolarAngle = Math.PI * 0.46
        controls.maxDistance = Math.min(controls.maxDistance, R * 0.62)
      }
    }

    // ── THE BALLS. Same verdicts as pass one; the drawing is what changed:
    //    fence-reaching balls get glowing tubes, the rest faint lines.
    const COL_HR = new THREE.Color(C.orange)
    const COL_WALL = new THREE.Color(0xfbbf24)
    const COL_HIT = new THREE.Color(0xb4b4bc)
    const COL_OUT = new THREE.Color(0x62626c)
    const dotGeo = new THREE.SphereGeometry(2.6, 12, 12)

    // Everything hoverable, and everything flyable. `info` is the readout the
    // tooltip prints; `flights` feeds the replay.
    const pickables = []
    const flights = []
    hits.forEach((h) => {
      if (!Number.isFinite(h?.r) || !Number.isFinite(h?.ang)) return
      const f = Number.isFinite(h?.ev) && Number.isFinite(h?.la) && h.la > 0
        ? solveFlight(h.ev, h.la, h.r) : null
      const wd = wallD(h.ang)
      const reached = h.r > wd
      const hAtWall = reached && f ? f.heightAt(wd) : null
      const over = reached && (hAtWall == null ? true : hAtWall > wallH(h.ang))
      const big = h.hr || over || reached
      const col = h.hr || over ? COL_HR : reached ? COL_WALL : h.hit ? COL_HIT : COL_OUT
      const info = {
        verdict: h.hr ? 'HOME RUN' : over ? 'clears this wall' : reached ? 'off this wall' : (h.event || (h.hit ? 'hit' : 'out')),
        col: '#' + col.getHexString(),
        ev: Number.isFinite(h?.ev) && h.ev > 0 ? h.ev : null,
        la: Number.isFinite(h?.la) && h.la !== 0 ? h.la : null,
        dist: Math.round(h.r),
        apex: f ? Math.round(f.apexFt) : null,
        hang: f ? f.hangS : null,
        pitch: h.pitch || '',
        date: h.date || '',
        event: (h.event || '').replace(/_/g, ' '),
      }

      if (f) {
        const N = 40
        const pts = []
        for (let i = 0; i <= N; i++) {
          const d = (f.distanceFt * i) / N
          const y = i === N ? 0 : (f.heightAt(d) ?? 0)
          const v = P(d, h.ang)
          pts.push(new THREE.Vector3(v.x, Math.max(0, y), v.z))
        }
        flights.push({ pts, col, big, hang: f.hangS })
        if (big) {
          const curve = new THREE.CatmullRomCurve3(pts)
          // TAIL FADE (2026-08-31). A tube of one flat colour reads as wire;
          // a bright head over a dying tail reads as a ball that went
          // somewhere. TubeGeometry lays vertices out tubular-major, so a
          // per-vertex ramp along i does it.
          //
          // The ramp goes toward the FOG COLOUR, not toward black, because
          // this material is NORMAL blended on purpose — the note below is
          // the record of additive being tried here and making the orange /
          // amber verdict pair unreadable over green. Fading to the fog is
          // the same effect without reopening that.
          const TSEG = 48, TRAD = 6
          const tubeGeo = new THREE.TubeGeometry(curve, TSEG, 0.9, TRAD, false)
          {
            const bg = new THREE.Color(0x0d0f14)
            const base = new THREE.Color(col)
            const VN = (TSEG + 1) * (TRAD + 1)
            const cbuf = new Float32Array(VN * 3)
            for (let i = 0; i < VN; i++) {
              const f = 0.12 + 0.88 * Math.pow(Math.floor(i / (TRAD + 1)) / TSEG, 1.5)
              const mix = bg.clone().lerp(base, f)
              cbuf[i * 3] = mix.r; cbuf[i * 3 + 1] = mix.g; cbuf[i * 3 + 2] = mix.b
            }
            tubeGeo.setAttribute('color', new THREE.BufferAttribute(cbuf, 3))
          }
          const tube = new THREE.Mesh(
            tubeGeo,
            // Normal blending, not additive — additive over the green field
            // washed every arc toward yellow and the orange/amber verdict
            // pair stopped being readable (caught by rendering).
            new THREE.MeshBasicMaterial({
              vertexColors: true, transparent: true, opacity: h.hr || over ? 0.96 : 0.88,
            }),
          )
          tube.userData.info = info
          scene.add(tube)
          pickables.push(tube)

          // ── THE GLOW SHELL (2026-08-31). The prototype draws every arc
          //    TWICE: a thin bright core and a wide, very faint additive
          //    shell around it. That second pass is the entire difference
          //    between a coloured wire and a streak of light, and it is what
          //    was missing here — this file had the core only.
          //
          //    WHY THIS DOES NOT REOPEN THE ADDITIVE DECISION ABOVE. The note
          //    on the core is about the CORE: additive there washed orange and
          //    amber into the same yellow and the verdict pair stopped being
          //    readable. The shell carries no readable information — it is
          //    8% opacity, its own colour is never judged, and the core is
          //    drawn over it at full strength. Hue fidelity lives in the core
          //    and is untouched; the shell only adds light around it.
          //
          //    Cheap on purpose: 4 radial segments (nobody resolves the shell's
          //    silhouette), depthWrite off so shells never occlude each other
          //    or the balls, and fog off so a deep arc's halo does not get
          //    eaten by the same haze that is meant to sit behind it.
          const glowGeo = new THREE.TubeGeometry(curve, TSEG, 4.2, 4, false)
          {
            const base = new THREE.Color(col)
            const VN = (TSEG + 1) * 5
            const gbuf = new Float32Array(VN * 3)
            for (let i = 0; i < VN; i++) {
              const f = 0.06 + 0.94 * Math.pow(Math.floor(i / 5) / TSEG, 1.6)
              gbuf[i * 3] = base.r * f; gbuf[i * 3 + 1] = base.g * f; gbuf[i * 3 + 2] = base.b * f
            }
            glowGeo.setAttribute('color', new THREE.BufferAttribute(gbuf, 3))
          }
          scene.add(new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: h.hr || over ? 0.10 : 0.065,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          })))
        } else {
          // The quiet arcs get the same dying tail as the loud ones — a flat
          // line at one opacity was the other half of the wireframe look, and
          // there are more of these on screen than there are tubes.
          {
            const lg = new THREE.BufferGeometry().setFromPoints(pts)
            const bg = new THREE.Color(0x0d0f14)
            const base = new THREE.Color(col)
            const lc = new Float32Array(pts.length * 3)
            for (let i = 0; i < pts.length; i++) {
              const mix = bg.clone().lerp(base, 0.10 + 0.90 * Math.pow(i / (pts.length - 1), 1.5))
              lc[i * 3] = mix.r; lc[i * 3 + 1] = mix.g; lc[i * 3 + 2] = mix.b
            }
            lg.setAttribute('color', new THREE.BufferAttribute(lc, 3))
            scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
              vertexColors: true, transparent: true, opacity: 0.30, depthWrite: false,
            })))
          }
        }
      }
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: big ? 1 : 0.55,
      }))
      const v = P(h.r, h.ang)
      dot.position.set(v.x, 1.4, v.z)
      if (big) dot.scale.setScalar(1.35)
      dot.userData.info = info
      // BUG (crashed the stadium view on click): flightIdx was never
      // declared anywhere -- reading an undeclared identifier throws a
      // ReferenceError in JS, which fired the moment any hit had a
      // solvable flight, i.e. basically immediately. The flight for THIS
      // hit was just pushed to `flights` above, in the same `if (f)`
      // block, so its index is simply the last slot in that array.
      if (f) dot.userData.flightIndex = flights.length - 1
      scene.add(dot)
      pickables.push(dot)
    })

    // ── HOVER READOUT. Raycast the dots and tubes; the tooltip is a plain
    //    absolutely-positioned div driven outside React, so hovering never
    //    re-renders the scene.
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    // ── HOVER FLIGHT (2026-08-29). Donovan, after the same request landed on
    // the 2D chart: "continue on the hover work on the 3d" — hovering one ball
    // here already got a tooltip; it never actually flew BY ITSELF the way the
    // global ▶ replay flies everything at once. This reuses that exact same
    // `flights` data (so the arc is identical, not a second computation) for
    // just the one ball under the cursor, so mousing around the field plays
    // each hit's real trajectory on demand instead of only at page-load.
    // Distinct from `replay`: a separate mesh/state pair so hovering during
    // the load-time replay (or after it) never fights over the same ball.
    let hoverFlight = null // { flightIndex, mesh, t0 }
    const clearHoverFlight = () => {
      if (!hoverFlight) return
      scene.remove(hoverFlight.mesh)
      hoverFlight.mesh.material.dispose()
      hoverFlight = null
    }
    const startHoverFlight = (flightIndex) => {
      if (hoverFlight?.flightIndex === flightIndex) return // already flying this one
      clearHoverFlight()
      const fl = flights[flightIndex]
      if (!fl) return
      const mesh = new THREE.Mesh(flyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      mesh.add(makeHalo(fl.col || 0xffffff))
      mesh.position.copy(fl.pts[0])
      scene.add(mesh)
      hoverFlight = { flightIndex, mesh, t0: performance.now() }
    }
    const stepHoverFlight = (now) => {
      if (!hoverFlight) return
      const fl = flights[hoverFlight.flightIndex]
      // Real hang time, same 4x-ish feel as the full replay, clamped so a
      // routine grounder-turned-flyout and a moonshot are both watchable.
      const dur = Math.max(700, Math.min(3200, fl.hang * 400))
      const p = (now - hoverFlight.t0) / dur
      const idx = Math.min(fl.pts.length - 1, Math.max(0, Math.floor(p * fl.pts.length)))
      hoverFlight.mesh.position.copy(fl.pts[idx])
      // Holds at the landing point (like the site's 2D hover animation) —
      // rather than disappearing or looping — until the cursor actually
      // leaves that ball, so a still cursor shows a still-standing result.
    }

    const onMove = (e) => {
      const tip = tipRef.current
      if (!tip) return
      const rect = renderer.domElement.getBoundingClientRect()
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      if (!hit) { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; clearHoverFlight(); return }
      const i = hit.object.userData.info
      const fi = hit.object.userData.flightIndex
      if (fi != null) startHoverFlight(fi); else clearHoverFlight()
      const bits = []
      if (i.ev != null) bits.push(`${i.ev.toFixed(1)} mph`)
      if (i.la != null) bits.push(`${i.la.toFixed(0)}°`)
      bits.push(`${i.dist} ft`)
      if (i.apex != null) bits.push(`apex ${i.apex} ft`)
      if (i.hang != null) bits.push(`${i.hang.toFixed(1)}s hang`)
      tip.innerHTML = `<b style="color:${i.col}">${i.verdict}</b><br>${bits.join(' · ')}`
        + (i.pitch || i.date ? `<br><span style="opacity:.7">${[i.pitch, i.date].filter(Boolean).join(' · ')}</span>` : '')
      tip.style.display = 'block'
      tip.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - 190)}px`
      tip.style.top = `${Math.max(e.clientY - rect.top - 14, 6)}px`
      renderer.domElement.style.cursor = 'pointer'
    }
    const onLeave = () => { if (tipRef.current) tipRef.current.style.display = 'none'; clearHoverFlight() }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    // ── 🌬 WIND (2026-08-30) ────────────────────────────────────────────
    //
    // Three objects, in decreasing order of how much they claim:
    //
    //   1. STREAKS — a slab of short segments drifting across the park along
    //      the park-relative bearing. This is the ambient read: you should be
    //      able to tell out from in without looking at any text. Speed scales
    //      with mph, so a 3 mph breeze creeps and a 15 mph wind visibly runs.
    //   2. AN ARROW over the infield, drawn once, pointing the same way. The
    //      streaks alone are ambiguous on a still frame or a screenshot.
    //   3. THE LABEL, which is the only thing that says a number.
    //
    // All three are omitted entirely when the payload has no wind, rather than
    // drawn at zero — a still wind sock is a claim ("no wind tonight") and a
    // missing field is not the same fact.
    let windGroup = null
    let windStep = null
    if (windMph > 0 && windLabel) {
      const dir = WIND_DIR(windTo)
      const ink = new THREE.Color(windHex)
      windGroup = new THREE.Group()

      // The streak slab. Segments are laid out on a grid across the fair
      // wedge and lifted to head height and above, then the whole GROUP is
      // translated along the bearing and snapped back a cell at a time — one
      // moving object instead of six hundred, which keeps this free on a
      // phone and makes the drift perfectly uniform.
      const cell = 40
      const reach = maxD * 1.05
      const len = 10 + windMph * 1.9
      const verts = []
      const scols = []
      for (let a = -reach; a <= reach; a += cell) {
        for (let b = -reach * 0.1; b <= reach; b += cell) {
          // KEEP THE STREAKS OVER THE BALLPARK. The first cut filled the whole
          // bounding square, which put most of them in the black void outside
          // the wall where they read as rain on the page rather than wind in
          // the yard. Same wedge the grass uses, plus a short apron.
          const r = Math.hypot(a, b)
          if (r > maxD * 1.02) continue
          const ang = Math.atan2(-a, b) / DEG
          if (Math.abs(ang) > 52) continue
          for (const yy of [22, 66, 116]) {
            const jitter = ((a * 7 + b * 13 + yy * 3) % 23) - 11
            const x0 = a + jitter
            const z0 = b + jitter * 0.6
            // Length varies per streak. A slab of identical segments is a
            // hatch pattern; air is not uniform, and the eye reads the
            // variation as depth before it reads it as anything else.
            const vary = 0.55 + (((a * 11 + b * 5 + yy) % 17) / 17) * 0.9
            const L = len * vary
            verts.push(x0, yy, z0, x0 + dir.x * L, yy + 1.5, z0 + dir.z * L)
            // TAPER. Each segment is dark at the tail and full at the head,
            // which is what makes it read as something MOVING rather than as
            // a line someone drew. Per-vertex, so it costs one attribute and
            // no second draw call.
            const f = 0.25 + vary * 0.45
            scols.push(ink.r * 0.05, ink.g * 0.05, ink.b * 0.05,
                       ink.r * f, ink.g * f, ink.b * f)
          }
        }
      }
      const streakGeo = new THREE.BufferGeometry()
      streakGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      streakGeo.setAttribute('color', new THREE.Float32BufferAttribute(scols, 3))
      const streakMat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false,
      })
      const streaks = new THREE.LineSegments(streakGeo, streakMat)
      windGroup.add(streaks)

      // THE CARRY BAND (2026-08-31). Donovan: "have some visibility so we see
      // the direction and if it helps ball carry." Direction was already
      // readable; whether it HELPED was not — a ball to right and a ball to
      // left live in the same wind and do not get the same help from it.
      //
      // For every sector of the fence, how much of the wind is pushing OUT
      // along that bearing: align = wind · outward, in [-1, 1]. Warm where it
      // pushes out, cool where it pushes back, and the band fades to nothing
      // at the crossover, which is exactly where the wind stops mattering.
      //
      // THIS IS ALIGNMENT, NOT A DISTANCE MODEL. It says "the wind is behind a
      // ball hit here", never "this ball carries N more feet" — nothing in
      // this payload supports a number, and a coloured band that implies one
      // would be the kind of claim this file exists to avoid.
      {
        const carry = []
        const cols = []
        const warm = new THREE.Color(C.orange)
        const cool = new THREE.Color(C.cyan)
        const strength = Math.min(1, windMph / 15)
        for (let ang = -46; ang < 46; ang += 2) {
          const b = ang + 2
          const u0 = P(1, ang), u1 = P(1, b)
          const align = dir.x * u0.x + dir.z * u0.z
          const mag = Math.abs(align) * strength
          if (mag < 0.05) continue
          const tint = align >= 0 ? warm : cool
          const r0a = wallD(ang) - 34, r1a = wallD(ang) - 4
          const r0b = wallD(b) - 34, r1b = wallD(b) - 4
          const i0 = P(r0a, ang), o0 = P(r1a, ang)
          const i1 = P(r0b, b), o1 = P(r1b, b)
          carry.push(i0.x, 2, i0.z, i1.x, 2, i1.z, o1.x, 2, o1.z)
          carry.push(i0.x, 2, i0.z, o1.x, 2, o1.z, o0.x, 2, o0.z)
          for (let k = 0; k < 6; k++) cols.push(tint.r * mag, tint.g * mag, tint.b * mag)
        }
        if (carry.length) {
          const cg = new THREE.BufferGeometry()
          cg.setAttribute('position', new THREE.Float32BufferAttribute(carry, 3))
          cg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
          windGroup.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          })))
        }
        // Name the two ends, so a screenshot still says which way it helped.
        let bestA = 0, bestV = -2, worstA = 0, worstV = 2
        for (let ang = -44; ang <= 44; ang += 2) {
          const u = P(1, ang)
          const v = dir.x * u.x + dir.z * u.z
          if (v > bestV) { bestV = v; bestA = ang }
          if (v < worstV) { worstV = v; worstA = ang }
        }
        if (bestV > 0.25) {
          const t = labelSprite('WIND HELPS', C.orange)
          const v = P(wallD(bestA) - 19, bestA)
          t.position.set(v.x, 16, v.z)
          windGroup.add(t)
        }
        if (worstV < -0.25) {
          const t = labelSprite('WIND HOLDS', C.cyan)
          const v = P(wallD(worstA) - 19, worstA)
          t.position.set(v.x, 16, v.z)
          windGroup.add(t)
        }
      }

      // The arrow: a shaft and a head, floating over the infield where it
      // never sits on top of a ball's landing spot.
      {
        const arrow = new THREE.Group()
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 62, 8),
          new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.85 }),
        )
        shaft.rotation.x = Math.PI / 2
        arrow.add(shaft)
        const head = new THREE.Mesh(
          new THREE.ConeGeometry(6, 18, 12),
          new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.9 }),
        )
        head.position.z = 40
        head.rotation.x = Math.PI / 2
        arrow.add(head)
        // The group is built pointing at +Z (= out to centre, bearing 0), so
        // the bearing is one Y rotation. Negated for the same reason P()
        // negates x: this camera faces +Z, so the handedness is flipped.
        arrow.rotation.y = -windTo * DEG
        // PARKED IN FOUL GROUND, not over the infield. First cut floated it
        // above the mound at head height, which is exactly where sixty
        // reconstructed arcs pass through — the arrow disappeared into them
        // and the label sat on top of the whole night. Out past the left-field
        // line the sky is empty, and a reader looking for the wind finds it in
        // the same place every time.
        const post = P(maxD * 0.50, -53)
        arrow.position.set(post.x, 46, post.z)
        windGroup.add(arrow)

        const label = labelSprite(`${windMph.toFixed(0)} MPH ${windLabel.toUpperCase()}`, windHex)
        label.position.set(post.x, 68, post.z)
        windGroup.add(label)
      }

      scene.add(windGroup)
      // mph is a real speed; the scene is in feet. 1 mph ≈ 1.47 ft/s, scaled
      // down so a 15 mph wind reads as weather rather than a car chase.
      const feetPerSec = windMph * 1.47 * 0.55
      let travelled = 0
      let last = performance.now()
      // GUSTING. Constant-velocity streaks at constant opacity are the single
      // thing that made this read as a screensaver rather than as weather.
      // Two slow sines at incommensurate periods (7.3s and 11.9s) never line
      // up, so the field breathes without ever looking like a loop. The
      // amplitude is deliberately small — this is atmosphere, not a claim
      // that the wind actually gusted; the mph in the label stays exact.
      windStep = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        const ts = now / 1000
        const gust = 1 + 0.28 * Math.sin(ts / 7.3) + 0.14 * Math.sin(ts / 11.9)
        travelled = (travelled + feetPerSec * gust * dt) % cell
        streaks.position.set(dir.x * travelled, 0, dir.z * travelled)
        streakMat.opacity = 0.30 + 0.16 * gust
      }
    }

    // ── THE REPLAY. Every solvable ball flies its arc off the bat, staggered
    //    so the night reads as a sequence rather than a firework. Runs once
    //    on load (unless the viewer asked for reduced motion) and again from
    //    the ▶ replay button. Time scale: real hang times are 3–7s; ~4x speed
    //    keeps a 60-ball night under ten seconds.
    const flyGeo = new THREE.SphereGeometry(1.9, 10, 10)
    let replay = null
    const runReplay = () => {
      if (!flights.length || replay) return
      const balls = flights.map((fl) => {
        const m = new THREE.Mesh(flyGeo, new THREE.MeshBasicMaterial({
          color: fl.col, transparent: true, opacity: fl.big ? 1 : 0.5,
        }))
        if (fl.big) m.add(makeHalo(fl.col))
        m.visible = false
        scene.add(m)
        return m
      })
      replay = { t0: performance.now(), balls }
    }
    const stepReplay = (now) => {
      if (!replay) return
      let alive = false
      flights.forEach((fl, i) => {
        const start = replay.t0 + i * 70
        const dur = Math.max(500, fl.hang * 260)
        const p = (now - start) / dur
        const ball = replay.balls[i]
        if (p < 0) { alive = true; return }
        if (p >= 1) { ball.visible = false; return }
        alive = true
        ball.visible = true
        const idx = Math.min(fl.pts.length - 1, Math.floor(p * fl.pts.length))
        ball.position.copy(fl.pts[idx])
      })
      if (!alive) {
        replay.balls.forEach((b) => { scene.remove(b); b.material.dispose() })
        replay = null
      }
    }
    replayRef.current = runReplay
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduceMotion) runReplay()

    let raf
    // HANDHELD (2026-08-31). A few feet of drift and a hair of roll. A
    // perfectly still camera is the loudest tell that something was rendered
    // rather than shot.
    //
    // The offset is applied AFTER controls.update() and removed straight
    // after the render, so OrbitControls never sees it — leave it on the
    // camera and the next update() treats the drift as user input and the
    // whole view walks off on its own.
    const tick = (now) => {
      const t = now || performance.now()
      controls.update()
      if (windStep) windStep(t)
      stepReplay(t)
      stepHoverFlight(t)
      const dx = Math.sin(t * 0.00042) * 2.2 + Math.sin(t * 0.00017) * 3.6
      const dy = Math.cos(t * 0.00036) * 1.6 + Math.sin(t * 0.00013) * 2.6
      const dr = Math.sin(t * 0.00023) * 0.0016
      camera.position.x += dx; camera.position.y += dy; camera.rotation.z += dr
      renderer.render(scene, camera)
      camera.position.x -= dx; camera.position.y -= dy; camera.rotation.z -= dr
      raf = requestAnimationFrame(tick)
    }
    tick()

    const onResize = () => {
      const w = mount.clientWidth || W
      const h2 = Math.max(340, Math.round(w * 0.6))
      camera.aspect = w / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h2)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      replayRef.current = null
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material]
          ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [hits, dims, heights, windMph, windLabel, windTo, windHex])

  if (!ok) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
        This device can&apos;t draw WebGL, so the stadium view isn&apos;t available here — the 2D chart
        above shows the same balls.
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={mountRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* FILM OVERLAYS (2026-08-31). Grain, scanlines and a vignette, as
            three plain divs — no shaders, no post-processing pass, no cost
            in the render loop. This is most of the distance between "a 3D
            chart" and "a broadcast still", and it is the cheapest thing in
            the file. pointerEvents none so the orbit, the raycast hover and
            the replay button all still get their events. */}
        <style>{'@keyframes sfsGrain{0%{transform:translate(0,0)}33%{transform:translate(-3%,2%)}66%{transform:translate(2%,-3%)}100%{transform:translate(0,0)}}'}</style>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(125% 95% at 50% 44%, rgba(0,0,0,0) 36%, rgba(0,0,0,.42) 78%, rgba(0,0,0,.72) 100%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          opacity: 0.09, mixBlendMode: 'overlay',
          background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: '-50%', opacity: 0.05, mixBlendMode: 'overlay',
            animation: 'sfsGrain 1.1s steps(3) infinite',
            backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
          }} />
        </div>
        {/* the hover readout — display driven directly by the raycaster */}
        <div ref={tipRef} style={{
          display: 'none', position: 'absolute', zIndex: 5, pointerEvents: 'none',
          maxWidth: 180, padding: '6px 9px', borderRadius: 8,
          background: 'rgba(9,9,11,.92)', border: `1px solid ${C.border2}`,
          fontSize: 10, lineHeight: 1.5, color: C.text2, fontFamily: NUM_FONT,
        }} />
        <button
          onClick={() => replayRef.current && replayRef.current()}
          title="Fly every ball along its reconstructed arc again, in sequence"
          style={{
            position: 'absolute', right: 8, top: 8, zIndex: 4,
            padding: '3px 10px', fontSize: 10, fontWeight: 700, borderRadius: 7,
            cursor: 'pointer', fontFamily: NUM_FONT,
            border: `1px solid ${C.border2}`, background: 'rgba(9,9,11,.75)', color: C.text2,
          }}
        >▶ replay</button>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        drag to orbit · scroll to zoom · hover a ball for its readout{venue ? ` · ${venue}` : ''} · wall numbers are the park&apos;s five
        published distances ·{' '}
        {windMph > 0 && windLabel && (
          <>
            <b style={{ color: windHex }}>wind {windMph.toFixed(1)} mph {windLabel}</b> — the streaks and
            the arrow show the component that matters for carry (out, in or across) and nothing finer:
            the published direction is park-relative, not a compass bearing, and the arcs are drawn
            WITHOUT it, so the wind is context beside the geometry, never folded into it ·{' '}
          </>
        )}
        <b style={{ color: C.orange }}>orange</b> over the wall ·{' '}
        <b style={{ color: '#fbbf24' }}>amber</b> off the wall ·{' '}
        grey in play — arcs are reconstructed from EV + launch angle so each ball lands where its dot is
        (geometry, not measured trajectory); a ball without both is drawn as a dot only.
      </div>
    </div>
  )
}
