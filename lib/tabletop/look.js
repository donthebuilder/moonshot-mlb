// 🎥 THE TABLETOP LOOK (2026-10-23). What makes a board on a table read as a real toy shot on a long lens (NFL Films'
// "very long lenses", toy photography's shallow focus): depth of field focused on the play (the background melts), a
// soft bloom on the lamps, a vignette, ACES, SMAA; and shadows, so the figures stand ON the tin. Phones (coarse pointer)
// skip the shadow map and draw the focus blur at a lower resolution. Returns { render, setSize, dispose, focus }:
// move `focus` (a Vector3) to what the shot is about.
import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, DepthOfFieldEffect,
} from 'postprocessing'
import { isCoarse } from '../stadiumLook'

export function makeTabletopLook(renderer, scene, camera, W, H) {
  const phone = isCoarse()
  renderer.toneMapping = THREE.NoToneMapping
  if (!phone) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap }
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType })
  composer.addPass(new RenderPass(scene, camera))
  const focus = new THREE.Vector3()
  const dof = new DepthOfFieldEffect(camera, { worldFocusRange: 70, bokehScale: phone ? 2.2 : 3.4, resolutionScale: phone ? 0.4 : 0.6 })
  dof.target = focus
  const bloom = new BloomEffect({ luminanceThreshold: 0.88, luminanceSmoothing: 0.15, intensity: 0.7, mipmapBlur: true, radius: 0.5 })
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.55 })
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
  composer.addPass(new EffectPass(camera, dof, bloom, vignette, tone))
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })))
  return {
    focus,
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => composer.dispose(),
  }
}
