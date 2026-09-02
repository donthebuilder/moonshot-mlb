'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT } from '../lib/theme'
import { catColor } from '../lib/scales'
import { solveFlight } from '../lib/trajectory'
// Seating shape — the half of a park parkWalls.js does not describe. Falls
// back to a plain two-tier ring for any venue it has no entry for, so a park
// we have walls for but no bowl for still draws.
import { buildPark } from '../lib/stadiumWorld'
import { makeComposer, enableShadows, loadPhotoSurfaces, loadSky, isCoarse } from '../lib/stadiumLook'
import { resultColor, isNonHrHit } from '../lib/resultColor'
import { shapeFor, resultScale } from '../lib/pitchShape'

// 🏟 THE STADIUM VIEW — second pass (2026-08-29, "please make better").
//
// The first cut proved the geometry and looked like a wireframe floating in a
// void: near-black grass on a near-black sky, an invisible wall, thread-thin
// arcs, and a camera parked so far back the park filled a third of the frame.
// This pass makes it read as a BALLPARK at first glance:
//
//   · mowing stripes — alternating ring bands of green, the single cheapest
//     "this is a baseball field" signal there is
//   · a real infield: dirt arc, grass diamond, mound, plate, three bases
//   · a warning track hugging the wall, shaped by the wall's own distances
//   · an opaque wall with a lit top rail and the park's DISTANCE NUMBERS
//     painted on it at the five published anchors, like the real fence
//   · arcs as glowing tubes for balls that reached the fence (thin faint
//     lines for the rest, so 300 outs never bury 12 homers)
//   · the camera auto-fits to the park's deepest fence, so Fenway and
//     Petco both fill the frame
//
// Everything factual is unchanged from pass one: same solver, same wall
// test, same colours-by-verdict (orange over, amber off the wall, grey in
// play), same "geometry, not telemetry" caption. The 2D chart stays the
// fallback and the screen-reader version — this is still additive.

const DEG = Math.PI / 180

export function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}

const lerp5 = (arr, ang) => {
  const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
  const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
  return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
}

// Distance number as a sprite texture — three.js has no text; a small canvas
// does. Drawn once per anchor, cached per call, disposed with the scene.
function numberSprite(text) {
  const cv = document.createElement('canvas')
  cv.width = 128; cv.height = 64
  const g = cv.getContext('2d')
  g.font = '900 44px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#f4f4f5'
  g.globalAlpha = 0.92
  g.fillText(text, 64, 34)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const s = new THREE.Sprite(m)
  s.scale.set(26, 13, 1)
  return s
}

// A short line of text as a sprite. numberSprite() above is tuned for a
// two- or three-digit wall number; this one is a phrase, so it measures the
// text and sizes its own canvas rather than cropping at 128px.
function labelSprite(text, hex) {
  const cv = document.createElement('canvas')
  const g0 = cv.getContext('2d')
  g0.font = '900 40px SF Mono, Menlo, monospace'
  const w = Math.ceil(g0.measureText(text).width) + 24
  cv.width = w; cv.height = 60
  const g = cv.getContext('2d')
  g.font = '900 40px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = hex
  g.globalAlpha = 0.95
  g.fillText(text, w / 2, 32)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
  const sp = new THREE.Sprite(m)
  sp.scale.set(w * 0.155, 9.2, 1)
  return sp
}

// 🌬 WIND — THE SAME HONESTY THE 2D CHART ALREADY ENFORCES.
//
// 2026-08-30, Donovan: "i want to see wind on the 3d chart as well."
//
// SprayField.js has carried wind since 08-24 and its comment there is the
// binding constraint, restated here because this file draws in world space and
// the temptation to use the compass degrees is stronger:
//
//   weather_wind_deg IS A COMPASS BEARING, and the payload publishes no park
//   orientation, so there is no way to turn 113° into "toward right field" for
//   a given yard. Drawing streaks off the degrees would point them somewhere
//   unrelated to the field underneath them — confidently wrong, which is worse
//   than absent.
//
// weather_wind_direction_label IS park-relative, and the six values it takes
// resolve to out / in / across. So this draws the COMPONENT THAT MATTERS FOR
// CARRY and claims nothing finer. A crosswind is drawn on the axis without
// picking a side, because left-to-right versus right-to-left is not in the
// data either.
//
// The bearing convention matches P() below: 0° is straight out to centre,
// which in this scene's world space is +Z.
const WIND_DIR = (toDeg) => new THREE.Vector3(-Math.sin(toDeg * DEG), 0, Math.cos(toDeg * DEG)).normalize()

