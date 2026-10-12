'use client'
// THE "TRACKING" LINES (2026-10-12): a BUCKETS market under the public-number floor (lib/record/nbaFloor.js) has no
// record line, only this: the word, n (graded calls) and the nights so far. One line per market, from the route's own
// `tracking` list ([{ label, n, nights }]); nothing is computed here.
import { useSportTheme } from '../SportTheme'
import { trackingWords } from '../../lib/record/nbaFloor'
import { TYPE } from '../../lib/theme'

export default function TrackingLines({ tracking, title = 'THE RECORD SO FAR' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!tracking?.length) return null
  return (
    <section aria-label="Tracking" style={{ margin: '4px 0 12px' }}>
      <div style={{ color: accent, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>{title}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {tracking.map((t) => (
          <li key={t.market || t.label} style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>{t.label}</b> {trackingWords({ n: t.n, nights: t.nights })}
          </li>
        ))}
      </ul>
    </section>
  )
}
