'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { verdictInk } from '../lib/scales'

// 📊 THE FOUR PICTURES THE ODDS PAGES WERE MISSING.
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

const AX = { fontFamily: NUM_FONT, fontSize: 8.5, fill: C.text3 }

/** SVG has no text-overflow. This is it. */
const clip = (text, chars) => {
  const t = String(text)
  if (!Number.isFinite(chars) || chars < 4 || t.length <= chars) return t
  return `${t.slice(0, chars - 1)}…`
}

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
function Frame({ title, sub, height, children, footer, minW = 300 }) {
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

// ── 1. ROI, DRAWN ───────────────────────────────────────────────────────────
//
// The Reality Check band on True Price says six times over that a return is
// "indistinguishable from break-even". Six sentences is six separate acts of
// reading; six dots on one zero line is one. And the thing the sentences
// cannot do is show that Hits' bar is ±5.8 while home runs' is ±21.4 — that
// the two markets are not even measured to the same resolution, which is the
// most useful fact on the panel and was invisible in prose.
//
// The bar drawn is TWO standard errors, matching roiVerdict()'s own gate. A
// bar that touches the zero line is a market that has not said anything yet.
export function RoiErrorBars({ rows = [], footer }) {
  const usable = rows.filter((r) => r && Number.isFinite(r.value) && Number.isFinite(r.se))
  if (usable.length < 2) return null
  const rowH = 26
  const padT = 16
  const padB = 20
  const height = padT + usable.length * rowH + padB
  const reach = Math.max(...usable.map((r) => Math.abs(r.value) + 2 * r.se), 5)
  const span = Math.ceil(reach / 10) * 10

  return (
    <Frame
      title="💵 Return per market, with its error bar"
      sub="flat one unit at the offered price · the bar is two standard errors"
      height={height}
      footer={footer}
    >
      {(W) => {
        const labelW = Math.min(118, Math.round(W * 0.26))
        const plotL = labelW + 8
        const plotR = W - 34
        const x = (v) => plotL + ((v + span) / (2 * span)) * (plotR - plotL)
        const ticks = [-span, -span / 2, 0, span / 2, span]
        return (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={padT - 6} y2={height - padB + 2}
                  stroke={t === 0 ? C.border2 : C.border} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={x(t)} y={height - padB + 14} textAnchor="middle" {...AX}>{t > 0 ? `+${t}` : t}%</text>
              </g>
            ))}
            {usable.map((r, i) => {
              const cy = padT + i * rowH + rowH / 2
              const lo = r.value - 2 * r.se
              const hi = r.value + 2 * r.se
              // Touching zero is the verdict, and it is the verdict the colour
              // must show — a green dot on a bar that spans zero would be the
              // chart contradicting the sentence above it.
              const decided = lo > 0 || hi < 0
              const ink = decided ? verdictInk(r.value > 0).color : C.text3
              return (
                <g key={r.label}>
                  <title>{r.label}: {r.value > 0 ? '+' : ''}{r.value.toFixed(1)}% over {r.n} bets, 95% band {lo.toFixed(1)}% to {hi.toFixed(1)}%{decided ? '' : ' — spans break-even'}</title>
                  <text x={labelW} y={cy + 3} textAnchor="end" style={{ ...AX, fontSize: 10, fill: C.text2 }}>{r.label}</text>
                  <line x1={x(Math.max(-span, lo))} x2={x(Math.min(span, hi))} y1={cy} y2={cy} stroke={ink} strokeWidth="2" opacity="0.45" strokeLinecap="round" />
                  <line x1={x(Math.max(-span, lo))} x2={x(Math.max(-span, lo))} y1={cy - 4} y2={cy + 4} stroke={ink} strokeWidth="1.4" opacity="0.7" />
                  <line x1={x(Math.min(span, hi))} x2={x(Math.min(span, hi))} y1={cy - 4} y2={cy + 4} stroke={ink} strokeWidth="1.4" opacity="0.7" />
                  <circle cx={x(r.value)} cy={cy} r="4" fill={ink} />
                  <text x={plotR + 5} y={cy + 3} style={{ ...AX, fill: ink, fontSize: 9.5 }}>{r.n}</text>
                </g>
              )
            })}
          </>
        )
      }}
    </Frame>
  )
}

