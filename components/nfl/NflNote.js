'use client'
import { C } from '../../lib/nfl/theme'
import { explain } from '../../lib/explain'
import { NFL_SUBS } from './tabExplainerTexts'

// A page's one subtitle (12 words at most) with a "(?)" when there is more to say. Its tap box reaches 15px left of the mark
// but only 8px right: at the end of a line, a 15px reach ran past a 360 phone's edge (audit 2026-10-20). Same spacing as before. The (?) works
// on tap (lib/explain.js): the longer answer shows in the app's one explain panel.
export default function NflNote({ tab, subs = NFL_SUBS, sub = null, style, why: whyOverride, color = C.text2 }) {
  // `subs` is a product's own { tab: { sub, why } } map (LAMP's: components/lamp/tabExplainerTexts.js LAMP_SUBS);
  // `sub` overrides the line for a page whose line carries a live word (a time zone). The component is the one
  // short-line-plus-tap pattern for every product (2026-10-17, simplify audit 5).
  const t0 = subs[tab] || (sub ? { sub, why: null } : null)
  if (!t0) return null
  const t = { ...t0, ...(sub ? { sub } : null), ...(whyOverride ? { why: whyOverride } : null) }
  return (
    <span style={style}>
      {t.sub}
      {t.why && (
        <button type="button" aria-label="More about this page" onClick={(e) => { e.stopPropagation(); explain('About this page', t.why) }}
          style={{ background: 'none', border: 'none', color, cursor: 'pointer', font: 'inherit', fontWeight: 700, padding: '15px 8px 15px 15px', margin: '-15px -4px -15px -11px', minHeight: 0, minWidth: 0 }}>(?)</button>
      )}
    </span>
  )
}

// A "(?)" for one caveat inside a page, tap-to-read through the app's explain panel.
export function QMark({ label = 'More', text }) {
  if (!text) return null
  return (
    <button type="button" aria-label={label} onClick={() => explain(label, text)}
      style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', font: 'inherit', fontWeight: 700, padding: '15px 8px 15px 15px', margin: '-15px -4px -15px -11px', minHeight: 0, minWidth: 0 }}>(?)</button>
  )
}
