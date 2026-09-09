// 🎥 THE LOOK (2026-09-02) — what turns a lit scene into a picture, shared
// by both 3D charts the way lib/stadiumWorld shares the park.
//
// Donovan: "ok let's do that" to bloom, shadows, ambient occlusion, real
// grass/dirt textures and an HDRI sky. `postprocessing` and `n8ao` are the
// two packages added for this; everything else is inside `three`.
//
//   bloom     — the arcs, the wall rail, the towers, the foul poles and the
//               ribbon are emissive; bloom is what makes emissive read as
//               LIGHT instead of a bright flat colour. High threshold so the
//               grass never blooms.
//   AO        — N8AO, desktop only. Darkens the creases: deck against wall,
//               seat against aisle, pole against grass. Subtle by design; it
//               is what makes geometry look solid.
//   SMAA      — the arcs and the rail lose their jaggies.
//   vignette  — a broadcast lens, not a diagram.
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
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect,
  ToneMappingEffect, ToneMappingMode, SMAAPreset,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches

// ── POST (2026-09-02, second cut). The first cut used three's own passes;
//    this is the pmndrs `postprocessing` stack, which is what polished
//    three.js sites run: one merged EffectPass instead of a chain of
//    full-screen passes, mipmap bloom that does not haze, SMAA on the arcs
//    and the rail, a vignette, ACES in the effect (so the renderer's own
//    tone mapping is OFF — set here), and N8AO for ambient occlusion,
//    which is a different class from SSAOPass: screen-space, denoised,
//    half-res, and it actually darkens creases instead of speckling them.
//    Returns { render, setSize, dispose }.
export function makeComposer(renderer, scene, camera, W, H, { ao = !isCoarse(), scale = 1 } = {}) {
  renderer.toneMapping = THREE.NoToneMapping
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType })
  composer.addPass(new RenderPass(scene, camera))
  let n8 = null
  if (ao) {
    n8 = new N8AOPostPass(scene, camera, W, H)
    n8.configuration.aoRadius = 9 * scale
    n8.configuration.distanceFalloff = 3 * scale
    n8.configuration.intensity = 2.2
    n8.configuration.halfRes = true
    n8.configuration.screenSpaceRadius = false
    composer.addPass(n8)
  }
  const bloom = new BloomEffect({ luminanceThreshold: 0.93, luminanceSmoothing: 0.12, intensity: 0.5, mipmapBlur: true, radius: 0.42 })
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.42 })
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH })
  composer.addPass(new EffectPass(camera, bloom, vignette, tone))
  composer.addPass(new EffectPass(camera, smaa))
  return {
    render: () => composer.render(),
    setSize: (w, h) => { composer.setSize(w, h); if (n8) n8.setSize(w, h) },
    dispose: () => { composer.dispose() },
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
  // `tile` in feet for the planar-uv surfaces (grass, dirt); the wall
  // surfaces (brick, concrete — Poly Haven CC0, 2026-09-03) keep the repeat
  // their procedural stand-in already had, so the tiling does not jump
  const swap = (kind, tex, tile) => {
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.userData && o.material.userData.surface === kind) {
        const t = tex.clone(); t.needsUpdate = true
        if (tile) t.repeat.set(1 / tile, 1 / tile)
        else if (o.material.map) t.repeat.copy(o.material.map.repeat)
        o.material.map = t
        // the photo carries its own tone; pull the tint back toward white
        if (tile) o.material.color.multiplyScalar(kind === 'grass' ? 0.62 : 1.0)
        else o.material.color.set(o.material.userData.photoTint || 0xffffff)
        o.material.needsUpdate = true
      }
    })
  }
  tryTexture('/textures/grass.jpg', (t) => swap('grass', t, grassTile))
  tryTexture('/textures/dirt.jpg', (t) => swap('dirt', t, dirtTile))
  tryTexture('/textures/brick.jpg', (t) => swap('brick', t, 0))
  tryTexture('/textures/concrete.jpg', (t) => swap('concrete', t, 0))
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

// ── OPTIONAL MODELS (2026-09-03). Real trees beat cones. Any group in the
//    scene tagged `userData.model = 'pine' | 'palm' | 'jacaranda'` is a
//    stand-in: if public/models/<name>.glb exists (Poly Haven's CC0
//    pine_tree_01, island_tree_01, jacaranda_tree, exported as glTF 1k),
//    the stand-in is hidden and the model placed at its spot, scaled to
//    the stand-in's `userData.h` in feet. A missing file changes nothing.
//    Models cannot come through this session's channels, so they are
//    Donovan's to drop in — the hook is here so nothing else has to change.
export function loadModels(scene) {
  const wanted = {}
  scene.traverse((o) => { if (o.userData && o.userData.model) (wanted[o.userData.model] ||= []).push(o) })
  const loader = new GLTFLoader()
  for (const name of Object.keys(wanted)) {
    loader.load(`/models/${name}.glb`, (gltf) => {
      const src = gltf.scene
      const box = new THREE.Box3().setFromObject(src)
      const size = new THREE.Vector3(); box.getSize(size)
      if (!size.y) return
      for (const o of wanted[name]) {
        const inst = src.clone(true)
        const k = (o.userData.h || 30) / size.y
        inst.scale.setScalar(k)
        inst.position.copy(o.position); inst.position.y -= box.min.y * k
        inst.rotation.y = o.rotation.y
        inst.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
        o.visible = false
        scene.add(inst)
      }
    }, undefined, () => {})
  }
}