// ── 2. THE FUNNEL ───────────────────────────────────────────────────────────
//
// True Price's whole discipline is "a gap is not an edge until the sample says
// so", and until now that discipline lived in a chip that said "too thin" and
// in a sentence about a hundred nights. Drawn, it is a funnel: the curve is
// what a gap has to beat at each sample size, it narrows as nights accumulate,
// and every dot inside it is a row the page will not stand on.
//
// Needs the sample size to VARY — see GapIntervals below for the young-archive
// case, and TruePrice.js for which one it picks.
export function GapFunnel({ rows = [], seAt, maxN = null, onPick }) {
  const pts = rows.filter((r) => r && Number.isFinite(r.n) && Number.isFinite(r.edge))
  if (pts.length < 3) return null
  const height = 250
  const padL = 46
  const padR = 14
  const padT = 14
  const padB = 30
  const nHi = Math.max(maxN || 0, ...pts.map((r) => r.n))
  const nLo = Math.max(1, Math.min(...pts.map((r) => r.n)) - 1)
  const yReach = Math.max(20, Math.ceil(Math.max(...pts.map((r) => Math.abs(r.edge))) / 10) * 10)
  const y = (v) => padT + ((yReach - v) / (2 * yReach)) * (height - padT - padB)
  const yTicks = [-yReach, -yReach / 2, 0, yReach / 2, yReach]

  return (
    <Frame
      title="🎯 Every gap against the bar it has to clear"
      sub="the shaded funnel is two standard errors at that sample size — inside it, the gap and no gap are the same claim"
      height={height}
      footer="The funnel is computed at the PRICE'S break-even rate, the same test the Reads-as column runs, so a dot's position and its chip can never disagree. It narrows to the right because nights are the only thing that shrinks it."
    >
      {(W) => {
        const x = (n) => padL + ((n - nLo) / Math.max(1e-9, nHi - nLo)) * (W - padL - padR)
        // The band is sampled across the axis rather than drawn through the
        // points, so it is a statement about SAMPLE SIZE and not about which
        // rows happen to exist tonight.
        const steps = 60
        const upper = []
        const lower = []
        for (let i = 0; i <= steps; i++) {
          const n = nLo + (i / steps) * (nHi - nLo)
          const se = seAt(Math.max(1, n))
          if (!Number.isFinite(se)) continue
          upper.push(`${x(n).toFixed(1)},${y(Math.min(yReach, 2 * se)).toFixed(1)}`)
          lower.push(`${x(n).toFixed(1)},${y(Math.max(-yReach, -2 * se)).toFixed(1)}`)
        }
        const bandPath = upper.length > 1 ? `M${upper.join(' L')} L${lower.reverse().join(' L')} Z` : null
        return (
          <>
            {bandPath && <path d={bandPath} fill={C.text3} opacity="0.10" />}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)}
                  stroke={t === 0 ? C.border2 : C.border} strokeDasharray={t === 0 ? undefined : '2 5'} />
                <text x={padL - 6} y={y(t) + 3} textAnchor="end" {...AX}>{t > 0 ? `+${t}` : t}</text>
              </g>
            ))}
            <text x={padL - 6} y={padT - 4} textAnchor="end" style={{ ...AX, fontSize: 8 }}>pts</text>
            {[nLo, Math.round((nLo + nHi) / 2), nHi].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
              <text key={t} x={x(t)} y={height - padB + 15} textAnchor="middle" {...AX}>{t}</text>
            ))}
            <text x={(W + padL) / 2} y={height - 3} textAnchor="middle" style={{ ...AX, fontSize: 8 }}>graded nights at that exact line</text>
            {pts.map((r) => {
              const inside = Math.abs(r.edge) <= 2 * (seAt(r.n) || Infinity)
              const ink = inside ? C.text3 : verdictInk(r.edge > 0).color
              return (
                <circle
                  key={r.id}
                  cx={x(r.n)} cy={y(Math.max(-yReach, Math.min(yReach, r.edge)))}
                  r={inside ? 2.6 : 4}
                  fill={ink} opacity={inside ? 0.5 : 0.95}
                  style={{ cursor: onPick ? 'pointer' : 'default' }}
                  onClick={onPick ? () => onPick(r) : undefined}
                >
                  <title>{r.name} · {r.label} · {r.hits}/{r.n} ({r.rate?.toFixed?.(0)}%) against prices needing {r.avgImplied}% — {r.edge > 0 ? '+' : ''}{r.edge.toFixed(0)} pts, bar ±{(2 * (seAt(r.n) || 0)).toFixed(1)}</title>
                </circle>
              )
            })}
          </>
        )
      }}
    </Frame>
  )
}

