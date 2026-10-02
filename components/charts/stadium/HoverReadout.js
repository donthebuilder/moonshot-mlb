'use client'
// THE HOVER READOUT (BATCH-3D-V2 step 0, lifted out of SprayFieldStadium.js).
// The tip div the raycaster drives directly (display / left / top / innerHTML
// set off the render loop, no React state per mouse move), plus placeTip(), the
// positioning every scene shares. Moved unchanged.
import { forwardRef } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../../lib/theme'

const HoverReadout = forwardRef(function HoverReadout({ theme: C = MLB_C, numFont = MLB_NUM, maxWidth = 180 }, ref) {
  return (
    <div ref={ref} style={{
      display: 'none', position: 'absolute', zIndex: 5, pointerEvents: 'none',
      maxWidth, padding: '6px 9px', borderRadius: 8,
      background: 'rgba(9,9,11,.92)', border: `1px solid ${C.border2}`,
      fontSize: 10, lineHeight: 1.5, color: C.text2, fontFamily: numFont,
    }} />
  )
})
export default HoverReadout

/** Show `html` at (x, y) inside a W-wide box, the spray chart's own placement
 *  (14px right of the pointer, 14px up, kept off the right edge); null hides it. */
export function placeTip(tip, html, x, y, W) {
  if (!tip) return
  if (html == null) { tip.style.display = 'none'; return }
  tip.innerHTML = html
  tip.style.display = 'block'
  tip.style.left = `${Math.min(x + 14, W - 190)}px`
  tip.style.top = `${Math.max(y - 14, 6)}px`
}
