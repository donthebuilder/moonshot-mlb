'use client'
// 🏈 THE GAME, PLAY BY PLAY, ON THE FIELD (2026-10-22, TUDDY; the twin of LAMP's GameReplay and MOONSHOT's PreplayPark).
// Donovan: "after this, we can start building the other world so that way we can just have that all set up to go." The
// football world: the DASH field (lib/fieldWorld.js) inside the DASH building (lib/rinkWorld.js buildDashBowl, sized to the
// field), and every play of one game from ESPN's play-by-play (lib/nfl/drives.js) played on it in order: the line of
// scrimmage and the line to gain, the chains on the sideline, the throw in the air, the run, the kick, the drive drawn on
// the grass as it goes, a touchdown lighting its end zone.
//
// REAL: every yard line, down, distance, gain, clock, score, name and number. DRAWN: the ball's path inside a play (across
// the field from the feed's own "short right", air yards from "short" / "deep"); each club drives the same way all game.
// The caption says both. When the TUDDY simulator lands (PREPLAY's football engine), its games play on this same stage.
//
// A new stage rather than a generalised one: the job (a 3D game replay) exists on MOONSHOT and LAMP as sport-built
// stages, each on its own world; this follows their structure, chips, open, score bug, ticker, end card and record handle.
// Behind ?look=tracking (lib/three/look.js) while Donovan judges it. ?record=1 is the video layout (window.__tuddyReplay).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { C, NUM_FONT, FIELD3D } from '../../lib/nfl/theme'
import { buildField, YD, FIELD_L, FIELD_W } from '../../lib/fieldWorld'
import { buildDashBowl } from '../../lib/rinkWorld'
import { playsFromSummary, playPath, ballAt, playWords, downText, shortKey, beatsOf, scoreAt, patPlay, HOLD } from '../../lib/nfl/drives'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary'
// the two clubs: the product's accent and the field's cream (both these clubs could wear red; ink you can tell apart)
const INK = { away: C.green, home: C.cream }
const SPEEDS = [[1, '1x'], [2, '2x'], [4, '4x']]
const CHIP = 9                     // a chip, in feet
const INTRO_MS = 6400
const boxH = (w, rec = false) => (rec ? Math.round(w * 9 / 16) : Math.max(260, Math.round(w * (w < 640 ? 0.68 : 0.46))))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
const wx = (x) => (x - 50) * YD                       // field yards (from the home goal line) -> world feet
const clockText = (p) => (p ? `${p.period > 4 ? 'OT' : `Q${p.period}`} ${Math.floor((p.clock ?? 0) / 60)}:${String((p.clock ?? 0) % 60).padStart(2, '0')}` : 'Q1 15:00')

