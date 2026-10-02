'use client'
// 🏟 THE STADIUM (2026-10-01, BATCH-NFL-3D). Donovan: "I want the NHL and NFL
// to do the same thing MLB did — have a 3D map." TUDDY's Field, under the
// lights: the field in lib/fieldWorld.js, the open bowl in lib/arena.js
// buildArenaRect, MOONSHOT's look (lib/stadiumLook makeComposer) and shell
// (components/charts/StadiumShell). The twin of components/lamp/RinkArena.js.
//
// WHAT IT DRAWS IS WHAT THE 2D DRAWS. TheField hands over the SAME targets
// it plots (window, PLAYER / TEAM), with the 2D's size (YAC) and ink; the
// SAME zone cells (fieldModel's leak -> heatOf / coolOf) and THE SPOT; the
// SAME red-zone touches as its strip. Nothing is fetched.
//
// WHAT IT DOES NOT DRAW. The feed gives a target's LANE (a third of the field,
// the play-by-play's pass_location) and AIR YARDS, not the spot across the field or the
// ball's flight. So a mark sits at its true depth in one of three FIXED
// columns of its lane, in game order, stacked when two land together; a line
// runs flat on the turf from the line of scrimmage (no arc height). A red-zone
// touch has a distance and no lane: it sits at its yard line on a rail just
// outside the sideline. The caption says all of it.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, FIELD3D } from '../../lib/nfl/theme'
import { buildField, fieldPoint, FIELD_L, FIELD_W, LANE_W, YD } from '../../lib/fieldWorld'
import { buildArenaRect } from '../../lib/arena'
import { heatOf, coolOf } from '../../lib/nfl/fieldModel'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import StadiumShell from '../charts/StadiumShell'
import { ChartLegend, ChartEmpty } from '../charts'

// TheField's depth bands, in air yards (the 2D's BANDS)
const BAND_YD = { behind: [-6, 0], short: [0, 10], mid: [10, 20], deep: [20, 36] }

