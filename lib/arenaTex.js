// TEXTURES FOR ANY BUILDING (2026-10-01, BATCH-ARENA-SPLIT): the canvas
// textures the bowl and the light rig draw with -- moved VERBATIM out of
// lib/stadiumWorld.js so lib/arena.js (sport-neutral) and stadiumWorld
// (baseball) share them without a circular import. Nothing changed but the file.
import * as THREE from 'three'

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

// ── SURFACES (2026-09-02 design pass). Flat Lambert colour is the loudest
//    "rendered" tell there is: real grass has grain, real dirt has drag
//    marks. Both are procedural canvases — no asset to load, no network —
//    tiled at about 40 ft, tinted around the midpoint greens and browns the
//    earlier passes settled on. The lighting is unchanged.
export function grainTex(base, spread, size = 256, streaks = false) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const b = new THREE.Color(base)
  g.fillStyle = '#' + b.getHexString()
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * spread
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.7))
  }
  g.putImageData(img, 0, 0)
  if (streaks) {
    // drag-mat lines: faint, parallel, slightly wavy
    g.strokeStyle = 'rgba(0,0,0,.045)'
    g.lineWidth = 1
    for (let y = 0; y < size; y += 7) {
      g.beginPath()
      for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin((x + y) * 0.05) * 1.2)
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

// ── PRECISE + ARTISTIC (batch pass v3, 2026-09-03). Donovan: "yes, be
//    precise and artistic." Three textures every park shares, drawn once:
//    a lamp GRID for every light bank (a bank is 60 lamps, not a plate —
//    bloom then picks out the cells), BRICK for the parks whose fascias are
//    brick (Comerica), and a segmented LED RIBBON.
export function lampTex(cols = 12, rows = 4) {
  const cv = document.createElement('canvas')
  cv.width = cols * 12; cv.height = rows * 12
  const g = cv.getContext('2d')
  g.fillStyle = '#0a0c10'; g.fillRect(0, 0, cv.width, cv.height)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const rg = g.createRadialGradient(c * 12 + 6, r * 12 + 6, 0.5, c * 12 + 6, r * 12 + 6, 5.5)
    rg.addColorStop(0, 'rgba(255,250,235,1)'); rg.addColorStop(0.55, 'rgba(255,236,200,.9)'); rg.addColorStop(1, 'rgba(255,220,170,0)')
    g.fillStyle = rg; g.fillRect(c * 12, r * 12, 12, 12)
  }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t
}

export function brickTex(base = 0x6e3a2c, size = 256) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')
  const b = new THREE.Color(base)
  g.fillStyle = '#' + b.clone().multiplyScalar(0.55).getHexString(); g.fillRect(0, 0, size, size)   // mortar
  const bw = 32, bh = 12
  for (let y = 0; y < size; y += bh) {
    const shift = (y / bh) % 2 ? bw / 2 : 0
    for (let x = -bw; x < size; x += bw) {
      const k = 0.85 + Math.random() * 0.35
      g.fillStyle = '#' + b.clone().multiplyScalar(k).getHexString()
      g.fillRect(x + shift + 1, y + 1, bw - 2, bh - 2)
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t
}

export function ribbonTex() {
  const cv = document.createElement('canvas')
  cv.width = 256; cv.height = 16
  const g = cv.getContext('2d')
  g.fillStyle = '#100c06'; g.fillRect(0, 0, 256, 16)
  for (let x = 0; x < 256; x += 4) for (let y = 2; y < 14; y += 4) {
    const on = Math.random() < 0.7
    g.fillStyle = on ? `rgba(255,${150 + Math.random() * 60},40,${0.5 + Math.random() * 0.5})` : 'rgba(60,40,10,.6)'
    g.fillRect(x + 1, y, 2, 2)
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t
}

// SEAT ROWS (2026-09-02). A deck is a ramp until it has rows. One tile:
// a lit tread and a shadowed riser, repeated up the deck every ~2.7 ft, and
// a faint seat-back rhythm along the row. Multiplies the deck's own vertex
// colour, so the aisle steps and the ring tints stay.
export function rowsTex() {
  const cv = document.createElement('canvas')
  cv.width = 64; cv.height = 32
  const g = cv.getContext('2d')
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 32)          // tread
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, 64, 9)            // riser (shadow)
  g.fillStyle = '#b4b4b4'; g.fillRect(0, 9, 64, 3)            // the lit lip
  for (let x = 0; x < 64; x += 8) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 14, 1, 14) }  // seat backs
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  return tex
}
