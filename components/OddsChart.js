'use client'
import { useEffect, useRef, useState } from 'react'
import { C as MLB_C, NUM_FONT } from '../lib/theme'
const C = MLB_C
import { verdictInk } from '../lib/scales'

// 📊 THE ONE PICTURE THE ODDS BOARD KEEPS (2026-10-07).
//
// Moves & gaps and True Price were deleted (Donovan's call) and took their charts with them: the 'return per
// market, with its error bar', 'every gap against the bar it has to clear', 'every gap with its error bar' and the
// move histogram are gone, he dislikes them. What is left is the calibration scatter on the board's HR view.
//
// (The original note, 2026-08-30:)
//
// 2026-08-30, Donovan, on the odds board, Moves & gaps and True Price:
// "make these pages more precise and better stats and chart wise."
//
// All three pages were a table under a paragraph. Every number on them was
// already honest — the gap carries its error bar, the tier refuses to speak
// below it, the ROI band prints ±. But every one of those caveats was a WORD
// sitting next to a number, and a word cannot show you that eleven rows all
// sit inside the same funnel, or that a +37 gap and a ±13 error bar overlap.
// A picture can, in one glance, and it cannot overstate the case the way a
// sentence can, because the error bar is drawn at the same scale as the point.
//
// THE HOUSE RULES THESE FOLLOW:
//   · Nothing here computes a statistic. Every chart takes numbers its caller
//     already had to be right about, and draws them. If a chart could disagree
//     with the table beside it, the chart is wrong by construction.
//   · The error bar is never optional and never a hover. It is drawn at the
//     same scale as the estimate, because that is the entire argument.
//   · Colour comes from lib/scales.js's verdictInk and lib/theme.js's tokens,
//     never a literal — five themes ship and a hard-coded green is only right
//     in one of them.
//   · viewBox + width:100%, so a phone gets the whole chart scaled rather than
//     a cropped desktop one. No fixed pixel widths anywhere.
//   · Every mark carries a <title>, so the number behind a dot is one hover
//     (or one tap, on iOS) away and the chart never replaces the table.

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const AX = () => ({ fontFamily: NUM_FONT, fontSize: 8.5, fill: C.text3 })

// ── THE CHART DRAWS AT 1:1, ALWAYS ─────────────────────────────────────────
//
// Caught in render on a 390px phone, 2026-08-30: a fixed `viewBox="0 0 1000 h"`
// scaled to a 350px column shrinks every label to about a third of its stated
// size — 8.5px axis type rendered at 3px, which is a chart with the numbers
// filed off. And a fixed pixel width instead would have made the same labels
// enormous on a 1,400px desktop.
//
// So the frame MEASURES ITSELF and hands its width to the chart, which lays
// out in real pixels. Type is the size it says it is on every screen; only the
// plot gets wider. Children are a function of that width for exactly this
// reason — a chart cannot be laid out before its container is known.
//
// SSR has no width. The first paint uses 1000, the observer corrects on mount,
// and because both are the same markup shape there is nothing to hydrate
// wrong — the marks just move.
// theme: the sport's (2026-10-02); MOONSHOT's by default, so every MOONSHOT chart is unchanged
function Frame({ title, sub, height, children, footer, minW = 300, theme = null }) {
  const C = theme || MLB_C
  const ref = useRef(null)
  const [w, setW] = useState(1000)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const read = () => setW(Math.max(minW, Math.round(el.clientWidth || 1000)))
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [minW])
  return (
    <section style={{
      border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2,
      padding: '10px 12px 8px', margin: '0 0 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 11.5, color: C.text }}>{title}</b>
        {sub && <span style={{ fontSize: 9.5, color: C.text3 }}>{sub}</span>}
      </div>
      <div ref={ref}>
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}
          style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
          role="img" aria-label={title}>
          {typeof children === 'function' ? children(w) : children}
        </svg>
      </div>
      {footer && (
        <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5, marginTop: 6 }}>{footer}</div>
      )}
    </section>
  )
}