// ── 2b. THE SAME ROWS AS INTERVALS ──────────────────────────────────────────
//
// The funnel needs the sample size to VARY to say anything — on an archive
// where every line has been priced the same number of nights it collapses to a
// vertical stripe, which is a true picture of a young archive and a useless
// one. Caught in render on 2026-08-30: ten nights in, every row sat at n=5 and
// the chart was a column of dots against a full-height band.
//
// This is the picture that works at any n: one horizontal 95% interval per
// row, sorted, against the zero line. It makes the page's own verdict visual —
// every interval crossing zero IS "none of these clears its error bar" — and
// it degrades gracefully, because a row's interval is a fact about that row
// alone and needs no spread across the axis to be legible.
export function GapIntervals({ rows = [], seAt, limit = 22, onPick }) {
  const pts = rows.filter((r) => r && Number.isFinite(r.edge) && Number.isFinite(r.n)).slice(0, limit)
  if (pts.length < 2) return null
  const rowH = 17
  // ── THE LEGEND IS PART OF THE PLOT (2026-08-31) ──────────────────────────
  //
  // Donovan, on this exact chart: "i dont understand this chart make better."
  //
  // He was right, and the failure was not the drawing — it was that the
  // drawing answered a question the reader had not been told was being asked.
  // Twenty-two grey lines through a zero line is a correct picture of
  // "nothing here has separated from break-even yet" and reads as a smear.
  // Three things were missing, all of them words rather than marks:
  //
  //   1. THE ANSWER, up front. The chart's whole verdict is a count — how
  //      many of these have actually said something — and it was left for
  //      the reader to derive by eye across twenty-two rows.
  //   2. WHICH WAY IS GOOD. A signed axis labelled "-45 … +45" does not tell
  //      anyone that right means the book is paying more than the man's rate
  //      deserves. Now each half is named, in the same words the READ column
  //      uses, so the chart and the table cannot be read differently.
  //   3. WHAT A ROW IS. The dot is the measurement, the bar is the range the
  //      truth could actually be in given how few nights there are. That is
  //      the entire idea and it was in a footnote. It is now drawn once, at
  //      the top, as a worked example with its parts called out.
  //
  // Nothing about the statistics changed. Same estimate, same two standard
  // errors at the same price-anchored rate. What changed is that the picture
  // now states its own question before answering it.
  const legendH = 44
  const padT = 14 + legendH
  // 40, not 26: three things live under the plot — the tick numbers, the
  // words "break even" under the zero line, and the axis caption. At 26 the
  // last two landed on the same baseline and printed on top of each other.
  // Caught in render, not in reasoning.
  const padB = 40
  const height = padT + pts.length * rowH + padB
  const bars = pts.map((r) => ({ ...r, se: seAt(r.n) || 0 }))
  const reach = Math.max(10, Math.ceil(Math.max(...bars.map((r) => Math.abs(r.edge) + 2 * r.se)) / 10) * 10)
  const decidedCount = bars.filter((r) => (r.edge - 2 * r.se) > 0 || (r.edge + 2 * r.se) < 0).length

  return (
    <Frame
      title="🎯 Every gap with its own error bar"
      sub={decidedCount
        ? `${decidedCount} of ${bars.length} rows have separated from break-even — the rest have not said anything yet`
        : `none of these ${bars.length} rows has separated from break-even yet — every bar still touches the zero line`}
      height={height}
      footer="Read one row at a time: the DOT is the gap actually measured, the BAR is the range the true gap could be in given how few nights this row has. A bar that touches the zero line is a row that has not ruled out break-even, whatever its dot says. The bar is computed at the PRICE'S break-even rate, the same test the Reads-as column runs, so a bar's position and its chip can never disagree."
    >
      {(W) => {
        // The names are the y-axis, so they get a real share of a phone's
        // width — but never so much that the plot has nowhere left to go.
        const labelW = Math.max(96, Math.min(210, Math.round(W * 0.36)))
        // A right gutter for the SAMPLE, because the sample is the entire
        // reason these bars are as wide as they are. A reader who cannot see
        // n has no way to know why one row's bar is twice another's.
        const gutter = W > 520 ? 62 : 40
        const plotL = labelW + 10
        const plotR = W - 12 - gutter
        const x = (v) => plotL + ((v + reach) / (2 * reach)) * (plotR - plotL)
        const ticks = [-reach, -reach / 2, 0, reach / 2, reach]
        const good = verdictInk(true).color
        const bad = verdictInk(false).color
        // The worked example sits on the same x scale as the rows below it,
        // so its width IS a real error bar rather than a decorative one.
        const exC = 0
        const exSe = reach / 4
        const exY = 26
        return (
          <>
            {/* ── the worked example ─────────────────────────────────── */}
            <text x={labelW} y={exY + 3} textAnchor="end" style={{ ...AX, fontSize: 9, fill: C.text2, fontWeight: 700 }}>how to read a row</text>
            <line x1={x(exC - exSe)} x2={x(exC + exSe)} y1={exY} y2={exY} stroke={C.text3} strokeWidth="1.8" opacity="0.45" strokeLinecap="round" />
            <circle cx={x(exC)} cy={exY} r="3" fill={C.text2} />
            <line x1={x(exC)} x2={x(exC)} y1={exY - 9} y2={exY - 4} stroke={C.text3} strokeWidth="0.8" />
            <text x={x(exC)} y={exY - 12} textAnchor="middle" style={{ ...AX, fontSize: 8 }}>measured</text>
            <line x1={x(exC + exSe)} x2={x(exC + exSe)} y1={exY + 4} y2={exY + 9} stroke={C.text3} strokeWidth="0.8" />
            <text x={x(exC + exSe) + 4} y={exY + 15} textAnchor="start" style={{ ...AX, fontSize: 8 }}>could really be anywhere in the bar</text>
            {/* ── which half is which, in the READ column's own words ── */}
            <text x={(plotL + x(0)) / 2} y={padT - 8} textAnchor="middle" style={{ ...AX, fontSize: 8.5, fill: bad, fontWeight: 700 }}>← needs better odds</text>
            <text x={(x(0) + plotR) / 2} y={padT - 8} textAnchor="middle" style={{ ...AX, fontSize: 8.5, fill: good, fontWeight: 700 }}>market’s behind him →</text>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={padT - 4} y2={height - padB + 2}
                  stroke={t === 0 ? C.border2 : C.border} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={x(t)} y={height - padB + 14} textAnchor="middle" {...AX}>{t > 0 ? `+${t}` : t}</text>
              </g>
            ))}
            <text x={x(0)} y={height - padB + 25} textAnchor="middle" style={{ ...AX, fontSize: 8, fill: C.text2 }}>break even</text>
            <text x={(plotL + plotR) / 2} y={height - 5} textAnchor="middle" style={{ ...AX, fontSize: 8 }}>his rate minus what the price needed, in points</text>
            {gutter >= 62 && (
              <text x={plotR + 8} y={padT - 8} textAnchor="start" style={{ ...AX, fontSize: 8 }}>hit / of</text>
            )}
            {bars.map((r, i) => {
              const cy = padT + i * rowH + rowH / 2
              const lo = r.edge - 2 * r.se
              const hi = r.edge + 2 * r.se
              const decided = lo > 0 || hi < 0
              const ink = decided ? verdictInk(r.edge > 0).color : C.text3
              return (
                <g key={r.id} style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={onPick ? () => onPick(r) : undefined}>
                  <title>{r.name} · {r.label} · {r.hits}/{r.n} against prices needing {r.avgImplied}% — {r.edge > 0 ? '+' : ''}{r.edge.toFixed(0)} pts, 95% band {lo.toFixed(0)} to {hi.toFixed(0)}{decided ? ' — clear of break-even' : ' — spans zero, so it has not said anything yet'}</title>
                  {/* Mono at 9px is ~5.4px a character, so the label is cut
                      to what the gutter can actually hold. Caught on a 390px
                      phone: "Kevin McGonigle · 1+ Home runs" ran off the left
                      edge of the chart entirely. The full string stays in the
                      <title> above, so nothing is lost, only shortened. */}
                  <text x={labelW} y={cy + 3} textAnchor="end" style={{ ...AX, fontSize: 9, fill: decided ? C.text : C.text2 }}>
                    {clip(`${r.name} · ${r.label}`, Math.floor((labelW - 6) / 5.4))}
                  </text>
                  <line x1={x(Math.max(-reach, lo))} x2={x(Math.min(reach, hi))} y1={cy} y2={cy}
                    stroke={ink} strokeWidth={decided ? 2.2 : 1.8} opacity={decided ? 0.75 : 0.32} strokeLinecap="round" />
                  {/* A decided row gets end caps. Two identical grey lines of
                      different length is the thing that made this chart read
                      as a smear; a cap is a mark you can find at a glance. */}
                  {decided && (
                    <>
                      <line x1={x(Math.max(-reach, lo))} x2={x(Math.max(-reach, lo))} y1={cy - 4} y2={cy + 4} stroke={ink} strokeWidth="1.4" />
                      <line x1={x(Math.min(reach, hi))} x2={x(Math.min(reach, hi))} y1={cy - 4} y2={cy + 4} stroke={ink} strokeWidth="1.4" />
                    </>
                  )}
                  <circle cx={x(Math.max(-reach, Math.min(reach, r.edge)))} cy={cy} r={decided ? 3.4 : 3} fill={ink} />
                  {gutter >= 62 && (
                    <text x={plotR + 8} y={cy + 3} textAnchor="start" style={{ ...AX, fontSize: 8.5, fill: C.text3 }}>
                      {r.hits}/{r.n}
                    </text>
                  )}
                </g>
              )
            })}
          </>
        )
      }}
    </Frame>
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
                <text x={x(t)} y={height - pad + 14} textAnchor="middle" {...AX}>{t}</text>
                <text x={pad - 6} y={y(t) + 3} textAnchor="end" {...AX}>{t}</text>
              </g>
            ))}
            <line x1={x(0)} y1={y(0)} x2={x(hi)} y2={y(hi)} stroke={C.text3} strokeWidth="1.4" opacity="0.75" />
            <text x={x(hi) - 4} y={y(hi) + 14} textAnchor="end" style={{ ...AX, fontSize: 8.5 }}>fair</text>
            <text x={W / 2} y={height - 4} textAnchor="middle" style={{ ...AX, fontSize: 8.5 }}>what the price needs, %</text>
            <text x={4} y={pad - 8} style={{ ...AX, fontSize: 8.5 }}>his own rate, %</text>
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

