'use client'
// BUCKETS IN 3D (B7, 2026-10-02): the shot chart's game on a hardwood court
// under a roof -- the shared arena (lib/arena.js buildArenaRect, as LAMP's
// rink), lib/courtWorld.js's floor, every shot a disc where it was taken
// (made filled, missed a ring). Tap a disc and the shot is drawn to the rim.
// No release point or arc height is published, so the arc is geometry and the
// view says so (MOONSHOT's rule for its own ball flights).
// ON THE STADIUM KIT (2026-10-03): the same frame as LAMP's rink and TUDDY's
// field -- StadiumShell (camera presets + full screen), StadiumDock (the
// shown shots in numbers), LowerThird, FilmOverlay, HoverReadout, ChartLegend
// -- and BUCKETS' own theme (it drew in MOONSHOT's tokens before).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { COURT } from '../../lib/theme'
import { buildCourt, courtPoint, shotArc, COURT_W, HALF_L } from '../../lib/courtWorld'
import { buildArenaRect } from '../../lib/arena'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { densityGrid } from '../../lib/charts/terrain'
import { buildHills, rgb01 } from '../../lib/three/hills'
import { leaguePct } from '../../lib/nba/leagueZones'
import { zoneOf } from './ShotChart'
import StadiumShell from '../charts/StadiumShell'
import StadiumDock from '../charts/stadium/StadiumDock'
import LowerThird from '../charts/stadium/LowerThird'
import FilmOverlay from '../charts/stadium/FilmOverlay'
import HoverReadout, { placeTip, escapeHtml } from '../charts/stadium/HoverReadout'
import { ChartLegend, ChartEmpty } from '../charts'

const ACCENT = C.purple
const VIEWS = [
  { k: 'baseline', label: 'BASELINE', title: 'Behind the basket, looking up the floor', pos: [0, 34, -HALF_L / 2 - 30], target: [0, 4, 6] },
  { k: 'sideline', label: 'SIDELINE', title: 'From the courtside seats', pos: [COURT_W / 2 + 46, 30, 0], target: [0, 2, -4] },
  { k: 'top', label: 'TOP', title: 'Straight down: the same picture as the chart above', pos: [0, 92, 0.01], target: [0, 0, 0] },
]
const q = (p) => (p > 4 ? `OT${p - 4}` : `Q${p}`)
const shotWords = (s, names) => `${s.player_id && names[s.player_id] ? `${names[s.player_id]} · ` : ''}${s.made ? 'made' : 'missed'} ${s.three ? 'a three' : 'a two'}${s.shot_type ? ` · ${s.shot_type}` : ''}${s.distance != null ? ` · ${s.distance} ft` : ''}${s.period ? ` · ${q(s.period)} ${s.clock || ''}` : ''}`