// ── 3. CALIBRATION ──────────────────────────────────────────────────────────
//
// The board's EDGE column is a subtraction between two columns three cells
// apart, and reading it means doing that subtraction in your head sixty times.
// Plotted against each other with the fair line drawn, the subtraction IS the
// distance from the diagonal, and the whole board's shape shows up: whether
// tonight's model disagrees with the book everywhere or in one corner, and
// whether the disagreements are the thin samples.
//
// The vertical bar on each dot is the 95% Wilson band on his own season rate
// (lib/hrRateBand.js). A dot whose bar crosses the diagonal is a hitter whose
// season cannot tell you which side of this price he belongs on.
export function CalibrationScatter({ rows = [], onPick, footer }) {
  const pts = rows.filter((r) => r && Number.isFinite(r.need) && Number.isFinite(r.rate))
  if (pts.length < 4) return null
  const height = 300
  const pad = 42
  const hi = Math.max(10, Math.ceil(Math.max(...pts.map((r) => Math.max(r.need, r.hi ?? r.rate, r.rate))) / 5) * 5)
  const y = (v) => (height - pad) - (v / hi) * (height - pad * 2)
  const ticks = [0, hi / 4, hi / 2, (3 * hi) / 4, hi].map((t) => Math.round(t * 10) / 10)

  return (
    <Frame
      title="🎯 His rate against what the price needs"
      sub="the diagonal is a fair price · above it the book is paying more than his season asks, below it you are paying up"
      height={height}
      footer={footer}
    >
      {(W) => {
        const x = (v) => pad + (v / hi) * (W - pad * 2)
        return (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={pad} y2={height - pad} stroke={C.border} strokeDasharray="2 5" />
                <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke={C.border} strokeDasharray="2 5" />
                <text x={x(t)} y={height - pad + 14} textAnchor="middle" {...AX()}>{t}</text>
                <text x={pad - 6} y={y(t) + 3} textAnchor="end" {...AX()}>{t}</text>
              </g>
            ))}
            <line x1={x(0)} y1={y(0)} x2={x(hi)} y2={y(hi)} stroke={C.text3} strokeWidth="1.4" opacity="0.75" />
            <text x={x(hi) - 4} y={y(hi) + 14} textAnchor="end" style={{ ...AX(), fontSize: 8.5 }}>fair</text>
            <text x={W / 2} y={height - 4} textAnchor="middle" style={{ ...AX(), fontSize: 8.5 }}>what the price needs, %</text>
            <text x={4} y={pad - 8} style={{ ...AX(), fontSize: 8.5 }}>his own rate, %</text>
            {pts.map((r) => {
              const decided = r.lo != null && !r.thin && (r.lo > r.need || r.hi < r.need)
              const ink = decided ? verdictInk(r.rate > r.need).color : C.text3
              return (
                <g key={r.id} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={onPick ? () => onPick(r) : undefined}>
                  <title>
                    {r.name} · price needs {r.need.toFixed(1)}%, he runs {r.rate.toFixed(1)}%{r.lo != null ? ` (95% band ${r.lo.toFixed(1)}–${r.hi.toFixed(1)})` : ''} · {(r.rate - r.need) > 0 ? '+' : ''}{(r.rate - r.need).toFixed(1)} pts{r.thin ? ' — sample too thin to stand on' : decided ? ' — the band clears the price' : ' — the band straddles the price'}
                  </title>
                  {r.lo != null && (
                    <line x1={x(r.need)} x2={x(r.need)} y1={y(Math.min(hi, r.hi))} y2={y(Math.max(0, r.lo))}
                      stroke={ink} strokeWidth="1.2" opacity={r.thin ? 0.2 : 0.4} strokeLinecap="round" />
                  )}
                  <circle cx={x(r.need)} cy={y(Math.min(hi, r.rate))} r={r.thin ? 2.4 : 4}
                    fill={decided ? ink : C.bg2} stroke={ink} strokeWidth="1.3" opacity={r.thin ? 0.45 : 1} />
                </g>
              )
            })}
          </>
        )
      }}
    </Frame>
  )
}

