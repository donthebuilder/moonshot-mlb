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

// LABELS THAT WOULD TOUCH (2026-10-02). A camera-facing label is drawn over
// everything (depthTest off), so down a lane in perspective a near column's
// number lands on a far one's. Each frame: project every sprite tagged
// userData.declutter, nearest first, and hide any whose screen box would
// overlap one already shown (pad px apart). Cheap: a dozen labels.
const _v = new THREE.Vector3()
export function declutterLabels(scene, camera, width, height, pad = 4) {
  const list = []
  scene.traverse((o) => { if (o.isSprite && o.userData?.declutter && o.parent?.visible !== false) list.push(o) })
  if (list.length < 2) return
  const tanH = Math.tan((camera.fov * Math.PI) / 360)
  const boxes = list.map((sp) => {
    sp.getWorldPosition(_v)
    const d = _v.distanceTo(camera.position)
    const p = _v.clone().project(camera)
    const pxPerUnit = height / (2 * d * tanH)
    const w = sp.scale.x * pxPerUnit, h = sp.scale.y * pxPerUnit
    const x = (p.x * 0.5 + 0.5) * width, y = (-p.y * 0.5 + 0.5) * height
    return { sp, d, x0: x - w / 2 - pad, x1: x + w / 2 + pad, y0: y - h / 2 - pad, y1: y + h / 2 + pad, behind: p.z > 1 }
  }).sort((a, b) => a.d - b.d)
  const shown = []
  for (const b of boxes) {
    const hit = b.behind || shown.some((s) => b.x0 < s.x1 && b.x1 > s.x0 && b.y0 < s.y1 && b.y1 > s.y0)
    b.sp.visible = !hit
    if (!hit) shown.push(b)
  }
}
