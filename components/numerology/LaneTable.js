'use client'
import DenseTable from '../DenseTable'
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
    return (
      <section aria-label="Which lanes run hot" style={box}>
        {head}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
          {data.nights
            ? `${data.nights} graded night${data.nights === 1 ? '' : 's'} recorded${data.recorded > data.nights ? `, ${data.recorded - data.nights} more being graded` : ''}.`
            : data.recorded
              ? `${data.recorded} night${data.recorded === 1 ? '' : 's'} recorded so far; a night counts once every game on it is graded.`
              : 'Nothing recorded yet: each night is logged before the game starts and graded after the final.'}{' '}
          Each lane&apos;s row appears once it has {data.minNights} graded nights{data.nights || data.recorded ? ` (about ${Math.max(0, data.minNights - (data.nights || 0))} more nights)` : ''}: its matched players&apos; hit rate against everyone who could have matched. Until then there is nothing honest to show.
        </div>
      </section>
    )
  }
  return (
    <section aria-label="Which lanes run hot" style={box}>
      {head}
      <div style={{ overflowX: 'auto' }}>
        {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): the same
            columns; |z| of 2+ in the accent, as before. */}
        <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={Math.max(rows.length, 1)} accent={accent}
          caption="Which number lanes have run hot on graded nights"
          rows={rows.map((l) => ({ ...l, _key: l.lane }))}
          columns={[
            { key: 'label', label: 'Lane', heat: false, sticky: true, w: 140, fmt: (v) => <b>{v}</b> },
            { key: 'nights', label: 'Nights', w: 54, dp: 0 },
            { key: 'matchedRate', label: 'Matched hit', w: 110, fmt: (v, l) => <span style={{ fontFamily: numFont }}>{pct(v)} <span style={{ color: C.text3, fontSize: 11 }}>{l.matchedHits}/{l.matched}</span></span> },
            { key: 'baseRate', label: 'Everyone', w: 70, fmt: (v) => pct(v), tone: () => ({ color: C.text2 }) },
            { key: 'z', label: 'z', w: 44, fmt: (v) => (v == null ? '—' : Number(v).toFixed(1)), tone: (n) => ({ color: Math.abs(n || 0) >= 2 ? accent : C.text3, weight: 800 }) },
          ]} />
      </div>
      {shown.length > 5 && <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 6, minHeight: 36, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{all ? 'Show five' : `+${shown.length - 5} more lanes`}</button>}
      <div style={{ marginTop: 6, fontSize: 11, color: C.text3 }}>z = matched players against the rest of the eligible pool; |z| under 2 is chance. Graded nights only. Never part of a score.</div>
    </section>
  )
}
