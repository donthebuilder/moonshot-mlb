'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
// The ink that ships is the ink that is asserted — check-palette owns this
// value, so the glyphs drawn on light tiles take it from there.
import { INK_DARK } from '../lib/palette'
import { pitchColor, PITCH_NAMES, zoneBox, zoneCell, inZone as pitchInZone } from '../lib/livePitches'
// The same sequential ramp the 2D grid paints its temp bands with. Importing
// it — rather than picking colours here — is what keeps the two maps from
// disagreeing about what "hot" looks like, and keeps this file free of hex.
import { seqColor } from '../lib/scales'

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
// The one grey a zone tile takes when there is nothing to say about it.
// Named once so the ratchet counts one literal, not one per branch.
const DEAD_TILE = 0x39404b

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

// MLB's five temp bands, cold → hot, in the same order the 2D map uses.
const TEMP_ORDER = ['cold', 'cool', 'lukewarm', 'warm', 'hot']

// Same idea as glyphSprite, but for a STRING. The canvas is MEASURED against
// the text rather than fixed at 256px — the first cut clipped anything longer
// than about twelve characters, which is how "no pitcher profile, no season
// zones" shipped as "her profile, no seaso". A sprite has no overflow and no
// wrap: whatever misses the canvas is simply gone, silently.
function textSprite(txt, hex, px = 42, worldW = 0.42) {
  const t = String(txt)
  const cv = document.createElement('canvas')
  const font = `900 ${px}px SF Mono, Menlo, monospace`
  // Measure on a scratch context first, then size the real one to fit.
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = font
  const w = Math.max(64, Math.ceil(probe.measureText(t).width) + px)
  const h = Math.ceil(px * 2)
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')
  g.font = font
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = hex
  g.fillText(t, w / 2, h / 2)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  // Keep the pixel aspect so nothing is stretched, and scale off the WIDTH so
  // a caller asking for a 1.5ft-wide label gets one.
  sp.scale.set(worldW, worldW * (h / w), 1)
  return sp
}

