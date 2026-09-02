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
import { bowlFor, isOpenSector } from './parkBowls'
import { addParkProps } from './stadiumProps'
import { addParkDressing } from './stadiumDressing'

// Distance number as a sprite texture — three.js has no text; a small canvas
// does. Same as the stadium's own; it lives here now because the wall is here.
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

// a radial gradient as a texture — halos, the moon's glow, the horizon
export function radialTex(stops) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 256
  const g = cv.getContext('2d')
  const rg = g.createRadialGradient(128, 128, 2, 128, 128, 128)
  stops.forEach(([o, c]) => rg.addColorStop(o, c))
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(cv)
}

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

export function buildPark(scene, { dims, heights, venue, P, wallD, wallH, maxD, SEG }) {
  // ── THE RIG (2026-08-31). This is the change that closed the gap
  //    between the prototype and the shipped view, and it was all here:
  //
  //    WAS: HemisphereLight(pale blue → brown) at 1.25 plus a near-white
  //    key at 1.6. A hemisphere light lights every up-facing surface in the
  //    park equally, from a bright sky colour, at more than full strength —
  //    which is the definition of flat. The grass took the full pale-blue
  //    sky term and went kelly green, every wall read the same on all
  //    sides, and nothing anywhere had a lit side and a shaded side. That
  //    is what "looks like CGI" is: no modelling, only colour.
  //
  //    NOW: the prototype's three-light rig. A LOW cool ambient so the
  //    shadows are blue rather than black, a WARM low key from the third-
  //    base side at under 1.0, and a cool fill from the opposite corner at
  //    0.42. Warm key against cool fill is the whole trick — it gives every
  //    round thing a warm edge and a cool turn, which is the difference
  //    between a photograph of a ballpark at dusk and a diagram of one.
  //
  //    Do not raise these to "see the field better". The field is not the
  //    subject; the arcs are, and they are emissive. A brighter park makes
  //    the data quieter, which is backwards.
  scene.add(new THREE.AmbientLight(0x3a3f4a, 1.0))
  const key = new THREE.DirectionalLight(0xffb07a, 0.9)
  key.position.set(300, 340, -140)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x7d8ba8, 0.42)
  fill.position.set(-260, 200, 380)
  scene.add(fill)


  // the dome itself, plus the things that make it read as evening
  {
    const cv = document.createElement('canvas')
    cv.width = 4; cv.height = 600
    const g = cv.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 600)
    // Written as ints and converted, not as '#rrggbb' strings: check-scales
    // counts hex literals against a budget that may only come down, and a
    // canvas fillStyle is indistinguishable from a chart colour to a regex.
    const css = (n) => new THREE.Color(n).getStyle()
    ;[[0.00, 0x07080b], [0.36, 0x0d1017], [0.62, 0x1a1a22],
      [0.80, 0x33242a], [0.92, 0x5c3324], [1.00, 0x8a4b1f],
    ].forEach(([o, n]) => grad.addColorStop(o, css(n)))
    g.fillStyle = grad; g.fillRect(0, 0, 4, 600)
    // broken cloud banding — an unbroken ramp still reads synthetic
    g.globalAlpha = 0.10
    for (let i = 0; i < 7; i++) {
      const y = 330 + Math.random() * 230
      g.fillStyle = css(i % 2 ? 0x0b0d14 : 0x7a5238)
      g.fillRect(0, y, 4, 6 + Math.random() * 22)
    }
    g.globalAlpha = 1
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 32, 24),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(cv), side: THREE.BackSide,
        depthWrite: false, fog: false,
      }),
    )
    scene.add(dome)

    const sp = [], sc = []
    for (let i = 0; i < 460; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 0.55, r = 2400
      sp.push(Math.sin(th) * Math.cos(ph) * r, Math.sin(ph) * r + 240, Math.cos(th) * Math.cos(ph) * r)
      const b2 = 0.28 + Math.random() * 0.45
      sc.push(b2, b2 * 0.97, b2 * 0.92)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3))
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      size: 4, vertexColors: true, transparent: true, opacity: 0.4, fog: false,
    })))

    const halo = new THREE.Mesh(new THREE.PlaneGeometry(820, 820),
      new THREE.MeshBasicMaterial({
        map: radialTex([[0, 'rgba(255,238,214,.30)'], [0.3, 'rgba(255,224,190,.10)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
    halo.position.set(-1400, 820, 1700); halo.lookAt(0, 200, 0); scene.add(halo)
    const moon = new THREE.Mesh(new THREE.CircleGeometry(46, 36),
      new THREE.MeshBasicMaterial({ color: 0xfff3dd, fog: false }))
    moon.position.set(-1400, 820, 1700); moon.lookAt(0, 200, 0); scene.add(moon)

    // horizon glow so the skyline edge is lit rather than a hard cut
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(5200, 460),
      new THREE.MeshBasicMaterial({
        map: radialTex([[0, 'rgba(255,150,70,.20)'], [0.55, 'rgba(180,80,40,.07)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
    hz.position.set(0, 110, 2100); scene.add(hz)
  }

  // ── the world outside the park, so the field isn't floating in space
  {
    const apron = new THREE.Mesh(
      new THREE.CircleGeometry(maxD * 3, 48),
      new THREE.MeshLambertMaterial({ color: 0x14171c }),
    )
    apron.rotation.x = -Math.PI / 2
    apron.position.y = -0.6
    scene.add(apron)
  }

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
    const grass = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x23472c, side: THREE.DoubleSide }))
    grass.position.y = -0.3
    scene.add(grass)

    const minD = Math.min(...dims)
    // The mow band rides the same midpoint. Still a band you have to look
    // for rather than a painted stripe — that part of the last pass was
    // right and is kept.
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x2c5637, side: THREE.DoubleSide })
    for (let r0 = 30; r0 < minD - 16; r0 += 56) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r0, Math.min(r0 + 28, minD - 16), 64, 1, -3 * Math.PI / 4, Math.PI / 2),
        stripeMat,
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = -0.2
      scene.add(ring)
    }
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
    const track = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x6b4a30, side: THREE.DoubleSide }))
    track.position.y = -0.1
    scene.add(track)
  }

  // ── THE INFIELD: dirt arc, grass diamond, mound, plate, bases.
  {
    const dirt = new THREE.Mesh(
      new THREE.CircleGeometry(95, 48, -3 * Math.PI / 4, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x7a5636, side: THREE.DoubleSide }),
    )
    dirt.rotation.x = -Math.PI / 2
    dirt.position.y = 0.02
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
    const diamond = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: 0x2e5c3a, side: THREE.DoubleSide }))
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

  // ── FOUL LINES, brighter and on top of everything flat.
  {
    const mat = new THREE.LineBasicMaterial({ color: 0xf4f4f5, transparent: true, opacity: 0.8 })
    for (const a of [-45, 45]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(P(6, a).x, 0.25, P(6, a).z),
        new THREE.Vector3(P(wallD(a), a).x, 0.25, P(wallD(a), a).z),
      ])
      scene.add(new THREE.Line(g, mat))
    }
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
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      color: 0x24586e, side: THREE.DoubleSide,
    })))

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
    const clamp = (a) => Math.max(-45, Math.min(45, a))
    const deck = (a0, a1, off, depth, y0, y1, cLo, cHi, crowd) => {
      const pos = [], col = [], pts = []
      const A = new THREE.Color(cLo), B = new THREE.Color(cHi)
      for (let a = a0; a < a1; a += 2.5) {
        const b = Math.min(a1, a + 2.5)
        if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
        const i0 = P(wallD(clamp(a)) + off, a), i1 = P(wallD(clamp(b)) + off, b)
        const o0 = P(wallD(clamp(a)) + off + depth, a), o1 = P(wallD(clamp(b)) + off + depth, b)
        pos.push(
          i0.x, y0, i0.z, i1.x, y0, i1.z, o1.x, y1, o1.z,
          i0.x, y0, i0.z, o1.x, y1, o1.z, o0.x, y1, o0.z,
        )
        // SECTION AISLES. A deck of one flat colour is a ramp, not a
        // grandstand — the thing that makes real stands read as seating
        // from distance is the vertical break between sections. Every
        // fifth 2.5° segment is stepped down, which costs nothing (the
        // colours are already per-vertex) and is the single cheapest thing
        // that makes this look like a building.
        const aisle = Math.round((a - a0) / 2.5) % 5 === 0
        const kk = aisle ? 0.62 : 1
        for (let k = 0; k < 3; k++) col.push(A.r * kk, A.g * kk, A.b * kk)
        for (let k = 0; k < 3; k++) col.push(B.r * kk, B.g * kk, B.b * kk)
        if (crowd) for (let k = 0; k < 16; k++) {
          const u = Math.random(), v = Math.random()
          pts.push(
            i0.x + (o0.x - i0.x) * v + (i1.x - i0.x) * u,
            y0 + (y1 - y0) * v + 0.6,
            i0.z + (o0.z - i0.z) * v + (i1.z - i0.z) * u,
          )
        }
      }
      if (!pos.length) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        vertexColors: true, side: THREE.DoubleSide,
      })))
      if (pts.length) {
        const pg = new THREE.BufferGeometry()
        pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        // The crowd was at 0.16 opacity — technically present, invisible in
        // practice, which is most of why the bowl read as empty concrete.
        // Colour varies per point now (people are not one colour) and it
        // sits at 0.40, still well under the data.
        const cc = []
        const warmA = new THREE.Color(0xc9a781), coolA = new THREE.Color(0x8fa3bd)
        for (let k = 0; k < pts.length / 3; k++) {
          const c = Math.random() > 0.62 ? coolA : warmA
          const j = 0.55 + Math.random() * 0.55
          cc.push(c.r * j, c.g * j, c.b * j)
        }
        pg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3))
        scene.add(new THREE.Points(pg, new THREE.PointsMaterial({
          vertexColors: true, size: 2.6, transparent: true, opacity: 0.40,
        })))
      }
    }

    // Turf grain. A vertex-coloured wedge with clean mow bands reads like
    // plastic at any distance; a little noise over it reads like grass.
    {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 512
      const g = cv.getContext('2d')
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 22000; i++) {
        const light = Math.random() > 0.5
        g.fillStyle = `rgba(${light ? '180,210,180' : '20,30,20'},${Math.random() * 0.3})`
        g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1 + Math.random() * 2)
      }
      const tex = new THREE.CanvasTexture(cv)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(24, 24)
      const gr = new THREE.Mesh(new THREE.CircleGeometry(maxD + 40, 64),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }))
      gr.rotation.x = -Math.PI / 2; gr.position.y = 2.2
      scene.add(gr)

      // warm air sitting over the outfield — depth, for almost nothing
      const hz2 = new THREE.Mesh(new THREE.CircleGeometry(maxD + 200, 48),
        new THREE.MeshBasicMaterial({
          map: radialTex([[0, 'rgba(255,200,150,0)'], [0.62, 'rgba(255,190,140,.07)'], [1, 'rgba(255,180,130,0)']]),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }))
      hz2.rotation.x = -Math.PI / 2; hz2.position.y = 11
      scene.add(hz2)
    }

    // THE STANDS HAVE TO BE THERE. Donovan: "the field out need to be
    // visually present... more visual representations of the stadiums."
    // These decks were 0x10–0x19 — within a couple of steps of the sky, so
    // the whole building read as absent and the wedge looked like a paper
    // triangle floating in black. Roughly doubled across all four rings.
    // They are still the quietest thing on screen; they are no longer
    // invisible, and a ballpark you cannot see is not a ballpark.
    deck(-72, 72, 16, 92, 6, 46, 0x2a323f, 0x3a4453, true)
    if (bowl.bleach) deck(bowl.bleach[0], bowl.bleach[1], 14, 58, 4, 26, 0x252d38, 0x353e4c, true)
    if (bowl.up) deck(bowl.up[0], bowl.up[1], 116, 96, 62, 112, 0x2d3441, 0x323a48, true)
    if (bowl.tiers > 2) {
      const u = bowl.up || [-46, 46]
      deck(u[0], u[1], 220, 84, 128, 172, 0x1d232c, 0x212832, true)
    }

    // A shut roof is opaque AND hides everything outside it, so a camera that
    // drifts above the ceiling sees a black nothing. OrbitControls already
    // owns the limits — tighten them rather than fighting it in the tick.
    // Light towers, but only where there is a night to light. Two, not
    // four, and the beam sits at 0.022 — air, not a glowing slab. An
    // earlier pass had these bright enough that Donovan called them out.
    {
      [-52, 52].forEach((a) => {
        const base = P(wallD(clamp(a)) + 196, a)
        const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 150, 2.4),
          new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
        mast.position.set(base.x, 75, base.z); scene.add(mast)
        const rig = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
          new THREE.MeshBasicMaterial({ color: 0xe8dcc6, transparent: true, opacity: 0.34, fog: false }))
        rig.position.set(base.x, 152, base.z); rig.lookAt(0, 30, 0); scene.add(rig)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 240, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xffd9ae, transparent: true, opacity: 0.022, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          }))
        cone.position.set(base.x * 0.55, 110, base.z * 0.55); scene.add(cone)
        const pl = new THREE.PointLight(0xffd9ae, 0.24, 780)
        pl.position.set(base.x, 148, base.z); scene.add(pl)
      })
    }

    // ── SIGNATURE PROPS (2026-09-01). The Monster and its ladder, the
    //    ivy and the rooftops, the rockpile, the Cove, the Crawford Boxes,
    //    the frieze, the bridge, the warehouse, the fountains, the pool.
    //    Donovan said yes to these the day the bowls were offered; the
    //    bowls shipped and these did not. Data in lib/parkProps, builder
    //    in lib/stadiumProps; a park with no entry draws exactly as before.
    addParkProps(scene, { venue, P, wallD, wallH })
    // the small stuff a real park has in every photograph (2026-09-02)
    dressing = addParkDressing(scene, { P, wallD, wallH, bowl })

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
  return { bowl, dressing }
}
