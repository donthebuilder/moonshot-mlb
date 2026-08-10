'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

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

// ══ RAMP v3 — TRAFFIC LIGHT (2026-08-09) ═════════════════════════════════
// Donovan: "try red green and yellow for the heat map and make it easily
// readable — the heat map we have right now is not readable."
//
// WHY v2 WASN'T READABLE, and it is a design fault rather than a taste one.
// Every version up to now was ONE HUE varying only in BRIGHTNESS, on a
// near-black page. That has two problems that compound:
//
//   1. Brightness is the weakest channel the eye has for comparing things
//      that are not touching. Two cells four rows apart, both dim orange,
//      are genuinely hard to rank — you end up reading the number instead,
//      which is the heatmap failing at its only job.
//   2. Half the ramp lived at 1.4–3:1 against the background. v2's fix was
//      to make the low end "quiet" charcoal, which solved the mud and made
//      the bottom half of every table read as EMPTY rather than as low.
//
// v3 gives the work to HUE. Red means weak, amber means middling, green
// means strong — a mapping nobody has to be taught, and one the eye resolves
// instantly at any distance and any cell size.
//
// BUILT BY CONSTRUCTION, NOT BY EYE. Picking nine nice-looking hexes gives
// you a ramp with a yellow-green plateau where three steps collapse into one
// shade. Instead the hue walks 2° to 142° while LUMINANCE is forced to climb
// a fixed ladder (0.094 → 0.573, strictly increasing). Measured:
//
//   stop  hex       vs page  ink     text     lum    Δ prev
//   0     #a12b26    2.74    white   6.84    0.094    -
//   1     #b8402a    3.60    white   5.20    0.140    57
//   2     #c25a22    4.53    dark    4.50    0.189    56
//   3     #c47617    5.64    dark    5.61    0.248    58
//   4     #bd9110    6.84    dark    6.81    0.311    56
//   5     #aeae17    8.40    dark    8.36    0.393    64
//   6     #86c92c    9.86    dark    9.81    0.470    90
//   7     #74d45e   10.73    dark   10.67    0.516    87
//   8     #6fdd97   11.81    dark   11.75    0.573    93
//
//   worst text contrast anywhere  4.50:1  (WCAG AA body text is 4.5)
//   closest two neighbours        Δ56     (~30 already reads as different)
//   red end vs green end          Δ406
//
// v2's worst case was 2.34:1. Every cell on this ramp is now readable.
//
// THE COLOUR-BLINDNESS PROBLEM, HANDLED. Red/green is the worst possible
// pair for deuteranopia — roughly 8% of men — and a naive traffic light is
// exactly the chart those readers can't use. That is why luminance is forced
// to rise monotonically across all nine stops: strip the colour out entirely
// and the ramp is STILL correctly ordered, dark to light. Hue is the fast
// read; lightness is the fallback that never lies.
//
// Same 9-stop array, same API, same exported name — every table, zone map
// and matchup grid on the site inherits this without a further edit.
export const ORANGE_RAMP = [
  '#a12b26', // weak
  '#b8402a',
  '#c25a22',
  '#c47617', // middling
  '#bd9110',
  '#aeae17',
  '#86c92c',
  '#74d45e',
  '#6fdd97', // strong
]

// Ink is near-black from step 2 up. Off-white only survives on the two
// darkest reds — measured above, not assumed, which is how the previous
// threshold ended up two steps too high after a ramp change.
const INK_DARK = '#0a0a0b'
const INK_LIGHT = '#f8f8f8'

export function rampColor(v, lo, hi) {
  const f = Number(v)
  if (!Number.isFinite(f)) return null
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (f - lo) / span))
  return ORANGE_RAMP[Math.min(ORANGE_RAMP.length - 1, Math.floor(pos * ORANGE_RAMP.length))]
}

// Where light ink stops winning, computed once from the ramp itself.
const _lum = (h) => {
  const p = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}
const _ratio = (a, b) => {
  const [hi, lo] = _lum(a) > _lum(b) ? [_lum(a), _lum(b)] : [_lum(b), _lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}
const INK_CROSSOVER = (() => {
  const i = ORANGE_RAMP.findIndex((c) => _ratio(c, INK_DARK) > _ratio(c, INK_LIGHT))
  return i < 0 ? ORANGE_RAMP.length : i
})()

export const inkFor = (bg) => {
  // v3: the crossover is step 2, and it is DERIVED rather than typed in — the
  // last two times this ramp changed, the hard-coded threshold was left behind
  // and cells silently got harder to read as they got brighter. Computing it
  // from the ramp means the ink can never disagree with the fill again.
  const i = ORANGE_RAMP.indexOf(bg)
  if (i < 0) return INK_LIGHT
  return i >= INK_CROSSOVER ? INK_DARK : INK_LIGHT
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
