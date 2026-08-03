'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, arr, nameOf } from '../lib/player'
import { detailUrl } from '../lib/dataSource'
import { rampColor, inkFor } from './Heatmap'

// Spray field — radar, not a ballpark illustration.
//
// The chart this replaces drew a green outfield and grew to fill the viewport.
// Two problems: green is the one colour this site doesn't use, so the panel read
// as a foreign object; and at full-bleed size a dozen dots carried the same
// information they'd carry at a third the area, while pushing every number off
// screen. A spray chart is a small-multiple — it belongs beside the stats, not
// instead of them.
//
// So: fixed aspect, capped height, dark field, distance arcs instead of grass.
// Points sit on the site ramp — bright means hit hard.

const LANES = [
  { key: 'LF', a0: -45, a1: -15 },
  { key: 'CF', a0: -15, a1: 15 },
  { key: 'RF', a0: 15, a1: 45 },
]

// Statcast hit coordinates: origin at home plate, y increasing toward the
// outfield but inverted in screen space. 2.5 is the standard scale factor.
function toPolar(h) {
  const x = n(h?.hc_x, null)
  const y = n(h?.hc_y, null)
  if (x == null || y == null) return null
  const dx = x - 125.42
  const dy = 198.27 - y
  const dist = Math.sqrt(dx * dx + dy * dy) * 2.5
  const ang = Math.atan2(dx, dy) * (180 / Math.PI)
  return { dist, ang }
}

