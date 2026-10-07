'use client'
import { useMemo, useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { fetchPitcherDetail } from '../lib/dataSource'
import DenseTable from './DenseTable'

// COMMAND + SPLITS, REBUILT (2026-10-07, Donovan: the tab was half-hidden). Four DenseTables (skin v2,
// columns in groups), real published fields only: his command rates, the platoon split (one row a
// side), his arsenal, and his damage by third of the order. The gauges, the tug-of-war bars and the
// donut are gone: the same numbers, one row each, every column its own standout ramp.
// Everything reads from the OPPOSING BATTER rows, because that is where the bot stamps pitcher fields;
// any hitter in the lineup carries the same values, so the first row with a usable number wins.

const asPct100 = (v) => (v == null ? null : (v <= 1 ? v * 100 : v))

function Block({ title, note, children }) {
  return (
    <div style={{ marginBottom: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{title}</span>
        {note && <span style={{ fontSize: 11, color: C.text3 }}>{note}</span>}
      </div>
      {children}
    </div>
  )
}

function OrderZones({ pitcherId }) {
  const [zones, setZones] = useState(null)
  useEffect(() => {
    if (!pitcherId) return undefined
    let alive = true
    fetchPitcherDetail(pitcherId).then(({ data }) => { if (alive) setZones(data?.pitcher_lineup_zone_damage || null) })
    return () => { alive = false }
  }, [pitcherId])
  const rows = useMemo(() => {
    if (!zones) return []
    return ['top', 'middle', 'bottom'].map((k) => {
      const z = zones[k]
      if (!z || !n(z.pa, 0)) return null
      const ab = Math.max(1, n(z.ab, 0))
      const bbe = Math.max(1, n(z.bbe, 0))
      return {
        key: k, third: `${k[0].toUpperCase()}${k.slice(1)} (${(z.spots || []).join(', ')})`,
        pa: n(z.pa, 0), hr: n(z.hr, 0), xbh: n(z.xbh, 0),
        slg: n(z.tb, 0) / ab, hrpa: (100 * n(z.hr, 0)) / Math.max(1, n(z.pa, 0)),
        hard: (100 * n(z.hard, 0)) / bbe, brl: (100 * n(z.barrels, 0)) / bbe,
      }
    }).filter(Boolean)
  }, [zones])
  if (!rows.length) return null
  const cols = [
    { key: 'third', label: 'Third', group: 'Spots', w: 112, heat: false, sticky: true, bold: true },
    { key: 'pa', label: 'PA', group: 'Volume', w: 38, dp: 0, heat: false, title: 'Plate appearances behind the row: a bright HR cell over a dozen PA is one swing.' },
    { key: 'hr', label: 'HR', group: 'Volume', w: 36, dp: 0 },
    { key: 'xbh', label: 'XBH', group: 'Volume', w: 40, dp: 0 },
    { key: 'slg', label: 'SLG ag', group: 'Damage', w: 56, dp: 3 },
    { key: 'hrpa', label: 'HR/PA', group: 'Damage', w: 52, dp: 1 },
    { key: 'hard', label: 'Hard%', group: 'Contact', w: 50, dp: 0 },
    { key: 'brl', label: 'Barrel%', group: 'Contact', w: 56, dp: 0 },
  ]
  return (
    <Block title="Damage by third of the order" note="where in the lineup he bleeds">
      <DenseTable rows={rows} columns={cols} initialSort={null} maxHeight={9999} bare
        caption="Top is spots 1-3, middle 4-6, bottom 7-9. SLG against is total bases over at-bats." />
    </Block>
  )
}

export default function PitcherProfile({ pitcher }) {
  const src = useMemo(() => {
    const lineup = pitcher?.lineup || []
    return (k) => {
      for (const b of lineup) {
        const v = b?.raw?.[k]
        if (typeof v === 'number' && Number.isFinite(v)) return v
        if (typeof v === 'string' && v) return v
        if (v && typeof v === 'object') return v
      }
      return null
    }
  }, [pitcher])

  const weakSide = clean(src('pitcher_weak_side'), '')
  const cmd = {
    meatball: asPct100(n(src('pitcher_meatball_pct'), null)), whiff: asPct100(n(src('pitcher_whiff_pct'), null)),
    swstr: asPct100(n(src('pitcher_swstr_pct'), null)), putaway: asPct100(n(src('pitcher_putaway_pct'), null)),
    fps: asPct100(n(src('pitcher_first_pitch_strike_pct'), null)),
    spot: n(src('pitcher_spot_damage_score'), null), zone: n(src('pitcher_zone_damage_score'), null),
  }
  const cmdHasAny = Object.values(cmd).some((v) => v != null)
  const side = (k) => ({
    hr9: n(src(`pitcher_hr9_vs_${k}`), null), whip: n(src(`pitcher_whip_vs_${k}`), null),
    hr: n(src(`pitcher_hr_vs_${k}`), null), xbh: n(src(`pitcher_xbh_vs_${k}`), null),
    mix: clean(src(`pitcher_primary_mix_vs_${k}`), ''),
  })
  const L = side('lhb'), R = side('rhb')
  const platHasAny = [L.hr9, R.hr9, L.whip, R.whip, L.hr, R.hr, L.xbh, R.xbh].some((v) => v != null)
  const usage = Object.entries(src('pitcher_pitch_usage_pct') || {}).map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v) && v > 0).sort((a, b) => b[1] - a[1])

  const cmdCols = [
    { key: 'meatball', label: 'Meatball%', group: 'Mistake', w: 76, dp: 1, title: 'Pitches down the middle. High is trouble for him, good for the bats.' },
    { key: 'whiff', label: 'Whiff%', group: 'Weapons', w: 60, dp: 1, title: 'Misses per swing.' },
    { key: 'swstr', label: 'SwStr%', group: 'Weapons', w: 60, dp: 1, title: 'Swings and misses per pitch.' },
    { key: 'putaway', label: 'Putaway%', group: 'Weapons', w: 70, dp: 1, title: 'Two-strike counts he finishes.' },
    { key: 'fps', label: '1st-pitch K%', group: 'Weapons', w: 82, dp: 1, title: 'First-pitch strike rate: how often he gets ahead.' },
    { key: 'spot', label: 'Spot', group: 'Scores', w: 44, dp: 0, title: 'MOONSHOT\u2019s spot-damage score for him.' },
    { key: 'zone', label: 'Zone', group: 'Scores', w: 44, dp: 0, title: 'MOONSHOT\u2019s zone-damage score for him.' },
  ]
  const platCols = [
    { key: 'side', label: 'Bats', group: 'Side', w: 56, heat: false, sticky: true, bold: true },
    { key: 'hr9', label: 'HR/9', group: 'Rates', w: 48, dp: 2 },
    { key: 'whip', label: 'WHIP', group: 'Rates', w: 48, dp: 2 },
    { key: 'hr', label: 'HR', group: 'Counts', w: 36, dp: 0 },
    { key: 'xbh', label: 'XBH', group: 'Counts', w: 40, dp: 0 },
    { key: 'mix', label: 'Mix', group: 'What he throws', w: 190, heat: false, dim: true },
  ]
  const arsCols = [
    { key: 'pitch', label: 'Pitch', group: 'Pitch', w: 70, heat: false, sticky: true, bold: true },
    { key: 'use', label: 'Usage%', group: 'Mix', w: 64, dp: 1 },
  ]
  return (
    <div style={{ marginTop: 14 }}>
      <Block title="Command" note={cmdHasAny ? 'his rates, one row' : null}>
        {cmdHasAny ? (
          <DenseTable rows={[{ key: 'cmd', ...cmd }]} columns={cmdCols} initialSort={null} maxHeight={9999} bare
            caption="Command rates for this pitcher. Meatball% is the one that helps the bats; the rest are his weapons." />
        ) : <div style={{ fontSize: 12, color: C.text3 }}>Nothing yet.</div>}
      </Block>

      <Block title="Platoon" note={weakSide ? `MOONSHOT calls ${weakSide} his weak side` : null}>
        {platHasAny ? (
          <DenseTable
            rows={[{ key: 'L', side: 'vs LHB', ...L }, { key: 'R', side: 'vs RHB', ...R }]}
            columns={platCols} initialSort={null} maxHeight={9999} bare
            caption="One row a side of the plate. HR/9 and WHIP: higher is worse for him, so the worse side glows." />
        ) : <div style={{ fontSize: 12, color: C.text3 }}>No platoon split yet.</div>}
      </Block>

      {usage.length > 0 && (
        <Block title="Arsenal" note={clean(src('pitcher_primary_mix'), '')}>
          <DenseTable rows={usage.map(([k, v]) => ({ key: k, pitch: k, use: v }))} columns={arsCols} initialSort={null} maxHeight={9999} bare />
        </Block>
      )}

      <OrderZones pitcherId={pitcher?.pitcher_id} />
    </div>
  )
}
