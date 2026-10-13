'use client'
// THE QUIET "EARLY ACCESS" TAG (2026-10-12). Drawn above a hidden product ONLY for a signed-in early-access grant holder (the server said so:
// /api/buckets/access { open:true, early:true }). It tells them what they are looking at: a preview, with the tracking floors still on (a record
// shows as "tracking" until 30 graded nights). Words come from the feature registry (lib/features.js earlyTag); colours from the product's own accent
// (lib/sportAccent.js) and the chassis ink. In normal flow at the very top, so it never covers the header or the bottom bar. 12px text, centered.
import { C } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { featureOfSport } from '../lib/features'

export default function EarlyTag({ sport }) {
  const f = featureOfSport(sport)
  if (!f?.earlyTag) return null
  const [head, ...rest] = f.earlyTag.split(' · ')
  return (
    <div role="note" data-early-access={f.key} style={{ background: C.bg2, borderBottom: `1px solid ${C.border}`, color: C.text2, fontSize: 12, lineHeight: 1.35, textAlign: 'center', padding: 'max(6px, env(safe-area-inset-top)) 14px 6px' }}>
      <strong style={{ color: SPORT_ACCENT[sport] || C.text, letterSpacing: '0.12em', fontWeight: 800 }}>{head}</strong>
      {rest.length ? <span> · {rest.join(' · ')}</span> : null}
    </div>
  )
}
