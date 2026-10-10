'use client'
import { alpha } from '../../lib/scales'
import ScrollHint from './ScrollHint'
import { heatCell, STREAK_AT } from './heat'

// THE PROPS MATRIX, SHARED (2026-10-09). MOONSHOT's ThresholdGrid draws every market x every window on one heat
// table: a cell at 60%+ glows in the product's accent, a run of 3+ wears a flame, a window on thin games is a flat
// slab, the first column sticks while the table scrolls inside its own box (ScrollHint says so). That table now
// lives here, and MLB (components/ThresholdGrid.js), TUDDY (components/nfl/PropsGrid.js), LAMP
// (components/lamp/goal/GoalGrid.js) and BUCKETS (components/buckets/PropsMatrix.js) all draw it.
//
// A sport hands it ALREADY-COUNTED rows from its own game log; nothing in here reads a log or invents a number:
//   rows     [{ key, label, cells: [{ ok, n, pct } | null, ...one per window], stk }]   stk = signed run, newest back
//   windows  ['L5', 'L10', 'L20', 'Szn']   the column heads (a cell is null when the window has no games)
// A row with no games in a window prints a dash; a sport with no log never mounts this at all (honest empty state
// is the caller's: <MatrixEmpty>).
//
// look 'dense' is MOONSHOT's own sizes (11px heads, 14px rate, 10px fraction), byte for byte what ThresholdGrid drew.
// look 'roomy' is the larger TUDDY sizes (sortable heads, 17px rate). Slots (heads / cells) let MLB add its
// last-season, PRICE and TRUE columns and its streak lens without a second table.

const DENSE = {
  th: (C) => ({ fontSize: 11, color: C.text3, fontWeight: 800, padding: '0 4px' }),
  label: { fontSize: 12, pad: '3px 6px' },
  cell: { pct: 14, sub: 10, pad: '2px 3px', minWidth: 40 },
  stk: { fontSize: 12 },
}
const ROOMY = {
  th: (C) => ({ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', color: C.text2, padding: '0 4px 6px', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center', userSelect: 'none' }),
  label: { fontSize: 15, pad: '3px 6px' },
  cell: { pct: 17, sub: 11, pad: '5px 4px', minWidth: 0 },
  stk: { fontSize: 13 },
}
const LOOK = { dense: DENSE, roomy: ROOMY }

/** The window cells of one row. Drawn by the default row, or by a sport's own `cells` slot next to its extras. */
export function HeatCells({ row, on, look = 'dense', accent, C, thin = 3, cellTitle = null }) {
  const L = LOOK[look].cell
  return row.cells.map((c, ci) => (
    <td key={ci} title={cellTitle ? cellTitle(c, row) : (c ? `cleared ${c.ok} of ${c.n}` : 'no games in this window')} style={{
      textAlign: 'center', padding: L.pad, borderRadius: 8, minWidth: L.minWidth, lineHeight: look === 'roomy' ? 1.05 : 1.1,
      ...heatCell(c?.pct, c?.n, { accent, C, thin }),
      outline: on ? (look === 'roomy' ? `1px solid ${alpha(accent, 0.4)}` : (!(c?.pct >= 60) ? `1px solid ${C.border2}` : 'none')) : 'none',
    }}>
      {c ? (
        <>
          <div style={{ fontSize: L.pct, fontWeight: 900 }}>{c.pct.toFixed(0)}</div>
          <div style={{ fontSize: L.sub, fontWeight: look === 'roomy' ? 700 : 600, color: look === 'roomy' ? C.text2 : C.text3, marginTop: look === 'roomy' ? 2 : 0 }}>{c.ok}/{c.n}</div>
        </>
      ) : '—'}
    </td>
  ))
}

