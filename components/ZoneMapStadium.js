'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
// The ink that ships is the ink that is asserted — check-palette owns this
// value, so the glyphs drawn on light tiles take it from there.
import { INK_DARK } from '../lib/palette'
import { pitchColor, PITCH_NAMES, zoneBox, zoneCell, inZone as pitchInZone } from '../lib/livePitches'

// 🎯 THE STRIKE ZONE, IN SPACE — the zone map's stadium view.
//
// Same relationship SprayFieldStadium has to SprayField: additive, behind a
// toggle, dynamically imported, and the 2D grid never leaves — it is the
// fallback and the screen-reader version.
//
// WHY 3D EARNS ITS PLACE HERE. A flat grid shows WHERE a pitch ended. It
// cannot show the two things that decide whether the hitter had a chance:
//   · the arm slot — every pitch starts from the same small patch of air
//   · the tunnel — how far the ball travels before two pitches stop looking
//     alike. A slider that separates at 20ft is a different pitch from one
//     that separates at 35ft, and on a flat map they are the same dot.
// Those are the reason for the extra dimension. Everything else the 2D map
// already does better.
//
// COORDINATES. Pitches arrive in FEET, not fractions: p.x and p.z are the
// plate crossing, p.top/p.bot the batter's own measured zone. No conversion,
// no re-derivation — zoneBox()/zoneCell() from livePitches decide the box and
// the cell exactly as the 2D map does, so the two cannot disagree about which
// zone a pitch is in.
//
// THE MIRROR, same as SprayFieldStadium. This camera sits behind the plate at
// negative Z looking toward +Z, which is a 180° yaw from three.js's default
// camera — so world +X reads as screen-LEFT. Statcast's plate_x is positive
// toward the CATCHER'S RIGHT, and a catcher's-view map must draw it on the
// right. Negating x is the one fix, and every position in this file routes
// through PT() so the whole scene flips together.
//
// SHAPE SAYS WHAT HAPPENED, COLOUR SAYS WHAT WAS THROWN — the 2D map's rule,
// kept verbatim, so a sinker is the same orange here as it is on the grid and
// a whiff is still an ✕.

const REL_FT = 54          // release distance from the plate
const PLATE_HALF = 0.708   // half of a 17in plate, feet

export function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}

// world position from plate feet — the single mirror point (see header)
const PT = (x, y, z) => new THREE.Vector3(-x, y, z)

// A glyph as a camera-facing sprite. three.js has no text; a canvas does.
function glyphSprite(txt, hex, px = 64, scale = 0.5) {
  const cv = document.createElement('canvas')
  cv.width = 128; cv.height = 128
  const g = cv.getContext('2d')
  g.font = `900 ${px}px ${'SF Mono, Menlo, monospace'}`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = hex
  g.fillText(txt, 64, 68)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set(scale, scale, 1)
  return s
}

