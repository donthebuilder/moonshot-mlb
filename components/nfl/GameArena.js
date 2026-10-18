'use client'
// 🏟 THE GAME FIELD IN 3D (2026-10-17, path item 3: "I want the 3D chart based around this ... incorporate the players").
// The same picture as components/nfl/BroadcastField.js, stood up in a night stadium (the scene, camera, controls and look are FieldArena's):
//   the ZONES are columns on the turf, height = the zone's heat, colour = the lens' hue, the number on top (BroadcastField's own `cells`);
//   the MEN stand at the spots of lib/nfl/fieldMen.js (the same helper the flat chart uses, so the two cannot disagree): a face in a club-coloured
//   ring (dashed = placed by his role), his name under him. A tap on a face opens his card. ESPN's headshots send CORS headers, so the real
//   photo is drawn on the disc; where one does not load the disc keeps his initials.
// It draws no ball flight and claims no coverage: the corners are drawn by chart slot (the caption says so).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, FIELD3D } from '../../lib/nfl/theme'
import { nflTones } from '../../lib/nfl/teamColors'
import { nflHeadshot } from '../../lib/nfl/nflAssets'
import { buildField, FIELD_L, FIELD_W, YD } from '../../lib/fieldWorld'
import { buildArenaRect } from '../../lib/arena'
import { fieldSpots, FM } from '../../lib/nfl/fieldMen'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { labelSprite, declutterLabels } from '../../lib/three/sprites'
import StadiumShell from '../charts/StadiumShell'
import { ChartEmpty } from '../charts'

const SIDES = ['left', 'middle', 'right']
const BAND_YD = { behind: [-6, 0], short: [0, 10], mid: [10, 20], deep: [20, 36] }
const across = (u) => -FIELD_W / 2 + u * FIELD_W
/** BroadcastField's viewBox x / y -> the world: x is 0..300 across (left to right), y runs from the line (236) down the page = back behind it; 6 units a yard */
const worldOf = (x, y, h) => new THREE.Vector3(((FM.LOS - y) / 6) * YD, h, across(x / FM.W))

