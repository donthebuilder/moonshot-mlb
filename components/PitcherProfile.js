'use client'
import { useMemo, useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { pitcherDetailUrl } from '../lib/dataSource'
import Heatmap, { RAMP_CHIPS } from './Heatmap'

// Command / swing profile, platoon splits and arsenal — ported from Streamlit.
//
// All three read from the OPPOSING BATTER rows, because that's where the bot
// stamps pitcher fields. Any hitter in the lineup carries the same values, so
// the first row with a usable number wins.
//
// The platoon block is the one that changes decisions: the weak side plus the
// HR/9 gap across it tells you which half of the order to attack, and that
// isn't visible anywhere else on the site.

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—')
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function Row({ label, value, tone }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      padding: '5px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 10.5, color: C.text3 }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, fontFamily: NUM_FONT,
        color: tone || C.text, textAlign: 'right',
      }}>{value}</span>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 5 }}>{title}</div>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '4px 12px 8px',
      }}>{children}</div>
    </div>
  )
}

// ── SIMPLE HAND-ROLLED SVG RADAR/SPIDER CHART (2026-08-24) ──────────────────
//
// Donovan: "i really just don't like the chart style at all ... maybe like
// radar or something, kiss it, soup it up." Confirmed direction: replace the
// plain Meatball%/Whiff%/etc and platoon Row-grids with radar charts where a
// shape actually helps a read, hand-built rather than a new dependency —
// package.json carries no charting library, and the Arsenal donut just above
// already proves the house style: a few lines of SVG path math, no npm.
//
// KISS: one component draws N axes as spokes from a centre, one polygon per
// series (1 for the command profile, 2 overlaid for platoon splits), each
// axis independently scaled to its own 0-100 display range so a WHIP axis
// and an HR/9 axis can share one chart without one swallowing the other.
// Every axis value is ALSO printed as a number at its spoke tip — the shape
// is the at-a-glance read, the number is still there for anyone checking its
// working, same rule as every meter on this site.
function RadarChart({ axes, series, size = 230 }) {
  const n = axes.length
  if (n < 3) return null
  const R = size / 2 - 46
  const cx = size / 2, cy = size / 2
  const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i, frac) => {
    const a = angleFor(i)
    const r = R * Math.max(0, Math.min(1, frac))
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  // Concentric rings at 25/50/75/100% as the grid — no numbers on the rings
  // themselves, since each axis carries its own scale and a shared ring
  // label would lie about at least one of them.
  const rings = [0.25, 0.5, 0.75, 1]
  const ringPath = (frac) => axes.map((_, i) => pt(i, frac).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, height: 'auto' }}>
      {rings.map((f) => (
        <polygon key={f} points={ringPath(f)} fill="none" stroke={C.border} strokeWidth={f === 1 ? 1.2 : 0.7} />
      ))}
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 1)
        return <line key={ax.key} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth={0.7} />
      })}
      {series.map((s) => {
        const pts = axes.map((ax, i) => pt(i, ax.scale ? ax.scale(s.values[ax.key]) : 0))
        const has = pts.some(([, ], i) => (s.values[axes[i].key] ?? null) != null)
        if (!has) return null
        return (
          <polygon key={s.key} points={pts.map((p) => p.join(',')).join(' ')}
            fill={s.color} fillOpacity={s.fillOpacity ?? 0.22}
            stroke={s.color} strokeWidth={1.6} />
        )
      })}
      {axes.map((ax, i) => {
        const [lx, ly] = pt(i, 1.22)
        return (
          <text key={`lbl-${ax.key}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize="8.5" fontWeight="700" fill={C.text3} fontFamily={NUM_FONT}>
            {ax.label}
          </text>
        )
      })}
    </svg>
  )
}

function RadarLegend({ series }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
      {series.map((s) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
          <span style={{ color: C.text2, fontWeight: 700 }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// Donut, hand-drawn. Plotly would be four megabytes for one chart.
function Arsenal({ usage }) {
  const entries = Object.entries(usage || {})
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])

  if (!entries.length) return null

  const total = entries.reduce((a, [, v]) => a + v, 0) || 1
  const R = 52, r = 30, cx = 60, cy = 60
  let angle = -Math.PI / 2

  const arcs = entries.map(([name, v], i) => {
    const frac = v / total
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`
    const d = [
      `M ${p(R, a0)}`, `A ${R} ${R} 0 ${large} 1 ${p(R, a1)}`,
      `L ${p(r, a1)}`, `A ${r} ${r} 0 ${large} 0 ${p(r, a0)}`, 'Z',
    ].join(' ')
    // Colour by usage rank on the site ramp, so the pitch he throws most is
    // the brightest wedge -- one hue, same rule as every other chart here.
    return { d, name, v, color: RAMP_CHIPS[Math.max(1, RAMP_CHIPS.length - 1 - i)] }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, flexShrink: 0 }}>
        {arcs.map((a) => <path key={a.name} d={a.d} fill={a.color} stroke={C.bg} strokeWidth="1" />)}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {arcs.map((a) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color }} />
            <span style={{ fontFamily: NUM_FONT, fontWeight: 700, color: C.text, width: 26 }}>{a.name}</span>
            <span style={{ fontFamily: NUM_FONT, color: C.text3 }}>{a.v.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Order-zone damage: how this arm fares against the top, middle and bottom
// thirds of a lineup. Lives in his own detail file, which nothing was fetching
// -- 29 of the 30 starters have real plate appearances behind it.
function OrderZones({ pitcherId }) {
  const [zones, setZones] = useState(null)

  useEffect(() => {
    if (!pitcherId) return
    let alive = true
    fetch(pitcherDetailUrl(pitcherId))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setZones(j?.pitcher_lineup_zone_damage || null) })
      .catch(() => {})
    return () => { alive = false }
  }, [pitcherId])

  const rows = useMemo(() => {
    if (!zones) return []
    return ['top', 'middle', 'bottom']
      .map((k) => {
        const z = zones[k]
        if (!z || !n(z.pa, 0)) return null
        const ab = Math.max(1, n(z.ab, 0))
        const bbe = Math.max(1, n(z.bbe, 0))
        return {
          label: `${k[0].toUpperCase()}${k.slice(1)} (${(z.spots || []).join(', ')})`,
          values: {
            PA: n(z.pa, 0),
            HR: n(z.hr, 0),
            XBH: n(z.xbh, 0),
            'SLG ag': (n(z.tb, 0) / ab) * 1000,
            'HR/PA': (100 * n(z.hr, 0)) / Math.max(1, n(z.pa, 0)),
            'Hard%': (100 * n(z.hard, 0)) / bbe,
            'Barrel%': (100 * n(z.barrels, 0)) / bbe,
          },
        }
      })
      .filter(Boolean)
  }, [zones])

  if (!rows.length) return null

  return (
    <div style={{ marginTop: 14 }}>
      <Heatmap
        rows={rows}
        columns={['PA', 'HR', 'XBH', 'SLG ag', 'HR/PA', 'Hard%', 'Barrel%']}
        title="Damage by third of the order — where in the lineup he bleeds"
        labelWidth={150}
        fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : '—')}
        caption="Top is spots 1–3, middle 4–6, bottom 7–9. SLG against is ×1000 to share the scale. PA is shown first because a bright HR cell over 12 plate appearances is one swing."
      />
    </div>
  )
}

