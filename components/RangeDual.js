'use client'
import { C } from '../lib/theme'

// ── ONE SLIDER WITH TWO THUMBS (2026-09-02, finding #56) ────────────────────
//
// The Filters drawer drew a range as two <input type="range"> side by side in
// a flex row. At full range that renders a grey track on the left, a visible
// gap, then an orange track on the right, with a handle at each extreme -- so
// the control that means "everything is selected" looks like two broken
// sliders, and the one state a user sees most often is the one that looks
// most wrong. There was also no way to read the selected BAND, because the
// band is the space between two separate widgets.
//
// This is the ordinary fix: both inputs stacked on one track, the track drawn
// ourselves, and the selected span filled between the two values. The inputs
// keep their native keyboard behaviour and their native thumbs -- only the
// track is ours, and pointer events are handed back to the thumbs so both
// remain draggable while the elements overlap.
//
// The higher thumb takes the higher z-index when the two are close, otherwise
// a pair sitting on the same pixel leaves one of them unreachable.
export default function RangeDual({
  min = 0, max = 100, step = 1,
  low, high, onLow, onHigh,
  accent = null, label = '',
}) {
  const col = accent || C.orange
  const span = Math.max(1, Number(max) - Number(min))
  const pct = (v) => Math.max(0, Math.min(100, ((Number(v) - Number(min)) / span) * 100))
  const a = pct(low)
  const b = pct(high)
  const full = a <= 0.5 && b >= 99.5

  return (
    <div className="rd" style={{ position: 'relative', height: 22, marginTop: 4 }}>
      <div className="rd-track" style={{ background: C.bg3, border: `1px solid ${C.border}` }} />
      <div
        className="rd-fill"
        style={{
          left: `${Math.min(a, b)}%`,
          right: `${100 - Math.max(a, b)}%`,
          // At full range the fill IS the whole track, which is the point:
          // "everything selected" should read as one solid bar.
          background: full ? `${col}55` : col,
        }}
      />
      <input
        type="range" min={min} max={max} step={step} value={low}
        aria-label={label ? `${label} minimum` : 'minimum'}
        onChange={(e) => onLow(Math.min(Number(e.target.value), Number(high)))}
        style={{ zIndex: a > 92 ? 4 : 3, accentColor: col }}
      />
      <input
        type="range" min={min} max={max} step={step} value={high}
        aria-label={label ? `${label} maximum` : 'maximum'}
        onChange={(e) => onHigh(Math.max(Number(e.target.value), Number(low)))}
        style={{ zIndex: 3, accentColor: col }}
      />
      <style jsx>{`
        .rd-track, .rd-fill {
          position: absolute; top: 9px; height: 4px; border-radius: 99px; pointer-events: none;
        }
        .rd-track { left: 0; right: 0; }
        .rd input {
          position: absolute; left: 0; top: 0; width: 100%; height: 22px; margin: 0;
          -webkit-appearance: none; appearance: none;
          background: transparent; pointer-events: none;
        }
        .rd input:focus-visible { outline: 2px solid ${col}; outline-offset: 3px; border-radius: 6px; }
        .rd input::-webkit-slider-runnable-track { background: transparent; height: 22px; }
        .rd input::-moz-range-track { background: transparent; height: 22px; }
        /* The thumbs are the only part that takes the pointer, which is what
           lets two stacked full-width inputs both stay draggable. */
        .rd input::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; pointer-events: auto;
          width: 15px; height: 15px; margin-top: 0; border-radius: 50%;
          background: ${C.text}; border: 2px solid ${col}; cursor: pointer;
          box-shadow: 0 1px 4px ${C.shadow};
        }
        .rd input::-moz-range-thumb {
          pointer-events: auto;
          width: 13px; height: 13px; border-radius: 50%;
          background: ${C.text}; border: 2px solid ${col}; cursor: pointer;
        }
      `}</style>
    </div>
  )
}
