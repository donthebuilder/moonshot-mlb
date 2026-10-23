'use client'
// 🏀 THE GAME ON A TABLETOP TOY (2026-10-23, BUCKETS prototypes; Donovan: "the 70s LED and the tin spring lever ... I just
// want to see a prototype"). Every shot and free throw of one game from ESPN's play-by-play (lib/nba/plays.js), played in
// order on one of two toys, picked by a chip:
//   TIN    the lithographed tin court with spring-lever cut-outs (lib/tabletop/tinCourt.js)
//   LED    the red-LED handheld (lib/tabletop/ledHandheld.js)
// Real: every shot's spot, the shooter, make or miss, the points, the clock, the score. Drawn: the ball's flight, and on
// the handheld the defenders' cells -- the caption says so.
//
// Behind ?look=tracking while Donovan judges it; without it this renders nothing. ?court=led opens the handheld.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { shotsFromSummary, shotBeats, rimOf } from '../../lib/nba/plays'
import { buildTinCourt } from '../../lib/tabletop/tinCourt'
import { buildLedHandheld } from '../../lib/tabletop/ledHandheld'
import { makeTabletopLook } from '../../lib/tabletop/look'
import { isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { lookParam } from '../../lib/three/look'
import { nbaLogo } from '../../lib/nba/teams'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { ChartEmpty } from '../charts'

const SUMMARY = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`
const SPEEDS = [[1, '1x'], [2, '2x'], [4, '4x']]
const INTRO_MS = 4200
const TOYS = [['tin', 'Tin court'], ['led', 'LED handheld']]
// the tin court is 94 x 50 and seen from above its open side, so even a phone gets a wide box (a tall one is empty sky)
const boxH = (w, rec) => (rec ? Math.round((w * 9) / 16) : Math.max(230, Math.round(w * (w < 640 ? 0.62 : 0.5))))
const clockText = (p) => {
  if (!p) return ''
  const q = p.period > 4 ? `OT${p.period > 5 ? p.period - 4 : ''}` : `Q${p.period}`
  return p.clock == null ? q : `${q} ${Math.floor(p.clock / 60)}:${String(p.clock % 60).padStart(2, '0')}`
}
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2)

export default function TabletopCourt({ id }) {
  const [on, setOn] = useState(false)
  const [rec, setRec] = useState(false)
  const [toy0, setToy0] = useState('tin')
  useEffect(() => {
    setOn(lookParam() === 'tracking')
    try { const q = new URLSearchParams(window.location.search); setRec(q.get('record') === '1'); if (q.get('court') === 'led') setToy0('led') } catch { /* no window */ }
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
  const game = useMemo(() => (sum ? shotsFromSummary(sum) : null), [sum])
  if (!on) return null
  if (err) return <ChartEmpty theme={C}>The tabletop is waiting on the league feed ({err}).</ChartEmpty>
  if (!game) return <ChartEmpty theme={C}>Loading the game&apos;s shots…</ChartEmpty>
  if (!game.plays.length) return <ChartEmpty theme={C}>No shots yet. The tabletop starts at tip-off.</ChartEmpty>
  return <Stage game={game} rec={rec} toy0={toy0} />
}

function Stage({ game, rec, toy0 }) {
  const mount = useRef(null)
  const api = useRef({})
  const [toy, setToy] = useState(toy0)
  const [ok, setOk] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const speedRef = useRef(speed); speedRef.current = speed
  const [ui, setUi] = useState({ i: -1, score: [0, 0], made: false })
  const [intro, setIntro] = useState(null)
  const [done, setDone] = useState(false)
  const [started, setStarted] = useState(false)   // the ticker waits for the first press
  const { beats, total } = useMemo(() => shotBeats(game.plays), [game])
  // the score BEFORE each shot (the feed's own running score), so a make moves it as the ball drops
  const before = useMemo(() => game.plays.map((p, i) => (i ? game.plays[i - 1].score : [0, 0])), [game])
  const quarterAt = useMemo(() => { const o = {}; for (const b of beats) { const p = game.plays[b.i]; if (b.type === 'shot' && o[p.period] == null) o[p.period] = b.t } return o }, [beats, game])

  useEffect(() => {
    const el = mount.current
    if (!el) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const W = el.clientWidth || 640, H = boxH(W, rec)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    const accent = C.purple
    const world = toy === 'led'
      ? buildLedHandheld(scene, renderer, { home: game.home, away: game.away, accent })
      : buildTinCourt(scene, renderer, { home: game.home, away: game.away, accent, players: game.players })
    const look = makeTabletopLook(renderer, scene, camera, W, H)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.45
    if (toy === 'led') { controls.minDistance = 18; controls.maxDistance = 90 } else { controls.minDistance = 40; controls.maxDistance = 320 }
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    let manual = false
    controls.addEventListener('start', () => { manual = true })
    // THE CAMERAS: the tin court from high on its open side, the whole floor in frame (a tall box pulls back); the handheld
    // from above the player's lap, a little toward the screen. Both breathe; a shot leans the tin camera toward its rim.
    const base = () => {
      const pull = Math.max(toy === 'led' ? 0.86 : 1, (toy === 'led' ? 1.5 : 1.95) / camera.aspect)
      return toy === 'led'
        ? { pos: new THREE.Vector3(0, 38 * pull, 29 * pull), at: new THREE.Vector3(0, 0.5, -0.4) }
        : { pos: new THREE.Vector3(0, 74 * pull, 92 * pull), at: new THREE.Vector3(0, 2, 2) }
    }
    const open = () => (toy === 'led'
      ? { pos: new THREE.Vector3(15, 4.2, 3), at: new THREE.Vector3(1, 2.4, -1) }        // low across the lit window
      : { pos: new THREE.Vector3(-30, 7, 16), at: new THREE.Vector3(-26, 6, 4) })      // down among the cut-outs
    const place = (pos, at) => { camera.position.copy(pos); controls.target.copy(at); camera.lookAt(at) }
    place(base().pos, base().at); controls.update()

    // THE CLOCK: replay ms; a stepped clock in record mode
    let vt = 0
    const nowMs = () => (rec ? vt : performance.now())
    let t = 0, last = nowMs(), playingNow = false, introAt = null, introDone = rec ? false : true, lean = 0, bi = 0, uiAt = 0, phase = null
    const beatAt = (ms) => {
      if (bi >= beats.length || beats[bi].t > ms) bi = 0
      while (bi + 1 < beats.length && beats[bi + 1].t <= ms) bi += 1
      return beats[bi]
    }
    const draw = (ms) => {
      const b = beatAt(ms), p = game.plays[b.i]
      const u = Math.min(1, (ms - b.t) / b.dur)
      let score = before[b.i]
      if (b.type === 'shot') { world.update(p, u, nowMs(), 'shot'); if (p.made && u >= 0.78) score = p.score }
      else if (b.type === 'three') { world.update(p, 1, nowMs(), 'three'); score = p.score }
      else if (b.type === 'quarter') { if (toy === 'led') world.update(game.plays[b.i], 0, nowMs(), 'quarter'); else world.update(null); score = before[b.i] }
      else { world.update(null); world.idle(nowMs()); score = p.score }
      world.setScore(score[0], score[1], clockText(b.type === 'quarter' ? game.plays[b.i] : p))
      return { b, p, u, score }
    }
    const tick = () => {
      const n = nowMs(), dt = Math.min(100, n - last); last = n
      if (introAt != null) {
        // THE OPEN: low among the pieces, then up and back to the table view
        const a = Math.min(1, (n - introAt) / INTRO_MS), o = open(), bs = base()
        const f = ease(Math.max(0, (a - 0.25) / 0.75))
        place(o.pos.clone().lerp(bs.pos, f), o.at.clone().lerp(bs.at, f))
        look.focus.copy(o.at.clone().lerp(bs.at, f)); look.blur(3.2 - 2.0 * f); look.range(toy === 'led' ? 10 + 50 * f : 25 + 130 * f)
        const ph = a < 0.6 ? 'title' : null
        if (ph !== phase) { phase = ph; setIntro(ph) }
        draw(0)
        if (a >= 1) { introAt = null; introDone = true; controls.enabled = !rec; setIntro(null); place(bs.pos, bs.at) }
        look.render(); if (!rec) raf = requestAnimationFrame(tick)
        return
      }
      if (playingNow) t = Math.min(total, t + dt * speedRef.current)
      const { b, p, score } = draw(t)
      // the lean: the tin camera drifts a little toward the rim being shot at, the handheld's breathes
      if (!manual) {
        const bs = base()
        if (toy === 'tin') { lean += ((b.type === 'quarter' ? 0 : rimOf(p.club).X * 0.22) - lean) * Math.min(1, dt / 900); place(bs.pos.clone().add(new THREE.Vector3(lean, 0, 0)), bs.at.clone().add(new THREE.Vector3(lean * 0.8, 0, 0))) }
        else place(bs.pos.clone().add(new THREE.Vector3(Math.sin(n / 3000) * 0.8, 0, 0)), bs.at)
      } else controls.update()
      look.focus.copy(world.focus)
      if (toy === 'led') { look.blur(1.0); look.range(60) } else { look.blur(1.1); look.range(130) }
      if (n - uiAt > 120) { uiAt = n; setUi({ i: b.i, score, made: p.made }) }
      if (playingNow && t >= total) { playingNow = false; setPlaying(false); setDone(true) }
      look.render(); if (!rec) raf = requestAnimationFrame(tick)
    }
    let raf = 0, onScreen = true
    const io = new IntersectionObserver(([e]) => { if (rec) return; onScreen = e.isIntersecting; cancelAnimationFrame(raf); if (onScreen && !document.hidden) { last = nowMs(); raf = requestAnimationFrame(tick) } })
    io.observe(el)
    const onVis = () => { if (rec) return; cancelAnimationFrame(raf); if (!document.hidden && onScreen) { last = nowMs(); raf = requestAnimationFrame(tick) } }
    document.addEventListener('visibilitychange', onVis)
    api.current = {
      play: () => { if (t >= total) { t = 0; setDone(false) } if (!introDone) { introAt = nowMs(); introDone = true; controls.enabled = false; phase = null } playingNow = true; last = nowMs() },
      pause: () => { playingNow = false; if (introAt != null) { introAt = null; controls.enabled = true; setIntro(null); place(base().pos, base().at) } },
      jump: (ms) => { t = Math.max(0, Math.min(total, ms)); setDone(false); last = nowMs() },
    }
    if (!rec) { introDone = false; raf = requestAnimationFrame(tick) }
    else {
      io.disconnect(); document.removeEventListener('visibilitychange', onVis); controls.enabled = false
      // THE RECORDER'S HANDLE (scripts/record-replay.mjs --sport nba)
      window.__bucketsReplay = {
        start: () => { introAt = vt; introDone = true; phase = null; playingNow = true; setPlaying(true) },
        step: (ms) => { vt += ms; tick() },
        done: () => t >= total && !playingNow,
        jump: (ms) => { introAt = null; phase = null; setIntro(null); t = Math.max(0, Math.min(total, ms)); playingNow = false; tick() },
        openAt: (u) => { introAt = vt - u * INTRO_MS; tick(); introAt = null },
        state: () => ({ t, total, beat: beatAt(t), toy }),
        total: () => total,
        game: () => game.id,
      }
      tick()
    }
    const onResize = () => { const w = el.clientWidth || W, h = boxH(w, rec); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); look.setSize(w, h); if (!manual) place(base().pos, base().at) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); if (ro) ro.disconnect()
      controls.dispose(); look.dispose(); world.dispose?.()
      scene.traverse((o) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { m.map?.dispose?.(); m.dispose?.() } })
      renderer.dispose(); if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      api.current = {}; if (rec) delete window.__bucketsReplay
    }
  }, [game, toy, rec, beats, total, before]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the tabletop isn&apos;t available here.</ChartEmpty>
  const cur = ui.i >= 0 ? game.plays[ui.i] : null
  const [as, hs] = ui.score
  const who = cur ? game.players[cur.who] : null
  const bugTeam = (t, s) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={nbaLogo(t.abbrev)} alt="" width={22} height={22} style={{ display: 'block' }} />
      <b style={{ color: C.text2, fontSize: 12, letterSpacing: 1 }}>{t.abbrev}</b>
      <b style={{ color: C.text, fontSize: 20, minWidth: 22, textAlign: 'center' }}>{s}</b>
    </span>
  )
  return (
    <section aria-label="The game on a tabletop toy" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="group" aria-label="Tabletop controls" style={{ display: rec ? 'none' : 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={playing} style={flatChip(playing, C.purple, C, NUM_FONT)}
          onClick={() => { if (playing) { api.current.pause?.(); setPlaying(false) } else { api.current.play?.(); setPlaying(true); setStarted(true) } }}>{playing ? '❚❚ Pause' : '▶ Play the game'}</button>
        {TOYS.map(([k, label]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={toy === k} style={flatChip(toy === k, C.purple, C, NUM_FONT)} onClick={() => { setPlaying(false); setDone(false); setToy(k) }}>{label}</button>
        ))}
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={FLAT_CHIP_CLASS} aria-pressed={speed === v} style={flatChip(speed === v, C.purple, C, NUM_FONT)} onClick={() => setSpeed(v)}>{label}</button>
        ))}
        {Object.keys(quarterAt).map((q) => (
          <button key={q} type="button" className={FLAT_CHIP_CLASS} style={flatChip(false, C.purple, C, NUM_FONT)} onClick={() => { api.current.jump?.(quarterAt[q]); setStarted(true) }}>{Number(q) > 4 ? 'OT' : `Q${q}`}</button>
        ))}
      </div>
      <div data-replay-stage="" style={{ position: 'relative' }}>
        <div ref={mount} style={{ width: '100%', minHeight: 230, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
        {/* the score bug */}
        <div style={{ position: 'absolute', left: 8, top: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: C.bg2, border: `1px solid ${C.border2 || C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: 8, fontFamily: NUM_FONT, pointerEvents: 'none' }}>
          {bugTeam(game.away, as)}{bugTeam(game.home, hs)}
          <span style={{ fontSize: 11, color: C.text2, fontWeight: 800, letterSpacing: 1 }}>{clockText(cur)}</span>
        </div>
        {/* the open's lower third */}
        {intro === 'title' ? (
          <div style={{ position: 'absolute', left: 'clamp(12px, 3vw, 28px)', bottom: 'clamp(12px, 3vw, 26px)', fontFamily: NUM_FONT, pointerEvents: 'none' }}>
            <style>{'@keyframes bkUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}@keyframes bkBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
            <div style={{ width: 120, height: 3, background: C.purple, transformOrigin: 'left', animation: 'bkBar .5s ease-out both' }} />
            <div style={{ fontSize: 11, letterSpacing: 4, color: C.text, fontWeight: 900, marginTop: 6, animation: 'bkUp .5s both' }}>DASH NETWORK · BUCKETS · {toy === 'led' ? 'THE HANDHELD' : 'THE TIN COURT'}</div>
            <div style={{ fontSize: 'clamp(26px, 6vw, 46px)', fontWeight: 900, color: C.text, letterSpacing: 2, animation: 'bkUp .5s .15s both' }}>{game.away.abbrev} <span style={{ color: C.text3, fontSize: '0.5em' }}>@</span> {game.home.abbrev}</div>
          </div>
        ) : null}
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${C.bg}cc`, pointerEvents: 'none', fontFamily: NUM_FONT, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 4, color: C.text2, fontWeight: 800 }}>FINAL{game.plays[game.plays.length - 1]?.period > 4 ? ' / OT' : ''}</div>
              <div style={{ fontSize: 'clamp(30px, 7vw, 54px)', fontWeight: 900, color: C.text, marginTop: 6 }}>{game.away.abbrev} {as} <span style={{ color: C.text3 }}>·</span> {hs} {game.home.abbrev}</div>
              <div style={{ fontSize: 11, color: C.purple, letterSpacing: 3, fontWeight: 800, marginTop: 6 }}>DASH NETWORK · BUCKETS</div>
            </div>
          </div>
        ) : null}
      </div>
      {/* the ticker: the play in the league's own words */}
      <div aria-live="polite" style={{ fontSize: 12, color: C.text, minHeight: 18, display: rec ? 'none' : 'block' }}>
        {cur && (started || rec) ? (
          <>
            <b style={{ color: C.purple, fontFamily: NUM_FONT }}>{cur.club === 'home' ? game.home.abbrev : game.away.abbrev}</b>{' '}
            {cur.text}{!cur.ft && !cur.spot ? <span style={{ color: C.text3 }}> (no spot in the feed: shot from the top of the key)</span> : null}
            {who?.jersey != null ? <span style={{ color: C.text3 }}> · #{who.jersey}</span> : null}
          </>
        ) : <span style={{ color: C.text3 }}>Press play: every shot of the game, in order</span>}
      </div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.5, display: rec ? 'none' : 'block' }}>
        A prototype. Every shot is real: where it was taken, who took it, make or miss, the score (ESPN&apos;s play-by-play).
        Drawn: the ball&apos;s flight{toy === 'led' ? ', and the defenders’ lights' : ', and which lever he shoots from (the nearest one)'}.
      </div>
    </section>
  )
}