// a face on a ringed disc, drawn on a canvas: initials first, the photo when it arrives
function faceTexture(m, ring, alive) {
  const S = 128
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S
  const g = cv.getContext('2d')
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
  const dashed = m.basis === 'role' || m.basis === 'chart'
  const paint = (img) => {
    g.clearRect(0, 0, S, S)
    g.fillStyle = '#0b0f0d'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); g.fill()
    if (img) {
      g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 9, 0, Math.PI * 2); g.clip(); g.drawImage(img, 8, 4, S - 16, S - 16); g.restore()
    } else {
      g.fillStyle = '#9aa7a0'; g.font = `900 46px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(m.last || m.name || '?').slice(0, 2).toUpperCase(), S / 2, S / 2 + 2)
    }
    g.lineWidth = dashed ? 5 : 10; g.strokeStyle = ring; g.setLineDash(dashed ? [12, 9] : [])
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); g.stroke()
    tex.needsUpdate = true
  }
  paint(null)
  const url = m.espn_id ? nflHeadshot(m.espn_id, 64, 64) : null
  if (url) {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => { if (alive()) paint(im) }
    im.src = url
  }
  return tex
}

export default function GameArena({ cells = {}, men = [], defMen = [], hue = C.green, title = '', onPlayer = null }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [preset, setPreset] = useState('endzone')
  const [full, setFull] = useState(false)
  const apiRef = useRef({})
  const playerRef = useRef(onPlayer); playerRef.current = onPlayer
  const sig = `${Object.entries(cells).map(([k, c]) => `${k}:${c.heat}:${c.big}`).join(',')}|${men.map((m) => m.id + m.side + m.slot).join(',')}|${defMen.map((m) => m.id).join(',')}|${hue}`

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, mount.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.75)))
    const W = mount.clientWidth || 640
    const H = boxH(W)
    let alive = true
    const isAlive = () => alive

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(FIELD3D.sky)
    scene.fog = new THREE.Fog(new THREE.Color(FIELD3D.sky), 520, 1300)
    const { mid } = buildField(scene)
    const bowl = new THREE.Group(); scene.add(bowl)
    buildArenaRect(bowl, { w: FIELD_W + 40, l: FIELD_L + 40, cornerR: 30, roof: false, colors: { seat: FIELD3D.seat, fascia: FIELD3D.fascia } })
    bowl.position.x = mid

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
    controls.rotateSpeed = 0.55 * Math.min(2.2, Math.max(1, 780 / Math.max(1, W)))
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !isCoarse(), scale: 0.4 })

    const V = (x, y, z) => new THREE.Vector3(x, y, z)
    const SHOTS = {
      endzone: () => [narrow ? V(-58 * YD, 150, 0.01) : V(-30 * YD, 84, 0.01), V((narrow ? 16 : 12) * YD, 0, 0)],
      sideline: () => [V(15 * YD, 70, FIELD_W / 2 + 120), V(15 * YD, 0, 0)],
      all22: () => [V(-8 * YD, 230, 0.01), V(16 * YD, 0, 0)],
      top: () => [V(15 * YD - 6, narrow ? 300 : 210, 0), V(15 * YD, 0, 0)],
    }
    { const [p, t] = SHOTS.endzone(); camera.position.copy(p); controls.target.copy(t) }

    const group = new THREE.Group(); scene.add(group)
    const col = new THREE.Color(hue)
    // the line of scrimmage
    { const los = new THREE.Mesh(new THREE.PlaneGeometry(1.2, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text), transparent: true, opacity: 0.9 })); los.rotation.x = -Math.PI / 2; los.position.set(0, 0.2, 0); group.add(los) }
    // ZONES: a column per lit zone, height = its heat, the number on top
    SIDES.forEach((s, i) => {
      for (const [d, [y0, y1]] of Object.entries(BAND_YD)) {
        const c = cells[`${s}|${d}`]
        if (!c || c.heat == null) continue
        const ht = 4 + 30 * c.heat
        const box = new THREE.Mesh(new THREE.BoxGeometry((y1 - y0) * YD * 0.7, ht, (FIELD_W / 3) * 0.5),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25 + 0.4 * c.heat, depthWrite: false }))
        box.position.set(((y0 + y1) / 2) * YD, ht / 2, across((i + 0.5) / 3))
        group.add(box)
        if (c.big != null) {
          const lab = labelSprite(String(c.big), C.text); lab.position.set(((y0 + y1) / 2) * YD, ht + 5, across((i + 0.5) / 3)); lab.scale.multiplyScalar(0.9); lab.userData.declutter = true
          group.add(lab)
        }
      }
    })
    // THE MEN: a face on a ringed disc at his spot (the flat chart's own), his name under him
    const sprites = []
    for (const m of fieldSpots({ men, defMen, pass: true })) {
      const [club] = nflTones(m.team)
      const ring = m.kind === 'def' ? C.text2 : club
      const mat = new THREE.SpriteMaterial({ map: faceTexture(m, ring, isAlive), transparent: true, depthWrite: false })
      const sp = new THREE.Sprite(mat)
      sp.scale.set(13, 13, 1)
      sp.position.copy(worldOf(m.x, m.y, 9))
      sp.userData.man = m
      group.add(sp); sprites.push(sp)
      const nm = labelSprite(`${String(m.last || '').toUpperCase()} ${m.word || m.role || ''}`.trim(), m.kind === 'def' ? C.text2 : C.text)
      nm.position.copy(worldOf(m.x, m.y, 1.6)); nm.scale.multiplyScalar(0.7); nm.userData.declutter = true
      group.add(nm)
    }

    let anim = null
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
    apiRef.current.preset = (key) => { const s = SHOTS[key]; if (!s) return; const [p1, t1] = s(); anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, s: performance.now() } }
    controls.update()
    const hx = FIELD_L / 2, hz = FIELD_W / 2
    const outside = (p) => Math.hypot(Math.max(0, Math.abs(p.x - mid) - hx), Math.max(0, Math.abs(p.z) - hz))
    const keepOut = () => {
      const yMin = 14 + outside(camera.position) * 0.62
      if (camera.position.y > 340) camera.position.y = 340
      if (camera.position.y < yMin) camera.position.y = yMin
    }

    // tap a face -> his card
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const rc = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(sprites, false)[0]?.object
      if (hit?.userData.man?.row) playerRef.current?.(hit.userData.man.row)
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
      controls.update(); keepOut()
      declutterLabels(scene, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight)
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
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      const w = mount.clientWidth || W, h2 = boxH(w)
      camera.aspect = w / h2; camera.updateProjectionMatrix(); renderer.setSize(w, h2); look.setSize(w, h2)
    }) : null
    if (ro) ro.observe(mount)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      if (io) io.disconnect(); if (ro) ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose() })
      })
      look.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [sig, full]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the 3D field isn&apos;t available here — the flat field shows the same zones and players.</ChartEmpty>

  const PRESETS = [
    { key: 'sideline', label: 'SIDELINE', title: 'From the sideline seats' },
    { key: 'endzone', label: 'END ZONE', title: 'Behind the offence, looking downfield' },
    { key: 'all22', label: 'ALL-22', title: 'High behind the offence, every lane in frame' },
    { key: 'top', label: 'TOP', title: 'Straight down: the same picture as the flat field' },
  ]
  return (
    <StadiumShell theme={C} accent={C.green} presets={PRESETS} active={preset}
      onPreset={(k) => { setPreset(k); apiRef.current.preset?.(k) }} onFullChange={setFull}
      caption={<div style={{ marginTop: 6, fontSize: 11, color: C.text3, lineHeight: 1.5, fontFamily: NUM_FONT }}>Columns = zones, taller = more. Faces stand where the flat field puts them; corners by chart slot, nobody says who covers whom. Dashed ring = by role. Tap a face for his card.{title ? ` ${title}` : ''}</div>}>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mountRef} style={{ width: '100%', ...(full ? { height: '100%' } : { minHeight: 340, aspectRatio: '1 / 0.75' }), borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      </div>
    </StadiumShell>
  )
}
