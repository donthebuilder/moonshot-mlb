// 🎥 THE LOOK (2026-09-02) — what turns a lit scene into a picture, shared
// by both 3D charts the way lib/stadiumWorld shares the park.
//
// Donovan: "ok let's do that" to bloom, shadows, ambient occlusion, real
// grass/dirt textures and an HDRI sky. Everything here is already inside
// the `three` package the site ships — no new dependency, no plugin.
//
//   bloom     — UnrealBloomPass. The arcs, the wall rail, the towers, the
//               foul poles and the ribbon are emissive; bloom is what makes
//               emissive read as LIGHT instead of a bright flat colour. Kept
//               low (0.38) with a high threshold so the grass never blooms.
//   AO        — SSAOPass, desktop only. Darkens the creases: deck against
//               wall, seat against aisle, pole against grass. Subtle by
//               design; it is what makes geometry look solid.
//   shadows   — the warm key casts a soft shadow map (desktop only). The
//               stands, the poles, the fielders and a flying ball sit ON the
//               grass instead of floating over it.
//   textures  — OPTIONAL photo grass and dirt. If public/textures/grass.jpg
//               and dirt.jpg exist they replace the procedural grain on the
//               fly; if not, nothing changes. Same for sky.hdr: when present
//               it becomes the scene environment. Nothing is fetched from
//               anywhere but this site's own /textures/.
//
// Phones get bloom and nothing else: SSAO and shadow maps cost a full extra
// render each, and the chart is most of a phone's viewport.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

export const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches

// ── POST: bloom (+ AO on desktop) → tone map. Returns { render, setSize,
//    dispose } so the component's tick and resize stay one line each.
export function makeComposer(renderer, scene, camera, W, H, { ao = !isCoarse(), scale = 1 } = {}) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  let ssao = null
  if (ao) {
    ssao = new SSAOPass(scene, camera, W, H)
    // the scene is hundreds of feet across; the defaults are tuned for a
    // model on a table. Radius in world units, distances as a fraction of
    // the depth range.
    ssao.kernelRadius = 6 * scale
    ssao.minDistance = 0.0006
    ssao.maxDistance = 0.02
    ssao.output = SSAOPass.OUTPUT.Default
    composer.addPass(ssao)
  }
  // strength · radius · threshold. The first cut (0.38 / 0.55 / 0.82) spread
  // a haze over the whole field from fourteen glowing arcs; a tight radius
  // and a high threshold keep the glow on the hot things only.
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.22, 0.9)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  return {
    render: () => composer.render(),
    setSize: (w, h) => { composer.setSize(w, h); if (ssao) ssao.setSize(w, h); bloom.setSize(w, h) },
    dispose: () => { composer.dispose(); if (ssao) ssao.dispose(); bloom.dispose() },
  }
}

// ── SHADOWS. The key light in stadiumWorld is tagged `userData.key`; give
//    it a shadow camera that covers the park and let the solid things cast
//    and receive. Additive/transparent things (halos, arcs, water, the
//    dome) are skipped — they are light, not objects.
export function enableShadows(renderer, scene, maxD) {
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.userData.key) {
      o.castShadow = true
      const c = o.shadow.camera
      c.left = -maxD * 1.6; c.right = maxD * 1.6
      c.top = maxD * 1.6; c.bottom = -maxD * 1.6
      c.near = 10; c.far = maxD * 6
      o.shadow.mapSize.set(2048, 2048)
      o.shadow.bias = -0.0008
      o.shadow.normalBias = 0.6
    }
    if (o.isMesh && !o.userData.noShadow) {
      const m = o.material
      const solid = m && !m.transparent && m.blending === THREE.NormalBlending && !m.isSpriteMaterial
      if (solid) { o.castShadow = true; o.receiveShadow = true }
    }
  })
}

// ── OPTIONAL PHOTO SURFACES. Tries the site's own /textures/; on a 404 the
//    procedural grain stays and nothing is logged as an error.
const tryTexture = (url, onLoad) => {
  const loader = new THREE.TextureLoader()
  loader.load(url, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    tex.colorSpace = THREE.SRGBColorSpace
    onLoad(tex)
  }, undefined, () => {})
}
export function loadPhotoSurfaces(scene, { grassTile = 38, dirtTile = 30 } = {}) {
  const swap = (kind, tex, tile) => {
    tex.repeat.set(1 / tile, 1 / tile)
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.userData && o.material.userData.surface === kind) {
        o.material.map = tex
        // the photo carries its own tone; pull the tint back toward white
        o.material.color.multiplyScalar(0.62)
        o.material.needsUpdate = true
      }
    })
  }
  tryTexture('/textures/grass.jpg', (t) => swap('grass', t, grassTile))
  tryTexture('/textures/dirt.jpg', (t) => swap('dirt', t, dirtTile))
}

// ── OPTIONAL SKY. A dusk HDRI at /textures/sky.hdr becomes the environment
//    (reflections on the rail and the pads) — the dome stays the backdrop,
//    so a missing file changes nothing.
export function loadSky(renderer, scene) {
  try {
    new RGBELoader().load('/textures/sky.hdr', (hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer)
      const env = pmrem.fromEquirectangular(hdr).texture
      scene.environment = env
      hdr.dispose(); pmrem.dispose()
    }, undefined, () => {})
  } catch { /* no HDR support: keep the dome */ }
}
