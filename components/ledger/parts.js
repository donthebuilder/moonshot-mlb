'use client'
import { C, NUM_FONT } from '../../lib/theme'

// The Ledger's small shared pieces (moved out of Ledger.js 2026-09-27 so the
// 2+ Club view, components/ledger/MultiClub.js, draws the same chip, tile
// and panel). `pre` added for the 2+ Club: a game on a date we kept no
// graded record for -- BEFORE OUR RECORD, never a guessed label.

export const STATUS_META = {
  called: { label: 'CALLED', color: C.green },
  board: { label: 'ON BOARD', color: C.cyan },
  off: { label: 'NOT ON BOARD', color: C.text3 },
  pre: { label: 'BEFORE OUR RECORD', color: C.text3 },
}

export function StatusChip({ status, title }) {
  const m = STATUS_META[status] || STATUS_META.off
  return (
    <span title={title} style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em', padding: '1.5px 7px',
      borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${m.color}66`,
      background: status === 'off' || status === 'pre' ? 'transparent' : `${m.color}18`,
      color: m.color,
    }}>{m.label}</span>
  )
}

export function Tile({ label, value, color, sub }) {
  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 9, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 19, fontFamily: NUM_FONT, fontWeight: 900, color, marginTop: 1, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

export const panel = (accent) => ({
  background: C.bg2, border: `1px solid ${C.border}`,
  borderLeft: `3px solid ${accent}`, borderRadius: 14,
  padding: '13px 16px', marginBottom: 12,
})

export const prettyDate = (d) => {
  const t = new Date(`${d}T12:00:00Z`)
  return Number.isNaN(t.getTime()) ? d
    : t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
