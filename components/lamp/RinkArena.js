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
import LowerThird from '../charts/stadium/LowerThird'
import FilmOverlay from '../charts/stadium/FilmOverlay'
import StadiumDock from '../charts/stadium/StadiumDock'
import HoverReadout, { placeTip } from '../charts/stadium/HoverReadout'
import { createHoverFlight } from '../charts/stadium/hoverFlight'
import { labelSprite } from '../../lib/three/sprites'
import { ChartLegend, ChartEmpty } from '../charts'
import { vsCells, vsAlpha, VS_MIN, heatAlpha, shotInk } from './Rink'
import { measuredMph } from '../../lib/nhl/shotPath'
import { GOALIE_ZONES, ZONE_SHAPES, tintAlpha } from '../../lib/nhl/zones'

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

const RES_WORD = { goal: 'GOAL', sog: 'ON NET · SAVED', miss: 'MISSED THE NET', block: 'BLOCKED' }
const clock = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
/** The readout for one shot: type · distance · period/time · strength · result, and its speed only if measured. */
function shotTip(sh, speed, hardest) {
  const dist = Math.round(Math.hypot(GOAL_X - sh[0], sh[1]))
  const per = sh[6] && sh[6] !== 'REG' ? 'OT' : sh[5] != null ? `P${sh[5]}` : ''
  const mph = measuredMph(hardest, sh)
  const head = `<b style="color:${sh[2] === 'goal' ? C.lamp : C.text}">${RES_WORD[sh[2]] || ''}</b>`
  const line = [sh[3], `${dist} ft`, [per, clock(sh[7])].filter(Boolean).join(' '), sh[4] ? String(sh[4]).toUpperCase() : null].filter(Boolean).join(' · ')
  const sp = mph != null ? `<span style="color:${C.ice}">${mph} MPH, measured (NHL EDGE)</span>`
    : speed ? `HIS AVG SHOT ${speed.avg} MPH (league ${speed.leagueAvg}) — not this shot's speed`
      : 'No shot speed on file — fixed pace'
  return `${head}<br/>${line}${sh[9] ? `<br/><span style="color:${C.text3}">${String(sh[9]).replace(/-/g, ' ')}</span>` : ''}<br/><span style="color:${C.text3}">${sp}</span>`
}

