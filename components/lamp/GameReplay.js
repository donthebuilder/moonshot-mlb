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
import { C, NUM_FONT, RINK, DOME } from '../../lib/nhl/theme'
import { rinkPoint, roundedRect, GOAL_X, RINK_L, RINK_W, RINK_R, BLUE_X } from '../../lib/rinkWorld'
import { isCoarse } from '../../lib/stadiumLook'
import { makeTabletopLook } from '../../lib/tabletop/look'
import { buildDomeHockey, makeSkater, slotsFor, onSlot } from '../../lib/tabletop/domeHockey'
import CLUB_COLORS from '../../lib/data/nhlClubColors.json'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { eventWords, powerPlayAt, penaltyStretches } from '../../lib/nhl/events'
import { nhlLogo } from '../../lib/nhl/teams'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'
import CallStatusBadge from '../CallStatusBadge'
import { ordinal, surname } from '../../lib/format'
import { preplayNhl } from '../../lib/nhl/preplay'
import PREPLAY_CAL from '../../lib/nhl/preplayV1'
import { preplayGameInput } from '../../lib/nhl/preplayInput'

// the two clubs: the product's accent and the rink's own gold (two colours you can tell apart, Donovan 2026-10-22)
const INK = { away: C.ice, home: RINK.kick }
const GAME_S = 30          // game seconds per replay second at 1x: a 60-minute game in about two minutes
const SPEEDS = [[1, '1x'], [2.5, '2.5x'], [4, '4x']]   // 2.5x opens (Donovan 2026-10-22: "2.5 ... I think that's the best one")
const SHOW_MS = 1400       // how long a player's disc stays after his event (real time)
const GOAL_HOLD_MS = 2600  // the replay holds this long on a goal (the clock stops on one)
const INTRO_MS = 7600      // THE OPEN: the DASH sting, low inside the dome at centre ice, up to the tower, the puck drops
const PERIOD_S = 1200
const gameSec = (e) => (e.period - 1) * PERIOD_S + e.t
// the box: the rink is 200 x 85 ft, so a wide screen gets a wide box (no empty band above and below); a phone a taller one
const boxH = (w, rec = false) => (rec ? Math.round(w * 9 / 16) : Math.max(260, Math.round(w * (w < 640 ? 0.66 : 0.42))))
const pName = (players, id) => { const n = players?.[id]?.name; return n ? n.split(' ').slice(-1)[0] : '' }

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
  const [rec, setRec] = useState(false)   // ?record=1: the video layout (16:9, no controls, a stepped clock a recorder drives)
  useEffect(() => { setOn(lookParam() === 'tracking'); try { setRec(new URLSearchParams(window.location.search).get('record') === '1') } catch { /* no window */ } }, [])
  const id = game?.id
  // PREPLAY (2026-10-22): a game before puck drop -- or any game with ?preplay=1 -- plays one of the simulator's 2,000
  // runs (lib/nhl/preplay.js) instead of the league's play-by-play
  const [forcePre, setForcePre] = useState(false)
  useEffect(() => { try { setForcePre(new URLSearchParams(window.location.search).get('preplay') === '1') } catch { /* no window */ } }, [])
  const pre = on && (forcePre || game?.state === 'pre')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!on || !id || pre) return undefined
    let live = true
    fetch(`/api/lamp/gameplay?id=${id}`).then((r) => r.json()).then((j) => { if (!live) return; if (j?.error) setErr(j.error); else setData(j) })
      .catch(() => { if (live) setErr('LIVE DATA DELAYED') })
    return () => { live = false }
  }, [on, id, pre])
  if (!on) return null
  if (pre) return <PreplayLoader game={game} rec={rec} />
  if (err) return <ChartEmpty theme={C}>The replay is waiting on the league feed ({err}).</ChartEmpty>
  if (!data) return <ChartEmpty theme={C}>Loading the game&apos;s events…</ChartEmpty>
  if (!data.events?.length) return <ChartEmpty theme={C}>No events on the ice yet. The replay starts at puck drop.</ChartEmpty>
  return <ReplayStage data={data} goals={game?.goals || []} rec={rec} />
}

/** PREPLAY's data: tonight's goal board game, both rosters (numbers, faces) and every skater's real shots, all from
 *  LAMP's own public routes; then 2,000 runs and the game to show. Nothing is drawn until every piece has answered. */
