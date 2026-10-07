'use client'
import { C } from '../../lib/nfl/theme'
import { explain } from '../../lib/explain'
import { NFL_SUBS } from './tabExplainerTexts'

// A page's one subtitle (12 words at most) with a "(?)" when there is more to say. The (?) works
// on tap (lib/explain.js): the longer answer shows in the app's one explain panel.
export default function NflNote({ tab, style }) {
  const t = NFL_SUBS[tab]
  if (!t) return null
  return (
    <span style={style}>
      {t.sub}
      {t.why && (
        <button type="button" aria-label="More about this page" onClick={() => explain('About this page', t.why)}
          style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', font: 'inherit', fontWeight: 700, padding: '12px 8px', margin: '-12px -4px', minHeight: 0, minWidth: 0 }}>(?)</button>
      )}
    </span>
  )
}

// A "(?)" for one caveat inside a page, tap-to-read through the app's explain panel.
export function QMark({ label = 'More', text }) {
  if (!text) return null
  return (
    <button type="button" aria-label={label} onClick={() => explain(label, text)}
      style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', font: 'inherit', fontWeight: 700, padding: '12px 8px', margin: '-12px -4px', minHeight: 0, minWidth: 0 }}>(?)</button>
  )
}
