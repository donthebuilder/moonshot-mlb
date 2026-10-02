// 🏟 THE PARK ITSELF (2026-09-02) — the world both 3D charts stand in.
//
// Donovan: "I want them based in the same world, not on the same line —
// I like where each lived." So the spray chart and the zone map stay two
// charts in two places, and this file is the one ballpark they are both
// drawn inside: the dusk dome, the light rig, the grass and its mow bands,
// the track, the infield, the foul lines, the wall with its rail and its
// five numbers, the bowl and its crowd, the light towers, the signature
// props and the dressing. Moved here VERBATIM from SprayFieldStadium
// (every comment kept — they are the reasoning), so nothing about the
// spray chart's park changed by moving; ZoneMapStadium now calls the same
// function and gets the same building around its plate.
//
// buildPark(scene, ctx) draws into `scene` using the caller's own P / wallD /
// wallH / maxD / SEG, so a caller's coordinate frame is the park's frame.
// Returns { bowl } — the caller already has the rest.
import * as THREE from 'three'
import { numberSprite } from './three/sprites'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import { bowlFor, isOpenSector } from './parkBowls'
import { addParkProps } from './stadiumProps'
import { propsFor } from './parkProps'
import { addParkDressing } from './stadiumDressing'
import { radialTex, grainTex, lampTex, brickTex, ribbonTex, rowsTex } from './arenaTex'
import { arenaRig, arenaBowlFan } from './arena'
// re-exported: lib/stadiumProps.js has always imported these from here
export { radialTex, lampTex, brickTex, ribbonTex }

// Distance number as a sprite texture — three.js has no text; a small canvas
// does. Same as the stadium's own; it lives here now because the wall is here.


// The five published anchors, interpolated across the 90° of fair ground.
export const lerp5 = (arr, ang) => {
  const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
  const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
  return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
}
const DEG = Math.PI / 180
// The one frame both charts share: home plate at the origin, the field up
// +z, the right-field line on -x (so catcher's-right is world -x, which is
// also what the zone map's PT() does). See the MIRROR FIX note in
// SprayFieldStadium for why the x is negated.
export const fieldPoint = (r, ang) => new THREE.Vector3(-r * Math.sin(ang * DEG), 0, r * Math.cos(ang * DEG))
export const GENERIC_DIMS = [330, 375, 400, 375, 330]
export const GENERIC_HEIGHTS = [8, 8, 8, 8, 8]