function PreplayLoader({ game, rec }) {
  const [out, setOut] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let live = true
    const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
    ;(async () => {
      const board = await j(`/api/lamp/board?date=${encodeURIComponent(game.date)}`)
      const bg = (board?.games || []).find((x) => String(x.game?.id) === String(game.id))
      if (!bg) throw new Error('not on the board')
      const [ra, rh] = await Promise.all([game.away.abbrev, game.home.abbrev].map((t) => j(`/api/lamp/team?team=${t}`).then((x) => x.roster || []).catch(() => [])))
      const ids = [...new Set((bg.rows || []).map((r) => Number(r.playerId)).filter(Boolean))]
      const shots = {}
      for (let k = 0; k < ids.length; k += 6) {
        await Promise.all(ids.slice(k, k + 6).map((pid) => j(`/api/lamp/shots?player=${pid}&season=both`).then((x) => { shots[pid] = x?.all?.recent || [] }).catch(() => { shots[pid] = [] })))
      }
      const input = preplayGameInput({ board: bg, rosters: { away: ra, home: rh }, shots })
      if (!input) throw new Error('no team projection for this game yet')
      const pp = preplayNhl(input.G)
      if (!pp?.typical) throw new Error('the simulator could not settle this game')
      const events = pp.typical.log.filter((e) => e.kind !== 'shootout')
      return { pp, data: { id: game.id, date: game.date, gameType: Number(bg.game?.gameType) || 2, away: { abbrev: game.away.abbrev }, home: { abbrev: game.home.abbrev }, players: input.players, events, state: 'preplay' }, G: input.G }
    })().then((x) => { if (live) setOut(x) }).catch((e) => { if (live) setErr(e?.message || 'LIVE DATA DELAYED') })
    return () => { live = false }
  }, [game.id, game.date]) // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <ChartEmpty theme={C}>PREPLAY is waiting on tonight&apos;s board ({err}).</ChartEmpty>
  if (!out) return <ChartEmpty theme={C}>Running the game 2,000 times…</ChartEmpty>
  return <ReplayStage data={out.data} rec={rec} sim={out.pp} />
}

