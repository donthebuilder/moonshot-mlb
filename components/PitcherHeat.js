'use client'
import { useMemo } from 'react'
import { C } from '../lib/theme'
import { n, clean, hrScore } from '../lib/player'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// Pitchers, read from the hitter's side.
//
// Orientation matters and it's the easy thing to get wrong here. This is a
// hitter's site, so BRIGHT ALWAYS MEANS GOOD FOR THE HITTER. A high HR/9 is a
// bad number for the pitcher and therefore a bright cell. The two columns that
// run the other way -- K/9 and whiff -- are marked invert, because a pitcher
// who misses bats is bad news for the lineup no matter how the rest reads.
//
// Every field below was checked against the published slate: all present on
// 268/268 rows, so none of these columns will render as a blank grid.

const first = (rows, key) => {
  for (const r of rows) {
    const v = r?.raw?.[key] ?? r?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v) return v
  }
  return null
}

const COLUMNS = [
  { key: 'name',    label: 'Pitcher',  heat: false, w: 150, bold: true, sticky: true },
  { key: 'throws',  label: 'T',        heat: false, w: 22, mono: true, dim: true },
  { key: 'team',    label: 'Tm',       heat: false, w: 34, mono: true, dim: true },
  { key: 'vs',      label: 'vs',       heat: false, w: 34, mono: true, dim: true },
  { key: 'weakSide', label: 'Weak',    heat: false, w: 44, mono: true, dim: true },
  { key: 'weak',    label: '★ Spots',  w: 46 },
  { key: 'hr9',     label: 'HR/9',     w: 44, dp: 2 },
  { key: 'l3hr9',   label: 'L3 HR/9',  w: 50, dp: 2 },
  { key: 'era',     label: 'ERA',      w: 42, dp: 2 },
  { key: 'whip',    label: 'WHIP',     w: 44, dp: 2 },
  { key: 'k9',      label: 'K/9',      w: 42, dp: 1, invert: true },
  { key: 'swstr',   label: 'SwStr%',   w: 48, dp: 1, invert: true },
  { key: 'ops',     label: 'OPS ag',   w: 48, dp: 3 },
  { key: 'iso',     label: 'ISO ag',   w: 48, dp: 3 },
  { key: 'barrel',  label: 'Brl%',     w: 44, dp: 1 },
  { key: 'hardhit', label: 'HH%',      w: 44, dp: 1 },
  { key: 'hrfb',    label: 'HR/FB',    w: 46, dp: 1 },
  { key: 'fb',      label: 'FB%',      w: 42, dp: 1 },
  { key: 'meatball', label: 'Meat%',   w: 46, dp: 1 },
  { key: 'pullair', label: 'PullAir%', w: 52, dp: 1 },
  { key: 'ev',      label: 'EV ag',    w: 46, dp: 1 },
  { key: 'd375',    label: '375+ ag',  w: 50 },
  { key: 'medHR',   label: 'Lineup HR', w: 54, dp: 1 },
  { key: 'topHR',   label: 'Top HR',   w: 46, dp: 1 },
]

const HEAT_COLS = ['HR/9', 'L3 HR/9', 'ERA', 'WHIP', 'OPS ag', 'ISO ag', 'Brl%', 'HH%', 'HR/FB', 'Meat%', 'PullAir%', '★ Spots', 'Lineup HR']

const med = (v) => {
  const a = v.filter(Number.isFinite).sort((x, y) => x - y)
  if (!a.length) return 0
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

export default function PitcherHeat({ pitchers = [], onSelect }) {
  const rows = useMemo(() => pitchers.map((e, i) => {
    const lu = e.lineup || []
    const g = (k) => n(first(lu, k), null)
    return {
      _key: e.pitcher_id ?? e.pitcher_name ?? i,
      _raw: e,
      name: clean(e.pitcher_name, 'Unknown'),
      throws: clean(e.pitcher_throws, '?'),
      team: clean(e.team, ''),
      vs: clean(e.opponent_team, ''),
      weakSide: clean(g('pitcher_weak_side') || e.pitcher_weak_side, '—') || '—',
      weak: n(e.weak_spot_count, 0),
      hr9: n(e.pitcher_hr9, g('pitcher_hr9')),
      l3hr9: g('pitcher_l3_hr9'),
      era: n(e.pitcher_era, g('pitcher_era')),
      whip: n(e.pitcher_whip, g('pitcher_whip')),
      k9: g('pitcher_k9'),
      swstr: g('pitcher_swstr_pct') * 100,
      ops: g('pitcher_ops_against'),
      iso: g('pitcher_iso_against'),
      barrel: g('pitcher_barrel_allowed') * 100,
      hardhit: g('pitcher_hardhit_allowed') * 100,
      hrfb: g('pitcher_hr_fb_pct') * 100,
      fb: g('pitcher_fb_rate') * 100,
      meatball: g('pitcher_meatball_pct') * 100,
      pullair: g('pitcher_pullair_allowed_pct') * 100,
      ev: g('pitcher_ev_allowed'),
      d375: g('pitcher_375_allowed'),
      medHR: med(lu.map((b) => n(b.hr_score, hrScore(b.raw || {})))),
      topHR: Math.max(...lu.map((b) => n(b.hr_score, 0)), 0),
    }
  }), [pitchers])

  if (!rows.length) return null

  const top = [...rows].sort((a, b) => b.hr9 - a.hr9).slice(0, 15)

  return (
    <div style={{ margin: '4px 0 20px' }}>
      <Heatmap
        rows={top.map((r) => ({
          label: r.name,
          _raw: r._raw,
          values: {
            'HR/9': r.hr9, 'L3 HR/9': r.l3hr9, ERA: r.era, WHIP: r.whip,
            'OPS ag': r.ops * 100, 'ISO ag': r.iso * 100,
            'Brl%': r.barrel, 'HH%': r.hardhit, 'HR/FB': r.hrfb,
            'Meat%': r.meatball, 'PullAir%': r.pullair,
            '★ Spots': r.weak, 'Lineup HR': r.medHR,
          },
        }))}
        columns={HEAT_COLS}
        title="Most attackable starters — bright means good for the hitter"
        labelWidth={150}
        fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')}
        onRowClick={onSelect ? (r) => onSelect(r._raw) : null}
        caption="Ranked by HR/9. Bright = good for hitters throughout, so a high ERA or a fat meatball rate lights up. OPS and ISO against are ×100 to share the scale."
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 7px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text2 }}>All starters</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3 }}>
          {rows.length} starters · {rows.reduce((a, r) => a + r.weak, 0)} weak spots across the slate
        </span>
      </div>

      <DenseTable
        heatMode="sorted"
rows={rows}
        columns={COLUMNS}
        onRowClick={onSelect}
        initialSort="hr9"
        maxHeight={460}
        caption="Bright is good for the hitter on every column except K/9 and SwStr%, which are inverted — a pitcher who misses bats is bad news for the lineup regardless of the rest."
      />
    </div>
  )
}
