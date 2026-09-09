'use client'
// The header cell that goes with lib/useSort.js. A real <button> inside the
// <th> so it is keyboard-reachable and announced as sortable; aria-sort on
// the cell so a screen reader hears which way the column runs.
import { C, NUM_FONT } from '../lib/theme'

export default function SortTh({ label, active, dir, onSort, align = 'right', className = '', title = '', width, accent = C.orange, style = {} }) {
  const arrow = active ? (dir === 'asc' ? '▲' : '▼') : ''
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ padding: '6px 6px', textAlign: align, fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em',
        textTransform: 'uppercase', color: active ? accent : C.text3, borderBottom: `1px solid ${C.border2}`,
        whiteSpace: 'nowrap', width, ...style }}
    >
      {onSort ? (
        <button type="button" onClick={onSort} title={title || `Sort by ${label || 'this column'}`}
          style={{ all: 'unset', cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit',
            textTransform: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3, minHeight: 18 }}>
          {label}{arrow && <span aria-hidden="true" style={{ fontSize: 7 }}>{arrow}</span>}
        </button>
      ) : label}
    </th>
  )
}
