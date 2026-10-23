'use client'
import { useSportTheme } from '../SportTheme'
import { alpha } from '../../lib/scales'

// HIS NUMBERS, RANKED (2026-10-23): the tiles that sit in MOONSHOT's checklist slot on the other sports' v3 cards (TUDDY: his
// per-game season at his position; LAMP: tonight's angle among tonight's skaters). Each tile: the label, one number, an arrow on a
// hot / cold run, and his place in the pool. A place near the top lights in the product's accent. The sport decides the numbers and
// the pool; this only draws them. No probability is ever a tile.
// tiles: [{ id, label (node), value, arrow: 'up'|'down'|null, arrowTitle, rank: { r, n } | null, rankWord, rankTitle }]

/** his place (1 = most) among `values`; null with no number or a pool of one */
export function rankIn(values, v, { better = 'high' } = {}) {
  const x = Number(v)
  const vals = (values || []).map(Number).filter(Number.isFinite)
  if (!Number.isFinite(x) || vals.length < 2) return null
  return { r: 1 + vals.filter((y) => (better === 'low' ? y < x : y > x)).length, n: vals.length }
}
/** near the top of the pool: the top tenth, at least the top three */
export const isTop = (rk) => Boolean(rk && rk.r <= Math.max(3, Math.ceil(rk.n / 10)))

export default function StatTiles({ tiles, className = 'card-stat-tiles', style }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!tiles?.length) return null
  return (
    <div className={className} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', ...style }}>
      {tiles.map((t) => {
        const top = isTop(t.rank)
        return (
          <div key={t.id} style={{ background: top ? alpha(accent, 0.07) : 'rgba(255,255,255,.03)', border: `1px solid ${top ? alpha(accent, 0.4) : C.border}`, borderRadius: 9, padding: '6px 9px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: C.text }}>{t.value}</span>
              {t.arrow && <span title={t.arrowTitle} style={{ fontSize: 11, color: t.arrow === 'up' ? accent : C.text3, fontWeight: 900 }}>{t.arrow === 'up' ? '▲' : '▼'}</span>}
              {t.rank && <span title={t.rankTitle} style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, color: top ? accent : C.text3, fontWeight: 800 }}>#{t.rank.r}{t.rankWord ? ` ${t.rankWord}` : ''}</span>}
            </div>
          </div>
        )
      })}
      <style>{`@media (max-width: 560px) { .${className} { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }`}</style>
    </div>
  )
}
