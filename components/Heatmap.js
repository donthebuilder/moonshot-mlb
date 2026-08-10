'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { activeStops, inkOn, subscribe } from '../lib/palette'
import PaletteToggle from './PaletteToggle'

// Heatmap — the chart the Streamlit build leans on hardest, ported.
//
// Every column is scaled independently against its own min/max, so a strong
// cell means "high for this slate on that input" — not "high compared to the
// column beside it". Scaling columns together lets one wide-ranged column
// flatten every other one into a single shade.
//
// The palette history is below and worth keeping: this is the fourth attempt,
// and the first three all failed the same way, by asking BRIGHTNESS to carry
// the whole signal on a near-black page.

// ══ THE RAMP LIVES IN lib/palette.js NOW (2026-08-09) ════════════════════
// Donovan asked for a toggle: his original ember, the traffic light, and a
// PropFinder-style three-band red/yellow/green. All three, how they were
// solved, and why every earlier ramp was hard to read are documented there.
//
// This file keeps `ORANGE_RAMP` and `inkFor` exported under their old names
// so the ~30 call sites across the site keep working untouched — but both now
// read the ACTIVE ramp rather than a frozen array. Renaming the export would
// have been tidier and would also have been a thirty-file diff for no gain.

export { RAMPS, RAMP_IDS, DEFAULT_RAMP, usePalette, setRamp, getRamp, hydrateRamp } from '../lib/palette'

// A live view of the active ramp. Same array object forever, contents swapped
// in place when the palette changes.
//
// The first version of this was a Proxy over `[]`, which looked elegant and is
// a trap: the target is a real array whose `length` is non-configurable, so
// `ownKeys`/`getOwnPropertyDescriptor` can violate proxy invariants and throw
// a TypeError at render. Mutating one array has none of that risk and reads
// like what it is.
export const ORANGE_RAMP = [...activeStops()]
subscribe(() => { ORANGE_RAMP.length = 0; ORANGE_RAMP.push(...activeStops()) })

export const inkFor = inkOn

export function rampColor(v, lo, hi) {
  const f = Number(v)
  if (!Number.isFinite(f)) return null
  const stops = activeStops()
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (f - lo) / span))
  return stops[Math.min(stops.length - 1, Math.floor(pos * stops.length))]
}

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
  // ── MULTI-SORT (2026-08-09) ────────────────────────────────────────────
  // Donovan: "make sure the multi-sorts work."
  //
  // DenseTable has had a real sort STACK for a while — plain click sets the
  // key, shift-click adds a tiebreaker, a third shift-click drops it. This
  // chart had a single key and a different mental model, so the same gesture
  // did different things on two tables that look alike. Same behaviour now,
  // same shape of state, so there is one thing to learn.
  const [sort, setSort] = useState([])

  const ranges = useMemo(() => {
    const out = {}
    columns.forEach((c) => {
      const vals = rows.map((r) => Number(r.values?.[c])).filter((v) => Number.isFinite(v))
      out[c] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
    })
    return out
  }, [rows, columns])

  // Blanks sink to the bottom whichever way the column points — flipping to
  // ascending on a sparse column should not fill the top with empty cells.
  // `Number(null)` is 0, not NaN — so a missing cell used to sort as a REAL
  // ZERO and float to the top of any ascending sort. Caught by test, and the
  // original single-key version had the same bug: it checked Number.isFinite
  // on the converted value, which nulls pass. The raw value has to be checked
  // before the conversion. DenseTable already did this; now both agree.
  const blank = (v) => v === null || v === undefined || v === '' || v === '—'
  const cmpOne = (a, b, { key, dir }) => {
    const raw = a.values?.[key]
    const rawB = b.values?.[key]
    const av = Number(raw)
    const bv = Number(rawB)
    const ab = blank(raw) || !Number.isFinite(av)
    const bb = blank(rawB) || !Number.isFinite(bv)
    if (ab && bb) return 0
    if (ab) return 1
    if (bb) return -1
    return (av - bv) * (dir === 'desc' ? -1 : 1)
  }

  const view = sort.length
    ? [...rows].sort((a, b) => {
        for (const s of sort) {
          const r = cmpOne(a, b, s)
          if (r !== 0) return r
        }
        return 0
      })
    : rows

  const toggle = (key, additive) => setSort((s) => {
    const i = s.findIndex((x) => x.key === key)
    if (!additive) {
      // Plain click: this key alone, flipping if it was already the only one.
      if (i === 0 && s.length === 1) return [{ key, dir: s[0].dir === 'desc' ? 'asc' : 'desc' }]
      return [{ key, dir: 'desc' }]
    }
    if (i < 0) return [...s, { key, dir: 'desc' }]
    const next = [...s]
    if (next[i].dir === 'desc') { next[i] = { key, dir: 'asc' }; return next }
    next.splice(i, 1)                       // third shift-click removes it
    return next
  })

  if (!rows.length || !columns.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 7,
          letterSpacing: '.02em',
        }}>{title}</div>
      )}

      {/* heat-scroll: a heatmap with 15 slate rows is ~400px tall and, unlike
          a DenseTable, it is usually handed no maxHeight — so on a phone it
          runs past the fold and takes the page with it. The phone rule caps it
          and lets it scroll inside itself, which it is already set up to do. */}
      <div className="dense-scroll heat-scroll" style={{
        border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto',
        maxHeight: maxHeight || undefined, background: C.bg2,
        WebkitOverflowScrolling: 'touch',
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
                const si = sort.findIndex((x) => x.key === c)
                const on = si >= 0
                return (
                  <th
                    key={c}
                    onClick={(e) => toggle(c, e.shiftKey)}
                    title={`${c}\n\nClick to sort. Shift-click to add as a tiebreaker under the current sort.`}
                    style={{
                      fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase',
                      color: on || hover?.col === c ? C.orange : C.text3,
                      fontWeight: 700, padding: '7px 5px', whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${on ? C.orange : C.border}`,
                      background: C.bg2, cursor: 'pointer', userSelect: 'none',
                      transition: 'color .1s',
                    }}
                  >
                    {c}
                    {on ? (sort[si].dir === 'desc' ? ' ▾' : ' ▴') : ''}
                    {/* The ordinal makes precedence visible. A sort stack you
                        cannot see is worse than none, because you cannot tell
                        why the rows moved. */}
                    {on && sort.length > 1 && (
                      <sup style={{ fontSize: 7, marginLeft: 1, opacity: 0.85 }}>{si + 1}</sup>
                    )}
                  </th>
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
        <span style={{ marginLeft: 4, flex: 1, minWidth: 180 }}>
          {caption || 'Each column is scaled on its own, so a strong cell means high for this slate on that input — not comparable across columns.'}
          {' '}Click a column to sort; click it twice more to clear.
        </span>
        {/* The picker sits ON the legend because that is where someone is
            already looking when they think "I can't read this". Burying it in
            a settings menu means the complaint never turns into a fix. */}
        <span style={{ flexBasis: 220, flexShrink: 0 }}><PaletteToggle compact /></span>
      </div>
    </div>
  )
}
