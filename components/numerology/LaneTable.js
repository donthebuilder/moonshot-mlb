'use client'
import { useEffect, useState } from 'react'

// WHICH LANES RUN HOT (2026-09-27, BATCH-NUMEROLOGY step 6). Reads
// /api/numerology/lanes: per lane, the matched players' hit rate against the
// base rate for everyone eligible, over graded nights only. A lane's row
// appears at 30 graded nights; until then the block says how many there are.
// Phone first: five rows, the rest behind one tap. Pattern watching.
const pct = (v) => (v == null ? '—' : `${(100 * v).toFixed(1)}%`)

export default function LaneTable({ sport, theme: C, numFont, accent }) {
  const [data, setData] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/numerology/lanes?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  if (!data?.configured) return null
  const shown = (data.lanes || []).filter((l) => l.shown)
  const rows = all ? shown : shown.slice(0, 5)
  const box = { padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }
  const head = <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont, marginBottom: 6 }}>WHICH LANES RUN HOT</div>
  if (!shown.length) {
    const nearest = (data.lanes || []).reduce((m, l) => Math.min(m, l.needs), data.minNights)
    return (
      <section aria-label="Which lanes run hot" style={box}>
        {head}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
          {data.nights ? `${data.nights} graded night${data.nights === 1 ? '' : 's'} recorded.` : 'Recording starts with the next slate.'}{' '}
          Each lane&apos;s row appears once it has {data.minNights} graded nights{data.nights ? ` (the first in about ${nearest} more)` : ''}: its matched players&apos; hit rate against everyone who could have matched. Until then there is nothing honest to show.
        </div>
      </section>
    )
  }
  return (
    <section aria-label="Which lanes run hot" style={box}>
      {head}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr style={{ color: C.text3, fontSize: 11, textAlign: 'right' }}>
              <th scope="col" style={{ textAlign: 'left', padding: '4px 4px' }}>Lane</th>
              <th scope="col" style={{ padding: '4px 4px' }}>Nights</th>
              <th scope="col" style={{ padding: '4px 4px' }}>Matched hit</th>
              <th scope="col" style={{ padding: '4px 4px' }}>Everyone</th>
              <th scope="col" style={{ padding: '4px 4px' }}>z</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.lane} style={{ borderTop: `1px solid ${C.border}`, textAlign: 'right' }}>
                <th scope="row" style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 700 }}>{l.label}</th>
                <td style={{ padding: '6px 4px', fontFamily: numFont }}>{l.nights}</td>
                <td style={{ padding: '6px 4px', fontFamily: numFont }}>{pct(l.matchedRate)} <span style={{ color: C.text3, fontSize: 11 }}>{l.matchedHits}/{l.matched}</span></td>
                <td style={{ padding: '6px 4px', fontFamily: numFont, color: C.text2 }}>{pct(l.baseRate)}</td>
                <td style={{ padding: '6px 4px', fontFamily: numFont, fontWeight: 800, color: Math.abs(l.z || 0) >= 2 ? accent : C.text3 }}>{l.z == null ? '—' : l.z.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > 5 && <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 6, minHeight: 36, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{all ? 'Show five' : `+${shown.length - 5} more lanes`}</button>}
      <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>z = matched players against the rest of the eligible pool; |z| under 2 is chance. Graded nights only. Never part of a score.</div>
    </section>
  )
}
