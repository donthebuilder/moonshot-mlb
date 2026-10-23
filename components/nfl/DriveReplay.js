'use client'
// 🏈 THE GAME, PLAY BY PLAY, ON THE ELECTRIC BOARD (TUDDY; the twin of LAMP's GameReplay and MOONSHOT's PreplayPark).
// 2026-10-22: built on the DASH field. 2026-10-23, Donovan: it looked "exactly like the others ... make it better ...
// make that shit look like" the vibrating electric football game. So the world is a 70s electric board on a table, a
// night game (lib/tabletop/electricBoard.js), the 22 are painted figures on bases in their clubs' colours, every base in
// TUDDY's accent (lib/tabletop/figures.js), the board hums while a play runs and goes quiet between snaps, and the camera
// shoots it the way NFL Films shoots a game: long lens, shallow focus, the background melting (lib/tabletop/look.js).
//
// REAL: every yard line, down, distance, gain, clock, score, name and number (ESPN's play-by-play, lib/nfl/drives.js);
// the man the play is about wears his real number. DRAWN: where the other 21 stand (a standard formation), the ball's
// path inside a play (across the field from the feed's own "short right", air yards from "short" / "deep"), and each club
// drives the same way all game. The caption says so. The TUDDY simulator's games will play on this same board.
//
// Behind ?look=tracking (lib/three/look.js) while Donovan judges it. ?record=1 is the video layout (window.__tuddyReplay).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { C, NUM_FONT, FIELD3D, TABLETOP as T } from '../../lib/nfl/theme'
import { YD, FIELD_L, FIELD_W } from '../../lib/fieldWorld'
import { buildElectricBoard, BOARD } from '../../lib/tabletop/electricBoard'
import { makeFigure, FORMATION, poseFor } from '../../lib/tabletop/figures'
import { makeTabletopLook } from '../../lib/tabletop/look'
import { playsFromSummary, playPath, ballAt, playWords, downText, shortKey, beatsOf, scoreAt, patPlay, HOLD } from '../../lib/nfl/drives'
import { isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary'
// the two clubs' ink in the overlays: the product's accent and cream (both clubs may wear the same hue)
const INK = { away: C.green, home: C.cream }
const SPEEDS = [[1, '1x'], [2, '2x'], [4, '4x']]
const INTRO_MS = 7600
const boxH = (w, rec = false) => (rec ? Math.round(w * 9 / 16) : Math.max(260, Math.round(w * (w < 640 ? 0.68 : 0.46))))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
const wx = (x) => (x - 50) * YD                       // field yards (from the home goal line) -> world feet
const clockText = (p) => (p ? `${p.period > 4 ? 'OT' : `Q${p.period}`} ${Math.floor((p.clock ?? 0) / 60)}:${String((p.clock ?? 0) % 60).padStart(2, '0')}` : 'Q1 15:00')
const SCRIM = ['pass', 'rush', 'sack', 'int', 'fumble', 'penalty']

export default function DriveReplay({ game }) {
  const [on, setOn] = useState(false)
  const [rec, setRec] = useState(false)
  useEffect(() => { setOn(lookParam() === 'tracking'); try { setRec(new URLSearchParams(window.location.search).get('record') === '1') } catch { /* no window */ } }, [])
  const id = game?.game_id
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  // started: the slate says so, or kickoff has passed (the slate's live state can lag; the feed itself says whether there are plays)
  const kick = Date.parse(game?.kickoff || '')
  const started = Boolean(game?.completed || game?.state === 'in' || game?.state === 'post' || (Number.isFinite(kick) && kick <= Date.now()))
  useEffect(() => {
    if (!on || !id || !started) return undefined
    let live = true
    setData(null); setErr(null)
    fetch(`${SUMMARY}?event=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!live) return; const g = playsFromSummary(j); if (!g) setErr('no plays in the feed'); else setData(g) })
      .catch((e) => { if (live) setErr(`LIVE DATA DELAYED · ${e?.message || 'feed'}`) })
    return () => { live = false }
  }, [on, id, started])
  if (!on) return null
  if (!started) return <ChartEmpty theme={C}>The replay starts at kickoff.</ChartEmpty>
  if (err) return <ChartEmpty theme={C}>The replay is waiting on the play-by-play ({err}).</ChartEmpty>
  if (!data) return <ChartEmpty theme={C}>Loading every play…</ChartEmpty>
  if (!data.plays.length) return <ChartEmpty theme={C}>No plays yet. The replay starts at kickoff.</ChartEmpty>
  return <DriveStage key={data.id} data={data} rec={rec} />
}

function DriveStage({ data, rec = false }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const speedRef = useRef(speed); speedRef.current = speed
  const [view, setView] = useState('board')            // 'board': the long lens above the play; 'eye': figure eye level
  const viewRef = useRef(view); viewRef.current = view
  const [now, setNow] = useState({ b: -1 })           // the beat on screen
  const [intro, setIntro] = useState(null)
  const [done, setDone] = useState(false)
  const plays = data.plays
  const { beats, total } = useMemo(() => beatsOf(plays), [plays])
  const side = (abbrev) => (abbrev === data.home.abbrev ? 'home' : 'away')
  const man = (team, short) => (short ? data.players[`${team}|${shortKey(short)}`] || null : null)
  const tallies = useMemo(() => {
    const tds = plays.filter((p) => p.td).length
    const long = plays.filter((p) => ['pass', 'rush'].includes(p.kind) && !p.incomplete).reduce((m, p) => Math.max(m, p.gain ?? 0), 0)
    return [[plays.length, 'PLAYS'], [tds, tds === 1 ? 'TOUCHDOWN' : 'TOUCHDOWNS'], [`${long} yd`, 'LONGEST PLAY']]
  }, [plays])

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    let vt = 0
    const nowMs = () => (rec ? vt : performance.now())
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W, rec)
    const scene = new THREE.Scene()
    // THE WORLD: the electric board on a walnut table, a night game under four little light towers
    buildElectricBoard(scene, { home: data.home, away: data.away, accent: C.green })
    // THE SWITCH on the near rim: a tin box, a lever, a pilot light. The open flips it ON; it is the board's motor
    const SW = new THREE.Vector3(-118, 3, BOARD.W / 2 + BOARD.RIM + 7)   // just outside the near rail, its plate to the camera
    // (a rounded tin box with OFF / ON stamped on its face plate, a chrome lever with a ball knob, a red pilot that glows)
    const swPlate = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d')
      g.fillStyle = T.tin; g.fillRect(0, 0, 256, 128); g.fillStyle = T.ink; g.font = '900 40px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('OFF', 64, 66); g.fillText('ON', 192, 66); g.fillRect(12, 10, 232, 4); g.fillRect(12, 114, 232, 4)
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
    })()
    const swBox = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 7, 6, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tinDark), metalness: 0.8, roughness: 0.3 }))
    swBox.rotation.z = Math.PI / 2; swBox.scale.set(1, 1, 1.25); swBox.position.copy(SW); swBox.castShadow = true; scene.add(swBox)
    // (it sits on a little tin post off the table, outside the rail)
    const swPost = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tinDark), metalness: 0.6, roughness: 0.4 })); swPost.position.set(SW.x, SW.y - 5.6, SW.z); swPost.castShadow = true; scene.add(swPost)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshStandardMaterial({ map: swPlate, metalness: 0.6, roughness: 0.35 }))
    face.position.set(SW.x, SW.y + 0.4, SW.z + 3.05); scene.add(face)
    const lever = new THREE.Group(); lever.position.set(SW.x, SW.y + 2.2, SW.z)
    const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color(T.enamel), metalness: 0.55, roughness: 0.28 })   // satin: it reads in a dark room
    const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.6, 12), chrome); leverArm.position.y = 2.3; lever.add(leverArm)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), chrome); knob.position.y = 4.7; lever.add(knob)
    lever.rotation.z = 0.6; lever.traverse((o) => { o.castShadow = true }); scene.add(lever)
    const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.tinDark), emissive: new THREE.Color(C.red), emissiveIntensity: 0, roughness: 0.2 }))
    pilot.position.set(SW.x + 5.6, SW.y + 1.6, SW.z + 1.2); scene.add(pilot)
    const setMotor = (onNow) => { lever.rotation.z = onNow ? -0.6 : 0.6; pilot.material.emissiveIntensity = onNow ? 4 : 0 }

    const camera = new THREE.PerspectiveCamera(26, W / H, 1, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 30; controls.maxDistance = 900
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const look = makeTabletopLook(renderer, scene, camera, W, H)
    // THE CAMERAS: Board (the long lens above the play, riding the ball) and Eye level (behind the offence, figure height)
    let camX = 0, curPath = null, curDir = 1, curPlay = null
    const pullOf = () => Math.max(1, 1.9 / camera.aspect)
    const camAt = (x, v = viewRef.current, dir = curDir) => {
      const pull = pullOf()
      return v === 'eye'
        ? { pos: new THREE.Vector3(x - dir * 62, 13, 22 * dir), tgt: new THREE.Vector3(x + dir * 40, 3, 0) }
        : { pos: new THREE.Vector3(x - 18, 128 * pull, 172 * pull), tgt: new THREE.Vector3(x, 0, 2) }
    }
    const camClamp = (x) => clamp(x, -FIELD_L / 2 + 60, FIELD_L / 2 - 60)
    const frame = () => { const c = camAt(camX); camera.position.copy(c.pos); controls.target.copy(c.tgt); controls.update() }
    frame()
    let userMoved = false
    controls.addEventListener('start', () => { userMoved = true })

    // THE BALL: the felt ball, its soft shadow, the throw / kick trail
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color(T.card), roughness: 1, metalness: 0 }))
    ball.scale.set(1.7, 1.0, 1.0); ball.castShadow = true; ball.visible = false; scene.add(ball)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.night), transparent: true, opacity: 0.35, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow)
    const trailMat = new LineMaterial({ vertexColors: true, linewidth: 2.4, transparent: true, opacity: 0.9, worldUnits: false, depthWrite: false })
    trailMat.resolution.set(W, H)
    let trail = null
    const SAMPLES = 48
    const dropTrail = () => { if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null } }
    const makeTrail = (path, dir, ink, from = 0) => {
      dropTrail()
      const pos = [], col = [], c = new THREE.Color(ink)
      for (let k = 0; k <= SAMPLES; k += 1) {
        const u = from + (1 - from) * (k / SAMPLES), b = ballAt(path, u)
        pos.push(wx(b.x), Math.max(0.4, b.h), b.z * YD * dir)
        const f = 0.25 + 0.75 * (k / SAMPLES); col.push(c.r * f, c.g * f, c.b * f)
      }
      const geo = new LineGeometry(); geo.setPositions(pos); geo.setColors(col)
      trail = new Line2(geo, trailMat); trail.renderOrder = 4; trail.userData = { from }; scene.add(trail)
      trail.geometry.instanceCount = 0
    }
    const showTrail = (u) => { if (!trail) return; const f = trail.userData.from; trail.geometry.instanceCount = Math.max(0, Math.round(SAMPLES * clamp((u - f) / (1 - f), 0, 1))) }
    // THE DRIVE CHART, painted along the near sideline: each finished play a stroke, cleared when the ball changes hands
    const driveGroup = new THREE.Group(); scene.add(driveGroup)
    let driveId = -1
    const addDriveStroke = (p) => {
      if (!['pass', 'rush', 'sack', 'int', 'fumble'].includes(p.kind) || p.incomplete) return
      const ink = INK[side(p.team)], a = wx(p.from), b = wx(p.to)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.8, Math.abs(b - a)), 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(ink), transparent: true, opacity: p.gain < 0 ? 0.25 : 0.5, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0.09, FIELD_W / 2 - 6 - (driveGroup.children.length % 8) * 2.8); driveGroup.add(m)
    }
    const clearDrive = () => { for (const m of driveGroup.children) { m.geometry.dispose(); m.material.dispose() } driveGroup.clear() }
    // the line of scrimmage and the line to gain, painted thin; the chain crew's two tin poles on the far side
    const bar = (color, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.visible = false; scene.add(m); return m }
    const losBar = bar(C.losBlue, 0.75), gainBar = bar(FIELD3D.post, 0.75)
    const poleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(FIELD3D.post), metalness: 0.5, roughness: 0.4 })
    const pole = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 8), poleMat); m.position.set(0, 4, -(FIELD_W / 2 + 6)); m.castShadow = true; m.visible = false; scene.add(m); return m }
    const chainA = pole(), chainB = pole()
    const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: new THREE.Color(T.tin) }))
    chain.visible = false; scene.add(chain)

    // THE FIGURES: eleven a club in its colours (the home club in its colour, the visitors in white, as on a Sunday),
    // every base in TUDDY's accent; the man the play is about is swapped for one wearing his real number
    const colors = (k) => k === 'home'
      ? { jersey: data.home.color || T.paint2, pants: T.enamel, helmet: data.home.color || T.ink, mask: data.home.alt || T.enamel, numInk: T.enamel }
      : { jersey: T.enamel, pants: T.enamel, helmet: data.away.color || T.ink, mask: data.away.alt || T.ink, numInk: data.away.color || T.ink }
    // (a pool of blank figures per club and pose, made as a formation first needs them; numbered men cached by club,
    // number and pose)
    const pool = new Map(), used = new Map(), numbered = new Map()
    const blankFig = (k, pose) => {
      const key = `${k}|${pose}`, list = pool.get(key) || [], n = used.get(key) || 0
      if (!list[n]) { const f = makeFigure({ ...colors(k), accent: C.green, pose }); f.visible = false; scene.add(f); list[n] = f; pool.set(key, list) }
      used.set(key, n + 1)
      return list[n]
    }
    const numberedFig = (k, num, pose) => {
      const key = `${k}|${num}|${pose}`
      let f = numbered.get(key)
      if (!f) { f = makeFigure({ ...colors(k), accent: C.green, num, pose }); f.visible = false; scene.add(f); numbered.set(key, f) }
      return f
    }
    let cast = [], castOff = 'home'
    // the man with the ball: a lit ring round his base, so he stands out of the pile at the line
    const carryRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(C.green), emissive: new THREE.Color(C.green), emissiveIntensity: 1.1, roughness: 0.3 }))
    carryRing.rotation.x = -Math.PI / 2; carryRing.visible = false; scene.add(carryRing)
    // put the 22 in their places for one play (a formation, drawn; the carrier and the passer real)
    const stage = (p, path, dir) => {
      for (const list of pool.values()) for (const f of list) f.visible = false
      for (const f of numbered.values()) f.visible = false
      used.clear(); carryRing.visible = false
      cast = []
      const off = side(p.team), def = off === 'home' ? 'away' : 'home'
      castOff = off
      const kick = p.kind === 'kickoff' || p.kind === 'punt', fg = p.kind === 'fg' || p.kind === 'xp'
      const offForm = kick ? FORMATION.kick : FORMATION.offense, defForm = kick ? FORMATION.receive : FORMATION.defense
      let carrySide = off, carryIdx = null
      if (p.kind === 'rush' || (p.kind === 'fumble' && !/\bpass\b/i.test(p.text))) carryIdx = 10
      else if (p.kind === 'pass' || p.kind === 'fumble') carryIdx = p.lane === 'L' ? 6 : p.lane === 'R' ? 7 : 8
      else if (p.kind === 'sack') carryIdx = 9
      else if (p.kind === 'int') { carrySide = def; carryIdx = p.lane === 'L' ? 7 : p.lane === 'R' ? 8 : 4 }
      else if (kick) { carrySide = def; carryIdx = 10 }
      const carryShort = kick ? p.ret : p.kind === 'int' ? null : p.who
      const carryNum = carryShort ? man(data[carrySide].abbrev, carryShort)?.jersey ?? null : null
      const qbNum = p.qb ? man(data[off].abbrev, p.qb)?.jersey ?? null : null
      const kickerNum = (kick || fg) && p.kind !== 'xp' ? man(data[off].abbrev, p.who)?.jersey ?? null : null
      const landX = kick && path?.kickTo != null ? ballAt(path, path.kickTo).x : null
      const place = (k, form) => form.forEach(([role, back, across], i) => {
        let b = back, a = across
        if (fg && k === off) { if (i === 9) { b = 7; a = 0 } if (i === 10) { b = 9.5; a = -1.5 } if (i === 6) a = -6; if (i === 7) a = 6; if (i === 8) a = -4.6 }
        let x = k === off ? p.from - dir * b : p.from + dir * b
        if (role === 'KR' && landX != null) x = landX
        // THE POSE: by his role (linemen down in a three-point stance, DBs backpedalling...); the man with the ball runs, the
        // passer has it cocked on a pass and stands ready on a run, the kicker's leg goes through it
        let num = null, pose = poseFor(role)
        if (k === carrySide && i === carryIdx) { pose = 'run'; if (carryNum != null) num = carryNum }
        if (k === off && i === 9 && !kick && !fg && carryIdx !== 9) { pose = p.kind === 'pass' || p.kind === 'int' ? 'qb' : 'ready'; if (qbNum != null) num = qbNum }
        if (k === off && i === 9 && p.kind === 'sack') { pose = 'run'; if (qbNum != null) num = qbNum }
        if (k === off && ((fg && i === 10) || (kick && role === 'K'))) { pose = 'kick'; if (kickerNum != null) num = kickerNum }
        if (fg && k === off && i === 9) pose = 'stance3'   // the holder, down on one knee
        const fig = num != null ? numberedFig(k, num, pose) : blankFig(k, pose)
        fig.visible = true
        cast.push({ fig, k, i, x0: wx(clamp(x, -9, 109)), z0: a * YD * dir, face: (k === off ? dir : -dir) > 0 ? 0 : Math.PI,
          carrier: k === carrySide && i === carryIdx, qb: k === off && i === 9 && !kick, ph: (i + (k === 'home' ? 0 : 11)) * 1.7 })
      })
      place(off, offForm); place(def, defForm)
    }
    // move the 22 at u of the play: the carrier on his route then with the ball, the passer to his drop, the rest drift
    // (the offence ahead, the defence at the ball); the buzz shivers them all while the motor runs
    const moveCast = (u, t, buzzing) => {
      const bp = ball.position
      for (const c of cast) {
        let x = c.x0, z = c.z0
        const fwd = c.k === castOff ? curDir : -curDir
        if (c.carrier && curPath && !curPath.kick) {
          const cu = curPath.incomplete ? 0.78 : curPath.carrier
          if (cu < 1 && u >= cu && !curPath.incomplete) { x = bp.x; z = bp.z }
          else if (cu > 0) { const at = ballAt(curPath, Math.min(cu, 1)), f = ease(clamp(u / cu, 0, 1)); x = c.x0 + (wx(at.x) - c.x0) * f; z = c.z0 + (at.z * YD * curDir - c.z0) * f }
        } else if (c.qb && curPath && curPath.throwAt != null) {
          const d = ballAt(curPath, curPath.throwAt), f = ease(clamp(u / curPath.throwAt, 0, 1))
          x = c.x0 + (wx(d.x) - c.x0) * f; z = c.z0 + (d.z * YD * curDir - c.z0) * f
        } else {
          x += fwd * u * 3.3
          if (c.k !== castOff) { x += (bp.x - x) * u * 0.28; z += (bp.z - z) * u * 0.28 }
        }
        const j = buzzing ? 1 : 0
        if (c.carrier) { carryRing.visible = true; carryRing.position.set(x, 0.5, z) }
        c.fig.position.set(x + j * Math.sin(t * 0.061 + c.ph) * 0.35, 0, z + j * Math.sin(t * 0.047 + c.ph * 1.3) * 0.35)
        c.fig.rotation.y = c.face + j * Math.sin(t * 0.033 + c.ph) * 0.12
        c.fig.userData.body.position.y = j * Math.abs(Math.sin(t * 0.09 + c.ph)) * 0.22
      }
    }

    // pulses and flashes that fade
    const live = []
    const addLive = (obj, life, grow = 0) => { scene.add(obj); live.push({ obj, born: nowMs(), life, grow }) }
    const fade = (t) => {
      for (let k = live.length - 1; k >= 0; k -= 1) {
        const m = live[k], a = (t - m.born) / m.life
        if (a >= 1) { scene.remove(m.obj); m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.(); live.splice(k, 1); continue }
        if (m.obj.material) m.obj.material.opacity = (m.obj.userData.op ?? 0.8) * (1 - a)
        if (m.grow) m.obj.scale.setScalar(1 + a * m.grow)
      }
    }
    const clearLive = () => { for (const m of live) { scene.remove(m.obj); m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() } live.length = 0 }
    const ring = (x, z, color, r0 = 3) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); m.userData.op = 0.9; return m }
    // a touchdown: the end zone it was scored in lights in TUDDY's accent and fades
    const endzoneFlash = (dir) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10 * YD, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.green), transparent: true, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.set(dir * 55 * YD, 0.11, 0); m.userData.op = 0.22; addLive(m, HOLD.td)
    }
    const flag = (x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(C.yellow), transparent: true })); m.position.set(x, 0.3, z); m.userData.op = 1; addLive(m, 1600) }

    // ── THE CLOCK ──
    let bt = 0, bIdx = -1, playingNow = false, last = nowMs(), introAt = null, introDone = false, introPhase = null, motor = false
    const beatAt = (time) => { let lo = 0, hi = beats.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid].t <= time) lo = mid; else hi = mid - 1 } return lo }
    const setLines = (p) => {
      const scrim = p && p.down >= 1 && SCRIM.includes(p.kind)
      losBar.visible = gainBar.visible = chainA.visible = chainB.visible = chain.visible = false
      if (!scrim) return
      const dir = side(p.team) === 'home' ? 1 : -1, gainX = p.from + dir * p.dist
      losBar.position.x = wx(p.from); losBar.visible = true
      chainA.position.x = wx(p.from); chainA.visible = true
      if (gainX > 0 && gainX < 100) {
        gainBar.position.x = wx(gainX); gainBar.visible = true
        chainB.position.x = wx(gainX); chainB.visible = true
        chain.geometry.setFromPoints([new THREE.Vector3(wx(p.from), 6, -(FIELD_W / 2 + 6)), new THREE.Vector3(wx(gainX), 6, -(FIELD_W / 2 + 6))]); chain.visible = true
      }
    }
    // enter a beat: set up what it draws (once), then `drawBeat` moves it
    const enterBeat = (k) => {
      bIdx = k
      const b = beats[k], p = plays[b.i]
      curPlay = b.type === 'pat' ? patPlay(p, data) : p
      curDir = side(p.team) === 'home' ? 1 : -1
      const ink = INK[side(p.team)]
      if (b.type === 'play' || b.type === 'pat') {
        if (p.drive !== driveId && b.type === 'play') { driveId = p.drive; clearDrive() }
        curPath = playPath(curPlay, data)
        setLines(b.type === 'play' ? p : null)
        stage(curPlay, curPath, curDir)
        if (curPath.throwAt != null) makeTrail(curPath, curDir, ink, curPath.throwAt)
        else if (curPath.kickAt != null) makeTrail(curPath, curDir, ink, 0)
        else dropTrail()
        if (curPlay.kind === 'penalty') flag(wx(p.from) + curDir * 4, 6)
      }
      if (b.type === 'td') { endzoneFlash(curDir); addLive(ring(wx(p.to), 0, ink, 4), 1400, 5) }
      if (b.type === 'fg') addLive(ring(wx(curDir > 0 ? 110 : -10), 0, ink, 3), 900, 4)
      if (b.type === 'turnover') addLive(ring(wx(p.to), 0, INK[side(p.team) === 'home' ? 'away' : 'home'], 3), 900, 4)
      if (b.type === 'gap' && (p.kind !== 'pass' || !p.incomplete)) addDriveStroke(p)
      setNow({ b: k })
    }
    const drawBeat = (u, t) => {
      const b = beats[bIdx]
      if (!b) return
      const p = plays[b.i]
      const running = b.type === 'play' || b.type === 'pat'
      // the motor: on while a play runs, off between snaps (the board goes quiet, the figures still)
      if (running !== motor) { motor = running; setMotor(motor) }
      if (running && curPath) {
        const e = ease(u), at = ballAt(curPath, b.type === 'play' && curPath.throwAt == null && curPath.kickAt == null ? e : u)
        const X = wx(at.x), Z = at.z * YD * curDir
        ball.visible = shadow.visible = true
        ball.position.set(X, Math.max(1, at.h), Z)
        shadow.position.set(X, 0.08, Z); shadow.scale.setScalar(1 + Math.min(4, at.h / 10))
        showTrail(u)
        moveCast(u, t, true)
      } else moveCast(1, t, false)
      look.focus.copy(ball.visible ? ball.position : new THREE.Vector3(wx(p.from), 0, 0))
      // the camera rides the ball unless someone has taken it
      if (!userMoved) {
        const want = camClamp(ball.visible ? ball.position.x : wx(p.from))
        camX += (want - camX) * 0.08
        const c = camAt(camX)
        camera.position.lerp(c.pos, 0.12); controls.target.lerp(c.tgt, 0.12)
      }
    }
    const seek = (ms) => {
      bt = clamp(ms, 0, total - 1)
      const k = beatAt(bt)
      clearDrive(); driveId = plays[beats[k].i].drive
      for (let j = 0; j < k; j += 1) if (beats[j].type === 'gap' && plays[beats[j].i].drive === driveId) addDriveStroke(plays[beats[j].i])
      // land inside a play's hold: draw the play itself to its end first, so what's on the board is that play's
      clearLive(); dropTrail()
      let k0 = k
      while (k0 > 0 && beats[k0].type !== 'play' && beats[k0 - 1].i === beats[k].i) k0 -= 1
      if (k0 < k && beats[k0].type === 'play') { enterBeat(k0); drawBeat(1, nowMs()); for (let j = k0 + 1; j < k; j += 1) enterBeat(j) }
      enterBeat(k); drawBeat(clamp((bt - beats[k].t) / beats[k].dur, 0, 1), nowMs())
      if (!userMoved) { camX = camClamp(ball.visible ? ball.position.x : wx(plays[beats[k].i].from)); frame() }
      setDone(false)
    }

    // THE OPEN, shot like NFL Films on a tabletop: the DASH sting; a macro on the switch, it flips ON, the pilot lights and
    // the figures start to shiver; a slow dolly down the kicking line at figure eye level, the focus racking man to man;
    // then up to the board as the ball is kicked off
    const first = plays[0], firstPath = playPath(first, data), firstDir = side(first.team) === 'home' ? 1 : -1
    const kx = wx(first.from)
    const stepIntro = (t) => {
      if (introAt == null) return
      const u = Math.min(1, (t - introAt) / INTRO_MS)
      const ph = u < 0.12 ? 'ident' : u < 0.62 ? 'title' : 'data'
      if (ph !== introPhase) { introPhase = ph; setIntro(ph) }
      if (u < 0.4) {
        // the macro: in close on the switch, drifting; the lever flips at 0.27
        const f = clamp((u - 0.12) / 0.28, 0, 1)
        camera.position.set(SW.x - 20 + f * 7, SW.y + 8 - f * 2, SW.z + 27 - f * 4); camera.lookAt(SW.x + 2, SW.y + 1, SW.z - 4)
        look.focus.set(SW.x, SW.y + 2, SW.z)
        const on = u >= 0.27
        if (on !== motor) { motor = on; setMotor(on) }
        moveCast(0, t, on)
      } else if (u < 0.8) {
        // the dolly: low, behind the kicking team, sliding across the line
        const f = ease((u - 0.4) / 0.4), z = 70 - f * 116
        camera.position.set(kx - firstDir * 34, 9, z); camera.lookAt(kx + firstDir * 30, 4, z * 0.5)
        look.focus.set(kx, 4, clamp(z * 0.8, -72, 72))
        moveCast(0, t, true)
      } else {
        // up to the board
        const f = ease((u - 0.8) / 0.2), end = camAt(camClamp(kx), 'board', firstDir)
        camera.position.lerpVectors(new THREE.Vector3(kx - firstDir * 34, 9, -46), end.pos, f)
        camera.lookAt(new THREE.Vector3(kx + firstDir * 50, 4, -18).lerp(end.tgt, f))
        look.focus.lerpVectors(new THREE.Vector3(kx, 4, -46), end.tgt, f)
        moveCast(0, t, true)
      }
      if (u >= 1) endIntro(t)
    }
    const endIntro = (t) => {
      introAt = null; introDone = true; controls.enabled = true; setIntro(null)
      camX = camClamp(kx); frame()
      playingNow = true; last = t
    }
    // before anything plays: the opening kickoff set on the board, motor off
    curDir = firstDir; curPath = firstPath; stage(first, firstPath, firstDir); moveCast(0, 0, false)
    camX = camClamp(kx); frame(); look.focus.set(kx, 0, 0)
    const tick = () => {
      const t = nowMs(), dt = Math.min(0.1, (t - last) / 1000); last = t
      stepIntro(t)
      if (playingNow) {
        bt += dt * 1000 * speedRef.current
        if (bt >= total) { bt = total - 1; playingNow = false; setPlaying(false); setDone(true) }
        const k = beatAt(bt)
        while (bIdx < k) enterBeat(bIdx + 1)
        drawBeat(clamp((bt - beats[bIdx].t) / beats[bIdx].dur, 0, 1), t)
      }
      fade(t); if (introAt == null) controls.update(); look.render(); if (!rec) raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([e]) => { if (rec) return; onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = nowMs(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { if (rec) return; cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = nowMs(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    if (!rec) raf = requestAnimationFrame(tick)
    else {
      io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      window.__tuddyReplay = {
        start: () => { api.current.play?.(); setPlaying(true) },
        step: (ms) => { vt += ms; tick() },
        done: () => bt >= total - 1 && !playingNow,
        jump: (ms) => { if (!introDone) { introAt = null; introDone = true; controls.enabled = true; setIntro(null) } playingNow = false; seek(ms); tick() },
        // a still of the open at u (0..1), for checking frames
        openAt: (u) => { introAt = nowMs() - u * INTRO_MS; introDone = false; stepIntro(nowMs()); look.render(); introAt = null },
        scores: () => beats.filter((b) => b.type === 'td' || b.type === 'fg').map((b) => b.t),
        motor: () => motor,
        total: () => total,
        game: () => data.id,
      }
    }
    api.current = {
      play: () => {
        if (bt >= total - 1) { seek(0); bIdx = -1 }
        if (!introDone && bt === 0) { introAt = nowMs(); introPhase = null; controls.enabled = false; return }
        playingNow = true; last = nowMs()
      },
      skipIntro: () => { if (introAt != null) endIntro(nowMs()) },
      pause: () => { playingNow = false; if (motor) { motor = false; setMotor(false) } if (introAt != null) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } },
      seekPlay: (i) => { const k = beats.findIndex((b) => b.type === 'play' && b.i === i); if (k >= 0) { seek(beats[k].t); tick() } },
      nextScore: () => { const k = beats.findIndex((b, j) => j > bIdx && b.type === 'play' && plays[b.i].scoring); if (k >= 0) { seek(Math.max(0, beats[k].t - 1)); tick() } },
      view: () => { userMoved = false; frame() },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); trailMat.resolution.set(w, h); if (introAt == null) frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      clearLive(); dropTrail(); clearDrive()
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() }) })
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [beats, total]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current.view?.() }, [view])

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the replay isn&apos;t available here.</ChartEmpty>
  const b = now.b >= 0 ? beats[now.b] : null
  const cur = b ? plays[b.i] : null
  const [as, hs] = b ? scoreAt(plays, data, b, 1) : [0, 0]
  const curInk = cur ? INK[side(cur.team)] : C.text3
  const tdShow = b && (b.type === 'td' || b.type === 'pat') ? cur : null
  const words = !cur ? 'Press play: the whole game, play by play'
    : b.type === 'quarter' ? `END OF ${plays[b.i - 1]?.period > 3 ? 'REGULATION' : `Q${plays[b.i - 1]?.period}`}`
      : b.type === 'pat' ? (cur.pat === '1' ? 'EXTRA POINT GOOD' : 'EXTRA POINT NO GOOD')
        : `${cur.team} · ${playWords(cur)}`
  const bugTeam = (k, s) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {data[k].logo ? <img src={data[k].logo} alt="" width={22} height={22} style={{ display: 'block' }} /> : null}
      <b style={{ color: INK[k], fontSize: 12, letterSpacing: 1 }}>{data[k].abbrev}</b>
      <b style={{ color: C.text, fontSize: 20, minWidth: 14, textAlign: 'center' }}>{s}</b>
    </span>
  )
  const scorer = tdShow ? data.players[`${tdShow.team}|${shortKey(tdShow.who)}`] || null : null
  const day = data.date ? new Date(data.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).toUpperCase() : ''
  return (
    <section aria-label="The game, play by play" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      <div role="group" aria-label="Replay controls" style={{ display: rec ? 'none' : 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.green, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the game'}</button>
        {intro ? <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.green, C, NUM_FONT)} onClick={() => api.current.skipIntro?.()}>Skip intro</button> : null}
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.green, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.green, C, NUM_FONT)} onClick={() => api.current.nextScore?.()}>Next score</button>
        {[['board', 'Board'], ['eye', 'Eye level']].map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={view === v} style={flatChip(view === v, C.green, C, NUM_FONT)} onClick={() => { setView(v); api.current.view?.() }}>{label}</button>
        ))}
      </div>
      <div data-replay-stage="" style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {intro ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
            <style>{'@keyframes tdInL{from{transform:translateX(-60px);opacity:0}to{transform:none;opacity:1}}@keyframes tdInR{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}@keyframes tdUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}@keyframes tdSting{0%{transform:scale(2.4);opacity:0;filter:blur(6px)}35%{transform:scale(.94);opacity:1;filter:none}55%{transform:scale(1.02)}100%{transform:scale(1)}}@keyframes tdBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
            {intro === 'ident' ? (
              <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-512.png" alt="" width={120} height={120} style={{ display: 'block', borderRadius: 26, animation: 'tdSting .9s cubic-bezier(.2,.9,.2,1) both' }} />
                <div style={{ width: 140, height: 3, background: C.green, transformOrigin: 'left', animation: 'tdBar .5s .35s ease-out both' }} />
                <div style={{ fontFamily: NUM_FONT, fontSize: 18, fontWeight: 900, letterSpacing: 8, color: C.text, animation: 'tdUp .45s .45s both' }}>REPLAY</div>
              </div>
            ) : intro === 'title' ? (
              // a lower third, so the shot behind it shows (the switch, the hum, the line)
              <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', fontFamily: NUM_FONT, textAlign: 'left' }}>
                <div style={{ width: 120, height: 3, background: C.green, transformOrigin: 'left', animation: 'tdBar .5s ease-out both' }} />
                <div style={{ fontSize: 11, letterSpacing: 4, color: C.text, fontWeight: 900, marginTop: 6, animation: 'tdUp .5s ease-out both' }}>DASH NETWORK · TUDDY · REPLAY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 16px)', marginTop: 6 }}>
                  {['away', 'home'].map((k, i) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: i ? 'row-reverse' : 'row', animation: `${i ? 'tdInR' : 'tdInL'} .55s cubic-bezier(.2,.9,.2,1) both` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {data[k].logo ? <img src={data[k].logo} alt="" width={56} height={56} /> : null}
                      <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK[k], letterSpacing: 2 }}>{data[k].abbrev}</b>
                    </span>
                  )).reduce((a, x, i) => (i ? [...a, <span key="at" style={{ fontSize: 18, color: C.text3, fontWeight: 900, animation: 'tdUp .5s .25s both' }}>@</span>, x] : [x]), [])}
                </div>
                <div style={{ fontSize: 12, color: C.text, marginTop: 6, letterSpacing: 2, fontWeight: 700, animation: 'tdUp .5s .35s both' }}>{day}</div>
              </div>
            ) : (
              <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', display: 'flex', gap: 'clamp(14px, 4vw, 34px)', fontFamily: NUM_FONT, textAlign: 'left', background: C.bg2, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${C.green}`, borderRadius: 8, padding: '10px clamp(12px, 3vw, 22px)' }}>
                {tallies.map(([n, label], k) => (
                  <div key={label} style={{ animation: `tdUp .45s ${k * 0.12}s both` }}>
                    <div style={{ fontSize: 'clamp(26px, 6vw, 44px)', fontWeight: 900, color: C.text, lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: 11, color: C.green, letterSpacing: 2, fontWeight: 800, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 4, background: `${C.bg}cc` }}>
            <div style={{ textAlign: 'center', fontFamily: NUM_FONT }}>
              <div style={{ fontSize: 12, letterSpacing: 4, color: C.text2, fontWeight: 800 }}>{data.final ? 'FINAL' : 'SO FAR'}{plays[plays.length - 1]?.period > 4 ? ' / OT' : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 28px)', marginTop: 10, justifyContent: 'center' }}>
                {[['away', as], ['home', hs]].map(([k, sc], i) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: i ? 'row-reverse' : 'row' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {data[k].logo ? <img src={data[k].logo} alt="" width={60} height={60} /> : null}
                    <b style={{ fontSize: 'clamp(30px, 7vw, 56px)', color: INK[k] }}>{data[k].abbrev}</b>
                    <b style={{ fontSize: 'clamp(30px, 7vw, 56px)', color: C.text }}>{sc}</b>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 12, letterSpacing: 2 }}>{[day, 'REPLAY · DASH NETWORK · TUDDY'].filter(Boolean).join(' · ')}</div>
              <div style={{ fontSize: 13, color: C.text2, marginTop: 8, fontWeight: 700 }}>
                Touchdowns: {plays.filter((p) => p.td).map((p) => p.who).filter(Boolean).join(' · ') || 'none'}
              </div>
            </div>
          </div>
        ) : null}
        {rec ? (
          <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 5, fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.text2, pointerEvents: 'none' }}>
            DASH NETWORK · <span style={{ color: C.green }}>TUDDY</span> · @CalledItHR
          </div>
        ) : null}
        {/* THE SCORE BUG: both clubs, the score, the quarter and clock at the snap, the down and distance */}
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', display: intro ? 'none' : 'flex', alignItems: 'center', gap: 10, background: C.bg2,
          border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 10px', fontFamily: NUM_FONT, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {bugTeam('away', as)}
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 84 }}>
            <span style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>{clockText(cur)}</span>
            {cur && b.type === 'play' && downText(cur, data) ? <span style={{ fontSize: 10, color: curInk, fontWeight: 900, letterSpacing: 0.5 }}>{downText(cur, data)}</span> : null}
          </span>
          {bugTeam('home', hs)}
        </div>
        {/* THE MOMENT CARD: a touchdown, held -- the scorer's face, his name and number, the play, the score */}
        {tdShow ? (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', width: 'min(92%, 360px)',
            background: C.bg2, border: `1px solid ${curInk}`, borderRadius: 12, padding: 12, fontFamily: NUM_FONT, boxShadow: `0 10px 30px ${C.bg}`, zIndex: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {scorer?.face ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scorer.face} alt="" width={54} height={54} style={{ display: 'block', borderRadius: '50%', objectFit: 'cover', background: C.bg3, border: `2px solid ${curInk}`, flex: '0 0 auto' }} />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.green, letterSpacing: 3, lineHeight: 1 }}>TOUCHDOWN</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginTop: 4 }}>{scorer?.name || tdShow.who || ''}{scorer?.jersey != null ? <span style={{ color: curInk }}> #{scorer.jersey}</span> : null}</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{[tdShow.kind === 'pass' ? `${tdShow.gain} yd catch${tdShow.qb ? ` from ${tdShow.qb}` : ''}` : tdShow.kind === 'rush' ? `${tdShow.gain} yd run` : 'return', tdShow.team].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{data.away.abbrev} {as} · {data.home.abbrev} {hs}</span>
              <span style={{ fontSize: 11, color: C.text3 }}>{clockText(tdShow)}</span>
            </div>
          </div>
        ) : null}
        <div aria-live="polite" style={{ position: 'absolute', left: 8, right: 8, bottom: rec ? 30 : 8, display: intro ? 'none' : 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
          <span style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${curInk}`, borderRadius: 6, padding: '4px 8px',
            fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: cur?.scoring ? C.text : C.text2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{words}</span>
        </div>
      </div>
      {rec ? null : <input type="range" min={0} max={plays.length - 1} value={Math.max(0, cur?.n ?? 0)} aria-label="Jump through the game"
        onChange={(e) => api.current.seekPlay?.(Number(e.target.value))} style={{ width: '100%', minHeight: 44, accentColor: C.green }} />}
      <div style={{ display: rec ? 'none' : 'block', fontSize: 11, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        REPLAY · {plays.length} plays from ESPN&apos;s play-by-play: every yard line, down, gain, clock and score is real, and the man each play is about wears his real number. Drawn: where the other 21 stand (a standard formation), the ball&apos;s path inside each play (across the field from the play&apos;s own words), and each club drives the same way all game.
        {' '}<b style={{ color: INK.away }}>{data.away.abbrev}</b> · <b style={{ color: INK.home }}>{data.home.abbrev}</b>
      </div>
    </section>
  )
}
