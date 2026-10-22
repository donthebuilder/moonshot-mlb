'use client'
// BUCKETS IN 3D. The shot chart's half court on a hardwood floor under a roof -- the shared arena (lib/arena.js
// buildArenaRect, as LAMP's rink) and lib/courtWorld.js's floor, in the StadiumShell frame (camera presets + full screen).
//
// THE LIT FLOOR (2026-10-20, Donovan: zones lit by shot percentages and where the defense is weak, not hills; "half
// court view and a top view"). The twelve zones of the 2D chart are painted onto the floor from the very same shapes
// (lib/nba/zoneCourt.js ZONE_PATHS through Path2D) and the very same numbers (ShotChart zoneRead / fillFor), so the 3D
// and the 2D can never disagree. The light (Shooting / {CLUB} D / Attack) and every filter come from the 2D chart above:
// this view draws whatever set the chart shows. SHOTS is the old layer: a disc per attempt, tap one and its arc is drawn
// to the rim (geometry, not measured: no release point or arc height is published -- MOONSHOT's rule for ball flights).
// Two cameras: HALF COURT (opens here: from the centre line, a little above the floor) and TOP (straight down).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { COURT } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { buildCourt, courtPoint, shotArc, rimPoint, COURT_W, HALF_L } from '../../lib/courtWorld'
import { buildArenaRect } from '../../lib/arena'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { floorZone } from '../../lib/nba/zones'
import { ZONE_PATHS, ZONE_LABEL, ZONE_COURT_H } from '../../lib/nba/zoneCourt'
import StadiumShell from '../charts/StadiumShell'
import StadiumDock from '../charts/stadium/StadiumDock'
import LowerThird from '../charts/stadium/LowerThird'
import FilmOverlay from '../charts/stadium/FilmOverlay'
import HoverReadout, { placeTip, escapeHtml } from '../charts/stadium/HoverReadout'
import { ChartLegend, ChartEmpty } from '../charts'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'

const ACCENT = C.purple
const Z0 = -HALF_L / 2                                  // the baseline in the world
const ZC = Z0 + ZONE_COURT_H / 2                        // the middle of the 40 ft the zones cover
const VIEWS = [
  { k: 'half', label: 'HALF COURT', title: 'From the centre line, looking at the basket', pos: [0, 21, HALF_L / 2 + 4], target: [0, 1, Z0 + 12],
    track: { pos: [0, 36, HALF_L / 2 + 12], target: [0, 0, Z0 + 15] } },   // the tracking look's broadcast-high angle: the whole half court in frame
  { k: 'top', label: 'TOP', title: 'Straight down: the same picture as the chart', pos: [0, 74, ZC + 0.01], target: [0, 0, ZC] },
]
const q = (p) => (p > 4 ? `OT${p - 4}` : `Q${p}`)
const shotWords = (s, names) => `${s.player_id && names[s.player_id] ? `${names[s.player_id]} · ` : ''}${s.made ? 'made' : 'missed'} ${s.three ? 'a three' : 'a two'}${s.shot_type ? ` · ${s.shot_type}` : ''}${s.distance != null ? ` · ${s.distance} ft` : ''}${s.period ? ` · ${q(s.period)} ${s.clock || ''}` : ''}`

