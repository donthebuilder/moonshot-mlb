'use client'
// WHAT "CALLED" MEANS, ON EVERY LEDGER / RECORD TAB (2026-10-06, ledger audit P2). One shared
// note: the words /called prints (lib/record/callRules.js), in the product's own theme. `extra`
// adds a tab's own caveat (a window, a denominator). Plain text, 12px, no card.
import { useSportTheme } from '../SportTheme'
import { CALL_RULES } from '../../lib/record/callRules'

export default function RecordNote({ sport = 'mlb', extra = null, style = null }) {
  const { C } = useSportTheme()
  const r = CALL_RULES[sport]
  if (!r) return null
  return (
    <p style={{ margin: '10px 0', fontSize: 12, lineHeight: 1.55, color: C.text3, maxWidth: 760, ...style }}>
      <b style={{ color: C.text2 }}>How CALLED is counted.</b> {r.rule}{r.extra ? ` ${r.extra}` : ''}{extra ? ` ${extra}` : ''}
    </p>
  )
}
