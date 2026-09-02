// 🏟 PARK DRESSING for SprayFieldStadium (2026-09-02). Donovan: "make the
// 3D spray more real." The bowl, the wall, the props and the light rig were
// all there; what was missing was the small stuff a real park has in every
// photograph and a diagram never does — foul poles, a batter's eye, dugouts,
// bullpens, on-deck circles, and nine people standing where the fielders
// stand. None of it is data. All of it is drawn under the arcs, in the same
// dim register as the stands, so the balls stay the brightest thing.
//
// Same contract as lib/stadiumProps: the stadium's own P / wallD / wallH are
// passed in so nothing here can drift from the geometry the balls land on.
//
// Also here: the STRIKE ZONE AT HOME PLATE — the 3D zone map's subject,
// placed in this park at real size, so the zone and the spray are one world.
// From the park camera it is a mark at the plate; the PLATE camera preset in
// the component flies down behind the catcher, and the whole park is still
// there behind the zone. Pitches are the same rows ZoneMapStadium draws:
// pX/pZ at the plate, catcher's view (pX positive = catcher's right = the
// first-base side = world -x here, because P() puts the right-field line on
// negative x).
import * as THREE from 'three'
import { pitchColor, zoneBox, PLATE_HALF } from './livePitches'

const DEG = Math.PI / 180
// The infield block draws home plate 12 ft up the z axis from the origin the
// balls and walls are measured from (its diamond starts at z = 12). Every
// plate-side thing here sits at that same plate.
export const PLATE_Z = 12

export function addParkDressing(scene, { P, wallD, wallH, bowl }) {
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra })
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...extra })

  // ── FOUL POLES. Yellow, tall, with the screen on the fair side. The one
  //    fixture every park has and this scene never drew.
  for (const a of [-45, 45]) {
    const v = P(wallD(a) + 0.6, a)
    const h = Math.max(45, wallH(a) + 40)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, h, 8),
      lam(0xf5c518, { emissive: 0xf5c518, emissiveIntensity: 0.45 }))
    pole.position.set(v.x, h / 2, v.z)
    scene.add(pole)
    // the screen: a thin lattice plane on the fair side of the pole
    const inward = P(1, a + (a < 0 ? 90 : -90)).normalize()
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.5, h * 0.55),
      basic(0xf5c518, { transparent: true, opacity: 0.22, depthWrite: false }))
    screen.position.set(v.x + inward.x * 2.4, h * 0.7, v.z + inward.z * 2.4)
    screen.lookAt(0, h * 0.7, 0)
    scene.add(screen)
  }

  // ── BATTER'S EYE. The dark green block straight away in centre that every
  //    park keeps clear so the hitter can see the ball. Sits on the wall,
  //    not beyond it, unless that sector is open (the Cove, the fountains).
  {
    const open = bowl && (bowl.open || []).some(([f, t]) => f <= 0 && t >= 0)
    if (!open) {
      const pos = []
      for (let a = -7; a < 7; a += 1) {
        const b = a + 1
        const p0 = P(wallD(a) + 3, a), p1 = P(wallD(b) + 3, b)
        const y0 = wallH(a), y1 = wallH(b)
        const H = 34
        pos.push(p0.x, y0, p0.z, p1.x, y1, p1.z, p0.x, y0 + H, p0.z, p1.x, y1, p1.z, p1.x, y1 + H, p1.z, p0.x, y0 + H, p0.z)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, lam(0x14301c)))
    }
  }

  // ── DUGOUTS. A recessed box along each line, first and third, with a lit
  //    lip — the two dark mouths beside the infield that say "ballpark" in
  //    any wide shot.
  for (const side of [-1, 1]) {
    const a = side * 45
    const along = P(1, a).normalize()              // down the line
    const out = P(1, a + side * 90).normalize()    // into foul ground
    const mid = P(90, a)
    const cx = mid.x + out.x * 9, cz = mid.z + out.z * 9
    const box = new THREE.Mesh(new THREE.BoxGeometry(60, 4.5, 12), lam(0x0c0f13))
    box.position.set(cx, -1.8, cz)
    box.rotation.y = Math.atan2(along.x, along.z)
    scene.add(box)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 0.8), basic(0xf59e0b, { transparent: true, opacity: 0.7 }))
    lip.position.set(cx - out.x * 5.6, 0.7, cz - out.z * 5.6)
    lip.rotation.y = box.rotation.y
    scene.add(lip)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(60, 0.6, 13), lam(0x1b2027))
    roof.position.set(cx, 7.2, cz)
    roof.rotation.y = box.rotation.y
    scene.add(roof)
  }

  // ── ON-DECK CIRCLES. Two dirt discs behind and beside the plate.
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), lam(0x7a5636))
    c.rotation.x = -Math.PI / 2
    c.position.set(sx * 13, 0.05, PLATE_Z - 11)
    scene.add(c)
  }

  // ── BULLPENS. Two strips of dirt with a rubber, in foul ground down each
  //    line — where they are in most parks, and where a wall-to-wall bowl
  //    otherwise leaves a bare apron.
  for (const side of [-1, 1]) {
    const a = side * 49
    const v = P(255, a)
    const along = P(1, a).normalize()
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(14, 70), lam(0x6a4a30))
    pad.rotation.x = -Math.PI / 2
    pad.rotation.z = -Math.atan2(along.x, along.z)
    pad.position.set(v.x, 0.08, v.z)
    scene.add(pad)
    for (const k of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x8a6540))
      m.scale.y = 0.14
      m.position.set(v.x + along.x * k * 22, 0.1, v.z + along.z * k * 22)
      scene.add(m)
    }
  }

  // ── THE FIELDERS. Nine figures at the positions, plus the hitter and
  //    the umpire — small, in the visitors' grey and a dark cap, so they
  //    read as people at a glance and never as marks. A figure is a capsule
  //    and a head; at this scale that is all a person is.
  {
    const uni = lam(0xe2e4e8)
    const cap = lam(0x1f2937)
    const skin = lam(0xc9a781)
    const figure = (x, z, faceX = 0, faceZ = 0) => {
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.6, 4, 8), uni)
      body.position.y = 2.6
      g.add(body)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), skin)
      head.position.y = 4.9
      g.add(head)
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 10), cap)
      brim.position.y = 5.35
      g.add(brim)
      g.position.set(x, 0, z)
      g.lookAt(faceX, 0, faceZ)
      scene.add(g)
      return g
    }
    // (r, ang) from home, facing the plate
    ;[[60.5, 0], [105, 28], [148, 11], [148, -11], [105, -28], [290, -24], [318, 0], [290, 24]].forEach(([r, a]) => {
      const v = P(r, a)
      figure(v.x, v.z, 0, 0)
    })
    // catcher, crouched (shorter), the umpire behind him, and the hitter in
    // the right-handed box (world +x is the third-base side). These three
    // are grouped so the plate camera can stand where they stand.
    const near = new THREE.Group()
    const c = figure(0, PLATE_Z - 3.2, 0, 60)
    c.scale.y = 0.62
    const u = figure(0, PLATE_Z - 6.8, 0, 60)
    u.scale.setScalar(1.05)
    const h = figure(2.6, PLATE_Z + 0.4, -40, 60)
    h.children[0].material = lam(0xf4f4f5)
    ;[c, u, h].forEach((f) => { scene.remove(f); near.add(f) })
    scene.add(near)
    return { near }
  }
}

