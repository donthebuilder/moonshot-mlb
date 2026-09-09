'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// ROLLING FORM — is the model hot or cold RIGHT NOW.
//
// The Backtest shows lifetime numbers; nothing showed the trend. This is each
// category's did-its-job rate over a trailing 7-day window, walked across the
// archive, so "HIT picks have cooled off this week" is visible instead of
// buried inside a season average. Same snapshot the P/L simulator uses.
//
// 7-day windows on 10-30 picks per category are NOISY — the bands here swing
// ±15 points on real variance alone. The chart is for spotting sustained
// drift, not day-to-day panic, and the caption says so.
//
// REDESIGN 2026-08-09 (owner: "okay but I don't like it, use a cooler chart
// style"). The old version was five hairlines on a grey grid — technically
// correct, visually inert, and you could not tell where any line ENDED, which
// is the only value on the chart you actually act on. Now:
//   · a soft category-coloured gradient fills under each line, so the lanes
//     read as shapes rather than as five overlapping wires;
//   · the current value gets a fat ringed dot and a labelled pill at the right
//     edge, de-collided so two categories at the same rate stay readable;
//   · the legend chips toggle categories off, because five lanes at once is
//     the honest default but rarely the one you want;
//   · the grid went darker and dashed so the data sits on top of it.
// Nothing about the underlying numbers or the variance caption changed.

const COLORS = { HR: '#f97316', TOP: '#FCD34D', HIT: '#a78bfa', HRR: '#22d3ee', CONTACT: '#4ade80' }
const CATS = Object.keys(COLORS)

