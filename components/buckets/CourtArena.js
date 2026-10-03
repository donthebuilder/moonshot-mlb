'use client'
// BUCKETS IN 3D (B7, 2026-10-02): the shot chart's game on a hardwood court
// under a roof -- the shared arena (lib/arena.js buildArenaRect, as LAMP's
// rink), lib/courtWorld.js's floor, every shot a disc where it was taken
// (made filled, missed a ring). Tap a disc and the shot is drawn to the rim.
// No release point or arc height is published, so the arc is geometry and the
// view says so (MOONSHOT's rule for its own ball flights). Admin only for now.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, COURT } from '../../lib/theme'
import { buildCourt, courtPoint, shotArc, COURT_W, HALF_L } from '../../lib/courtWorld'
import { buildArenaRect } from '../../lib/arena'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'

const ACCENT = C.purple
const VIEWS = [
  { k: 'baseline', label: 'BASELINE', pos: [0, 34, -HALF_L / 2 - 30], target: [0, 4, 6] },
  { k: 'sideline', label: 'SIDELINE', pos: [COURT_W / 2 + 46, 30, 0], target: [0, 2, -4] },
  { k: 'top', label: 'TOP', pos: [0, 92, 0.01], target: [0, 0, 0] },
]
const btn = (on) => ({ minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? ACCENT : C.border2}`, background: on ? `${ACCENT}22` : 'transparent', color: on ? ACCENT : C.text2, fontWeight: 800, fontSize: 11, fontFamily: NUM_FONT, cursor: 'pointer' })

export default function CourtArena({ shots = [], names = {} }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [view, setView] = useState('baseline')
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = Math.max(320, Math.round(W * 0.68))
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COURT.apron)
    buildCourt(scene)
    const bowl = new THREE.Group(); scene.add(bowl)
    buildArenaRect(bowl, { w: COURT_W + 30, l: HALF_L * 2 + 30, cornerR: 10, roof: true, colors: { seat: COURT.seat } })
    bowl.position.z = HALF_L / 2   // the half court is one end of a full arena
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.5, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 18; controls.maxDistance = 160
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !isCoarse(), scale: 0.4 })

    // the shots: a disc each, on the floor
    const discs = new THREE.Group(); scene.add(discs)
    const made = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT) })
    const miss = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text3), transparent: true, opacity: 0.85 })
    for (const s of shots) {
      const m = new THREE.Mesh(s.made ? new THREE.CircleGeometry(0.55, 20) : new THREE.RingGeometry(0.38, 0.55, 20), s.made ? made : miss)
      m.rotation.x = -Math.PI / 2; m.position.copy(courtPoint(s.x, s.y, 0.06)); m.userData.shot = s
      discs.add(m)
    }
    // the drawn arc for a picked shot
    let arc = null
    const showArc = (s) => {
      if (arc) { scene.remove(arc); arc.geometry.dispose(); arc = null }
      if (!s) return
      arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shotArc(s.x, s.y, s.made)), new THREE.LineBasicMaterial({ color: new THREE.Color(s.made ? ACCENT : C.text2) }))
      scene.add(arc)
    }
    const go = (k) => { const v = VIEWS.find((x) => x.k === k) || VIEWS[0]; camera.position.set(...v.pos); controls.target.set(...v.target); controls.update() }
    go('baseline')
    // tap a disc (a tap, not a drag)
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return }
      down = null
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      // a forgiving tap: the nearest disc to where the ray meets the floor, within 2 ft
      const hit = new THREE.Vector3()
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return
      let best = null, bd = 2
      for (const m of discs.children) { const d = m.position.distanceTo(hit); if (d < bd) { bd = d; best = m } }
      const s = best?.userData.shot || null
      setPicked(s); showArc(s)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    api.current = { go }
    // the render loop runs only on screen and in a visible tab
    let raf = 0, onScreen = true
    const tick = () => { controls.update(); look.render(); raf = requestAnimationFrame(tick) }
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) raf = requestAnimationFrame(tick) })
    io.observe(el)
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && onScreen) raf = requestAnimationFrame(tick) }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(tick)
    if (typeof window !== 'undefined') window.__bucketsCourt = { scene, discs: discs.children.length }
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [shots])

  if (!ok) return <p style={{ fontSize: 12, color: C.text3 }}>3D needs WebGL, which this browser has turned off. The shot chart above is the same game.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {VIEWS.map((v) => <button key={v.k} type="button" aria-pressed={view === v.k} onClick={() => { setView(v.k); api.current.go?.(v.k) }} style={btn(view === v.k)}>{v.label}</button>)}
      </div>
      <div ref={mount} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <p style={{ margin: 0, fontSize: 12, color: C.text2, fontFamily: NUM_FONT, minHeight: 18 }}>
        {picked
          ? <><b style={{ color: picked.made ? ACCENT : C.text }}>{names[picked.player_id] || picked.player_id}</b> · {picked.made ? 'made' : 'missed'} {picked.three ? 'a three' : 'a two'} · {picked.shot_type}{picked.distance != null ? ` · ${picked.distance} ft` : ''} · Q{picked.period > 4 ? `OT${picked.period - 4}` : picked.period} {picked.clock}</>
          : 'Tap a shot to draw it to the rim. Drag to turn the court.'}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: C.text3 }}>Where each shot was taken is the feed's own spot. The arc to the rim is drawn, not measured: no release point or arc height is published.</p>
    </div>
  )
}
