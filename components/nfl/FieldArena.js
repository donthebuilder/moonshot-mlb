'use client'
// 🏟 THE STADIUM (2026-10-01 BATCH-NFL-3D; rebuilt 2026-10-02 BATCH-3D-V2 step 2).
// Donovan on the first one: "I hate it" -- a bright daytime field, a pile of
// coloured spheres, towers of stacked balls, a big white ring: not the 2D Field
// he likes, and not part of the site. This is THAT chart, laid in a stadium at
// night:
//   a  NIGHT, LIKE MOONSHOT: near-black turf (FIELD3D), MOONSHOT's look
//      (lib/stadiumLook makeComposer), the bowl's light, fog.
//   b  THE TURF IS THE 2D CHART: TheField lends its own SVG (minus the dots) and
//      it is drawn onto the turf, cropped to the three lanes x the drawn depth --
//      the lane lines, the LINE, the yard numbers, the halftone zone ink, THE
//      SPOT, the "thin" tags. Same picture, so the 2D and 3D cannot disagree.
//   c  DOTS LIKE THE 2D: flat discs on the turf, the same colours (hollow =
//      incomplete, orange = touchdown), placed by the 2D's own functions
//      (lib/nfl/fieldPlace.js acrossOf / dotRadiusPx). No stacking; a target past
//      the drawn depth clamps to the edge, as in 2D.
//   d  Lines from the line of scrimmage are OFF by default (a chip), flat.
//   e  ZONES (a chip, off by default): each zone's targets rise as a short
//      column, height = the real count there. Donovan judges it from the preview.
//   f  The spray chart's dock with the 2D panel's numbers, its name plate, film
//      and hover readout. Tap a dot -> the same play card the 2D opens.
//   g  Presets stay; TOP looks straight down on the same picture as the 2D.
// WHAT IT DOES NOT DRAW: the ball's flight or the exact spot across the lane --
// the feed gives the lane and the air yards. The caption says so.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { C, NUM_FONT, FIELD3D } from '../../lib/nfl/theme'
import { buildField, FIELD_L, FIELD_W, LANE_W, YD } from '../../lib/fieldWorld'
import { buildArenaRect } from '../../lib/arena'
import { heatOf, coolOf } from '../../lib/nfl/fieldModel'
import { acrossOf, clampAir, LANES3 } from '../../lib/nfl/fieldPlace'
import { makeComposer, isCoarse } from '../../lib/stadiumLook'
import { webglOk } from '../../lib/webglOk'
import { labelSprite } from '../../lib/three/sprites'
import StadiumShell from '../charts/StadiumShell'
import StadiumDock from '../charts/stadium/StadiumDock'
import LowerThird from '../charts/stadium/LowerThird'
import FilmOverlay from '../charts/stadium/FilmOverlay'
import HoverReadout, { placeTip } from '../charts/stadium/HoverReadout'
import { ChartLegend, ChartEmpty } from '../charts'

// TheField's depth bands, in air yards (the 2D's BANDS)
const BAND_YD = { behind: [-6, 0], short: [0, 10], mid: [10, 20], deep: [20, 36] }
const bandOf = (air) => (air < 0 ? 'behind' : air < 10 ? 'short' : air < 20 ? 'mid' : 'deep')
const AIR_TOP = 36, AIR_BOT = -6
/** across 0..1 + air yards -> the world (x downfield from the LOS, z across, left = -z) */
const at = (u, air, h = 0) => new THREE.Vector3(clampAir(air) * YD, h, -FIELD_W / 2 + u * FIELD_W)

