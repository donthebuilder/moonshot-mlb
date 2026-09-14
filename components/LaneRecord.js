'use client'
// Tonight's record in three lanes — one sentence, three numbers, never mixed.
// See lib/lanes.js for what the lanes are and why they are kept apart.
import { C, NUM_FONT } from '../lib/theme'
import { LANES } from '../lib/lanes'

const pct = (h, t) => (t > 0 ? `${Math.round((100 * h) / t)}%` : '—')

export default function LaneRecord({ record, compact = false }) {
  if (!record || record.total === 0) return null
  const { total, hit, pool } = record
  const Lane = ({ k, color }) => (
    <span title={LANES[k].title} style={{ whiteSpace: 'nowrap' }}>
      <b style={{ color, fontFamily: NUM_FONT, fontSize: 9.5, letterSpacing: '.08em' }}>{LANES[k].label}</b>{' '}
      <b style={{ fontFamily: NUM_FONT, color: C.text }}>{hit[k]}</b>
      <span style={{ color: C.text3 }}> of {total}</span>
      <span style={{ fontFamily: NUM_FONT, color }}> {pct(hit[k], total)}</span>
      {!compact && <span style={{ color: C.text3, fontSize: 10 }}> · {pool[k]} names</span>}
    </span>
  )
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.7, color: C.text2, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <Lane k="picks" color={C.orange} />
      <Lane k="board" color={C.green} />
      <Lane k="rated" color={C.text2} />
    </div>
  )
}
