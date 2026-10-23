'use client'
// ⚾ PREPLAY · THE GAME BEFORE IT'S PLAYED (2026-10-22, MOONSHOT; the LAMP stage's twin). Donovan: "the simulator ...
// posted pregame, and then we just grade it after ... just like we have the hockey one." The simulator (lib/gameSim.js,
// the same engine as the Simulator panel below it) runs this game 2,000 times off the bot's board; this plays ONE of
// those games on the DASH ballpark: the first run that ends on the most common final (lib/preplay/mlb.js).
//
// REAL: the lineups, the starters and every rate (the board); every ball in play (one of that hitter's own 2026 batted
// balls with the same result: its spray spot, exit velo and launch angle, flown with lib/trajectory.js). SIMULATED: what
// each plate appearance did, and so the score. The whole stage says SIMULATION.
//
// Behind ?look=tracking (lib/three/look.js) while Donovan judges it; without it this renders nothing. ?record=1 is the
// video layout (16:9, no controls, a stepped clock scripts/record-replay.mjs drives through window.__mlbPreplay).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { radialTex } from '../../lib/arenaTex'
import { C, NUM_FONT } from '../../lib/theme'
import { gameFrom } from '../../lib/gameSim'
import { preplayMlb, placeBalls, playWords, beatsOf, PACE } from '../../lib/preplay/mlb'
const { PITCH_MS, HOLD_MS, INTRO_MS, HALF_MS, THROW_MS } = PACE
import { buildTrackingPark, parkPoint, BASES, MOUND } from '../../lib/ballparkWorld'
import { PARK_WALLS, PARK_POSTED } from '../../lib/parkWalls'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { solveFlight } from '../../lib/trajectory'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'
import { teamColor, mlbTeamLogo, mlbHeadshot } from '../../lib/mlbTeams'
import { detailUrl, archiveDetailUrl } from '../../lib/dataSource'
import { ordinal } from '../../lib/format'

const SPEEDS = [[1, '1x'], [2, '2x']]
const CHIP = 15                         // a chip, in feet
const boxH = (w, rec = false) => (rec ? Math.round(w * 9 / 16) : Math.max(260, Math.round(w * (w < 640 ? 0.72 : 0.5))))
const lastName = (s) => String(s || '').split(' ').slice(-1)[0]
const pct = (x) => `${Math.round(x * 100)}%`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)

/** A chip: a dark disc ringed in the club's colour, its logo, and the number (or P for a pitcher). Cached. */
const discCache = new Map()
const logoCache = new Map()
function clubLogo(team) {
  if (!team || typeof Image === 'undefined') return null
  let img = logoCache.get(team)
  if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = mlbTeamLogo(team, 96) || ''; logoCache.set(team, img) }
  return img
}
function chipTex(hex, label, team) {
  const key = `${hex}|${label ?? ''}|${team || ''}`
  let tex = discCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160
    const draw = (logo) => {
      const g = cv.getContext('2d')
      g.clearRect(0, 0, 160, 160)
      g.beginPath(); g.arc(80, 80, 72, 0, Math.PI * 2); g.fillStyle = C.bg2; g.fill()
      g.lineWidth = 12; g.strokeStyle = hex; g.stroke()
      const has = logo?.complete && logo.naturalWidth
      if (has) { try { g.drawImage(logo, 42, 16, 76, 76) } catch { /* a logo that will not draw: the chip without it */ } }
      g.fillStyle = hex; g.font = `900 ${has ? 42 : 64}px ${NUM_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      if (label != null) g.fillText(String(label), 80, has ? 122 : 84)
    }
    const logo = clubLogo(team)
    draw(logo)
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    if (logo && !(logo.complete && logo.naturalWidth)) logo.addEventListener('load', () => { draw(logo); tex.needsUpdate = true }, { once: true })
    discCache.set(key, tex)
  }
  return tex
}
const chipSprite = (hex, label, team) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: chipTex(hex, label, team), transparent: true, depthWrite: false, depthTest: false }))
  sp.scale.set(CHIP, CHIP, 1); sp.renderOrder = 5
  return sp
}

export default function PreplayPark({ game: g }) {
  const [on, setOn] = useState(false)
  const [rec, setRec] = useState(false)
  useEffect(() => { setOn(lookParam() === 'tracking'); try { setRec(new URLSearchParams(window.location.search).get('record') === '1') } catch { /* no window */ } }, [])
  const game = useMemo(() => (on ? gameFrom(g?.players || [], g?.game_pk) : null), [on, g])
  const pp = useMemo(() => (game ? preplayMlb(game) : null), [game])
  const dims = PARK_WALLS[game?.venue]?.d || null
  const heights = PARK_WALLS[game?.venue]?.h || null
  // every hitter's batted balls: tonight's detail file, else the archive (the same two places the spray chart reads)
  const [balls, setBalls] = useState(null)
  useEffect(() => {
    if (!game) return undefined
    let live = true
    const ids = [...game.away.lineup, ...game.home.lineup].map((r) => r.player_id ?? r.id).filter(Boolean)
    const one = async (id) => {
      for (const u of [detailUrl(id), archiveDetailUrl(id)]) {
        try { const r = await fetch(u); if (!r.ok) continue; const j = await r.json(); if (Array.isArray(j?.spray_chart) && j.spray_chart.length) return [id, j.spray_chart] } catch { /* the next place */ }
      }
      return [id, []]
    }
    Promise.all(ids.map(one)).then((xs) => { if (live) setBalls(Object.fromEntries(xs)) })
    return () => { live = false }
  }, [game])
  // the round and game number (the postseason row's own read; nothing on a regular-season night)
  const [round, setRound] = useState('')
  useEffect(() => {
    if (!on || !g?.game_pk) return undefined
    let live = true
    fetch(`/api/postseason/game?pk=${encodeURIComponent(String(g.game_pk))}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok && j.postseason) setRound(`${j.round || 'Postseason'}${j.gameNo ? ` · Game ${j.gameNo}` : ''}`) }).catch(() => {})
    return () => { live = false }
  }, [on, g?.game_pk])
  const shown = useMemo(() => {
    if (!pp?.typical || !balls) return null
    const log = JSON.parse(JSON.stringify(pp.typical.log))
    const placed = placeBalls(log, game, balls, dims)
    return { log, placed }
  }, [pp, balls, game, dims])
  if (!on) return null
  if (!game) return <ChartEmpty>PREPLAY waits for both lineups on the board.</ChartEmpty>
  if (!dims) return <ChartEmpty>PREPLAY has no wall for {game.venue || 'this park'} yet.</ChartEmpty>
  if (!pp?.typical) return <ChartEmpty>The simulator could not settle this game.</ChartEmpty>
  if (!shown) return <ChartEmpty>Loading every hitter&apos;s batted balls…</ChartEmpty>
  return <Stage game={game} pp={pp} log={shown.log} dims={dims} heights={heights} rec={rec} round={round} when={g?.game_time} />
}