// Grass is not white noise: it has a coarse patchiness (worn spots, damp
// spots) under a fine blade grain, and the blades lie along the mow. Two
// octaves and a directional streak.
function grassGrain(size = 256) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  g.fillStyle = '#8c8c8c'
  g.fillRect(0, 0, size, size)
  // coarse patches
  for (let i = 0; i < 90; i++) {
    const r = 12 + Math.random() * 30
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`
    g.beginPath(); g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2); g.fill()
  }
  // fine blade grain
  const img = g.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 44
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.6))
  }
  g.putImageData(img, 0, 0)
  // THE MOW, BAKED IN (2026-09-02). Donovan on the ring-and-sector checker:
  // it read "like a street" — a crosswalk, not a lawn. Real outfields are
  // cut in straight lanes, so the lanes live in the grain itself: two bands
  // per tile, one a shade lighter, running the texture's u axis, which is
  // world x — lanes parallel to the line from the plate to centre.
  g.fillStyle = 'rgba(255,255,255,.06)'
  g.fillRect(0, 0, size / 2, size)
  // blades: short streaks, all one way
  g.strokeStyle = 'rgba(255,255,255,.07)'
  g.lineWidth = 1
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * size, y = Math.random() * size
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y - 3 - Math.random() * 4); g.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

export function buildPark(scene, { dims, heights, venue, P, wallD, wallH, maxD, SEG }) {
  // per-frame work the park owns (water, later anything that moves);
  // the component's tick calls world.step(t)
  const steps = []
  // shared surfaces — one texture each, tiled
  const grassTex = grassGrain()                      // grey grain; the mesh colour tints it
  const dirtTex = grainTex(0x8c8c8c, 18, 256, true)
  grassTex.repeat.set(1 / 38, 1 / 38)
  dirtTex.repeat.set(1 / 30, 1 / 30)
  // `surface` tags let lib/stadiumLook swap in a photo texture if one is
  // dropped into public/textures — see loadPhotoSurfaces
  const grassMat = (hex) => { const m = new THREE.MeshLambertMaterial({ color: hex, map: grassTex, side: THREE.DoubleSide }); m.userData.surface = 'grass'; return m }
  const dirtMat = (hex) => { const m = new THREE.MeshLambertMaterial({ color: hex, map: dirtTex, side: THREE.DoubleSide }); m.userData.surface = 'dirt'; return m }
  const dirtLift = (hex) => lift(hex, 1.3)
  // a Lambert map multiplies the colour by the texel; grey grain around
  // 0x8c means the mesh colour has to be lifted by ~1.8 to land where the
  // flat colour used to
  const lift = (hex, k = 1.82) => new THREE.Color(hex).multiplyScalar(k)
  // Ring and circle geometries carry 0..1 UVs across their whole extent,
  // which would stretch one grain tile over the outfield; a planar UV from
  // the geometry's own x/y keeps the grain the same size everywhere.
  const planarUV = (geo) => {
    const p = geo.getAttribute('position')
    const uv = []
    for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getY(i))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    return geo
  }

  // the arena's light rig, dusk dome and outside world (lib/arena.js)
  arenaRig(scene, { venue, maxD })

  // ── GRASS, WITH MOWING STRIPES. Base wedge shaped by the real wall,
  //    then alternating lighter ring bands on top. RingGeometry lives in
  //    XY with θ from +X; rotateX(-90°) puts θ in the XZ plane, so our
  //    -45°..45°-about-+Z wedge is θ 45°..135°.
  {
    // Shape space is XY; rotateX(-90°) maps (x, y) -> (x, 0, -y) with the
    // normal UP, so world z = -shapeY. Built with -v.z, NOT v.z — pass one
    // used rotateX(+90°)+scale(1,1,-1), which left the normals pointing
    // DOWN (black from above) and mirrored half the flats behind the
    // plate. Verified by rendering, not by reasoning about it twice.
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    for (let i = 0; i <= SEG; i++) {
      const a = -45 + (90 * i) / SEG
      const v = P(wallD(a), a)
      shape.lineTo(v.x, -v.z)
    }
    shape.lineTo(0, 0)
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    // HALFWAY (2026-08-31). Donovan: "the park looked good before with the
    // regular colors." He is right that 0x18331f went too far — it took the
    // park out of the picture entirely, and the park is the thing he wanted
    // rendered. This is the exact midpoint between that and the original
    // 0x2e5c3a: clearly green and clearly a ballpark, still a step below the
    // arcs crossing it so the data stays the brightest thing on screen.
    //
    // The FLATNESS was never the green — it was the hemisphere light, and
    // that fix stays. Colour and lighting are separate problems and the
    // earlier pass conflated them.
    const grass = new THREE.Mesh(g, grassMat(lift(0x23472c)))
    grass.position.y = -0.3
    scene.add(grass)

    // (the mow lanes are in the grass grain itself — see grassGrain)
  }

  // ── WARNING TRACK — a flat 14-ft band tracing the wall's own shape.
  {
    const pos = []
    for (let i = 0; i < SEG; i++) {
      const a0 = -45 + (90 * i) / SEG
      const a1 = -45 + (90 * (i + 1)) / SEG
      const o0 = P(wallD(a0), a0), o1 = P(wallD(a1), a1)
      const n0 = P(wallD(a0) - 14, a0), n1 = P(wallD(a1) - 14, a1)
      pos.push(
        n0.x, 0, n0.z, o0.x, 0, o0.z, n1.x, 0, n1.z,
        o0.x, 0, o0.z, o1.x, 0, o1.z, n1.x, 0, n1.z,
      )
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    // planar UVs so the dirt grain tiles across the band
    const uv = []
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], pos[i + 2])
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    const track = new THREE.Mesh(g, dirtMat(dirtLift(0x6b4a30)))
    track.position.y = -0.1
    scene.add(track)
  }

  // ── THE INFIELD: dirt arc, grass diamond, mound, plate, bases.
  {
    // THE SKIN (design pass, 2026-09-02). The rulebook's arc is 95 ft from
    // the RUBBER, not from the plate — so it reaches past second base and
    // wraps behind the plate, which is where the catcher's box and the
    // on-deck circles actually sit. A quarter-wedge from home left second
    // base standing on grass.
    const dirt = new THREE.Mesh(planarUV(new THREE.CircleGeometry(95, 64)), dirtMat(dirtLift(0x7a5636)))
    dirt.rotation.x = -Math.PI / 2
    dirt.position.set(0, 0.02, 60.5)
    scene.add(dirt)

    // grass diamond — a 63-ft square rotated so its corners sit on the
    // basepaths, standard skinned-infield look
    const dShape = new THREE.Shape()
    const q = 90 / Math.SQRT2 - 6      // the grass stops a basepath short of each bag
    dShape.moveTo(0, -14)
    dShape.lineTo(q, -(14 + q))
    dShape.lineTo(0, -(14 + 2 * q))
    dShape.lineTo(-q, -(14 + q))
    dShape.lineTo(0, -14)
    const dg = new THREE.ShapeGeometry(dShape)
    dg.rotateX(-Math.PI / 2)
    const diamond = new THREE.Mesh(dg, grassMat(lift(0x2e5c3a)))
    diamond.position.y = 0.06
    scene.add(diamond)

    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x8a6540 }),
    )
    mound.scale.y = 0.16
    mound.position.set(0, 0, 60.5)
    scene.add(mound)

    // HOME IS THE ORIGIN (2026-09-02). The bases used to sit on a 63-ft
    // square starting 12 ft up the z axis, so the plate was 12 ft from the
    // point every ball and every wall is measured from. Now: the plate at
    // 0, the bases 90 ft away on the lines, the grass diamond cut behind
    // the plate's dirt — the frame the zone map's plate already used.
    const baseGeo = new THREE.BoxGeometry(3.4, 0.7, 3.4)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xe8e8ec })
    const half = 90 / Math.SQRT2
    ;[[-half, half], [0, 2 * half], [half, half]].forEach(([x, z]) => {
      const b = new THREE.Mesh(baseGeo, baseMat)
      b.position.set(x, 0.4, z)
      scene.add(b)
    })
    // home plate, POINT toward the catcher (-z) — the way it actually sits
    {
      const PH = 0.708
      const sh = new THREE.Shape()
      sh.moveTo(-PH, PH); sh.lineTo(PH, PH); sh.lineTo(PH, 0); sh.lineTo(0, -PH); sh.lineTo(-PH, 0); sh.lineTo(-PH, PH)
      const pm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xd2d6dc, side: THREE.DoubleSide }))
      pm.rotation.x = -Math.PI / 2
      pm.position.y = 0.12
      pm.scale.set(1, -1, 1)
      scene.add(pm)
    }
  }

  // ── CHALK (design pass, 2026-09-02). The foul lines were one-pixel GL
  //    lines, which are the same width at any distance and vanish at most.
  //    Chalk is a strip on the ground: a real 4-inch line, plus the two
  //    batter's boxes and the catcher's box, which are the things a
  //    catcher's-view camera sees first and this park never drew. And the
  //    rubber on the mound.
  {
    const chalk = new THREE.MeshBasicMaterial({ color: 0xf4f4f5, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    // a strip between two ground points, `w` wide
    const strip = (ax, az, bx, bz, w = 0.4, y = 0.3) => {
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), chalk)
      m.rotation.x = -Math.PI / 2
      // Euler XYZ applies Z first, in the plane's own XY; after the X tilt
      // local +y is world -z, so the strip's heading is atan2(-dx, -dz)
      m.rotation.z = Math.atan2(-dx, -dz)
      m.position.set((ax + bx) / 2, y, (az + bz) / 2)
      scene.add(m)
    }
    for (const a of [-45, 45]) {
      const s0 = P(3, a), s1 = P(wallD(a), a)
      strip(s0.x, s0.z, s1.x, s1.z, 0.45)
    }
    // batter's boxes: 4 × 6 ft, 6 in off the plate, centred on it
    for (const sx of [-1, 1]) {
      const x0 = sx * 1.21, x1 = sx * 5.21
      strip(x0, -3, x1, -3, 0.25); strip(x0, 3, x1, 3, 0.25)
      strip(x0, -3, x0, 3, 0.25); strip(x1, -3, x1, 3, 0.25)
    }
    // catcher's box: 3 ft 7 wide, 8 ft deep behind the plate
    strip(-1.79, -3, -1.79, -11, 0.25); strip(1.79, -3, 1.79, -11, 0.25); strip(-1.79, -11, 1.79, -11, 0.25)
    // the rubber
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.5), chalk)
    rubber.position.set(0, 1.55, 60.5)
    scene.add(rubber)
  }

  // ── THE WALL: opaque, clearly a wall, with a lit top rail (a thin box
  //    strip — LineBasicMaterial linewidth is a no-op on most GPUs) and
  //    the park's five distance numbers painted at their anchors.
  {
    const pos = []
    for (let i = 0; i < SEG; i++) {
      const a0 = -45 + (90 * i) / SEG
      const a1 = -45 + (90 * (i + 1)) / SEG
      const b0 = P(wallD(a0), a0), b1 = P(wallD(a1), a1)
      const h0 = wallH(a0), h1 = wallH(a1)
      pos.push(
        b0.x, 0, b0.z, b1.x, 0, b1.z, b0.x, h0, b0.z,
        b1.x, 0, b1.z, b1.x, h1, b1.z, b0.x, h0, b0.z,
      )
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    // PADS (design pass, 2026-09-02). One flat colour is a painted board;
    // an outfield wall is padded in panels, and the seam every few feet is
    // what the eye reads as "wall". Every third segment (≈2.8°) steps
    // down a shade, per vertex, so it costs nothing.
    const wc = []
    const base = new THREE.Color(0x24586e)
    for (let i = 0; i < SEG; i++) {
      const k = Math.floor(i / 3) % 2 ? 0.86 : 1
      for (let v = 0; v < 6; v++) wc.push(base.r * k, base.g * k, base.b * k)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3))
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })))
    // and the dark base every padded wall has — a foot of shadow at the grass
    const basePos = []
    for (let i = 0; i < SEG; i++) {
      const a0 = -45 + (90 * i) / SEG, a1 = -45 + (90 * (i + 1)) / SEG
      const b0 = P(wallD(a0) - 0.15, a0), b1 = P(wallD(a1) - 0.15, a1)
      basePos.push(b0.x, 0, b0.z, b1.x, 0, b1.z, b0.x, 1.1, b0.z, b1.x, 0, b1.z, b1.x, 1.1, b1.z, b0.x, 1.1, b0.z)
    }
    const bg = new THREE.BufferGeometry()
    bg.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3))
    scene.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x0f1a22, side: THREE.DoubleSide })))

    // top rail — small quads riding the crest, warm and emissive-ish
    const railPos = []
    for (let i = 0; i < SEG; i++) {
      const a0 = -45 + (90 * i) / SEG
      const a1 = -45 + (90 * (i + 1)) / SEG
      const b0 = P(wallD(a0), a0), b1 = P(wallD(a1), a1)
      const h0 = wallH(a0), h1 = wallH(a1)
      railPos.push(
        b0.x, h0, b0.z, b1.x, h1, b1.z, b0.x, h0 + 0.9, b0.z,
        b1.x, h1, b1.z, b1.x, h1 + 0.9, b1.z, b0.x, h0 + 0.9, b0.z,
      )
    }
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3))
    rg.computeVertexNormals()
    scene.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xf59e0b })))

    // distance numbers at the five published anchors, floating just above
    // the crest and always facing the camera
    ;[-45, -22.5, 0, 22.5, 45].forEach((a, i) => {
      const s = numberSprite(String(Math.round(dims[i])))
      const v = P(wallD(a) - 2, a)
      s.position.set(v.x, wallH(a) + 9, v.z)
      scene.add(s)
    })
  }

  // ── THE BOWL (2026-08-31). Until now the park stopped at the wall, and
  //    every venue read as the same ring with different numbers on it.
  //    parkBowls.js says where the seats AREN'T, which is the strongest tell
  //    there is: McCovey Cove eats Oracle's right field, the warehouse eats
  //    Camden's, the Allegheny eats PNC's. Deck segments are cut against
  //    `open`, so those sectors simply have no stands.
  //
  //    Parametric, not surveyed — nothing scores off this, it is for the eye.
  const bowl = bowlFor(venue)
  let dressing = null
  {
    // the arena's bowl, the 'fan' footprint (lib/arena.js)
    const { innerR } = arenaBowlFan(scene, { steps, bowl, venue, P, wallD, wallH, maxD })

    // generic props every park gets through the same vocabulary as its
    // signatures: a videoboard beyond the outfield unless the park's own
    // list already puts a board there (or the sector is open water/sky),
    // and the roof arches for the retractable and fixed-roof parks
    const own = propsFor(venue)
    const extra = []
    const hasBoard = own.some((p) => ['board', 'crown', 'hexboard', 'pinwheels', 'videoboard'].includes(p.kind))
    if (!hasBoard) {
      // put it where the seats are: centre if closed, else the first
      // closed sector out from centre
      const at = [0, -14, 14, -26, 26].find((a) => !isOpenSector(bowl, a) && !isOpenSector(bowl, a - 8) && !isOpenSector(bowl, a + 8))
      if (at !== undefined) extra.push({ kind: 'videoboard', a: at, off: 118, y: 74, w: 96, h: 40, text: venue })
    }
    if ((bowl.roof === 'retract' || bowl.roof === 'fixed') && !own.some((p) => p.kind === 'trusses')) {
      extra.push({ kind: 'trusses', from: -64, to: 64, off: 40, gap: 46, n: 3, y: 205, y0: 112 })
    }
    addParkProps(scene, { venue, P, wallD, wallH, steps, extra, inner: innerR })
    // the small stuff a real park has in every photograph (2026-09-02)
    dressing = addParkDressing(scene, { P, wallD, wallH, bowl, foulPens: !own.some((p) => p.kind === 'pen') })

    // ── NO ROOF, EVER (2026-08-31). Donovan: "the roof thing in general
    //    is dumb -- just make it so everyone is an open dome."
    //
    //    He is right, and the reason is worth writing down because the
    //    feature looked reasonable on paper. A closed roof is OPAQUE: it
    //    deletes the sky, the stars, the moon, the towers and the skyline,
    //    and it forces the camera under a ceiling. So the parks with the
    //    most distinctive buildings were the ones this drew as a dark lid
    //    over a dark bowl, and Tropicana -- a FIXED dome -- could never be
    //    drawn any other way. The best-looking view was unavailable exactly
    //    where it was most wanted.
    //
    //    And it was never a fact. Nothing in the payload says whether
    //    tonight's roof is open, so the chip was only ever a view setting
    //    wearing the costume of a report -- the previous pass had to rename
    //    it "Drawn roof OPEN" just to stop it lying. A setting that cannot
    //    inform anything and makes the picture worse is not a setting.
    //
    //    Every park is drawn open now. The bowl, the sector cuts and the
    //    signature props still differ per park -- that is real geometry.
    //    Only the lid is gone.
  }
  return { bowl, dressing, step: (t) => { for (const f of steps) f(t) } }
}