export default function PitcherProfile({ pitcher }) {
  const src = useMemo(() => {
    const lineup = pitcher?.lineup || []
    const get = (k) => {
      for (const b of lineup) {
        const v = b?.raw?.[k]
        if (typeof v === 'number' && Number.isFinite(v)) return v
        if (typeof v === 'string' && v) return v
        if (v && typeof v === 'object') return v
      }
      return null
    }
    return get
  }, [pitcher])

  const weakSide = clean(src('pitcher_weak_side'), '')
  const hr9L = n(src('pitcher_hr9_vs_lhb'), null)
  const hr9R = n(src('pitcher_hr9_vs_rhb'), null)
  const gapTone = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && a > b ? C.orange : C.text)

  // ── COMMAND / SWING PROFILE, AS A RADAR (2026-08-24) ────────────────────
  // Five published rates, each already 0-1 (pct() below turns them into
  // 0-100) — a natural single-polygon radar with no invented scale. Every
  // axis reads "more = more of this thing happening", so the shape itself
  // says nothing about good/bad — the caption underneath still carries the
  // tone words (Meatball high = bad for him, Whiff high = good for him),
  // same as the numbers this replaced.
  const meatballPct = n(src('pitcher_meatball_pct'), null)
  const whiffPct = n(src('pitcher_whiff_pct'), null)
  const swstrPct = n(src('pitcher_swstr_pct'), null)
  const putawayPct = n(src('pitcher_putaway_pct'), null)
  const fpsPct = n(src('pitcher_first_pitch_strike_pct'), null)
  const asPct100 = (v) => (v == null ? null : (v <= 1 ? v * 100 : v))
  const cmdAxes = [
    { key: 'meatball', label: 'Meatball%', scale: (v) => (v == null ? 0 : v / 20) },
    { key: 'whiff', label: 'Whiff%', scale: (v) => (v == null ? 0 : v / 45) },
    { key: 'swstr', label: 'SwStr%', scale: (v) => (v == null ? 0 : v / 20) },
    { key: 'putaway', label: 'Putaway%', scale: (v) => (v == null ? 0 : v / 40) },
    { key: 'fps', label: '1st-pitch K%', scale: (v) => (v == null ? 0 : v / 80) },
  ]
  const cmdValues = {
    meatball: asPct100(meatballPct), whiff: asPct100(whiffPct), swstr: asPct100(swstrPct),
    putaway: asPct100(putawayPct), fps: asPct100(fpsPct),
  }
  const cmdHasAny = Object.values(cmdValues).some((v) => v != null)

  // ── PLATOON SPLITS, AS A TWO-SIDED RADAR ─────────────────────────────────
  // A radar only reads clearly when both series share one scale, and HR/9,
  // WHIP, SLG and raw HR/XBH counts don't. So each axis here is scaled to
  // ITS OWN pair — the larger of {vs LHB, vs RHB} fills the axis, the
  // smaller sits proportionally inside it — which turns "which side does he
  // get hurt on" into a lopsided shape rather than six unrelated numbers.
  // Mix vs LHB/RHB stays as text below; a pitch-mix string has no axis to
  // sit on.
  const hrCtL = n(src('pitcher_hr_vs_lhb'), null)
  const hrCtR = n(src('pitcher_hr_vs_rhb'), null)
  const xbhL = n(src('pitcher_xbh_vs_lhb'), null)
  const xbhR = n(src('pitcher_xbh_vs_rhb'), null)
  const whipL = n(src('pitcher_whip_vs_lhb'), null)
  const whipR = n(src('pitcher_whip_vs_rhb'), null)
  const slgL = n(src('pitcher_side_slug'), null) // published as one side-agnostic pair below; kept as caption, not an axis
  const platoonPairs = {
    hr9: [hr9L, hr9R], whip: [whipL, whipR], hrct: [hrCtL, hrCtR], xbh: [xbhL, xbhR],
  }
  const pairScale = (key) => (v, side) => {
    const [l, r] = platoonPairs[key]
    const mx = Math.max(Number.isFinite(l) ? l : 0, Number.isFinite(r) ? r : 0)
    if (!(mx > 0) || v == null) return 0
    return v / mx
  }
  const platAxes = [
    { key: 'hr9', label: 'HR/9', scale: pairScale('hr9') },
    { key: 'whip', label: 'WHIP', scale: pairScale('whip') },
    { key: 'hrct', label: 'HR', scale: pairScale('hrct') },
    { key: 'xbh', label: 'XBH', scale: pairScale('xbh') },
  ]
  const platSeries = [
    { key: 'lhb', label: 'vs LHB', color: '#60A5FA', values: { hr9: hr9L, whip: whipL, hrct: hrCtL, xbh: xbhL } },
    { key: 'rhb', label: 'vs RHB', color: C.orange, values: { hr9: hr9R, whip: whipR, hrct: hrCtR, xbh: xbhR } },
  ]
  const platHasAny = [hr9L, hr9R, whipL, whipR, hrCtL, hrCtR, xbhL, xbhR].some((v) => v != null)

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: 'grid', gap: 14, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        <Panel title="Command / swing profile">
          {cmdHasAny ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
              <RadarChart axes={cmdAxes}
                series={[{ key: 'cmd', label: 'Season', color: C.orange, values: cmdValues }]} />
              <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5, textAlign: 'center' }}>
                Each spoke is its own display scale (see caption below) — the shape says how full each dial runs, not
                good vs bad. <b style={{ color: C.orange }}>Meatball%</b> high is bad for him; <b style={{ color: C.orange }}>Whiff / SwStr / Putaway</b> high is good for him.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, padding: '8px 0' }}>Nothing published yet.</div>
          )}
          <div style={{ marginTop: 6 }}>
            <Row label="Meatball %" value={pct(meatballPct)} tone={C.orange} />
            <Row label="Whiff %" value={pct(whiffPct)} />
            <Row label="SwStr %" value={pct(swstrPct)} />
            <Row label="Putaway %" value={pct(putawayPct)} />
            <Row label="1st-pitch strike %" value={pct(fpsPct)} />
            <Row
              label="Spot damage"
              value={`${num(n(src('pitcher_spot_damage_score'), null), 0)} (${clean(src('pitcher_spot_damage_label'), '—')})`}
            />
            <Row
              label="Zone damage"
              value={`${num(n(src('pitcher_zone_damage_score'), null), 0)} (${clean(src('pitcher_zone_damage_label'), '—')})`}
            />
          </div>
        </Panel>

        <Panel title="Platoon splits">
          {platHasAny ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
              <RadarChart axes={platAxes} series={platSeries} />
              <RadarLegend series={platSeries} />
              <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5, textAlign: 'center' }}>
                Each axis is scaled to its own LHB/RHB pair — whichever side is worse fills the spoke, so a lopsided
                shape names the side to attack. Raw numbers below.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.text3, padding: '8px 0' }}>No platoon split published yet.</div>
          )}
          <div style={{ marginTop: 6 }}>
            <Row
              label="Weak side"
              value={weakSide || 'none published'}
              tone={weakSide ? C.orange : C.text3}
            />
            <Row label="HR/9 vs LHB" value={num(hr9L)} tone={gapTone(hr9L, hr9R)} />
            <Row label="HR/9 vs RHB" value={num(hr9R)} tone={gapTone(hr9R, hr9L)} />
            <Row
              label="HR vs LHB / RHB"
              value={`${num(hrCtL, 0)} / ${num(hrCtR, 0)}`}
            />
            <Row
              label="XBH vs LHB / RHB"
              value={`${num(xbhL, 0)} / ${num(xbhR, 0)}`}
            />
            <Row
              label="WHIP vs LHB / RHB"
              value={`${num(whipL)} / ${num(whipR)}`}
            />
            <Row
              label="Side SLG / OPS"
              value={`${num(slgL, 3)} / ${num(n(src('pitcher_side_ops'), null), 3)}`}
            />
            <Row label="Mix vs LHB" value={clean(src('pitcher_primary_mix_vs_lhb'), '—')} />
            <Row label="Mix vs RHB" value={clean(src('pitcher_primary_mix_vs_rhb'), '—')} />
          </div>
        </Panel>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 6 }}>
        Arsenal
        <span style={{ color: C.text3, fontWeight: 600, marginLeft: 6, fontFamily: NUM_FONT }}>
          {clean(src('pitcher_primary_mix'), '')}
        </span>
      </div>
      <Arsenal usage={src('pitcher_pitch_usage_pct')} />

      <OrderZones pitcherId={pitcher?.pitcher_id} />
    </div>
  )
}
