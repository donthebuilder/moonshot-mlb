'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
import { solveFlight } from '../lib/trajectory'

// 🏟 THE STADIUM VIEW (2026-08-29) — the 3D spray chart Donovan asked for.
//
// The 2D SprayField STAYS — it is the WebGL fallback and the only version a
// screen reader can read (his call, same date). This is an additional way of
// looking at the same balls: the park drawn as a real space, the wall drawn
// at its real height, and every batted ball flown along its reconstructed arc
// from the plate to the spot the 2D chart already plots it at.
//
// THE ARCS ARE RECONSTRUCTED, NEVER MEASURED. Statcast publishes trajectory
// for pitches, not batted balls. lib/trajectory.js solves an RK4 flight with
// an effective drag fitted so the ball leaves at the true EV and launch angle
// and lands where the dot is; the fitted drag absorbs backspin lift. The
// caption under the canvas says exactly that — geometry, not telemetry.
//
// Colours carry the same verdicts as the 2D chart: orange = over the wall,
// amber = reached the fence line but not its height (off the wall — the
// category the wall-height work created), grey = everything else. A ball
// with no EV or launch angle cannot be flown and is drawn as a dot on the
// ground at its landing spot rather than given an invented arc.
//
// PERF: one merged line geometry would be cheaper, but per-ball lines keep
// hover/selection simple later and 300 × ~36-point lines is well inside what
// any WebGL device draws at 60fps. Scene is built once per (hits, dims)
// change and disposed on the way out — three.js leaks geometry if you don't.

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

export default function SprayFieldStadium({ hits = [], dims, heights, venue = '' }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }

    const W = mount.clientWidth || 640
    const H = Math.max(320, Math.round(W * 0.62))

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0b0e)
    scene.fog = new THREE.Fog(0x0b0b0e, 700, 1400)

    const camera = new THREE.PerspectiveCamera(46, W / H, 1, 3000)
    camera.position.set(0, 195, -270)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 190)
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 120
    controls.maxDistance = 900
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    key.position.set(-160, 320, -120)
    scene.add(key)

    // ── the ground: grass wedge + dirt infield, home plate at the origin,
    //    centre field along +z. ang -45 = LF line, +45 = RF line.
    const P = (r, ang) => new THREE.Vector3(r * Math.sin(ang * DEG), 0, r * Math.cos(ang * DEG))
    const SEG = 72
    const wallD = (ang) => lerp5(dims, ang)
    const wallH = (ang) => lerp5(heights, ang)

    const grass = (() => {
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      for (let i = 0; i <= SEG; i++) {
        const a = -45 + (90 * i) / SEG
        const v = P(wallD(a), a)
        shape.lineTo(v.x, v.z)
      }
      shape.lineTo(0, 0)
      const g = new THREE.ShapeGeometry(shape)
      g.rotateX(Math.PI / 2)
      g.scale(1, 1, -1) // ShapeGeometry lives in XY; fold it onto XZ facing up
      const m = new THREE.MeshLambertMaterial({ color: 0x11241a, side: THREE.DoubleSide })
      return new THREE.Mesh(g, m)
    })()
    grass.position.y = -0.2
    scene.add(grass)

    const dirt = new THREE.Mesh(
      new THREE.CircleGeometry(95, 40, Math.PI / 4, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x2a2018, side: THREE.DoubleSide }),
    )
    dirt.rotation.x = -Math.PI / 2
    dirt.position.y = -0.1
    scene.add(dirt)

    // foul lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf4f4f5, transparent: true, opacity: 0.5 })
    for (const a of [-45, 45]) {
      const g = new THREE.BufferGeometry().setFromPoints([P(3, a), P(wallD(a), a)])
      scene.add(new THREE.Line(g, lineMat))
    }

    // ── the wall, at its real height: a ribbon of quads, one per segment,
    //    plus a bright top edge so the height reads from any angle.
    {
      const pos = []
      const top = []
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
      for (let i = 0; i <= SEG; i++) {
        const a = -45 + (90 * i) / SEG
        const b = P(wallD(a), a)
        top.push(new THREE.Vector3(b.x, wallH(a), b.z))
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        color: 0x1d3a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      })))
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(top),
        new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 }),
      ))
    }

    // ── the balls. Verdict against THIS park's wall: over it, off it, or in
    //    play — the same three answers the 2D park test prints.
    const COL_HR = new THREE.Color(C.orange)
    const COL_WALL = new THREE.Color(0xfbbf24)
    const COL_HIT = new THREE.Color(0xb4b4bc)
    const COL_OUT = new THREE.Color(0x55555e)
    const dotGeo = new THREE.SphereGeometry(2.4, 10, 10)

    const flown = []
    hits.forEach((h) => {
      if (!Number.isFinite(h?.r) || !Number.isFinite(h?.ang)) return
      const f = Number.isFinite(h?.ev) && Number.isFinite(h?.la) && h.la > 0
        ? solveFlight(h.ev, h.la, h.r) : null
      const wd = wallD(h.ang)
      const reached = h.r > wd
      const hAtWall = reached && f ? f.heightAt(wd) : null
      const over = reached && (hAtWall == null ? true : hAtWall > wallH(h.ang))
      const col = h.hr || over ? COL_HR : reached ? COL_WALL : h.hit ? COL_HIT : COL_OUT

      if (f) {
        // Sample the solved flight through its own heightAt() — the solver
        // does not expose raw samples, and 36 steps is smooth at any zoom.
        const N = 36
        const pts = []
        for (let i = 0; i <= N; i++) {
          const d = (f.distanceFt * i) / N
          const y = i === N ? 0 : (f.heightAt(d) ?? 0)
          const v = P(d, h.ang)
          pts.push(new THREE.Vector3(v.x, Math.max(0, y), v.z))
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({
            color: col, transparent: true,
            opacity: h.hr || over ? 0.95 : reached ? 0.8 : 0.28,
          }),
        )
        scene.add(line)
        flown.push(line)
      }
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: col }))
      const v = P(h.r, h.ang)
      dot.position.set(v.x, 1.2, v.z)
      scene.add(dot)
    })

    let raf
    const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick) }
    tick()

    const onResize = () => {
      const w = mount.clientWidth || W
      const h2 = Math.max(320, Math.round(w * 0.62))
      camera.aspect = w / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h2)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) { Array.isArray(o.material) ? o.material.forEach((m) => m.dispose()) : o.material.dispose() }
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
      <div ref={mountRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        drag to orbit · scroll to zoom{venue ? ` · ${venue}` : ''} ·{' '}
        <b style={{ color: C.orange }}>orange</b> over the wall ·{' '}
        <b style={{ color: '#fbbf24' }}>amber</b> off the wall ·{' '}
        grey in play — arcs are reconstructed from EV + launch angle so each ball lands where its dot is
        (geometry, not measured trajectory); a ball without both is drawn as a dot only.
      </div>
    </div>
  )
}
