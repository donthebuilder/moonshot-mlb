'use client'
import { useSportTheme } from '../SportTheme'
import { explain } from '../../lib/explain'
import { alpha } from '../../lib/scales'

// ONE ROW OF THE KEY NUMBERS (2026-10-08). Replaces the stacked per-game / averages tiles: one compact row,
// about a third of their height. A rank sits beside a number ONLY when it is top or bottom 10% of the pool
// the caller measured (lib/mlb/slateRank.js); the caller passes `rank` or nothing.
// stats: [{ id, label, text, title?, rank?: { rank, of, side } }]
export default function StatRow({ stats, poolLabel = "tonight's slate", noun = 'bats', style }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!stats?.length) return null
  return (
    <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 4, ...style }}>
      {stats.map((s) => {
        const top = s.rank?.side === 'top'
        const tip = [s.title, s.rank ? `${top ? 'Top' : 'Bottom'} 10% of the ${s.rank.of} ${noun} on ${poolLabel}: #${s.rank.rank} of ${s.rank.of}.` : null].filter(Boolean).join('\n\n')
        return (
          <div key={s.id} title={tip} {...(s.rank ? { role: 'button', tabIndex: 0, onClick: () => explain(s.label, tip), onKeyDown: (e) => { if (e.key === 'Enter') explain(s.label, tip) } } : null)} style={{ cursor: s.rank ? 'pointer' : 'default', minHeight: s.rank ? 44 : 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, textAlign: 'center', padding: '3px 2px 4px', borderRadius: 7, border: `1px solid ${top ? alpha(accent, 0.4) : C.border}`, background: 'rgba(255,255,255,.03)' }}>
            <div style={{ fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
            <div style={{ fontFamily: NUM_FONT, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: top ? accent : C.text }}>{s.text}</span>
              {s.rank ? <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 3, color: top ? accent : C.text3 }}>#{s.rank.rank}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
