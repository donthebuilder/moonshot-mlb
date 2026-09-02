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
// TWO THUMBS ON ONE PIXEL. Stacking inputs creates one interaction that a
// naive z-index rule does not solve: when low and high collapse onto the same
// value MID-TRACK, whichever input paints on top owns the hit area, and its
// own clamp blocks it from moving in one of the two directions -- so the pair
// can only be separated by dragging the other one, which has no hit target.
//
// Two things fix it together, and neither is a z-index guess:
//   · the TRACK takes the pointer. A press anywhere on it moves whichever
//     bound is nearer to where you pressed, which always separates a collapsed
//     pair in one gesture and is what people expect of a slider anyway.
//   · the thumb that still has somewhere to go paints on top. At the maximum
//     that is `low` (high cannot go higher), everywhere else it is `high`.
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

  // A press on the track moves the nearer bound. `nearest` is by VALUE, not by
  // pixel, so it behaves the same at any width.
  const onTrackDown = (e) => {
    // A press that landed on a THUMB is a drag, and the browser is already
    // handling it. Jumping the value here would nudge it by a step before the
    // drag even starts.
    if (e.target && e.target.tagName === 'INPUT') return
    const box = e.currentTarget.getBoundingClientRect()
    if (!box.width) return
    const frac = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width))
    const raw = Number(min) + frac * span
    const stepped = Math.round(raw / Number(step)) * Number(step)
    const v = Math.max(Number(min), Math.min(Number(max), stepped))
    // A tie goes to whichever one can actually move toward the press.
    const dLow = Math.abs(v - Number(low))
    const dHigh = Math.abs(v - Number(high))
    if (dLow < dHigh || (dLow === dHigh && v < Number(low))) onLow(Math.min(v, Number(high)))
    else onHigh(Math.max(v, Number(low)))
  }

  return (
    <div className="rd" onPointerDown={onTrackDown} style={{ position: 'relative', height: 22, marginTop: 4 }}>
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
        style={{ zIndex: b >= 99.5 ? 4 : 3, accentColor: col }}
      />
      <input
        type="range" min={min} max={max} step={step} value={high}
        aria-label={label ? `${label} maximum` : 'maximum'}
        onChange={(e) => onHigh(Math.max(Number(e.target.value), Number(low)))}
        style={{ zIndex: 3, accentColor: col }}
      />
      <style jsx>{`
        .rd { touch-action: none; }
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
