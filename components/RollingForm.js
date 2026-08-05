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

const COLORS = { HR: '#f97316', TOP: '#FCD34D', HIT: '#a78bfa', HRR: '#22d3ee', CONTACT: '#4ade80' }
const CATS = Object.keys(COLORS)

export default function RollingForm() {
  const [data, setData] = useState(null)

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

  if (!data || !series) return null

  const W = 720, H = 170, PAD = { l: 38, r: 8, t: 8, b: 18 }
  const nPts = data.days.length
  const x = (i) => PAD.l + (i / Math.max(1, nPts - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b)
  const path = (pts) => {
    let d = '', started = false
    pts.forEach((p, i) => {
      if (p.rate == null) { started = false; return }
      d += `${started ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.rate).toFixed(1)} `
      started = true
    })
    return d
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>📈 Rolling form</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          trailing 7-entry did-its-job rate per category
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {CATS.map((c) => (
            <span key={c} style={{ fontSize: 9, fontWeight: 800, color: COLORS[c], fontFamily: NUM_FONT }}>{c}</span>
          ))}
        </span>
      </div>
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px 4px 0' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#27272a" strokeWidth="0.6" />
              <text x={PAD.l - 5} y={y(v) + 3} textAnchor="end" fill="#71717a" fontSize="8.5" fontFamily="monospace">{v}%</text>
            </g>
          ))}
          {CATS.map((c) => (
            <path key={c} d={path(series[c])} fill="none" stroke={COLORS[c]} strokeWidth="1.6" opacity="0.85" />
          ))}
          {[0, Math.floor((nPts - 1) / 2), nPts - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fill="#71717a" fontSize="8.5" fontFamily="monospace">
              {data.days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        Each point is that category&apos;s success rate over its previous seven graded entries — gaps
        mean the window had under 8 picks, which is too thin to plot honestly. These windows swing
        ±15 points on pure variance; read for sustained drift, not day-to-day panic.
      </div>
    </div>
  )
}
