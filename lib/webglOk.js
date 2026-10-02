// One WebGL probe for every 3D view (2026-10-01). The 3D views REPLACE the 2D
// only when this says WebGL can actually draw; otherwise the 2D stays.
export function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}
