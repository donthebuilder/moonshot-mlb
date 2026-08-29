'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
import { solveFlight } from '../lib/trajectory'

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

export default function SprayFieldStadium({ hits = [], dims, heights, venue = '' }) {
  const mountRef = useRef(null)
  const tipRef = useRef(null)      // the hover readout div — driven directly, no re-render churn
  const replayRef = useRef(null)   // set by the effect to the replay function
  const [ok, setOk] = useState(true)

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
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = maxD * 0.25
    controls.maxDistance = maxD * 2.2
    controls.enableDamping = true

    scene.add(new THREE.HemisphereLight(0xbdd0ea, 0x2b2418, 1.25))
    const key = new THREE.DirectionalLight(0xfff2df, 1.6)
    key.position.set(-220, 380, -140)
    scene.add(key)

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
      const grass = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x2e5c3a, side: THREE.DoubleSide }))
      grass.position.y = -0.3
      scene.add(grass)

      const minD = Math.min(...dims)
      const stripeMat = new THREE.MeshLambertMaterial({ color: 0x3a7048, side: THREE.DoubleSide })
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
          const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 48, 0.9, 6, false),
            // Normal blending, not additive — additive over the green field
            // washed every arc toward yellow and the orange/amber verdict
            // pair stopped being readable (caught by rendering).
            new THREE.MeshBasicMaterial({
              color: col, transparent: true, opacity: h.hr || over ? 0.96 : 0.88,
            }),
          )
          tube.userData.info = info
          scene.add(tube)
          pickables.push(tube)
        } else {
          scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.22 }),
          ))
        }
      }
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: big ? 1 : 0.55,
      }))
      const v = P(h.r, h.ang)
      dot.position.set(v.x, 1.4, v.z)
      if (big) dot.scale.setScalar(1.35)
      dot.userData.info = info
      if (f) dot.userData.flightIndex = flightIdx
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
    const tick = (now) => { controls.update(); stepReplay(now || performance.now()); stepHoverFlight(now || performance.now()); renderer.render(scene, camera); raf = requestAnimationFrame(tick) }
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
  }, [hits, dims, heights])

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
        <b style={{ color: C.orange }}>orange</b> over the wall ·{' '}
        <b style={{ color: '#fbbf24' }}>amber</b> off the wall ·{' '}
        grey in play — arcs are reconstructed from EV + launch angle so each ball lands where its dot is
        (geometry, not measured trajectory); a ball without both is drawn as a dot only.
      </div>
    </div>
  )
}