function ReplayStage({ data, goals = [], rec = false, sim = null }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  // a simulated game has only its shots and goals, so it runs faster between them (4x opens)
  const [speed, setSpeed] = useState(sim ? 4 : 2.5)
  const speedRef = useRef(speed); speedRef.current = speed
  const [now, setNow] = useState({ i: -1, score: [0, 0] })
  const [intro, setIntro] = useState(null)   // the open: 'title' (the fly-in), 'data' (the numbers light up), or null
  const [gsUi, setGsUi] = useState(0)        // the game clock as the replay runs (the score bug ticks between events)
  const [done, setDone] = useState(false)     // the final horn: the end card shows
  // ONE END EACH, ALL GAME (2026-10-23, the bubble dome: its figures ride fixed slots, so the home club always defends -x).
  // The clubs switch ends every period on a real rink; a period where the home club shot at -x is turned round (x and y
  // both), so every spot stays where it was relative to its net.
  const events = useMemo(() => {
    const flipP = {}
    for (const e of data.events) if (['sog', 'goal', 'miss'].includes(e.kind) && e.team) flipP[e.period] = (flipP[e.period] || 0) + Math.sign(e.x || 0) * (e.team === data.home.abbrev ? 1 : -1)
    return data.events.map((e) => ((flipP[e.period] || 0) < 0 ? { ...e, x: -e.x, y: -e.y } : e))
  }, [data])
  const total = useMemo(() => gameSec(events[events.length - 1]) + 1, [events])
  const side = (abbrev) => (abbrev === data.home.abbrev ? 'home' : 'away')
  const otherClub = (abbrev) => (abbrev === data.home.abbrev ? data.away.abbrev : data.home.abbrev)
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
    if (sim) {
      const fav = data[sim.fav].abbrev, m = sim.modal
      return [[sim.n.toLocaleString('en-US'), 'GAMES SIMULATED'],
        // the win share only once the simulator has passed its measured gate (lib/nhl/preplayV1.js measured); until then the count
        PREPLAY_CAL.measured ? [`${Math.round(sim.winPct[sim.fav] * 100)}%`, `${fav} WINS`] : [Math.round(sim.winPct[sim.fav] * sim.n).toLocaleString('en-US'), `${fav} WINS OF ${sim.n.toLocaleString('en-US')}`], // allow-probability: shown only past the calibration gate
        [m ? `${Math.max(m.away, m.home)}-${Math.min(m.away, m.home)}` : '·', 'MOST COMMON FINAL']]
    }
    return [[events.length, 'EVENTS'], [n(['sog', 'goal']), 'SHOTS ON GOAL'], [n(['hit']), 'HITS']]
  }, [events, sim]) // eslint-disable-line react-hooks/exhaustive-deps
  const goalLabel = (e) => {
    const secs = (mmss) => { const m = /^(\d+):(\d{2})$/.exec(String(mmss || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
    const g = goals.find((x) => String(x.scorer?.id) === String(e.who) && Number(x.period) === e.period && Math.abs((secs(x.time) ?? -99) - e.t) <= 10)
    return g?.label || null
  }

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    // THE CLOCK THE REPLAY READS: the wall clock, or in record mode a stepped one the recorder moves frame by frame
    let vt = 0
    const nowMs = () => (rec ? vt : performance.now())
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W, rec)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(C.bg)
    const camera = new THREE.PerspectiveCamera(32, W / H, 1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    // THE WORLD (2026-10-23): the bubble-dome table (lib/tabletop/domeHockey.js) -- the printed rink, the slots, the boards,
    // the cabinet and its rods, the clear dome and its scoreboard tower
    const club = (k) => ({ abbrev: data[k].abbrev, ...(CLUB_COLORS.clubs[data[k].abbrev] || {}) })
    const rink = buildDomeHockey(scene, renderer, { home: club('home'), away: club('away') })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.42; controls.minDistance = 60; controls.maxDistance = 420
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    // THE BROADCAST CAMERA: high over one side, the whole sheet in frame; a tall phone box pulls back along the same line
    const frame = () => {
      // a little wider than the sheet, so the first tier and the ribbon board frame it
      const pull = Math.max(1, 2.2 / camera.aspect) * 1.02
      // (low enough that the scoreboard tower sits above the far boards, never over the ice)
      camera.position.set(0, 112 * pull, 132 * pull); controls.target.set(0, 0, 6); controls.update()
    }
    frame()
    const look = makeTabletopLook(renderer, scene, camera, W, H)

    // the puck, its trail, the marks
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.45, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(DOME.cabinet), roughness: 0.35, metalness: 0.3 }))
    puck.position.y = 0.4; puck.visible = false; puck.castShadow = true; scene.add(puck)

    // THE FIGURES: six a club on their slots (home in its colour, visitors in white, as on a game night), every base in
    // LAMP's ice. Each turns on its rod to face the puck and slides along its slot after it, the way the toy plays; the man
    // an event is about is swapped onto his slot wearing his real number, and a shot spins him on his rod.
    const kit = (k) => {
      const c = CLUB_COLORS.clubs[data[k].abbrev] || {}
      return k === 'home'
        ? { jersey: c.color || C.ice, pants: c.alt || DOME.cabinet, helmet: c.color || C.ice, numInk: DOME.boards }
        : { jersey: DOME.boards, pants: c.color || DOME.cabinet, helmet: c.color || DOME.cabinet, numInk: c.color || DOME.cabinet }
    }
    const roster = { home: [], away: [] }
    for (const k of ['home', 'away']) {
      slotsFor(k === 'home' ? -1 : 1, k === 'home' ? 1 : -1).forEach((sl) => {
        const f = makeSkater({ ...kit(k), accent: C.ice, pose: sl[0] === 'G' ? 'goalie' : 'stride' })
        scene.add(f); const mid = onSlot(sl, 0, 0)
        roster[k].push({ slot: sl, blank: f, fig: f, spin: 0, x: mid.x, y: mid.y })
      })
    }
    const numCache = new Map()
    const wear = (k, j, num) => {
      const r = roster[k][j]
      let f = r.blank
      if (num != null) {
        const key = `${k}|${num}|${j}`
        f = numCache.get(key)
        if (!f) { f = makeSkater({ ...kit(k), accent: C.ice, num, pose: r.slot[0] === 'G' ? 'goalie' : 'stride' }); f.visible = false; numCache.set(key, f); scene.add(f) }
      }
      if (r.fig !== f) { r.fig.visible = false; f.visible = true; r.fig = f }
    }
    const actorOf = (k, x, y, goalie = false) => {
      let best = 0, bd = Infinity
      roster[k].forEach((r, j) => { if (goalie !== (r.slot[0] === 'G')) return; const d = onSlot(r.slot, x, y).d; if (d < bd) { bd = d; best = j } })
      return best
    }
    const moveFigures = (px, py, dt) => {
      for (const k of ['home', 'away']) for (const r of roster[k]) {
        const tgt = onSlot(r.slot, px, py), sp = 75 * dt, dx = tgt.x - r.x, dy = tgt.y - r.y, d = Math.hypot(dx, dy)
        if (d > sp) { r.x += (dx / d) * sp; r.y += (dy / d) * sp } else { r.x = tgt.x; r.y = tgt.y }
        if (r.spin > 0) r.spin = Math.max(0, r.spin - dt * 16)
        r.fig.position.copy(rinkPoint(r.x, r.y, 0))
        r.fig.rotation.y = Math.atan2(py - r.y, px - r.x) + r.spin
      }
    }
    moveFigures(0, 0, 10)   // on their slots, facing the dot
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
    // WHERE A SHOT ENDS (Donovan 2026-10-22: "the puck got shot through the goal and it wasn't a goal"): a save stops at
    // the goalie, in front of the crease; a miss goes by the post on its side, off the iron or over the bar, as the feed's
    // reason says; only a goal goes into the net.
    const shotEnd = (e) => {
      const sx = Math.sign(e.x || 1), why = String(e.reason || '')
      if (e.kind === 'goal') return rinkPoint(sx * (GOAL_X + 1.2), Math.max(-2, Math.min(2, e.y * 0.08)), 1.2)
      if (e.kind === 'sog') return rinkPoint(sx * (GOAL_X - 3.2), Math.max(-2, Math.min(2, e.y * 0.12)), 1.4)
      const side = /left/.test(why) ? 1 : /right/.test(why) ? -1 : Math.sign(e.y || 1)
      if (/post/.test(why)) return rinkPoint(sx * GOAL_X, side * 3, 1.8)
      if (/crossbar/.test(why)) return rinkPoint(sx * GOAL_X, 0, 4)
      if (/high|over/.test(why)) return rinkPoint(sx * (GOAL_X + 2), 0, 6.5)
      return rinkPoint(sx * (GOAL_X + 1), side * 5, 0.6)   // wide, or a reason the feed left out
    }
    const shotLine = (e, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([rinkPoint(e.x, e.y, 0.3), shotEnd(e)]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: e.kind === 'goal' ? 1 : 0.7 }))
    const pulse = (x, y, color, r0 = 1.5) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.position.copy(rinkPoint(x, y, 0.08)); return m
    }
    const add = (obj, life, kind) => { marks.add(obj); live.push({ obj, born: nowMs(), life, kind }) }
    const showEvent = (e) => {
      const ink = INK[side(e.team)]
      const otherInk = INK[side(e.team) === 'home' ? 'away' : 'home']
      void otherInk
      // the man this is about: the figure whose slot runs nearest the spot, in his real number, on the spot
      if (e.team) {
        const k = side(e.team), j = actorOf(k, e.x, e.y), r = roster[k][j], on = onSlot(r.slot, e.x, e.y)
        wear(k, j, data.players?.[e.who]?.num ?? null); r.x = on.x; r.y = on.y
        if (e.kind === 'sog' || e.kind === 'goal' || e.kind === 'miss') r.spin = Math.PI * 2
      }
      if (e.kind === 'faceoff') add(pulse(e.x, e.y, C.text, 2), 700, 'pulse')
      if (e.kind === 'sog' || e.kind === 'miss' || e.kind === 'goal') add(shotLine(e, ink), e.kind === 'goal' ? 1800 : 650, 'line')
      // the goalie: on a save or a goal his chip shows in the crease (goalieInNetId from the feed)
      if ((e.kind === 'sog' || e.kind === 'goal') && e.vs && data.players?.[e.vs]) {
        const gk = side(e.team) === 'home' ? 'away' : 'home'; wear(gk, actorOf(gk, e.x, e.y, true), data.players[e.vs].num)
        if (e.kind === 'sog') add(pulse(Math.sign(e.x || 1) * (GOAL_X - 3.2), 0, C.text, 1.2), 450, 'pulse')
      }
      if (e.kind === 'goal') { const sx = Math.sign(e.x || 1), p = pulse(sx * GOAL_X, 0, C.lamp, 3); add(p, 1600, 'goal'); rippleNet(sx, nowMs()); kick(sx * (GOAL_X - 2), 0, 26, 1.3) }
      if (e.kind === 'hit') kick(e.x, e.y, 22, 1.1)
      if (e.kind === 'block' || e.kind === 'takeaway') kick(e.x, e.y, 10, 0.7)
      if (e.kind === 'hit' || e.kind === 'takeaway' || e.kind === 'giveaway' || e.kind === 'block') add(pulse(e.x, e.y, ink, 1.2), 450, 'pulse')
    }
    const fade = (t) => {
      for (let k = live.length - 1; k >= 0; k -= 1) {
        const m = live[k], age = (t - m.born) / m.life
        if (age >= 1) { marks.remove(m.obj); m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.(); live.splice(k, 1); continue }
        const o = m.obj.material
        if (m.kind === 'pulse' || m.kind === 'goal') { m.obj.scale.setScalar(1 + age * (m.kind === 'goal' ? 4 : 2.5)); o.opacity = 1 - age }
        else if (m.kind === 'line') o.opacity = (o.userData.o0 ??= o.opacity) * (1 - age)
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
      void pts   // (the dome table has no penalty box: the man-up zone on the ice says it)
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
          if (!boxed.has(k)) { const d = new THREE.Object3D(); d.material = { dispose() {} }; boxed.set(k, d) }
          const n = [...boxed.keys()].filter((j) => side(penalties[j].team) === sideKey).indexOf(k)
          boxed.get(k).position.copy(rinkPoint(boxAt[sideKey] - 3 + n * 4.5, BOX_Y, 2.6))
        } else if (boxed.has(k)) { const d = boxed.get(k); scene.remove(d); d.material.dispose(); boxed.delete(k) }
      })
      for (const sideKey of ['away', 'home']) boxFill[sideKey].material.opacity = 0
      // the man advantage: from the strength code of the last event shown
      const cur = idx >= 0 ? events[idx] : null, pp = powerPlayAt(cur)
      for (const sx of [-1, 1]) ppZones[sx].visible = false
      if (pp && cur) {
        const sx = attackSign(cur.period, data[pp].abbrev), z = ppZones[sx]
        z.visible = true; z.material.color.set(INK[pp]); z.material.opacity = 0.04 + 0.035 * (0.5 + 0.5 * Math.sin(t / 380))
      }
    }

    // THE CLOCK: replay time -> game seconds; the puck between event i and i+1 (unless play restarted before i+1)
    let gs = 0, last = nowMs(), idx = -1, playingNow = false, holdUntil = 0, uiAt = 0
    const at = (i) => rinkPoint(events[i].x, events[i].y, 0.4)
    const seek = (g) => {
      gs = Math.max(0, Math.min(total, g)); idx = -1
      while (idx + 1 < events.length && gameSec(events[idx + 1]) <= gs) idx += 1
      for (const m of live) { marks.remove(m.obj) } live.length = 0
      resetTail()
      setNow({ i: idx, score: idx >= 0 ? events[idx].score : [0, 0] }); setDone(false); rink.setScore(...(idx >= 0 ? events[idx].score : [0, 0]))
    }
    // THE OPEN (Donovan 2026-10-22: "a video game first and then next gen stats ... welcome to the world ... boom"): the
    // camera comes in low behind one net, sweeps round the rink and settles on the broadcast angle; the title, then the
    // game's numbers, ride on top; then the puck drops at centre ice and play starts.
    let introAt = null, introDone = false, introPhase = null
    // THE OPEN (2026-10-23, Donovan: "yes to the puck drop"): the DASH sting; low inside the dome at centre ice, the two
    // centres squared up on the dot, the camera circling them; tilt up the dome to the scoreboard tower; the puck drops
    // through the hole, the camera riding it down and out to the broadcast angle; it lands, the ice sprays, play starts.
    const ease2 = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)
    const endIntro = (t) => {
      introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null)
      kick(0, 0, 30, 1.2); add(pulse(0, 0, C.text, 2), 900, 'pulse')
      playingNow = true; last = t
    }
    const stepIntro = (t) => {
      if (introAt == null) return
      const u = Math.min(1, (t - introAt) / INTRO_MS)
      const pull = Math.max(1, 2.2 / camera.aspect) * 1.02
      const broadcast = new THREE.Vector3(0, 112 * pull, 132 * pull)
      if (u < 0.5) {
        // circling the faceoff, low: a slow quarter turn round the dot
        const a = -0.9 + ease2(clamp01((u - 0.12) / 0.38)) * 1.4
        camera.position.set(Math.cos(a) * 30, 7, Math.sin(a) * 30 + 6); camera.lookAt(0, 3.5, 0)
        look.focus.set(0, 3, 0); puck.visible = false
      } else if (u < 0.72) {
        // tilt up: the tower at the top of the dome, the puck waiting in its hole
        // (looking up at the tower's face from the near side of the ice, the puck waiting in the hole under it)
        const f = ease2((u - 0.5) / 0.22)
        camera.position.set(-20 + f * 8, 7 + f * 12, 26 + f * 6); camera.lookAt(0, 3.5 + f * 44, 0)
        puck.visible = true; puck.position.copy(rink.towerTop); look.focus.copy(rink.towerTop)
      } else {
        // the drop: the puck falls (gravity), the camera rides it down and out to the broadcast angle
        const f = (u - 0.72) / 0.28, fall = Math.min(1, f * 1.25)
        puck.visible = true; puck.position.set(0, rink.towerTop.y - (rink.towerTop.y - 0.4) * fall * fall, 0)
        const g = ease2(f)
        camera.position.lerpVectors(new THREE.Vector3(-12, 19, 32), broadcast, g); camera.lookAt(0, puck.position.y * (1 - g), 6 * g)
        look.focus.copy(puck.position)
      }
      const ph = u < 0.12 ? 'ident' : u < 0.62 ? 'title' : 'data'
      if (ph !== introPhase) { introPhase = ph; setIntro(ph) }
      if (u >= 1) endIntro(t)
    }
    const clamp01 = (v) => Math.max(0, Math.min(1, v))
    const tick = () => {
      const t = nowMs(), dt = Math.min(0.1, (t - last) / 1000); last = t
      stepIntro(t)
      if (playingNow && t >= holdUntil) {
        gs += dt * GAME_S * speedRef.current
        let moved = false
        while (idx + 1 < events.length && gameSec(events[idx + 1]) <= gs) {
          idx += 1; showEvent(events[idx]); moved = true
          // the clock stops on a goal: the replay holds on it too, so the goal can be seen before the next faceoff
          if (events[idx].kind === 'goal') { holdUntil = t + GOAL_HOLD_MS; gs = gameSec(events[idx]); break }
        }
        if (moved) { setNow({ i: idx, score: events[idx].score }); rink.setScore(...events[idx].score) }
        if (gs >= total) { playingNow = false; setPlaying(false); setDone(true) }
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
        // the event before only when the puck plausibly carried from it (a long cross-ice jump reads as an error, not a pass)
        const prev0 = idx > 0 && !cur.fresh ? at(idx - 1) : null
        const prev = prev0 && prev0.distanceTo(from) < 55 ? prev0 : null
        if (p.distanceTo(from) > 0.5 || prev) setTail([...(prev ? [prev] : []), from, p]); else resetTail()
      }
      stepSpray(dt); stepRipple(t); stepBox(gs, t)
      if (introAt == null) moveFigures(puck.visible ? puck.position.x : 0, puck.visible ? -puck.position.z : 0, dt)
      look.focus.copy(puck.visible ? puck.position : new THREE.Vector3())
      if (t - uiAt > 200) { uiAt = t; setGsUi(gs) }
      fade(t); if (introAt == null) controls.update(); look.render(); if (!rec) raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([e]) => { if (rec) return; onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = nowMs(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { if (rec) return; cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = nowMs(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    if (!rec) raf = requestAnimationFrame(tick)
    else {
      // THE RECORDER'S HANDLE (scripts/record-replay.mjs): start, then step the clock one frame at a time and grab each frame
      io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      window.__lampReplay = {
        start: () => { api.current.play?.(); setPlaying(true) },
        step: (ms) => { vt += ms; tick() },
        done: () => gs >= total && !playingNow,
        // a still at one moment (game seconds; the open skipped): for checking frames, not for the video
        jump: (g) => { if (introAt != null || !introDone) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } seek(g); playingNow = false; tick(); moveFigures(puck.position.x, -puck.position.z, 10); look.render() },
        // a still of the open at u (0..1), for checking frames
        openAt: (u) => { introAt = nowMs() - u * INTRO_MS; introDone = false; stepIntro(nowMs()); look.render(); introAt = null },
        goals: () => events.filter((e) => e.kind === 'goal').map((e) => gameSec(e)),
        total: () => total,
      }
    }
    api.current = {
      play: () => {
        if (gs >= total) seek(0)
        if (!introDone && gs === 0) { introAt = nowMs(); introPhase = null; controls.enabled = false; return }
        playingNow = true; last = nowMs()
      },
      skipIntro: () => { if (introAt != null) endIntro(nowMs()) },
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; introDone = true; controls.enabled = true; frame(); setIntro(null) } },
      seek,
      nextGoal: () => { const n = events.findIndex((e, i) => i > idx && e.kind === 'goal'); if (n >= 0) seek(gameSec(events[n]) - 4) },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      for (const m of live) { m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() }
      puck.geometry.dispose(); tailGeo.dispose(); sprayGeo.dispose(); for (const d of boxed.values()) d.material.dispose()
      controls.dispose(); look.dispose?.(); rink.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
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
      <div role="group" aria-label="Replay controls" style={{ display: rec ? 'none' : 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.ice, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the game'}</button>
        {intro ? <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.ice, C, NUM_FONT)} onClick={() => api.current.skipIntro?.()}>Skip intro</button> : null}
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.ice, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.ice, C, NUM_FONT)} onClick={() => api.current.nextGoal?.()}>Next goal</button>
      </div>
      <div data-replay-stage="" style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* THE OPEN'S CARDS: the title while the camera flies in, then the game's numbers (counted from the events) */}
        {intro ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
            <style>{'@keyframes lampInL{from{transform:translateX(-60px);opacity:0}to{transform:none;opacity:1}}@keyframes lampInR{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}@keyframes lampUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}@keyframes lampSting{0%{transform:scale(2.4);opacity:0;filter:blur(6px)}35%{transform:scale(.94);opacity:1;filter:none}55%{transform:scale(1.02)}100%{transform:scale(1)}}@keyframes lampBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
            {intro === 'ident' ? (
              // the network's own open, as on MOONSHOT's and TUDDY's
              <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-512.png" alt="" width={120} height={120} style={{ display: 'block', borderRadius: 26, animation: 'lampSting .9s cubic-bezier(.2,.9,.2,1) both' }} />
                <div style={{ width: 140, height: 3, background: C.ice, transformOrigin: 'left', animation: 'lampBar .5s .35s ease-out both' }} />
                <div style={{ fontFamily: NUM_FONT, fontSize: 18, fontWeight: 900, letterSpacing: 8, color: C.text, animation: 'lampUp .45s .45s both' }}>{sim ? 'PREPLAY' : 'REPLAY'}</div>
              </div>
            ) : intro === 'title' ? (
              // a lower third, so the shot behind it shows (the faceoff, the tower, the drop)
              <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', textAlign: 'left', fontFamily: NUM_FONT }}>
                <div style={{ width: 120, height: 3, background: C.ice, transformOrigin: 'left', animation: 'lampBar .5s ease-out both' }} />
                <div style={{ fontSize: 11, letterSpacing: 4, color: C.text, fontWeight: 900, marginTop: 6, animation: 'lampUp .5s ease-out both' }}>DASH NETWORK · LAMP · {sim ? 'PREPLAY' : 'REPLAY'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 16px)', marginTop: 6 }}>
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
                <div style={{ fontSize: 12, color: C.text, marginTop: 6, letterSpacing: 2, fontWeight: 700, animation: 'lampUp .5s .35s both' }}>{data.date || ''}{sim ? ' · SIMULATION' : ''}</div>
              </div>
            ) : (
              <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', display: 'flex', gap: 'clamp(14px, 4vw, 34px)', fontFamily: NUM_FONT, textAlign: 'left', background: C.bg2, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${C.ice}`, borderRadius: 8, padding: '10px clamp(12px, 3vw, 22px)' }}>
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
        {/* THE END CARD: the final, both clubs, the brand (on the site and as the video's last frames) */}
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 4, background: `${C.bg}cc` }}>
            <div style={{ textAlign: 'center', fontFamily: NUM_FONT }}>
              <div style={{ fontSize: 12, letterSpacing: 4, color: C.text2, fontWeight: 800 }}>FINAL{sim ? ' · SIMULATION' : ''}{sim?.typical?.game?.last === 'SO' ? ' / SO' : events[events.length - 1]?.pt === 'OT' ? ' / OT' : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 28px)', marginTop: 10 }}>
                {(sim ? [['away', sim.typical.game.away], ['home', sim.typical.game.home]] : [['away', as], ['home', hs]]).map(([k, sc], i) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: i ? 'row-reverse' : 'row' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={nhlLogo(data[k].abbrev, true)} alt="" width={60} height={60} />
                    <b style={{ fontSize: 'clamp(30px, 7vw, 56px)', color: INK[k] }}>{data[k].abbrev}</b>
                    <b style={{ fontSize: 'clamp(30px, 7vw, 56px)', color: C.text }}>{sc}</b>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 12, letterSpacing: 2 }}>{data.date || ''} · {sim ? 'PREPLAY' : 'REPLAY'} · DASH NETWORK · LAMP</div>
              {sim ? (
                <div style={{ marginTop: 12, display: 'inline-flex', flexDirection: 'column', gap: 4, background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 14px', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: C.ice, letterSpacing: 2, fontWeight: 900 }}>IN {sim.n.toLocaleString('en-US')} SIMULATED GAMES</div>
                  {sim.modal ? <div style={{ fontSize: 14, color: C.text, fontWeight: 900 }}>Most common final: {data[sim.fav].abbrev} {Math.max(sim.modal.away, sim.modal.home)}-{Math.min(sim.modal.away, sim.modal.home)}</div> : null}
                  <div style={{ fontSize: 13, color: C.text2, fontWeight: 700 }}>{data[sim.fav].abbrev} wins {PREPLAY_CAL.measured ? `${Math.round(sim.winPct[sim.fav] * 100)}%` : `${Math.round(sim.winPct[sim.fav] * sim.n).toLocaleString('en-US')} of ${sim.n.toLocaleString('en-US')}`} · past 60 minutes in {Math.round(sim.ot * sim.n).toLocaleString('en-US')}</div>{/* allow-probability: the share only past the calibration gate */}
                  <div style={{ fontSize: 13, color: C.text2, fontWeight: 700 }}>On the scoresheet most: {sim.scorers.slice(0, 3).map((x) => surname(data.players?.[x.id]?.name)).filter(Boolean).join(' · ')}</div>
                  <div style={{ fontSize: 12, color: C.text2, letterSpacing: 2, fontWeight: 800, marginTop: 4 }}>WE GRADE IT AFTER THE GAME</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {/* SIMULATION, on every frame of a PREPLAY: a crop of the video still says what it is */}
        {sim ? <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 5, pointerEvents: 'none', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, letterSpacing: 2, color: C.bg, background: C.ice, borderRadius: 3, padding: '2px 6px' }}>PREPLAY · SIMULATION</div> : null}
        {rec ? (
          <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 5, fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.text2, pointerEvents: 'none' }}>
            DASH NETWORK · <span style={{ color: C.ice }}>LAMP</span> · @CalledItHR
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
      {rec ? null : <input type="range" min={0} max={events.length - 1} value={Math.max(0, now.i)} aria-label="Jump through the game"
        onChange={(e) => api.current.seek?.(gameSec(events[Number(e.target.value)]))} style={{ width: '100%', minHeight: 44, accentColor: C.ice }} />}
      <div style={{ display: rec ? 'none' : 'block', fontSize: 11, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        {sim ? <>PREPLAY · SIMULATION. One of {sim.n.toLocaleString('en-US')} runs of this game, the first to land on the most common final: each club&apos;s goals and shots from LAMP&apos;s team model, who shoots from each skater&apos;s shots a game, every shot from one of his real spots this season or last. The puck&apos;s path between shots is drawn.</> : <>REPLAY · {events.length} events from the NHL&apos;s play-by-play: every disc is a real event, where and when it happened. The puck&apos;s path between events is drawn.</>}
        {' '}<b style={{ color: INK.away }}>{data.away.abbrev}</b> · <b style={{ color: INK.home }}>{data.home.abbrev}</b>
      </div>
    </section>
  )
}
