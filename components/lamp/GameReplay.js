'use client'
// 🏒 THE GAME, REPLAYED (2026-10-22, PREPLAY on LAMP; the tracking look). Every located event of one game from the
// league's play-by-play (/api/lamp/gameplay, lib/nhl/events.js), played on the rink in order: the puck goes from each
// event's spot to the next, the player who did it shows as a disc with his number in his club's colour, shots draw a
// line to the net, a goal lights the net and moves the score. Real: every spot, time, player and result. Drawn: the
// puck's path BETWEEN two events (the league does not publish it) -- the caption says so.
//
// Behind ?look=tracking (lib/three/look.js) while Donovan judges it; without it this renders nothing.
// Cheap to draw: no building, no shadows, no AO; one small group of meshes moved each frame.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, RINK } from '../../lib/nhl/theme'
import { buildRink, rinkPoint, roundedRect, GOAL_X, RINK_L, RINK_W, RINK_R, BLUE_X } from '../../lib/rinkWorld'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { eventWords, powerPlayAt, penaltyStretches } from '../../lib/nhl/events'
import { nhlLogo } from '../../lib/nhl/teams'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'
import CallStatusBadge from '../CallStatusBadge'
import { ordinal } from '../../lib/format'

// the two clubs: the product's accent and the rink's own gold (two colours you can tell apart, Donovan 2026-10-22)
const INK = { away: C.ice, home: RINK.kick }
const GAME_S = 30          // game seconds per replay second at 1x: a 60-minute game in about two minutes
const SPEEDS = [[1, '1x'], [4, '4x']]
const SHOW_MS = 1400       // how long a player's disc stays after his event (real time)
const GOAL_HOLD_MS = 2600  // the replay holds this long on a goal (the clock stops on one)
const INTRO_MS = 5200      // THE OPEN: a video-game fly-in, then the data lights up, then the puck drops
const PERIOD_S = 1200
const gameSec = (e) => (e.period - 1) * PERIOD_S + e.t
// the box: the rink is 200 x 85 ft, so a wide screen gets a wide box (no empty band above and below); a phone a taller one
const boxH = (w) => Math.max(260, Math.round(w * (w < 640 ? 0.66 : 0.42)))
const pName = (players, id) => { const n = players?.[id]?.name; return n ? n.split(' ').slice(-1)[0] : '' }

/** A round disc with a number on it, as a sprite: the player, in his club's colour. Cached per colour + number. */
const discCache = new Map()
function discSprite(hex, num) {
  const key = `${hex}|${num ?? ''}`
  let tex = discCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128
    const g = cv.getContext('2d')
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fillStyle = hex; g.fill()
    g.lineWidth = 6; g.strokeStyle = C.bg; g.stroke()
    g.fillStyle = C.bg; g.font = `900 ${num != null && num > 9 ? 58 : 66}px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    if (num != null) g.fillText(String(num), 64, 68)
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    discCache.set(key, tex)
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }))
  sp.scale.set(5.2, 5.2, 1)
  return sp
}

const clockText = (e, gameType) => {
  if (!e) return ''
  const reg = e.pt !== 'OT'
  const len = reg ? PERIOD_S : gameType === 3 ? PERIOD_S : 300
  const left = Math.max(0, len - e.t)
  const per = reg ? `P${e.period}` : e.period > 4 ? `${e.period - 3}OT` : 'OT'
  return `${per} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

export default function GameReplay({ game }) {
  const [on, setOn] = useState(false)
  useEffect(() => { setOn(lookParam() === 'tracking') }, [])
  const id = game?.id
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!on || !id) return undefined
    let live = true
    fetch(`/api/lamp/gameplay?id=${id}`).then((r) => r.json()).then((j) => { if (!live) return; if (j?.error) setErr(j.error); else setData(j) })
      .catch(() => { if (live) setErr('LIVE DATA DELAYED') })
    return () => { live = false }
  }, [on, id])
  if (!on) return null
  if (err) return <ChartEmpty theme={C}>The replay is waiting on the league feed ({err}).</ChartEmpty>
  if (!data) return <ChartEmpty theme={C}>Loading the game&apos;s events…</ChartEmpty>
  if (!data.events?.length) return <ChartEmpty theme={C}>No events on the ice yet. The replay starts at puck drop.</ChartEmpty>
  return <ReplayStage data={data} goals={game?.goals || []} />
}

