'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// Heatmap — the chart the Streamlit build leans on hardest, ported.
//
// Palette note: Streamlit used a green ramp because green was that site's
// magnitude colour. Here the accent is orange, so the ramp runs dark ember to
// bright amber. One hue on purpose -- the eye reads brightness as magnitude
// without having to decode a rainbow. A diverging scale would say "bad" in a
// second colour, but on these boards a low score isn't bad, it's just low.
//
// Labels are near-black on the top two shades. Off-white vanishes on bright
// amber, which is the single most common way a heatmap ends up unreadable.

export const ORANGE_RAMP = [
  '#241203', // ember, barely lit
  '#4a2205',
  '#7c3a06',
  '#b35309',
  '#e2760d',
  '#f97316', // the site accent
  '#fbbf24',
  '#fde68a', // bright amber, top of the scale
]

const INK_DARK = '#1a0d02'
const INK_LIGHT = '#f4f4f5'

export function rampColor(v, lo, hi) {
  const f = Number(v)
  if (!Number.isFinite(f)) return null
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (f - lo) / span))
  return ORANGE_RAMP[Math.min(ORANGE_RAMP.length - 1, Math.floor(pos * ORANGE_RAMP.length))]
}

export const inkFor = (bg) =>
  bg === ORANGE_RAMP[7] || bg === ORANGE_RAMP[6] ? INK_DARK : INK_LIGHT

/**
 * rows:    [{ label: 'BOS vs LAD', values: { 'Game Score': 61.2, ... } }]
 * columns: ['Game Score', 'Med HR', ...]
 *
 * Every column is scaled independently against its own min/max. That's the
 * whole point of the chart: a bright cell means "high for this slate on that
 * input", not "high compared to the column next to it". Scaling them together
 * would let one wide-ranged column flatten every other one to black.
 */
export default function Heatmap({
  rows = [],
  columns = [],
  title = '',
  caption = '',
  fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : '—'),
  labelWidth = 150,
  onRowClick = null,
  maxHeight = null,
}) {
  const [hover, setHover] = useState(null)
  // Sorting. A heatmap you can't re-sort only answers the question its default
  // order was built to answer; click a column and it answers that column's.
  const [sort, setSort] = useState(null)

  const ranges = useMemo(() => {
    const out = {}
    columns.forEach((c) => {
      const vals = rows.map((r) => Number(r.values?.[c])).filter((v) => Number.isFinite(v))
      out[c] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, columns])

  const view = sort
    ? [...rows].sort((a, b) => {
        const av = Number(a.values?.[sort.key])
        const bv = Number(b.values?.[sort.key])
        const mul = sort.dir === 'desc' ? -1 : 1
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0
        if (!Number.isFinite(av)) return 1
        if (!Number.isFinite(bv)) return -1
        return (av - bv) * mul
      })
    : rows

  const toggle = (key) => setSort((s) => (
    s && s.key === key
      ? (s.dir === 'desc' ? { key, dir: 'asc' } : null)  // third click clears
      : { key, dir: 'desc' }
  ))

  if (!rows.length || !columns.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 7,
          letterSpacing: '.02em',
        }}>{title}</div>
      )}

      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
        maxHeight: maxHeight || undefined, background: C.bg2,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', left: 0, zIndex: 2, background: C.bg2,
                width: labelWidth, minWidth: labelWidth,
                borderBottom: `1px solid ${C.border}`,
              }} />
              {columns.map((c) => {
                const on = sort?.key === c
                return (
                  <th
                    key={c}
                    onClick={() => toggle(c)}
                    title={`Sort by ${c}`}
                    style={{
                      fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase',
                      color: on || hover?.col === c ? C.orange : C.text3,
                      fontWeight: 700, padding: '7px 5px', whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${on ? C.orange : C.border}`,
                      background: C.bg2, cursor: 'pointer', userSelect: 'none',
                      transition: 'color .1s',
                    }}
                  >{c}{on ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}</th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, ri) => (
              <tr
                key={r.label ?? ri}
                onClick={onRowClick ? () => onRowClick(r, ri) : undefined}
                title={onRowClick ? `Open ${r.label}` : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  background: hover?.row === ri ? C.bg3 : C.bg2,
                  fontSize: 11.5, fontWeight: 700,
                  color: hover?.row === ri ? C.text : C.text2,
                  padding: '0 10px', width: labelWidth, minWidth: labelWidth,
                  maxWidth: labelWidth, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  borderRight: `1px solid ${C.border}`,
                  transition: 'background .1s',
                }}>{r.label}</td>

                {columns.map((c) => {
                  const raw = r.values?.[c]
                  const [lo, hi] = ranges[c]
                  const bg = rampColor(raw, lo, hi)
                  const on = hover?.row === ri || hover?.col === c
                  return (
                    <td
                      key={c}
                      onMouseEnter={() => setHover({ row: ri, col: c })}
                      onMouseLeave={() => setHover(null)}
                      title={`${r.label} · ${c}: ${fmt(raw)}`}
                      style={{
                        background: bg || C.bg3,
                        color: bg ? inkFor(bg) : C.text3,
                        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700,
                        textAlign: 'center', padding: '7px 5px',
                        borderRight: `1px solid ${C.bg}`,
                        borderBottom: `1px solid ${C.bg}`,
                        outline: on ? `1px solid ${C.border2}` : 'none',
                        outlineOffset: -1,
                        minWidth: 46,
                      }}
                    >{fmt(raw)}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 7,
        fontSize: 9.5, color: C.text3,
      }}>
        <span>low</span>
        <span style={{ display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
          {ORANGE_RAMP.map((c) => (
            <span key={c} style={{ width: 16, height: 8, background: c }} />
          ))}
        </span>
        <span>high</span>
        <span style={{ marginLeft: 4, flex: 1 }}>
          {caption || 'Each column is scaled on its own, so a bright cell means high for this slate on that input — not comparable across columns.'}
          {' '}Click a column to sort; click it twice more to clear.
        </span>
      </div>
    </div>
  )
}