function Stage({ game, pp, log, dims, heights, rec, round, when }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(speed); speedRef.current = speed
  const [ui, setUi] = useState({ i: -1, hr: false, landed: false })
  const [intro, setIntro] = useState(null)
  const { beats, total, final } = useMemo(() => beatsOf(log), [log])
  const INK = useMemo(() => ({ away: teamColor(game.away.team), home: teamColor(game.home.team) }), [game])
  const other = (side) => (side === 'home' ? 'away' : 'home')
  const day = useMemo(() => { try { return new Date(when).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() } catch { return '' } }, [when])
  const favTeam = game[pp.fav].team

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    let vt = 0
    const nowMs = () => (rec ? vt : performance.now())
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W, rec)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(C.bg)
    const floor = new THREE.Color(C.bg3).multiplyScalar(0.9)
    // our own field: a dark turf with a hint of green and a dark dirt with a hint of warmth (the rink's dark ice, on grass)
    const turf = new THREE.Color(C.bg3).lerp(new THREE.Color(C.green), 0.055).multiplyScalar(1.12)
    const dirt = new THREE.Color(C.bg3).lerp(new THREE.Color(C.orange), 0.1).multiplyScalar(1.35)
    // the panels along the wall: our products, each in its own accent (the network's own park)
    const panels = [['MOONSHOT', SPORT_ACCENT.mlb], ['CALLED IT', C.text], ['LAMP', SPORT_ACCENT.nhl], ['TUDDY', SPORT_ACCENT.nfl], ['BUCKETS', SPORT_ACCENT.nba], ['DASH NETWORK', C.text]].map(([text, color]) => ({ text, color }))
    const world = buildTrackingPark(scene, { dims, heights, turf, dirt, line: C.text, pole: C.yellow, floor, mark: '/icon-512.png', accent: C.orange,
      ribbon: `DASH NETWORK  ·  MOONSHOT  ·  PREPLAY  ·  ${game.away.team} @ ${game.home.team}`, posted: PARK_POSTED[game.venue] || null, panels })
    const camera = new THREE.PerspectiveCamera(32, W / H, 2, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.44; controls.minDistance = 150; controls.maxDistance = 1400
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    // THE BROADCAST CAMERA: high behind the plate, the whole field to the wall in frame; a tall phone box pulls back
    const TARGET = new THREE.Vector3(0, 0, 168)
    const broadcast = () => { const pull = Math.max(1, 1.78 / camera.aspect); return new THREE.Vector3(0, 318 * pull, -300 * pull) }
    const frame = () => { camera.position.copy(broadcast()); controls.target.copy(TARGET); controls.update() }
    frame()
    const look = makeComposer(renderer, scene, camera, W, H, { ao: false, scale: 0.4 })

    // ── the moving parts ────────────────────────────────────────────────
    const marks = new THREE.Group(); scene.add(marks)           // this half-inning's landing spots
    const fx = new THREE.Group(); scene.add(fx)                 // pulses, the trail, the ball (rebuilt per play)
    // the ball: a small white core with a soft glow round it, so it reads from the press box on a phone
    const ball = new THREE.Group(); ball.visible = false; scene.add(ball)
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text) })))
    const glowTex = radialTex([[0, 'rgba(255,255,255,.9)'], [0.25, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']])
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    glow.scale.set(16, 16, 1); ball.add(glow)
    ball.children.forEach((o) => { o.renderOrder = 6 })
    // the flight: a fat line (pixels, not feet) brightening toward the ball
    const TRAIL = 64
    const trailMat = new LineMaterial({ vertexColors: true, linewidth: 3.2, transparent: true, opacity: 1, worldUnits: false, depthWrite: false })
    trailMat.resolution.set(W, H)
    let trail = null
    const trailClear = () => { if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null } }
    const chips = new THREE.Group(); scene.add(chips)
    const pitcherChip = (side) => { const sp = chipSprite(INK[other(side)], 'P', game[other(side)].team); sp.position.copy(MOUND).setY(CHIP * 0.55); return sp }
    const batterChip = (side, bi) => { const r = game[side].lineup[bi]; return chipSprite(INK[side], r?.jersey_number ?? '', game[side].team) }
    const boxSpot = (side, bi) => { const lefty = String(game[side].lineup[bi]?.bats || 'R').toUpperCase().startsWith('L'); return new THREE.Vector3(lefty ? -5 : 5, CHIP * 0.55, 0) }
    // a runner's way round: base b0 -> b1 (4 = home, scored), along the base paths
    const along = (b0, b1, f) => {
      const legs = Math.max(0, b1 - b0)
      if (!legs) return BASES[b0 % 4].clone()
      const x = clamp(f, 0, 1) * legs, k = Math.min(legs - 1, Math.floor(x))
      return BASES[(b0 + k) % 4].clone().lerp(BASES[(b0 + k + 1) % 4], x - k)
    }
    const resultInk = (kind) => (kind === 'HR' ? C.orange : kind === 'T' || kind === 'D' ? C.amber : kind === 'S' ? C.text : C.text3)
    // THE DEFENCE: the eight behind the pitcher at their normal spots, each chip wearing his position (the board names no
    // fielders, so none is named). On a ball in play the one nearest where it ends runs it down; a ground-ball out is
    // thrown to first (to second, then first, on a double play), and the first baseman takes the bag.
    const SPOTS = { C: new THREE.Vector3(0, 0, -12), '1B': parkPoint(108, 37), '2B': parkPoint(148, 15), SS: parkPoint(148, -15), '3B': parkPoint(110, -36), LF: parkPoint(295, -27), CF: parkPoint(318, 0), RF: parkPoint(295, 27) }
    const fielderChip = (side, pos) => { const sp = chipSprite(INK[other(side)], pos, game[other(side)].team); sp.scale.set(CHIP * 0.8, CHIP * 0.8, 1); return sp }
    // the dugouts: the home club on the third-base side (see PREPLAY-WS-G1 found list: not verified for every park)
    const dugoutOf = (club) => (club === 'home' ? world.DUGOUT.third : world.DUGOUT.first)
    const ondeckOf = (club) => (club === 'home' ? world.ONDECK.third : world.ONDECK.first)
    const chaserOf = (e) => {
      const land = pathOf(e).at(-1)
      if (Math.hypot(land.x, land.z) < 40) return 'C'
      let best = null, bd = Infinity
      for (const [pos, at] of Object.entries(SPOTS)) { if (pos === 'C') continue; const d = Math.hypot(at.x - land.x, at.z - land.z); if (d < bd) { bd = d; best = pos } }
      return best
    }
    const throwBall = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.text) }))
    throwBall.visible = false; throwBall.renderOrder = 6; scene.add(throwBall)
    const arcAt = (a, b, f, h = 8) => a.clone().lerp(b, f).setY(4 + Math.sin(f * Math.PI) * h)
    // THE CROWD ON A HOMER: camera flashes in the seats where it lands (white points that blink and fade)
    const FLASH = 80
    const flashPos = new Float32Array(FLASH * 3), flashCol = new Float32Array(FLASH * 3)
    const flashGeo = new THREE.BufferGeometry(); flashGeo.setAttribute('position', new THREE.BufferAttribute(flashPos, 3)); flashGeo.setAttribute('color', new THREE.BufferAttribute(flashCol, 3))
    const flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    flashes.visible = false; flashes.renderOrder = 7; scene.add(flashes)
    let flashSeed = []
    const seedFlashes = (ang, key) => {
      let h = 2166136261 >>> 0
      const rnd = () => { h ^= key; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; return (h % 10000) / 10000 }
      flashSeed = []
      for (let k = 0; k < FLASH; k += 1) {
        const p = world.seatPoint(ang + (rnd() - 0.5) * 16, 2 + rnd() * 58)
        flashPos[k * 3] = p.x; flashPos[k * 3 + 1] = p.y; flashPos[k * 3 + 2] = p.z
        flashSeed.push({ ph: rnd() * 6.28, sp: 0.012 + rnd() * 0.02 })
      }
      flashGeo.attributes.position.needsUpdate = true
    }
    const stepFlashes = (age) => {
      for (let k = 0; k < FLASH; k += 1) { const s0 = flashSeed[k]; const w = Math.max(0, Math.sin(s0.ph + age * s0.sp)) ** 6 * Math.max(0, 1 - age / 2600); flashCol[k * 3] = w; flashCol[k * 3 + 1] = w; flashCol[k * 3 + 2] = w }
      flashGeo.attributes.color.needsUpdate = true
    }
    // THE SCOREBOARD: the line score, painted on the board over centre field after every play
    const board = world.scoreboard
    const paintBoard = (snap, headline = null, final = false) => {
      if (!board) return
      const g = board.canvas.getContext('2d'), W2 = board.canvas.width, H2 = board.canvas.height
      g.fillStyle = C.bg; g.fillRect(0, 0, W2, H2)
      g.strokeStyle = C.border2; g.lineWidth = 6; g.strokeRect(3, 3, W2 - 6, H2 - 6)
      g.textBaseline = 'middle'
      g.font = `900 34px ${NUM_FONT}`; g.textAlign = 'left'; g.fillStyle = C.orange; g.fillText('DASH NETWORK · PREPLAY', 28, 46)
      g.textAlign = 'right'; g.fillStyle = C.text2; g.fillText(final ? 'FINAL · SIMULATION' : 'SIMULATION', W2 - 28, 46)
      if (headline) {
        g.textAlign = 'center'; g.fillStyle = C.orange; g.font = `900 112px ${NUM_FONT}`; g.fillText(headline[0], W2 / 2, 170)
        g.fillStyle = C.text; g.font = `900 56px ${NUM_FONT}`; g.fillText(headline[1], W2 / 2, 272)
      } else {
        const inns = Math.max(9, snap.away.length, snap.home.length)
        const x0 = 150, cw = (W2 - x0 - 190) / inns
        g.font = `700 30px ${NUM_FONT}`; g.fillStyle = C.text3; g.textAlign = 'center'
        for (let k = 0; k < inns; k += 1) g.fillText(String(k + 1), x0 + cw * (k + 0.5), 110)
        g.fillText('R', W2 - 150, 110); g.fillText('H', W2 - 70, 110)
        ;[['away', 190], ['home', 285]].forEach(([club, y]) => {
          g.textAlign = 'left'; g.font = `900 52px ${NUM_FONT}`; g.fillStyle = INK[club]; g.fillText(game[club].team, 28, y)
          g.textAlign = 'center'; g.font = `800 46px ${NUM_FONT}`
          for (let k = 0; k < inns; k += 1) { const v = snap[club][k]; g.fillStyle = v ? C.text : C.text3; g.fillText(v == null ? '' : String(v), x0 + cw * (k + 0.5), y) }
          g.fillStyle = C.text; g.font = `900 52px ${NUM_FONT}`; g.fillText(String(snap.R[club]), W2 - 150, y)
          g.fillStyle = C.text2; g.font = `800 46px ${NUM_FONT}`; g.fillText(String(snap.H[club]), W2 - 70, y)
        })
      }
      board.texture.needsUpdate = true
    }
    // the line score after each beat (and before the first)
    const snaps = (() => {
      const out = [], cur = { away: [], home: [], R: { away: 0, home: 0 }, H: { away: 0, home: 0 } }
      const copy = () => ({ away: [...cur.away], home: [...cur.home], R: { ...cur.R }, H: { ...cur.H } })
      for (const bt of beats) {
        if (bt.type === 'half') cur[bt.half.side][bt.half.inning - 1] = 0
        if (bt.type === 'play') {
          const club = bt.half.side, k = bt.half.inning - 1, n = bt.e.scored?.length || 0
          cur[club][k] = (cur[club][k] || 0) + n; cur.R[club] += n
          if (['HR', 'T', 'D', 'S'].includes(bt.e.kind)) cur.H[club] += 1
        }
        out.push(copy())
      }
      return out
    })()
    const blankSnap = { away: [], home: [], R: { away: 0, home: 0 }, H: { away: 0, home: 0 } }
    paintBoard(blankSnap)
    // who is up next in a half: the on-deck hitter for the beat (the next plate appearance's man, plus one)
    const batterAt = (k) => { for (let j = k; j < beats.length && beats[j].half === beats[k].half; j += 1) if (beats[j].type === 'play' && !['SB', 'CS', 'WP', 'ghost'].includes(beats[j].e.kind)) return beats[j].e.bi; return null }
    const ringMesh = (r0, r1, color, opacity) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; return m
    }
    const dotMesh = (r, color, opacity) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; return m
    }
    // the flight of one play's ball: world points in time order, and where it lands
    const flightCache = new Map()
    const pathOf = (e) => {
      if (flightCache.has(e)) return flightCache.get(e)
      const b = e.ball
      let pts = null
      const f = b.la > 0.5 && b.ev ? solveFlight(b.ev, b.la, b.r) : null
      if (f) pts = f.timeFrames(TRAIL - 1).map((s) => parkPoint(s.distFrac * b.r, b.ang, 3 + s.heightFrac * f.apexFt))
      else {
        // on the ground: a few short hops out to the spot
        pts = []
        for (let k = 0; k < TRAIL; k += 1) { const u = k / (TRAIL - 1); pts.push(parkPoint(u * b.r, b.ang, 1 + 3.5 * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u))) }
      }
      flightCache.set(e, pts)
      return pts
    }
    const setTrail = (pts, n, ink) => {
      trailClear()
      const c = new THREE.Color(ink), pos = [], col = []
      for (let k = 0; k < n; k += 1) { const p = pts[k]; pos.push(p.x, p.y, p.z); const w = 0.3 + 0.7 * (k / Math.max(1, n - 1)); col.push(c.r * w, c.g * w, c.b * w) }
      const geo = new LineGeometry(); geo.setPositions(pos); geo.setColors(col)
      trail = new Line2(geo, trailMat); trail.renderOrder = 4; scene.add(trail)
    }
    const clearFx = () => { for (const o of [...fx.children]) { fx.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.() } trailClear(); ball.visible = false }
    const clearChips = () => { for (const o of [...chips.children]) { chips.remove(o); o.material?.dispose?.() } }
    const clearMarks = () => { for (const o of [...marks.children]) { marks.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.() } }
    const markOf = (e) => {
      const land = pathOf(e).at(-1)
      const m = e.kind === 'OUT' || e.kind === 'E' ? ringMesh(2.2, 3.2, C.text3, 0.55) : dotMesh(e.kind === 'HR' ? 5 : 3.4, resultInk(e.kind), 0.9)
      m.position.set(land.x, e.kind === 'HR' ? Math.max(0.3, land.y) : 0.3, land.z)
      return m
    }

    // ── one frame of the game at time t (ms since play started) ─────────
    let beatAt = -1, halfAt = null
    const draw = (t) => {
      let i = beats.findIndex((b) => t >= b.t0 && t < b.t0 + b.dur)
      if (i < 0) i = beats.length - 1
      const b = beats[i], u = clamp((t - b.t0) / b.dur, 0, 1)
      // a new half: its marks start empty; jumping into a half rebuilds the marks of the plays before
      if (b.half && b.half !== halfAt) { halfAt = b.half; clearMarks() }
      if (i !== beatAt) {
        if (beatAt >= 0 && i === beatAt + 1 && beats[beatAt].type === 'play' && beats[beatAt].e.ball && beats[beatAt].half === b.half) marks.add(markOf(beats[beatAt].e))
        else if (i !== beatAt + 1) { clearMarks(); for (let k = 0; k < i; k += 1) if (beats[k].half === b.half && beats[k].type === 'play' && beats[k].e.ball) marks.add(markOf(beats[k].e)) }
        beatAt = i
        clearFx()
        setUi({ i, hr: false, landed: false })
        flashes.visible = false; throwBall.visible = false
        if (b.type === 'final') paintBoard(snaps[i], null, true)
        else paintBoard(i > 0 ? snaps[i - 1] : blankSnap)
      }
      clearChips()
      if (b.type === 'final' || !b.half) return
      const side = b.half.side, lineup = game[side].lineup
      const defence = other(side)
      // the defence: in their spots; at the top of a half they jog out of their dugout
      const jog = b.type === 'half' ? ease(clamp((t - b.t0) / HALF_MS, 0, 1)) : 1
      const from = dugoutOf(defence)
      const placed = {}
      for (const [pos, at] of Object.entries(SPOTS)) placed[pos] = from.clone().lerp(at, jog)
      const pc = pitcherChip(side); pc.position.copy(from.clone().lerp(MOUND, jog)).setY(CHIP * 0.55); chips.add(pc)
      // the on-deck hitter, in the batting club's circle
      const upNow = batterAt(i)
      if (upNow != null) { const nx = (upNow + (b.type === 'half' ? 0 : 1)) % lineup.length; const od = batterChip(side, nx); od.scale.multiplyScalar(0.8); od.position.copy(ondeckOf(side)).setY(CHIP * 0.45); chips.add(od) }
      const addFielders = () => { for (const [pos, at] of Object.entries(placed)) { const sp = fielderChip(side, pos); sp.position.copy(at).setY(CHIP * 0.5); chips.add(sp) } }
      if (b.type === 'half') { addFielders(); return }
      const e = b.e
      const runners = []
      ;(e.before || []).forEach((who, base) => { if (who != null) runners.push({ who, from: base + 1 }) })
      const dest = (who) => { const k = (e.after || []).indexOf(who); return k >= 0 ? k + 1 : (e.scored || []).includes(who) ? 4 : -1 }
      const pitchU = clamp((t - b.t0) / PITCH_MS, 0, 1)
      const isPA = !['SB', 'CS', 'WP', 'ghost'].includes(e.kind)
      ball.visible = false
      // the pitch: a small white streak from the rubber to the plate
      if (isPA && pitchU < 1) { ball.visible = true; ball.position.copy(MOUND.clone().setY(6).lerp(new THREE.Vector3(0, 3, 0), pitchU)) }
      const playMs = Math.max(0, t - b.t0 - (isPA ? PITCH_MS : 0))
      const flyMs = b.fly || 0
      // runners and the batter move over the flight and a little after (a homer: the trot)
      const runSpan = e.kind === 'HR' ? flyMs + 1500 : e.ball ? flyMs + HOLD_MS * 0.7 : e.kind === 'K' ? 1 : 420
      const ru = ease(clamp(playMs / runSpan, 0, 1))
      // the play has happened (the ball is down, the runners have moved): the score bug, the outs and the bases change now
      if (!fx.userData.done && (e.ball ? playMs >= flyMs : playMs >= Math.min(runSpan, 420))) {
        fx.userData.done = true; setUi({ i, hr: e.kind === 'HR', landed: true })
        const name = lastName(lineup[e.bi]?.name || '').toUpperCase()
        if (e.kind === 'HR') paintBoard(snaps[i], ['HOME RUN', name])
        else if (b.walkoff) paintBoard(snaps[i], ['WALK-OFF', `${game[side].team} WINS`])
        else paintBoard(snaps[i])
      }
      // the fielding: the man nearest where the ball ends runs it down; a grounder out goes to first
      throwBall.visible = false
      if (e.ball && e.kind !== 'HR' && playMs > 0) {
        const pos = chaserOf(e), land = pathOf(e).at(-1).clone().setY(0)
        const hit = e.kind !== 'OUT'
        placed[pos] = SPOTS[pos].clone().lerp(land, ease(clamp(playMs / (flyMs + (hit ? 300 : 0)), 0, 1)))
        const gb = e.kind === 'OUT' && (e.how === 'gb' || e.how === 'dp')
        if (gb && pos !== '1B') placed['1B'] = SPOTS['1B'].clone().lerp(BASES[1], ease(clamp(playMs / flyMs, 0, 1)))
        if (gb && playMs > flyMs) {
          const tu = (playMs - flyMs) / THROW_MS
          if (e.how === 'dp' && tu < 1) { throwBall.visible = true; throwBall.position.copy(arcAt(land, BASES[2], tu, 5)) }
          else if (tu < (e.how === 'dp' ? 2 : 1)) { throwBall.visible = true; throwBall.position.copy(arcAt(e.how === 'dp' ? BASES[2] : land, BASES[1], e.how === 'dp' ? tu - 1 : tu, 6)) }
        }
      }
      addFielders()
      // THE WALK-OFF: the dugout empties and the whole club meets at the plate
      if (b.walkoff && playMs > runSpan) {
        const mu = ease(clamp((playMs - runSpan) / 1100, 0, 1)), d0 = dugoutOf(side)
        lineup.forEach((row, k) => {
          const sp = batterChip(side, k), ang = (k / lineup.length) * Math.PI * 2
          const to = new THREE.Vector3(Math.cos(ang) * (5 + (k % 3) * 2.5), 0, Math.sin(ang) * (5 + (k % 3) * 2.5) + 2)
          const p = d0.clone().add(new THREE.Vector3((k % 3 - 1) * 8, 0, (Math.floor(k / 3) - 1) * 6)).lerp(to, mu)
          sp.position.set(p.x, CHIP * 0.55 + (mu >= 1 ? Math.abs(Math.sin(playMs / 110 + k)) * 6 : 0), p.z); chips.add(sp)
        })
      }
      for (const r of runners) {
        const to = dest(r.who)
        const sp = batterChip(side, r.who)
        if (to < 0) { const p = along(r.from, r.from + 1, ru * 0.45); sp.position.set(p.x, CHIP * 0.55, p.z); sp.material.opacity = 1 - ru }
        else { const p = along(r.from, to, ru); sp.position.set(p.x, CHIP * 0.55, p.z); if (to === 4 && ru >= 1) sp.material.opacity = 0 }
        chips.add(sp)
      }
      if (isPA) {
        const bto = dest(e.bi), sp = batterChip(side, e.bi)
        if (bto < 0) {
          const at = boxSpot(side, e.bi)
          if (e.kind === 'OUT' && e.how !== 'air' && e.how !== 'sf') { const p = along(0, 1, ru * 0.6); at.set(p.x, CHIP * 0.55, p.z) }
          sp.position.copy(at); sp.material.opacity = e.kind === 'K' ? 1 - clamp((playMs - 260) / 300, 0, 1) : 1 - clamp(ru * 1.3 - 0.3, 0, 1)
        } else if (playMs <= 0) sp.position.copy(boxSpot(side, e.bi))
        else { const p = along(0, bto, ru); sp.position.set(p.x, CHIP * 0.55, p.z); if (bto === 4 && ru >= 1) sp.material.opacity = 0 }
        chips.add(sp)
      }
      // the ball in play: its real flight, a glowing trail, the landing
      if (e.ball && playMs > 0) {
        const pts = pathOf(e), fu = clamp(playMs / flyMs, 0, 1), n = Math.max(2, Math.round(fu * (pts.length - 1)) + 1)
        setTrail(pts, n, resultInk(e.kind))
        trailMat.opacity = fu < 1 ? 1 : Math.max(0.4, 1 - (playMs - flyMs) / 900)
        trailMat.linewidth = e.kind === 'HR' ? 4.5 : e.kind === 'OUT' ? 2.4 : 3.2
        ball.visible = fu < 1; ball.position.copy(pts[n - 1])
        if (fu >= 1 && !fx.userData.landed) {
          fx.userData.landed = true
          const land = pts.at(-1)
          const p = ringMesh(3, 4.4, resultInk(e.kind), 0.9); p.position.set(land.x, Math.max(0.4, land.y), land.z); p.userData.born = t; fx.add(p)
          if (e.kind === 'HR') { const q = ringMesh(4, 6, C.orange, 1); q.position.copy(p.position); q.userData.born = t; q.userData.big = true; fx.add(q); seedFlashes(e.ball.ang, i + 1); fx.userData.flashAt = t; flashes.visible = true }
        }
        for (const o of fx.children) if (o.userData.born != null) { const age = (t - o.userData.born) / (o.userData.big ? 1600 : 700); o.scale.setScalar(1 + age * (o.userData.big ? 9 : 3)); o.material.opacity = Math.max(0, 1 - age) }
        if (fx.userData.flashAt != null) stepFlashes(t - fx.userData.flashAt)
      }
      // a strikeout or a walk: a pulse at the plate
      if ((e.kind === 'K' || e.kind === 'BB' || e.kind === 'HBP') && playMs > 0 && !fx.userData.pulsed) { fx.userData.pulsed = true; const p = ringMesh(4, 5.2, e.kind === 'K' ? INK[other(side)] : INK[side], 0.9); p.position.set(0, 0.4, 0); p.userData.born = t; fx.add(p) }
      if (!e.ball) for (const o of fx.children) if (o.userData.born != null) { const age = (t - o.userData.born) / 600; o.scale.setScalar(1 + age * 3); o.material.opacity = Math.max(0, 1 - age) }
    }
    const resetFx = () => { fx.userData = {} }
    const _clear = clearFx
    // clearFx resets the per-play flags too
    const clearAll = () => { _clear(); resetFx() }

    // THE OPEN: a fly-in from high over centre field, round the bowl, down to the broadcast angle; the title, then the numbers
    let introAt = null, introDone = false, introPhase = null
    // high and wide of the bowl the whole way (a camera that skims the ribbon board smears it across the frame)
    const path = new THREE.CatmullRomCurve3([[0, 520, 1100], [700, 460, 620], [600, 380, -200], [0, 318, -300]].map((v) => new THREE.Vector3(...v)))
    const endIntro = () => { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null); playingNow = true; last = nowMs() }
    const stepIntro = (t) => {
      if (introAt == null) return
      const u = Math.min(1, (t - introAt) / INTRO_MS), e = ease(u)
      const p = path.getPoint(Math.min(1, e / 0.85))
      if (e >= 0.85) p.lerp(broadcast(), (e - 0.85) / 0.15)
      camera.position.copy(p); camera.lookAt(TARGET)
      const ph = u < 0.56 ? 'title' : 'data'
      if (ph !== introPhase) { introPhase = ph; setIntro(ph) }
      if (u >= 1) endIntro()
    }
    let gt = 0, last = nowMs(), playingNow = false, raf = 0, prevBeat = -1
    const tick = () => {
      const t = nowMs(), dt = Math.min(100, t - last); last = t
      stepIntro(t)
      if (playingNow) {
        gt += dt * speedRef.current
        if (gt >= total) { gt = total - 1; playingNow = false; setPlaying(false) }
      }
      const i = beats.findIndex((b) => gt >= b.t0 && gt < b.t0 + b.dur)
      if (i !== prevBeat) { prevBeat = i; clearAll() }
      draw(gt)
      if (introAt == null) controls.update()
      look.render()
      if (!rec) raf = requestAnimationFrame(tick)
    }
    let onScreen = true
    const io = new IntersectionObserver(([en]) => { if (rec) return; onScreen = en.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = nowMs(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { if (rec) return; cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = nowMs(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    if (!rec) raf = requestAnimationFrame(tick)
    else {
      io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      window.__mlbPreplay = {
        start: () => { api.current.play?.(); setPlaying(true) },
        step: (ms) => { vt += ms; tick() },
        done: () => !playingNow && introDone && gt >= total - 1,
        total: () => INTRO_MS + total,
        // a still at one moment of the game (ms of game time, the open skipped): for checking frames, not for the video
        jump: (ms) => { if (introAt != null || !introDone) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } gt = clamp(ms, 0, total - 1); prevBeat = -1; beatAt = -1; halfAt = null; tick() },
        beats: () => beats.map((x) => ({ t0: x.t0, dur: x.dur, type: x.type, kind: x.e?.kind || null, inning: x.half?.inning ?? null, side: x.half?.side ?? null })),
      }
    }
    api.current = {
      play: () => {
        if (gt >= total - 1) { gt = 0; prevBeat = -1 }
        if (!introDone && gt === 0) { introAt = nowMs(); introPhase = null; controls.enabled = false; return }
        playingNow = true; last = nowMs()
      },
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } },
      skipIntro: () => { if (introAt != null) endIntro() },
      seek: (k) => { gt = beats[clamp(k, 0, beats.length - 1)].t0; prevBeat = -1; beatAt = -1; halfAt = null },
      nextHomer: () => { const k = beats.findIndex((b, j) => j > Math.max(0, beatAt) && b.type === 'play' && b.e.kind === 'HR'); if (k >= 0) { gt = beats[k].t0; prevBeat = -1; beatAt = -1; halfAt = null } },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); trailMat.resolution.set(w, h); if (introAt == null) frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    if (rec) tick()
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      clearAll(); clearChips(); clearMarks(); trailMat.dispose(); glowTex.dispose(); flashGeo.dispose(); throwBall.geometry.dispose()
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [beats, total]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty>This device can&apos;t draw WebGL, so PREPLAY isn&apos;t available here.</ChartEmpty>
  const b = ui.i >= 0 ? beats[ui.i] : null
  const done = b?.type === 'play' && ui.landed
  const score = b ? (b.type === 'play' && !done ? b.before.score : b.score) : { away: 0, home: 0 }
  const half = b?.half || null
  const outs = b?.type === 'play' ? (done ? b.outs : b.before.outs) : 0
  const onBase = b?.type === 'play' ? ((done ? b.e.after : b.e.before) || []).map((x) => x != null) : [false, false, false]
  const lastInning = beats.at(-2)?.half?.inning || 9
  const e = b?.type === 'play' ? b.e : null
  const words = e ? playWords(e, game[half.side].lineup) : half ? `${half.side === 'away' ? 'TOP' : 'BOTTOM'} OF THE ${ordinal(half.inning).toUpperCase()}` : 'Press play: the game, before it is played'
  const curInk = half ? INK[half.side] : C.text3
  const hrRow = e?.kind === 'HR' ? game[half.side].lineup[e.bi] : null
  const hrP = hrRow ? pp.hr.find((h) => String(h.id) === String(hrRow.player_id))?.p : null
  const bugTeam = (s, sc) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mlbTeamLogo(game[s].team, 48)} alt="" width={22} height={22} style={{ display: 'block' }} />
      <b style={{ color: INK[s], fontSize: 12, letterSpacing: 1 }}>{game[s].team}</b>
      <b style={{ color: C.text, fontSize: 20, minWidth: 14, textAlign: 'center' }}>{sc}</b>
    </span>
  )
  const top3 = pp.hr.slice(0, 3)
  return (
    <section aria-label="PREPLAY: the game before it is played" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="group" aria-label="PREPLAY controls" style={{ display: rec ? 'none' : 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.orange, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the simulation'}</button>
        {intro ? <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.orange, C, NUM_FONT)} onClick={() => api.current.skipIntro?.()}>Skip intro</button> : null}
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.orange, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        {beats.some((x) => x.type === 'play' && x.e.kind === 'HR') ? <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.orange, C, NUM_FONT)} onClick={() => api.current.nextHomer?.()}>Next homer</button> : null}
      </div>
      <div data-replay-stage="" style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* SIMULATION, always on the frame: a crop of the video still says what it is */}
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 5, pointerEvents: 'none', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: C.bg, background: C.orange, borderRadius: 3, padding: '2px 6px' }}>PREPLAY · SIMULATION</div>
        {intro ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
            <style>{'@keyframes ppInL{from{transform:translateX(-60px);opacity:0}to{transform:none;opacity:1}}@keyframes ppInR{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}@keyframes ppUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}'}</style>
            {intro === 'title' ? (
              <div style={{ textAlign: 'center', fontFamily: NUM_FONT }}>
                <div style={{ fontSize: 11, letterSpacing: 4, color: C.text2, fontWeight: 800, animation: 'ppUp .5s ease-out both' }}>DASH NETWORK · MOONSHOT</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 3vw, 26px)', marginTop: 10, justifyContent: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'ppInL .55s cubic-bezier(.2,.9,.2,1) both' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mlbTeamLogo(game.away.team, 96)} alt="" width={56} height={56} />
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK.away, letterSpacing: 2 }}>{game.away.team}</b>
                  </span>
                  <span style={{ fontSize: 18, color: C.text3, fontWeight: 900, animation: 'ppUp .5s .25s both' }}>@</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'ppInR .55s cubic-bezier(.2,.9,.2,1) both' }}>
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK.home, letterSpacing: 2 }}>{game.home.team}</b>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mlbTeamLogo(game.home.team, 96)} alt="" width={56} height={56} />
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 10, letterSpacing: 2, animation: 'ppUp .5s .35s both' }}>{[round ? round.toUpperCase() : null, day, 'PREPLAY'].filter(Boolean).join(' · ')}</div>
                <div style={{ fontSize: 11, color: C.text3, marginTop: 6, letterSpacing: 1, animation: 'ppUp .5s .45s both' }}>{lastName(game.home.starter)} ({game.away.team}) vs {lastName(game.away.starter)} ({game.home.team})</div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'clamp(14px, 4vw, 34px)', fontFamily: NUM_FONT, textAlign: 'center', background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '12px clamp(14px, 4vw, 28px)' }}>
                {[[pp.n.toLocaleString('en-US'), 'GAMES SIMULATED'], [pct(pp.winPct[pp.fav]), `${favTeam} WINS`], [pp.modal ? `${Math.max(pp.modal.away, pp.modal.home)}-${Math.min(pp.modal.away, pp.modal.home)}` : '·', 'MOST COMMON FINAL']].map(([v, label], k) => (
                  <div key={label} style={{ animation: `ppUp .45s ${k * 0.12}s both` }}>
                    <div style={{ fontSize: 'clamp(26px, 6vw, 44px)', fontWeight: 900, color: C.text, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: 11, color: C.orange, letterSpacing: 2, fontWeight: 800, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {/* THE END CARD: this run's final, then what the 2,000 runs say, then the promise */}
        {b?.type === 'final' ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 4, background: `${C.bg}d9` }}>
            <div style={{ textAlign: 'center', fontFamily: NUM_FONT, padding: '0 12px' }}>
              <div style={{ fontSize: 12, letterSpacing: 4, color: C.text2, fontWeight: 800 }}>FINAL · SIMULATION{lastInning > 9 ? ` / ${lastInning}` : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(12px, 3vw, 28px)', marginTop: 8 }}>
                {['away', 'home'].map((k, i) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: i ? 'row-reverse' : 'row' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mlbTeamLogo(game[k].team, 96)} alt="" width={52} height={52} />
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: INK[k] }}>{game[k].team}</b>
                    <b style={{ fontSize: 'clamp(26px, 6vw, 48px)', color: C.text }}>{final[k]}</b>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 14, display: 'inline-flex', flexDirection: 'column', gap: 4, background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: C.orange, letterSpacing: 2, fontWeight: 900 }}>IN {pp.n.toLocaleString('en-US')} SIMULATED GAMES</div>
                <div style={{ fontSize: 15, color: C.text, fontWeight: 900 }}>{game[pp.fav].team} wins {pct(pp.winPct[pp.fav])} · {game[other(pp.fav)].team} {pct(pp.winPct[other(pp.fav)])}</div>
                {pp.modal ? <div style={{ fontSize: 13, color: C.text2, fontWeight: 700 }}>Most common final: {game[pp.fav].team} {Math.max(pp.modal.away, pp.modal.home)}-{Math.min(pp.modal.away, pp.modal.home)}</div> : null}
                <div style={{ fontSize: 13, color: C.text2, fontWeight: 700 }}>{pp.total.mean.toFixed(1)} runs a game</div>
                {top3.length ? <div style={{ fontSize: 13, color: C.text2, fontWeight: 700 }}>Most likely to homer: {top3.map((h) => `${lastName(h.name)} ${pct(h.p)}`).join(' · ')}</div> : null}
              </div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 12, letterSpacing: 2, fontWeight: 800 }}>WE GRADE IT AFTER THE GAME · DASH NETWORK · MOONSHOT</div>
            </div>
          </div>
        ) : null}
        {rec ? (
          <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 5, fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.text2, pointerEvents: 'none' }}>
            DASH NETWORK · <span style={{ color: C.orange }}>MOONSHOT</span> · @CalledItHR
          </div>
        ) : null}
        {/* THE SCORE BUG: both clubs, the score, the inning, the outs and who is on */}
        {/* top-left, under the SIMULATION tag: the park's own scoreboard stands over centre field and stays clear */}
        <div style={{ position: 'absolute', top: 34, left: 8, display: intro || b?.type === 'final' ? 'none' : 'flex', alignItems: 'center', gap: 10, background: C.bg2,
          border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 10px', fontFamily: NUM_FONT, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
          {bugTeam('away', score.away)}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 74, justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: C.text2, fontWeight: 800 }}>{half ? `${half.side === 'away' ? '▲' : '▼'}${half.inning}` : '▲1'}</span>
            <svg width="26" height="20" viewBox="0 0 26 20" aria-label="Runners on base">
              {[[13, 4], [21, 11], [5, 11]].map(([x, y], k) => (
                <rect key={k} x={x - 4} y={y - 4} width="8" height="8" transform={`rotate(45 ${x} ${y})`} fill={onBase[[1, 0, 2][k]] ? C.orange : 'none'} stroke={C.text2} strokeWidth="1.2" />
              ))}
            </svg>
            <span style={{ display: 'flex', gap: 3 }} aria-label={`${outs} out`}>
              {[0, 1, 2].map((k) => <span key={k} style={{ width: 6, height: 6, borderRadius: 3, background: k < outs ? C.text : 'transparent', border: `1px solid ${C.text2}` }} />)}
            </span>
          </span>
          {bugTeam('home', score.home)}
        </div>
        {/* THE MOMENT CARD: a homer -- his face, the ball's real numbers, the swing it came from, his chance in the 2,000 runs */}
        {ui.hr && e?.kind === 'HR' ? (
          <div style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', width: 'min(92%, 380px)', zIndex: 6,
            background: C.bg2, border: `1px solid ${curInk}`, borderRadius: 12, padding: 12, fontFamily: NUM_FONT, boxShadow: `0 10px 30px ${C.bg}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mlbHeadshot(hrRow?.player_id, 120)} alt="" width={58} height={58} style={{ display: 'block', borderRadius: '50%', background: C.bg3, border: `2px solid ${curInk}`, flex: '0 0 auto', objectFit: 'cover' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.orange, letterSpacing: 3, lineHeight: 1 }}>HOME RUN</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginTop: 4 }}>{hrRow?.name || ''}{hrRow?.jersey_number != null ? <span style={{ color: curInk }}> #{hrRow.jersey_number}</span> : null}</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{[e.ball?.dist ? `${Math.round(e.ball.dist)} ft` : null, e.ball?.ev ? `${Math.round(e.ball.ev)} mph` : null, e.ball?.la != null ? `${Math.round(e.ball.la)}°` : null, (e.scored?.length || 0) > 1 ? `${e.scored.length} runs score` : null].filter(Boolean).join(' · ')}</div>
                {e.ball?.date ? <div style={{ fontSize: 11, color: C.text3, marginTop: 1 }}>his real swing: {new Date(`${e.ball.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{e.ball.pitcher ? ` vs ${lastName(e.ball.pitcher)}` : ''}</div> : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8, gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{game.away.team} {score.away} · {game.home.team} {score.home}</span>
              {hrP != null ? <span style={{ fontSize: 11, color: C.orange, fontWeight: 800 }}>HOMERS IN {pct(hrP)} OF OUR RUNS</span> : null}
            </div>
          </div>
        ) : null}
        {/* THE TICKER: the play in a few words, in the batting club's colour */}
        <div aria-live="polite" style={{ position: 'absolute', left: 8, right: rec ? 230 : 8, bottom: 8, display: intro || b?.type === 'final' ? 'none' : 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none', zIndex: 5 }}>
          <span style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${curInk}`, borderRadius: 6, padding: '4px 8px',
            fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: e?.kind === 'HR' ? C.text : C.text2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{words}</span>
        </div>
      </div>
      {rec ? null : <input type="range" min={0} max={beats.length - 1} value={Math.max(0, ui.i)} aria-label="Jump through the simulated game"
        onChange={(ev) => api.current.seek?.(Number(ev.target.value))} style={{ width: '100%', minHeight: 44, accentColor: C.orange }} />}
      <div style={{ display: rec ? 'none' : 'block', fontSize: 11, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        PREPLAY · SIMULATION. The simulator played this game {pp.n.toLocaleString('en-US')} times off tonight&apos;s board; this is the first of those runs that ended on the most common final.
        Every ball in play is one of that hitter&apos;s real 2026 batted balls with the same result (spot, exit velo, launch angle). What each at-bat did is simulated.
        {' '}<b style={{ color: INK.away }}>{game.away.team}</b> · <b style={{ color: INK.home }}>{game.home.team}</b>
      </div>
    </section>
  )
}