export default function FieldArena({ dots = [], cells = [], spot = null, rz = [], onPick = null, title = '', subtitle = '' }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [motion, setMotion] = useState('replay')
  const [orbit, setOrbit] = useState(false)
  const [full, setFull] = useState(false)
  const [preset, setPreset] = useState('endzone')
  const motionRef = useRef(motion); motionRef.current = motion
  const orbitRef = useRef(orbit); orbitRef.current = orbit
  const apiRef = useRef({})
  const pickRef = useRef(onPick); pickRef.current = onPick
  const sig = `${dots.map((d) => `${d.i}${d.ink}${d.res}`).join(',')}|${cells.map((c) => `${c.k}:${c.leak}`).join(',')}|${spot ? spot.L + spot.B.key : ''}|${rz.map((t) => `${t.seed}${t.res}`).join(',')}`

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, mount.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.6)))
    const W = mount.clientWidth || 640
    const H = boxH(W)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(FIELD3D.sky)
    scene.fog = new THREE.Fog(new THREE.Color(FIELD3D.sky), 700, 1500)
    const { mid } = buildField(scene)
    // the bowl round the whole field (the 'rect' footprint, open to the night)
    const bowl = new THREE.Group(); scene.add(bowl)
    buildArenaRect(bowl, { w: FIELD_W + 40, l: FIELD_L + 40, cornerR: 30, roof: false, colors: { seat: FIELD3D.seat, fascia: FIELD3D.fascia } })
    bowl.position.x = mid

    // ── the camera: END ZONE opens -- behind the offence, looking downfield,
    //    left lane on the left, exactly as the 2D reads
    const target = new THREE.Vector3(16 * YD, 0, 0)
    const camera = new THREE.PerspectiveCamera(42, W / H, 1, 4000)
    const narrow = W / H < 1.15
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.075
    controls.enablePan = false; controls.zoomSpeed = 0.75
    controls.maxPolarAngle = Math.PI * 0.46
    controls.minDistance = 40; controls.maxDistance = 330
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const thumb = (w) => { controls.rotateSpeed = 0.55 * Math.min(2.2, Math.max(1, 780 / Math.max(1, w))) }
    thumb(W)
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !isCoarse(), scale: 0.4 })

    const V = (x, y, z) => new THREE.Vector3(x, y, z)
    const SHOTS = {
      endzone: () => [V(-24 * YD, narrow ? 120 : 84, 0.01), V(14 * YD, 0, 0)],
      sideline: () => [V(15 * YD, 70, FIELD_W / 2 + 120), V(15 * YD, 0, 0)],
      all22: () => [V(-8 * YD, 230, 0.01), V(16 * YD, 0, 0)],
      top: () => [V(15 * YD, narrow ? 330 : 250, 0.01), V(15 * YD, 0, 0)],
    }
    {
      const [p, t] = SHOTS.endzone()
      camera.position.copy(p); controls.target.copy(t); target.copy(t)
    }

    // ── IN THE BOWL'S AIR, OUT OF ITS SEATS. Past the sideline the decks rise;
    //    the camera's floor rises with its distance outside the field, so it
    //    looks down over the rail. Never under the turf, never into the night.
    const hx = FIELD_L / 2, hz = FIELD_W / 2
    const outside = (p) => Math.hypot(Math.max(0, Math.abs(p.x - mid) - hx), Math.max(0, Math.abs(p.z) - hz))
    const _off = new THREE.Vector3()
    const keepOut = () => {
      if (apiRef.current.noFloor) return
      const yMin = 14 + outside(camera.position) * 0.62
      if (camera.position.y > 340) camera.position.y = 340
      if (camera.position.y >= yMin) return
      _off.copy(camera.position).sub(controls.target)
      const r = _off.length()
      const dy = Math.min(r * 0.98, yMin - controls.target.y)
      const h = Math.sqrt(Math.max(0, r * r - dy * dy))
      const hzz = Math.hypot(_off.x, _off.z) || 1
      _off.set((_off.x / hzz) * h, dy, (_off.z / hzz) * h)
      camera.position.copy(controls.target).add(_off)
    }

    // ── the zones: the 2D's ink as tiles on the turf
    const group = new THREE.Group(); scene.add(group)
    const LANES = ['L', 'M', 'R']
    for (const c of cells) {
      if (c.leak == null) continue
      const h = heatOf(c.leak), cl = coolOf(c.leak)
      if (h < 0.12 && cl < 0.12) continue
      const [y0, y1] = BAND_YD[c.B.key] || [0, 0]
      const m = new THREE.Mesh(new THREE.PlaneGeometry((y1 - y0) * YD - 1.2, LANE_W - 1.2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(h >= 0.12 ? C.orange : C.cyan), transparent: true, opacity: h >= 0.12 ? 0.08 + h * 0.26 : 0.06 + cl * 0.18, depthWrite: false }))
      m.rotation.x = -Math.PI / 2
      m.position.copy(fieldPoint((y0 + y1) / 2, c.L, 0, 0.08))
      group.add(m)
    }
    if (spot && LANES.includes(spot.L)) {
      const [y0, y1] = BAND_YD[spot.B.key] || [0, 0]
      const rr = Math.min(LANE_W, (y1 - y0) * YD) * 0.42
      const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 1, rr, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2; ring.position.copy(fieldPoint((y0 + y1) / 2, spot.L, 0, 0.12)); group.add(ring)
    }
    // the line of scrimmage, in the 2D's ice
    {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ice), transparent: true, opacity: 0.85 }))
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.1, 0); group.add(m)
    }

    // ── the targets: one per play, the 2D's colour rule and size, in game
    //    order. Three fixed columns per lane (the lane is known, the spot
    //    across it is not); two marks at the same depth in a column stack.
    const pickables = [], arcs = []
    const geo = new THREE.SphereGeometry(1, 20, 14)
    const ringGeo = new THREE.RingGeometry(0.72, 1, 24)
    const COLS = [-1 / 3, 0, 1 / 3]
    const inLane = {}, stack = {}
    const sorted = [...dots].sort((a, b) => (a.wk - b.wk) || (a.i - b.i))
    sorted.forEach((p, n) => {
      const td = p.res === 'td', caught = p.res === 'catch' || td
      const r = 1.6 + (Math.min(25, p.yac || 0) / 25) * 2.2
      const k = (inLane[p.lane] = (inLane[p.lane] || 0) + 1) - 1
      const col = k % 3
      const at = fieldPoint(p.air, p.lane, COLS[col], 0)
      const sk = `${p.lane}${col}${Math.round(at.x / 4)}`
      const lift = (stack[sk] = (stack[sk] || 0) + 1) - 1
      const ink = new THREE.Color(td ? C.orange : p.ink)
      let mesh
      if (caught) {
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: ink, emissive: ink, emissiveIntensity: td ? 2.2 : 0.55 }))
        mesh.scale.setScalar(r); mesh.position.copy(at).setY(r * 0.9 + lift * 3.4)
      } else {
        mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ink, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }))
        mesh.scale.setScalar(r); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(at).setY(0.15 + lift * 3.4)
      }
      mesh.userData.play = p
      group.add(mesh); pickables.push(mesh)
      // a flat line on the turf from the line of scrimmage, down the column
      const g = new THREE.BufferGeometry().setFromPoints([V(0, 0.12, at.z), V(at.x, 0.12, at.z)])
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: td ? 0.75 : caught ? 0.35 : 0.18 }))
      group.add(l); arcs.push({ l, n })
    })
    // ── the red zone: each touch at its yard line on a rail past the near
    //    sideline (+z), the strip's touches; the goal line is 65 yd from the LOS
    const GOAL_YD = 65, RAIL_Z = FIELD_W / 2 + 7
    {
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(20 * YD, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.orange), transparent: true, opacity: 0.16, depthWrite: false }))
      rail.rotation.x = -Math.PI / 2; rail.position.set((GOAL_YD - 10) * YD, 0.1, RAIL_Z); group.add(rail)
      const at = {}
      for (const t of rz) {
        const d = Math.max(0, Math.min(20, Number(t.d) || 0))
        const x = (GOAL_YD - d) * YD
        const lift = (at[d] = (at[d] || 0) + 1) - 1
        // the strip's colour rule (RedZoneField): td orange, catch cream, carry amber, else a hollow ring
        const ink = { td: C.orange, catch: C.cream, carry: C.amber }[t.res]
        const m = ink
          ? new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(ink), emissive: new THREE.Color(ink), emissiveIntensity: t.res === 'td' ? 2 : 0.35 }))
          : new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text2), side: THREE.DoubleSide }))
        if (ink) { m.scale.setScalar(1.5); m.position.set(x, 1.4 + lift * 3, RAIL_Z) } else { m.scale.setScalar(1.5); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.2 + lift * 3, RAIL_Z) }
        group.add(m)
      }
    }

    // ── REPLAY: the throws land in order over ~4 s
    let replayT0 = performance.now()
    apiRef.current.replay = () => { replayT0 = performance.now() }
    const stepReplay = (t) => {
      const k = motionRef.current === 'hold' ? 1 : Math.min(1, (t - replayT0) / 4000)
      const shown = Math.ceil(k * arcs.length)
      arcs.forEach(({ l, n }) => { l.visible = n < shown })
    }

    let anim = null
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
    apiRef.current.preset = (key) => { const s = SHOTS[key]; if (!s) return; const [p1, t1] = s(); anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, s: performance.now() } }
    controls.update()
    const AZ0 = controls.getAzimuthalAngle()
    apiRef.current.controls = controls
    apiRef.current.setView = (azDeg, distK, polarK) => {
      const sph = new THREE.Spherical(controls.minDistance + distK * (controls.maxDistance - controls.minDistance), Math.max(0.05, polarK * controls.maxPolarAngle), AZ0 + (azDeg * Math.PI) / 180)
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); controls.update(); keepOut()
    }
    // the sweep test's measure: share of a 24 x 16 ray grid whose first solid
    // hit is the field (or anything on it), inside the sidelines and end lines
    const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2()
    apiRef.current.fieldShare = () => {
      camera.updateMatrixWorld(true)
      let hit = 0, n = 0
      for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) {
        _ndc.set(-1 + (2 * i + 1) / 24, -1 + (2 * j + 1) / 16); _ray.setFromCamera(_ndc, camera)
        const first = _ray.intersectObjects(scene.children, true).find((x) => x.object.isMesh && x.object.visible && !x.object.material?.transparent)
        n++
        const pt = first?.point
        if (pt && pt.y < 6 && outside(pt) === 0) hit++
      }
      return hit / n
    }
    if (typeof window !== 'undefined') window.__dash3d = apiRef.current

    // ── TAP A TARGET -> the same play card the 2D opens
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const rc = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      let pick = ray.intersectObjects(pickables, false)[0]?.object
      if (!pick) {
        // a few-foot dot is not a thumb target: the nearest within 4 yd of the tap on the turf
        const pt = new THREE.Vector3()
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
          let bd = 4 * YD
          for (const m of pickables) { const d = Math.hypot(m.position.x - pt.x, m.position.z - pt.z); if (d < bd) { bd = d; pick = m } }
        }
      }
      if (pick?.userData.play) pickRef.current?.(pick.userData.play.i)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    let driving = false
    controls.addEventListener('start', () => { driving = true })
    controls.addEventListener('end', () => { driving = false })
    let raf = 0
    const tick = (now) => {
      const t = now || performance.now()
      if (anim) {
        const k = Math.min(1, (t - anim.s) / 600), e = ease(k)
        camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e)
        if (k >= 1) anim = null
      }
      controls.autoRotate = !!orbitRef.current && !driving && motionRef.current !== 'hold'
      controls.autoRotateSpeed = 0.5
      controls.update(); keepOut()
      stepReplay(t)
      look.render()
      raf = requestAnimationFrame(tick)
    }
    let onScreen = true, hidden = typeof document !== 'undefined' && document.hidden, running = false
    const start = () => { if (!running && onScreen && !hidden) { running = true; raf = requestAnimationFrame(tick) } }
    const stop = () => { if (running) { running = false; cancelAnimationFrame(raf) } }
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((en) => { onScreen = en.some((x) => x.isIntersecting); onScreen ? start() : stop() }, { threshold: 0.05 }) : null
    if (io) io.observe(renderer.domElement)
    const onVis = () => { hidden = document.hidden; hidden ? stop() : start() }
    document.addEventListener('visibilitychange', onVis)
    start()
    const onResize = () => {
      const w = mount.clientWidth || W, h2 = boxH(w)
      camera.aspect = w / h2; camera.updateProjectionMatrix(); renderer.setSize(w, h2); look.setSize(w, h2); thumb(w)
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null
    if (ro) ro.observe(mount)

    return () => {
      cancelAnimationFrame(raf)
      if (io) io.disconnect(); if (ro) ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      if (typeof window !== 'undefined' && window.__dash3d === apiRef.current) delete window.__dash3d
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
      })
      look.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // keyed on WHAT is drawn, not on array identity: TheField builds these
    // per render, and a rebuild per render would throw the camera away
  }, [sig, full]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the stadium isn&apos;t available here — the field below shows the same targets.</ChartEmpty>

  const chipBtn = (on, col) => ({
    minHeight: 44, padding: '0 14px', fontSize: 12, fontWeight: 800, borderRadius: 999, cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${on ? col : C.border2}`, background: on ? `${col}22` : 'transparent', color: on ? col : C.text2,
  })
  const chips = (
    <>
      <button type="button" style={chipBtn(motion === 'replay', C.green)} onClick={() => { setMotion('replay'); apiRef.current.replay?.() }} title="Draw the targets in game order">▶ replay</button>
      <button type="button" style={chipBtn(motion === 'hold', C.text2)} onClick={() => setMotion('hold')} title="Every throw at once, nothing moving">⏸ hold</button>
      <button type="button" style={chipBtn(orbit, C.cream)} onClick={() => setOrbit((v) => !v)} title="Turn slowly round the field until you grab it">⟳ orbit</button>
    </>
  )
  const PRESETS = [
    { key: 'sideline', label: 'SIDELINE', title: 'From the sideline seats' },
    { key: 'endzone', label: 'END ZONE', title: 'Behind the offence, looking downfield' },
    { key: 'all22', label: 'ALL-22', title: 'High behind the offence, every lane in frame' },
    { key: 'top', label: 'TOP', title: 'Straight down' },
  ]
  const caption = (
    <div style={{ marginTop: 6 }}>
      <ChartLegend theme={C} items={[
        { key: 'td', mark: <b aria-hidden="true" style={{ color: C.orange }}>●</b>, label: 'touchdown' },
        { key: 'catch', mark: <b aria-hidden="true" style={{ color: C.cream }}>●</b>, label: 'catch' },
        { key: 'inc', mark: <b aria-hidden="true">○</b>, label: 'incomplete / picked' },
        { key: 'heat', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.orange}88` }} />, label: 'a zone that gives up more than normal' },
      ]} />
      <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        A target&apos;s lane is known, its exact spot across the field is not: each sits at its true depth in one of three set columns of its lane, and the lines on the turf are not tracked ball flights. Red-zone touches sit at their yard line on the rail past the sideline (the feed gives the distance, not the lane). The same {dots.length} target{dots.length === 1 ? '' : 's'} as the field below · drag to orbit · tap a dot for the play
      </div>
    </div>
  )

  return (
    <StadiumShell theme={C} accent={C.green} chips={chips} presets={PRESETS} active={preset}
      onPreset={(k) => { setPreset(k); apiRef.current.preset?.(k) }} onFullChange={setFull} caption={caption}>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mountRef} style={{
          width: '100%', ...(full ? { height: '100%' } : { minHeight: 340, aspectRatio: '1 / 0.6' }),
          borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
        }} />
        {(title || subtitle) && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 2, pointerEvents: 'none', maxWidth: '70%' }}>
            {title && <div style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, letterSpacing: '.06em', color: C.text, textShadow: '0 2px 10px rgba(0,0,0,.85)' }}>{String(title).toUpperCase()}</div>}
            <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.14em', color: C.text3, marginTop: 3, textShadow: '0 2px 8px rgba(0,0,0,.85)' }}>{subtitle ? String(subtitle).toUpperCase() : 'TUDDY'}</div>
          </div>
        )}
      </div>
    </StadiumShell>
  )
}