// ── 4. THE MOVE DISTRIBUTION ────────────────────────────────────────────────
//
// "403 large" is a count with no shape. The screen calls a move large at 3.0
// break-even points, and whether that threshold is picking out anything depends
// entirely on what the rest of the board did — if the bulk of tonight's prices
// moved two points, three is a rounding error with an alert attached.
//
// The histogram answers that in one look: where the mass sits, how fat the
// tails are, and exactly where the threshold falls on it.
export function MoveSpread({ values = [], threshold = 3, footer }) {
  const vals = values.filter((v) => Number.isFinite(v))
  if (vals.length < 8) return null
  const height = 190
  const padL = 40
  const padR = 14
  const padT = 14
  const padB = 32
  const reach = Math.max(threshold * 2, Math.ceil(Math.max(...vals.map(Math.abs)) * 2) / 2)
  const bins = 33
  const w = (2 * reach) / bins
  const counts = new Array(bins).fill(0)
  vals.forEach((v) => {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v + reach) / w)))
    counts[i] += 1
  })
  const top = Math.max(...counts, 1)
  const y = (c) => (height - padB) - (c / top) * (height - padT - padB)
  const beyond = vals.filter((v) => Math.abs(v) >= threshold).length
  const ticks = [-reach, -threshold, 0, threshold, reach]

  return (
    <Frame
      title="⚡ Where tonight's moves actually sit"
      sub={`every price with a second snapshot · ${beyond} of ${vals.length} moved ${threshold}+ points from open`}
      height={height}
      footer={footer}
    >
      {(W) => {
        const x = (v) => padL + ((v + reach) / (2 * reach)) * (W - padL - padR)
        return (
          <>
            {counts.map((c, i) => {
              const v0 = -reach + i * w
              const mid = v0 + w / 2
              const ink = Math.abs(mid) >= threshold ? verdictInk(mid > 0).color : C.text3
              return (
                <rect key={i} x={x(v0) + 0.6} y={y(c)} width={Math.max(1, x(v0 + w) - x(v0) - 1.2)} height={Math.max(0, (height - padB) - y(c))}
                  fill={ink} opacity={Math.abs(mid) >= threshold ? 0.65 : 0.3}>
                  <title>{c} price{c === 1 ? '' : 's'} moved {v0.toFixed(1)} to {(v0 + w).toFixed(1)} points</title>
                </rect>
              )
            })}
            <line x1={padL} x2={W - padR} y1={height - padB} y2={height - padB} stroke={C.border2} />
            {[-threshold, threshold].map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={padT - 4} y2={height - padB} stroke={C.yellow} strokeDasharray="3 3" opacity="0.7" />
            ))}
            <line x1={x(0)} x2={x(0)} y1={padT - 4} y2={height - padB} stroke={C.border2} />
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={height - padB + 14} textAnchor="middle" {...AX}>{t > 0 ? `+${t}` : t}</text>
            ))}
            <text x={(W + padL) / 2} y={height - 3} textAnchor="middle" style={{ ...AX, fontSize: 8 }}>break-even points moved since the line opened</text>
            <text x={padL - 6} y={y(top) + 3} textAnchor="end" {...AX}>{top}</text>
            <text x={padL - 6} y={height - padB} textAnchor="end" {...AX}>0</text>
          </>
        )
      }}
    </Frame>
  )
}