// THE PLAYBACK (2026-10-22, tracking look; Donovan: "continue" -- the motion that makes a tracking graphic feel alive).
// His most recent game in the set the chart shows, shot by shot in game order: a ring where he rises (the feed's own spot),
// the ball along the drawn arc, a pulse at the rim on a make, the mark left on the floor. Nothing is invented: the spot,
// the result and the order are the feed's; the arc is geometry (as the tap-a-shot arc always said).
const clockSec = (c) => { if (c == null || c === '') return null; const m = String(c).match(/^(\d+):(\d+(?:\.\d+)?)$/); return m ? Number(m[1]) * 60 + Number(m[2]) : (Number.isFinite(Number(c)) ? Number(c) : null) }
/** The newest game in `shots`, in the order it was played: period up, clock down (the feed's order when no clock). */
export function lastGameReel(shots = []) {
  const key = (s) => `${s.game_date || ''}|${String(s.game_n ?? '').padStart(5, '0')}|${s.game_id || ''}`
  let top = null
  for (const s of shots) if (s.game_id || s.game_date) { const k = key(s); if (top == null || k > top) top = k }
  if (top == null) return []
  return shots.map((s, i) => ({ s, i })).filter(({ s }) => key(s) === top)
    .sort((a, b) => (a.s.period || 0) - (b.s.period || 0) || ((clockSec(b.s.clock) ?? 0) - (clockSec(a.s.clock) ?? 0)) || a.i - b.i)
    .map(({ s }) => s)
}
const RISE_MS = 260, FLY_MS = 620, HOLD_MS = 220   // a shot: the ring, the flight, the beat after
const STEP_MS = RISE_MS + FLY_MS + HOLD_MS

