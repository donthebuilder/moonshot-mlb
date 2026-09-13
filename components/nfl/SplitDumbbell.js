'use client'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// SPLITS AS A DUMBBELL — the gap is the point, so draw the gap.
//
// The table this replaces put two numbers on either side of a label and left
// the subtraction to the reader. Six stats meant twelve numbers and six
// subtractions before you knew whether the split was worth anything. A
// dumbbell makes the gap a LENGTH: the long rows are the real splits and they
// pop out of a column of short ones without reading a digit.
//
// Each row is scaled to its own maximum, because targets and yards do not
// share an axis and pretending they do would squash every rate row flat.
//
// A gap under 15% is drawn grey. On a nine-game sample that is not a split,
// it is noise wearing one, and the old table lit it up in green.

const MEANINGFUL = 0.15

export default function SplitDumbbell({ rows, leftLabel, rightLabel, note }) {
  const live = (rows || []).filter((r) => Number.isFinite(r.a) || Number.isFinite(r.b))
  if (!live.length) return null

  return (
    <div>
      {/* Header only when every row shares the same two sides. The player
          modal stacks a different pair on each row (home/away, then
          indoor/outdoor, then leading/trailing), so there it stays off and
          the row's own label carries the two names in order. */}
      {leftLabel && rightLabel && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.09em',
          color: C.text3, marginBottom: 7,
        }}>
          <span style={{ color: C.text2 }}>● {String(leftLabel).toUpperCase()}</span>
          <span style={{ color: C.text2 }}>{String(rightLabel).toUpperCase()} ○</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {live.map((r) => {
          const a = Number.isFinite(r.a) ? r.a : null
          const b = Number.isFinite(r.b) ? r.b : null
          const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0)) * 1.12 || 1
          const pos = (v) => `${Math.min(100, Math.max(0, (Math.abs(v) / max) * 100))}%`
          const both = a != null && b != null
          const gap = both ? Math.abs(a - b) : 0
          const real = both && Math.max(Math.abs(a), Math.abs(b)) > 0
            && gap / Math.max(Math.abs(a), Math.abs(b)) >= MEANINGFUL
          const wire = real ? C.green : C.text3

          return (
            <div key={r.key} style={{
              display: 'grid', gridTemplateColumns: '58px minmax(0,1fr) 52px',
              alignItems: 'center', gap: 8, padding: '5px 0',
              borderTop: `1px solid ${C.border}`,
            }}>
              <span style={{
                fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, color: C.text3,
              }}>{r.label}</span>

              <div style={{ position: 'relative', height: 15 }}>
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
                  background: 'rgba(255,255,255,.06)',
                }} />
                {both && (
                  <div style={{
                    position: 'absolute', top: '50%', height: 2, borderRadius: 2,
                    transform: 'translateY(-50%)',
                    left: `min(${pos(a)}, ${pos(b)})`,
                    width: `calc(max(${pos(a)}, ${pos(b)}) - min(${pos(a)}, ${pos(b)}))`,
                    background: wire, opacity: real ? 0.75 : 0.3,
                  }} />
                )}
                {a != null && (
                  <span title={`${leftLabel}: ${a}${r.ga ? ` (${r.ga}g)` : ''}`} style={{
                    position: 'absolute', left: pos(a), top: '50%',
                    transform: 'translate(-50%,-50%)', width: 9, height: 9,
                    borderRadius: '50%', background: C.text,
                  }} />
                )}
                {b != null && (
                  <span title={`${rightLabel}: ${b}${r.gb ? ` (${r.gb}g)` : ''}`} style={{
                    position: 'absolute', left: pos(b), top: '50%',
                    transform: 'translate(-50%,-50%)', width: 9, height: 9,
                    borderRadius: '50%', background: C.bg2,
                    border: `1.5px solid ${C.text2}`,
                  }} />
                )}
              </div>

              <span style={{
                fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, textAlign: 'right',
                color: real ? C.green : C.text3,
              }}>
                {both ? `${a > b ? '' : '−'}${gap < 1 ? gap.toFixed(2) : gap.toFixed(1)}` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
        {note || 'Per-game rates. The wire is the gap; it lights only past 15%, because a smaller one on this sample is noise.'}
      </div>
    </div>
  )
}