export default function SprayField({ player, height = 340 }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')
  const [only, setOnly] = useState('all')
  const [pitch, setPitch] = useState('all')
  const [hover, setHover] = useState(null)

  const pid = player?.player_id || player?.id

  useEffect(() => {
    if (!pid) return
    let alive = true
    setState('loading'); setData(null)
    fetch(detailUrl(pid))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState('done') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid])

  const hits = useMemo(() => {
    return arr(data?.spray_chart).map((h) => {
      const p = toPolar(h)
      if (!p || !Number.isFinite(p.dist)) return null
      return {
        ...p,
        hr: !!h?.is_hr,
        xbh: !!h?.is_xbh,
        hard: !!h?.is_hard_hit,
        ev: n(h?.ev, 0),
        la: n(h?.launch_angle, 0),
        dist: n(h?.distance, 0) || p.dist,
        ang: p.ang,
        pitch: clean(h?.pitch_type, ''),
        date: clean(h?.date, ''),
        result: clean(h?.result, ''),
      }
    }).filter(Boolean)
  }, [data])

  // Result classes carry their own share, PropFinder-style.
  const classes = useMemo(() => {
    const t = hits.length || 1
    const of = (f) => hits.filter(f).length
    return [
      { k: 'all',  label: 'All',   n: hits.length,            col: C.text2 },
      { k: 'hr',   label: 'HR',    n: of((h) => h.hr),        col: C.orange },
      { k: 'xbh',  label: 'XBH',   n: of((h) => h.xbh && !h.hr), col: '#fb9d3a' },
      { k: 'hard', label: 'Hard',  n: of((h) => h.hard),      col: '#d76b0d' },
      { k: 'out',  label: 'Out',   n: of((h) => !h.xbh && !h.hr), col: C.text3 },
    ].map((c) => ({ ...c, pct: (100 * c.n) / t }))
  }, [hits])

  const pitches = useMemo(() => {
    const by = new Map()
    hits.forEach((h) => {
      if (!h.pitch) return
      by.set(h.pitch, (by.get(h.pitch) || 0) + 1)
    })
    const t = hits.length || 1
    return [...by.entries()]
      .map(([k, v]) => ({ k, n: v, pct: (100 * v) / t, hr: hits.filter((h) => h.pitch === k && h.hr).length }))
      .sort((a, b) => b.n - a.n)
  }, [hits])

  const shown = useMemo(() => hits.filter((h) => {
    const okClass = only === 'all' ? true
      : only === 'hr' ? h.hr
      : only === 'xbh' ? (h.xbh && !h.hr)
      : only === 'hard' ? h.hard
      : !h.xbh && !h.hr
    return okClass && (pitch === 'all' || h.pitch === pitch)
  }), [hits, only, pitch])

  if (!pid) return null
  if (state === 'loading') {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading batted balls…</div>
  }
  if (!hits.length) {
    return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>No tracked batted balls for this hitter.</div>
  }

  // Fixed 450ft field. Scaling to the longest ball would make every hitter's
  // chart a different scale and quietly destroy comparability between players.
  const R = 450
  const W = 320, H = 300
  const cx = W / 2, cy = H - 18
  const scale = (cy - 14) / R
  const pt = (dist, ang) => {
    const rad = (ang * Math.PI) / 180
    return [cx + Math.sin(rad) * dist * scale, cy - Math.cos(rad) * dist * scale]
  }
  const maxEV = Math.max(...hits.map((h) => h.ev), 100)

  const laneCounts = LANES.map((l) => ({
    ...l,
    n: hits.filter((h) => h.ang >= l.a0 && h.ang < l.a1).length,
    hr: hits.filter((h) => h.hr && h.ang >= l.a0 && h.ang < l.a1).length,
  }))

  return (
    <div>
      {/* Result chips: label, count and share on the chip itself. Click to
          filter. No separate legend to fall out of step with the chart. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
        {classes.map((c) => {
          const on = only === c.k
          return (
            <button
              key={c.k}
              onClick={() => setOnly(c.k)}
              disabled={c.n === 0}
              style={{
                padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6,
                cursor: c.n ? 'pointer' : 'default', fontFamily: NUM_FONT,
                opacity: c.n ? 1 : 0.35,
                border: `1px solid ${on ? c.col : C.border}`,
                background: on ? `${c.col}22` : 'transparent',
                color: on ? c.col : C.text3,
              }}
            >
              <span style={{ color: on ? c.col : C.text2 }}>{c.label}</span>{' '}
              {c.n}
              <span style={{ opacity: 0.65 }}> · {c.pct.toFixed(0)}%</span>
            </button>
          )
        })}
      </div>

      {/* Pitch chips. This is the question the panel exists for: does he only
          do damage against one pitch, and does tonight's arm throw it? */}
      {pitches.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Pitch</span>
          <button
            onClick={() => setPitch('all')}
            style={{
              padding: '2px 8px', fontSize: 9.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
              fontFamily: NUM_FONT,
              border: `1px solid ${pitch === 'all' ? C.orange : C.border}`,
              background: pitch === 'all' ? 'rgba(249,115,22,.12)' : 'transparent',
              color: pitch === 'all' ? C.orange : C.text3,
            }}
          >All</button>
          {pitches.map((p) => {
            const on = pitch === p.k
            return (
              <button
                key={p.k}
                onClick={() => setPitch(on ? 'all' : p.k)}
                title={`${p.n} batted balls · ${p.hr} HR`}
                style={{
                  padding: '2px 8px', fontSize: 9.5, fontWeight: 700, borderRadius: 5,
                  cursor: 'pointer', fontFamily: NUM_FONT,
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                  color: on ? C.orange : C.text3,
                }}
              >
                {p.k} <span style={{ opacity: 0.65 }}>{p.pct.toFixed(0)}%</span>
                {p.hr > 0 && <span style={{ color: C.orange }}> {p.hr}HR</span>}
              </button>
            )
          })}
        </div>
      )}

      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start',
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10,
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 340, height, flexShrink: 0 }}>
          {/* distance arcs instead of grass */}
          {[150, 250, 350, 450].map((d) => {
            const [lx, ly] = pt(d, -45)
            const [rx, ry] = pt(d, 45)
            return (
              <g key={d}>
                <path
                  d={`M ${lx} ${ly} A ${d * scale} ${d * scale} 0 0 1 ${rx} ${ry}`}
                  fill="none" stroke={C.border} strokeWidth="1"
                />
                <text x={cx} y={pt(d, 0)[1] + 9} fill={C.text3} fontSize="7"
                  fontFamily={NUM_FONT} textAnchor="middle">{d}</text>
              </g>
            )
          })}
          {/* foul lines */}
          {[-45, 45].map((a) => {
            const [x, y] = pt(R, a)
            return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border2} strokeWidth="1" />
          })}
          {/* lane dividers */}
          {[-15, 15].map((a) => {
            const [x, y] = pt(R, a)
            return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth="0.5" strokeDasharray="2 4" />
          })}

          {shown.map((h, i) => {
            const [x, y] = pt(Math.min(h.dist, R), h.ang)
            const col = rampColor(h.ev, 70, maxEV) || C.text3
            const on = hover === i
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <circle
                  cx={x} cy={y} r={h.hr ? 5 : h.xbh ? 3.6 : 2.6}
                  fill={h.hr ? col : 'none'}
                  stroke={col}
                  strokeWidth={h.hr ? 1.2 : 1.4}
                  opacity={on ? 1 : h.hr ? 0.95 : 0.62}
                />
                {h.hr && <circle cx={x} cy={y} r="8" fill="none" stroke={col} strokeWidth="0.6" opacity={on ? 0.9 : 0.35} />}
              </g>
            )
          })}
          {/* Park dimensions, so the arcs mean something for this venue rather
              than being abstract rings. */}
          {[[-45, '330'], [0, '400'], [45, '330']].map(([a, d]) => {
            const [x, y] = pt(Number(d) + 24, Number(a))
            return (
              <text key={a} x={x} y={y} fill={C.text3} fontSize="7.5" fontFamily={NUM_FONT}
                textAnchor="middle" opacity="0.7">{d}&apos;</text>
            )
          })}
          <circle cx={cx} cy={cy} r="2.5" fill={C.text3} />
        </svg>

        <div style={{ flex: 1, minWidth: 150 }}>
          {hover != null && shown[hover] ? (
            <div style={{ fontFamily: NUM_FONT, fontSize: 10.5, lineHeight: 1.7 }}>
              <div style={{ color: C.orange, fontWeight: 800, fontSize: 11 }}>
                {shown[hover].hr ? 'HOME RUN' : shown[hover].result.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style={{ color: C.text2 }}>{shown[hover].dist.toFixed(0)} ft · {shown[hover].ev.toFixed(1)} mph · {shown[hover].la.toFixed(0)}°</div>
              <div style={{ color: C.text3 }}>{shown[hover].pitch} · {shown[hover].date}</div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
              Hover a ball for pitch, exit velo and distance.
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {laneCounts.map((l) => {
              const pctv = hits.length ? (100 * l.n) / hits.length : 0
              const bg = rampColor(pctv, 0, 60)
              return (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <span style={{ width: 20, color: C.text3, fontFamily: NUM_FONT }}>{l.key}</span>
                  <div style={{ flex: 1, height: 11, background: C.bg3, borderRadius: 2 }}>
                    <div style={{ width: `${Math.max(3, pctv)}%`, height: '100%', background: bg, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: NUM_FONT, color: C.text2, minWidth: 46, textAlign: 'right' }}>
                    {pctv.toFixed(0)}%{l.hr > 0 && <span style={{ color: C.orange }}> {l.hr}HR</span>}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: 9, color: C.text3, marginTop: 9, lineHeight: 1.55 }}>
            Filled rings are home runs. Brightness is exit velocity, not distance — a scorched
            line drive reads hot even when it stayed in the park. The field is fixed at 450 ft for
            every hitter, so two players are directly comparable.
          </div>
        </div>
      </div>
    </div>
  )
}