export default function ZoneMapStadium({ pitches = [], pzp = null, label = '' }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [mode, setMode] = useState('flight')   // flight | tunnel | matchup

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }

    const live = (pitches || []).filter((p) => p && p.x != null && p.z != null)
    const box = zoneBox(live)
    const ZT = box.top, ZB = box.bot, ZH = Math.max(0.1, ZT - ZB)
    const SHADOW = 0.30

    const W = mount.clientWidth || 640
    const H = Math.max(320, Math.round(W * 0.62))

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0f14)
    scene.fog = new THREE.Fog(0x0d0f14, 46, 120)

    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 400)
    camera.position.set(0, ZB + ZH * 0.55, -17)
    const target = new THREE.Vector3(0, ZB + ZH * 0.5, 3)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.88
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.62
    controls.minDistance = 6
    controls.maxDistance = 70

    scene.add(new THREE.HemisphereLight(0xbdd0ea, 0x2b2418, 1.15))
    const key = new THREE.DirectionalLight(0xfff2df, 1.2)
    key.position.set(20, 30, -12)
    scene.add(key)

    const disposables = []
    const add = (o) => { scene.add(o); disposables.push(o); return o }

    // ── the ground, the plate, the mound. Context, deliberately dim: the
    //    data is the only saturated thing on screen.
    {
      const turf = new THREE.Mesh(
        new THREE.CircleGeometry(90, 48),
        new THREE.MeshLambertMaterial({ color: 0x122c1c, side: THREE.DoubleSide }),
      )
      turf.rotation.x = -Math.PI / 2
      turf.position.y = -0.02
      add(turf)

      const dirt = new THREE.MeshLambertMaterial({ color: 0x4a2c1e, side: THREE.DoubleSide })
      const circ = new THREE.Mesh(new THREE.CircleGeometry(13, 40), dirt)
      circ.rotation.x = -Math.PI / 2
      add(circ)
      const mound = new THREE.Mesh(new THREE.CircleGeometry(9, 32), dirt)
      mound.rotation.x = -Math.PI / 2
      mound.position.set(0, 0.02, 60.5)
      add(mound)

      // home plate, POINT toward the catcher (-z) — the way it actually sits
      const sh = new THREE.Shape()
      sh.moveTo(-PLATE_HALF, PLATE_HALF); sh.lineTo(PLATE_HALF, PLATE_HALF)
      sh.lineTo(PLATE_HALF, 0); sh.lineTo(0, -PLATE_HALF); sh.lineTo(-PLATE_HALF, 0)
      sh.lineTo(-PLATE_HALF, PLATE_HALF)
      const pm = new THREE.Mesh(new THREE.ShapeGeometry(sh),
        new THREE.MeshBasicMaterial({ color: 0xd2d6dc, side: THREE.DoubleSide }))
      pm.rotation.x = -Math.PI / 2
      pm.position.y = 0.03
      add(pm)
    }

    // ── THE ZONE, at this batter's measured height. box.measured is false
    //    when nothing published top/bot; the caption says so rather than
    //    pretending 3.4/1.6 was measured.
    const zoneGroup = new THREE.Group(); add(zoneGroup)
    {
      const line = (pts, col, op, dashed) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        const m = dashed
          ? new THREE.LineDashedMaterial({ color: col, transparent: true, opacity: op, dashSize: 0.11, gapSize: 0.09 })
          : new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })
        const l = new THREE.Line(g, m)
        if (dashed) l.computeLineDistances()
        zoneGroup.add(l)
        return l
      }
      const rect = (hw, b, t, col, op, dashed) => line([
        PT(-hw, b, 0), PT(hw, b, 0), PT(hw, t, 0), PT(-hw, t, 0), PT(-hw, b, 0),
      ], col, op, dashed)

      rect(PLATE_HALF, ZB, ZT, 0xf4f4f5, 0.5, false)
      // the shadow zone is where umpires actually call, so it is drawn — but
      // dashed, because it is not the rulebook zone
      rect(PLATE_HALF + SHADOW, ZB - SHADOW, ZT + SHADOW, 0xf4f4f5, 0.2, true)

      for (let i = 1; i < 3; i++) {
        const x = -PLATE_HALF + 2 * PLATE_HALF * (i / 3)
        const y = ZB + ZH * (i / 3)
        line([PT(x, ZB, 0), PT(x, ZT, 0)], 0xf4f4f5, 0.09)
        line([PT(-PLATE_HALF, y, 0), PT(PLATE_HALF, y, 0)], 0xf4f4f5, 0.09)
      }
      // corner ticks — reads as a measured frame, not a floating box
      const TK = 0.19
      ;[[-1, ZB, 1, 1], [1, ZB, -1, 1], [-1, ZT, 1, -1], [1, ZT, -1, -1]].forEach(([sx, yy, dx, dy]) => {
        const x = sx * PLATE_HALF
        line([PT(x, yy, 0.004), PT(x + TK * dx, yy, 0.004)], 0xf59e0b, 0.75)
        line([PT(x, yy, 0.004), PT(x, yy + TK * dy, 0.004)], 0xf59e0b, 0.75)
      })
    }

    // ── THE PITCHES. Trails from a 54ft release toward the plate crossing.
    //    Shape = outcome, colour = pitch type (the 2D map's rule).
    const trailGroup = new THREE.Group(); add(trailGroup)
    const markGroup = new THREE.Group(); add(markGroup)
    const relGroup = new THREE.Group(); add(relGroup)

    live.forEach((p) => {
      const hex = pitchColor(p.type)
      const col = new THREE.Color(hex)
      // Release: a pitcher's hand sits on his own side of the rubber. `p.x0`
      // when the feed has it; otherwise a sane slot off the throwing hand,
      // which is a DRAWING assumption and never a measurement.
      const rx = p.x0 != null ? p.x0 : (p.hand === 'L' ? 1.9 : -1.9)
      const rz = p.z0 != null ? p.z0 : 5.9
      const curve = new THREE.CatmullRomCurve3([
        PT(rx, rz, REL_FT),
        PT(rx + (p.x - rx) * 0.5 + (p.pfx_x || 0) * 0.35, rz + (p.z - rz) * 0.5 + (p.pfx_z || 0) * 0.35 + 0.9, REL_FT * 0.5),
        PT(p.x, p.z, 0),
      ])
      const SEG = 60, RAD = 6
      const g = new THREE.TubeGeometry(curve, SEG, 0.03, RAD, false)
      // brightness ramp along the tube: dim at release, hot at the plate.
      // Additive blending means a near-black vertex contributes nothing, so
      // this reads as a streak instead of a wire — no alpha gradient needed.
      const VN = (SEG + 1) * (RAD + 1)
      const cbuf = new Float32Array(VN * 3)
      for (let i = 0; i < VN; i++) {
        const f = 0.12 + 0.88 * Math.pow(Math.floor(i / (RAD + 1)) / SEG, 1.6)
        cbuf[i * 3] = col.r * f; cbuf[i * 3 + 1] = col.g * f; cbuf[i * 3 + 2] = col.b * f
      }
      g.setAttribute('color', new THREE.BufferAttribute(cbuf, 3))
      trailGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })))

      const at = PT(p.x, p.z, 0.02)
      const kind = p.kind || 'ball'
      let mark
      if (kind === 'whiff') {
        mark = glyphSprite('✕', hex, 78, 0.34)
      } else if (kind === 'inplay') {
        mark = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 14),
          new THREE.MeshBasicMaterial({ color: hex }))
      } else if (kind === 'called') {
        mark = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.125, 24),
          new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide }))
      } else if (kind === 'foul') {
        mark = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13),
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
      } else {
        mark = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 20),
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
      }
      mark.position.copy(at)
      markGroup.add(mark)

      const rel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.5 }))
      rel.position.copy(PT(rx, rz, REL_FT))
      relGroup.add(rel)
    })

    // ── TUNNEL. One ring at the point downrange where the pitches are still
    //    indistinguishable. Nothing on a flat map can show this.
    const tunnelGroup = new THREE.Group(); add(tunnelGroup)
    {
      const TUN = 23
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.98, 48),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.18, side: THREE.DoubleSide }))
      ring.position.set(0, 4.0, TUN)
      tunnelGroup.add(ring)
      const lbl = glyphSprite('23', C.text3, 46, 0.9)
      lbl.position.set(0, 4.95, TUN)
      tunnelGroup.add(lbl)
    }

    // ── MATCHUP. Straight off the bot's published per-zone profile — this
    //    recomputes NOTHING. `tendency` is where he lives, `damage` is what
    //    he gives up there, `kill_zones` is his own list of where he gets his
    //    outs. Two facts, never blended into one score, exactly as the 2D
    //    matchup grid states.
    const matchGroup = new THREE.Group(); add(matchGroup)
    {
      const use = {}; (pzp?.tendency || []).forEach((t) => { use[t.zone] = t.pct })
      const dmg = {}; (pzp?.damage || []).forEach((d) => { dmg[d.zone] = d })
      const kill = new Set(pzp?.kill_zones || [])
      const uses = Object.values(use).filter((v) => Number.isFinite(v))
      const maxUse = uses.length ? Math.max(...uses) : 0
      const slgs = Object.values(dmg).map((d) => Number(d?.slg)).filter(Number.isFinite)
      const maxSlg = slgs.length ? Math.max(...slgs) : 0

      const cw = (2 * PLATE_HALF) / 3, ch = ZH / 3, GAP = 0.045
      for (let z = 0; z < 9; z++) {
        const cx = -PLATE_HALF + cw * ((z % 3) + 0.5)
        const cy = ZT - ch * (Math.floor(z / 3) + 0.5)
        const zn = z + 1
        const traffic = maxUse > 0 && Number.isFinite(use[zn]) ? use[zn] / maxUse : 0
        const damage = maxSlg > 0 && Number.isFinite(Number(dmg[zn]?.slg)) ? Number(dmg[zn].slg) / maxSlg : 0
        const edge = damage - traffic
        const mag = Math.min(1, Math.abs(edge))
        const tone = !use[zn] ? 0x39404b : (edge >= 0 ? C.orange : C.red)
        const depth = 0.06 + mag * 0.10
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(cw - GAP * 2, ch - GAP * 2, depth),
          new THREE.MeshLambertMaterial({
            color: tone, transparent: true,
            opacity: !use[zn] ? 0.16 : 0.30 + mag * 0.5, side: THREE.DoubleSide,
          }),
        )
        tile.position.copy(PT(cx, cy, -depth / 2 - 0.02))
        matchGroup.add(tile)
        if (use[zn]) {
          const g2 = glyphSprite(kill.has(zn) ? '✕' : (edge >= 0 ? '⚡' : '⚠'),
            kill.has(zn) ? C.text : INK_DARK, 72, 0.30)
          g2.position.copy(PT(cx, cy, 0.26))
          matchGroup.add(g2)
        }
      }
    }

    const show = () => {
      trailGroup.visible = mode === 'flight' || mode === 'tunnel'
      relGroup.visible = mode === 'tunnel'
      tunnelGroup.visible = mode === 'tunnel'
      matchGroup.visible = mode === 'matchup'
      markGroup.visible = mode !== 'matchup'
    }
    show()

    let raf = 0
    const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose()
          m.dispose()
        })
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [pitches, pzp, mode])

  if (!ok) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
        This browser has no WebGL — the grid above is the whole picture.
      </div>
    )
  }

  const btn = (m, txt) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      style={{
        padding: '2px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
        fontFamily: NUM_FONT,
        border: `1px solid ${mode === m ? C.orange : C.border}`,
        background: mode === m ? 'rgba(249,115,22,.12)' : 'transparent',
        color: mode === m ? C.orange : C.text3,
      }}
    >{txt}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
        {btn('flight', 'Flight')}
        {btn('tunnel', 'Release + tunnel')}
        {btn('matchup', 'Matchup')}
      </div>
      <div ref={mountRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {label ? `${label} · ` : ''}Catcher&apos;s view. Plate crossings are measured;
        the path between release and the plate is drawn from movement, not tracked —
        geometry, not telemetry. Matchup reads the bot&apos;s own per-zone profile:{' '}
        <b style={{ color: C.orange }}>orange</b> where damage outruns his usage,{' '}
        <b style={{ color: C.red }}>red</b> where he gets away with it, ✕ his kill zones.
      </div>
    </div>
  )
}
