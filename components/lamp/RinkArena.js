'use client'
// 🏟 THE ARENA (2026-10-01, BATCH-NHL-3D). Donovan: "I want the NHL and NFL to
// do the same thing MLB did — have a 3D map ... NHL can be just as fire and
// intuitive as MLB." LAMP's shot map, in the building: the rink in lib/
// rinkWorld.js, the building in lib/arena.js buildArenaRect (roof, light
// banks), MOONSHOT's look (lib/stadiumLook makeComposer -- bloom makes the
// goal pucks and the lamp read as light), MOONSHOT's shell (components/charts/
// StadiumShell: full screen, presets, the chip row).
//
// WHAT IT DRAWS IS WHAT THE 2D DRAWS. `shots` is the SAME filtered list the
// 2D rink gets (ShotPanel's result / type / strength / period chips), the
// same colour rule (goal lamp-red, on net ice, miss / block a dim hollow
// ring), the same 5x5 HEAT cells and ramp, the same slot. Nothing new is
// fetched.
//
// WHAT IT DOES NOT DRAW. The puck's height and path are not tracked: a line
// runs from the shot to the net ALONG THE ICE (wide / high / iron to just
// beside or at the net per the feed's miss reason; a block is a short stub),
// and the caption says so. Shots are written at grade time -- there is no
// live layer, so there is no LIVE chip.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, RINK, rampAt } from '../../lib/nhl/theme'
import { buildRink, rinkPoint, GOAL_X, RINK_L, RINK_W, RINK_R } from '../../lib/rinkWorld'
import { buildArenaRect, rrPoint } from '../../lib/arena'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import StadiumShell from '../charts/StadiumShell'
import { ChartLegend, ChartEmpty } from '../charts'
import { vsCells, vsAlpha, VS_MIN } from './Rink'

// where a line ends at the net, by result / miss reason (the rink's y: +y is
// the shooter's left). The net mouth is y -3..3; "wide" ends 1.5 ft outside it.
function lineEnd(sh) {
  const res = sh[2], why = String(sh[9] || '')
  if (res === 'block') return null
  if (res === 'miss') {
    if (/left/.test(why) && /wide/.test(why)) return [GOAL_X, 4.5]
    if (/right/.test(why) && /wide/.test(why)) return [GOAL_X, -4.5]
    if (/left-post/.test(why)) return [GOAL_X, 3]
    if (/right-post/.test(why)) return [GOAL_X, -3]
    return [GOAL_X, 0]           // high / crossbar / unknown: at the net, drawn dim
  }
  return [GOAL_X, 0]
}

