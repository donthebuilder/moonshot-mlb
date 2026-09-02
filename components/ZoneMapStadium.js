'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
// The ink that ships is the ink that is asserted — check-palette owns this
// value, so the glyphs drawn on light tiles take it from there.
import { INK_DARK } from '../lib/palette'
import { pitchColor, PITCH_NAMES, zoneBox, zoneCell, inZone as pitchInZone } from '../lib/livePitches'
import { buildPark, lerp5, fieldPoint, GENERIC_DIMS, GENERIC_HEIGHTS } from '../lib/stadiumWorld'
import { makeComposer, enableShadows, loadPhotoSurfaces, loadSky, isCoarse } from '../lib/stadiumLook'
import { PARK_WALLS } from '../lib/parkWalls'
// The same sequential ramp the 2D grid paints its temp bands with. Importing
// it — rather than picking colours here — is what keeps the two maps from
// disagreeing about what "hot" looks like, and keeps this file free of hex.
import { seqColor, DIV_UP, DIV_DOWN, DIV_FLAT } from '../lib/scales'

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

export default function ZoneMapStadium({ pitches = [], pzp = null, zoneStats = null, zoneDetail = null, zoneCells = null, killZones = null, statLabel = '', label = '', venue = '' }) {
  const mountRef = useRef(null)
  const [hoverZone, setHoverZone] = useState(null)
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
    // the fog is the park's now (set in buildPark's dome block) — the old
    // 46..120 ft fog would have swallowed the wall

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
      command: { pos: [0.5, cy + 0.25, -5.7], look: [0, cy, 0], fov: 40 },
      flight:  { pos: [1.4, cy + 0.8, -13], look: [0, cy, 6], fov: 40 },
      tunnel:  { pos: [4.2, cy + 1.9, -19], look: [0, cy, 13], fov: 42 },
    }
    const shot = SHOT[mode] || SHOT.matchup
    const camera = new THREE.PerspectiveCamera(shot.fov, W / H, 0.1, 4000)
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

    // ── ONE FINGER SCROLLS THE PAGE (2026-08-31). Donovan: "using the 3D
    //    zone map on mobile is a little finicky or sticky."
    //
    //    It was not lag — it was a fight over the gesture. A WebGL canvas
    //    that claims one-finger drag inside a scrolling page means every
    //    swipe that begins on the chart is swallowed: the page refuses to
    //    move and the scene lurches instead. On a phone the chart is most of
    //    the viewport, so it is very hard to scroll PAST it at all.
    //
    //    Two fingers to orbit, one finger to scroll. That is the convention
    //    every embedded map uses, for exactly this reason, and it is the only
    //    arrangement where both gestures can coexist. Desktop is untouched —
    //    a mouse has no such ambiguity.
    const coarse = typeof window !== 'undefined'
      && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    if (coarse) {
      // One finger sideways orbits, one finger up or down scrolls the page.
      // touchAction 'pan-y' lets the browser keep the vertical axis, so the
      // canvas only ever receives horizontal movement — same arrangement as
      // the spray chart, and the reason two-finger-only was dropped: it fixed
      // scrolling at the cost of making the chart itself hard to move.
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }
      renderer.domElement.style.touchAction = 'pan-y'
    }
    controls.maxPolarAngle = Math.PI * 0.62
    controls.minDistance = 2.2
    // far enough back to see the park you are standing in
    controls.maxDistance = 420
    // Pan off, and the same calmed rotate/zoom as the spray chart. Panning a
    // grid whose whole subject is nine boxes in the middle can only lose it.
    controls.enablePan = false
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.75
    controls.dampingFactor = 0.075

    // ── THE PARK (2026-09-02). Donovan: "based in the same world, not on
    //    the same line — I like where each lived." This map keeps its own
    //    zone, its own camera and its own controls; what it gets is the
    //    spray chart's ballpark around its plate, from the one function
    //    that builds it (lib/stadiumWorld): the dusk dome, the rig, the
    //    grass, the infield, the wall with this venue's five numbers, the
    //    bowl, the props, the fielders. Same frame — home at the origin,
    //    catcher's-right on -x — so nothing here moved. A venue we have no
    //    walls for gets the generic park rather than no park.
    const walls = PARK_WALLS[venue] || null
    const dims = walls ? walls.d : GENERIC_DIMS
    const heights = walls ? walls.h : GENERIC_HEIGHTS
    buildPark(scene, {
      dims, heights, venue,
      P: fieldPoint, wallD: (a) => lerp5(dims, a), wallH: (a) => lerp5(heights, a),
      maxD: Math.max(...dims), SEG: 96,
    })
    // The park's rig is dusk-dim on purpose (the arcs are its light); the
    // zone's tiles and marks need a little of their own, close in, or the
    // matchup shading reads as mud from three feet away.
    const zoneLamp = new THREE.PointLight(0xfff2df, 1.1, 60)
    zoneLamp.position.set(0, 9, -7)
    scene.add(zoneLamp)
    // the same look as the spray chart (lib/stadiumLook); the AO radius is
    // scaled down because this camera stands feet, not hundreds of feet,
    // from what it looks at
    const desktop = !isCoarse()
    if (desktop) enableShadows(renderer, scene, Math.max(...dims))
    loadPhotoSurfaces(scene)
    loadSky(renderer, scene)
    const look = makeComposer(renderer, scene, camera, W, H, { ao: desktop, scale: 0.25 })

    const disposables = []
    const add = (o) => { scene.add(o); disposables.push(o); return o }

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

    // ── COMMAND (2026-09-01). The design doc's fourth view, never ported:
    //    "is he commanding it or losing it." Per pitch type, the CENTROID of
    //    tonight's plate crossings as a cross, and the 1σ ELLIPSE around it
    //    from the covariance of those crossings — the principal axes, so a
    //    type he is missing arm-side reads as a tilted oval, not a circle.
    //    Tight small ellipse near the edge = commanding it. Big ellipse
    //    across the middle = losing it. The individual marks stay under it,
    //    dimmed, so the ellipse never has to be taken on faith.
    //    Needs three crossings of a type for an ellipse; one for a cross.
    const cmdGroup = new THREE.Group(); add(cmdGroup)
    {
      const byType = new Map()
      live.forEach((p) => {
        if (!p.type) return
        if (!byType.has(p.type)) byType.set(p.type, [])
        byType.get(p.type).push(p)
      })
      const Z_CMD = 0.03
      const cline = (pts, hex, op) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: op }))
        cmdGroup.add(l)
        return l
      }
      byType.forEach((ps, type) => {
        const hex = pitchColor(type)
        const n = ps.length
        const mx = ps.reduce((a, p) => a + p.x, 0) / n
        const mz = ps.reduce((a, p) => a + p.z, 0) / n
        // the cross
        const arm = 0.11
        cline([PT(mx - arm, mz, Z_CMD), PT(mx + arm, mz, Z_CMD)], hex, 0.95)
        cline([PT(mx, mz - arm, Z_CMD), PT(mx, mz + arm, Z_CMD)], hex, 0.95)
        // the label, above and right of the cross
        const lbl = glyphSprite(`${type} ${n}`, hex, 40, 0.42)
        lbl.position.copy(PT(mx + 0.22, mz + 0.16, Z_CMD))
        cmdGroup.add(lbl)
        if (n < 3) return
        // covariance → principal axes
        let sxx = 0, szz = 0, sxz = 0
        ps.forEach((p) => { sxx += (p.x - mx) ** 2; szz += (p.z - mz) ** 2; sxz += (p.x - mx) * (p.z - mz) })
        sxx /= n - 1; szz /= n - 1; sxz /= n - 1
        const tr = sxx + szz, det = sxx * szz - sxz * sxz
        const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
        const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc)
        const theta = Math.abs(sxz) < 1e-9 ? (sxx >= szz ? 0 : Math.PI / 2) : Math.atan2(l1 - sxx, sxz)
        const a = Math.sqrt(l1), b = Math.sqrt(l2)
        const pts = []
        for (let i = 0; i <= 48; i++) {
          const t = (i / 48) * Math.PI * 2
          const ex = a * Math.cos(t), ez = b * Math.sin(t)
          pts.push(PT(mx + ex * Math.cos(theta) - ez * Math.sin(theta), mz + ex * Math.sin(theta) + ez * Math.cos(theta), Z_CMD))
        }
        cline(pts, hex, 0.9)
        // a faint fill so the oval reads as an area, not a wire. The shape
        // is built in world x/y directly from the same points, so it cannot
        // sit anywhere the outline does not.
        const shape = new THREE.Shape()
        pts.forEach((v, i) => { if (i === 0) shape.moveTo(v.x, v.y); else shape.lineTo(v.x, v.y) })
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false,
        }))
        fill.position.z = Z_CMD + 0.005
        cmdGroup.add(fill)
      })
    }

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
    const matchTiles = []
    {
      const use = {}; (pzp?.tendency || []).forEach((t) => { use[t.zone] = t.pct })
      const dmg = {}; (pzp?.damage || []).forEach((d) => { dmg[d.zone] = d })
      const kill = new Set(pzp?.kill_zones || [])
      // KILL ZONES ARE AN OVERLAY, NOT A SHADING SOURCE — and counting them
      // here was hiding the numbers. `hasProfile` decides which of the two
      // ways to COLOUR the grid: the starter's usage-vs-damage edge, or the
      // hitter's own season line. Kill zones can say nothing about either;
      // they are a separate fact drawn on top of whichever wins.
      //
      // With kill.size in this test, a bot payload that publishes kill_zones
      // but no `tendency` — which is a perfectly ordinary payload — took the
      // profile branch, found no usage for any zone, and drew nine empty
      // tiles while a full set of season zones sat unused in `zoneStats`.
      // That is "the zones no stats": the data was there and the branch was
      // wrong. Caught by rendering it with exactly that payload.
      const hasProfile = Object.keys(use).length > 0 || Object.keys(dmg).length > 0
      const uses = Object.values(use).filter((v) => Number.isFinite(v))
      const maxUse = uses.length ? Math.max(...uses) : 0
      const slgs = Object.values(dmg).map((d) => Number(d?.slg)).filter(Number.isFinite)
      const maxSlg = slgs.length ? Math.max(...slgs) : 0

      const tiles = matchTiles

      // Every edge first, then the maximum, then the loop. Two passes, because
      // a cell cannot know how loud it is until the whole grid has spoken.
      const edges = {}
      let maxEdge = 0
      if (hasProfile) {
        for (let zz = 1; zz <= 9; zz++) {
          if (use[zz] == null) continue
          const traffic = maxUse > 0 && Number.isFinite(use[zz]) ? use[zz] / maxUse : 0
          const damage = maxSlg > 0 && Number.isFinite(Number(dmg[zz]?.slg)) ? Number(dmg[zz].slg) / maxSlg : 0
          edges[zz] = damage - traffic
          maxEdge = Math.max(maxEdge, Math.abs(edges[zz]))
        }
      }
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
      const putTile = (cx, cy, tone, opacity, depth, zn) => {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(cw - GAP * 2, ch - GAP * 2, depth),
          new THREE.MeshLambertMaterial({ color: tone, transparent: true, opacity, side: THREE.DoubleSide }),
        )
        tile.position.copy(PT(cx, cy, -depth / 2 - 0.02))
        // The zone number rides on the mesh so a raycast hit answers "which
        // box" without any coordinate maths on the way back out.
        tile.userData.zone = zn
        tile.userData.baseOpacity = opacity
        matchGroup.add(tile)
        tiles.push(tile)
        return tile
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

        // ── THE FLAT MAP'S OWN NUMBERS, FIRST (2026-08-31). Donovan, with a
        //    screenshot of each: "make the 3D colour wise like that."
        //
        //    They disagreed because they were two different calculations. The
        //    flat grid weighs his xSLG against the arm's traffic and bleed,
        //    then divides by ABSOLUTE full-collision points (H_FULL / P_FULL)
        //    so a night where nothing collides reads as nothing. This file
        //    was doing damage/maxSlg − usage/maxUse, normalised to whichever
        //    nine cells happened to be on screen — a cruder model that
        //    guarantees a brightest cell every night whether or not anything
        //    is happening. On his card the flat map showed a real spread and
        //    this one showed nine identical blues.
        //
        //    So it is not recomputed here at all any more. ZoneMap hands the
        //    finished cells down and this draws them. Opacities mirror
        //    divTone's own floor/max (0.10 → 0.66) so the two grids land on
        //    the same tint for the same edge, and the ⚡/⚠ extremes get the
        //    lit ring the flat map gives them — which is the "point out the
        //    matchup better" ask: the two cells that decide the at-bat should
        //    not look like the seven that do not.
        const fc = zoneCells && (zoneCells[zn] || zoneCells[String(zn).padStart(2, '0')])
        if (fc && fc.strength != null) {
          const st = Math.min(1, Math.abs(fc.strength))
          if (st < 0.10) {
            tone = DEAD_TILE
            opacity = 0.30
            glyph = fc.mark || DIV_FLAT
            glyphCol = C.text2
          } else {
            tone = fc.hitterWins ? C.orange : C.blue
            opacity = 0.10 + 0.56 * st
            depth = 0.06 + st * 0.13
            glyph = fc.mark || (fc.hitterWins ? DIV_UP : DIV_DOWN)
            glyphCol = st >= 0.62 ? INK_DARK : C.text
          }
          const t = putTile(cx, cy, tone, opacity, depth, zn)
          // THE BIG NUMBER is his xSLG, exactly as on the flat map — the
          // thing the cell is actually about, rather than a symbol standing
          // in for it.
          if (fc.main && fc.main !== '—') {
            const n = textSprite(fc.main, glyphCol, 40, 0.40)
            n.position.copy(PT(cx, cy + ch * 0.10, GLYPH_Z))
            matchGroup.add(n)
          }
          if (fc.sub) {
            const sb = textSprite(fc.sub, C.text2, 22, 0.46)
            sb.position.copy(PT(cx, cy - ch * 0.20, GLYPH_Z))
            matchGroup.add(sb)
          }
          if (glyph) {
            const g3 = glyphSprite(glyph, glyphCol, 60, 0.15)
            g3.position.copy(PT(cx - cw * 0.30, cy + ch * 0.28, GLYPH_Z))
            matchGroup.add(g3)
          }
          // The lit ring on the two strongest cells.
          if (st >= 0.70) {
            const w2 = cw - GAP * 2, h2 = ch - GAP * 2
            const pts2 = [[-w2 / 2, -h2 / 2], [w2 / 2, -h2 / 2], [w2 / 2, h2 / 2], [-w2 / 2, h2 / 2], [-w2 / 2, -h2 / 2]]
            const rg = new THREE.BufferGeometry().setFromPoints(
              pts2.map(([dx, dy]) => PT(cx + dx, cy + dy, GLYPH_Z - 0.015)),
            )
            matchGroup.add(new THREE.Line(rg, new THREE.LineBasicMaterial({
              color: fc.hitterWins ? C.orange : C.blue, transparent: true, opacity: 0.95,
            })))
          }
          const num0 = glyphSprite(String(zn), C.text3, 40, 0.13)
          num0.position.copy(PT(cx - cw * 0.30, cy - ch * 0.30, GLYPH_Z))
          num0.material.opacity = 0.55
          matchGroup.add(num0)
          continue
        }

        const profileHere = hasProfile && use[zn] != null
        if (profileHere) {
          const edge = edges[zn] || 0
          // SCALED TO THE LOUDEST CELL ON THIS GRID, not to an absolute 1.
          // The old line was mag = min(1, |edge|), and real edges live around
          // 0.1–0.3 — so every tile landed within a hair of every other tile's
          // opacity and the whole grid came out one flat red. Dividing by the
          // grid's own maximum is the rule the flat map already states: the
          // brightest cell is always the story of the night.
          const mag = maxEdge > 0 ? Math.abs(edge) / maxEdge : 0
          if (mag < 0.14) {
            // Deadband. A cell where neither side has an edge worth naming is
            // NEUTRAL, not a faint version of a claim.
            tone = DEAD_TILE
            opacity = 0.30
            glyph = DIV_FLAT
            glyphCol = C.text2
          } else {
            // ORANGE vs BLUE, and the reason is the screenshot: orange and red
            // are neighbouring hues, and at tile opacity with a dark tone map
            // over them they were indistinguishable — "hard to decipher", and
            // he was right. divTone in lib/scales already settled this for the
            // whole site: warm against COOL, never warm against warm. Using
            // its pair here also frees RED to mean exactly one thing on this
            // grid, which is the kill-zone outline.
            tone = edge >= 0 ? C.orange : C.blue
            opacity = 0.30 + mag * 0.58
            depth = 0.06 + mag * 0.12
            // ▲/▼/· are the site's own signs, and they are the redundant
            // colour-blind-safe encoding — the grid stays readable in
            // greyscale, which two hues alone never are.
            glyph = edge >= 0 ? DIV_UP : DIV_DOWN
            glyphCol = mag >= 0.6 ? INK_DARK : C.text
          }
        } else if (hasStats) {
          // PER ZONE, not per grid. A profile that covers six zones used to
          // blank the other three; now each empty one falls through to the
          // season line on its own.
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

        putTile(cx, cy, tone, opacity, depth, zn)

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

      // ── THE KILL-ZONE RING. Donovan: "zone matches highlight, which is
      //    the main thing." A ✕ glyph on a tile is a mark among marks; a ring
      //    around the whole cell is the only thing on the grid with that
      //    shape, so it survives being small, being at an angle, and being
      //    next to eight other coloured boxes. Drawn in front of the tiles at
      //    GLYPH_Z so nothing can bury it — which is the mistake this file
      //    already made once with the numbers.
      const killSet = new Set(killZones || pzp?.kill_zones || [])
      killSet.forEach((zn) => {
        const z = Number(zn) - 1
        if (!(z >= 0 && z < 9)) return
        const { cx, cy } = tileAt(z)
        // A thin outline on the cell, not a filled disc. The first cut drew
        // a red wash plus a fat ring and they became the loudest thing on the
        // grid — a kill zone is one fact ABOUT a cell, not more important
        // than the number in it. Rendered, seen, thinned.
        const w = cw - GAP * 2, h = ch - GAP * 2
        const half = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]]
        const og = new THREE.BufferGeometry().setFromPoints(
          half.map(([dx, dy]) => PT(cx + dx, cy + dy, GLYPH_Z - 0.02)),
        )
        matchGroup.add(new THREE.Line(og, new THREE.LineBasicMaterial({
          color: C.red, transparent: true, opacity: 0.95,
        })))
        const x = glyphSprite('✕', C.red, 64, 0.17)
        x.position.copy(PT(cx + w * 0.32, cy + h * 0.32, GLYPH_Z - 0.02))
        matchGroup.add(x)
      })

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

    // ── HOVER. One raycast against the nine tiles on pointermove, which is
    //    cheap enough not to need throttling at this count. Only in matchup
    //    mode: the other two draw no tiles, and hovering nothing would just
    //    flicker the popout.
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let lastHover = null
    const onMove = (e) => {
      if (mode !== 'matchup' || !matchTiles.length) return
      const r = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(matchTiles, false)[0]
      const zn = hit ? hit.object.userData.zone : null
      if (zn !== lastHover) {
        lastHover = zn
        setHoverZone(zn)
        // Lift the hovered tile rather than recolouring it — colour on this
        // grid already means something, and a second meaning on the same
        // channel is how a legend stops being true.
        matchTiles.forEach((t) => {
          const on = t.userData.zone === zn
          t.material.opacity = on
            ? Math.min(1, t.userData.baseOpacity + 0.30)
            : t.userData.baseOpacity
          t.scale.setScalar(on ? 1.06 : 1)
        })
      }
    }
    const onLeave = () => {
      if (lastHover == null) return
      lastHover = null
      setHoverZone(null)
      matchTiles.forEach((t) => { t.material.opacity = t.userData.baseOpacity; t.scale.setScalar(1) })
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    const show = () => {
      trailGroup.visible = mode === 'flight' || mode === 'tunnel'
      relGroup.visible = mode === 'tunnel'
      tunnelGroup.visible = mode === 'tunnel'
      matchGroup.visible = mode === 'matchup'
      markGroup.visible = mode !== 'matchup'
      cmdGroup.visible = mode === 'command'
      // under the ellipses the marks are evidence, not the subject
      markGroup.traverse((o) => { if (o.material && o.userData.baseOp == null) o.userData.baseOp = o.material.opacity ?? 1 })
      markGroup.traverse((o) => { if (o.material) o.material.opacity = mode === 'command' ? o.userData.baseOp * 0.45 : o.userData.baseOp })
    }
    show()

    let raf = 0
    const tick = () => { controls.update(); look.render(); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose()
          m.dispose()
        })
      })
      look.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [pitches, pzp, zoneStats, zoneCells, mode, venue])

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
  const needsPitches = { flight: true, tunnel: true, command: true, matchup: false }
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
        {btn('command', 'Command')}
        {btn('matchup', 'Matchup')}
      </div>
      {/* ── THE HEIGHT IS ON THE DIV, NOT ON THE CANVAS (2026-08-31).
              Donovan: "when i click a filter it's like it sends me up almost
              like a refresh."

              That was a layout collapse, not a reload. This container had no
              height of its own — it was only as tall as the canvas inside it.
              Changing a filter changes `hits`, which is in the effect's deps,
              so React runs the cleanup (canvas removed) before the effect
              (new canvas appended). For that one frame the div is 0px, the
              page gets shorter than the scroll position, and the browser
              snaps you upward. Every filter click paid for it.

              minHeight + aspectRatio restate Math.max(320, W * 0.62) in CSS, so
              the box holds its size whether or not a canvas is in it. The
              rebuild still happens; it just stops moving the page. */}
          <div style={{ position: 'relative' }}>
            <div ref={mountRef} style={{
              width: '100%', minHeight: 320, aspectRatio: '1 / 0.62',
              borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
            }} />

            {/* THE POPOUT. Same lines the flat grid shows, because they are
                literally the same strings — ZoneMap builds them once and
                hands them down, so the two maps cannot drift apart about what
                a zone says. Pinned to a corner rather than following the
                cursor: the cursor is busy orbiting the scene, and a panel
                that chases it while you drag is unusable. */}
            {hoverZone != null && zoneDetail?.[hoverZone] && (
              <div style={{
                position: 'absolute', right: 10, bottom: 10, zIndex: 4,
                width: 196, pointerEvents: 'none',
                background: C.scrim, backdropFilter: 'blur(6px)',
                border: `1px solid ${zoneDetail[hoverZone].kill ? C.orange : C.border2}`,
                borderRadius: 9, padding: '8px 10px',
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 900, marginBottom: 3,
                  color: zoneDetail[hoverZone].kill ? C.red : C.text,
                }}>
                  {zoneDetail[hoverZone].title}
                  {zoneDetail[hoverZone].kill ? ' · KILL ZONE' : ''}
                </div>
                {zoneDetail[hoverZone].lines.map((ln, i) => (
                  <div key={i} style={{
                    fontSize: 9, fontFamily: NUM_FONT, lineHeight: 1.6,
                    color: /HIS ZONE|arm wins/.test(ln) ? C.orange : C.text2,
                  }}>{ln}</div>
                ))}
              </div>
            )}
          </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {label ? `${label} · ` : ''}Catcher&apos;s view.{' '}
        <span className="zm3d-touch">Swipe sideways to orbit — up and down scrolls the page.{' '}</span>
        {hasPitches && mode === 'command'
          ? <>Command: one cross per pitch type at the centre of tonight&apos;s crossings, and the
            1σ oval around it — small and near an edge means he is commanding it, wide across
            the middle means he is losing it. Three crossings of a type before an oval is drawn.{' '}</>
          : hasPitches
          ? <>Plate crossings are measured; the path between release and the plate is
            drawn from movement, not tracked — geometry, not telemetry.{' '}</>
          : <>No tracked pitches yet, so Flight and Release + tunnel are off — they are
            drawn from real crossings and there are none to draw.{' '}</>}
        {!hasMatchup && !hasZoneStats
          ? <>There is no pitcher profile and no published season zones for this
            card, so Matchup has nothing to shade — the grid is drawn empty on
            purpose, numbered so you can still see which box is which.</>
          : hasMatchup
          ? <>Matchup reads the bot&apos;s own per-zone profile, scaled to the loudest cell
            on this grid:{' '}
            <b style={{ color: C.orange }}>orange ▲</b> where the hitter&apos;s damage outruns
            the arm&apos;s usage,{' '}<b style={{ color: C.blue }}>blue ▼</b> where the arm gets
            away with it, grey · where neither has an edge worth naming.{' '}
            <b style={{ color: C.red }}>Red outline</b> is a kill zone — the one thing red
            means here.</>
          : <>No pitcher profile is published for this card, so the grid falls back to{' '}
            {statLabel ? `${String(statLabel).toLowerCase()}'s` : 'the hitter\u2019s'} own
            per-zone season line — the same numbers and the same ramp as the flat map.
            It is a heat map, not an edge.</>}
      </div>
    </div>
  )
}
