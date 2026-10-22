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
import { buildRink, rinkPoint, GOAL_X } from '../../lib/rinkWorld'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { eventWords } from '../../lib/nhl/events'
import { nhlLogo } from '../../lib/nhl/teams'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'

// the two clubs: the product's accent and the rink's own gold (two colours you can tell apart, Donovan 2026-10-22)
const INK = { away: C.ice, home: RINK.kick }
const GAME_S = 30          // game seconds per replay second at 1x: a 60-minute game in about two minutes
const SPEEDS = [[1, '1x'], [4, '4x']]
const SHOW_MS = 1400       // how long a player's disc stays after his event (real time)
const GOAL_HOLD_MS = 2600  // the replay holds this long on a goal (the clock stops on one)
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
  return <ReplayStage data={data} />
}

function ReplayStage({ data }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(speed); speedRef.current = speed
  const [now, setNow] = useState({ i: -1, score: [0, 0] })
  const events = data.events
  const total = useMemo(() => gameSec(events[events.length - 1]) + 1, [events])
  const side = (abbrev) => (abbrev === data.home.abbrev ? 'home' : 'away')

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(C.bg)
    buildRink(scene, { tracking: { floor: new THREE.Color(C.bg3).multiplyScalar(1.45), line: C.text } })
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
    // the puck's drawn path: one faint line from the last event's spot to where the puck is now (never a long history)
    const passGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const pass = new THREE.Line(passGeo, new THREE.LineDashedMaterial({ color: new THREE.Color(C.text), transparent: true, opacity: 0.4, dashSize: 1.6, gapSize: 1.2 }))
    pass.visible = false; scene.add(pass)
    const setPass = (a, b) => { const pa = passGeo.attributes.position; pa.setXYZ(0, a.x, 0.3, a.z); pa.setXYZ(1, b.x, 0.3, b.z); pa.needsUpdate = true; pass.computeLineDistances() }
    const marks = new THREE.Group(); scene.add(marks)
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
      if (e.kind === 'goal') { const p = pulse(Math.sign(e.x || 1) * GOAL_X, 0, C.lamp, 3); add(p, 1600, 'goal') }
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

    // THE CLOCK: replay time -> game seconds; the puck between event i and i+1 (unless play restarted before i+1)
    let gs = 0, last = performance.now(), idx = -1, playingNow = false, holdUntil = 0
    const at = (i) => rinkPoint(events[i].x, events[i].y, 0.4)
    const seek = (g) => {
      gs = Math.max(0, Math.min(total, g)); idx = -1
      while (idx + 1 < events.length && gameSec(events[idx + 1]) <= gs) idx += 1
      for (const m of live) { marks.remove(m.obj) } live.length = 0
      setNow({ i: idx, score: idx >= 0 ? events[idx].score : [0, 0] })
    }
    const tick = () => {
      const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000); last = t
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
        pass.visible = p.distanceTo(from) > 0.5
        if (pass.visible) setPass(from, p)
      }
      fade(t); controls.update(); look.render(); raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = performance.now(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(tick)
    api.current = {
      play: () => { if (gs >= total) seek(0); playingNow = true; last = performance.now() },
      pause: () => { playingNow = false },
      seek,
      nextGoal: () => { const n = events.findIndex((e, i) => i > idx && e.kind === 'goal'); if (n >= 0) seek(gameSec(events[n]) - 4) },
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize?.(w, h); frame() }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      for (const m of live) { m.obj.geometry?.dispose?.(); m.obj.material?.dispose?.() }
      puck.geometry.dispose(); passGeo.dispose()
      controls.dispose(); look.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}
    }
  }, [events, total]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the replay isn&apos;t available here.</ChartEmpty>
  const cur = now.i >= 0 ? events[now.i] : null
  const [as, hs] = now.score
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
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.ice, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.ice, C, NUM_FONT)} onClick={() => api.current.nextGoal?.()}>Next goal</button>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 260, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* THE SCORE BUG: both clubs, the score after the last event shown, the period and the clock */}
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, background: C.bg2,
          border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 10px', fontFamily: NUM_FONT, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {bugTeam(data.away, as, INK.away)}
          <span style={{ fontSize: 11, color: C.text2, fontWeight: 700, minWidth: 64, textAlign: 'center' }}>{cur ? clockText(cur, data.gameType) : 'P1 20:00'}</span>
          {bugTeam(data.home, hs, INK.home)}
        </div>
        {/* A GOAL: the scorer's face and name, big, for as long as the goal is the last thing that happened */}
        {cur?.kind === 'goal' ? (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
            background: C.bg2, border: `1px solid ${curInk}`, borderRadius: 10, padding: '8px 14px 8px 8px', fontFamily: NUM_FONT }}>
            {data.players?.[cur.who]?.face ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.players[cur.who].face} alt="" width={52} height={52} style={{ display: 'block', borderRadius: '50%', background: C.bg3, border: `2px solid ${curInk}` }} />
            ) : null}
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.lamp, letterSpacing: 2, lineHeight: 1 }}>GOAL</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginTop: 3 }}>{data.players?.[cur.who]?.name || ''}</div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 1 }}>{data.away.abbrev} {as} · {data.home.abbrev} {hs}</div>
            </div>
          </div>
        ) : null}
        {/* THE TICKER: the last event in a few words, in the colour of the club that did it */}
        <div aria-live="polite" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
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