// The 2D SVG, minus its dots, as an image -- the turf's texture (b).
// ITS WORDS ARE DRAWN APART (2026-10-02, Donovan: the field's font was
// "different from the site"): an SVG drawn as an image can't reach the
// page's fonts, so it fell back to a typewriter face. Each <text> is lifted
// out of the picture and drawn onto the canvas, where the page's fonts resolve.
function textsOf(svg) {
  return [...svg.querySelectorAll('text')].filter((t) => !t.closest('[data-layer="dots"], [data-layer="share"]')).map((t) => {
    const b = t.getBBox(), cs = getComputedStyle(t), A = (k) => t.getAttribute(k)
    return {
      s: t.textContent, x: b.x + b.width / 2, y: b.y + b.height / 2,
      size: parseFloat(A('font-size')) || parseFloat(cs.fontSize), weight: A('font-weight') || cs.fontWeight,
      family: A('font-family') || cs.fontFamily, stretch: t.style.fontStretch || 'normal',
      fill: A('fill') || cs.fill, fillOp: A('fill-opacity') != null ? +A('fill-opacity') : 1,
      stroke: A('stroke'), sw: +(A('stroke-width') || 0), strokeOp: A('stroke-opacity') != null ? +A('stroke-opacity') : 1,
      ls: parseFloat(A('letter-spacing')) || 0,
    }
  })
}
function drawTexts(ctx, texts, box, S) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  for (const t of texts) {
    ctx.font = `${t.weight} ${t.size * S}px ${t.family}`
    if ('fontStretch' in ctx) ctx.fontStretch = t.stretch === 'condensed' ? 'condensed' : 'normal'
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${t.ls * S}px`
    const x = (t.x - box.cx0) * S, y = (t.y - box.yTop) * S
    if (t.stroke && t.sw) { ctx.globalAlpha = t.strokeOp; ctx.strokeStyle = t.stroke; ctx.lineWidth = t.sw * S; ctx.strokeText(t.s, x, y) }
    ctx.globalAlpha = t.fillOp; ctx.fillStyle = t.fill; ctx.fillText(t.s, x, y)
  }
  ctx.globalAlpha = 1
}
function inkTexture(svg, box) {
  return new Promise((resolve) => {
    if (!svg || !box) { resolve(null); return }
    const texts = textsOf(svg)
    const clone = svg.cloneNode(true)
    clone.querySelectorAll('[data-layer="dots"], [data-layer="edge"], [data-layer="share"], text').forEach((n) => n.remove())
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const S = 2
    clone.setAttribute('width', String(box.W * S)); clone.setAttribute('height', String(box.H * S))
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
    const img = new Image()
    img.onload = () => {
      // crop to the three lanes x the drawn depth
      const cw = Math.round((box.cx1 - box.cx0) * S), ch = Math.round((box.yBot - box.yTop) * S)
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, box.cx0 * S, box.yTop * S, cw, ch, 0, 0, cw, ch)
      drawTexts(ctx, texts, box, S)
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
      resolve(t)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export default function FieldArena({ dots = [], cells = [], spot = null, rz = [], onPick = null, title = '', subtitle = '', inkSvg = null, inkBox = null, stats = null, showDiscs = true, venue = null }) {
  const mountRef = useRef(null)
  const tipRef = useRef(null)
  const [ok, setOk] = useState(true)
  const [lines, setLines] = useState(false)      // d: off by default
  // e: ON by default (Donovan 10-02, "the numbers coming up off the ground"): each zone's share rises as a column
  const [zones, setZones] = useState(true)
  const [orbit, setOrbit] = useState(false)
  const [full, setFull] = useState(false)
  const [preset, setPreset] = useState('endzone')
  const [dockOpen, setDockOpen] = useState(true)
  const [narrowBox, setNarrowBox] = useState(false)
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 640) { setNarrowBox(true); setDockOpen(false) } }, [])
  const orbitRef = useRef(orbit); orbitRef.current = orbit
  const apiRef = useRef({})
  const pickRef = useRef(onPick); pickRef.current = onPick
  const inkRef = useRef({ inkSvg, inkBox }); inkRef.current = { inkSvg, inkBox }
  const sig = `${dots.map((d) => `${d.i}${d.ink}${d.res}${d.path ? 'p' : ''}`).join(',')}|${cells.map((c) => `${c.k}:${c.leak}`).join(',')}|${spot ? spot.L + spot.B.key : ''}|${rz.map((t) => `${t.seed}${t.res}`).join(',')}|${lines}|${zones}|${showDiscs}`

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    if (!webglOk()) { setOk(false); return undefined }
    const boxH = (w) => (full ? Math.max(240, mount.clientHeight || Math.round(window.innerHeight * 0.7)) : Math.max(340, Math.round(w * 0.6)))
    const W = mount.clientWidth || 640
    const H = boxH(W)
    let alive = true

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(FIELD3D.sky)
    scene.fog = new THREE.Fog(new THREE.Color(FIELD3D.sky), 520, 1300)
    const { mid } = buildField(scene)
    const bowl = new THREE.Group(); scene.add(bowl)
    buildArenaRect(bowl, { w: FIELD_W + 40, l: FIELD_L + 40, cornerR: 30, roof: false, colors: { seat: FIELD3D.seat, fascia: FIELD3D.fascia } })
    bowl.position.x = mid

    const camera = new THREE.PerspectiveCamera(42, W / H, 1, 4000)
    const narrow = W / H < 1.15
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.075
    controls.enablePan = false; controls.zoomSpeed = 0.75
    controls.maxPolarAngle = Math.PI * 0.46
    controls.minDistance = 40; controls.maxDistance = 330
    if (isCoarse()) { controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = 'pan-y' }
    const thumb = (w) => { controls.rotateSpeed = 0.55 * Math.min(2.2, Math.max(1, 780 / Math.max(1, w))) }
    thumb(W)
    const look = makeComposer(renderer, scene, camera, W, H, { ao: !isCoarse(), scale: 0.4 })

    const V = (x, y, z) => new THREE.Vector3(x, y, z)
    const SHOTS = {
      // on a narrow box (a phone) the camera sits further back and higher, so all three lanes
      // fit at the line of scrimmage (fov 42, ~1:1 box: 160 ft across needs ~200 ft of distance)
      endzone: () => [narrow ? V(-50 * YD, 150, 0.01) : V(-24 * YD, 84, 0.01), V((narrow ? 19 : 14) * YD, 0, 0)],
      sideline: () => [V(15 * YD, 70, FIELD_W / 2 + 120), V(15 * YD, 0, 0)],
      all22: () => [V(-8 * YD, 230, 0.01), V(16 * YD, 0, 0)],
      // straight down on the drawn span (-6..36 yd), the 2D chart's frame
      // the camera a few feet behind its target, so 'up' on screen is downfield --
      // deep at the top, left lane on the left, exactly the 2D chart's frame
      top: () => [V(15 * YD - 6, narrow ? 300 : 210, 0), V(15 * YD, 0, 0)],
    }
    { const [p, t] = SHOTS.endzone(); camera.position.copy(p); controls.target.copy(t) }

    const hx = FIELD_L / 2, hz = FIELD_W / 2
    const outside = (p) => Math.hypot(Math.max(0, Math.abs(p.x - mid) - hx), Math.max(0, Math.abs(p.z) - hz))
    const _off = new THREE.Vector3()
    const keepOut = () => {
      if (apiRef.current.noFloor) return
      const yMin = 14 + outside(camera.position) * 0.62
      if (camera.position.y > 340) camera.position.y = 340
      if (camera.position.y >= yMin) return
      _off.copy(camera.position).sub(controls.target)
      const r = _off.length()
      const dy = Math.min(r * 0.98, yMin - controls.target.y)
      const h = Math.sqrt(Math.max(0, r * r - dy * dy))
      const hzz = Math.hypot(_off.x, _off.z) || 1
      _off.set((_off.x / hzz) * h, dy, (_off.z / hzz) * h)
      camera.position.copy(controls.target).add(_off)
    }

    const group = new THREE.Group(); scene.add(group)
    // ── b: THE TURF IS THE 2D CHART -- four explicit corners, each tied to its
    //    corner of the cropped picture (deep at the top, left lane on the left)
    {
      const g = new THREE.BufferGeometry()
      const x0 = AIR_BOT * YD, x1 = AIR_TOP * YD, z0 = -FIELD_W / 2, z1 = FIELD_W / 2
      g.setAttribute('position', new THREE.Float32BufferAttribute([x1, 0.05, z0, x1, 0.05, z1, x0, 0.05, z0, x0, 0.05, z1], 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2))
      g.setIndex([0, 2, 1, 1, 2, 3])
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(FIELD3D.turf), side: THREE.DoubleSide, toneMapped: false })
      const plate = new THREE.Mesh(g, mat)
      group.add(plate)
      const { inkSvg: getSvg, inkBox: box } = inkRef.current
      inkTexture(getSvg?.(), box).then((tex) => {
        if (!alive) { tex?.dispose(); return }
        if (tex) { mat.map = tex; mat.color.setRGB(1, 1, 1); mat.needsUpdate = true }
      })
    }

    // ── c: THE TARGETS, flat discs in the 2D's spots, size and ink
    const ftPerPx = inkRef.current.inkBox?.pxPerFt ? 1 / inkRef.current.inkBox.pxPerFt : 0.42
    const pickables = [], lineObjs = []
    const disc = new THREE.CircleGeometry(1, 28)
    const ring = new THREE.RingGeometry(0.72, 1, 28)
    const edge = new THREE.RingGeometry(1, 1.16, 28)
    const order = { inc: 0, int: 0, catch: 1, td: 2 }
    const sorted = [...dots].sort((a, b) => (order[a.res] - order[b.res]) || (a.i - b.i))
    if (showDiscs) sorted.forEach((p, n) => {
      const td = p.res === 'td', caught = p.res === 'catch' || td
      const r = (p.rPx || 5) * ftPerPx
      const pos = at(acrossOf(p), p.air, 0.14 + (n % 7) * 0.004)
      const ink = new THREE.Color(td ? C.orange : p.ink)
      const mark = new THREE.Group(); mark.position.copy(pos)
      const flat = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; mark.add(m); return m }
      if (caught) flat(disc, new THREE.MeshBasicMaterial({ color: ink, toneMapped: false, transparent: true, opacity: 0.92 }))
      else flat(ring, new THREE.MeshBasicMaterial({ color: ink, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
      // a touchdown keeps a cream edge so it never melts into the orange ink, and a soft glow
      if (td) { flat(edge, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cream), side: THREE.DoubleSide })); const glow = flat(disc, new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.25, depthWrite: false })); glow.scale.setScalar(1.7); glow.position.y = -0.02 }
      mark.scale.setScalar(r)
      mark.userData.play = p
      group.add(mark); pickables.push(mark)
      // ROUTES: last season's route shape (lib/nfl/routeShape), flat on the turf, ending at its disc
      if (p.path) {
        const pg = new THREE.BufferGeometry().setFromPoints(p.path.map(([uu, a]) => at(uu, a, 0.12)))
        const pa = Math.max(0.3, Math.min(0.8, 90 / Math.max(1, dots.length)))   // TheField's routeAlpha
        const pl = new THREE.Line(pg, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: td ? Math.min(0.85, pa * 1.6) : pa }))
        group.add(pl)
      }
      // d: a flat line from the line of scrimmage, off by default
      if (lines && !p.path) {
        const lg = new THREE.BufferGeometry().setFromPoints([V(0, 0.1, pos.z), V(pos.x, 0.1, pos.z)])
        const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: td ? 0.7 : caught ? 0.35 : 0.18 }))
        group.add(l); lineObjs.push(l)
      }
    })
    // ── e: ZONES -- each zone's targets as a short column, height = the real count
    if (zones) {
      const cnt = {}
      for (const p of dots) { const k = `${p.lane}|${bandOf(clampAir(p.air))}`; cnt[k] = (cnt[k] || 0) + 1 }
      const max = Math.max(1, ...Object.values(cnt)), total = Math.max(1, dots.length)
      for (const L of LANES3) for (const B of Object.keys(BAND_YD)) {
        const n = cnt[`${L}|${B}`] || 0
        if (!n) continue
        const c = cells.find((x) => x.L === L && x.B?.key === B)
        const h = heatOf(c?.leak), cl = coolOf(c?.leak)
        const [y0, y1] = BAND_YD[B]
        const ht = 4 + (36 * n) / max
        // slim, so the turf and the discs read around it
        const box = new THREE.Mesh(new THREE.BoxGeometry(Math.min(14, (y1 - y0) * YD * 0.45), ht, LANE_W * 0.32),
          // the 2D's heat: red = the defence gives up more there, blue = holds up, dim = normal or thin
          new THREE.MeshBasicMaterial({ color: new THREE.Color(h >= 0.12 ? C.red : cl >= 0.12 ? C.blue : C.text3), transparent: true, opacity: h >= 0.12 || cl >= 0.12 ? 0.45 : 0.2, depthWrite: false }))
        box.position.copy(at((LANES3.indexOf(L) + 0.5) / 3, (y0 + y1) / 2, ht / 2))
        group.add(box)
        const lab = labelSprite(`${Math.round((100 * n) / total)}%`, C.text); lab.position.copy(at((LANES3.indexOf(L) + 0.5) / 3, (y0 + y1) / 2, ht + 5)); lab.scale.multiplyScalar(0.9); group.add(lab)
      }
    }
    // the red zone: each touch at its yard line on a rail past the near sideline
    const GOAL_YD = 65, RAIL_Z = FIELD_W / 2 + 7
    {
      const rail = new THREE.Mesh(new THREE.PlaneGeometry(20 * YD, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.orange), transparent: true, opacity: 0.16, depthWrite: false }))
      rail.rotation.x = -Math.PI / 2; rail.position.set((GOAL_YD - 10) * YD, 0.1, RAIL_Z); group.add(rail)
      for (const t of rz) {
        const d = Math.max(0, Math.min(20, Number(t.d) || 0))
        const ink = { td: C.orange, catch: C.cream, carry: C.amber }[t.res]
        const m = new THREE.Mesh(ink ? disc : ring, new THREE.MeshBasicMaterial({ color: new THREE.Color(ink || C.text2), side: THREE.DoubleSide }))
        m.rotation.x = -Math.PI / 2; m.scale.setScalar(1.6); m.position.set((GOAL_YD - d) * YD, 0.18, RAIL_Z)
        group.add(m)
      }
    }

    let anim = null
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
    apiRef.current.preset = (key) => { const s = SHOTS[key]; if (!s) return; const [p1, t1] = s(); anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, s: performance.now() } }
    controls.update()
    const AZ0 = controls.getAzimuthalAngle()
    apiRef.current.controls = controls
    apiRef.current.setView = (azDeg, distK, polarK) => {
      const sph = new THREE.Spherical(controls.minDistance + distK * (controls.maxDistance - controls.minDistance), Math.max(0.05, polarK * controls.maxPolarAngle), AZ0 + (azDeg * Math.PI) / 180)
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); controls.update(); keepOut()
    }
    const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2()
    apiRef.current.fieldShare = () => {
      camera.updateMatrixWorld(true)
      let hit = 0, n = 0
      for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) {
        _ndc.set(-1 + (2 * i + 1) / 24, -1 + (2 * j + 1) / 16); _ray.setFromCamera(_ndc, camera)
        const first = _ray.intersectObjects(scene.children, true).find((x) => x.object.isMesh && x.object.visible && !x.object.material?.transparent)
        n++
        const pt = first?.point
        if (pt && pt.y < 6 && outside(pt) === 0) hit++
      }
      return hit / n
    }
    if (typeof window !== 'undefined') window.__dash3d = apiRef.current

    // ── f: hover readout + tap -> the same play card the 2D opens
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const markAt = (e) => {
      const rc = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      let pick = ray.intersectObjects(pickables, true)[0]?.object
      while (pick && !pick.userData.play && pick.parent) pick = pick.parent
      if (!pick?.userData.play) {
        pick = null
        const pt = new THREE.Vector3()
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
          let bd = 4 * YD
          for (const m of pickables) { const d = Math.hypot(m.position.x - pt.x, m.position.z - pt.z); if (d < bd) { bd = d; pick = m } }
        }
      }
      return { pick, x: e.clientX - rc.left, y: e.clientY - rc.top, w: rc.width }
    }
    const tip = (pick, x, y, w) => placeTip(tipRef.current, pick ? `<b style="color:${pick.userData.play.res === 'td' ? C.orange : C.text}">${pick.userData.play.label || ''}</b>` : null, x, y, w)
    let driving = false
    const coarse = isCoarse()
    const onMove = (e) => { if (coarse || driving) return; const { pick, x, y, w } = markAt(e); tip(pick, x, y, w); renderer.domElement.style.cursor = pick ? 'pointer' : '' }
    const onLeave = () => placeTip(tipRef.current, null)
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const { pick, x, y, w } = markAt(e)
      tip(pick, x, y, w)
      if (pick?.userData.play) pickRef.current?.(pick.userData.play.i)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    controls.addEventListener('start', () => { driving = true })
    controls.addEventListener('end', () => { driving = false })
    let raf = 0
    const tick = (now) => {
      const t = now || performance.now()
      if (anim) {
        const k = Math.min(1, (t - anim.s) / 600), e = ease(k)
        camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0, anim.t1, e)
        if (k >= 1) anim = null
      }
      controls.autoRotate = !!orbitRef.current && !driving
      controls.autoRotateSpeed = 0.5
      controls.update(); keepOut()
      look.render()
      raf = requestAnimationFrame(tick)
    }
    let onScreen = true, hidden = typeof document !== 'undefined' && document.hidden, running = false
    const start = () => { if (!running && onScreen && !hidden) { running = true; raf = requestAnimationFrame(tick) } }
    const stop = () => { if (running) { running = false; cancelAnimationFrame(raf) } }
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((en) => { onScreen = en.some((x) => x.isIntersecting); onScreen ? start() : stop() }, { threshold: 0.05 }) : null
    if (io) io.observe(renderer.domElement)
    const onVis = () => { hidden = document.hidden; hidden ? stop() : start() }
    document.addEventListener('visibilitychange', onVis)
    start()
    const onResize = () => {
      const w = mount.clientWidth || W, h2 = boxH(w)
      camera.aspect = w / h2; camera.updateProjectionMatrix(); renderer.setSize(w, h2); look.setSize(w, h2); thumb(w)
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null
    if (ro) ro.observe(mount)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      if (io) io.disconnect(); if (ro) ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      if (typeof window !== 'undefined' && window.__dash3d === apiRef.current) delete window.__dash3d
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose() })
      })
      look.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // keyed on WHAT is drawn, not on array identity: TheField builds these
    // per render, and a rebuild per render would throw the camera away
  }, [sig, full]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return <ChartEmpty theme={C}>This device can&apos;t draw WebGL, so the stadium isn&apos;t available here — the field below shows the same targets.</ChartEmpty>

  const chipBtn = (on, col) => ({
    minHeight: 44, padding: '0 14px', fontSize: 12, fontWeight: 800, borderRadius: 999, cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${on ? col : C.border2}`, background: on ? `${col}22` : 'transparent', color: on ? col : C.text2,
  })
  const chips = (
    <>
      <button type="button" style={chipBtn(lines, C.green)} aria-pressed={lines} onClick={() => setLines((v) => !v)} title="Flat lines from the line of scrimmage to each target">— lines</button>
      <button type="button" style={chipBtn(zones, C.orange)} aria-pressed={zones} onClick={() => setZones((v) => !v)} title="Each zone's targets as a column: height = the count there">▥ zones</button>
      <button type="button" style={chipBtn(orbit, C.cream)} aria-pressed={orbit} onClick={() => setOrbit((v) => !v)} title="Turn slowly round the field until you grab it">⟳ orbit</button>
    </>
  )
  const PRESETS = [
    { key: 'sideline', label: 'SIDELINE', title: 'From the sideline seats' },
    { key: 'endzone', label: 'END ZONE', title: 'Behind the offence, looking downfield' },
    { key: 'all22', label: 'ALL-22', title: 'High behind the offence, every lane in frame' },
    { key: 'top', label: 'TOP', title: 'Straight down: the same picture as the field below' },
  ]
  const caption = (
    <div style={{ marginTop: 6 }}>
      {/* THE BUILDING (Donovan 10-02, "just show whatever building they are at"): its name, nothing modelled */}
      {venue ? <div style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: C.text2, marginBottom: 4 }}>🏟 {venue}</div> : null}
      <ChartLegend theme={C} items={[
        { key: 'td', mark: <b aria-hidden="true" style={{ color: C.orange }}>●</b>, label: 'touchdown' },
        { key: 'catch', mark: <b aria-hidden="true" style={{ color: C.cream }}>●</b>, label: 'catch' },
        { key: 'inc', mark: <b aria-hidden="true">○</b>, label: 'incomplete / picked' },
        { key: 'heat', mark: <i aria-hidden="true" style={{ width: 10, height: 8, borderRadius: 2, background: `${C.orange}88` }} />, label: 'a zone that gives up more than normal' },
      ]} />
      <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5, fontFamily: NUM_FONT }}>
        The turf is the field below, the same ink and numbers. A target sits at its air yards in its lane; its exact spot across the lane isn&apos;t in the feed, so it keeps the field&apos;s fixed scatter, and the lines (off unless you turn them on) are not ball flights. Red-zone touches sit at their yard line on the rail past the sideline. The same {dots.length} target{dots.length === 1 ? '' : 's'} · drag to orbit · tap a dot for the play
      </div>
    </div>
  )
  const dockStats = (stats || []).map(([k, v, tone]) => ({ k, v, tone: tone === C.text2 ? undefined : tone }))

  return (
    <StadiumShell theme={C} accent={C.green} chips={chips} presets={PRESETS} active={preset}
      onPreset={(k) => { setPreset(k); apiRef.current.preset?.(k) }} onFullChange={setFull} caption={caption}>
      <div style={{ position: 'relative', ...(full ? { height: '100%' } : {}) }}>
        <div ref={mountRef} style={{
          width: '100%', ...(full ? { height: '100%' } : { minHeight: 340, aspectRatio: '1 / 0.6' }),
          borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`,
        }} />
        {/* the spray chart's dock with the 2D panel's numbers, plate, film, readout (step 0 parts) */}
        <StadiumDock open={dockOpen} onToggle={() => setDockOpen((v) => !v)} now={dots.length} all={dots.length} chips={[]}
          emptyText="The window chips above set what is drawn." stats={narrowBox ? null : dockStats} theme={C} numFont={NUM_FONT}
          accent={C.green} accentSoft={`${C.green}1a`} maxWidth="72%" />
        {/* on a phone the field's own title sits right above, and the plate would cover the BEHIND row */}
        {!narrowBox && <LowerThird title={title} subtitle={venue ? `${subtitle} · ${venue}` : subtitle} theme={C} numFont={NUM_FONT} accent={C.green} fallback="TUDDY" />}
        <FilmOverlay />
        <HoverReadout ref={tipRef} theme={C} numFont={NUM_FONT} maxWidth={220} />
      </div>
    </StadiumShell>
  )
}