/** A chip: a dark disc ringed in the club's colour, its logo and the man's number. Cached per club + number. */
const chipCache = new Map()
const logoCache = new Map()
function clubLogo(url) {
  if (!url || typeof Image === 'undefined') return null
  let img = logoCache.get(url)
  if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = url; logoCache.set(url, img) }
  return img
}
function chipSprite(hex, label, logoUrl) {
  const key = `${hex}|${label ?? ''}|${logoUrl || ''}`
  let tex = chipCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160
    const draw = (logo) => {
      const g = cv.getContext('2d')
      g.clearRect(0, 0, 160, 160)
      g.beginPath(); g.arc(80, 80, 72, 0, Math.PI * 2); g.fillStyle = C.bg2; g.fill()
      g.lineWidth = 12; g.strokeStyle = hex; g.stroke()
      const has = logo?.complete && logo.naturalWidth
      if (has) { try { g.drawImage(logo, 40, label != null ? 14 : 40, 80, 80) } catch { /* a logo that will not draw: the chip without it */ } }
      g.fillStyle = hex; g.font = `900 ${has ? 42 : 64}px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      if (label != null) g.fillText(String(label), 80, has ? 122 : 84)
    }
    const logo = clubLogo(logoUrl)
    draw(logo)
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    if (logo && !(logo.complete && logo.naturalWidth)) logo.addEventListener('load', () => { draw(logo); tex.needsUpdate = true }, { once: true })
    chipCache.set(key, tex)
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }))
  sp.scale.set(CHIP, CHIP, 1); sp.renderOrder = 6
  return sp
}

/** A word painted on the grass (an end zone's club): a canvas texture on a flat plane. */
function paintPlane(text, color, w, h, { font = '900 120px SF Mono, Menlo, monospace', opacity = 0.55 } = {}) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256
  const g = cv.getContext('2d'); g.clearRect(0, 0, 1024, 256)
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 136)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  return m
}

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
  const [view, setView] = useState('all22')            // 'all22' follows the ball high off the sideline; 'rafters' the whole field
  const viewRef = useRef(view); viewRef.current = view
  const [now, setNow] = useState({ b: -1 })           // the beat on screen
  const [intro, setIntro] = useState(null)
  const [done, setDone] = useState(false)
  const plays = data.plays
  const { beats, total } = useMemo(() => beatsOf(plays), [plays])
  const side = (abbrev) => (abbrev === data.home.abbrev ? 'home' : 'away')
  const clubOf = (k) => data[k]
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
    scene.background = new THREE.Color(C.bg)
    scene.add(new THREE.AmbientLight(0xffffff, 0.7)); const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(-200, 400, 300); scene.add(sun)
    // THE WORLD: the field centred on the 50 (buildField puts its middle 15 yards past `los`)
    buildField(scene, { los: -15 * YD })
    const floor = new THREE.Color(C.bg3).multiplyScalar(1.6)
    buildDashBowl(scene, { floor, line: C.text, accent: C.green, ribbon: `DASH NETWORK  ·  TUDDY  ·  ${data.away.abbrev} @ ${data.home.abbrev}`, size: { a: FIELD_L / 2 + 52, b: FIELD_W / 2 + 32, r: 40 } })
    // the end zones wear the club that defends them (each club drives at the other's), the DASH mark sits on the 50
    for (const [k, x] of [['home', -55], ['away', 55]]) {
      const m = paintPlane(clubOf(k).abbrev, INK[k], FIELD_W * 0.8, 20)
      if (m) { m.position.set(x * YD, 0.06, 0); m.rotation.z = k === 'home' ? -Math.PI / 2 : Math.PI / 2; scene.add(m) }
    }
    if (typeof window !== 'undefined') {
      new THREE.TextureLoader().load('/icon-512.png', (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
        m.rotation.x = -Math.PI / 2; m.position.set(0, 0.07, 0); scene.add(m)
      }, undefined, () => {})
    }
    // THE SIDELINES: each club's team area between the 30s on opposite sides (the visitors' on the far side, where the chain
    // crew works), a faint box outlined in its ink -- marked, not lit
    for (const [k, s] of [['home', 1], ['away', -1]]) {
      const z = s * (FIELD_W / 2 + 15), L = 40 * YD, D = 12
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L, D), new THREE.MeshBasicMaterial({ color: new THREE.Color(INK[k]), transparent: true, opacity: 0.05, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.05, z); scene.add(m)
      const edge = [[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]].map(([x, dz]) => new THREE.Vector3(x, 0.07, z + dz))
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: new THREE.Color(INK[k]), transparent: true, opacity: 0.45 })))
    }
    // pylons at the eight corners of the end zones
    const pylonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FIELD3D.post) })
    for (const x of [-150, -180, 150, 180]) for (const z of [-FIELD_W / 2, FIELD_W / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, 1.2), pylonMat); m.position.set(x, 1.5, z); scene.add(m) }

    const camera = new THREE.PerspectiveCamera(30, W / H, 1, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.44; controls.minDistance = 80; controls.maxDistance = 900
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const look = makeComposer(renderer, scene, camera, W, H, { ao: false, scale: 0.4 })
    // THE CAMERAS: All-22 rides the ball high off the near sideline, ~55 yards in frame; Rafters holds the whole field
    let camX = 0
    const pullOf = () => Math.max(1, 1.9 / camera.aspect)
    const camAt = (x, v = viewRef.current) => {
      const pull = pullOf()
      return v === 'rafters'
        ? { pos: new THREE.Vector3(0, 300 * pull, 330 * pull), tgt: new THREE.Vector3(0, 0, 0) }
        : { pos: new THREE.Vector3(x, 225 * pull, 200 * pull), tgt: new THREE.Vector3(x, 0, 6) }
    }
    const frame = () => { const c = camAt(camX); camera.position.copy(c.pos); controls.target.copy(c.tgt); controls.update() }
    frame()
    let userMoved = false
    controls.addEventListener('start', () => { userMoved = true })

    // THE BALL, its shadow, the throw / kick trail, the drive on the grass, the lines, the chains
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text) }))
    ball.scale.set(1.9, 1.15, 1.15); ball.visible = false; scene.add(ball)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.bg), transparent: true, opacity: 0.55, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow)
    const trailMat = new LineMaterial({ vertexColors: true, linewidth: 3, transparent: true, opacity: 1, worldUnits: false, depthWrite: false })
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
    // THE DRIVE CHART, on the grass along the near sideline: each finished play a stroke from where it started to where it
    // ended, one lane per play (the broadcast drive tracker), cleared when the ball changes hands
    const driveGroup = new THREE.Group(); scene.add(driveGroup)
    let driveId = -1
    const addDriveStroke = (p) => {
      if (!['pass', 'rush', 'sack', 'int', 'fumble'].includes(p.kind) || p.incomplete) return
      const ink = INK[side(p.team)], a = wx(p.from), b = wx(p.to)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.8, Math.abs(b - a)), 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(ink), transparent: true, opacity: p.gain < 0 ? 0.25 : 0.6, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0.09, FIELD_W / 2 - 8 - (driveGroup.children.length % 8) * 2.8); driveGroup.add(m)
    }
    const clearDrive = () => { for (const m of driveGroup.children) { m.geometry.dispose(); m.material.dispose() } driveGroup.clear() }
    const bar = (color, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.visible = false; scene.add(m); return m }
    const losBar = bar(C.losBlue, 0.9), gainBar = bar(FIELD3D.post, 0.9)
    // the chain crew on the far sideline: a pole at the line of scrimmage, a pole at the line to gain, the down box
    const poleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FIELD3D.post) })
    const pole = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 8), poleMat); m.position.set(0, 3.5, -(FIELD_W / 2 + 5)); m.visible = false; scene.add(m); return m }
    const chainA = pole(), chainB = pole()
    const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: new THREE.Color(C.text2) }))
    chain.visible = false; scene.add(chain)
    // chips: the passer (stays at his drop), the man with the ball (follows it)
    let qbChip = null, carryChip = null
    const dropChip = (c) => { if (c) { scene.remove(c); c.material.dispose() } return null }
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
    const ring = (x, z, color, r0 = 3) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); m.userData.op = 0.9; return m }
    // a touchdown: the end zone it was scored in lights in TUDDY's accent (the moment's colour, as the card's word) and fades
    const endzoneFlash = (dir) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10 * YD, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.green), transparent: true, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.set(dir * 55 * YD, 0.11, 0); m.userData.op = 0.2; addLive(m, HOLD.td)
    }
    const clearLive = () => { for (const m of live) { scene.remove(m.obj); m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() } live.length = 0 }
    const flag = (x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.yellow), transparent: true })); m.position.set(x, 0.3, z); m.userData.op = 1; addLive(m, 1600) }

    // ── THE CLOCK ──
    let bt = 0, bIdx = -1, playingNow = false, last = nowMs(), introAt = null, introDone = false, introPhase = null
    let curPath = null, curDir = 1, curPlay = null
    const beatAt = (time) => { let lo = 0, hi = beats.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid].t <= time) lo = mid; else hi = mid - 1 } return lo }
    const setLines = (p) => {
      const scrim = p && p.down >= 1 && ['pass', 'rush', 'sack', 'int', 'fumble', 'penalty'].includes(p.kind)
      losBar.visible = gainBar.visible = chainA.visible = chainB.visible = chain.visible = false
      if (!scrim) return
      const dir = side(p.team) === 'home' ? 1 : -1, gainX = p.from + dir * p.dist
      losBar.position.x = wx(p.from); losBar.visible = true
      chainA.position.x = wx(p.from); chainA.visible = true
      if (gainX > 0 && gainX < 100) {
        gainBar.position.x = wx(gainX); gainBar.visible = true
        chainB.position.x = wx(gainX); chainB.visible = true
        chain.geometry.setFromPoints([new THREE.Vector3(wx(p.from), 4.5, -(FIELD_W / 2 + 5)), new THREE.Vector3(wx(gainX), 4.5, -(FIELD_W / 2 + 5))]); chain.visible = true
      }
    }
    // enter a beat: set up what it draws (once), then `drawBeat` moves it
    const enterBeat = (k) => {
      bIdx = k
      const b = beats[k], p = plays[b.i]
      curPlay = b.type === 'pat' ? patPlay(p, data) : p
      curDir = side(p.team) === 'home' ? 1 : -1
      const ink = INK[side(p.team)], logo = data[side(p.team)].logo
      if (b.type === 'play' || b.type === 'pat') {
        if (p.drive !== driveId && b.type === 'play') { driveId = p.drive; clearDrive() }
        curPath = playPath(curPlay, data)
        setLines(b.type === 'play' ? p : null)
        qbChip = dropChip(qbChip); carryChip = dropChip(carryChip)
        if (curPath.throwAt != null) makeTrail(curPath, curDir, ink, curPath.throwAt)
        else if (curPath.kickAt != null) makeTrail(curPath, curDir, ink, 0)
        else dropTrail()
        if (b.type === 'play' && p.qb && curPath.throwAt != null) { const m = man(p.team, p.qb); qbChip = chipSprite(ink, m?.jersey ?? null, logo); scene.add(qbChip) }
        if (curPlay.kind === 'penalty') flag(wx(p.from) + curDir * 4, 6)
      }
      if (b.type === 'td') {
        endzoneFlash(curDir)
        addLive(ring(wx(p.to), 0, ink, 4), 1400, 5)
      }
      if (b.type === 'fg') addLive(ring(wx(curDir > 0 ? 110 : -10), 0, ink, 3), 900, 4)
      if (b.type === 'turnover') addLive(ring(wx(p.to), 0, INK[side(p.team) === 'home' ? 'away' : 'home'], 3), 900, 4)
      if (b.type === 'gap' && (p.kind !== 'pass' || !p.incomplete)) addDriveStroke(p)
      setNow({ b: k })
    }
    const drawBeat = (u) => {
      const b = beats[bIdx]
      if (!b) return
      const p = plays[b.i]
      if ((b.type === 'play' || b.type === 'pat') && curPath) {
        const e = ease(u), at = ballAt(curPath, b.type === 'play' && curPath.throwAt == null && curPath.kickAt == null ? e : u)
        const X = wx(at.x), Z = at.z * YD * curDir
        ball.visible = shadow.visible = true
        ball.position.set(X, Math.max(1, at.h), Z)
        ball.rotation.set(0, 0, 0); ball.rotation.y = 0
        shadow.position.set(X, 0.08, Z); shadow.scale.setScalar(1 + Math.min(4, at.h / 10))
        showTrail(u)
        if (qbChip) { const d = ballAt(curPath, curPath.throwAt); qbChip.position.set(wx(d.x), CHIP * 0.65, d.z * YD * curDir) }
        // the man with the ball from the moment he has it
        const has = b.type === 'play' && u >= curPath.carrier && curPath.carrier < 1 && !curPath.incomplete && !curPath.kick
        if (has && !carryChip) {
          const k = curPath.returner ? (side(p.team) === 'home' ? 'away' : 'home') : curPath.turnover && p.kind === 'int' ? (side(p.team) === 'home' ? 'away' : 'home') : side(p.team)
          const short = curPath.returner ? p.ret : p.kind === 'int' ? null : p.who
          const m = man(data[k].abbrev, short)
          if (!curPath.returner || short) { carryChip = chipSprite(INK[k], m?.jersey ?? null, data[k].logo); scene.add(carryChip) }
        }
        if (carryChip) carryChip.position.set(X, at.h + CHIP * 0.75, Z)
      } else if (b.type === 'gap' || b.type === 'quarter') {
        qbChip = dropChip(qbChip)
      }
      // the camera rides the ball (All-22) unless someone has taken it
      if (!userMoved) {
        const want = clamp(ball.visible ? ball.position.x : wx(p.from), -FIELD_L / 2 + 70, FIELD_L / 2 - 70)
        camX += (want - camX) * 0.08
        const c = camAt(camX)
        camera.position.lerp(c.pos, 0.12); controls.target.lerp(c.tgt, 0.12)
      }
    }
    const seek = (ms) => {
      bt = clamp(ms, 0, total - 1)
      const k = beatAt(bt)
      clearDrive(); driveId = plays[beats[k].i].drive
      // the drive so far (the plays before this one in the same drive)
      for (let j = 0; j < k; j += 1) if (beats[j].type === 'gap' && plays[beats[j].i].drive === driveId) addDriveStroke(plays[beats[j].i])
      // land inside a play's hold (its touchdown, its try): draw the play itself to its end first, so the trail, chips and
      // lines on screen are that play's, never the last place the stage was
      clearLive(); dropTrail(); qbChip = dropChip(qbChip); carryChip = dropChip(carryChip)
      let k0 = k
      while (k0 > 0 && beats[k0].type !== 'play' && beats[k0 - 1].i === beats[k].i) k0 -= 1
      if (k0 < k && beats[k0].type === 'play') { enterBeat(k0); drawBeat(1); for (let j = k0 + 1; j < k; j += 1) enterBeat(j) }
      enterBeat(k); drawBeat(clamp((bt - beats[k].t) / beats[k].dur, 0, 1))
      // a jump lands with the camera already on the ball (no glide across the field)
      if (!userMoved) { camX = clamp(ball.visible ? ball.position.x : wx(plays[beats[k].i].from), -FIELD_L / 2 + 70, FIELD_L / 2 - 70); frame() }
      setDone(false)
    }
    const flight = new THREE.CatmullRomCurve3([[-300, 18, 0], [-230, 60, 160], [-80, 140, 240]].map((v) => new THREE.Vector3(...v)))
    const endIntro = (t) => {
      introAt = null; introDone = true; controls.enabled = true; setIntro(null)
      camX = clamp(wx(plays[0].from), -FIELD_L / 2 + 70, FIELD_L / 2 - 70); frame()
      playingNow = true; last = t
    }
    const stepIntro = (t) => {
      if (introAt == null) return
      const u = Math.min(1, (t - introAt) / INTRO_MS), e = ease(u)
      const end = camAt(clamp(wx(plays[0].from), -FIELD_L / 2 + 70, FIELD_L / 2 - 70), 'all22')
      const p = flight.getPoint(Math.min(1, e / 0.8))
      if (e >= 0.8) p.lerp(end.pos, (e - 0.8) / 0.2)
      camera.position.copy(p); camera.lookAt(new THREE.Vector3(0, 0, 0).lerp(end.tgt, e))
      const ph = u < 0.18 ? 'ident' : u < 0.6 ? 'title' : 'data'
      if (ph !== introPhase) { introPhase = ph; setIntro(ph) }
      if (u >= 1) endIntro(t)
    }
    const tick = () => {
      const t = nowMs(), dt = Math.min(0.1, (t - last) / 1000); last = t
      stepIntro(t)
      if (playingNow) {
        bt += dt * 1000 * speedRef.current
        if (bt >= total) { bt = total - 1; playingNow = false; setPlaying(false); setDone(true) }
        const k = beatAt(bt)
        while (bIdx < k) enterBeat(bIdx + 1)
        drawBeat(clamp((bt - beats[bIdx].t) / beats[bIdx].dur, 0, 1))
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
        scores: () => beats.filter((b) => b.type === 'td' || b.type === 'fg').map((b) => b.t),
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
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } },
      seekPlay: (i) => { const k = beats.findIndex((b) => b.type === 'play' && b.i === i); if (k >= 0) { seek(beats[k].t); tick() } },
      nextScore: () => { const k = beats.findIndex((b, j) => j > bIdx && b.type === 'play' && plays[b.i].scoring); if (k >= 0) { seek(Math.max(0, beats[k].t - 1)); tick() } },
      view: () => { userMoved = false; frame() },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); trailMat.resolution.set(w, h); if (introAt == null) frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      for (const m of live) { m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() }
      dropTrail(); clearDrive(); dropChip(qbChip); dropChip(carryChip)
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
        {[['all22', 'All-22'], ['rafters', 'Rafters']].map(([v, label]) => (
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
              <div style={{ textAlign: 'center', fontFamily: NUM_FONT }}>
                <div style={{ fontSize: 11, letterSpacing: 4, color: C.text2, fontWeight: 800, animation: 'tdUp .5s ease-out both' }}>DASH NETWORK · TUDDY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 3vw, 26px)', marginTop: 10, justifyContent: 'center' }}>
                  {['away', 'home'].map((k, i) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: i ? 'row-reverse' : 'row', animation: `${i ? 'tdInR' : 'tdInL'} .55s cubic-bezier(.2,.9,.2,1) both` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {data[k].logo ? <img src={data[k].logo} alt="" width={56} height={56} /> : null}
                      <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK[k], letterSpacing: 2 }}>{data[k].abbrev}</b>
                    </span>
                  )).reduce((a, x, i) => (i ? [...a, <span key="at" style={{ fontSize: 18, color: C.text3, fontWeight: 900, animation: 'tdUp .5s .25s both' }}>@</span>, x] : [x]), [])}
                </div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 10, letterSpacing: 2, animation: 'tdUp .5s .35s both' }}>{[day, 'REPLAY'].filter(Boolean).join(' · ')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'clamp(14px, 4vw, 34px)', fontFamily: NUM_FONT, textAlign: 'center', background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '12px clamp(14px, 4vw, 28px)' }}>
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
        REPLAY · {plays.length} plays from ESPN&apos;s play-by-play: every yard line, down, gain, clock and score is real. Drawn: the ball&apos;s path inside each play (across the field from the play&apos;s own words), and each club drives the same way all game.
        {' '}<b style={{ color: INK.away }}>{data.away.abbrev}</b> · <b style={{ color: INK.home }}>{data.home.abbrev}</b>
      </div>
    </section>
  )
}
