'use client'

// EVERY NAME, TEAM AND GAME IS A LINK (2026-09-27, CLICK-EVERYTHING-PLAN).
// A player's name opens his card, a team opens the team, a game opens the
// game -- all three products. Tap keeps the text exactly as it was (no blue
// link colour), underlines on hover on desktop, and gets a 44px-tall tap area
// on a touch screen without changing the row's height (app/globals.css
// .tap-link). No handler -> the plain text, never a dead button.
export default function Tap({ onClick, children, title, style }) {
  if (!onClick) return <>{children}</>
  return (
    <button type="button" className="tap-link" title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      style={{ background: 'none', border: 0, padding: 0, margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'inherit', ...style }}>
      {children}
    </button>
  )
}
