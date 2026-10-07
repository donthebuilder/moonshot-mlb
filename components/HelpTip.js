'use client'
import { C } from '../lib/theme'
import { explain } from '../lib/explain'

// (?) -- THE QUIET WAY TO KEEP A CAVEAT (2026-10-07 text sweep). A page says one
// plain line; the honest fine print (how a number is counted, how big the
// sample is, what a score is not) sits one tap away. Same panel as every other
// tap-to-explain (lib/explain.js -> ExplainToast), so it works on a phone where
// a hover title does not.
//
// The hit area is 44x44 and its margins are pulled back by the same amount, so
// the glyph costs the line it sits in no extra height or width.
export default function HelpTip({ label = 'About this', text, color = C.text3, style }) {
  if (!text) return null
  return (
    <button type="button" aria-label={`${label}: what this means`} title={label}
      onClick={(e) => { e.stopPropagation(); explain(label, text) }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 44, minHeight: 44, margin: '-16px -14px', padding: 0, verticalAlign: 'middle',
        background: 'none', border: 'none', color, cursor: 'pointer',
        fontSize: 12, fontWeight: 800, lineHeight: 1, ...style,
      }}>(?)</button>
  )
}
