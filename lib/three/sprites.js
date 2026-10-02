// TEXT AS SPRITES (BATCH-3D-V2 step 0). three.js has no text; a small canvas
// does. These were three private copies (lib/stadiumWorld.js numberSprite,
// SprayFieldStadium.js labelSprite, lib/stadiumProps.js textSprite) -- moved
// here unchanged so the rink and the field print numbers the way the ballpark
// prints its wall: the same canvas, the same font, the same scale.
import * as THREE from 'three'
import { WALL_INK } from '../theme'

/** A two- or three-digit number (a wall distance), crisp when the camera zooms. */
export function numberSprite(text) {
  const cv = document.createElement('canvas')
  // 4× the old canvas so the numbers stay crisp when the camera zooms to
  // the wall (the sprite's world size is unchanged)
  cv.width = 512; cv.height = 256
  const g = cv.getContext('2d')
  g.font = '900 176px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = WALL_INK
  g.globalAlpha = 0.92
  g.fillText(text, 256, 136)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const s = new THREE.Sprite(m)
  s.scale.set(26, 13, 1)
  return s
}

/** A short phrase in one colour, its canvas sized to the text (WIND HELPS). */
export function labelSprite(text, hex) {
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

/** A phrase at a width in world units, optionally glowing (the ballpark props). */
export function textSprite(text, hex, w, h, glow) {
  const cv = document.createElement('canvas')
  const g0 = cv.getContext('2d')
  g0.font = '900 48px SF Mono, Menlo, monospace'
  const tw = Math.ceil(g0.measureText(text).width) + 40
  cv.width = Math.max(tw, 160); cv.height = 72
  const g = cv.getContext('2d')
  g.font = '900 48px SF Mono, Menlo, monospace'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  const col = '#' + new THREE.Color(hex).getHexString()
  if (glow) { g.shadowColor = col; g.shadowBlur = 18 }
  g.fillStyle = col
  g.globalAlpha = 0.95
  g.fillText(text, cv.width / 2, 38)
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  // keep the text's own aspect; `w` is the width in feet, `h` a ceiling
  const asp = cv.width / cv.height
  const sw = w, sh = Math.min(h, w / asp)
  s.scale.set(sw, sh, 1)
  return s
}
