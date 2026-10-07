'use client'
import { C } from '../lib/theme'
import { explain } from '../lib/explain'

// (?) -- THE QUIET WAY TO KEEP A CAVEAT (2026-10-07 text sweep). A page says one
// plain line; the honest fine print (how a number is counted, how big the
// sample is, what a score is not) sits one tap away. Same panel as every other
// tap-to-explain (lib/explain.js -> ExplainToast), so it works on a phone where
// a hover title does not.
//
// The slot in the line is 22px wide; the button inside it is 44x44 and centred
// on it, so the glyph costs the line no extra height or width and the thumb
// still gets a full target. Nothing sticks out past the page edge: the button
// overhangs the slot by 11px each side, inside any page gutter.
export default function HelpTip({ label = 'About this', text, color = C.text3, style }) {
  if (!text) return null
  return (
    <span style={{ display: 'inline-block', position: 'relative', width: 22, height: 14, verticalAlign: 'middle', ...style }}>
      <button type="button" aria-label={`${label}: what this means`} title={label}
        onClick={(e) => { e.stopPropagation(); explain(label, text) }}
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 44, height: 44, minHeight: 0, padding: 0,
          background: 'none', border: 'none', color, cursor: 'pointer',
          fontSize: 12, fontWeight: 800, lineHeight: 1,
        }}>(?)</button>
    </span>
  )
}
