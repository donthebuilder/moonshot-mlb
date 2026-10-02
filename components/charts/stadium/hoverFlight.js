// THE HOVER FLIGHT (BATCH-3D-V2 step 0, lifted out of SprayFieldStadium.js).
// Hover (or tap) one mark and it plays its own path, the way MOONSHOT's hit
// flies. A separate mesh / state pair from any ▶ replay, so hovering during or
// after a replay never fights over the same object. It holds at the end of the
// path until the pointer leaves -- a still cursor shows a still result.
//
//   const hf = createHoverFlight(scene)
//   hf.start(key, { pts, dur, mesh, onStep })   // no-op when `key` is already playing
//   hf.step(now)                                // from the render loop
//   hf.clear()                                  // pointer left / another mark
// `pts` is the path as THREE.Vector3s, `dur` in ms; `onStep(mesh, p)` runs after
// each move (MOONSHOT places the ball's shadow there; LAMP twitches the net).
// clear() removes the mesh and, if one rides on mesh.userData.shadow, its shadow.
export function createHoverFlight(scene) {
  let cur = null
  const clear = () => {
    if (!cur) return
    scene.remove(cur.mesh)
    cur.mesh.material.dispose()
    const sh = cur.mesh.userData.shadow
    if (sh) { scene.remove(sh); sh.material.dispose() }
    cur = null
  }
  const start = (key, { pts, dur, mesh, onStep = null }) => {
    if (cur && cur.key === key) return
    clear()
    if (!pts || !pts.length) return
    mesh.position.copy(pts[0])
    scene.add(mesh)
    cur = { key, pts, dur, mesh, onStep, t0: performance.now() }
  }
  const step = (now) => {
    if (!cur) return
    const p = (now - cur.t0) / cur.dur
    const idx = Math.min(cur.pts.length - 1, Math.max(0, Math.floor(p * cur.pts.length)))
    cur.mesh.position.copy(cur.pts[idx])
    if (cur.onStep) cur.onStep(cur.mesh, Math.min(1, Math.max(0, p)))
  }
  return { start, step, clear, playing: () => (cur ? cur.key : null) }
}
