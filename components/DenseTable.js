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
  // MULTI-SORT. `sort` is an ordered list of keys, not one key.
  //
  // Plain click  -> make this the only sort key, descending.
  // Click again  -> flip that key's direction.
  // Shift-click  -> add this key BELOW the existing ones as a tiebreaker,
  //                 or flip it if it's already in the stack.
  // Shift-click a key that's already last -> cycles desc, asc, removed.
  //
  // The ordinal is drawn in the header so the precedence is visible; a stack
  // you can't see is worse than no stack at all, because you can't tell why
  // the rows moved.
  const [sort, setSort] = useState(initialSort ? [{ key: initialSort, dir: 'desc' }] : [])

  const heatCols = useMemo(() => columns.filter((c) => c.heat !== false && !c.flag && !c.action), [columns])

  const ranges = useMemo(() => {
    const out = {}
    heatCols.forEach((c) => {
      const vals = rows.map((r) => Number(r[c.key])).filter(Number.isFinite)
      out[c.key] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, heatCols])

  const sorted = useMemo(() => {
    if (!sort.length) return rows
    // Missing values sink to the bottom whichever way the column is pointing.
    // Flipping to ascending on a column full of dashes used to fill the top of
    // the table with blanks, which is never what you wanted from the click.
    const blank = (v) => v === null || v === undefined || v === '' || v === '—'
    const cmpOne = (a, b, { key, dir }) => {
      const av = a[key], bv = b[key]
      const ab = blank(av), bb = blank(bv)
      if (ab && bb) return 0
      if (ab) return 1
      if (bb) return -1
      const mul = dir === 'desc' ? -1 : 1
      const an = Number(av), bn = Number(bv)
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul
      return String(av).localeCompare(String(bv)) * mul
    }
    return [...rows].sort((a, b) => {
      for (const s of sort) {
        const r = cmpOne(a, b, s)
        if (r !== 0) return r
      }
      return 0
    })
  }, [rows, sort])

  const view = sorted.length > maxRows ? sorted.slice(0, maxRows) : sorted
  const truncated = sorted.length - view.length

  if (!rows.length || !columns.length) return null

  const pad = dense ? '5px 6px' : '8px 9px'

  const toggle = (key, additive) => setSort((s) => {
    const i = s.findIndex((x) => x.key === key)
    if (!additive) {
      // Plain click: this key alone. Flip if it was already the only key.
      if (i === 0 && s.length === 1) return [{ key, dir: s[0].dir === 'desc' ? 'asc' : 'desc' }]
      return [{ key, dir: 'desc' }]
    }
    if (i < 0) return [...s, { key, dir: 'desc' }]
    const next = [...s]
    if (next[i].dir === 'desc') { next[i] = { key, dir: 'asc' }; return next }
    next.splice(i, 1)                       // third shift-click removes it
    return next
  })

  return (
    <div>
      <div className="dense-scroll" style={{
        border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
        maxHeight, background: C.bg2,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr>
              {columns.map((c) => {
                const si = sort.findIndex((x) => x.key === c.key)
                const on = si >= 0
                const dir = on ? sort[si].dir : null
                return (
                  <th
                    key={c.key}
                    onClick={(e) => toggle(c.key, e.shiftKey)}
                    title={`${c.title || c.label}\n\nClick to sort. Shift-click to add as a tiebreaker under the current sort.`}
                    style={{
                      position: c.sticky ? 'sticky' : undefined,
                      left: c.sticky ? 0 : undefined,
                      zIndex: c.sticky ? 4 : undefined,
                      // Header dress (2026-08-08, modest): a darker cap row
                      // with an ember underline — solid under the sorted
                      // column, faint elsewhere — so "what am I sorted by"
                      // reads from the header itself.
                      background: C.bg3, cursor: 'pointer', userSelect: 'none',
                      fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase',
                      color: on ? C.orange : C.text3, fontWeight: on ? 900 : 700,
                      padding: pad, whiteSpace: 'nowrap',
                      textAlign: c.heat === false ? 'left' : 'center',
                      borderBottom: `2px solid ${on ? C.orange : 'rgba(249,115,22,.18)'}`,
                      width: c.w, minWidth: c.w,
                    }}
                  >
                    {c.label}
                    {on && (
                      <>
                        {dir === 'desc' ? ' ▾' : ' ▴'}
                        {sort.length > 1 && (
                          <sup style={{ fontSize: 7.5, marginLeft: 1, opacity: 0.85 }}>{si + 1}</sup>
                        )}
                      </>
                    )}
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

                  // ACTION CELL — a button inside the table, not a stat.
                  // { key, action:true, onAction:(row)=>…, mark:'★' }
                  // Lit from the row's own truthy value, and it stops the click
                  // from bubbling into onRowClick so starring a hitter doesn't
                  // also open his card.
                  if (c.action) {
                    const lit = !!v && v !== 0
                    return (
                      <td key={c.key} style={{
                        textAlign: 'center', padding: 0,
                        borderRight: `1px solid ${C.bg}`, borderBottom: `1px solid ${C.bg}`,
                        background: C.bg2,
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); c.onAction?.(r._raw ?? r) }}
                          title={lit ? (c.titleOn || 'Remove') : (c.titleOff || 'Add')}
                          style={{
                            width: '100%', padding: pad, border: 'none', cursor: 'pointer',
                            background: lit ? ORANGE_RAMP[5] : 'transparent',
                            color: lit ? '#1a0d02' : C.text3,
                            fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, lineHeight: 1,
                          }}
                        >{lit ? (c.mark || '★') : (c.markOff || '☆')}</button>
                      </td>
                    )
                  }

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
        {' '}<b style={{ color: C.text2 }}>Shift-click a header</b> to add it as a tiebreaker under the
        current sort — shift-click again to flip it, a third time to drop it.
        {sort.length > 1 && (
          <>
            {' '}Sorting by{' '}
            <b style={{ color: C.orange }}>
              {sort.map((s, i) => {
                const col = columns.find((c) => c.key === s.key)
                return `${i ? ' then ' : ''}${col?.label || s.key} ${s.dir === 'desc' ? '↓' : '↑'}`
              }).join('')}
            </b>.
            {' '}<span
              onClick={() => setSort(initialSort ? [{ key: initialSort, dir: 'desc' }] : [])}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >Reset</span>
          </>
        )}
        {' '}Blanks always sort to the bottom, whichever way a column points.
      </div>
      <style jsx>{`
        .dense-row:hover td { filter: brightness(1.22); }
      `}</style>
    </div>
  )
}