/** The signed run: W3 is three straight at the bar, L2 two straight without; a flame at STREAK_AT+ straight. */
export function StreakTd({ row, look = 'dense', accent, C, ink = null, word = 'Cleared' }) {
  const inkPos = ink?.pos || accent
  const inkNeg = ink?.neg || C.text3
  const none = look === 'roomy' ? C.text2 : C.text3
  const color = row.stk >= STREAK_AT ? accent : row.stk > 0 ? inkPos : row.stk < 0 ? inkNeg : none
  return (
    <td style={{ textAlign: 'center', fontSize: LOOK[look].stk.fontSize, fontWeight: 900, padding: '3px 4px', whiteSpace: 'nowrap', color }}
      title={row.stk >= STREAK_AT ? `${word} ${row.stk} straight` : undefined}>
      {row.stk >= STREAK_AT ? '🔥 ' : ''}{row.stk > 0 ? `W${row.stk}` : row.stk < 0 ? `L${-row.stk}` : '—'}
    </td>
  )
}

/** The honest empty state: the sport has the grid but this player has no log to count. */
export function MatrixEmpty({ C, NUM_FONT, children }) {
  return <div style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 12, lineHeight: 1.5, padding: '6px 0' }}>{children}</div>
}

export default function PropsMatrix({
  rows, windows, C, NUM_FONT, accent, activeKey = null, onPick = null, look = 'dense', thin = 3,
  span = null, onSpan = null,           // dense: the window the chart reads; a header tap sets it
  sort = null, onSort = null, onUnsort = null,   // roomy: { w, dir } and the header taps
  heads = null, cells = null,           // slots: the head cells / the row cells after the market (MLB adds columns)
  cellTitle = null, streakWord = 'Cleared', streakInk = null, hint = 'Swipe for the rest of the grid', labelText = null,
  marketTitle = 'Restore the natural market order',
}) {
  const roomy = look === 'roomy'
  const L = LOOK[look]
  const th = L.th(C)
  const marketTh = roomy
    ? { ...th, textAlign: 'left' }
    : { textAlign: 'left', fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 6px', position: 'sticky', left: 0, zIndex: 2, background: C.bg2 }
  return (
    <ScrollHint hint={hint}>
      <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '2px 2px', fontFamily: NUM_FONT }}>
          <thead>
            <tr>
              <th style={marketTh} onClick={roomy && onUnsort ? onUnsort : undefined} title={roomy ? marketTitle : undefined}>Market</th>
              {heads || (
                <>
                  {windows.map((w, wi) => roomy ? (
                    <th key={w} onClick={onSort ? () => onSort(wi) : undefined}
                      title="Click to rank the rows by this window; click again to flip"
                      style={{ ...th, color: sort?.w === wi ? accent : C.text2, borderBottom: sort?.w === wi ? `2px solid ${accent}` : '2px solid transparent' }}>
                      {w}{sort?.w === wi ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ) : (
                    <th key={w} onClick={onSpan ? () => onSpan(w) : undefined} title={onSpan ? 'Click — the chart below shows this window' : undefined}
                      style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: span === w ? accent : C.text3, cursor: onSpan ? 'pointer' : 'default', padding: '0 4px', borderBottom: span === w ? `2px solid ${accent}` : '2px solid transparent' }}>
                      {w === 'Szn' ? 'Season' : w}
                    </th>
                  ))}
                  <th style={roomy ? { ...th, cursor: 'default' } : th} title="Current streak: consecutive newest games at the bar (W) or without it (L)">STK</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = row.key === activeKey
              return (
                <tr key={row.key} onClick={onPick ? () => onPick(row) : undefined} style={{ cursor: onPick ? 'pointer' : 'default' }}>
                  <td style={{
                    fontSize: L.label.fontSize, fontWeight: on ? 900 : 700, whiteSpace: 'nowrap', color: on ? accent : C.text, padding: L.label.pad,
                    borderLeft: `3px solid ${on ? accent : 'transparent'}`, borderRadius: 4,
                    ...(roomy ? null : { position: 'sticky', left: 0, zIndex: 1, background: C.bg2 }),
                  }}>{labelText ? labelText(row) : row.label}</td>
                  {cells ? cells(row, on) : (
                    <>
                      <HeatCells row={row} on={on} look={look} accent={accent} C={C} thin={thin} cellTitle={cellTitle} />
                      <StreakTd row={row} look={look} accent={accent} C={C} ink={streakInk} word={streakWord} />
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ScrollHint>
  )
}
