'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// ── THE TICKER PILL, ONE SHAPE FOR BOTH HEADERS (2026-09-18) ───────────────
// Donovan: "why dont the score rail on headers dont match."
//
// The SCROLL was already shared — both headers call lib/headlines.js's
// useAutoScroll at the same literal 55px/s (round 4 fixed that). What never
// got shared was the tile itself, so the two strips still read differently
// even moving at the same speed:
//
//   MOONSHOT's Pill (components/Header.js)   TUDDY's Tile (NflHeader.js)
//   height 26, radius 6                      padding 5/13, radius 9
//   flat  ${color}10 fill                    135deg gradient fill
//   border ${color}33                        border ${color}4d
//   a dot column ALWAYS reserved — filled    a dot only when live, inline in
//     and pulsing live, hollow ring when       the label, so every non-live
//     not — so labels line up down the rail    tile's text starts further left
//   value clipped at 150px with an ellipsis  value uncapped, long names push
//                                              the tile wide
//   always a <button>                        a <div> unless given onClick
//
// This is MOONSHOT's shape, because MOONSHOT is the reference product. The
// one thing kept from TUDDY's side is the inert variant: the static slate
// tiles (Games, Proj TD, Pool) have nowhere to navigate to, so they render as
// a <div> rather than a button that does nothing — same box, no tap
// affordance. `theme`/`numFont` are optional props defaulting to MOONSHOT's,
// the same sport-adapter pattern ScoreRail and PageHeader use.

export default function TickerPill({
  label,
  value,
  icon = null,
  color = null,
  live = false,
  title = null,
  onClick = null,
  echo = false,
  theme = null,
  numFont = null,
}) {
  const T = theme || MLB_C
  const NF = numFont || MLB_NUM
  const col = color || T.text3
  const box = {
    display: 'inline-grid', gridTemplateColumns: '8px auto', alignItems: 'center', columnGap: 6,
    height: 26, whiteSpace: 'nowrap', padding: '0 10px 0 8px', marginRight: 6, borderRadius: 6,
    flexShrink: 0, background: `${col}10`, border: `1px solid ${color || T.border}33`,
    color: 'inherit', font: 'inherit', transition: 'background .12s',
  }
  const inner = (
    <>
      <span aria-hidden="true" style={{
        width: 5, height: 5, borderRadius: '50%',
        background: live ? col : 'transparent',
        border: live ? 'none' : `1px solid ${col}66`,
        animation: live ? 'pulse 2s infinite' : 'none',
      }} />
      <span style={{ display: 'grid', lineHeight: 1.05 }}>
        <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.text3 }}>
          {icon ? `${icon} ` : ''}{label}
        </span>
        <span style={{
          fontFamily: NF, fontSize: 11, fontWeight: 900, color: color || T.text,
          letterSpacing: '-.01em', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {value}
        </span>
      </span>
    </>
  )
  if (typeof onClick !== 'function') {
    return <div title={title || undefined} style={box}>{inner}</div>
  }
  return (
    <button
      type="button"
      tabIndex={echo ? -1 : 0}
      aria-hidden={echo || undefined}
      onClick={onClick}
      title={title || undefined}
      style={{ ...box, cursor: 'pointer' }}
    >
      {inner}
    </button>
  )
}