export default function SprayFieldStadium({ hits = [], dims, heights, venue = '', wind = null, title = '', subtitle = '', live = false }) {
  const mountRef = useRef(null)
  const tipRef = useRef(null)      // the hover readout div — driven directly, no re-render churn
  const replayRef = useRef(null)   // set by the effect to the replay function
  const [ok, setOk] = useState(true)

  // ── MOTION MODES + AUTO-ORBIT (2026-09-01). The prototype had LIVE /
  //    REPLAY / HOLD and an orbit toggle; the repo shipped with ▶ replay
  //    alone. They come back as state the TICK reads through refs, so
  //    flipping one never rebuilds the scene (the effect's deps are the
  //    data, not the mode):
  //      · LIVE   — on a live page, only the ball that just landed flies
  //                 when the feed adds one; everything else holds. Without
  //                 this, every new ball in play re-flew the whole game.
  //      · REPLAY — ▶ flies the whole set in sequence, as before.
  //      · HOLD   — nothing moves: no flights, no hover flight, no sway.
  //                 The still picture, for reading or for a screenshot.
  //      · ORBIT  — a slow turn around the park until you grab it.
  const [motion, setMotion] = useState(live ? 'live' : 'replay')
  const [orbit, setOrbit] = useState(false)
  const motionRef = useRef(motion); motionRef.current = motion
  const orbitRef = useRef(orbit); orbitRef.current = orbit
  const prevCountRef = useRef(0)

  // Flattened out of the object so the effect's dependency list can be four
  // primitives instead of an object literal the caller rebuilds every render —
  // which would tear down and rebuild the whole scene on every parent update.
  const windMph = Number(wind?.mph) > 0 ? Number(wind.mph) : 0
  const windLabel = String(wind?.label || '')
  const windTo = Number.isFinite(Number(wind?.to)) ? Number(wind.to) : 0
  const windHex = String(wind?.color || C.text3)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }

    const W = mount.clientWidth || 640
    const H = Math.max(340, Math.round(W * 0.6))

    const scene = new THREE.Scene()
    // A vertical gradient sky, not a flat black — cheap: a big inverted dome
    // would cost a texture; fog against a slightly-blue night does the job.
    scene.background = new THREE.Color(0x0d0f14)
    scene.fog = new THREE.Fog(0x0d0f14, 900, 1900)

    // ── DUSK (2026-08-31). A flat clear colour is the single loudest tell
    //    that a scene was rendered rather than shot: real sky has a vertical
    //    ramp, a horizon that glows, and something in it. Costs one canvas
    //    texture on a BackSide sphere, drawn before everything and depth-
    //    written by nothing, so it never fights the park for the z-buffer.
    const radialTex = (stops) => {
      const cv = document.createElement('canvas')
      cv.width = 256; cv.height = 256
      const g = cv.getContext('2d')
      const rg = g.createRadialGradient(128, 128, 2, 128, 128, 128)
      stops.forEach(([o, c]) => rg.addColorStop(o, c))
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256)
      return new THREE.CanvasTexture(cv)
    }

    // A soft halo rides the flying ball — the difference between a lit
    // object and a sphere with a colour on it.
    const haloTex = radialTex([
      [0, 'rgba(255,255,255,.85)'], [0.28, 'rgba(255,255,255,.22)'], [1, 'rgba(255,255,255,0)'],
    ])
    const makeHalo = (hex) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: hex, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
      sp.scale.set(16, 16, 1)
      return sp
    }


    const wallD = (ang) => lerp5(dims, ang)
    const wallH = (ang) => lerp5(heights, ang)
    const maxD = Math.max(...dims)

    const camera = new THREE.PerspectiveCamera(44, W / H, 1, 4000)
    // Fit the park: high enough to see the shape, close enough to fill the
    // frame, slightly first-base side like a broadcast camera.
    // ── THE OPENING FRAME, AND IT IS NOT ONE FRAME (2026-08-31).
    //
    //    "The 3D should open a little more zoomed out" was a DESKTOP note,
    //    and 0.21/0.60/-0.76 answered it there. On his phone the same numbers
    //    put the park in the middle third of a tall narrow canvas with dead
    //    black above and below it — "can the spray chart open up from that
    //    distance." Same camera, opposite problem, because the aspect ratio
    //    is the thing that changed and the camera never knew.
    //
    //    A portrait viewport is narrow, so a park fitted by WIDTH is small;
    //    the fix is to come in and drop the elevation, which trades the
    //    top-down overview — worth little on a phone — for a park that fills
    //    the frame. Keyed off the canvas's own aspect rather than a media
    //    query, because what matters is the shape of THIS box, not the
    //    device: the same chart in a narrow desktop column has the same
    //    problem.
    const narrow = W / H < 1.15
    camera.position.set(
      maxD * (narrow ? 0.14 : 0.21),
      maxD * (narrow ? 0.46 : 0.60),
      -maxD * (narrow ? 0.58 : 0.76),
    )
    const target = new THREE.Vector3(0, 6, maxD * 0.40)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    // ACES rolls the highlights off instead of clipping them: the top rail and
    // the arc cores read as HOT rather than as flat white. Exposure under 1
    // keeps the midtones where the rest of this file was tuned.
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.88
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.maxPolarAngle = Math.PI * 0.47
    controls.minDistance = maxD * 0.16
    controls.maxDistance = maxD * 1.8
    controls.enableDamping = true

    // ── MAKING IT DRIVEABLE (2026-08-31). Donovan: "the spray chart was hard
    //    to manoeuvre." Four separate things were fighting the drag, and no
    //    one of them was the whole problem:
    //
    //  1. PAN WAS ON. A right-drag moved the ORBIT TARGET, not the camera --
    //     so the park slid out of frame and no control brought it back. That
    //     is the one that turns "awkward" into "lost", and there is no reason
    //     to pan a chart with a fixed subject in the middle of it.
    //  2. Rotate and zoom ran at the library defaults, tuned for a model
    //     viewer filling a window, not a 340px panel. In a small box the same
    //     pixel drag is a much larger angle.
    //  3. The distance clamps were narrow at both ends: no getting in close
    //     to a landing spot, and zooming out past the point where the park is
    //     worth looking at.
    //  4. The handheld drift, below -- the big one.
    controls.enablePan = false
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.75
    controls.dampingFactor = 0.075

    // Two fingers to orbit on a touch device, one to scroll past the chart —
    // same reasoning as ZoneMapStadium: a canvas that claims one-finger drag
    // inside a scrolling page swallows every swipe that starts on it, and on
    // a phone this chart is most of the viewport.
    if (typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(pointer: coarse)').matches) {
      // REVISED from two-finger-only. Requiring two fingers fixed the page
      // scrolling but made the chart itself hard to move, which is the
      // complaint that came back. touchAction 'pan-y' serves both: the
      // BROWSER keeps vertical swipes and scrolls with them, and only
      // horizontal movement is ever delivered to the canvas. One finger
      // sideways orbits, one finger up or down scrolls past, and neither
      // gesture has to be learned.
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }
      renderer.domElement.style.touchAction = 'pan-y'
    }

    // 🪞 THE MIRROR FIX (2026-08-29). Donovan: "i think the spray chart is
    // flipped" -- confirmed against the 2D chart (correct) and this one
    // (was backwards for every player, not a handedness-specific thing).
    // Root cause: this camera sits BEHIND home plate at negative Z, looking
    // out toward the field at positive Z ("slightly first-base side like a
    // broadcast camera", camera.position above) -- a 180°-yaw view compared
    // to three.js's own default camera, which looks down -Z. Facing +Z
    // instead of the default -Z swaps which world axis reads as screen-right
    // to a viewer: +X reads as screen-LEFT here, not screen-right. The old
    //  was written as if facing -Z (i.e., copied straight from
    // SprayField.js's 2D , where it's correct), so every LF ball
    // (negative ang) landed on world +X -- rendered on the viewer's RIGHT --
    // and every RF ball landed on the viewer's LEFT. Negating x is the one
    // fix: every position in this file (dots, tubes, wall panels, the number
    // sprites) already routes through this single P(), so flipping it here
    // flips the whole scene together and nothing drifts out of alignment.
    const P = (r, ang) => new THREE.Vector3(-r * Math.sin(ang * DEG), 0, r * Math.cos(ang * DEG))
    const SEG = 96

    const world = buildPark(scene, { dims, heights, venue, P, wallD, wallH, maxD, SEG })
    const bowl = world.bowl
    // THE LOOK (2026-09-02): bloom on everything, AO + shadow map on desktop,
    // photo surfaces and the HDRI sky if the files are there — lib/stadiumLook
    const desktop = !isCoarse()
    if (desktop) enableShadows(renderer, scene, maxD)
    loadPhotoSurfaces(scene)
    loadSky(renderer, scene)
    const look = makeComposer(renderer, scene, camera, W, H, { ao: desktop, scale: 1 })


    // ── THE BALLS. Same verdicts as pass one; the drawing is what changed:
    //    fence-reaching balls get glowing tubes, the rest faint lines.
    // ── FIVE COLOURS, NOT FOUR (2026-08-31). Donovan: "I want the hits that
    //    aren't home runs at least lit differently, like the other spray
    //    chart."
    //
    //    This file had HR / off-the-wall / HIT / OUT, and that third bucket
    //    was ONE grey for a single, a double and a triple alike. The flat
    //    chart six inches away has always drawn red / purple / green / blue /
    //    near-black. Same balls, same page, two vocabularies — and the flat
    //    one is the vocabulary the legend under it actually describes.
    //
    //    So the colour now comes from lib/resultColor, which both charts
    //    import. Not copied here: resolved at call time from one function, so
    //    they cannot drift and neither freezes a theme.
    //
    //    OFF-THE-WALL KEEPS ITS OWN AMBER, deliberately. It is not a result —
    //    the payload's event for one of those is usually "double" — it is a
    //    fact about THIS PARK that only the 3D view can state, and it is the
    //    reason the park-test control exists. Folding it into the double's
    //    green would delete the one thing this chart knows that the flat one
    //    does not.
    const COL_WALL = new THREE.Color(0xfbbf24)

    // ── THE MARKS THE FLAT CHART HAS HAD ALL ALONG (2026-09-01). Its legend
    //    reads "ring = barrel · shape = pitch · size = result" and none of the
    //    three had reached this field: every ball was one sphere, one size,
    //    so once the HH / BRL filters put the right balls in the park you
    //    still could not tell a barrel from a can of corn. Same table
    //    (lib/pitchShape), same six families, built once per scene:
    //      ● four-seam   ▼ sinker   ▲ slider/sweeper   ■ change/split
    //      ◆ cutter      ✚ curve/knuckle
    //    All solid bodies of about the sphere's volume, so a shape change
    //    does not read as a size change.
    // BIGGER, AND THE OUTS VISIBLE (2026-09-02). Donovan: "make the landing
    // dots on the spray a little bigger or more visible, and the outs too."
    // R was 2.6; and an out's dot was near-black on dark grass by design
    // ("kept nearly silent") — silent had become invisible once the park
    // got real. Every dot now sits on a pale rim ring, so it reads against
    // grass, dirt, track or seats; the out's own colour is unchanged.
    const R = 3.3
    const rimGeo = new THREE.RingGeometry(R * 1.05, R * 1.35, 24)
    const crossShape = new THREE.Shape()
    ;(() => {
      const a = R * 1.25, t = R * 0.42
      crossShape.moveTo(-t, -a); crossShape.lineTo(t, -a); crossShape.lineTo(t, -t)
      crossShape.lineTo(a, -t); crossShape.lineTo(a, t); crossShape.lineTo(t, t)
      crossShape.lineTo(t, a); crossShape.lineTo(-t, a); crossShape.lineTo(-t, t)
      crossShape.lineTo(-a, t); crossShape.lineTo(-a, -t); crossShape.lineTo(-t, -t)
      crossShape.closePath()
    })()
    const SHAPE_GEO = {
      circle: new THREE.SphereGeometry(R, 12, 12),
      up: new THREE.ConeGeometry(R * 1.15, R * 2.1, 4),
      down: new THREE.ConeGeometry(R * 1.15, R * 2.1, 4).rotateX(Math.PI),
      square: new THREE.BoxGeometry(R * 1.6, R * 1.6, R * 1.6),
      diamond: new THREE.OctahedronGeometry(R * 1.25),
      cross: new THREE.ExtrudeGeometry(crossShape, { depth: R * 0.9, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -R * 0.45, 0),
    }
    const dotGeo = SHAPE_GEO.circle
    // Ring = barrel. Flat on the surface the ball landed on, in the result's
    // own colour, wider than the seat marker so the two never merge.
    const barrelGeo = new THREE.RingGeometry(R * 1.9, R * 1.9 + 0.9, 28)

    // Everything hoverable, and everything flyable. `info` is the readout the
    // tooltip prints; `flights` feeds the replay.
    const pickables = []
    const flights = []
    // every arc, tube and glow — hidden from the plate seat, where a 3-ft
    // tube drawn for a 400-ft park is a wall of colour across the frame
    const arcGroup = new THREE.Group(); scene.add(arcGroup)
    const flightOfHit = []   // hit index → flight index, for LIVE's "only the new one flies"
    hits.forEach((h, hi) => {
      if (!Number.isFinite(h?.r) || !Number.isFinite(h?.ang)) return
      const f = Number.isFinite(h?.ev) && Number.isFinite(h?.la) && h.la > 0
        ? solveFlight(h.ev, h.la, h.r) : null
      const wd = wallD(h.ang)
      const reached = h.r > wd

      // ── ONE LANDING HEIGHT, USED BY EVERYTHING. This used to be computed
      //    down in the dot block only, so a ball in the seats had its DOT
      //    lifted onto the deck while its ARC still ran to y=0 underneath the
      //    grandstand. Two marks for one landing, in two different places —
      //    which is most of "the landing points aren't accurate".
      //
      //    The deck rises about 46ft over its first 92ft of depth (see the
      //    deck() calls above), so this is that slope. It is a rendering
      //    approximation of where the seats are, not a claim about which row
      //    the ball hit, and it is clamped to the top of the upper deck.
      const inSeats = h.r > wd + 4
      const landY = inSeats ? Math.min(150, 8 + (h.r - wd) * 0.46) : 1.4
      // Read the height profile at the wall's position AS STRETCHED, not at
      // its raw distance — otherwise "did it clear?" is answered against a
      // different arc than the one on screen, and the drawing and the verdict
      // can disagree about the same ball.
      const hAtWall = reached && f && h.r > 0
        ? f.heightAt(wd * (f.distanceFt / h.r))
        : null
      const over = reached && (hAtWall == null ? true : hAtWall > wallH(h.ang))
      // Hits fly too. `big` decides who gets a lit tube and who gets a faint
      // line, and it used to mean "reached the wall" — so a clean single into
      // the gap was drawn exactly like a routine fly out. A hit is a result;
      // an out is the absence of one, and only the outs stay quiet now.
      const big = h.hr || over || reached || isNonHrHit(h)
      const col = h.hr || over
        ? new THREE.Color(resultColor(h))
        : reached ? COL_WALL : new THREE.Color(resultColor(h))
      const info = {
        verdict: h.hr ? 'HOME RUN' : over ? 'clears this wall' : reached ? 'off this wall' : (h.event || (h.hit ? 'hit' : 'out')),
        col: '#' + col.getHexString(),
        ev: Number.isFinite(h?.ev) && h.ev > 0 ? h.ev : null,
        la: Number.isFinite(h?.la) && h.la !== 0 ? h.la : null,
        dist: Math.round(h.r),
        apex: f ? Math.round(f.apexFt) : null,
        hang: f ? f.hangS : null,
        pitch: h.pitch || '',
        date: h.date || '',
        event: (h.event || '').replace(/_/g, ' '),
        barrel: !!h.barrel,
        hard: !!(h.hard || h.hh),
      }

      if (f) {
        const N = 40
        // ── THE ARC ENDS ON ITS OWN DOT (2026-08-31). Donovan: "make sure
        //    the landing points are good and accurate." They were not, and
        //    the cause is in lib/trajectory, stated in its own comment:
        //    solveFlight bisects drag to make the carry match the plotted
        //    radius, but when the radius exceeds what ANY drag can produce —
        //    wind, altitude, or a coordinate that disagrees with the launch
        //    data — it returns the VACUUM arc and moves on. That arc's range
        //    is the vacuum range, not h.r. Sampling it at f.distanceFt
        //    therefore drew a ball that stopped short of the dot marking
        //    where it actually landed.
        //
        //    The dot is the MEASURED fact; the arc is a reconstruction. So
        //    the reconstruction is stretched to meet the fact rather than the
        //    other way round: sample the height profile by fraction of
        //    flight, but lay those samples out along the real radius. The
        //    shape and apex are preserved and the endpoint is exact.
        //
        //    STRETCH is the right verb, not "scale": nothing about the height
        //    is altered, so the apex the readout prints is still the solver's
        //    own number and is not quietly re-derived here.
        const pts = []
        for (let i = 0; i <= N; i++) {
          const frac = i / N
          const along = f.distanceFt * frac        // where to READ the height
          const rHere = h.r * frac                 // where to DRAW it
          const y = i === N ? landY : (f.heightAt(along) ?? 0)
          const v = P(rHere, h.ang)
          pts.push(new THREE.Vector3(v.x, Math.max(0, y), v.z))
        }
        flights.push({ pts, col, big, hang: f.hangS })
        if (big) {
          const curve = new THREE.CatmullRomCurve3(pts)
          // TAIL FADE (2026-08-31). A tube of one flat colour reads as wire;
          // a bright head over a dying tail reads as a ball that went
          // somewhere. TubeGeometry lays vertices out tubular-major, so a
          // per-vertex ramp along i does it.
          //
          // The ramp goes toward the FOG COLOUR, not toward black, because
          // this material is NORMAL blended on purpose — the note below is
          // the record of additive being tried here and making the orange /
          // amber verdict pair unreadable over green. Fading to the fog is
          // the same effect without reopening that.
          const TSEG = 48, TRAD = 6
          const tubeGeo = new THREE.TubeGeometry(curve, TSEG, 0.9, TRAD, false)
          {
            const bg = new THREE.Color(0x0d0f14)
            const base = new THREE.Color(col)
            const VN = (TSEG + 1) * (TRAD + 1)
            const cbuf = new Float32Array(VN * 3)
            for (let i = 0; i < VN; i++) {
              const f = 0.12 + 0.88 * Math.pow(Math.floor(i / (TRAD + 1)) / TSEG, 1.5)
              const mix = bg.clone().lerp(base, f)
              cbuf[i * 3] = mix.r; cbuf[i * 3 + 1] = mix.g; cbuf[i * 3 + 2] = mix.b
            }
            tubeGeo.setAttribute('color', new THREE.BufferAttribute(cbuf, 3))
          }
          const tube = new THREE.Mesh(
            tubeGeo,
            // Normal blending, not additive — additive over the green field
            // washed every arc toward yellow and the orange/amber verdict
            // pair stopped being readable (caught by rendering).
            new THREE.MeshBasicMaterial({
              vertexColors: true, transparent: true, opacity: h.hr || over ? 0.96 : 0.88,
            }),
          )
          tube.userData.info = info
          arcGroup.add(tube)
          pickables.push(tube)

          // ── THE GLOW SHELL (2026-08-31). The prototype draws every arc
          //    TWICE: a thin bright core and a wide, very faint additive
          //    shell around it. That second pass is the entire difference
          //    between a coloured wire and a streak of light, and it is what
          //    was missing here — this file had the core only.
          //
          //    WHY THIS DOES NOT REOPEN THE ADDITIVE DECISION ABOVE. The note
          //    on the core is about the CORE: additive there washed orange and
          //    amber into the same yellow and the verdict pair stopped being
          //    readable. The shell carries no readable information — it is
          //    8% opacity, its own colour is never judged, and the core is
          //    drawn over it at full strength. Hue fidelity lives in the core
          //    and is untouched; the shell only adds light around it.
          //
          //    Cheap on purpose: 4 radial segments (nobody resolves the shell's
          //    silhouette), depthWrite off so shells never occlude each other
          //    or the balls, and fog off so a deep arc's halo does not get
          //    eaten by the same haze that is meant to sit behind it.
          const glowGeo = new THREE.TubeGeometry(curve, TSEG, 4.2, 4, false)
          {
            const base = new THREE.Color(col)
            const VN = (TSEG + 1) * 5
            const gbuf = new Float32Array(VN * 3)
            for (let i = 0; i < VN; i++) {
              const f = 0.06 + 0.94 * Math.pow(Math.floor(i / 5) / TSEG, 1.6)
              gbuf[i * 3] = base.r * f; gbuf[i * 3 + 1] = base.g * f; gbuf[i * 3 + 2] = base.b * f
            }
            glowGeo.setAttribute('color', new THREE.BufferAttribute(gbuf, 3))
          }
          arcGroup.add(new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: h.hr || over ? 0.10 : 0.065,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          })))
        } else {
          // The quiet arcs get the same dying tail as the loud ones — a flat
          // line at one opacity was the other half of the wireframe look, and
          // there are more of these on screen than there are tubes.
          {
            const lg = new THREE.BufferGeometry().setFromPoints(pts)
            const bg = new THREE.Color(0x0d0f14)
            const base = new THREE.Color(col)
            const lc = new Float32Array(pts.length * 3)
            for (let i = 0; i < pts.length; i++) {
              const mix = bg.clone().lerp(base, 0.10 + 0.90 * Math.pow(i / (pts.length - 1), 1.5))
              lc[i * 3] = mix.r; lc[i * 3 + 1] = mix.g; lc[i * 3 + 2] = mix.b
            }
            lg.setAttribute('color', new THREE.BufferAttribute(lc, 3))
            // 0.30 -> 0.52. Outs are the majority of the chart and they were
            // reading as smudges; the tail fade already keeps their starts
            // dark, so raising the ceiling brightens the END of each line —
            // which is the part that says where the ball actually went.
            arcGroup.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
              vertexColors: true, transparent: true, opacity: 0.52, depthWrite: false,
            })))
          }
        }
      }
      // An out's dot was at 0.55 of a near-black grey, which on a dark field
      // is nothing at all. It is the landing point — the one thing every ball
      // on this chart has — so it is always fully opaque now, and only its
      // SIZE and colour say how loud the result was.
      const dot = new THREE.Mesh(SHAPE_GEO[shapeFor(h.pitch)] || dotGeo, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: big ? 1 : 0.85,
      }))
      const v = P(h.r, h.ang)

      // ── LANDINGS IN THE SEATS (2026-08-31). Donovan: "the balls land inside
      //    the stand which is cool but they kinda get lost."
      //
      //    Two reasons they got lost, and the first is a real geometry bug:
      //    every landing dot was pinned to y = 1.4, i.e. ON THE GROUND. A ball
      //    that cleared the fence has its dot sitting on the dirt UNDER the
      //    grandstand, buried inside the deck geometry, which is why it
      //    vanished rather than merely being dim. It now rides the deck
      //    surface at the radius it actually reached.
      //
      //    Second, a 2-unit dot against a bowl full of crowd points is the
      //    same size and brightness as the crowd. So a ball in the seats gets
      //    a MARKER, not just a dot: a bright pin dropped to the deck plus a
      //    ring around the base. That reads at any zoom and cannot be
      //    confused with a spectator.
      // landY is computed once, above, and is the SAME number the arc's last
      // point uses — so the ball's line and the ball's dot cannot land in
      // different places.
      const seatY = landY
      dot.position.set(v.x, seatY, v.z)
      // Size = result, the flat chart's ratios (HR 1.6 · XBH 1.35 · hit 1.2 ·
      // out 1). A ball this park would turn into something bigger than it
      // was — over or off the test wall — takes at least the XBH size, so the
      // park-test verdict still shows in the mark.
      dot.scale.setScalar(Math.max(resultScale(h), over ? 1.6 : reached ? 1.35 : 1))
      // the rim: pale on an out (the one that needed it), the result's own
      // colour on a hit, flat on whatever the ball landed on
      {
        const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
          color: big ? col : 0xe4e4e7, transparent: true, opacity: big ? 0.55 : 0.8,
          side: THREE.DoubleSide, depthWrite: false,
        }))
        rim.rotation.x = -Math.PI / 2
        rim.scale.setScalar(dot.scale.x)
        rim.position.set(v.x, seatY + 0.3, v.z)
        scene.add(rim)
      }
      // the shapes have an axis; spin each by its own angle so a row of
      // pyramids does not read as a formation
      if (shapeFor(h.pitch) !== 'circle') dot.rotation.y = (h.ang || 0) * (Math.PI / 180)

      if (h.barrel) {
        const br = new THREE.Mesh(barrelGeo, new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
        }))
        br.rotation.x = -Math.PI / 2
        br.position.set(v.x, seatY + 0.5, v.z)
        scene.add(br)
      }

      if (inSeats) {
        const pin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, seatY - 2, 6),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.30, depthWrite: false }),
        )
        pin.position.set(v.x, (seatY - 2) / 2, v.z)
        scene.add(pin)

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(3.4, 4.6, 24),
          new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.55,
            side: THREE.DoubleSide, depthWrite: false,
          }),
        )
        ring.position.set(v.x, seatY + 0.6, v.z)
        ring.lookAt(camera.position)
        scene.add(ring)

        // The same halo the flying ball carries, so a landing in the seats is
        // lit rather than merely coloured — it is the loudest outcome on the
        // chart and it should be the loudest mark.
        const hh = makeHalo(col)
        hh.scale.setScalar(1.9)
        hh.position.set(v.x, seatY + 0.6, v.z)
        scene.add(hh)
      }
      dot.userData.info = info
      // BUG (crashed the stadium view on click): flightIdx was never
      // declared anywhere -- reading an undeclared identifier throws a
      // ReferenceError in JS, which fired the moment any hit had a
      // solvable flight, i.e. basically immediately. The flight for THIS
      // hit was just pushed to `flights` above, in the same `if (f)`
      // block, so its index is simply the last slot in that array.
      if (f) { dot.userData.flightIndex = flights.length - 1; flightOfHit[hi] = flights.length - 1 }
      scene.add(dot)
      pickables.push(dot)
    })

    // ── HOVER READOUT. Raycast the dots and tubes; the tooltip is a plain
    //    absolutely-positioned div driven outside React, so hovering never
    //    re-renders the scene.
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    // ── HOVER FLIGHT (2026-08-29). Donovan, after the same request landed on
    // the 2D chart: "continue on the hover work on the 3d" — hovering one ball
    // here already got a tooltip; it never actually flew BY ITSELF the way the
    // global ▶ replay flies everything at once. This reuses that exact same
    // `flights` data (so the arc is identical, not a second computation) for
    // just the one ball under the cursor, so mousing around the field plays
    // each hit's real trajectory on demand instead of only at page-load.
    // Distinct from `replay`: a separate mesh/state pair so hovering during
    // the load-time replay (or after it) never fights over the same ball.
    let hoverFlight = null // { flightIndex, mesh, t0 }
    const clearHoverFlight = () => {
      if (!hoverFlight) return
      scene.remove(hoverFlight.mesh)
      hoverFlight.mesh.material.dispose()
      if (hoverFlight.mesh.userData.shadow) { scene.remove(hoverFlight.mesh.userData.shadow); hoverFlight.mesh.userData.shadow.material.dispose() }
      hoverFlight = null
    }
    const startHoverFlight = (flightIndex) => {
      if (hoverFlight?.flightIndex === flightIndex) return // already flying this one
      clearHoverFlight()
      const fl = flights[flightIndex]
      if (!fl) return
      const mesh = new THREE.Mesh(flyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      mesh.add(makeHalo(fl.col || 0xffffff))
      mesh.position.copy(fl.pts[0])
      scene.add(mesh)
      const sh = new THREE.Mesh(shadowGeo, shadowMat.clone())
      sh.rotation.x = -Math.PI / 2
      scene.add(sh)
      mesh.userData.shadow = sh
      hoverFlight = { flightIndex, mesh, t0: performance.now() }
    }
    const stepHoverFlight = (now) => {
      if (!hoverFlight) return
      const fl = flights[hoverFlight.flightIndex]
      // Real hang time, same 4x-ish feel as the full replay, clamped so a
      // routine grounder-turned-flyout and a moonshot are both watchable.
      const dur = Math.max(700, Math.min(3200, fl.hang * 400))
      const p = (now - hoverFlight.t0) / dur
      const idx = Math.min(fl.pts.length - 1, Math.max(0, Math.floor(p * fl.pts.length)))
      hoverFlight.mesh.position.copy(fl.pts[idx])
      if (hoverFlight.mesh.userData.shadow) placeShadow(hoverFlight.mesh.userData.shadow, hoverFlight.mesh.position)
      // Holds at the landing point (like the site's 2D hover animation) —
      // rather than disappearing or looping — until the cursor actually
      // leaves that ball, so a still cursor shows a still-standing result.
    }

    const onMove = (e) => {
      const tip = tipRef.current
      if (!tip) return
      const rect = renderer.domElement.getBoundingClientRect()
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      if (!hit) { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; clearHoverFlight(); return }
      const i = hit.object.userData.info
      const fi = hit.object.userData.flightIndex
      if (fi != null) startHoverFlight(fi); else clearHoverFlight()
      const bits = []
      if (i.ev != null) bits.push(`${i.ev.toFixed(1)} mph`)
      if (i.la != null) bits.push(`${i.la.toFixed(0)}°`)
      bits.push(`${i.dist} ft`)
      if (i.apex != null) bits.push(`apex ${i.apex} ft`)
      if (i.hang != null) bits.push(`${i.hang.toFixed(1)}s hang`)
      tip.innerHTML = `<b style="color:${i.col}">${i.verdict}</b>${i.barrel ? ' <span style="opacity:.85">· barrel</span>' : i.hard ? ' <span style="opacity:.7">· hard-hit</span>' : ''}<br>${bits.join(' · ')}`
        + (i.pitch || i.date ? `<br><span style="opacity:.7">${[i.pitch, i.date].filter(Boolean).join(' · ')}</span>` : '')
      tip.style.display = 'block'
      tip.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - 190)}px`
      tip.style.top = `${Math.max(e.clientY - rect.top - 14, 6)}px`
      renderer.domElement.style.cursor = 'pointer'
    }
    const onLeave = () => { if (tipRef.current) tipRef.current.style.display = 'none'; clearHoverFlight() }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    // ── 🌬 WIND (2026-08-30) ────────────────────────────────────────────
    //
    // Three objects, in decreasing order of how much they claim:
    //
    //   1. A FLAG on a pole in foul ground. This is the ambient read, and it
    //      carries BOTH facts in one object: it flies with the wind, and how
    //      hard it snaps and how far it lifts scale with mph. Everyone who
    //      has sat in a ballpark reads a flag without being taught.
    //   2. AN ARROW parked opposite it on the third-base side, drawn once,
    //      pointing the same way. The flag alone is ambiguous on a screenshot,
    //      and the two bracket the park instead of stacking.
    //   3. THE CARRY BAND along the wall, warm where the wind pushes out.
    //   4. THE LABEL, which is the only thing that says a number.
    //
    // All three are omitted entirely when the payload has no wind, rather than
    // drawn at zero — a still wind sock is a claim ("no wind tonight") and a
    // missing field is not the same fact.
    let windGroup = null
    let windStep = null
    if (windMph > 0 && windLabel) {
      const dir = WIND_DIR(windTo)
      const ink = new THREE.Color(windHex)
      windGroup = new THREE.Group()

      // ── THE FLAG (2026-08-31). Donovan: "instead of wind particles just add
      //    a DASH network flag in the stadium showing the wind direction and
      //    speed visually."
      //
      //    The streak slab it replaces is deleted, not hidden. Six hundred
      //    line segments drifting across the yard were doing one job — say
      //    which way the air is going — and doing it as weather effect rather
      //    than as an instrument. A flag does the same job the way a ballpark
      //    already does it: everyone who has sat in one reads a flag without
      //    being taught, and it costs two triangles instead of six hundred
      //    lines on a phone.
      //
      //    IT CARRIES BOTH FACTS AT ONCE, which the streaks never did:
      //      · DIRECTION — the flag flies with the wind, so the pole is
      //        upwind and the fly end points where the air is going. One Y
      //        rotation, the same bearing the arrow uses.
      //      · SPEED — the ripple rate and how far the cloth lifts off the
      //        pole both scale with mph. A 3 mph breeze barely stirs and
      //        hangs; a 15 mph wind snaps out straight and travels. That is
      //        how a real flag reads and it needs no legend.
      //
      //    THE CLOTH IS A GRID, not a plane, because a plane cannot wave. Two
      //    travelling sine waves along its length, amplitude ramped from zero
      //    at the pole to full at the fly end — a flag is pinned at one edge,
      //    so any wave that moves the pinned edge looks wrong immediately.
      const FLAG_W = 66, FLAG_H = 38, FW = 24, FH = 11
      const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, FW, FH)
      // Shift the mesh so x = 0 is the POLE edge, which is the edge that must
      // not move. PlaneGeometry centres on the origin.
      flagGeo.translate(FLAG_W / 2, 0, 0)
      const flagBase = flagGeo.attributes.position.array.slice()

      // IT IS THE SITE'S FLAG. Donovan: "make the flag have the site logo."
      // Painted on a canvas and used as the cloth's texture, rather than the
      // vertex-colour split the first cut used — a wordmark needs pixels, and
      // a texture also deforms WITH the wave, so the letters ripple instead of
      // sitting flat on a moving surface.
      const flagTex = (() => {
        const cv = document.createElement('canvas')
        cv.width = 512; cv.height = 300
        const g = cv.getContext('2d')
        g.fillStyle = new THREE.Color(0x14161c).getStyle()
        g.fillRect(0, 0, 512, 300)
        // Hoist band in the accent, so the flag reads as MOONSHOT's from the
        // back of the park where the letters are too small to resolve.
        g.fillStyle = C.orange
        g.fillRect(0, 0, 54, 300)
        g.fillRect(0, 262, 512, 12)
        g.font = '900 76px SF Mono, Menlo, monospace'
        g.textAlign = 'left'; g.textBaseline = 'middle'
        g.fillStyle = C.text
        g.fillText('MOONSHOT', 86, 132)
        g.font = '800 26px SF Mono, Menlo, monospace'
        g.fillStyle = C.orange
        g.fillText('DASH NETWORK', 90, 196)
        const t = new THREE.CanvasTexture(cv)
        t.anisotropy = 8
        // MIRRORED, and physically it was right — a DoubleSide plane shows the
        // reverse of the cloth on its back face, exactly as a real flag does.
        // But the default camera sits behind the plate and lands on that back
        // face, so the wordmark read "TOHSNOOM". A logo that is backwards is a
        // logo that failed, so the texture is flipped: the side you actually
        // look at is the side that reads.
        t.wrapS = THREE.RepeatWrapping
        t.repeat.x = -1
        t.offset.x = 1
        return t
      })()
      const flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({
        map: flagTex, side: THREE.DoubleSide,
      }))

      // The pole, and the whole rig parked in foul ground on the first-base
      // side — opposite the arrow, which lives on the third-base line, so the
      // two wind reads bracket the park instead of stacking on each other.
      const flagRig = new THREE.Group()
      {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.4, 128, 8),
          new THREE.MeshLambertMaterial({ color: 0x6b7280 }),
        )
        pole.position.y = 64
        flagRig.add(pole)
        flagMesh.position.set(0, 112, 0)
        flagRig.add(flagMesh)

        // The finial ball is gone — Donovan: "the point is not needed." And
        // the pole moves from 53° to 63°: the light towers stand at ±52 and
        // their beam cones were falling across the flag, which is the
        // "spotlight" he wanted rid of. Nothing lights this now except the
        // scene's own key and fill, same as the rest of the park.
        // Pushed out past the light towers' cones as well as off their
        // bearing — at 0.56 the near edge of the ±52° beam still washed
        // across the cloth, which is the "spotlight" that had to go. 0.70
        // rather than 0.82 because at 0.82 the mph label ran off the right
        // edge of the frame; found by rendering it, not by arithmetic.
        const post = P(maxD * 0.70, 64)
        flagRig.position.set(post.x, 0, post.z)
        // BACKWARDS, and Donovan caught it: "the flag is going in the
        // opposite direction of the wind." The cloth is built along +X, and
        // a Y rotation of θ sends +X to (cos θ, −sin θ) in the x/z plane.
        // With θ = −w + π/2 that lands on (sin w, −cos w) — the exact
        // NEGATIVE of WIND_DIR's (−sin w, cos w). Off by π, which on a
        // symmetric flag looks like a plausible flag pointing the wrong way
        // rather than like a bug.
        //   θ = −w − π/2  →  cos θ = −sin w, −sin θ = cos w  ✓ = WIND_DIR
        flagRig.rotation.y = -windTo * DEG - Math.PI / 2
        windGroup.add(flagRig)

        const tag = labelSprite(`${windMph.toFixed(0)} MPH ${windLabel.toUpperCase()}`, windHex)
        tag.position.set(post.x, 148, post.z)
        windGroup.add(tag)
      }

      // How hard it flies. Below ~4 mph a flag hangs and only stirs; by ~15 it
      // is straight out and snapping. Both the lift and the ripple rate come
      // off the same number so they can never disagree.
      const flagStrength = Math.min(1, Math.max(0.12, windMph / 15))

      // THE CARRY BAND (2026-08-31). Donovan: "have some visibility so we see
      // the direction and if it helps ball carry." Direction was already
      // readable; whether it HELPED was not — a ball to right and a ball to
      // left live in the same wind and do not get the same help from it.
      //
      // For every sector of the fence, how much of the wind is pushing OUT
      // along that bearing: align = wind · outward, in [-1, 1]. Warm where it
      // pushes out, cool where it pushes back, and the band fades to nothing
      // at the crossover, which is exactly where the wind stops mattering.
      //
      // THIS IS ALIGNMENT, NOT A DISTANCE MODEL. It says "the wind is behind a
      // ball hit here", never "this ball carries N more feet" — nothing in
      // this payload supports a number, and a coloured band that implies one
      // would be the kind of claim this file exists to avoid.
      {
        const carry = []
        const cols = []
        const warm = new THREE.Color(C.orange)
        const cool = new THREE.Color(C.cyan)
        const strength = Math.min(1, windMph / 15)
        for (let ang = -46; ang < 46; ang += 2) {
          const b = ang + 2
          const u0 = P(1, ang), u1 = P(1, b)
          const align = dir.x * u0.x + dir.z * u0.z
          const mag = Math.abs(align) * strength
          if (mag < 0.05) continue
          const tint = align >= 0 ? warm : cool
          const r0a = wallD(ang) - 34, r1a = wallD(ang) - 4
          const r0b = wallD(b) - 34, r1b = wallD(b) - 4
          const i0 = P(r0a, ang), o0 = P(r1a, ang)
          const i1 = P(r0b, b), o1 = P(r1b, b)
          carry.push(i0.x, 2, i0.z, i1.x, 2, i1.z, o1.x, 2, o1.z)
          carry.push(i0.x, 2, i0.z, o1.x, 2, o1.z, o0.x, 2, o0.z)
          for (let k = 0; k < 6; k++) cols.push(tint.r * mag, tint.g * mag, tint.b * mag)
        }
        if (carry.length) {
          const cg = new THREE.BufferGeometry()
          cg.setAttribute('position', new THREE.Float32BufferAttribute(carry, 3))
          cg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
          windGroup.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          })))
        }
        // Name the two ends, so a screenshot still says which way it helped.
        let bestA = 0, bestV = -2, worstA = 0, worstV = 2
        for (let ang = -44; ang <= 44; ang += 2) {
          const u = P(1, ang)
          const v = dir.x * u.x + dir.z * u.z
          if (v > bestV) { bestV = v; bestA = ang }
          if (v < worstV) { worstV = v; worstA = ang }
        }
        if (bestV > 0.25) {
          const t = labelSprite('WIND HELPS', C.orange)
          const v = P(wallD(bestA) - 19, bestA)
          t.position.set(v.x, 16, v.z)
          windGroup.add(t)
        }
        if (worstV < -0.25) {
          const t = labelSprite('WIND HOLDS', C.cyan)
          const v = P(wallD(worstA) - 19, worstA)
          t.position.set(v.x, 16, v.z)
          windGroup.add(t)
        }
      }

      // The arrow: a shaft and a head, floating over the infield where it
      // never sits on top of a ball's landing spot.
      {
        const arrow = new THREE.Group()
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 62, 8),
          new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.85 }),
        )
        shaft.rotation.x = Math.PI / 2
        arrow.add(shaft)
        const head = new THREE.Mesh(
          new THREE.ConeGeometry(6, 18, 12),
          new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.9 }),
        )
        head.position.z = 40
        head.rotation.x = Math.PI / 2
        arrow.add(head)
        // The group is built pointing at +Z (= out to centre, bearing 0), so
        // the bearing is one Y rotation. Negated for the same reason P()
        // negates x: this camera faces +Z, so the handedness is flipped.
        arrow.rotation.y = -windTo * DEG
        // PARKED IN FOUL GROUND, not over the infield. First cut floated it
        // above the mound at head height, which is exactly where sixty
        // reconstructed arcs pass through — the arrow disappeared into them
        // and the label sat on top of the whole night. Out past the left-field
        // line the sky is empty, and a reader looking for the wind finds it in
        // the same place every time.
        const post = P(maxD * 0.50, -53)
        arrow.position.set(post.x, 46, post.z)
        windGroup.add(arrow)

        const label = labelSprite(`${windMph.toFixed(0)} MPH ${windLabel.toUpperCase()}`, windHex)
        label.position.set(post.x, 68, post.z)
        windGroup.add(label)
      }

      scene.add(windGroup)

      // ── THE CLOTH, PER FRAME. Two travelling waves along the length at
      //    incommensurate periods so the flag never visibly loops, plus a
      //    slow twist across the height so it is cloth and not a ribbon.
      //    Amplitude is ZERO at the pole and full at the fly end, because a
      //    flag is pinned along one edge and any wave that moves that edge
      //    reads as broken instantly.
      const pos = flagGeo.attributes.position
      windStep = (now) => {
        const t = (now / 1000) * (0.9 + flagStrength * 2.6)
        for (let vi = 0; vi < pos.count; vi++) {
          const bx = flagBase[vi * 3], by = flagBase[vi * 3 + 1]
          const f = bx / FLAG_W                       // 0 at the pole, 1 at the fly
          const amp = f * f * (5.5 + flagStrength * 9)
          pos.array[vi * 3 + 2] =
            Math.sin(bx * 0.17 - t * 3.1) * amp
            + Math.sin(bx * 0.09 + by * 0.11 - t * 1.9) * amp * 0.45
          // A hanging flag droops; a flying one lifts. Same one number.
          pos.array[vi * 3 + 1] = by - (1 - flagStrength) * f * 11
        }
        pos.needsUpdate = true
        flagGeo.computeVertexNormals()
      }
    }

    // ── THE REPLAY. Every solvable ball flies its arc off the bat, staggered
    //    so the night reads as a sequence rather than a firework. Runs once
    //    on load (unless the viewer asked for reduced motion) and again from
    //    the ▶ replay button. Time scale: real hang times are 3–7s; ~4x speed
    //    keeps a 60-ball night under ten seconds.
    const flyGeo = new THREE.SphereGeometry(1.9, 10, 10)
    // BALL SHADOWS (2026-09-02). A dark disc on the ground under a flying
    // ball, shrinking and fading with height — the cue that turns a dot
    // moving across the screen into a ball in the air over a field.
    const shadowGeo = new THREE.CircleGeometry(2.2, 14)
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    const placeShadow = (sh, pos) => {
      const h = Math.max(0, pos.y)
      sh.visible = true
      sh.position.set(pos.x, 0.35, pos.z)
      const k = 1 + h / 60
      sh.scale.setScalar(k)
      sh.material.opacity = Math.max(0.06, 0.4 / (k * k))
    }
    let replay = null
    // `which` is the list of flight indices to fly; default all of them
    const runReplay = (which = null) => {
      if (!flights.length || replay) return
      const idxs = which || flights.map((_, i) => i)
      if (!idxs.length) return
      const balls = idxs.map((i) => {
        const fl = flights[i]
        const m = new THREE.Mesh(flyGeo, new THREE.MeshBasicMaterial({
          color: fl.col, transparent: true, opacity: fl.big ? 1 : 0.5,
        }))
        if (fl.big) m.add(makeHalo(fl.col))
        m.visible = false
        scene.add(m)
        // its shadow on the grass — the one cue that says how high a ball
        // is, which a lit sphere against a dark sky cannot
        const sh = new THREE.Mesh(shadowGeo, shadowMat.clone())
        sh.rotation.x = -Math.PI / 2
        sh.visible = false
        scene.add(sh)
        m.userData.shadow = sh
        return m
      })
      replay = { t0: performance.now(), balls, idxs }
    }
    const stepReplay = (now) => {
      if (!replay) return
      let alive = false
      replay.idxs.forEach((fi, i) => {
        const fl = flights[fi]
        const start = replay.t0 + i * 70
        const dur = Math.max(500, fl.hang * 260)
        const p = (now - start) / dur
        const ball = replay.balls[i]
        if (p < 0) { alive = true; return }
        if (p >= 1) { ball.visible = false; ball.userData.shadow.visible = false; return }
        alive = true
        ball.visible = true
        const idx = Math.min(fl.pts.length - 1, Math.floor(p * fl.pts.length))
        ball.position.copy(fl.pts[idx])
        placeShadow(ball.userData.shadow, ball.position)
      })
      if (!alive) {
        replay.balls.forEach((b) => {
          scene.remove(b); b.material.dispose()
          scene.remove(b.userData.shadow); b.userData.shadow.material.dispose()
        })
        replay = null
      }
    }
    replayRef.current = () => runReplay()
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    {
      // What flies on this rebuild depends on the mode and on why the scene
      // rebuilt. First mount: the whole set, once (as before). LIVE and the
      // set grew: only the balls that were not here last time. HOLD: nothing.
      // REPLAY: the whole set again, which is what a filter change used to do.
      const prev = prevCountRef.current
      prevCountRef.current = hits.length
      const m = motionRef.current
      if (reduceMotion || m === 'hold') { /* still */ }
      else if (prev === 0) runReplay()
      else if (m === 'live') {
        const fresh = []
        for (let i = prev; i < hits.length; i++) if (flightOfHit[i] != null) fresh.push(flightOfHit[i])
        if (fresh.length && fresh.length <= 6) runReplay(fresh)
      } else runReplay()
    }

    let raf
    // 1 when the scene is idle, 0 while the viewer is dragging.
    let handheld = 1
    let driving = false
    controls.addEventListener('start', () => { driving = true })
    controls.addEventListener('end', () => { driving = false })

    // HANDHELD (2026-08-31). A few feet of drift and a hair of roll. A
    // perfectly still camera is the loudest tell that something was rendered
    // rather than shot.
    //
    // The offset is applied AFTER controls.update() and removed straight
    // after the render, so OrbitControls never sees it — leave it on the
    // camera and the next update() treats the drift as user input and the
    // whole view walks off on its own.
    const tick = (now) => {
      const t = now || performance.now()
      const hold = motionRef.current === 'hold'
      handheld = driving || hold
        ? Math.max(0, handheld - 0.12)
        : Math.min(1, handheld + 0.012)
      // auto-orbit: OrbitControls' own slow turn, paused while grabbed and
      // in HOLD, resumed on release
      controls.autoRotate = !!orbitRef.current && !driving && !hold
      controls.autoRotateSpeed = 0.55
      controls.update()
      if (windStep) windStep(t)
      if (!hold) { stepReplay(t); stepHoverFlight(t) }
      // AND IT HOLDS STILL WHILE YOU DRIVE -- the fourth thing making this
      // hard to manoeuvre and the least obvious: the camera sways six feet
      // continuously, so every attempt to line up a view was being nudged
      // out from under the drag. A handheld operator stops breathing on the
      // lens while the shot is being set. Hold on grab, ease back over about
      // a second after release rather than snapping, so it never pops.
      const hh = handheld
      const dx = (Math.sin(t * 0.00042) * 2.2 + Math.sin(t * 0.00017) * 3.6) * hh
      const dy = (Math.cos(t * 0.00036) * 1.6 + Math.sin(t * 0.00013) * 2.6) * hh
      const dr = Math.sin(t * 0.00023) * 0.0016 * hh
      camera.position.x += dx; camera.position.y += dy; camera.rotation.z += dr
      look.render()
      camera.position.x -= dx; camera.position.y -= dy; camera.rotation.z -= dr
      raf = requestAnimationFrame(tick)
    }
    tick()

    const onResize = () => {
      const w = mount.clientWidth || W
      const h2 = Math.max(340, Math.round(w * 0.6))
      camera.aspect = w / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w, h2)
      look.setSize(w, h2)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      replayRef.current = null
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material]
          ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
        }
      })
      look.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // DEPS. venue was missing here and was masked rather than harmless:
    // switching parks also changes dims/heights, so the rebuild happened for
    // the wrong reason, and two parks with the same wall profile and
    // different bowls would have exposed it. (roofOpen lived here too, until
    // the roof itself was removed — see NO ROOF, EVER above.)
  }, [hits, dims, heights, venue, windMph, windLabel, windTo, windHex])

  if (!ok) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>
        This device can&apos;t draw WebGL, so the stadium view isn&apos;t available here — the 2D chart
        above shows the same balls.
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
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

              minHeight + aspectRatio restate Math.max(340, W * 0.6) in CSS, so
              the box holds its size whether or not a canvas is in it. The
              rebuild still happens; it just stops moving the page. */}
          <div style={{ position: 'relative' }}>
            <div ref={mountRef} style={{
              width: '100%', minHeight: 340, aspectRatio: '1 / 0.6',
              borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
            }} />

            {/* ── THE LOWER THIRD (2026-08-31). Donovan: "make sure the 3D
                spray chart has the player's name for easy screenshotting."
                It had no name on it anywhere — the caption underneath names
                the PARK and the caption is outside the frame you'd crop to.
                So a screenshot of this chart could not say who it was of,
                which for a thing built to be screenshotted is the whole job
                undone.

                Lower-left, the way a broadcast does it, because that is the
                one corner nothing else uses: the dock sits top-left and the
                replay button top-right. pointerEvents off so it never eats a
                drag meant for the scene. */}
            {(title || subtitle) && (
              <div style={{
                position: 'absolute', left: 12, bottom: 12, zIndex: 2,
                pointerEvents: 'none', maxWidth: '70%',
              }}>
                {title && (
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900,
                    letterSpacing: '.06em', color: C.text, lineHeight: 1.1,
                    textShadow: '0 2px 10px rgba(0,0,0,.85)',
                  }}>{String(title).toUpperCase()}</div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7, marginTop: 3,
                }}>
                  <span style={{
                    display: 'inline-block', width: 16, height: 2,
                    background: C.orange, borderRadius: 2,
                  }} />
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800,
                    letterSpacing: '.14em', color: C.text3,
                    textShadow: '0 2px 8px rgba(0,0,0,.85)',
                  }}>{subtitle ? String(subtitle).toUpperCase() : 'MOONSHOT'}</span>
                </div>
              </div>
            )}
          </div>
        {/* FILM OVERLAYS (2026-08-31). Grain, scanlines and a vignette, as
            three plain divs — no shaders, no post-processing pass, no cost
            in the render loop. This is most of the distance between "a 3D
            chart" and "a broadcast still", and it is the cheapest thing in
            the file. pointerEvents none so the orbit, the raycast hover and
            the replay button all still get their events. */}
        <style>{'@keyframes sfsGrain{0%{transform:translate(0,0)}33%{transform:translate(-3%,2%)}66%{transform:translate(2%,-3%)}100%{transform:translate(0,0)}}'}</style>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          background: 'radial-gradient(125% 95% at 50% 44%, rgba(0,0,0,0) 36%, rgba(0,0,0,.42) 78%, rgba(0,0,0,.72) 100%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          opacity: 0.09, mixBlendMode: 'overlay',
          background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none', zIndex: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: '-50%', opacity: 0.05, mixBlendMode: 'overlay',
            animation: 'sfsGrain 1.1s steps(3) infinite',
            backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
          }} />
        </div>
        {/* the hover readout — display driven directly by the raycaster */}
        <div ref={tipRef} style={{
          display: 'none', position: 'absolute', zIndex: 5, pointerEvents: 'none',
          maxWidth: 180, padding: '6px 9px', borderRadius: 8,
          background: C.scrim, border: `1px solid ${C.border2}`,
          fontSize: 10, lineHeight: 1.5, color: C.text2, fontFamily: NUM_FONT,
        }} />
        {/* motion modes + orbit, top-right. The ▶ replay button grew into a
            row: what moves, and whether the camera turns on its own. */}
        <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 4, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '40%' }}>
          {[
            live ? ['live', '● live', 'Only the ball that just landed flies when the feed adds one'] : null,
            ['replay', '▶ replay', 'Fly every ball along its reconstructed arc, in sequence'],
            ['hold', '⏸ hold', 'Nothing moves — the still picture'],
          ].filter(Boolean).map(([k, txt, tip]) => {
            const on = motion === k
            const col = k === 'live' ? C.green : k === 'hold' ? C.text2 : C.orange
            return (
              <button key={k}
                onClick={() => { setMotion(k); if (k === 'replay' && replayRef.current) replayRef.current() }}
                title={tip}
                style={{
                  padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 7,
                  cursor: 'pointer', fontFamily: NUM_FONT,
                  border: `1px solid ${on ? col : C.border2}`,
                  background: on ? `${col}22` : C.bg3, color: on ? col : C.text2,
                }}
              >{txt}</button>
            )
          })}
          <button
            onClick={() => setOrbit((v) => !v)}
            title={orbit ? 'Stop the slow turn' : 'Turn slowly around the park until you grab it'}
            style={{
              padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 7,
              cursor: 'pointer', fontFamily: NUM_FONT,
              border: `1px solid ${orbit ? C.cyan : C.border2}`,
              background: orbit ? `${C.cyan}22` : C.bg3, color: orbit ? C.cyan : C.text2,
            }}
          >⟳ orbit</button>
        </div>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        drag to orbit · scroll to zoom · swipe sideways on a phone · hover a ball for its readout{venue ? ` · ${venue}` : ''} · wall numbers are the park&apos;s five
        published distances ·{' '}
        {windMph > 0 && windLabel && (
          <>
            <b style={{ color: windHex }}>wind {windMph.toFixed(1)} mph {windLabel}</b> — the flag flies
            with it and its snap scales with the speed; the arrow and the band along the wall show the
            component that matters for carry (out, in or across) and nothing finer:
            the published direction is park-relative, not a compass bearing, and the arcs are drawn
            WITHOUT it, so the wind is context beside the geometry, never folded into it ·{' '}
          </>
        )}
        <b style={{ color: C.red }}>red</b> HR ·{' '}
        <b style={{ color: catColor('result', 'triple') }}>purple</b> 3B ·{' '}
        <b style={{ color: C.green }}>green</b> 2B ·{' '}
        <b style={{ color: catColor('result', 'single') }}>blue</b> 1B ·{' '}
        <b style={{ color: '#fbbf24' }}>amber</b> off this wall · dark = out — the same five the flat
        chart uses, plus amber, which is the one thing only this view can say: a ball that hit THIS
        park&apos;s wall. Arcs are reconstructed from EV + launch angle so each ball lands where its dot is
        (geometry, not measured trajectory); a ball without both is drawn as a dot only.
      </div>
    </div>
  )
}
