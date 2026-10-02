// THE ARENA (2026-10-01, BATCH-ARENA-SPLIT). Everything a building has that is
// not the playing surface: the light rig and the dusk dome (or a roof), the
// world outside, and the bowl of decks, crowd and fascia. lib/stadiumWorld.js
// buildPark() used to be all of it in one function; the ballpark now calls
// these, and LAMP's rink / TUDDY's field use buildArena() with a 'rect'
// footprint. The 'fan' path is the ballpark's code MOVED VERBATIM (comments
// and all) -- scripts/check-3d-parity.mjs proves MLB renders the same.
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import { bowlFor, isOpenSector } from './parkBowls'
import { radialTex, grainTex, lampTex, brickTex, ribbonTex, rowsTex } from './arenaTex'

const DEG = Math.PI / 180   // as in lib/stadiumWorld.js

/** The light rig, the dusk dome and the world outside. Returns the two lights. */
export function arenaRig(scene, { venue, maxD }) {
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
  key.userData.key = true   // the one light that casts the shadow map (lib/stadiumLook)
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
    // ── A REAL SKY (2026-09-02). The painted dome is replaced by three's
    //    own atmosphere (examples/jsm/objects/Sky): Rayleigh + Mie
    //    scattering with a sun just under the horizon, so the sky grades
    //    from ember at the skyline to deep blue overhead the way dusk
    //    actually does, and it turns with the camera. The old gradient's
    //    canvas is kept as the horizon band below (`hz`), where the
    //    scattering model runs out. Stars and the moon stay on top.
    const sky = new Sky()
    sky.scale.setScalar(3800)
    {
      const u = sky.material.uniforms
      // per-park dusk (v3): Petco's purple, Chase's desert ember, Detroit's
      // clear blue — `sky` on the bowl overrides the defaults
      const sk = (bowlFor(venue).sky) || {}
      u.turbidity.value = sk.turbidity ?? 5
      u.rayleigh.value = sk.rayleigh ?? 1.3
      u.mieCoefficient.value = sk.mie ?? 0.004
      u.mieDirectionalG.value = 0.8
      // sun 2.6° below the horizon, off the first-base side — opposite the
      // moon, so the warm and the cool halves of the sky are on different sides
      const el = THREE.MathUtils.degToRad(sk.el ?? -3.4), az = THREE.MathUtils.degToRad(sk.az ?? 115)
      u.sunPosition.value.setFromSphericalCoords(1, Math.PI / 2 - el, az)
    }
    sky.userData.noShadow = true
    scene.add(sky)
    void cv

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
    halo.position.set(-1400, 820, 1700); halo.lookAt(0, 200, 0); halo.userData.noShadow = true; scene.add(halo)
    const moon = new THREE.Mesh(new THREE.CircleGeometry(46, 36),
      new THREE.MeshBasicMaterial({ color: 0xfff3dd, fog: false }))
    moon.position.set(-1400, 820, 1700); moon.lookAt(0, 200, 0); moon.userData.noShadow = true; scene.add(moon)

    // horizon glow so the skyline edge is lit rather than a hard cut
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(5200, 460),
      new THREE.MeshBasicMaterial({
        map: radialTex([[0, 'rgba(255,150,70,.20)'], [0.55, 'rgba(180,80,40,.07)'], [1, 'rgba(0,0,0,0)']]),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
    hz.position.set(0, 110, 2100); hz.userData.noShadow = true; scene.add(hz)
  }

  // ── the world outside the park, so the field isn't floating in space
  {
    const apron = new THREE.Mesh(
      new THREE.CircleGeometry(maxD * 3, 48),
      new THREE.MeshLambertMaterial({ color: 0x14171c }),
    )
    apron.rotation.x = -Math.PI / 2
    apron.position.y = -0.6
    apron.userData.noShadow = true; scene.add(apron)
  }
  return { key, fill }
}

/**
 * The ballpark's bowl ('fan' footprint): decks hugging the foul lines and the
 * wall, cut against the park's open sectors, crowd, fascia, light towers.
 * Returns innerR (the bowl's inner edge at any angle) for the props after it.
 */
export function arenaBowlFan(scene, { steps, bowl, venue, P, wallD, wallH, maxD }) {
    const clamp = (a) => Math.max(-45, Math.min(45, a))
    // ── THE WHOLE BOWL (batch pass, 2026-09-03). Until now the stands were
    //    a ring at the outfield wall's radius from -72° to 72°, which left
    //    the park with no stands behind the plate or down the lines — from
    //    the broadcast seat that read as "outfield seats and a void", and
    //    orbiting showed it. A real bowl hugs the FOUL LINES: past each pole
    //    the inner edge runs parallel to the line about 58 ft outside it and
    //    curves round behind the plate at ~80 ft. innerR() is that edge at
    //    any angle, all the way round; every deck, band and canopy rides it.
    const LAMPS = lampTex(12, 4), LAMPS_S = lampTex(6, 2)
    const GUTTER = 58
    const innerR = (a) => {
      const aa = Math.abs(a)
      if (aa <= 45) return wallD(a)
      const line = GUTTER / Math.max(1e-3, Math.sin((aa - 45) * DEG))
      return Math.min(wallD(a < 0 ? -45 : 45), line)
    }
    const edge = (a, off) => P(innerR(a) + off, a)
    const rows = rowsTex()
    const deck = (a0, a1, off, depth, y0, y1, cLo, cHi, crowd) => {
      const pos = [], col = [], pts = [], uv = []
      // the rows map averages ~0.6 grey, so the ring tints are lifted to
      // land where the flat colours did
      const A = new THREE.Color(cLo).multiplyScalar(2.3), B = new THREE.Color(cHi).multiplyScalar(2.3)
      // rows every 2.7 ft up the deck; seat backs every ~2 ft along it
      const rv = depth / 2.7
      for (let a = a0; a < a1; a += 2.5) {
        const b = Math.min(a1, a + 2.5)
        if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
        const i0 = edge(a, off), i1 = edge(b, off)
        const o0 = edge(a, off + depth), o1 = edge(b, off + depth)
        pos.push(
          i0.x, y0, i0.z, i1.x, y0, i1.z, o1.x, y1, o1.z,
          i0.x, y0, i0.z, o1.x, y1, o1.z, o0.x, y1, o0.z,
        )
        const ru = i0.distanceTo(i1) / 2
        uv.push(0, 0, ru, 0, ru, rv, 0, 0, ru, rv, 0, rv)
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
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({
        vertexColors: true, side: THREE.DoubleSide, map: rows, color: 0xffffff,
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
      gr.userData.noShadow = true; scene.add(gr)

      // warm air sitting over the outfield — depth, for almost nothing
      const hz2 = new THREE.Mesh(new THREE.CircleGeometry(maxD + 200, 48),
        new THREE.MeshBasicMaterial({
          map: radialTex([[0, 'rgba(255,200,150,0)'], [0.62, 'rgba(255,190,140,.07)'], [1, 'rgba(255,180,130,0)']]),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }))
      hz2.rotation.x = -Math.PI / 2; hz2.position.y = 11
      hz2.userData.noShadow = true; scene.add(hz2)
    }

    // THE STANDS HAVE TO BE THERE. Donovan: "the field out need to be
    // visually present... more visual representations of the stadiums."
    // These decks were 0x10–0x19 — within a couple of steps of the sky, so
    // the whole building read as absent and the wedge looked like a paper
    // triangle floating in black. Roughly doubled across all four rings.
    // They are still the quietest thing on screen; they are no longer
    // invisible, and a ballpark you cannot see is not a ballpark.
    // PER-PARK UPPER DECKS AND COLOURS (batch pass, 2026-09-03). `up` may
    // now be ONE span or a LIST of spans — Comerica has an upper deck down
    // both lines and none over the outfield, which one pair cannot say.
    // `seat` tints every deck (Petco's navy, Comerica's and Chase's green);
    // `fascia` colours the deck faces (Comerica's brick). Both optional.
    // `up` describes the OUTFIELD side (|a| ≤ 72). Behind the plate and down
    // the lines every park with an upper deck has one, so those spans are
    // added for any park whose `up` is not null.
    const upsOut = !bowl.up ? [] : Array.isArray(bowl.up[0]) ? bowl.up : [bowl.up]
    const ups = bowl.up ? [...upsOut, [-180, -72], [72, 180]] : []
    const tint = (hex) => bowl.seat ? new THREE.Color(hex).lerp(new THREE.Color(bowl.seat), 0.55).getHex() : hex
    // the lower deck, all the way round; `lower` sectors (per park) can be
    // shallower — outfield bleachers under a board are 20 rows, not 35
    {
      const cuts = (bowl.lower || []).slice().sort((x, y) => x[0] - y[0])
      let a = -180
      for (const [f, t, depth, y1] of cuts) {
        if (f > a) deck(a, f, 16, 92, 6, 46, tint(0x2a323f), tint(0x3a4453), true)
        deck(f, t, 16, depth, 6, y1, tint(0x2a323f), tint(0x3a4453), true)
        a = t
      }
      if (a < 180) deck(a, 180, 16, 92, 6, 46, tint(0x2a323f), tint(0x3a4453), true)
    }
    if (bowl.bleach) deck(bowl.bleach[0], bowl.bleach[1], 14, 58, 4, 26, tint(0x252d38), tint(0x353e4c), true)
    // `upper` (v3): per-sector overrides for the second deck —
    // [[from, to, off, depth, y0, y1]] — Comerica's first-base side sits 15
    // ft lower than its third-base side; Petco's left terrace is shallow
    {
      const ov = (bowl.upper || [])
      const inOv = (a) => ov.find(([f, t]) => a >= f && a < t)
      for (const u of ups) {
        // split the span at override boundaries
        const cuts = [u[0], u[1], ...ov.flatMap(([f, t]) => [f, t]).filter((x) => x > u[0] && x < u[1])].sort((x, y) => x - y)
        for (let i = 0; i < cuts.length - 1; i++) {
          const a0 = cuts[i], a1 = cuts[i + 1]
          const o = inOv((a0 + a1) / 2)
          if (o) deck(a0, a1, o[2], o[3], o[4], o[5], tint(0x2d3441), tint(0x323a48), true)
          else deck(a0, a1, 116, 96, 62, 112, tint(0x2d3441), tint(0x323a48), true)
        }
      }
    }
    if (bowl.tiers > 2) {
      // `third` (batch pass): where the third deck actually is, when it is
      // not everywhere the second one is (Petco's 300 level runs from right
      // field round behind the plate; left has two levels)
      const thirds = bowl.third || (ups.length ? ups : [[-46, 46]])
      for (const u of thirds) deck(u[0], u[1], 220, 84, 128, 172, tint(0x1d232c), tint(0x212832), true)
    }

    // FAÇADES AND THE RIBBON (design pass, 2026-09-02). A deck is a ramp of
    // seats; a grandstand has a FACE — the fascia along the front of each
    // deck, and on the upper deck the LED ribbon that every park has run
    // since the 2000s. Both cut against the open sectors like the decks.
    // The ribbon is dim amber, not a colour: nothing in the payload says
    // whose park this is, and a guessed team colour would be a claim.
    const band = (a0, a1, off, y0, y1, mat) => {
      const pos = []
      for (let a = a0; a < a1; a += 2.5) {
        const b = Math.min(a1, a + 2.5)
        if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
        const p0 = edge(a, off), p1 = edge(b, off)
        pos.push(p0.x, y0, p0.z, p1.x, y0, p1.z, p0.x, y1, p0.z, p1.x, y0, p1.z, p1.x, y1, p1.z, p0.x, y1, p0.z)
      }
      if (!pos.length) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      scene.add(new THREE.Mesh(g, mat))
    }
    // lower deck fascia: the wall's own blue-green, a step darker, from the
    // wall top to the first row
    // the fascia material: brick where the park is brick, grained concrete
    // or sandstone elsewhere
    const fasciaMat = (() => {
      // tagged so lib/stadiumLook can swap in the photo (public/textures/
      // brick.jpg, concrete.jpg) when it exists
      if (bowl.material === 'brick') {
        const t = brickTex(bowl.fascia || 0x6e3a2c); t.repeat.set(6, 1)
        const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })
        m.userData.surface = 'brick'; m.userData.photoTint = 0xb0a09a
        return m
      }
      const t = grainTex(0x8c8c8c, 14); t.repeat.set(4, 1)
      const m = new THREE.MeshLambertMaterial({ map: t, color: bowl.fascia || 0x1c3a48, side: THREE.DoubleSide })
      m.userData.surface = 'concrete'; m.userData.photoTint = bowl.fascia || 0x8a9098
      return m
    })()
    band(-180, 180, 15.6, 0, 6, fasciaMat)
    band(-180, 180, 15.6, 5.4, 6, new THREE.MeshBasicMaterial({ color: 0x8a5a2a, side: THREE.DoubleSide }))
    band(-180, 180, 15.4, 6, 6.35, new THREE.MeshBasicMaterial({ color: 0xc9ccd2, side: THREE.DoubleSide }))
    // THE SUITE LEVEL. Between the lower deck's last row and the upper
    // deck's first sits the band of suites and the press box — glass, lit
    // from inside. It is the brightest horizontal line in every night photo
    // of every park, and it was a flat dark face here.
    const suiteTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32
      const g = cv.getContext('2d')
      g.fillStyle = '#' + new THREE.Color(bowl.fascia || 0x1f2630).getHexString(); g.fillRect(0, 0, 256, 32)
      for (let x = 4; x < 256; x += 16) {
        const lit = Math.random() < 0.8
        g.fillStyle = lit ? `rgba(255,214,150,${0.28 + Math.random() * 0.3})` : 'rgba(20,30,40,.8)'
        g.fillRect(x, 8, 11, 16)
      }
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); return t
    })()
    for (const u of ups) {
      band(u[0], u[1], 115.5, 46, 50, fasciaMat)
      band(u[0], u[1], 115.3, 61.8, 62.2, new THREE.MeshBasicMaterial({ color: 0xc9ccd2, side: THREE.DoubleSide }))
      {
        // the glass: one quad per 2.5° with its own uv so the windows tile
        const pos = [], uv = []
        for (let a = u[0]; a < u[1]; a += 2.5) {
          const b = Math.min(u[1], a + 2.5)
          if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
          const p0 = edge(a, 115.4), p1 = edge(b, 115.4)
          pos.push(p0.x, 50, p0.z, p1.x, 50, p1.z, p0.x, 58, p0.z, p1.x, 50, p1.z, p1.x, 58, p1.z, p0.x, 58, p0.z)
          const w = p0.distanceTo(p1) / 16
          uv.push(0, 0, w, 0, 0, 1, w, 0, w, 1, 0, 1)
        }
        if (pos.length) {
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
          g.computeVertexNormals()
          scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: suiteTex, color: 0x8a8a8a, side: THREE.DoubleSide })))
        }
      }
      band(u[0], u[1], 115.4, 58.5, 60.5, new THREE.MeshBasicMaterial({
        map: ribbonTex(), color: 0xb08040, side: THREE.DoubleSide,
      }))
    }

    // A shut roof is opaque AND hides everything outside it, so a camera that
    // drifts above the ceiling sees a black nothing. OrbitControls already
    // owns the limits — tighten them rather than fighting it in the tick.
    // Light towers, but only where there is a night to light. Two, not
    // four, and the beam sits at 0.022 — air, not a glowing slab. An
    // earlier pass had these bright enough that Donovan called them out.
    {
      ;(bowl.towers ? [] : [-52, 52]).forEach((a) => {
        const base = edge(a, 196)
        const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 150, 2.4),
          new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
        mast.position.set(base.x, 75, base.z); scene.add(mast)
        const rig = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
          new THREE.MeshBasicMaterial({ map: LAMPS, transparent: true, opacity: 0.9, fog: false }))
        rig.position.set(base.x, 152, base.z); rig.lookAt(0, 30, 0); scene.add(rig)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 240, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xffd9ae, transparent: true, opacity: 0.009, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
          }))
        cone.position.set(base.x * 0.55, 110, base.z * 0.55); scene.add(cone)
        const pl = new THREE.PointLight(0xffd9ae, 0.24, 780)
        pl.position.set(base.x, 148, base.z); scene.add(pl)
        // the flare a bank of stadium lights throws at a lens — three's own
        // Lensflare, textures drawn here rather than loaded
        const flare = new Lensflare()
        const glow = radialTex([[0, 'rgba(255,240,215,1)'], [0.18, 'rgba(255,225,190,.55)'], [0.5, 'rgba(255,200,150,.12)'], [1, 'rgba(0,0,0,0)']])
        const ring = radialTex([[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(255,220,180,0)'], [0.8, 'rgba(255,220,180,.35)'], [0.88, 'rgba(255,220,180,0)'], [1, 'rgba(0,0,0,0)']])
        flare.addElement(new LensflareElement(glow, 140, 0, new THREE.Color(0xffe6c4)))
        flare.addElement(new LensflareElement(ring, 60, 0.35))
        flare.addElement(new LensflareElement(glow, 28, 0.6, new THREE.Color(0xffd0a0)))
        pl.add(flare)
      })
    }

    // ── SIGNATURE PROPS (2026-09-01). The Monster and its ladder, the
    //    ivy and the rooftops, the rockpile, the Cove, the Crawford Boxes,
    //    the frieze, the bridge, the warehouse, the fountains, the pool.
    //    Donovan said yes to these the day the bowls were offered; the
    //    bowls shipped and these did not. Data in lib/parkProps, builder
    //    in lib/stadiumProps; a park with no entry draws exactly as before.
    // ══ THE DETAIL PASS (2026-09-02). Donovan: "go crazy, make the parks
    //    more detailed now that you have upgrades." Everything in this block
    //    is generic — it is what EVERY park has, which is exactly what a bowl
    //    of seats and a wall were missing. The per-park signatures live in
    //    lib/parkProps (now three times as many) and come in just below.
    {
      const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra })
      // a flat annular wedge between two offsets beyond the wall, cut against
      // the open sectors like the decks are
      const slab = (a0, a1, off0, off1, y, mat) => {
        const pos = []
        for (let a = a0; a < a1; a += 2.5) {
          const b = Math.min(a1, a + 2.5)
          if (isOpenSector(bowl, a) || isOpenSector(bowl, b)) continue
          const i0 = edge(a, off0), i1 = edge(b, off0)
          const o0 = edge(a, off1), o1 = edge(b, off1)
          pos.push(i0.x, y, i0.z, i1.x, y, i1.z, o1.x, y, o1.z, i0.x, y, i0.z, o1.x, y, o1.z, o0.x, y, o0.z)
        }
        if (!pos.length) return
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        scene.add(new THREE.Mesh(g, mat))
      }

      // ── THE CANOPY. The upper deck's roof: a slab over its back half,
      //    posts along the back edge, a lip on the front, and the ring of
      //    lamp banks along that lip that lights every night game. This is
      //    the single thing that makes a bowl read as a BUILDING.
      for (const u of ups) {
        slab(u[0], u[1], 150, 216, 124, lam(0x232a35))
        band(u[0], u[1], 150, 120.5, 124, lam(0x2c3440))
        band(u[0], u[1], 216, 112, 124, lam(0x1f2530))
        for (let a = u[0]; a <= u[1]; a += 7.5) {
          if (isOpenSector(bowl, a)) continue
          const v = edge(a, 208)
          const post = new THREE.Mesh(new THREE.BoxGeometry(2.2, 12, 2.2), lam(0x2a313c))
          post.position.set(v.x, 118, v.z); scene.add(post)
          // the lamp bank on the lip: a bright plate angled at the field
          const v2 = edge(a, 152)
          const bank = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.2),
            new THREE.MeshBasicMaterial({ map: LAMPS_S, transparent: true, opacity: 0.85, fog: false, side: THREE.DoubleSide }))
          bank.position.set(v2.x, 126, v2.z); bank.lookAt(0, 20, 0); bank.userData.noShadow = true; scene.add(bank)
          const rack = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 1.4), lam(0x14181e))
          rack.position.set(v2.x, 126, v2.z); rack.lookAt(0, 20, 0); rack.translateZ(-0.9); scene.add(rack)
        }
        // concourse lights under the canopy — the warm row that makes the
        // back of a deck glow at night
        for (let a = u[0] + 2; a < u[1]; a += 5) {
          if (isOpenSector(bowl, a)) continue
          const v = edge(a, 196)
          const lt = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 1.2), new THREE.MeshBasicMaterial({ color: 0xffe9c8, fog: false }))
          lt.position.set(v.x, 122.6, v.z); lt.lookAt(0, 122.6, 0); lt.userData.noShadow = true; scene.add(lt)
        }
        // pennants along the lip, one every 15°, the flag's own colours
        for (let a = u[0] + 3.75; a < u[1]; a += 15) {
          if (isOpenSector(bowl, a)) continue
          const v = edge(a, 151)
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 5), lam(0xd0d4da))
          pole.position.set(v.x, 131, v.z); scene.add(pole)
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), lam(a % 30 < 15 ? 0xe6e8ec : 0xb3202f))
          flag.position.set(v.x, 136, v.z); flag.lookAt(0, 136, 0); flag.translateX(3.2); scene.add(flag)
        }
      }

      // ── TOWERS ON THE ROOF (batch pass). Where a park's `towers` lists
      //    angles, its light banks stand on the canopy at those angles the
      //    way Comerica's lattice masts do — and the generic four are not
      //    drawn.
      // (never behind the plate: the broadcast seat is 320 ft back at 250
      // up, and a light rig at 170° sits in its face)
      if (bowl.towers) for (const a of bowl.towers.filter((x) => Math.abs(x) <= 140)) {
        const v = edge(a, 170)
        const mast = new THREE.Mesh(new THREE.BoxGeometry(3, 64, 3), new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
        mast.position.set(v.x, 124 + 32, v.z); scene.add(mast)
        for (const dy of [-6, 0]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 9), new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
          brace.position.set(v.x, 172 + dy, v.z); brace.lookAt(0, 172, 0); scene.add(brace)
        }
        const rig = new THREE.Mesh(new THREE.PlaneGeometry(30, 9),
          new THREE.MeshBasicMaterial({ map: LAMPS, transparent: true, opacity: 0.9, fog: false, side: THREE.DoubleSide }))
        rig.position.set(v.x, 190, v.z); rig.lookAt(0, 30, 0); rig.userData.noShadow = true; scene.add(rig)
        const pl = new THREE.PointLight(0xffd9ae, 0.16, 720)
        pl.position.set(v.x, 186, v.z); scene.add(pl)
      }
      // ── FOUR TOWERS, NOT TWO. The pair by the lines stays; two more go
      //    up behind the outfield stands, where a real ring of light comes
      //    from. No flare on these — the camera looks straight at them.
      if (!bowl.towers) for (const a of [-21, 21]) {
        if (isOpenSector(bowl, a)) continue
        const base = edge(a, 232)
        const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 158, 2.4), new THREE.MeshBasicMaterial({ color: 0x0a0c10 }))
        mast.position.set(base.x, 79, base.z); scene.add(mast)
        const rig = new THREE.Mesh(new THREE.PlaneGeometry(34, 10),
          new THREE.MeshBasicMaterial({ map: LAMPS, transparent: true, opacity: 0.9, fog: false, side: THREE.DoubleSide }))
        rig.position.set(base.x, 160, base.z); rig.lookAt(0, 30, 0); rig.userData.noShadow = true; scene.add(rig)
        const pl = new THREE.PointLight(0xffd9ae, 0.18, 720)
        pl.position.set(base.x, 156, base.z); scene.add(pl)
      }
      // ── THE TARP. Rolled up along the first-base line, where it lives
      //    between rain delays. Blue, with a paler core showing at the end.
      {
        const v = P(190, 47.5)
        const along = P(1, 45).normalize()
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 58, 14), lam(0x24405f))
        roll.rotation.z = Math.PI / 2; roll.rotation.y = -Math.atan2(along.x, along.z) + Math.PI / 2
        roll.position.set(v.x, 3.2, v.z); scene.add(roll)
      }

      // ── CAMERA WELLS. The two low boxes of photographers beside the
      //    dugouts, in the walls at the lines — the dugouts themselves stay
      //    gone (Donovan), these are on the apron, not the grass.
      for (const s of [-1, 1]) {
        const v = P(140, s * 52)
        const well = new THREE.Mesh(new THREE.BoxGeometry(12, 3.5, 8), lam(0x1c2430))
        well.position.set(v.x, 1.75, v.z); well.lookAt(0, 1.75, 0); scene.add(well)
      }

    }
  return { innerR }
}