export default function CourtArena({ shots = [], names = {}, title = 'Shot chart', subtitle = null }) {
  const mount = useRef(null)
  const api = useRef({})
  const tipRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [view, setView] = useState('baseline')
  // THE HILLS (10-19, the shared 3D look): the shot chart's contour ground lifted; Shots = the old discs
  const [layer, setLayer] = useState('hills')
  const layerRef = useRef(layer); layerRef.current = layer
  const [picked, setPicked] = useState(null)
  const [full, setFull] = useState(false)
  const [dockOpen, setDockOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => { if (window.innerWidth < 640) { setNarrow(true); setDockOpen(false) } }, [])
  const namesRef = useRef(names); namesRef.current = names
  const viewRef = useRef(view); viewRef.current = view

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, el.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.62)))
    const W = el.clientWidth || 640, H = boxH(W)
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

    // the shots: a disc each, on the floor -- INSTANCED (2026-10-03): one draw
    // call for the makes and one for the misses, so a club's season (7,000+
    // attempts, the Shot map's 3D) costs what one game's did
    const made = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT) })
    const miss = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text3), transparent: true, opacity: 0.85 })
    const pts = shots.map((s) => courtPoint(s.x, s.y, 0.06))
    const flat = new THREE.Object3D()
    const build = (list, geo, mat) => {
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
      inst.count = list.length
      list.forEach((i, n) => { flat.position.copy(pts[i]); flat.rotation.set(-Math.PI / 2, 0, 0); flat.updateMatrix(); inst.setMatrixAt(n, flat.matrix) })
      inst.instanceMatrix.needsUpdate = true
      scene.add(inst)
      return inst
    }
    const idx = shots.map((_, i) => i)
    const madeMesh = build(idx.filter((i) => shots[i].made), new THREE.CircleGeometry(0.55, 20), made)
    const missMesh = build(idx.filter((i) => !shots[i].made), new THREE.RingGeometry(0.38, 0.55, 20), miss)
    // the hills: density on a 0.5-ft grid over 40 ft, height by sqrt(share of the peak); a zone the shooter beats the
    // league in is BUCKETS' purple, the rest a pale neutral (lib/three/hills, lib/charts/terrain)
    const g = densityGrid(shots.map((s) => ({ x: s.x, y: s.y + 4.25 })).filter((p) => p.y >= 0 && p.y <= 40), { w: 50, h: 40, cell: 0.5, sigma: shots.length > 300 ? 2.2 : 2.8 })
    const zp = {}
    for (const s of shots) { const z = zoneOf(s); const a = (zp[z] ||= { m: 0, a: 0 }); a.a += 1; if (s.made) a.m += 1 }
    const up = Object.fromEntries(Object.entries(zp).map(([k, v]) => [k, leaguePct(k) != null && (100 * v.m) / v.a > leaguePct(k)]))
    const acc = rgb01(ACCENT), pale = [0.95, 0.93, 0.9]
    const hills = g.vmax ? buildHills(g, {
      toWorld: (gx, gy, h) => new THREE.Vector3(gx - 25, h, gy - HALF_L / 2),
      colorAt: (gx, gy) => { const fy = gy - 4.25; const three = Math.hypot(gx - 25, gy - 5.25) > 23.75 || (gy <= 14 && Math.abs(gx - 25) >= 22); return up[zoneOf({ x: gx, y: fy, three })] ? acc : pale },
      height: 9,
    }) : null
    if (hills) scene.add(hills)
    const showLayer = (l) => { madeMesh.visible = missMesh.visible = l === 'shots'; if (hills) hills.visible = l === 'hills' }
    showLayer(layerRef.current)
    // the drawn arc for a picked shot
    let arc = null
    const showArc = (s) => {
      if (arc) { scene.remove(arc); arc.geometry.dispose(); arc = null }
      if (!s) return
      arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shotArc(s.x, s.y, s.made)), new THREE.LineBasicMaterial({ color: new THREE.Color(s.made ? ACCENT : C.text2) }))
      scene.add(arc)
    }
    const go = (k) => { const v = VIEWS.find((x) => x.k === k) || VIEWS[0]; camera.position.set(...v.pos); controls.target.set(...v.target); controls.update() }
    go(viewRef.current)
    // the nearest disc to where the pointer meets the floor, within 2 ft (a forgiving tap)
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const shotAt = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = new THREE.Vector3()
      let best = -1, bd = 2
      if (ray.ray.intersectPlane(floor, hit)) pts.forEach((p, i) => { const d = p.distanceTo(hit); if (d < bd) { bd = d; best = i } })
      return { s: best >= 0 ? shots[best] : null, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }
    }
    const tip = (s, x, y, w) => placeTip(tipRef.current, s ? `<b style="color:${s.made ? ACCENT : C.text}">${escapeHtml(shotWords(s, namesRef.current))}</b>` : null, x, y, w)
    const coarse = isCoarse()
    const onMove = (e) => { if (coarse || down) return; const { s, x, y, w } = shotAt(e); tip(s, x, y, w); renderer.domElement.style.cursor = s ? 'pointer' : '' }
    const onLeave = () => placeTip(tipRef.current, null)
    let down = null
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return }
      down = null
      const { s, x, y, w } = shotAt(e)
      setPicked(s); showArc(s); if (coarse) tip(s, x, y, w)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    api.current = { go, showLayer }
    // the render loop runs only on screen and in a visible tab
    let raf = 0, onScreen = true
    const tick = () => { controls.update(); look.render(); raf = requestAnimationFrame(tick) }
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) raf = requestAnimationFrame(tick) })
    io.observe(el)
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && onScreen) raf = requestAnimationFrame(tick) }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(tick)
    if (typeof window !== 'undefined') window.__bucketsCourt = { scene, discs: shots.length }
    const onResize = () => { const w = el.clientWidth || W, h2 = boxH(w); camera.aspect = w / h2; camera.updateProjectionMatrix(); renderer.setSize(w, h2); look.setSize?.(w, h2) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      if (ro) ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove); renderer.domElement.removeEventListener('pointerleave', onLeave)
      for (const m of [madeMesh, missMesh]) { m.geometry.dispose(); m.dispose() }
      if (hills) { hills.geometry.dispose(); hills.material.dispose() }
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [shots, full]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the 3D court isn&apos;t available here — the shot chart above is the same shots.</ChartEmpty>

  const made = shots.filter((x) => x.made).length
  const threes = shots.filter((x) => x.three), threesIn = threes.filter((x) => x.made).length
  const dists = shots.map((x) => Number(x.distance)).filter(Number.isFinite)
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  const dockStats = [
    { k: 'FG', v: `${made}/${shots.length}`, sub: pct(made, shots.length) },
    { k: '3PT', v: `${threesIn}/${threes.length}`, sub: pct(threesIn, threes.length) },
    dists.length ? { k: 'AVG FT', v: (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1) } : null,   // the shot store carries no distance; a game's feed does
  ].filter(Boolean)
  const caption = (
    <div style={{ marginTop: 6 }}>
      {layer === 'hills' ? <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT }}>Higher hill = more shots · <b style={{ color: ACCENT }}>purple</b> = a zone he beats the league in</div> : <ChartLegend theme={C} items={[
        { key: 'made', mark: <b aria-hidden="true" style={{ color: ACCENT }}>●</b>, label: 'made' },
        { key: 'miss', mark: <b aria-hidden="true" style={{ color: C.text3 }}>○</b>, label: 'missed' },
      ]} />}
      <div style={{ fontSize: 11, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {picked ? <b style={{ color: picked.made ? ACCENT : C.text }}>{shotWords(picked, names)}. </b> : null}
        Where each shot was taken is the feed&apos;s own spot. The arc to the rim is drawn, not measured: no release point or arc height is published. The same {shots.length} shot{shots.length === 1 ? '' : 's'} · drag to turn · tap a shot to draw it
      </div>
    </div>
  )
  return (
    <StadiumShell theme={C} accent={ACCENT} presets={VIEWS.map((v) => ({ key: v.k, label: v.label, title: v.title }))} active={view}
      onPreset={(k) => { setView(k); api.current.go?.(k) }} onFullChange={setFull} caption={caption}>
      <div role="group" aria-label="What the 3D shows" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {[['hills', 'Hills'], ['shots', 'Shots']].map(([k, label]) => (
          <button key={k} type="button" className="tap-box" aria-pressed={layer === k} onClick={() => { setLayer(k); api.current.showLayer?.(k) }}
            style={{ minHeight: 0, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', font: `800 12px/1 ${NUM_FONT}`, background: 'transparent', border: `1px solid ${layer === k ? ACCENT : C.border2}`, color: layer === k ? ACCENT : C.text2 }}>{label}</button>
        ))}
      </div>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mount} style={{ width: '100%', ...(full ? { height: '100%' } : { minHeight: 340 }), borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        <StadiumDock open={dockOpen} onToggle={() => setDockOpen((v) => !v)} now={shots.length} all={shots.length} chips={[]}
          emptyText="The chart's filters above set what is drawn." stats={narrow ? null : dockStats} theme={C} numFont={NUM_FONT}
          accent={ACCENT} accentSoft={`${ACCENT}1a`} maxWidth="72%" />
        {!narrow && <LowerThird title={title} subtitle={subtitle || `${shots.length} field-goal attempt${shots.length === 1 ? '' : 's'}`} theme={C} numFont={NUM_FONT} accent={ACCENT} fallback="BUCKETS" />}
        <FilmOverlay />
        <HoverReadout ref={tipRef} theme={C} numFont={NUM_FONT} maxWidth={240} />
      </div>
    </StadiumShell>
  )
}