export default function RinkArena({ shots = [], map = null, league = null, slot = null, gridSpec = null, view = 'dots', onPick = null, onPickCell = null, title = '', subtitle = '',
  speed = null, hardest = null, stats = null, dockChips = [], onClearAll = null, totalShots = null, slotPct = null, goalieRead = null, onPickZone = null }) {
  const tipRef = useRef(null)
  // on a phone the dock starts shut and carries no stats line: the same numbers
  // sit in the line above the rink, and an open dock would cover the ice
  const [narrowBox, setNarrowBox] = useState(false)
  const [dockOpen, setDockOpen] = useState(true)
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 640) { setNarrowBox(true); setDockOpen(false) } }, [])
  const playRef = useRef({ speed, hardest }); playRef.current = { speed, hardest }
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [motion, setMotion] = useState('replay')
  const [orbit, setOrbit] = useState(false)
  const [full, setFull] = useState(false)
  const [preset, setPreset] = useState('blue')
  const motionRef = useRef(motion); motionRef.current = motion
  const orbitRef = useRef(orbit); orbitRef.current = orbit
  const apiRef = useRef({})
  const pickRef = useRef({ onPick, onPickCell, onPickZone }); pickRef.current = { onPick, onPickCell, onPickZone }

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
    const rinkB = buildRink(scene)

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
    // THE MARKS (BATCH-3D-V2 1a): real pucks are black. On net a charcoal disc
    // with a thin light rim; a goal lamp red, 1.5x, glowing; a miss a small
    // dark x; a block a short dark stub. Each keeps a minimum on-screen size.
    const puckGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.35, 20)
    const goalGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.4, 24)
    const rimGeo = new THREE.RingGeometry(1.0, 1.22, 24)
    const hardGeo = new THREE.RingGeometry(1.75, 1.95, 32)
    const barGeo = new THREE.BoxGeometry(1.7, 0.18, 0.32)
    const mat = {
      // emissive under the bloom's wash-out point, so a goal reads RED with a glow, not salmon
      goal: new THREE.MeshStandardMaterial({ color: new THREE.Color(C.lamp), emissive: new THREE.Color(RINK.red), emissiveIntensity: 0.9 }),
      sog: new THREE.MeshStandardMaterial({ color: new THREE.Color(RINK.puck), roughness: 0.55 }),
      rim: new THREE.MeshBasicMaterial({ color: new THREE.Color(RINK.puckRim), side: THREE.DoubleSide }),
      hard: new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ice), side: THREE.DoubleSide }),
      ink: new THREE.MeshBasicMaterial({ color: new THREE.Color(RINK.missInk) }),
    }
    const lineMat = {
      goal: new THREE.LineBasicMaterial({ color: new THREE.Color(C.lamp), transparent: true, opacity: 0.85 }),
      sog: new THREE.LineBasicMaterial({ color: new THREE.Color(RINK.puck), transparent: true, opacity: 0.45 }),
      dim: new THREE.LineDashedMaterial({ color: new THREE.Color(RINK.missInk), transparent: true, opacity: 0.45, dashSize: 1.2, gapSize: 1 }),
    }
    const marks = []   // scaled each frame so a far puck never vanishes
    const inks = {}
    const inkMat = (res) => (inks[res] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(shotInk(res)), roughness: 0.5 }))
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
          new THREE.MeshBasicMaterial({ color: new THREE.Color(rampAt(t)), transparent: true, opacity: heatAlpha(t), depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        const cx = gridSpec.x0 + (c + 0.5) * cw, cy = gridSpec.y1 - (r + 0.5) * ch
        m.position.copy(rinkPoint(cx, cy, 0.06))
        m.userData.cell = { ...cell, r, c }
        group.add(m); pickables.push(m)
        // the count on the ice, the way the ballpark prints its wall numbers (1d)
        const lab = labelSprite(String(cell.att), RINK.puck)
        lab.position.copy(rinkPoint(cx, cy, 2.2)); lab.scale.multiplyScalar(0.62)
        group.add(lab)
      }))
    } else {
      shots.forEach((sh, i) => {
        const res = sh[2]
        const kind = res === 'goal' ? 'goal' : res === 'sog' ? 'sog' : 'dim'
        const mark = new THREE.Group()
        mark.position.copy(rinkPoint(sh[0], sh[1], 0))
        // one solid puck per shot, in its result's colour (Rink.js shotInk), a goal a size up and glowing
        if (res === 'goal') { const g = new THREE.Mesh(goalGeo, mat.goal); g.position.y = 0.22; mark.add(g) }
        else {
          const d = new THREE.Mesh(puckGeo, inkMat(res)); d.position.y = 0.2; mark.add(d)
          const rim = new THREE.Mesh(rimGeo, mat.rim); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.39; mark.add(rim)
        }
        if (measuredMph(hardest, sh) != null) { const h = new THREE.Mesh(hardGeo, mat.hard); h.rotation.x = -Math.PI / 2; h.position.y = 0.45; mark.add(h) }
        const mesh = mark
        mesh.userData.shot = sh
        group.add(mesh); pickables.push(mesh); marks.push(mesh)
      })
    }
    // VS GOALIE (1h): his zones on the ice UNDER the shooter's pucks, the 2D's
    // shapes and tints (lib/nhl/zones.js), each tappable for its saves / goals
    if (goalieRead) {
      for (const z of GOALIE_ZONES) {
        const r = goalieRead[z.key]
        if (!r || (!r.thin && !r.tint)) continue
        const sh = ZONE_SHAPES[z.key]
        const shape = new THREE.Shape(sh.outer.map(([x, y]) => new THREE.Vector2(x, y)))
        for (const h of sh.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
          color: new THREE.Color(r.thin ? RINK.iceLine : r.tint === 'worse' ? C.lamp : RINK.blue),
          transparent: true, opacity: r.thin ? 0.12 : tintAlpha(r.d), depthWrite: false, side: THREE.DoubleSide }))
        // ShapeGeometry is in the x/y plane: lay it on the ice (shot map +y -> world -z)
        m.rotation.x = -Math.PI / 2; m.position.y = 0.055
        m.userData.zone = z.key
        group.add(m); pickables.push(m)
      }
    }
    // the slot, shaded as in 2D
    if (slot && !goalieRead) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(slot.x1 - slot.x0, slot.y * 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ice), transparent: true, opacity: 0.08, depthWrite: false }))
      sm.rotation.x = -Math.PI / 2; sm.position.copy(rinkPoint((slot.x0 + slot.x1) / 2, 0, 0.05)); group.add(sm)
      // the slot prints its own share (1d), as on the 2D rink
      if (slotPct != null) { const t = labelSprite(`SLOT ${slotPct}%`, RINK.blue); t.position.copy(rinkPoint(slot.x0 + 5, slot.y - 3, 1.6)); t.scale.multiplyScalar(0.3); t.material.opacity = 0.8; group.add(t) }
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

    // ── THE SHOT PLAYS (BATCH-3D-V2 1g): hover (or tap) a puck and it moves
    //    along its path (lib/nhl/shotPath.js) into the net, to the crease, wide,
    //    off the post, short -- at the pace his EDGE average gives, or its real
    //    speed when it is one of his ten measured hardest. A goal twitches the
    //    net and flashes the goal light. The shared player (charts/stadium).
    const flight = createHoverFlight(scene)
    const net = rinkB.nets?.[1], goalLight = rinkB.lights?.[1]
    let flash = 0, twitch = 0
    // NO MOVEMENT (Donovan 10-02: "leave puck movement off"): a shot stays where it was taken
    const playShot = () => {}
    // the mark under a point: a ray first, then the nearest within 4.5 ft on the ice
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const markAt = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(pickables, true)[0]?.object
      let pick = hit
      while (pick && !pick.userData.shot && !pick.userData.cell && !pick.userData.zone && pick.parent) pick = pick.parent
      if (!pick?.userData.shot && !pick?.userData.cell && !pick?.userData.zone) {
        pick = null
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3()
        if (ray.ray.intersectPlane(ground, pt)) {
          let bd = 4.5
          for (const m of pickables) { if (m.userData.zone) continue; const d = Math.hypot(m.position.x - pt.x, m.position.z - pt.z); if (d < bd) { bd = d; pick = m } }
        }
      }
      return { pick, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }
    }
    const showTip = (pick, x, y, w) => {
      const tip = tipRef.current
      if (!pick) { placeTip(tip, null); return }
      const { speed: sp, hardest: hd } = playRef.current
      const c = pick.userData.cell
      placeTip(tip, pick.userData.shot ? shotTip(pick.userData.shot, sp, hd)
        : c ? `<b style="color:${C.text}">${c.att} attempts</b><br/>${c.sog} on net · <span style="color:${C.lamp}">${c.g} goal${c.g === 1 ? '' : 's'}</span>${c.sog ? `<br/><span style="color:${C.text3}">SH% ${((100 * c.g) / c.sog).toFixed(1)}</span>` : ''}` : null, x, y, w)
    }
    const coarse = isCoarse()
    const onMove = (e) => {
      if (coarse || driving) return
      const { pick, x, y, w } = markAt(e)
      showTip(pick, x, y, w)
      renderer.domElement.style.cursor = pick ? 'pointer' : ''
      if (pick?.userData.shot) playShot(pick.userData.shot)
    }
    const onLeave = () => { placeTip(tipRef.current, null); flight.clear() }
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    // TAP A PUCK / A TILE -> it plays (on a phone, tap = hover) and the same
    // detail card the 2D opens fills
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const { pick, x, y, w } = markAt(e)
      showTip(pick, x, y, w)
      if (pick?.userData.shot) { playShot(pick.userData.shot); pickRef.current.onPick?.(pick.userData.shot) }
      else if (pick?.userData.cell) pickRef.current.onPickCell?.(pick.userData.cell)
      else if (pick?.userData.zone) pickRef.current.onPickZone?.(pick.userData.zone)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

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
      flight.step(t)
      // a goal: the net twitches, the goal light flashes lamp red (1g)
      if (net) { const k = twitch ? (t - twitch) / 420 : 1; net.scale.x = k < 1 ? 1 + 0.08 * Math.sin(k * Math.PI * 4) * (1 - k) : 1; if (k >= 1) twitch = 0 }
      if (goalLight) { const k = flash ? (t - flash) / 1600 : 1; goalLight.material.emissiveIntensity = k < 1 ? 0.08 + 3.2 * (0.6 + 0.4 * Math.sin(k * Math.PI * 6)) * (1 - k) : 0.08; if (k >= 1) flash = 0 }
      // a far puck keeps a minimum on-screen size (1a): scale with the camera distance
      // per mark, by ITS distance: a near puck stays true size, a far one grows
      for (const mk of marks) mk.scale.setScalar(Math.max(1, camera.position.distanceTo(mk.position) / 85))
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
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      flight.clear()
      if (typeof window !== 'undefined' && window.__dash3d === apiRef.current) delete window.__dash3d
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
      })
      look.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [shots, map, slot, gridSpec, view, full, league, slotPct, hardest, goalieRead])

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the arena isn&apos;t available here — the rink above shows the same shots.</ChartEmpty>

  const chipBtn = (on, col) => ({
    minHeight: 44, padding: '0 14px', fontSize: 12, fontWeight: 800, borderRadius: 999, cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${on ? col : C.border2}`, background: on ? `${col}22` : 'transparent', color: on ? col : C.text2,
  })
  const chips = (
    <>
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
          { key: 'sog', mark: <b aria-hidden="true" style={{ color: RINK.puck, WebkitTextStroke: `0.6px ${RINK.puckRim}` }}>●</b>, label: 'on net (saved)' },
          { key: 'miss', mark: <b aria-hidden="true">✕</b>, label: 'missed' },
          { key: 'block', mark: <b aria-hidden="true">╱</b>, label: 'blocked' }]} />
      <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {view === 'dots' ? 'Lines run from the shot to the net along the ice — not tracked puck paths. ' : ''}{view === 'dots' ? <>The same {shots.length} shot{shots.length === 1 ? '' : 's'} as the rink above</> : 'The same zones as the rink above'} · drag to orbit · hover or tap a puck and it plays (pace from his average shot speed, NHL EDGE; real speed only for his measured ten hardest)
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
        {/* the spray chart's name plate + film (components/charts/stadium, BATCH-3D-V2 step 0) */}
        {/* the spray chart's dock, with the numbers on screen (BATCH-3D-V2 1c) */}
        <StadiumDock open={dockOpen} onToggle={() => setDockOpen((v) => !v)} now={shots.length || (map?.attempts ?? 0)} all={totalShots ?? shots.length}
          chips={dockChips} onClearAll={onClearAll || (() => {})} stats={narrowBox ? null : stats} theme={C} numFont={NUM_FONT} accent={C.ice} accentSoft={`${C.ice}1a`}
          emptyText="No filters on — every drawn attempt is on the ice." maxWidth="72%" />
        <LowerThird title={title} subtitle={subtitle} theme={C} numFont={NUM_FONT} accent={C.ice} fallback="LAMP" />
        <FilmOverlay />
        <HoverReadout ref={tipRef} theme={C} numFont={NUM_FONT} maxWidth={200} />
      </div>
    </StadiumShell>
  )
}
