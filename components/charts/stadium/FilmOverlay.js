'use client'
// FILM OVERLAYS (BATCH-3D-V2 step 0, lifted out of SprayFieldStadium.js).
// Vignette, scanlines and grain as three plain divs -- no shaders, no
// post-processing pass, nothing in the render loop. Most of the distance
// between "a 3D chart" and "a broadcast still". pointerEvents none so the
// orbit, the raycast hover and the replay button keep their events.
export default function FilmOverlay({ radius = 12 }) {
  return (
    <>
      <style>{'@keyframes sfsGrain{0%{transform:translate(0,0)}33%{transform:translate(-3%,2%)}66%{transform:translate(2%,-3%)}100%{transform:translate(0,0)}}'}</style>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', zIndex: 2,
        background: 'radial-gradient(125% 95% at 50% 44%, rgba(0,0,0,0) 36%, rgba(0,0,0,.42) 78%, rgba(0,0,0,.72) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', zIndex: 2,
        opacity: 0.09, mixBlendMode: 'overlay',
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', zIndex: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: '-50%', opacity: 0.05, mixBlendMode: 'overlay',
          animation: 'sfsGrain 1.1s steps(3) infinite',
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
        }} />
      </div>
    </>
  )
}
