'use client'
import { alpha } from '../../lib/scales'
import { InfoDot } from '../Explain'
import { useSportTheme } from '../SportTheme'

// THE BOARD CARD'S PARTS, SHARED (2026-09-29, parity plan E). Moved verbatim
// out of components/PlayerCard.js (MOONSHOT's board card, "the single most-
// clicked component on the site"): the name that steps its font down instead
// of losing letters, the demoted score badge with its tap-to-explain dot, and
// the one strip the tapped explanations open into. TUDDY's and LAMP's board
// cards draw through them in their own theme (components/SportTheme.js);
// MOONSHOT has none set, so its markup is unchanged.

/** NAME FITS (2026-08-08): "Freddie Freem…" is not a name. Long names step the
 *  font down instead of losing letters; the full name rides in the tooltip. */
export function CardName({ name }) {
  const n = String(name || '')
  // 2026-10-10 (on "Munetaka Mur…"): a name never ends in an ellipsis now. It takes
  // the whole line it is given and WRAPS (a third line at most) before it would lose
  // a letter; the glyphs that used to sit before it moved to the line under it.
  return (
    <span title={name} style={{
      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden',
      fontWeight: 900, lineHeight: 1.15, minWidth: 0, overflowWrap: 'anywhere',
      fontSize: n.length > 24 ? 13 : n.length > 18 ? 14 : 15,
    }}>
      {name}
    </span>
  )
}

/** THE SCORE, DEMOTED (2026-08-09): a badge beside the stats that earned it,
 *  with the product's word over it and the grade under it. Tap opens `open`. */
export function ScoreBadge({ label = 'SCORE', score, sub, color, open, onToggle }) {
  const { C, NUM_FONT } = useSportTheme()
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
      style={{
        textAlign: 'center', flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${color}44`, background: `${color}10`,
        borderRadius: 8, padding: '3px 8px 4px',
      }}>
      <div style={{ fontSize: 9, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        {label}<InfoDot on={open} onClick={() => onToggle?.()} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1.1, fontFamily: NUM_FONT }}>{score}</div>
      <div style={{ fontSize: 9, color: C.text3 }}>{sub}</div>
    </div>
  )
}

/** Tap-opened explanations for the header row -- one shared strip so three
 *  dots don't mean three different popovers to hunt for. */
export function ExplainStrip({ notes }) {
  const { C, accent, themed } = useSportTheme()
  const shown = (notes || []).filter(Boolean)
  if (!shown.length) return null
  const bg = themed ? alpha(accent, 0.07) : 'rgba(249,115,22,.07)'
  const bd = themed ? `1px solid ${alpha(accent, 0.28)}` : '1px solid rgba(249,115,22,.28)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 7, marginTop: -3 }}>
      {shown.map((n, i) => (
        <div key={i} style={{
          fontSize: 11, lineHeight: 1.5, color: C.text2,
          background: bg, border: bd,
          borderRadius: 7, padding: '5px 8px',
        }}>{n}</div>
      ))}
    </div>
  )
}
