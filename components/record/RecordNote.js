'use client'
// WHAT "CALLED" MEANS, ON EVERY LEDGER / RECORD TAB (2026-10-06, ledger audit P2). One shared
// note: the words /called prints (lib/record/callRules.js), in the product's own theme. `extra`
// adds a tab's own caveat (a window, a denominator). Folded behind one tap (2026-10-07 text sweep): the line was a paragraph on every ledger tab.
import { useSportTheme } from '../SportTheme'
import { CALL_RULES } from '../../lib/record/callRules'

export default function RecordNote({ sport = 'mlb', extra = null, style = null }) {
  const { C } = useSportTheme()
  const r = CALL_RULES[sport]
  if (!r) return null
  return (
    <details style={{ margin: '6px 0', maxWidth: 760, ...style }}>
      <summary style={{ display: 'flex', alignItems: 'center', minHeight: 44, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.text2, listStyle: 'none' }}>How CALLED is counted (?)</summary>
      <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.55, color: C.text3 }}>
        {r.rule}{r.note ? ` ${r.note}` : ''}{r.extra ? ` ${r.extra}` : ''}{extra ? ` ${extra}` : ''}
      </p>
    </details>
  )
}