function ReplayStage({ data, goals = [] }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(speed); speedRef.current = speed
  const [now, setNow] = useState({ i: -1, score: [0, 0] })
  const [intro, setIntro] = useState(null)   // the open: 'title' (the fly-in), 'data' (the numbers light up), or null
  const [gsUi, setGsUi] = useState(0)        // the game clock as the replay runs (the score bug ticks between events)
  const events = data.events
  const total = useMemo(() => gameSec(events[events.length - 1]) + 1, [events])
  const side = (abbrev) => (abbrev === data.home.abbrev ? 'home' : 'away')
  // the goal's label (called / board / off) from the game's goals (lamp_goal_feed via /api/lamp/game): same scorer, period, within 10 s
  // THE POWER PLAY (Donovan 2026-10-22, yes): who is a man up comes from each event's strength code; who sits in the box,
  // and for how long, from the penalties (a minor ends early on a power-play goal). Which end a club attacks in a period:
  // the side most of its shots that period went at.
  const penalties = useMemo(() => penaltyStretches(events, PERIOD_S), [events])
  const attackSign = useMemo(() => {
    const sum = {}
    for (const e of events) if (['sog', 'goal', 'miss'].includes(e.kind) && e.team) { const k = `${e.period}|${e.team}`; sum[k] = (sum[k] || 0) + Math.sign(e.x) }
    return (period, team) => Math.sign(sum[`${period}|${team}`] || 0) || 1
  }, [events])
  // the open's numbers: counted from the events, nothing else
  const tallies = useMemo(() => {
    const n = (k) => events.filter((e) => k.includes(e.kind)).length
    return [[events.length, 'EVENTS'], [n(['sog', 'goal']), 'SHOTS ON GOAL'], [n(['hit']), 'HITS']]
  }, [events])
  const goalLabel = (e) => {
    const secs = (mmss) => { const m = /^(\d+):(\d{2})$/.exec(String(mmss || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
    const g = goals.find((x) => String(x.scorer?.id) === String(e.who) && Number(x.period) === e.period && Math.abs((secs(x.time) ?? -99) - e.t) <= 10)
    return g?.label || null
  }

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(C.bg)
    const rink = buildRink(scene, { tracking: { floor: new THREE.Color(C.bg3).multiplyScalar(1.6), line: C.text, mark: '/icon-512.png' } })
    const camera = new THREE.PerspectiveCamera(34, W / H, 1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.42; controls.minDistance = 60; controls.maxDistance = 420
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    // THE BROADCAST CAMERA: high over one side, the whole sheet in frame; a tall phone box pulls back along the same line
    const frame = () => {
      const pull = Math.max(1, 2.2 / camera.aspect)
      camera.position.set(0, 128 * pull, 92 * pull); controls.target.set(0, 0, 0); controls.update()
    }
    frame()
    const look = makeComposer(renderer, scene, camera, W, H, { ao: false, scale: 0.4 })

    // the puck, its trail, the marks
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.45, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text) }))
    puck.position.y = 0.4; puck.visible = false; scene.add(puck)
    const marks = new THREE.Group(); scene.add(marks)
    // THE TRACE: the play so far, as one glowing line -- the last event's spot, the one before it (when play carried on
    // between them) and the puck, brightest at the puck. It follows the play, never a frame history, so 4x stays clean.
    const tailGeo = new THREE.BufferGeometry()
    const tailPos = new Float32Array(3 * 3), tailCol = new Float32Array(3 * 3)
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3)); tailGeo.setAttribute('color', new THREE.BufferAttribute(tailCol, 3))
    const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }))
    scene.add(tail)
    const tailInk = new THREE.Color(C.ice)
    const resetTail = () => { tailGeo.setDrawRange(0, 0) }
    const setTail = (pts) => {
      pts.forEach((v, k) => { tailPos[k * 3] = v.x; tailPos[k * 3 + 1] = 0.35; tailPos[k * 3 + 2] = v.z; const f = (k + 1) / pts.length; tailCol[k * 3] = tailInk.r * f; tailCol[k * 3 + 1] = tailInk.g * f; tailCol[k * 3 + 2] = tailInk.b * f })
      tailGeo.setDrawRange(0, pts.length); tailGeo.attributes.position.needsUpdate = true; tailGeo.attributes.color.needsUpdate = true
    }
    // THE SPRAY: a hit or a hard stop throws a little ice -- a few white flecks that fly low and fade (one Points object reused)
    const SPRAY = 160
    const sprayPos = new Float32Array(SPRAY * 3), sprayVel = new Float32Array(SPRAY * 3), sprayLife = new Float32Array(SPRAY)
    const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3))
    const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: new THREE.Color(C.text), size: 0.55, transparent: true, opacity: 0.85, depthWrite: false }))
    scene.add(spray)
    let sprayNext = 0
    for (let k = 0; k < SPRAY; k += 1) sprayPos[k * 3 + 1] = -10
    const kick = (x, y, n = 18, power = 1) => {
      const at0 = rinkPoint(x, y, 0.3)
      for (let j = 0; j < n; j += 1) {
        const k = sprayNext; sprayNext = (sprayNext + 1) % SPRAY
        const ang = Math.random() * Math.PI * 2, sp = (6 + Math.random() * 14) * power
        sprayPos[k * 3] = at0.x; sprayPos[k * 3 + 1] = 0.3; sprayPos[k * 3 + 2] = at0.z
        sprayVel[k * 3] = Math.cos(ang) * sp; sprayVel[k * 3 + 1] = 3 + Math.random() * 5 * power; sprayVel[k * 3 + 2] = Math.sin(ang) * sp
        sprayLife[k] = 0.45 + Math.random() * 0.35
      }
    }
    const stepSpray = (dt) => {
      for (let k = 0; k < SPRAY; k += 1) {
        if (sprayLife[k] <= 0) { sprayPos[k * 3 + 1] = -10; continue }
        sprayLife[k] -= dt
        sprayPos[k * 3] += sprayVel[k * 3] * dt; sprayPos[k * 3 + 2] += sprayVel[k * 3 + 2] * dt
        sprayVel[k * 3 + 1] -= 30 * dt; sprayPos[k * 3 + 1] = Math.max(0.2, sprayPos[k * 3 + 1] + sprayVel[k * 3 + 1] * dt)
        sprayVel[k * 3] *= 0.92; sprayVel[k * 3 + 2] *= 0.92
      }
      sprayGeo.attributes.position.needsUpdate = true
    }
    // THE GOAL: the net's mesh bulges back and settles; a red light washes the crease
    let ripple = null
    const rippleNet = (sx, t) => { const n = rink.nets?.[sx]; if (n?.userData.mesh) ripple = { mesh: n.userData.mesh, born: t } }
    const stepRipple = (t) => {
      if (!ripple) return
      const age = (t - ripple.born) / 900
      if (age >= 1) { ripple.mesh.scale.set(1, 1, 1); ripple = null; return }
      const bulge = 1 + Math.sin(age * Math.PI) * 0.35 * (1 - age)
      ripple.mesh.scale.set(bulge, 1, 1 + (bulge - 1) * 0.3)
    }
    const live = []   // { obj, born, life, kind }
    const shotLine = (e, color) => {
      const from = rinkPoint(e.x, e.y, 0.3), to = rinkPoint(Math.sign(e.x || 1) * GOAL_X, e.kind === 'miss' ? (e.y > 0 ? 4.5 : -4.5) : 0, e.kind === 'goal' ? 2 : 0.6)
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: e.kind === 'goal' ? 1 : 0.75 }))
      return ln
    }
    const pulse = (x, y, color, r0 = 1.5) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.copy(rinkPoint(x, y, 0.08)); return m
    }
    const add = (obj, life, kind) => { marks.add(obj); live.push({ obj, born: performance.now(), life, kind }) }
    const showEvent = (e) => {
      const ink = INK[side(e.team)]
      const otherInk = INK[side(e.team) === 'home' ? 'away' : 'home']
      const d = discSprite(ink, data.players?.[e.who]?.num); d.position.copy(rinkPoint(e.x, e.y, 3.2)); add(d, SHOW_MS, 'disc')
      if (e.kind === 'hit' && e.vs) { const v = discSprite(otherInk, data.players?.[e.vs]?.num); v.position.copy(rinkPoint(e.x + 3, e.y - 2, 3.2)); add(v, SHOW_MS, 'disc') }
      if (e.kind === 'faceoff') add(pulse(e.x, e.y, C.text, 2), 700, 'pulse')
      if (e.kind === 'sog' || e.kind === 'miss' || e.kind === 'goal') add(shotLine(e, ink), e.kind === 'goal' ? 2600 : 1100, 'line')
      if (e.kind === 'goal') { const sx = Math.sign(e.x || 1), p = pulse(sx * GOAL_X, 0, C.lamp, 3); add(p, 1600, 'goal'); rippleNet(sx, performance.now()); kick(sx * (GOAL_X - 2), 0, 26, 1.3) }
      if (e.kind === 'hit') kick(e.x, e.y, 22, 1.1)
      if (e.kind === 'block' || e.kind === 'takeaway') kick(e.x, e.y, 10, 0.7)
      if (e.kind === 'hit' || e.kind === 'takeaway' || e.kind === 'giveaway' || e.kind === 'block') add(pulse(e.x, e.y, ink, 1.6), 600, 'pulse')
    }
    const fade = (t) => {
      for (let k = live.length - 1; k >= 0; k -= 1) {
        const m = live[k], age = (t - m.born) / m.life
        if (age >= 1) { marks.remove(m.obj); m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.(); live.splice(k, 1); continue }
        const o = m.obj.material
        if (m.kind === 'pulse' || m.kind === 'goal') { m.obj.scale.setScalar(1 + age * (m.kind === 'goal' ? 4 : 2.5)); o.opacity = 1 - age }
        else if (m.kind === 'line') o.opacity = (o.userData.o0 ??= o.opacity) * (1 - age * age)
        else o.opacity = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25
      }
    }

    // THE POWER PLAY ON THE ICE: the man-up club's attacking zone (blue line to the end boards) breathes in its colour
    const zoneShape = (sx) => {
      const a = RINK_L / 2, b = RINK_W / 2
      const pts = roundedRect(a, b, RINK_R).getPoints(160).filter((p) => p.x * sx >= BLUE_X)
      pts.sort((p, q) => Math.atan2(p.y, p.x * sx) - Math.atan2(q.y, q.x * sx))
      const sh = new THREE.Shape(); sh.moveTo(sx * BLUE_X, -b); for (const p of pts) sh.lineTo(p.x, p.y); sh.lineTo(sx * BLUE_X, b); sh.closePath()
      return sh
    }
    const ppZones = {}
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(zoneShape(sx), 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ice), transparent: true, opacity: 0, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false; scene.add(m); ppZones[sx] = m
    }
    // THE PENALTY BOXES: two boxes off the far boards at centre ice, the away club's on the left; a player in the box sits
    // there as his disc, the box lit in his club's colour, for as long as his penalty runs
    const boxAt = { away: -9, home: 9 }, BOX_Y = RINK_W / 2 + 5.5
    const boxFill = {}
    for (const sideKey of ['away', 'home']) {
      const x0 = boxAt[sideKey]
      const pts = [[-6, -2.4], [6, -2.4], [6, 2.4], [-6, 2.4]].map(([dx, dy]) => rinkPoint(x0 + dx, BOX_Y + dy, 0.1))
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(INK[sideKey]), transparent: true, opacity: 0.6 })))
      const f = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(INK[sideKey]), transparent: true, opacity: 0, depthWrite: false }))
      f.rotation.x = -Math.PI / 2; f.position.copy(rinkPoint(x0, BOX_Y, 0.08)); scene.add(f); boxFill[sideKey] = f
    }
    const boxed = new Map()   // penalty index -> disc sprite
    const stepBox = (g, t) => {
      const lit = { away: 0, home: 0 }
      penalties.forEach((p, k) => {
        const on = g >= p.start && g < p.end
        const sideKey = side(p.team)
        if (on) {
          lit[sideKey] += 1
          if (!boxed.has(k)) { const d = discSprite(INK[sideKey], data.players?.[p.who]?.num); d.scale.set(4.2, 4.2, 1); scene.add(d); boxed.set(k, d) }
          const n = [...boxed.keys()].filter((j) => side(penalties[j].team) === sideKey).indexOf(k)
          boxed.get(k).position.copy(rinkPoint(boxAt[sideKey] - 3 + n * 4.5, BOX_Y, 2.6))
        } else if (boxed.has(k)) { const d = boxed.get(k); scene.remove(d); d.material.dispose(); boxed.delete(k) }
      })
      for (const sideKey of ['away', 'home']) boxFill[sideKey].material.opacity = lit[sideKey] ? 0.28 : 0
      // the man advantage: from the strength code of the last event shown
      const cur = idx >= 0 ? events[idx] : null, pp = powerPlayAt(cur)
      for (const sx of [-1, 1]) ppZones[sx].visible = false
      if (pp && cur) {
        const sx = attackSign(cur.period, data[pp].abbrev), z = ppZones[sx]
        z.visible = true; z.material.color.set(INK[pp]); z.material.opacity = 0.04 + 0.035 * (0.5 + 0.5 * Math.sin(t / 380))
      }
    }

    // THE CLOCK: replay time -> game seconds; the puck between event i and i+1 (unless play restarted before i+1)
    let gs = 0, last = performance.now(), idx = -1, playingNow = false, holdUntil = 0, uiAt = 0
    const at = (i) => rinkPoint(events[i].x, events[i].y, 0.4)
    const seek = (g) => {
      gs = Math.max(0, Math.min(total, g)); idx = -1
      while (idx + 1 < events.length && gameSec(events[idx + 1]) <= gs) idx += 1
      for (const m of live) { marks.remove(m.obj) } live.length = 0
      resetTail()
      setNow({ i: idx, score: idx >= 0 ? events[idx].score : [0, 0] })
    }
    // THE OPEN (Donovan 2026-10-22: "a video game first and then next gen stats ... welcome to the world ... boom"): the
    // camera comes in low behind one net, sweeps round the rink and settles on the broadcast angle; the title, then the
    // game's numbers, ride on top; then the puck drops at centre ice and play starts.
    let introAt = null, introDone = false, introPhase = null
    const flight = new THREE.CatmullRomCurve3([[-150, 14, 26], [-112, 34, 92], [-20, 70, 150], [0, 128, 92]].map((v) => new THREE.Vector3(...v)))
    const endIntro = (t) => {
      introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null)
      kick(0, 0, 30, 1.2); add(pulse(0, 0, C.text, 2), 900, 'pulse')
      playingNow = true; last = t
    }
    const stepIntro = (t) => {
      if (introAt == null) return
      const u = Math.min(1, (t - introAt) / INTRO_MS), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      const pull = Math.max(1, 2.2 / camera.aspect)
      const p = flight.getPoint(Math.min(1, e / 0.82))
      if (e >= 0.82) p.lerp(new THREE.Vector3(0, 128 * pull, 92 * pull), (e - 0.82) / 0.18)
      camera.position.copy(p); camera.lookAt(0, 0, 0)
      const ph = u < 0.55 ? 'title' : 'data'
      if (ph !== introPhase) { introPhase = ph; setIntro(ph) }
      if (u >= 1) endIntro(t)
    }
    const tick = () => {
      const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000); last = t
      stepIntro(t)
      if (playingNow && t >= holdUntil) {
        gs += dt * GAME_S * speedRef.current
        let moved = false
        while (idx + 1 < events.length && gameSec(events[idx + 1]) <= gs) {
          idx += 1; showEvent(events[idx]); moved = true
          // the clock stops on a goal: the replay holds on it too, so the goal can be seen before the next faceoff
          if (events[idx].kind === 'goal') { holdUntil = t + GOAL_HOLD_MS; gs = gameSec(events[idx]); break }
        }
        if (moved) setNow({ i: idx, score: events[idx].score })
        if (gs >= total) { playingNow = false; setPlaying(false) }
      }
      if (idx >= 0) {
        const cur = events[idx], nxt = events[idx + 1]
        puck.visible = true
        const from = at(idx)
        let p = from
        if (nxt && !nxt.fresh) {
          const g0 = gameSec(cur), g1 = gameSec(nxt), f = g1 > g0 ? Math.min(1, Math.max(0, (gs - g0) / (g1 - g0))) : 1
          p = from.clone().lerp(at(idx + 1), f)
        }
        puck.position.set(p.x, 0.4, p.z)
        const prev = idx > 0 && !cur.fresh ? at(idx - 1) : null
        if (p.distanceTo(from) > 0.5 || prev) setTail([...(prev ? [prev] : []), from, p]); else resetTail()
      }
      stepSpray(dt); stepRipple(t); stepBox(gs, t)
      if (t - uiAt > 200) { uiAt = t; setGsUi(gs) }
      fade(t); if (introAt == null) controls.update(); look.render(); raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = performance.now(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(tick)
    api.current = {
      play: () => {
        if (gs >= total) seek(0)
        if (!introDone && gs === 0) { introAt = performance.now(); introPhase = null; controls.enabled = false; return }
        playingNow = true; last = performance.now()
      },
      skipIntro: () => { if (introAt != null) endIntro(performance.now()) },
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } },
      seek,
      nextGoal: () => { const n = events.findIndex((e, i) => i > idx && e.kind === 'goal'); if (n >= 0) seek(gameSec(events[n]) - 4) },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      for (const m of live) { m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() }
      puck.geometry.dispose(); tailGeo.dispose(); sprayGeo.dispose(); for (const d of boxed.values()) d.material.dispose()
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [events, total]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the replay isn&apos;t available here.</ChartEmpty>
  const cur = now.i >= 0 ? events[now.i] : null
  const [as, hs] = now.score
  // the score bug's running clock (between events) and the power play: the man-up club, and the time left on the
  // earliest-ending penalty against the other club
  const runClock = cur ? (() => { const per = Math.min(cur.period, Math.floor(gsUi / PERIOD_S) + 1); return { ...cur, period: per, t: Math.max(cur.t, Math.min(PERIOD_S, Math.round(gsUi - (per - 1) * PERIOD_S))) } })() : null
  const ppNow = (() => {
    const pp = powerPlayAt(cur)
    if (!pp) return null
    const short = pp === 'home' ? data.away.abbrev : data.home.abbrev
    const lefts = penalties.filter((p) => p.team === short && gsUi >= p.start && gsUi < p.end).map((p) => Math.ceil(p.end - gsUi))
    return { side: pp, left: lefts.length ? Math.min(...lefts) : null }
  })()
  const words = cur ? eventWords(cur, data.players) : 'Press play: the game, event by event'
  const curInk = cur ? INK[side(cur.team)] : C.text3
  const bugTeam = (t, s, ink) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={nhlLogo(t.abbrev, true)} alt="" width={22} height={22} style={{ display: 'block' }} />
      <b style={{ color: ink, fontSize: 12, letterSpacing: 1 }}>{t.abbrev}</b>
      <b style={{ color: C.text, fontSize: 20, minWidth: 14, textAlign: 'center' }}>{s}</b>
    </span>
  )
  return (
    <section aria-label="The game, replayed" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="group" aria-label="Replay controls" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.ice, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the game'}</button>
        {intro ? <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.ice, C, NUM_FONT)} onClick={() => api.current.skipIntro?.()}>Skip intro</button> : null}
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.ice, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.ice, C, NUM_FONT)} onClick={() => api.current.nextGoal?.()}>Next goal</button>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* THE OPEN'S CARDS: the title while the camera flies in, then the game's numbers (counted from the events) */}
        {intro ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
            <style>{'@keyframes lampInL{from{transform:translateX(-60px);opacity:0}to{transform:none;opacity:1}}@keyframes lampInR{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}@keyframes lampUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}'}</style>
            {intro === 'title' ? (
              <div style={{ textAlign: 'center', fontFamily: NUM_FONT }}>
                <div style={{ fontSize: 11, letterSpacing: 4, color: C.text2, fontWeight: 800, animation: 'lampUp .5s ease-out both' }}>DASH NETWORK · LAMP</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 3vw, 26px)', marginTop: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'lampInL .55s cubic-bezier(.2,.9,.2,1) both' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={nhlLogo(data.away.abbrev, true)} alt="" width={56} height={56} />
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK.away, letterSpacing: 2 }}>{data.away.abbrev}</b>
                  </span>
                  <span style={{ fontSize: 18, color: C.text3, fontWeight: 900, animation: 'lampUp .5s .25s both' }}>@</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'lampInR .55s cubic-bezier(.2,.9,.2,1) both' }}>
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK.home, letterSpacing: 2 }}>{data.home.abbrev}</b>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={nhlLogo(data.home.abbrev, true)} alt="" width={56} height={56} />
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 10, letterSpacing: 2, animation: 'lampUp .5s .35s both' }}>{data.date || ''} · REPLAY</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'clamp(14px, 4vw, 34px)', fontFamily: NUM_FONT, textAlign: 'center' }}>
                {tallies.map(([n, label], k) => (
                  <div key={label} style={{ animation: `lampUp .45s ${k * 0.12}s both` }}>
                    <div style={{ fontSize: 'clamp(26px, 6vw, 44px)', fontWeight: 900, color: C.text, lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: 11, color: C.ice, letterSpacing: 2, fontWeight: 800, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {/* THE SCORE BUG: both clubs, the score after the last event shown, the period and the clock */}
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', display: intro ? 'none' : 'flex', alignItems: 'center', gap: 10, background: C.bg2,
          border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 10px', fontFamily: NUM_FONT, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {bugTeam(data.away, as, INK.away)}
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
            <span style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>{cur ? clockText(runClock, data.gameType) : 'P1 20:00'}</span>
            {ppNow ? <span style={{ fontSize: 10, fontWeight: 900, color: C.bg, background: INK[ppNow.side], borderRadius: 3, padding: '0 5px', marginTop: 2, letterSpacing: 1 }}>PP {data[ppNow.side].abbrev}{ppNow.left != null ? ` ${Math.floor(ppNow.left / 60)}:${String(ppNow.left % 60).padStart(2, '0')}` : ''}</span> : null}
          </span>
          {bugTeam(data.home, hs, INK.home)}
        </div>
        {/* THE MOMENT CARD: a goal, held while the clock is stopped -- the scorer's face, his goal number this season, the shot
            (type and distance from the feed's spot), the helpers, the score; and CALLED IT when our board called him (the goal's
            label from lamp_goal_feed, the same one the scores page shows; stamped only once the game is final) */}
        {cur?.kind === 'goal' ? (() => {
          const pl = data.players?.[cur.who] || {}
          const dist = Math.round(Math.hypot(GOAL_X - Math.abs(cur.x), cur.y))
          const helpers = [cur.a1, cur.a2].map((id) => data.players?.[id]?.name).filter(Boolean)
          const label = goalLabel(cur)
          const called = label === 'called' && data.state === 'final'
          return (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', width: 'min(92%, 360px)',
              background: C.bg2, border: `1px solid ${curInk}`, borderRadius: 12, padding: 12, fontFamily: NUM_FONT, boxShadow: `0 10px 30px ${C.bg}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {pl.face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pl.face} alt="" width={54} height={54} style={{ display: 'block', borderRadius: '50%', background: C.bg3, border: `2px solid ${curInk}`, flex: '0 0 auto' }} />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: C.lamp, letterSpacing: 3, lineHeight: 1 }}>GOAL</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginTop: 4 }}>{pl.name || ''}{pl.num != null ? <span style={{ color: curInk }}> #{pl.num}</span> : null}</div>
                  <div style={{ fontSize: 11.5, color: C.text2, marginTop: 2 }}>{[cur.total ? `${ordinal(cur.total)} goal this season` : null, cur.shotType, Number.isFinite(dist) ? `${dist} ft` : null].filter(Boolean).join(' · ')}</div>
                  {helpers.length ? <div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>from {helpers.join(', ')}</div> : null}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{data.away.abbrev} {as} · {data.home.abbrev} {hs}</span>
                <span style={{ fontSize: 11, color: C.text3 }}>{clockText(cur, data.gameType)}</span>
              </div>
              {called ? (
                <div aria-label="Called it" style={{ position: 'absolute', top: -14, right: -8, transform: 'rotate(8deg)', border: `3px solid ${C.ice}`, color: C.ice, background: C.bg,
                  padding: '3px 10px', fontSize: 16, fontWeight: 900, letterSpacing: 3, borderRadius: 4 }}>CALLED IT</div>
              ) : label === 'board' ? <div style={{ marginTop: 8 }}><CallStatusBadge status="board" theme={C} numFont={NUM_FONT} /></div> : null}
            </div>
          )
        })() : null}
        {/* THE TICKER: the last event in a few words, in the colour of the club that did it */}
        <div aria-live="polite" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: intro ? 'none' : 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
          <span style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${curInk}`, borderRadius: 6, padding: '4px 8px',
            fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: cur?.kind === 'goal' ? C.text : C.text2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{words}</span>
        </div>
      </div>
      <input type="range" min={0} max={events.length - 1} value={Math.max(0, now.i)} aria-label="Jump through the game"
        onChange={(e) => api.current.seek?.(gameSec(events[Number(e.target.value)]))} style={{ width: '100%', minHeight: 44, accentColor: C.ice }} />
      <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        REPLAY · {events.length} events from the NHL&apos;s play-by-play: every disc is a real event, where and when it happened. The puck&apos;s path between events is drawn.
        {' '}<b style={{ color: INK.away }}>{data.away.abbrev}</b> · <b style={{ color: INK.home }}>{data.home.abbrev}</b>
      </div>
    </section>
  )
}
