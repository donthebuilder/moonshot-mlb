'use client'
import { explain } from '../../lib/explain'
import { C, NUM_FONT } from '../../lib/nhl/theme'

// "(?)" -- a caveat that carries meaning, moved off the page and onto a tap (2026-10-07 text sweep).
// One fixed panel answers (components/ExplainToast.js, via lib/explain.js), so it works on a phone, where a
// title= tooltip never shows. The 44px tap area is padding with the margin taken back, so it adds no height.
export default function Hint({ label, text }) {
  return (
    <button type="button" aria-label={`${label}: what this means`} onClick={(e) => { e.stopPropagation(); explain(label, text) }}
      style={{ minWidth: 44, minHeight: 44, margin: '-16px -12px', padding: 0, background: 'transparent', border: 'none', color: C.text3, font: `800 12px/1 ${NUM_FONT}`, cursor: 'pointer', verticalAlign: 'middle' }}>(?)</button>
  )
}
