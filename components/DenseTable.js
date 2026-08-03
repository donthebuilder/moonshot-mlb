'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { ORANGE_RAMP, rampColor, inkFor } from './Heatmap'

// DenseTable — the PropFinder table pattern.
//
// Twenty-odd stat columns, every numeric column colored against its OWN range,
// rows clickable. The colouring is the whole point: at this density an
// uncolored table is a wall of digits and you end up reading it one cell at a
// time. Coloured, the shape of a hitter is visible before you read a number.
//
// Column spec:
//   { key, label, w?, fmt?, heat?, invert?, flag?, sticky? }
//   heat:false  -> plain cell (names, teams, handedness)
//   invert:true -> low is good, so the ramp runs the other way
//   flag:true   -> boolean-ish; lit if truthy, dark if not

export default function DenseTable({
  rows = [],
  columns = [],
  onRowClick = null,
  maxHeight = 460,
  initialSort = null,
  dense = true,
  caption = '',
  maxRows = 200,
}) {
  const [sort, setSort] = useState(initialSort ? { key: initialSort, dir: 'desc' } : null)

  const heatCols = useMemo(() => columns.filter((c) => c.heat !== false && !c.flag), [columns])

  const ranges = useMemo(() => {
    const out = {}
    heatCols.forEach((c) => {
      const vals = rows.map((r) => Number(r[c.key])).filter(Number.isFinite)
      out[c.key] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, heatCols])

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    const mul = dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key]
      const an = Number(av), bn = Number(bv)
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul
      return String(av ?? '').localeCompare(String(bv ?? '')) * mul
    })
  }, [rows, sort])

  const view = sorted.length > maxRows ? sorted.slice(0, maxRows) : sorted
  const truncated = sorted.length - view.length

  if (!rows.length || !columns.length) return null

  const pad = dense ? '5px 6px' : '8px 9px'
  const toggle = (key) => setSort((s) =>
    s && s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })

  return (
    <div>
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
        maxHeight, background: C.bg2,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr>
              {columns.map((c) => {
                const on = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    title={c.title || c.label}
                    style={{
                      position: c.sticky ? 'sticky' : undefined,
                      left: c.sticky ? 0 : undefined,
                      zIndex: c.sticky ? 4 : undefined,
                      background: C.bg2, cursor: 'pointer', userSelect: 'none',
                      fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase',
                      color: on ? C.orange : C.text3, fontWeight: 700,
                      padding: pad, whiteSpace: 'nowrap',
                      textAlign: c.heat === false ? 'left' : 'center',
                      borderBottom: `1px solid ${C.border}`,
                      width: c.w, minWidth: c.w,
                    }}
                  >
                    {c.label}{on ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, ri) => (
              <tr
                key={r._key ?? ri}
                onClick={onRowClick ? () => onRowClick(r._raw ?? r) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                className="dense-row"
              >
                {columns.map((c) => {
                  const v = r[c.key]

                  if (c.flag) {
                    const lit = !!v && v !== 0 && v !== '—'
                    return (
                      <td key={c.key} style={{
                        textAlign: 'center', padding: pad,
                        background: lit ? ORANGE_RAMP[5] : C.bg3,
                        color: lit ? '#1a0d02' : C.text3,
                        fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800,
                        borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                      }}>{lit ? (c.mark || '●') : '·'}</td>
                    )
                  }

                  if (c.heat === false) {
                    return (
                      <td key={c.key} style={{
                        position: c.sticky ? 'sticky' : undefined,
                        left: c.sticky ? 0 : undefined,
                        zIndex: c.sticky ? 1 : undefined,
                        background: C.bg2,
                        padding: pad, fontSize: 11, fontWeight: c.bold ? 700 : 500,
                        color: c.dim ? C.text3 : C.text,
                        fontFamily: c.mono ? NUM_FONT : 'inherit',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: c.w, borderRight: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.bg}`,
                      }}>{c.fmt ? c.fmt(v, r) : (v ?? '—')}</td>
                    )
                  }

                  const [lo, hi] = ranges[c.key] || [0, 1]
                  const num = Number(v)
                  const bg = Number.isFinite(num)
                    ? (c.invert ? rampColor(hi - (num - lo), lo, hi) : rampColor(num, lo, hi))
                    : null
                  return (
                    <td key={c.key} title={`${c.label}: ${Number.isFinite(num) ? num : '—'}`} style={{
                      background: bg || C.bg3, color: bg ? inkFor(bg) : C.text3,
                      fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 700,
                      textAlign: 'center', padding: pad,
                      borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                      minWidth: c.w || 40,
                    }}>{c.fmt ? c.fmt(v, r) : (Number.isFinite(num) ? num.toFixed(c.dp ?? 0) : '—')}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        {truncated > 0 && (
          <span style={{ color: C.orange }}>
            Showing the top {view.length} of {sorted.length} — sort a column to bring others up.{' '}
          </span>
        )}
        {caption || 'Every column is colored against its own range. Click a header to sort, a row to open the hitter.'}
      </div>
      <style jsx>{`
        .dense-row:hover td { filter: brightness(1.22); }
      `}</style>
    </div>
  )
}