export default function RinkArena({ shots = [], map = null, league = null, slot = null, gridSpec = null, view = 'dots', onPick = null, onPickCell = null, title = '', subtitle = '' }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [motion, setMotion] = useState('replay')
  const [orbit, setOrbit] = useState(false)
  const [full, setFull] = useState(false)
  const [preset, setPreset] = useState('blue')
  const motionRef = useRef(motion); motionRef.current = motion
  const orbitRef = useRef(orbit); orbitRef.current = orbit
  const apiRef = useRef({})
  const pickRef = useRef({ onPick, onPickCell }); pickRef.current = { onPick, onPickCell }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, mount.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.6)))
    const W = mount.clientWidth || 640
    const H = boxH(W)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(RINK.ceiling)
    scene.fog = new THREE.Fog(new THREE.Color(RINK.ceiling), 260, 620)
    const arenaB = buildArenaRect(scene, { w: RINK_W, l: RINK_L, cornerR: RINK_R, roof: true, colors: { seat: RINK.seat, ceiling: RINK.ceiling, bank: RINK.bank } })
    const CEIL = (arenaB.ceilingY || 120) - 10   // never above the roof (the sweep test's blank frames)
    buildRink(scene)

    // ── the camera: BLUE LINE opens, the attacking end filling the frame
    const target = new THREE.Vector3(64, 0, 0)
    const camera = new THREE.PerspectiveCamera(42, W / H, 1, 3000)
    const narrow = W / H < 1.15
    camera.position.set(narrow ? 14 : 4, narrow ? 46 : 38, 0.01)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.enableDamping = true; controls.dampingFactor = 0.075
    controls.enablePan = false; controls.zoomSpeed = 0.75
    controls.maxPolarAngle = Math.PI * 0.46
    controls.minDistance = 18; controls.maxDistance = 140
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const thumb = (w) => { controls.rotateSpeed = 0.55 * Math.min(2.2, Math.max(1, 780 / Math.max(1, w))) }
    thumb(W)
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !isCoarse(), scale: 0.4 })

    // ── IN THE ATTACKING HALF, OUT OF THE SEATS. Outside the boards the decks
    //    rise (lib/arena.js, 'rect'); past them the camera's floor rises with
    //    its distance, so it looks DOWN over the glass instead of sitting in a
    //    row. It never drifts past centre ice, and never into the roof.
    const a = RINK_L / 2, b = RINK_W / 2
    const outside = (p) => {
      // how far outside the boards' rounded rectangle a point is (0 inside)
      const qx = Math.max(0, Math.abs(p.x) - (a - RINK_R)), qz = Math.max(0, Math.abs(p.z) - (b - RINK_R))
      return Math.max(0, Math.hypot(qx, qz) - RINK_R)
    }
    const _off = new THREE.Vector3()
    const keepOut = () => {
      if (apiRef.current.noFloor) return
      const d = outside(camera.position)
      const yMin = 9 + d * 0.62
      if (camera.position.x < -10) camera.position.x = -10
      if (camera.position.y > CEIL) camera.position.y = CEIL
      if (camera.position.y >= yMin) return
      _off.copy(camera.position).sub(controls.target)
      const r = _off.length()
      const dy = Math.min(r * 0.98, yMin - controls.target.y)
      const h = Math.sqrt(Math.max(0, r * r - dy * dy))
      const hz = Math.hypot(_off.x, _off.z) || 1
      _off.set((_off.x / hz) * h, dy, (_off.z / hz) * h)
      camera.position.copy(controls.target).add(_off)
    }

    // ── the marks: one puck per attempt, at its (x, y), the 2D's colour rule
    const disposables = []
    const group = new THREE.Group(); scene.add(group); disposables.push(group)
    const puckGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.35, 20)
    const ringGeo = new THREE.RingGeometry(0.7, 1.0, 24)
    const mat = {
      goal: new THREE.MeshStandardMaterial({ color: new THREE.Color(C.lamp), emissive: new THREE.Color(C.lamp), emissiveIntensity: 2.4 }),
      sog: new THREE.MeshStandardMaterial({ color: new THREE.Color(C.ice), emissive: new THREE.Color(C.ice), emissiveIntensity: 0.6 }),
      dim: new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text3), side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    }
    const lineMat = {
      goal: new THREE.LineBasicMaterial({ color: new THREE.Color(C.lamp), transparent: true, opacity: 0.85 }),
      sog: new THREE.LineBasicMaterial({ color: new THREE.Color(C.ice), transparent: true, opacity: 0.55 }),
      dim: new THREE.LineDashedMaterial({ color: new THREE.Color(C.text3), transparent: true, opacity: 0.45, dashSize: 1.2, gapSize: 1 }),
    }
    const lines = []
    const pickables = []
    const vs = view === 'vs' ? vsCells(map?.grid, league) : null
    if (vs && gridSpec) {
      // VS LEAGUE: the 2D's cells and colours (his share minus the league's)
      const cw = (gridSpec.x1 - gridSpec.x0) / gridSpec.cols, ch = (gridSpec.y1 - gridSpec.y0) / gridSpec.rows
      vs.forEach((row, r) => row.forEach((v, c) => {
        if (v.att < VS_MIN) return
        const m = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.4, ch - 0.4),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(v.d >= 0 ? C.lamp : C.ice), transparent: true, opacity: vsAlpha(v.d, 0.75), depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        m.position.copy(rinkPoint(gridSpec.x0 + (c + 0.5) * cw, gridSpec.y1 - (r + 0.5) * ch, 0.06))
        m.userData.cell = { ...map.grid[r][c], r, c, vs: v }
        group.add(m); pickables.push(m)
      }))
    } else if (view === 'heat' && map?.grid && gridSpec) {
      // the HEAT view: the 2D's 5x5 cells as tiles on the ice, same ramp
      const max = Math.max(1, ...map.grid.flat().map((c) => c.att))
      const cw = (gridSpec.x1 - gridSpec.x0) / gridSpec.cols, ch = (gridSpec.y1 - gridSpec.y0) / gridSpec.rows
      map.grid.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell.att) return
        const t = cell.att / max
        const m = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.4, ch - 0.4),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(rampAt(t)), transparent: true, opacity: 0.18 + 0.6 * t, depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        const cx = gridSpec.x0 + (c + 0.5) * cw, cy = gridSpec.y1 - (r + 0.5) * ch
        m.position.copy(rinkPoint(cx, cy, 0.06))
        m.userData.cell = { ...cell, r, c }
        group.add(m); pickables.push(m)
      }))
    } else {
      shots.forEach((sh, i) => {
        const res = sh[2]
        const kind = res === 'goal' ? 'goal' : res === 'sog' ? 'sog' : 'dim'
        let mesh
        if (kind === 'dim') { mesh = new THREE.Mesh(ringGeo, mat.dim); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(rinkPoint(sh[0], sh[1], 0.12)) } else { mesh = new THREE.Mesh(puckGeo, mat[kind]); mesh.position.copy(rinkPoint(sh[0], sh[1], 0.2)) }
        mesh.userData.shot = sh
        group.add(mesh); pickables.push(mesh)
        // the line along the ice
        const from = rinkPoint(sh[0], sh[1], 0.15)
        const end = lineEnd(sh)
        const to = end ? rinkPoint(end[0], end[1], 0.15) : from.clone().lerp(rinkPoint(GOAL_X, 0, 0.15), 0.18)
        const g = new THREE.BufferGeometry().setFromPoints([from, to])
        const l = new THREE.Line(g, lineMat[kind]); if (kind === 'dim') l.computeLineDistances()
        group.add(l); lines.push({ l, i })
      })
    }
    // the slot, shaded as in 2D
    if (slot) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(slot.x1 - slot.x0, slot.y * 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ice), transparent: true, opacity: 0.08, depthWrite: false }))
      sm.rotation.x = -Math.PI / 2; sm.position.copy(rinkPoint((slot.x0 + slot.x1) / 2, 0, 0.05)); group.add(sm)
    }

    // ── REPLAY: the lines draw in order over ~4 s
    let replayT0 = performance.now()
    apiRef.current.replay = () => { replayT0 = performance.now() }
    const stepReplay = (t) => {
      const m = motionRef.current
      const k = m === 'hold' ? 1 : Math.min(1, (t - replayT0) / 4000)
      const shown = Math.ceil(k * lines.length)
      lines.forEach(({ l, i }) => { l.visible = i < shown })
    }

    // ── PRESETS (StadiumShell chips)
    const V = (x, y, z) => new THREE.Vector3(x, y, z)
    const SHOTS = {
      net: () => [V(124, 30, 0.01), V(58, 0, 0)],
      blue: () => [V(narrow ? 14 : 4, narrow ? 46 : 38, 0.01), V(64, 0, 0)],
      rafters: () => [V(30, CEIL - 4, 70), V(64, 0, 0)],
      top: () => [V(62, CEIL, 0.01), V(62, 0, 0)],
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
    // the sweep test's measure: the share of a 24 x 16 ray grid whose first
    // solid hit is the ice (or anything on it), inside the boards
    const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2()
    apiRef.current.fieldShare = () => {
      camera.updateMatrixWorld(true)
      let hit = 0, n = 0
      for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) {
        _ndc.set(-1 + (2 * i + 1) / 24, -1 + (2 * j + 1) / 16); _ray.setFromCamera(_ndc, camera)
        const first = _ray.intersectObjects(scene.children, true).find((x) => { const m = x.object.material; return x.object.isMesh && x.object.visible && !m?.transparent })
        n++
        const pt = first?.point
        if (pt && pt.y < 1.2 && outside(pt) === 0) hit++
      }
      return hit / n
    }
    if (typeof window !== 'undefined') window.__dash3d = apiRef.current

    // ── TAP A PUCK / A TILE -> the same detail card the 2D opens
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      // a 1-ft puck is not a thumb target: test against a generous radius
      const hits = ray.intersectObjects(pickables, false)
      let pick = hits[0]?.object
      if (!pick) {
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3()
        if (ray.ray.intersectPlane(ground, pt)) {
          let best = null, bd = 4.5
          for (const m of pickables) { const d = Math.hypot(m.position.x - pt.x, m.position.z - pt.z); if (d < bd) { bd = d; best = m } }
          pick = best
        }
      }
      if (pick?.userData.shot) pickRef.current.onPick?.(pick.userData.shot)
      else if (pick?.userData.cell) pickRef.current.onPickCell?.(pick.userData.cell)
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
    // render only while on screen (the MOONSHOT views' rule)
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
  }, [shots, map, slot, gridSpec, view, full, league])

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the arena isn&apos;t available here — the rink above shows the same shots.</ChartEmpty>

  const chipBtn = (on, col) => ({
    minHeight: 44, padding: '0 14px', fontSize: 12, fontWeight: 800, borderRadius: 999, cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${on ? col : C.border2}`, background: on ? `${col}22` : 'transparent', color: on ? col : C.text2,
  })
  const chips = (
    <>
      <button type="button" style={chipBtn(motion === 'replay', C.ice)} onClick={() => { setMotion('replay'); apiRef.current.replay?.() }} title="Draw the shots in order">▶ replay</button>
      <button type="button" style={chipBtn(motion === 'hold', C.text2)} onClick={() => setMotion('hold')} title="Every line at once, nothing moving">⏸ hold</button>
      <button type="button" style={chipBtn(orbit, C.cream)} onClick={() => setOrbit((v) => !v)} title="Turn slowly round the rink until you grab it">⟳ orbit</button>
    </>
  )
  const PRESETS = [
    { key: 'net', label: 'BEHIND THE NET', title: 'From the seats behind the net' },
    { key: 'blue', label: 'BLUE LINE', title: 'From the blue line, the attacking end ahead' },
    { key: 'rafters', label: 'RAFTERS', title: 'High in the corner' },
    { key: 'top', label: 'TOP', title: 'Straight down on the attacking end' },
  ]
  const caption = (
    <div style={{ marginTop: 6 }}>
      <ChartLegend theme={C} items={view === 'vs'
        ? [{ key: 'vs', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.lamp}aa` }} />, label: 'more than the league / blue fewer, as on the rink above' }]
        : view === 'heat'
        ? [{ key: 'heat', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.ice}88` }} />, label: 'shaded by attempts per zone, as on the rink above' }]
        : [{ key: 'goal', mark: <b aria-hidden="true" style={{ color: C.lamp }}>●</b>, label: 'goal' },
          { key: 'sog', mark: <b aria-hidden="true" style={{ color: C.ice }}>●</b>, label: 'on net' },
          { key: 'miss', mark: <b aria-hidden="true">○</b>, label: 'missed / blocked' }]} />
      <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {view === 'dots' ? 'Lines run from the shot to the net along the ice — not tracked puck paths. ' : ''}{view === 'dots' ? <>The same {shots.length} shot{shots.length === 1 ? '' : 's'} as the rink above</> : 'The same zones as the rink above'} · drag to orbit · tap a puck for the shot
      </div>
    </div>
  )

  return (
    <StadiumShell theme={C} accent={C.ice} chips={chips} presets={PRESETS} active={preset}
      onPreset={(k) => { setPreset(k); apiRef.current.preset?.(k) }} onFullChange={setFull} caption={caption}>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mountRef} style={{
          width: '100%', ...(full ? { height: '100%' } : { minHeight: 340, aspectRatio: '1 / 0.6' }),
          borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
        }} />
        {(title || subtitle) && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 2, pointerEvents: 'none', maxWidth: '70%' }}>
            {title && <div style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, letterSpacing: '.06em', color: C.text, textShadow: '0 2px 10px rgba(0,0,0,.85)' }}>{String(title).toUpperCase()}</div>}
            <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.14em', color: C.text3, marginTop: 3, textShadow: '0 2px 8px rgba(0,0,0,.85)' }}>{subtitle ? String(subtitle).toUpperCase() : 'LAMP'}</div>
          </div>
        )}
      </div>
    </StadiumShell>
  )
}
