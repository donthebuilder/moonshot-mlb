'use client'
import { useEffect, useState } from 'react'

// 🎯 LONGSHOTS, THREE ROWS (2026-09-27, Donovan: "how will they find these").
// The top three longshots by model score (the same /api/odds/longshots the
// full page reads), each with his price, and "See all" to the page. Shown
// only when there are prices, so it costs no scroll on a night without any.
// Same compact box as HistoryWatch; theme and openers come in as props.
const plus = (v) => (v > 0 ? `+${v}` : String(v))

export default function LongshotsPreview({ sport, theme: C, numFont, accent, onOpenPlayer, onSeeAll, max = 3 }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/odds/longshots?sport=${sport}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const rows = data?.rows || []
  if (!rows.length) return null
  return (
    <div style={{ margin: '6px 0 8px', padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg3 || C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em', fontFamily: numFont, color: C.text }}>🎯 LONGSHOTS</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: numFont }}>{data.market} at +{data.longAt} or longer · top model scores</span>
      </div>
      {rows.slice(0, max).map((r) => (
        <button key={r.id} type="button" onClick={() => onOpenPlayer?.(r.id)}
          style={{ display: 'flex', width: '100%', alignItems: 'baseline', gap: 8, textAlign: 'left', padding: '6px 0', background: 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', font: 'inherit', fontSize: 12, lineHeight: 1.4, minHeight: 0 }}>
          <b style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</b>
          <span style={{ color: C.text3, fontSize: 10.5, fontFamily: numFont, flexShrink: 0 }}>{r.team}{r.opp ? ` vs ${r.opp}` : ''}</span>
          {/* a real book's price, not the median of books (2026-10-04 user review #17) */}
          <b style={{ color: accent, fontFamily: numFont, flexShrink: 0 }} title={r.bestBook ? `best price, ${r.bestBook}` : undefined}>{plus(r.best ?? r.median)}</b>
          <span style={{ color: C.text3, fontSize: 10.5, fontFamily: numFont, flexShrink: 0 }}>score {Math.round(r.score)}</span>
        </button>
      ))}
      <button type="button" onClick={onSeeAll}
        style={{ marginTop: 2, padding: '4px 0', background: 'transparent', border: 'none', color: accent, cursor: 'pointer', font: 'inherit', fontSize: 11.5, fontWeight: 700, minHeight: 0 }}>
        See all {rows.length} longshots ›
      </button>
    </div>
  )
}
