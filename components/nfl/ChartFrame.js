'use client'
import { C } from '../../lib/nfl/theme'

// ONE FRAME, EVERY CHART.
//
// 2026-09-13, Donovan: whatever picture gets sent "can be more upgraded and
// futuristic." The charts were correct and plain — a 1px grey box around each
// one, which is what a chart looks like when nobody decided what it should
// look like. Five charts each growing their own decoration would be five
// styles; this is the one piece of chrome all of them wear, so the system
// reads as deliberate rather than decorated.
//
// What it is, and why each part earns its place:
//   · a measurement grid, 3% white — the surface reads as an instrument
//     rather than a card, and it gives the eye a reference the marks sit on
//   · a top inner highlight and a floor shadow — one pixel each, enough to
//     make the panel feel recessed into the page instead of pasted onto it
//   · HUD corner brackets in the signal blue — the one purely decorative
//     element, kept to four 6px strokes at 40%, which is the difference
//     between a readout and a div
//   · an accent bloom behind the content, so a chart with something to say
//     glows faintly and a quiet one does not
//
// Nothing here is allowed to compete with the data: everything is under 8%
// opacity except the brackets, and the grid is behind every mark.

// UPGRADE 2, same day. Three additions, each one a thing an instrument has and
// a div does not:
//   · EDGE TICKS — eight hairlines along the top and bottom rails, the marks a
//     gauge is printed with. 6% white, 4px, behind everything.
//   · A BREATHING BLOOM — the accent glow on a live chart now rises and falls
//     on an 8s cycle instead of sitting static. Slow on purpose: five charts
//     pulsing in sync at header speed would be a light show. Off entirely
//     under prefers-reduced-motion.
//   · A STATUS RAIL — a 2px accent bar down the left edge on live charts, the
//     same "this one is saying something" cue the Matchups callout uses.
export default function ChartFrame({ children, accent = C.green, live = false, pad = '9px 8px', style }) {
  const B = 7        // bracket arm length
  const bracket = {
    position: 'absolute', width: B, height: B, pointerEvents: 'none',
    borderColor: `${C.cyan}66`, borderStyle: 'solid', borderWidth: 0,
  }
  return (
    <div style={{
      position: 'relative', borderRadius: 10, padding: pad, overflow: 'hidden',
      border: `1px solid rgba(255,255,255,.10)`,
      background: `
        radial-gradient(120% 90% at 50% 110%, ${accent}14, transparent 60%),
        repeating-linear-gradient(0deg, rgba(255,255,255,.030) 0 1px, transparent 1px 13px),
        repeating-linear-gradient(90deg, rgba(255,255,255,.030) 0 1px, transparent 1px 13px),
        linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.008))
      `,
      boxShadow: live
        ? `inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 18px -6px ${accent}80`
        : 'inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.5)',
      animation: live ? 'tuddyChartBreathe 8s ease-in-out infinite' : 'none',
      ...style,
    }} data-tuddy-frame>
      <style>{`
        @keyframes tuddyChartBreathe {
          0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 14px -8px ${accent}80 }
          50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.5), 0 0 26px -4px ${accent}aa }
        }
        @media (prefers-reduced-motion: reduce) { [data-tuddy-frame] { animation: none !important } }
      `}</style>
      {/* edge ticks — a printed gauge rail, top and bottom */}
      <span aria-hidden style={{
        position: 'absolute', left: 14, right: 14, top: 0, height: 4, pointerEvents: 'none',
        background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.11) 0 1px, transparent 1px 14px)',
      }} />
      <span aria-hidden style={{
        position: 'absolute', left: 14, right: 14, bottom: 0, height: 4, pointerEvents: 'none',
        background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.09) 0 1px, transparent 1px 14px)',
      }} />
      {live && (
        <span aria-hidden style={{
          position: 'absolute', left: 0, top: 10, bottom: 10, width: 2,
          borderRadius: '0 2px 2px 0', background: `linear-gradient(180deg, ${accent}, ${accent}22)`,
          boxShadow: `0 0 8px ${accent}80`, pointerEvents: 'none',
        }} />
      )}
      <span style={{ ...bracket, top: 4, left: 4, borderTopWidth: 1, borderLeftWidth: 1, borderTopLeftRadius: 3 }} />
      <span style={{ ...bracket, top: 4, right: 4, borderTopWidth: 1, borderRightWidth: 1, borderTopRightRadius: 3 }} />
      <span style={{ ...bracket, bottom: 4, left: 4, borderBottomWidth: 1, borderLeftWidth: 1, borderBottomLeftRadius: 3 }} />
      <span style={{ ...bracket, bottom: 4, right: 4, borderBottomWidth: 1, borderRightWidth: 1, borderBottomRightRadius: 3 }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}
