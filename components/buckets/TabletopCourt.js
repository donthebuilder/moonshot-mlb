'use client'
// 🏀 THE GAME ON THE TIN COURT (2026-10-23, BUCKETS; v2 after Donovan: "there was no jump ball, there was no first basket.
// I didn't see any called picks ... go with the figurine ones but make the figurines move around, be more active").
// The whole game from ESPN's play-by-play (lib/nba/plays.js gameFromSummary) on the lithographed tin court
// (lib/tabletop/tinCourt.js), directed by lib/tabletop/tinDirector.js:
//   the opening tip (the real jumpers, the man who gained it), the real five on the floor through every substitution
//   (the pieces spin round as the new man), every shot from its spot with its block, every rebound, turnover and steal,
//   the run up the floor on a change of possession, the end of each quarter;
//   THE FIRST BASKET as its own moment, with how we had the scorer and who we called for it;
//   OUR CALLS: a called man's base glows with a CALLED tag (the 0c rule, lib/record/nbaGame.js), the open lists them, a
//   called man clearing his bar gets a stamp, and the end card gives each call's graded result.
// Real: all of the above. Drawn: where the men stand between plays, the run, the ball's flight. The caption says so.
//
// Behind ?look=tracking while Donovan judges it; without it this renders nothing. (The red-LED handheld prototype,
// lib/tabletop/ledHandheld.js, is parked: Donovan picked the figures, 2026-10-23.)
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { gameFromSummary, rimOf } from '../../lib/nba/plays'
import { direct, sceneAt } from '../../lib/tabletop/tinDirector'
import { buildTinCourt } from '../../lib/tabletop/tinCourt'
import { makeTabletopLook } from '../../lib/tabletop/look'
import { isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { nbaLogo } from '../../lib/nba/teams'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { useBucketsBoardOn } from '../../lib/nba/useBuckets'
import { gameCalls } from '../../lib/record/nbaGame'
import { surname } from '../../lib/format'
import CallStatusBadge from '../CallStatusBadge'
import { ChartEmpty } from '../charts'
import { gameDay } from './ui'
import { pickMoments } from '../../lib/replayCut'

const SUMMARY = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`
const SPEEDS = [[1, '1x'], [2, '2x'], [4, '4x']]
const INTRO_MS = 5200
const CLEAR_MS = 3200         // how long a cleared bar's stamp stays (replay time)
const TALLY = { pts: (t) => t.pts, reb: (t) => t.reb, ast: (t) => t.ast, '3pm': (t) => t.tpm, pra: (t) => t.pts + t.reb + t.ast }
// the court is 94 x 50 and seen from above its open side, so even a phone gets a wide box (a tall one is empty sky)
const boxH = (w, rec) => (rec ? Math.round((w * 9) / 16) : Math.max(230, Math.round(w * (w < 640 ? 0.62 : 0.5))))
const clockText = (p) => {
  if (!p) return ''
  const q = p.period > 4 ? `OT${p.period > 5 ? p.period - 4 : ''}` : `Q${p.period}`
  return p.clock == null ? q : `${q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`
}
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2)
const hitMark = (h) => (h === true ? '✅' : h === false ? '❌' : '·')

export default function TabletopCourt({ id }) {
  const [on, setOn] = useState(false)
  const [rec, setRec] = useState(false)
  useEffect(() => {
    setOn(lookParam() === 'tracking')
    try { setRec(new URLSearchParams(window.location.search).get('record') === '1') } catch { /* no window */ }
  }, [])
  const [sum, setSum] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!on || !id) return undefined
    let live = true
    fetch(SUMMARY(id)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j) => { if (live) setSum(j) })
      .catch(() => { if (live) setErr('LIVE DATA DELAYED') })
    return () => { live = false }
  }, [on, id])
  const game = useMemo(() => (sum ? gameFromSummary(sum) : null), [sum])
  // OUR CALLS in this game: the boards' own rows (the same reads as the page's CALLED IN THIS GAME table)
  const date = on && game?.date ? gameDay(game.date) : null
  const boards = {
    pts: useBucketsBoardOn(date, 'pts'), reb: useBucketsBoardOn(date, 'reb'), ast: useBucketsBoardOn(date, 'ast'), '3pm': useBucketsBoardOn(date, '3pm'),
    pra: useBucketsBoardOn(date, 'pra'), dd: useBucketsBoardOn(date, 'dd'), td: useBucketsBoardOn(date, 'td'), first: useBucketsBoardOn(date, 'first'),
  }
  const boardKey = Object.values(boards).map((b) => (b.data ? (b.data.rows || []).length : 'x')).join(',')
  const calls = useMemo(() => (game ? gameCalls(Object.fromEntries(Object.entries(boards).map(([k, b]) => [k, b.data])), game.id) : null), [game, boardKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return null
  if (err) return <ChartEmpty theme={C}>The tin court is waiting on the league feed ({err}).</ChartEmpty>
  if (!game) return <ChartEmpty theme={C}>Loading the game&apos;s plays…</ChartEmpty>
  if (!game.tip || !game.plays.length) return <ChartEmpty theme={C}>No plays yet. The tin court starts at tip-off.</ChartEmpty>
  return <Stage game={game} calls={calls} rec={rec} />
}

function Stage({ game, calls, rec }) {
  const mount = useRef(null)
  const api = useRef({})
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const speedRef = useRef(speed); speedRef.current = speed
  const callsRef = useRef(calls); callsRef.current = calls
  const [ui, setUi] = useState({ i: 0, bt: 'tip', score: [0, 0], clear: null })
  const [intro, setIntro] = useState(null)
  const [done, setDone] = useState(false)
  const [started, setStarted] = useState(false)
  const d = useMemo(() => direct(game), [game])
  const ev = game.events
  // the score before each play and after it (the feed's own running score)
  const scores = useMemo(() => {
    const before = [], after = []
    let s = [0, 0]
    for (const e of ev) { before.push(s); if ((e.kind === 'shot' || e.kind === 'ft') && e.score) s = e.score; after.push(s) }
    return { before, after }
  }, [ev])
  // A CALLED MAN CLEARING HIS BAR: his running count from the plays (points, rebounds, assists, threes), the moment it
  // reaches the market's bar. (The graded result on the end card is the board's own.)
  const clears = useMemo(() => {
    const list = calls?.calls || []
    if (!list.length) return []
    const tally = {}, T = (id) => (tally[id] ||= { pts: 0, reb: 0, ast: 0, tpm: 0 })
    const out = [], done = new Set()
    for (const e of ev) {
      if ((e.kind === 'shot' || e.kind === 'ft') && e.made) { T(e.who).pts += e.pts || 0; if (e.three) T(e.who).tpm += 1; if (e.ast) T(e.ast).ast += 1 }
      if (e.kind === 'reb' && e.who) T(e.who).reb += 1
      for (const c of list) {
        const key = `${c.market}|${c.playerId}`
        if (done.has(key) || !TALLY[c.market] || c.bar == null || !tally[c.playerId]) continue
        if (TALLY[c.market](tally[c.playerId]) >= c.bar) { done.add(key); out.push({ i: e.i, ...c }) }
      }
    }
    // when each shows: as the play that cleared it finishes
    return out.map((c) => { const b = d.beats.find((x) => x.i === c.i && x.type !== 'run'); return b ? { ...c, at: b.t + b.dur * 0.85 } : null }).filter(Boolean)
  }, [ev, calls, d])
  const clearsRef = useRef(clears); clearsRef.current = clears
  const quarterAt = useMemo(() => { const o = {}; for (const b of d.beats) { const p = ev[b.i]?.period; if (p && o[p] == null && b.type !== 'quarter') o[p] = b.t } return o }, [d, ev])

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const { beats, total } = d
    const W = el.clientWidth || 640, H = boxH(W, rec)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const world = buildTinCourt(scene, renderer, { home: game.home, away: game.away, accent: C.purple, players: game.players })
    const look = makeTabletopLook(renderer, scene, camera, W, H)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.45; controls.minDistance = 40; controls.maxDistance = 320
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    let manual = false
    controls.addEventListener('start', () => { manual = true })
    // THE CAMERAS: high over the open side, the whole floor in frame (a tall box pulls back), leaning toward the end the
    // ball is at; closer for the tip; in on the scorer for the first basket
    const pullOf = () => Math.max(1, 1.95 / camera.aspect)
    const base = () => { const p = pullOf(); return { pos: new THREE.Vector3(0, 74 * p, 92 * p), at: new THREE.Vector3(0, 2, 2) } }
    const open = () => ({ pos: new THREE.Vector3(-30, 7, 16), at: new THREE.Vector3(-26, 6, 4) })   // down among the pieces
    const place = (pos, at) => { camera.position.copy(pos); controls.target.copy(at); camera.lookAt(at) }
    const cam = { pos: base().pos, at: base().at }
    place(cam.pos, cam.at); controls.update()

    // THE CLOCK: replay ms; a stepped clock in record mode
    let vt = 0
    const nowMs = () => (rec ? vt : performance.now())
    let t = 0, last = nowMs(), playingNow = false, introAt = null, introDone = !rec ? false : true, bi = 0, uiAt = 0, phase = null, snap = true
    const beatAt = (ms) => {
      if (bi >= beats.length || beats[bi].t > ms) bi = 0
      while (bi + 1 < beats.length && beats[bi + 1].t <= ms) bi += 1
      return beats[bi]
    }
    const draw = (ms, dtReplay) => {
      const b = beatAt(ms), u = Math.min(1, (ms - b.t) / b.dur), e = ev[b.i], L = d.lineups[b.i]
      const sc = sceneAt(game, d, b, u)
      const cs = callsRef.current
      world.render({ L, sc, players: game.players, statusOf: cs ? cs.statusOf : () => 'off', dt: dtReplay, t: nowMs(), snap })
      snap = false
      let score = scores.before[b.i]
      if (b.type === 'shot' || b.type === 'ft') { if (e.made && u >= 0.85) score = scores.after[b.i] } else if (b.type === 'three' || b.type === 'first') score = scores.after[b.i]
      world.setScore(score[0], score[1], clockText(e))
      const clear = clearsRef.current.find((c) => ms >= c.at && ms < c.at + CLEAR_MS) || null
      const bulbs = b.type === 'first' ? Math.min(1, u * 4) * (u < 0.85 ? 1 : (1 - u) / 0.15) : clear ? Math.max(0, 1 - (ms - clear.at) / 1600) : 0
      world.flash(bulbs, nowMs())
      return { b, u, e, sc, score, clear }
    }
    const tick = () => {
      const n = nowMs(), dtw = Math.min(100, n - last); last = n
      if (introAt != null) {
        // THE OPEN: low among the pieces at the centre circle, then up and back to the table view
        const a = Math.min(1, (n - introAt) / INTRO_MS), o = open(), bs = base()
        const f = ease(Math.max(0, (a - 0.2) / 0.8))
        cam.pos = o.pos.clone().lerp(bs.pos, f); cam.at = o.at.clone().lerp(bs.at, f); place(cam.pos, cam.at)
        look.focus.copy(cam.at); look.blur(3.2 - 2.0 * f); look.range(25 + 130 * f)
        const ph = a < 0.45 ? 'title' : a < 0.97 ? 'calls' : null
        if (ph !== phase) { phase = ph; setIntro(ph) }
        draw(0, 0)
        if (a >= 1) { introAt = null; introDone = true; controls.enabled = !rec; setIntro(null) }
        look.render(); if (!rec) raf = requestAnimationFrame(tick)
        return
      }
      const dtr = playingNow ? dtw * speedRef.current : 0
      if (playingNow) t = Math.min(total, t + dtr)
      const { b, u, e, sc, score, clear } = draw(t, dtr)
      if (!manual) {
        const bs = base(), lean = sc.offence ? rimOf(sc.offence).X * 0.22 : 0
        let want = { pos: bs.pos.clone().add(new THREE.Vector3(lean, 0, 0)), at: bs.at.clone().add(new THREE.Vector3(lean * 0.8, 0, 0)) }
        if (b.type === 'tip' && (playingNow || t > 0)) { const p = pullOf(); want = { pos: new THREE.Vector3(0, 46 * p, 60 * p), at: new THREE.Vector3(0, 3, 0) } }
        if (b.type === 'first') {
          const at = world.figAt?.(e.who)
          if (at && u < 0.86) want = { pos: new THREE.Vector3(at.x * 0.9, 24, at.z + 38), at: new THREE.Vector3(at.x, 6, at.z) }
        }
        const k = Math.min(1, dtw / 420)
        cam.pos.lerp(want.pos, k); cam.at.lerp(want.at, k); place(cam.pos, cam.at)
      } else controls.update()
      look.focus.copy(b.type === 'first' && world.figAt?.(e.who) ? world.figAt(e.who) : world.focus)
      if (b.type === 'first') { look.blur(1.8); look.range(45) } else { look.blur(1.1); look.range(130) }
      if (n - uiAt > 120) { uiAt = n; setUi({ i: b.i, bt: b.type, score, clear }) }
      if (playingNow && t >= total) { playingNow = false; setPlaying(false); setDone(true) }
      look.render(); if (!rec) raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([x]) => { if (rec) return; onScreen = x.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = nowMs(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { if (rec) return; cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = nowMs(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    api.current = {
      play: () => { if (t >= total) { t = 0; snap = true; setDone(false) } if (!introDone) { introAt = nowMs(); introDone = true; controls.enabled = false; phase = null } playingNow = true; last = nowMs() },
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; controls.enabled = true; setIntro(null) } },
      jump: (ms) => { t = Math.max(0, Math.min(total, ms)); snap = true; introDone = true; setDone(false); last = nowMs() },
    }
    if (!rec) raf = requestAnimationFrame(tick)
    else {
      io.disconnect(); document.removeEventListener('visibilitychange', onVis); controls.enabled = false
      // THE RECORDER'S HANDLE (scripts/record-replay.mjs --sport nba)
      window.__bucketsReplay = {
        start: () => { introAt = vt; phase = null; playingNow = true; setPlaying(true) },
        step: (ms) => { vt += ms; tick() },
        done: () => t >= total && !playingNow,
        jump: (ms) => { introAt = null; phase = null; setIntro(null); t = Math.max(0, Math.min(total, ms)); snap = true; playingNow = false; tick() },
        // play from ms for n frames of f ms (a still mid-move, for checking frames)
        run: (ms, n, f = 33) => { introAt = null; phase = null; setIntro(null); t = Math.max(0, Math.min(total, ms)); snap = true; playingNow = true; for (let k = 0; k < n; k += 1) { vt += f; tick() } playingNow = false },
        openAt: (u) => { introAt = vt - u * INTRO_MS; tick(); introAt = null },
        state: () => { const b = beatAt(t); return { t, total, type: b.type, i: b.i, kind: ev[b.i]?.kind, text: ev[b.i]?.text } },
        beats: () => beats.map((b) => ({ t: b.t, type: b.type, kind: ev[b.i]?.kind })),
        // THE X CUT (lib/replayCut.js): the tip, the first basket, each called man clearing his bar and the finish first;
        // then our called men's other buckets; then threes, blocks and steals. Replay ms; the recorder plays them back to back.
        moments: (budgetMs) => {
          const cs = callsRef.current, cands = [], body = beats.filter((b) => b.type !== 'run')
          const span = (i) => { const bs = body.filter((b) => b.i === i); return bs.length ? [bs[0].t, bs[bs.length - 1].t + bs[bs.length - 1].dur] : null }
          const add = (i, prio, label, pad = 0) => { const sp = span(i); if (sp) cands.push({ from: Math.max(0, sp[0] - 150), to: sp[1] + pad, prio, label }) }
          add(0, 1, 'tip')
          if (game.firstBasket != null) add(game.firstBasket, 1, 'first basket')
          for (const c of clearsRef.current) add(c.i, 1, `${c.name} ${c.label}`, CLEAR_MS * 0.8)
          const lastMake = [...ev].reverse().find((e) => (e.kind === 'shot' || e.kind === 'ft') && e.made && e.kind === 'shot')
          if (lastMake) add(lastMake.i, 1, 'the finish', 600)
          // each called man's first bucket and his threes; then blocks and steals
          const seen = new Set(), nm = (id) => surname(game.players[id]?.name || '')
          for (const e of ev) {
            const called = cs?.statusOf(e.who) === 'called'
            if (e.kind === 'shot' && e.made && called && (!seen.has(e.who) || e.three)) { add(e.i, 2, `${nm(e.who)} ${e.three ? 'three' : 'first bucket'}`); seen.add(e.who) }
            else if (e.kind === 'shot' && e.blk) add(e.i, 3, `${nm(e.blk)} block`)
            else if (e.kind === 'tov' && e.stl) add(e.i, 3, `${nm(e.stl)} steal`)
          }
          return pickMoments(cands, { budgetMs, speed: speedRef.current })
        },
        at: () => t,
        intro: () => introAt != null,
        resume: () => { introAt = null; playingNow = true; setPlaying(true) },
        finish: () => { introAt = null; t = total; playingNow = false; setPlaying(false); setDone(true); tick() },
        clears: () => clearsRef.current.map((c) => ({ at: c.at, market: c.market, name: c.name })),
        total: () => total,
        game: () => game.id,
      }
      tick()
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize(w, h) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      controls.dispose(); look.dispose(); world.dispose?.()
      scene.traverse((o) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) m.dispose?.() })
      renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}; if (rec) delete window.__bucketsReplay
    }
  }, [game, rec, d, scores]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the tin court isn&apos;t available here.</ChartEmpty>
  const cur = ev[ui.i]
  const [as, hs] = ui.score
  const nameOf = (pid) => game.players[pid]?.name || ''
  const statusOf = (pid) => calls?.statusOf(pid) || 'off'
  const gate = { started: true, graded: game.final }
  const fb = game.firstBasket != null ? ev[game.firstBasket] : null
  const firstCalls = (calls?.calls || []).filter((c) => c.market === 'first')
  const tonight = calls?.calls || []
  // one line a man: every market we called him in
  const byMan = Object.values(tonight.reduce((o, c) => { (o[c.playerId] ||= { id: c.playerId, name: c.name, items: [] }).items.push(c); return o }, {}))
  const actor = cur ? (cur.kind === 'tip' ? cur.gained : cur.who) : null
  const bugTeam = (tm, s) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={nbaLogo(tm.abbrev)} alt="" width={22} height={22} style={{ display: 'block' }} />
      <b style={{ color: C.text2, fontSize: 12, letterSpacing: 1 }}>{tm.abbrev}</b>
      <b style={{ color: C.text, fontSize: 20, minWidth: 22, textAlign: 'center' }}>{s}</b>
    </span>
  )
  const card = { background: C.bg2, border: `1px solid ${C.border2 || C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: 8, fontFamily: NUM_FONT }
  return (
    <section aria-label="The game on the tin court" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="group" aria-label="Tin court controls" style={{ display: rec ? 'none' : 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.purple, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true); setStarted(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the game'}</button>
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.purple, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        {Object.keys(quarterAt).map((q) => (
          <button key={q} type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.purple, C, NUM_FONT)} onClick={() => { api.current.jump?.(quarterAt[q]); setStarted(true) }}>{Number(q) > 4 ? 'OT' : `Q${q}`}</button>
        ))}
      </div>
      <div data-replay-stage="" style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 230, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        <style>{'@keyframes bkUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}@keyframes bkBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes bkStamp{0%{transform:scale(1.8) rotate(-6deg);opacity:0}40%{transform:scale(.96) rotate(-3deg);opacity:1}100%{transform:scale(1) rotate(-3deg)}}'}</style>
        {/* the score bug */}
        <div style={{ position: 'absolute', left: 8, top: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', ...card, pointerEvents: 'none' }}>
          {bugTeam(game.away, as)}{bugTeam(game.home, hs)}
          <span style={{ fontSize: 11, color: C.text2, fontWeight: 800, letterSpacing: 1 }}>{ui.bt === 'tip' ? 'TIP-OFF' : clockText(cur)}</span>
        </div>
        {/* THE OPEN: the title, then the calls we made in this game */}
        {intro === 'title' ? (
          <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', fontFamily: NUM_FONT, pointerEvents: 'none' }}>
            <div style={{ width: 120, height: 3, background: C.purple, transformOrigin: 'left', animation: 'bkBar .5s ease-out both' }} />
            <div style={{ fontSize: 11, letterSpacing: 4, color: C.text, fontWeight: 900, marginTop: 6, animation: 'bkUp .5s both' }}>DASH NETWORK · BUCKETS · THE TIN COURT</div>
            <div style={{ fontSize: 'clamp(26px, 6vw, 46px)', fontWeight: 900, color: C.text, letterSpacing: 2, animation: 'bkUp .5s .15s both' }}>{game.away.abbrev} <span style={{ color: C.text3, fontSize: '0.5em' }}>@</span> {game.home.abbrev}</div>
          </div>
        ) : intro === 'calls' ? (
          <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', padding: '10px 14px', ...card, pointerEvents: 'none', maxWidth: 'calc(100% - 24px)' }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: C.purple, fontWeight: 900 }}>{tonight.length ? `OUR CALLS IN THIS GAME · ${tonight.length}` : 'NO CALLS IN THIS GAME'}</div>
            {byMan.slice(0, 5).map((m, k) => (
              <div key={m.id} style={{ fontSize: 'clamp(13px, 3.2vw, 17px)', color: C.text, fontWeight: 800, marginTop: 4, animation: `bkUp .4s ${0.1 + k * 0.1}s both` }}>
                {m.name} <span style={{ color: C.text3, fontSize: 11, letterSpacing: 1 }}>{m.items.map((c) => c.label).join(' · ')}</span>
              </div>
            ))}
            {byMan.length > 5 ? <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>+{byMan.length - 5} more</div> : null}
          </div>
        ) : null}
        {/* THE FIRST BASKET: who, how we had him, who we called for it */}
        {ui.bt === 'first' && fb ? (
          <div style={{ position: 'absolute', right: 'clamp(8px, 2vw, 20px)', bottom: 'clamp(8px, 2vw, 20px)', padding: '10px 14px', ...card, pointerEvents: 'none', maxWidth: 'min(320px, calc(100% - 16px))' }}>
            <div style={{ fontSize: 'clamp(18px, 4.4vw, 28px)', fontWeight: 900, color: C.text, letterSpacing: 2, animation: 'bkStamp .5s both' }}>FIRST BASKET</div>
            <div style={{ fontSize: 'clamp(14px, 3.4vw, 18px)', color: C.text, fontWeight: 800, marginTop: 4 }}>{nameOf(fb.who)} <span style={{ color: C.text3, fontSize: 11 }}>{fb.club === 'home' ? game.home.abbrev : game.away.abbrev}</span></div>
            <div style={{ marginTop: 6 }}><CallStatusBadge status={calls ? calls.first.statusOf(fb.who) : 'off'} theme={C} numFont={NUM_FONT} accent={C.purple} gate={gate} /></div>
            <div style={{ fontSize: 11, color: C.text2, marginTop: 6, lineHeight: 1.5 }}>
              {firstCalls.length ? <>Our first-basket call{firstCalls.length > 1 ? 's' : ''}: {firstCalls.map((c) => `${surname(c.name)} ${hitMark(c.hit)}`).join(' · ')}</> : 'No first-basket call in this game.'}
            </div>
          </div>
        ) : null}
        {/* A CALLED MAN CLEARS HIS BAR */}
        {ui.clear ? (
          <div style={{ position: 'absolute', right: 'clamp(8px, 2vw, 20px)', top: 'clamp(8px, 2vw, 16px)', padding: '8px 12px', ...card, pointerEvents: 'none', animation: 'bkStamp .5s both' }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: C.purple, fontWeight: 900 }}>✅ BAR CLEARED</div>
            <div style={{ fontSize: 'clamp(14px, 3.4vw, 18px)', color: C.text, fontWeight: 900, marginTop: 2 }}>{ui.clear.name}</div>
            <div style={{ fontSize: 11, color: C.text2, fontWeight: 800, letterSpacing: 1 }}>{ui.clear.label} · <CallStatusBadge status="called" variant="text" theme={C} numFont={NUM_FONT} accent={C.purple} gate={gate} /></div>
          </div>
        ) : null}
        {/* THE END CARD: the final, then each call's graded result (the board's own) */}
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${C.bg}d9`, pointerEvents: 'none', fontFamily: NUM_FONT, textAlign: 'center', padding: 12 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 4, color: C.text2, fontWeight: 800 }}>FINAL{ev[ev.length - 1]?.period > 4 ? ' / OT' : ''}</div>
              <div style={{ fontSize: 'clamp(28px, 7vw, 52px)', fontWeight: 900, color: C.text, marginTop: 4 }}>{game.away.abbrev} {as} <span style={{ color: C.text3 }}>·</span> {hs} {game.home.abbrev}</div>
              {tonight.length ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 2, fontSize: 'clamp(11px, 2.8vw, 14px)', color: C.text }}>
                  {byMan.slice(0, 6).map((m) => <div key={m.id}>{surname(m.name)} <span style={{ color: C.text3 }}>{m.items.map((c) => `${c.label} ${hitMark(c.hit)}`).join(' · ')}</span></div>)}
                  {byMan.length > 6 ? <div style={{ color: C.text3, fontSize: 11 }}>+{byMan.length - 6} more on the page</div> : null}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: C.purple, letterSpacing: 3, fontWeight: 800, marginTop: 8 }}>DASH NETWORK · BUCKETS</div>
            </div>
          </div>
        ) : null}
      </div>
      {/* the ticker: the play in the league's own words, and how we had the man */}
      <div aria-live="polite" style={{ fontSize: 12, color: C.text, minHeight: 18, display: rec ? 'none' : 'block' }}>
        {cur && (started || rec) ? (
          <>
            {cur.club ? <b style={{ color: C.purple, fontFamily: NUM_FONT }}>{cur.club === 'home' ? game.home.abbrev : game.away.abbrev} </b> : null}
            {cur.kind === 'tip' ? `Tip-off: ${cur.text}` : cur.text}
            {cur.kind === 'shot' && !cur.spot ? <span style={{ color: C.text3 }}> (no spot in the feed: shot from the top of the key)</span> : null}
            {actor && statusOf(actor) !== 'off' ? <span> · <CallStatusBadge status={statusOf(actor)} variant="text" theme={C} numFont={NUM_FONT} accent={C.purple} gate={gate} /></span> : null}
          </>
        ) : <span style={{ color: C.text3 }}>Press play: the tip, every shot, rebound and steal, in order</span>}
      </div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, display: rec ? 'none' : 'block' }}>
        A prototype. Real (ESPN&apos;s play-by-play): the tip, the five on the floor, every shot&apos;s spot, shooter, block, make or
        miss, every rebound, turnover and steal, the score. Drawn: where the others stand, the run up the floor, the ball&apos;s
        flight. A glowing base is a man we called in this game.
      </div>
    </section>
  )
}
