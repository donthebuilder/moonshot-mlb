'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { ORANGE_RAMP, rampColor, inkFor } from './Heatmap'

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
    return { d, name, v, color: ORANGE_RAMP[Math.max(1, ORANGE_RAMP.length - 1 - i)] }
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

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: 'grid', gap: 14, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        <Panel title="Command / swing profile">
          <Row label="Meatball %" value={pct(n(src('pitcher_meatball_pct'), null))} tone={C.orange} />
          <Row label="Whiff %" value={pct(n(src('pitcher_whiff_pct'), null))} />
          <Row label="SwStr %" value={pct(n(src('pitcher_swstr_pct'), null))} />
          <Row label="Putaway %" value={pct(n(src('pitcher_putaway_pct'), null))} />
          <Row label="1st-pitch strike %" value={pct(n(src('pitcher_first_pitch_strike_pct'), null))} />
          <Row
            label="Spot damage"
            value={`${num(n(src('pitcher_spot_damage_score'), null), 0)} (${clean(src('pitcher_spot_damage_label'), '—')})`}
          />
          <Row
            label="Zone damage"
            value={`${num(n(src('pitcher_zone_damage_score'), null), 0)} (${clean(src('pitcher_zone_damage_label'), '—')})`}
          />
        </Panel>

        <Panel title="Platoon splits">
          <Row
            label="Weak side"
            value={weakSide || 'none published'}
            tone={weakSide ? C.orange : C.text3}
          />
          <Row label="HR/9 vs LHB" value={num(hr9L)} tone={gapTone(hr9L, hr9R)} />
          <Row label="HR/9 vs RHB" value={num(hr9R)} tone={gapTone(hr9R, hr9L)} />
          <Row
            label="HR vs LHB / RHB"
            value={`${num(n(src('pitcher_hr_vs_lhb'), null), 0)} / ${num(n(src('pitcher_hr_vs_rhb'), null), 0)}`}
          />
          <Row
            label="XBH vs LHB / RHB"
            value={`${num(n(src('pitcher_xbh_vs_lhb'), null), 0)} / ${num(n(src('pitcher_xbh_vs_rhb'), null), 0)}`}
          />
          <Row
            label="WHIP vs LHB / RHB"
            value={`${num(n(src('pitcher_whip_vs_lhb'), null))} / ${num(n(src('pitcher_whip_vs_rhb'), null))}`}
          />
          <Row
            label="Side SLG / OPS"
            value={`${num(n(src('pitcher_side_slug'), null), 3)} / ${num(n(src('pitcher_side_ops'), null), 3)}`}
          />
          <Row label="Mix vs LHB" value={clean(src('pitcher_primary_mix_vs_lhb'), '—')} />
          <Row label="Mix vs RHB" value={clean(src('pitcher_primary_mix_vs_rhb'), '—')} />
        </Panel>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: C.text2, marginBottom: 6 }}>
        Arsenal
        <span style={{ color: C.text3, fontWeight: 600, marginLeft: 6, fontFamily: NUM_FONT }}>
          {clean(src('pitcher_primary_mix'), '')}
        </span>
      </div>
      <Arsenal usage={src('pitcher_pitch_usage_pct')} />
    </div>
  )
}
