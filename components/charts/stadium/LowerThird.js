'use client'
// THE LOWER THIRD (BATCH-3D-V2 step 0, lifted out of SprayFieldStadium.js).
// The broadcast name plate, lower-left: the one corner nothing else uses (the
// dock is top-left, the replay button top-right). pointerEvents off so it never
// eats a drag meant for the scene. Moved unchanged; `accent` / `fallback` let
// another product put its own colour and name on it.
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../../lib/theme'

export default function LowerThird({ title, subtitle, theme: C = MLB_C, numFont = MLB_NUM, accent = MLB_C.orange, fallback = 'MOONSHOT' }) {
  if (!title && !subtitle) return null
  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 12, zIndex: 2,
      pointerEvents: 'none', maxWidth: '70%',
    }}>
      {title && (
        <div style={{
          fontFamily: numFont, fontSize: 15, fontWeight: 900,
          letterSpacing: '.06em', color: C.text, lineHeight: 1.1,
          textShadow: '0 2px 10px rgba(0,0,0,.85)',
        }}>{String(title).toUpperCase()}</div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginTop: 3,
      }}>
        <span style={{
          display: 'inline-block', width: 16, height: 2,
          background: accent, borderRadius: 2,
        }} />
        <span style={{
          fontFamily: numFont, fontSize: 9, fontWeight: 800,
          letterSpacing: '.14em', color: C.text3,
          textShadow: '0 2px 8px rgba(0,0,0,.85)',
        }}>{subtitle ? String(subtitle).toUpperCase() : fallback}</span>
      </div>
    </div>
  )
}