// ── THE STRIKE ZONE AT THE PLATE ─────────────────────────────────────────
// The zone rectangle at this batter's measured height, the shadow zone
// dashed around it, and tonight's crossings as marks — the same rows
// ZoneMapStadium draws, in the same colours, at real size in the park.
// Returns the group so the component can point a camera at it.
export function addPlateZone(scene, { pitches = [] }) {
  const group = new THREE.Group()
  const live = (pitches || []).filter((p) => p && p.x != null && p.z != null)
  const box = zoneBox(live)
  const ZT = box.top, ZB = box.bot
  const X = (px) => -px   // catcher's right → world -x (the first-base side)
  const line = (pts, col, op, dashed) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    const m = dashed
      ? new THREE.LineDashedMaterial({ color: col, transparent: true, opacity: op, dashSize: 0.16, gapSize: 0.12 })
      : new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })
    const l = new THREE.Line(g, m)
    if (dashed) l.computeLineDistances()
    group.add(l)
    return l
  }
  const rect = (hw, b, t, col, op, dashed) => line([
    new THREE.Vector3(-hw, b, 0), new THREE.Vector3(hw, b, 0), new THREE.Vector3(hw, t, 0),
    new THREE.Vector3(-hw, t, 0), new THREE.Vector3(-hw, b, 0),
  ], col, op, dashed)
  rect(PLATE_HALF, ZB, ZT, 0xf4f4f5, 0.9, false)
  rect(PLATE_HALF + 0.3, ZB - 0.3, ZT + 0.3, 0xf4f4f5, 0.35, true)
  // the nine cells, faint
  for (let i = 1; i < 3; i++) {
    const x = -PLATE_HALF + (2 * PLATE_HALF * i) / 3
    const y = ZB + ((ZT - ZB) * i) / 3
    line([new THREE.Vector3(x, ZB, 0), new THREE.Vector3(x, ZT, 0)], 0xf4f4f5, 0.18, false)
    line([new THREE.Vector3(-PLATE_HALF, y, 0), new THREE.Vector3(PLATE_HALF, y, 0)], 0xf4f4f5, 0.18, false)
  }
  // a faint fill so the zone reads as a pane from the park camera
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_HALF * 2, ZT - ZB),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }))
  pane.position.set(0, (ZT + ZB) / 2, 0.005)
  group.add(pane)

  // tonight's crossings: colour = pitch type, shape = what happened, the
  // flat map's rule, at real size — a baseball is 0.24 ft across
  live.forEach((p) => {
    const hex = pitchColor(p.type)
    const kind = p.kind || 'ball'
    let mark
    if (kind === 'inplay') {
      mark = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: hex }))
    } else if (kind === 'whiff') {
      mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: hex }))
    } else if (kind === 'foul') {
      mark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.6 }))
    } else {
      mark = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 18),
        new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: true, opacity: kind === 'called' ? 1 : 0.7 }))
    }
    mark.position.set(X(p.x), p.z, 0)
    group.add(mark)
    // the last stretch of the pitch, from 12 ft out, so a crossing has a
    // direction and the marks read as arrivals rather than stickers
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(X(p.x) * 0.7 + (p.hand === 'L' ? -0.6 : 0.6) * 0.3, p.z + 1.1, 12),
      new THREE.Vector3(X(p.x), p.z, 0),
    ])
    group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.35 })))
  })
  // the plate itself is drawn by the infield block; the zone floats at its
  // front edge, which is where the rulebook puts it
  group.position.set(0, 0, PLATE_Z)
  scene.add(group)
  return { group, top: ZT, bot: ZB, n: live.length }
}