export default function RollingForm() {
  const [data, setData] = useState(null)
  // Categories switched OFF. Empty by default: all five shown, same as before.
  const [hidden, setHidden] = useState(() => new Set())
  // Legend hover just emphasises — it never hides, so a hover can't make you
  // misread the chart as having fewer lanes than it does.
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/pick_pl.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setData(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const series = useMemo(() => {
    if (!data) return null
    const days = data.days
    const out = {}
    CATS.forEach((cat) => {
      out[cat] = days.map((_, i) => {
        // trailing 7 calendar entries (the archive has gaps; entries, not days)
        const win = days.slice(Math.max(0, i - 6), i + 1)
        let n = 0, ok = 0
        win.forEach((d) => { const c = d.cats[cat]; if (c) { n += c.n; ok += c.ok } })
        return { date: days[i].date, rate: n >= 8 ? (100 * ok) / n : null, n }
      })
    })
    return out
  }, [data])

  const toggle = (cat) => setHidden((s) => {
    const next = new Set(s)
    if (next.has(cat)) next.delete(cat)
    else if (next.size < CATS.length - 1) next.add(cat)   // never hide the last one
    return next
  })

  if (!data || !series) return null

  // Right padding carries the end labels, so it's wide now.
  const W = 720, H = 190, PAD = { l: 38, r: 54, t: 10, b: 20 }
  const nPts = data.days.length
  const x = (i) => PAD.l + (i / Math.max(1, nPts - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b)
  const baseY = y(0)

  // Split a category into contiguous runs of plotted points. A gap is a window
  // that had under 8 picks — the area must NOT bridge it, or the fill invents
  // form on nights the model didn't have enough sample to grade.
  const segmentsOf = (pts) => {
    const segs = []
    let cur = []
    pts.forEach((p, i) => {
      if (p.rate == null) { if (cur.length) segs.push(cur); cur = []; return }
      cur.push({ i, ...p })
    })
    if (cur.length) segs.push(cur)
    return segs
  }
  const linePath = (seg) => seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ')
  const areaPath = (seg) => {
    if (seg.length < 2) return ''
    return `${linePath(seg)} L${x(seg[seg.length - 1].i).toFixed(1)},${baseY.toFixed(1)} `
      + `L${x(seg[0].i).toFixed(1)},${baseY.toFixed(1)} Z`
  }

  const visible = CATS.filter((c) => !hidden.has(c))

  // END LABELS — the current value of every visible lane, pushed apart so two
  // categories sitting on the same rate don't print on top of each other.
  const ends = visible.map((cat) => {
    const pts = series[cat]
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].rate != null) return { cat, i, rate: pts[i].rate, n: pts[i].n, y: y(pts[i].rate) }
    }
    return null
  }).filter(Boolean).sort((a, b) => a.y - b.y)
  const MIN_GAP = 12
  ends.forEach((e, k) => {
    e.ly = k === 0 ? e.y : Math.max(e.y, ends[k - 1].ly + MIN_GAP)
  })
  // If the stack ran off the bottom, slide the whole thing back up.
  const overflow = ends.length ? Math.max(0, ends[ends.length - 1].ly - (H - PAD.b)) : 0
  if (overflow > 0) ends.forEach((e) => { e.ly -= overflow })

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>📈 Rolling form</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          trailing 7-entry did-its-job rate per category
        </span>
        {/* LEGEND = FILTER. Clicking a chip drops that lane out of the chart. */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CATS.map((c) => {
            const on = !hidden.has(c)
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                onMouseEnter={() => setFocus(c)}
                onMouseLeave={() => setFocus(null)}
                title={on ? `Hide ${c} — click again to bring it back` : `Show ${c}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                  fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.05em',
                  border: `1px solid ${on ? `${COLORS[c]}66` : C.border}`,
                  background: on ? `${COLORS[c]}16` : 'transparent',
                  color: on ? COLORS[c] : C.text3,
                  opacity: on ? 1 : 0.55,
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: 2,
                  background: on ? COLORS[c] : C.border, flexShrink: 0,
                }} />
                {c}
              </button>
            )
          })}
        </span>
      </div>

      <div style={{
        background: `linear-gradient(180deg, #0d0d10, ${C.bg2})`,
        border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px 4px 0',
      }}>
        {/* rf-chart: this one has the opposite phone problem to the others —
            a 720×190 viewBox scaled to a 350px screen is 92px tall, and five
            lanes plus their end labels inside 92px is a smear. The phone rule
            gives it a floor instead of a cap. */}
        <svg className="rf-chart" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          <defs>
            {CATS.map((c) => (
              <linearGradient key={c} id={`rf-fill-${c}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[c]} stopOpacity="0.30" />
                <stop offset="60%" stopColor={COLORS[c]} stopOpacity="0.07" />
                <stop offset="100%" stopColor={COLORS[c]} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* grid — darker and dashed, so it sits UNDER the data instead of
              competing with it. The 50% rule is solid: it's the reference
              line the eye actually uses. */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
                stroke={v === 50 ? '#2a2a30' : '#1b1b20'}
                strokeWidth={v === 50 ? 1 : 0.8}
                strokeDasharray={v === 50 ? '' : '3 4'}
              />
              <text x={PAD.l - 5} y={y(v) + 3} textAnchor="end" fill="#6b6b74" fontSize="8.5" fontFamily="monospace">{v}%</text>
            </g>
          ))}

          {/* areas first, then lines, so no fill ever paints over a line */}
          {visible.map((c) => {
            const dim = focus && focus !== c
            return segmentsOf(series[c]).map((seg, si) => (
              <path
                key={`a-${c}-${si}`}
                d={areaPath(seg)}
                fill={`url(#rf-fill-${c})`}
                opacity={dim ? 0.18 : 1}
                style={{ transition: 'opacity .15s' }}
              />
            ))
          })}
          {visible.map((c) => {
            const dim = focus && focus !== c
            return segmentsOf(series[c]).map((seg, si) => (
              <path
                key={`l-${c}-${si}`}
                d={linePath(seg)}
                fill="none"
                stroke={COLORS[c]}
                strokeWidth={focus === c ? 2.6 : 1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dim ? 0.25 : 0.95}
                style={{ transition: 'opacity .15s, stroke-width .15s' }}
              />
            ))
          })}

          {/* CURRENT VALUE — the number you actually act on. Fat ringed dot on
              the last plotted point, and the value spelled out at the right
              edge with a leader line back to the dot. */}
          {ends.map((e) => {
            const dim = focus && focus !== e.cat
            const col = COLORS[e.cat]
            const lx = W - PAD.r + 4
            return (
              <g key={`e-${e.cat}`} opacity={dim ? 0.25 : 1} style={{ transition: 'opacity .15s' }}>
                {Math.abs(e.ly - e.y) > 1 && (
                  <line x1={x(e.i)} y1={e.y} x2={lx - 2} y2={e.ly} stroke={col} strokeWidth="0.7" opacity="0.4" />
                )}
                <circle cx={x(e.i)} cy={e.y} r="6.5" fill={col} opacity="0.16" />
                <circle cx={x(e.i)} cy={e.y} r="3.6" fill={col} stroke="#0d0d10" strokeWidth="1.4">
                  <title>{e.cat} — {e.rate.toFixed(0)}% over the last 7 graded entries (n={e.n})</title>
                </circle>
                <text
                  x={lx} y={e.ly + 3.2}
                  fill={col} fontSize="10.5" fontWeight="900" fontFamily="monospace"
                >{e.rate.toFixed(0)}%</text>
              </g>
            )
          })}

          {[0, Math.floor((nPts - 1) / 2), nPts - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fill="#6b6b74" fontSize="8.5" fontFamily="monospace">
              {data.days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        Each point is that category&apos;s success rate over its previous seven graded entries — gaps
        mean the window had under 8 picks, which is too thin to plot honestly, and the shaded area
        breaks at those gaps rather than bridging them. The labelled dots on the right are each
        lane&apos;s current value. These windows swing ±15 points on pure variance; read for sustained
        drift, not day-to-day panic. Click a category chip to drop that lane out of the chart.
      </div>
    </div>
  )
}