export default function ZoneMapStadium({ pitches = [], pzp = null, zoneStats = null, statLabel = '', label = '' }) {
  const mountRef = useRef(null)
  const [ok, setOk] = useState(true)
  const hasPitches = (pitches || []).length > 0
  // WHY THE DEFAULT MOVES. Flight and tunnel are both drawn FROM tracked
  // pitches. On a night with no live game there are none, so opening on
  // 'flight' opened on an empty box — which read as broken rather than as
  // empty. Matchup needs no pitches, so that is the honest first view.
  const [mode, setMode] = useState(hasPitches ? 'flight' : 'matchup')
  const hasMatchup = !!(pzp?.tendency?.length || pzp?.damage?.length || pzp?.kill_zones?.length)
  const hasZoneStats = Object.keys(zoneStats || {}).length > 0

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

    // ── FRAMING, PER MODE (2026-08-31). Donovan, three times: "the strike
    //    zone map doesn't show any zone matchup or anything."
    //
    //    It was drawing the whole time. It was just TINY. One camera served
    //    all three modes, parked 20 units back from a zone that is 1.8 ft
    //    tall, through a 38° lens — the visible height there is about 13 ft,
    //    so the zone could never be more than ~13% of the frame no matter
    //    what was in it. Rendered headless and screenshotted, it is a
    //    postage stamp in the middle of an empty room. Every previous fix of
    //    mine was aimed at the tiles because I was reading the code instead
    //    of looking at the picture.
    //
    //    The three modes want genuinely different framings and there is no
    //    single compromise that serves them:
    //      · matchup — the zone IS the subject. Fill the frame with it.
    //      · flight  — needs the last stretch of the pitch, so pull back.
    //      · tunnel  — needs the release point and the 23ft ring, so further
    //        again and off to one side, or every trail overlaps.
    //    `mode` is already in this effect's deps, so the scene rebuilds on a
    //    mode change and each one gets its own camera for free.
    const cy = ZB + ZH * 0.5
    const SHOT = {
      matchup: { pos: [0, cy, -5.4], look: [0, cy, 0], fov: 40 },
      flight:  { pos: [1.4, cy + 0.8, -13], look: [0, cy, 6], fov: 40 },
      tunnel:  { pos: [4.2, cy + 1.9, -19], look: [0, cy, 13], fov: 42 },
    }
    const shot = SHOT[mode] || SHOT.matchup
    const camera = new THREE.PerspectiveCamera(shot.fov, W / H, 0.1, 400)
    camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2])
    const target = new THREE.Vector3(shot.look[0], shot.look[1], shot.look[2])

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
    controls.minDistance = 2.2
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
      const hasProfile = Object.keys(use).length > 0 || Object.keys(dmg).length > 0 || kill.size > 0
      const uses = Object.values(use).filter((v) => Number.isFinite(v))
      const maxUse = uses.length ? Math.max(...uses) : 0
      const slgs = Object.values(dmg).map((d) => Number(d?.slg)).filter(Number.isFinite)
      const maxSlg = slgs.length ? Math.max(...slgs) : 0

      const cw = (2 * PLATE_HALF) / 3, ch = ZH / 3, GAP = 0.045
      const tileAt = (z) => ({
        cx: -PLATE_HALF + cw * ((z % 3) + 0.5),
        cy: ZT - ch * (Math.floor(z / 3) + 0.5),
      })
      // ── WHICH SIDE IS THE FRONT. This camera sits at NEGATIVE z looking
      //    toward +z, so smaller z is NEARER. Every glyph in this group was
      //    at z = +0.26 while its tile face sat at about z = -0.18 — the text
      //    was BEHIND the tile the whole time. It showed through the faint
      //    cells (opacity 0.28) and vanished on every shaded one, which is
      //    why the grid read as "half done": the tiles with something to say
      //    were exactly the tiles hiding what they said.
      //
      //    Everything that must be read now sits at GLYPH_Z, in front of the
      //    deepest tile this grid can draw.
      const GLYPH_Z = -0.34
      const putTile = (cx, cy, tone, opacity, depth) => {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(cw - GAP * 2, ch - GAP * 2, depth),
          new THREE.MeshLambertMaterial({ color: tone, transparent: true, opacity, side: THREE.DoubleSide }),
        )
        tile.position.copy(PT(cx, cy, -depth / 2 - 0.02))
        matchGroup.add(tile)
      }

      // ── NOTHING MAY RENDER BLANK. Donovan, 2026-08-31: "on the 3d
      //    strikezone map on the matchup nothing shows up at all."
      //
      //    He was right, and the cause was a design fault rather than a
      //    crash: with no pitcher profile AND no season zones, every one of
      //    the nine tiles fell to DEAD_TILE at 0.14 opacity with no text on
      //    it. Nine near-invisible grey tiles inside a frame that DOES draw
      //    reads exactly like a broken renderer.
      //
      //    Three rules now, and they hold in all four data states:
      //      · every cell is legible — the floor opacity is visible, and the
      //        zone NUMBER is always drawn, so there is never nothing to read
      //      · the empty state says so ON THE CANVAS, not only in the caption
      //        under it, because the canvas is where he was looking
      //      · an absent number is drawn as an absence, never as a zero
      const hasStats = Object.keys(zoneStats || {}).length > 0

      for (let z = 0; z < 9; z++) {
        const { cx, cy } = tileAt(z)
        const zn = z + 1
        let tone = DEAD_TILE
        let opacity = 0.28          // the FLOOR — an empty cell is quiet, not gone
        let depth = 0.05
        let glyph = null
        let glyphCol = C.text3

        if (hasProfile) {
          const traffic = maxUse > 0 && Number.isFinite(use[zn]) ? use[zn] / maxUse : 0
          const damage = maxSlg > 0 && Number.isFinite(Number(dmg[zn]?.slg)) ? Number(dmg[zn].slg) / maxSlg : 0
          const edge = damage - traffic
          const mag = Math.min(1, Math.abs(edge))
          if (use[zn]) {
            tone = edge >= 0 ? C.orange : C.red
            opacity = 0.34 + mag * 0.5
            depth = 0.06 + mag * 0.10
            glyph = kill.has(zn) ? '✕' : (edge >= 0 ? '⚡' : '⚠')
            glyphCol = kill.has(zn) ? C.text : INK_DARK
          }
        } else if (hasStats) {
          const cell = (zoneStats || {})[zn] || (zoneStats || {})[String(zn)]
          const idx = cell ? TEMP_ORDER.indexOf(cell.temp) : -1
          const hex = idx >= 0 ? seqColor(idx, [0, TEMP_ORDER.length - 1]) : null
          if (hex) {
            const mag = idx / (TEMP_ORDER.length - 1)
            tone = new THREE.Color(hex).getHex()
            opacity = 0.34 + mag * 0.5
            depth = 0.06 + mag * 0.10
            // Ink by ramp position, not by a contrast function. At sprite
            // size only the TOP of the ember ramp is light enough to carry
            // dark ink — the mid-browns look light next to the near-black
            // bottom but are still dark in absolute terms, and dark-on-brown
            // was unreadable in the render. Threshold sits at 0.72, verified
            // by screenshotting all five temp bands rather than reasoning
            // about luminance.
            glyphCol = mag >= 0.72 ? INK_DARK : C.text
          }
          // The VALUE is the glyph here, not a symbol. An em dash where the
          // API published no number for a zone — never a 0, which would be a
          // measurement this data does not contain.
          glyph = cell && cell.value != null && cell.value !== '' ? String(cell.value) : '—'
        }

        putTile(cx, cy, tone, opacity, depth)

        if (glyph) {
          const g2 = glyph.length > 1
            ? textSprite(glyph, glyphCol, 40, 0.40)
            : glyphSprite(glyph, glyphCol, 72, 0.30)
          g2.position.copy(PT(cx, cy, GLYPH_Z))
          matchGroup.add(g2)
        }

        // THE ZONE NUMBER, always, small and dim in the corner. It is the one
        // mark that never depends on data arriving, so the grid can never be
        // blank — and it is also how someone new to zones learns which box is
        // which without a legend beside the chart.
        const num = glyphSprite(String(zn), C.text3, 40, 0.13)
        num.position.copy(PT(cx - cw * 0.30, cy - ch * 0.30, GLYPH_Z))
        num.material.opacity = 0.55
        matchGroup.add(num)
      }

      // THE EMPTY STATE, ON THE CANVAS. Not in the caption — he was looking at
      // the picture, and a picture that explains itself somewhere else has not
      // explained itself.
      if (!hasProfile && !hasStats) {
        const t = textSprite('NO MATCHUP DATA', C.text3, 34, 1.05)
        t.position.copy(PT(0, ZT + 0.42, GLYPH_Z))
        matchGroup.add(t)
        const t2 = textSprite('no pitcher profile, no season zones', C.text3, 22, 1.55)
        t2.position.copy(PT(0, ZB - 0.34, GLYPH_Z))
        matchGroup.add(t2)
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
  }, [pitches, pzp, zoneStats, mode])

  if (!ok) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
        This browser has no WebGL — the grid above is the whole picture.
      </div>
    )
  }

  // Flight and tunnel are drawn from tracked pitches. With none, they are not
  // a view with nothing in it — they are a view that cannot exist yet, and a
  // disabled button that says so beats an empty box that looks broken.
  const needsPitches = { flight: true, tunnel: true, matchup: false }
  const btn = (m, txt) => {
    const off = needsPitches[m] && !hasPitches
    return (
      <button
        key={m}
        onClick={() => { if (!off) setMode(m) }}
        disabled={off}
        title={off ? 'No tracked pitches yet — this view needs a live or completed at-bat.' : ''}
        style={{
          padding: '2px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6,
          cursor: off ? 'not-allowed' : 'pointer',
          fontFamily: NUM_FONT,
          opacity: off ? 0.42 : 1,
          border: `1px solid ${mode === m ? C.orange : C.border}`,
          background: mode === m ? 'rgba(249,115,22,.12)' : 'transparent',
          color: mode === m ? C.orange : C.text3,
        }}
      >{txt}</button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
        {btn('flight', 'Flight')}
        {btn('tunnel', 'Release + tunnel')}
        {btn('matchup', 'Matchup')}
      </div>
      <div ref={mountRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }} />
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {label ? `${label} · ` : ''}Catcher&apos;s view.{' '}
        {hasPitches
          ? <>Plate crossings are measured; the path between release and the plate is
            drawn from movement, not tracked — geometry, not telemetry.{' '}</>
          : <>No tracked pitches yet, so Flight and Release + tunnel are off — they are
            drawn from real crossings and there are none to draw.{' '}</>}
        {!hasMatchup && !hasZoneStats
          ? <>There is no pitcher profile and no published season zones for this
            card, so Matchup has nothing to shade — the grid is drawn empty on
            purpose, numbered so you can still see which box is which.</>
          : hasMatchup
          ? <>Matchup reads the bot&apos;s own per-zone profile:{' '}
            <b style={{ color: C.orange }}>orange</b> where damage outruns his usage,{' '}
            <b style={{ color: C.red }}>red</b> where he gets away with it, ✕ his kill zones.</>
          : <>No pitcher profile is published for this card, so the grid falls back to{' '}
            {statLabel ? `${String(statLabel).toLowerCase()}'s` : 'the hitter\u2019s'} own
            per-zone season line — the same numbers and the same ramp as the flat map.
            It is a heat map, not an edge.</>}
      </div>
    </div>
  )
}