const PX = 24   // texture pixels a foot
/** Paint the lit zones (and their numbers) onto a canvas the floor plane wears. zones: ShotChart zoneRead rows + fill / label. */
function paintZones(cv, zones, { picked = null, halo = C.wood1, glow = false } = {}) {
  const g = cv.getContext('2d')
  g.clearRect(0, 0, cv.width, cv.height)
  g.save(); g.scale(PX, PX)
  for (const z of zones) {
    const p = new Path2D(ZONE_PATHS[z.k])
    // tracking look: a lit zone throws a little light on the floor around it (drawn once per repaint, free per frame)
    if (z.fill && glow) {
      // tracking look: the zone is light on the floor -- a soft fill, a bright edge, a little spill around it
      g.save(); g.shadowColor = z.fill; g.shadowBlur = 1.4 * PX; g.globalAlpha = 0.62; g.fillStyle = z.fill; g.fill(p, 'evenodd')
      g.globalAlpha = 1; g.lineWidth = 0.22; g.strokeStyle = z.fill; g.stroke(p); g.restore()
    } else if (z.fill) { g.fillStyle = z.fill; g.fill(p, 'evenodd') }
    g.lineWidth = 0.08; g.strokeStyle = alpha(COURT.line, 0.28); g.stroke(p)
    if (z.outline) { g.lineWidth = 0.3; g.strokeStyle = C.cream; g.stroke(p) }
    if (picked === z.k) { g.lineWidth = 0.34; g.setLineDash([0.8, 0.5]); g.strokeStyle = C.text; g.stroke(p); g.setLineDash([]) }
  }
  g.restore()
  for (const z of zones) {
    if (!z.big) continue
    const [lx, ly, side] = ZONE_LABEL[z.k]
    const fs = (side ? 1.45 : z.k === 'ra' ? 1.5 : 2.1) * PX
    g.save(); g.translate(lx * PX, ly * PX); if (side) g.rotate(-Math.PI / 2)
    g.globalAlpha = z.quiet ? 0.55 : 1
    g.font = `900 ${fs}px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    if (halo) { g.lineWidth = fs * 0.2; g.strokeStyle = halo; g.strokeText(z.big, 0, 0) }
    g.fillStyle = z.hot ? C.cream : C.text; g.fillText(z.big, 0, 0)
    if (z.small) { g.font = `800 ${fs * 0.52}px ${NUM_FONT}`; g.lineWidth = fs * 0.14; if (halo) g.strokeText(z.small, 0, fs * 0.78); g.fillStyle = z.hot ? C.cream : C.text2; g.fillText(z.small, 0, fs * 0.78) }
    g.restore()
  }
}

/**
 * shots: the set the 2D chart shows; zones: that chart's zone rows, each with fill / outline / big / small / hot / quiet
 * (what it painted); picked / onPick: the tapped zone, shared with the chart.
 */
export default function CourtArena({ shots = [], zones = [], names = {}, title = 'Shot chart', subtitle = null, picked = null, onPick = null, legend = null }) {
  const mount = useRef(null)
  const api = useRef({})
  const tipRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [view, setView] = useState('half')
  const [layer, setLayer] = useState('zones')
  const layerRef = useRef(layer); layerRef.current = layer
  const [shot, setShot] = useState(null)
  const [reel, setReel] = useState(null)   // the playback's readout: { date, n, of, made, att, period, clock, last } or null
  const [full, setFull] = useState(false)
  const [dockOpen, setDockOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const [tracking, setTracking] = useState(false)   // ?look=tracking (lib/three/look.js), read after mount so SSR and the first paint agree
  useEffect(() => { if (window.innerWidth < 640) { setNarrow(true); setDockOpen(false) } setTracking(lookParam() === 'tracking') }, [])
  const namesRef = useRef(names); namesRef.current = names
  const viewRef = useRef(view); viewRef.current = view
  const pickRef = useRef(onPick); pickRef.current = onPick

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, el.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.62)))
    const W = el.clientWidth || 640, H = boxH(W)
    setReel(null)
    const scene = new THREE.Scene()
    // THE TRACKING LOOK (?look=tracking): no building, no wood, no AO -- a dark floor, thin lines, the lit zones
    scene.background = new THREE.Color(tracking ? C.bg : COURT.apron)
    // the floor: the chassis' top surface with a breath of the product's accent, lifted so it reads off the void
    const trackFloor = new THREE.Color(C.bg3).lerp(new THREE.Color(ACCENT), 0.05).multiplyScalar(1.45)
    buildCourt(scene, { tracking: tracking ? { floor: trackFloor, apron: C.bg2, line: C.text, paint: ACCENT } : null })
    if (!tracking) {
      const bowl = new THREE.Group(); scene.add(bowl)
      buildArenaRect(bowl, { w: COURT_W + 30, l: HALF_L * 2 + 30, cornerR: 10, roof: true, colors: { seat: COURT.seat } })
      bowl.position.z = HALF_L / 2   // the half court is one end of a full arena
    }
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.5, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 18; controls.maxDistance = 160
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !tracking && !isCoarse(), scale: 0.4 })

    // THE LIT FLOOR: one transparent plane over the 40 ft the zones cover, under the line paint (0.03), over the key (0.015)
    const cv = document.createElement('canvas'); cv.width = 50 * PX; cv.height = ZONE_COURT_H * PX
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(50, ZONE_COURT_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
    lit.rotation.x = -Math.PI / 2; lit.position.set(0, 0.022, ZC); scene.add(lit)

    // the shots: a disc each, INSTANCED (one draw call for the makes, one for the misses)
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
    const showLayer = (l) => { madeMesh.visible = missMesh.visible = l === 'shots'; lit.material.opacity = l === 'shots' ? 0.35 : 1 }
    showLayer(layerRef.current)
    let arc = null
    const showArc = (s) => {
      if (arc) { scene.remove(arc); arc.geometry.dispose(); arc = null }
      if (!s) return
      arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shotArc(s.x, s.y, s.made)), new THREE.LineBasicMaterial({ color: new THREE.Color(s.made ? ACCENT : C.text2) }))
      scene.add(arc)
    }
    const go = (k) => {
      const v = VIEWS.find((x) => x.k === k) || VIEWS[0], t = tracking && v.track ? v.track : v
      camera.position.set(...t.pos); controls.target.set(...t.target)
      // a tall phone box: pull the tracking camera back along its own line so both corners stay in frame
      const pull = tracking && v.track ? Math.max(1, 1.45 / camera.aspect) : 1
      if (pull > 1) camera.position.sub(controls.target).multiplyScalar(pull).add(controls.target)
      controls.update()
    }
    go(viewRef.current)
    // where the pointer meets the floor: the zone under it, and the nearest disc within 2 ft
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hitAt = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = new THREE.Vector3()
      let best = -1, bd = 2, zone = null
      if (ray.ray.intersectPlane(floor, hit)) {
        zone = floorZone(hit.x + 25, hit.z - Z0)
        if (layerRef.current === 'shots') pts.forEach((p, i) => { const d = p.distanceTo(hit); if (d < bd) { bd = d; best = i } })
      }
      return { s: best >= 0 ? shots[best] : null, zone, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }
    }
    const tip = (s, x, y, w) => placeTip(tipRef.current, s ? `<b style="color:${s.made ? ACCENT : C.text}">${escapeHtml(shotWords(s, namesRef.current))}</b>` : null, x, y, w)
    const coarse = isCoarse()
    const onMove = (e) => { if (coarse || down) return; const { s, zone, x, y, w } = hitAt(e); tip(s, x, y, w); renderer.domElement.style.cursor = s || zone ? 'pointer' : '' }
    const onLeave = () => placeTip(tipRef.current, null)
    let down = null
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return }
      down = null
      const { s, zone, x, y, w } = hitAt(e)
      if (layerRef.current === 'shots') { setShot(s); showArc(s); if (coarse) tip(s, x, y, w) }
      else pickRef.current?.(zone)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    // ── THE PLAYBACK (tracking look only)
    const playG = new THREE.Group(); scene.add(playG)
    const ringGeo = new THREE.RingGeometry(0.85, 1.15, 40), dotGeo = new THREE.CircleGeometry(0.5, 20), missGeo = new THREE.RingGeometry(0.34, 0.5, 20)
    const pulseGeo = new THREE.RingGeometry(0.8, 1.0, 40)
    const pm = {
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      made: new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT) }),
      miss: new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text3), transparent: true, opacity: 0.9 }),
      pulse: new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cream), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      ball: new THREE.MeshBasicMaterial({ color: new THREE.Color(C.rim) }),
    }
    const ring = new THREE.Mesh(ringGeo, pm.ring); ring.rotation.x = -Math.PI / 2; ring.visible = false; playG.add(ring)
    const pulse = new THREE.Mesh(pulseGeo, pm.pulse); pulse.rotation.x = -Math.PI / 2; pulse.position.copy(rimPoint()); pulse.visible = false; playG.add(pulse)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), pm.ball); ball.visible = false; playG.add(ball)
    let trail = null
    const left = []   // the marks each finished shot leaves
    let play = null   // { list, i, t0, made, att }
    const clearPlay = () => {
      play = null; ring.visible = ball.visible = pulse.visible = false
      if (trail) { playG.remove(trail); trail.geometry.dispose(); trail.material.dispose(); trail = null }
      for (const m of left) playG.remove(m)
      left.length = 0
    }
    const startPlay = () => {
      clearPlay()
      const list = lastGameReel(shots)
      if (!list.length) { setReel({ empty: true }); return }
      play = { list, i: -1, t0: performance.now(), made: 0, att: 0 }
      setReel({ date: list[0].game_date, n: 0, of: list.length, made: 0, att: 0 })
    }
    const stopPlay = () => { clearPlay(); setReel(null) }
    const stepPlay = (now) => {
      if (!play) return
      const k = Math.floor((now - play.t0) / STEP_MS), t = (now - play.t0) - k * STEP_MS
      if (k >= play.list.length) {   // the game is over: hold the marks, say so
        ring.visible = ball.visible = pulse.visible = false
        if (trail) trail.visible = false
        if (play.i !== Infinity) { play.i = Infinity; setReel((r) => (r ? { ...r, done: true } : r)) }
        return
      }
      const s = play.list[k], at = courtPoint(s.x, s.y, 0.08)
      if (k !== play.i) {   // a new shot: leave the last one's mark, draw this one's arc
        if (play.i >= 0 && play.list[play.i]) {
          const p = play.list[play.i], m = new THREE.Mesh(p.made ? dotGeo : missGeo, p.made ? pm.made : pm.miss)
          m.rotation.x = -Math.PI / 2; m.position.copy(courtPoint(p.x, p.y, 0.07)); playG.add(m); left.push(m)
        }
        play.i = k
        if (trail) { playG.remove(trail); trail.geometry.dispose(); trail.material.dispose() }
        trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(shotArc(s.x, s.y, s.made)),
          new THREE.LineBasicMaterial({ color: new THREE.Color(s.made ? ACCENT : C.text2), transparent: true, opacity: 0.9 }))
        trail.geometry.setDrawRange(0, 0); playG.add(trail)
        ring.position.copy(at)
        play.att += 1; if (s.made) play.made += 1
        setReel((r) => (r ? { ...r, n: k + 1, made: play.made, att: play.att, period: s.period, clock: s.clock, last: s } : r))
      }
      // the ring where he rises, then the flight, then a pulse at the rim on a make
      ring.visible = t < RISE_MS + FLY_MS
      pm.ring.opacity = t < RISE_MS ? t / RISE_MS : Math.max(0, 1 - (t - RISE_MS) / FLY_MS)
      ring.scale.setScalar(t < RISE_MS ? 0.6 + 0.4 * (t / RISE_MS) : 1)
      const f = Math.min(1, Math.max(0, (t - RISE_MS) / FLY_MS))
      const pts = trail.geometry.attributes.position
      const nPts = pts.count, idx = Math.min(nPts - 1, Math.round(f * (nPts - 1)))
      trail.geometry.setDrawRange(0, f > 0 ? idx + 1 : 0)
      ball.visible = f > 0 && f < 1
      if (ball.visible) ball.position.set(pts.getX(idx), pts.getY(idx), pts.getZ(idx))
      const after = t - RISE_MS - FLY_MS
      pulse.visible = s.made && after >= 0
      if (pulse.visible) { const u = Math.min(1, after / HOLD_MS); pulse.scale.setScalar(1 + u * 1.6); pm.pulse.opacity = 0.9 * (1 - u) }
    }
    api.current = { go, showLayer, cv, tex, startPlay, stopPlay }
    // the render loop runs only on screen and in a visible tab
    let raf = 0, onScreen = true
    const tick = () => { controls.update(); stepPlay(performance.now()); look.render(); raf = requestAnimationFrame(tick) }
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
      clearPlay(); for (const g of [ringGeo, dotGeo, missGeo, pulseGeo, ball.geometry]) g.dispose(); for (const m of Object.values(pm)) m.dispose()
      lit.geometry.dispose(); lit.material.dispose(); tex.dispose()
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [shots, full, tracking]) // eslint-disable-line react-hooks/exhaustive-deps

  // repaint the floor whenever the chart's light, filters or tapped zone change (no new scene)
  useEffect(() => {
    const { cv, tex } = api.current
    if (!cv || !tex) return
    paintZones(cv, zones, { picked, halo: tracking ? null : C.wood1, glow: tracking })   // tracking: clean numbers, no outline
    tex.needsUpdate = true
  }, [zones, picked, shots, full, tracking])

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the 3D court isn&apos;t available here — the zone court above is the same shots.</ChartEmpty>

  const madeN = shots.filter((x) => x.made).length
  const threes = shots.filter((x) => x.three), threesIn = threes.filter((x) => x.made).length
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  const dockStats = [
    { k: 'FG', v: `${madeN}/${shots.length}`, sub: pct(madeN, shots.length) },
    { k: '3PT', v: `${threesIn}/${threes.length}`, sub: pct(threesIn, threes.length) },
  ]
  const caption = (
    <div style={{ marginTop: 6 }}>
      {layer === 'zones' ? legend : <ChartLegend theme={C} items={[
        { key: 'made', mark: <b aria-hidden="true" style={{ color: ACCENT }}>●</b>, label: 'made' },
        { key: 'miss', mark: <b aria-hidden="true" style={{ color: C.text3 }}>○</b>, label: 'missed' },
      ]} />}
      <div style={{ fontSize: 11, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {shot && layer === 'shots' ? <b style={{ color: shot.made ? ACCENT : C.text }}>{shotWords(shot, names)}. </b> : null}
        {layer === 'zones' ? `The zones, lit the same as the chart, from the same ${shots.length} shot${shots.length === 1 ? '' : 's'}. Drag to turn · tap a zone.`
          : `Each disc is the feed's own spot. The arc to the rim is drawn, not measured. Drag to turn · tap a shot to draw it.`}
      </div>
    </div>
  )
  return (
    <StadiumShell theme={C} accent={ACCENT} presets={VIEWS.map((v) => ({ key: v.k, label: v.label, title: v.title }))} active={view}
      onPreset={(k) => { setView(k); api.current.go?.(k) }} onFullChange={setFull} caption={caption}>
      <div role="group" aria-label="What the 3D shows" style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[['zones', 'Zones'], ['shots', 'Shots']].map(([k, label]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={layer === k} onClick={() => { setLayer(k); api.current.showLayer?.(k) }}
            style={flatChip(layer === k, ACCENT, C, NUM_FONT)}>{label}</button>
        ))}
        {tracking && (
          <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={!!reel} onClick={() => (reel ? api.current.stopPlay?.() : api.current.startPlay?.())}
            title="His most recent game in this set, shot by shot, in the order he took them" style={flatChip(!!reel, ACCENT, C, NUM_FONT)}>
            {reel ? '■ Stop' : '▶ Play last game'}
          </button>
        )}
      </div>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mount} style={{ width: '100%', ...(full ? { height: '100%' } : { minHeight: 340 }), borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        <StadiumDock open={dockOpen} onToggle={() => setDockOpen((v) => !v)} now={shots.length} all={shots.length} chips={[]}
          emptyText="The chart's filters above set what is drawn." stats={narrow ? null : dockStats} theme={C} numFont={NUM_FONT}
          accent={ACCENT} accentSoft={`${ACCENT}1a`} maxWidth="72%" />
        {!narrow && <LowerThird title={title} subtitle={subtitle || `${shots.length} field-goal attempt${shots.length === 1 ? '' : 's'}`} theme={C} numFont={NUM_FONT} accent={ACCENT} fallback="BUCKETS" />}
        {!tracking && <FilmOverlay />}
        {reel && (
          <div aria-live="polite" style={{ position: 'absolute', top: 8, right: 8, zIndex: 3, pointerEvents: 'none', background: C.bg2, border: `1px solid ${C.border2}`,
            borderRadius: 8, padding: '6px 10px', fontFamily: NUM_FONT, color: C.text, textAlign: 'right', minWidth: 104 }}>
            {reel.empty ? <div style={{ fontSize: 12, color: C.text2 }}>No dated game in this set</div> : (<>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>{reel.made}<span style={{ color: C.text3 }}>/{reel.att}</span> <span style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>FG</span></div>
              <div style={{ fontSize: 11, color: reel.done ? ACCENT : C.text2, fontWeight: 700, marginTop: 2 }}>
                {reel.done ? 'FINAL' : reel.period ? `${q(reel.period)}${reel.clock ? ` ${reel.clock}` : ''}` : ''}{reel.last && !reel.done ? ` · ${reel.last.made ? 'MADE' : 'MISS'}${reel.last.three ? ' 3' : ''}` : ''}
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>{reel.date || ''}{reel.of ? ` · ${Math.min(reel.n, reel.of)}/${reel.of}` : ''}</div>
            </>)}
          </div>
        )}
        <HoverReadout ref={tipRef} theme={C} numFont={NUM_FONT} maxWidth={240} />
      </div>
    </StadiumShell>
  )
}
