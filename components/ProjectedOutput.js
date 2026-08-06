'use client'
import { useMemo, useState, useEffect } from 'react'
import { C } from '../lib/theme'
import { teamOf, oppOf, hrScore, hitScore, n, clean } from '../lib/player'
import Heatmap from './Heatmap'
import { penStatsFor } from '../lib/bullpen'

// Projected output by game — expected COUNT, not a score.
//
// Ported from the Streamlit Games tab. The distinction it exists to make:
// every other number on this site is a rank, and a 78 only means "above a 62".
// These are projections. Each hitter's board score is mapped through the rate
// that its band ACTUALLY produced across 34 graded days, then summed over the
// lineup. So a cell reads "this game projects 2.4 home runs", which is a claim
// that can be wrong — unlike a score, which can't.
//
// CALIB is copied verbatim from streamlit_app.py. Do not tune these by hand:
// they're observed rates from the graded archive, and editing them turns a
// measurement back into a guess.
const CALIB = {
  'Proj HR':    ['hr',      { 0: 12.8, 40: 15.0, 55: 15.3, 70: 18.7, 85: 16.1 }],
  'Proj hits':  ['hit',     { 0: 61.8, 40: 59.5, 55: 63.0, 70: 65.4, 85: 72.0 }],
  'Proj XBH':   ['contact', { 0: 29.1, 40: 29.8, 55: 32.8, 70: 27.2, 85: 36.4 }],
  'Proj bases': ['contact', { 0: 37.8, 40: 37.5, 55: 41.6, 70: 34.3, 85: 45.5 }],
}
const COLUMNS = Object.keys(CALIB)

const contactScore = (p) => n(p?.contact_score_v2 ?? p?.contact_score, 0)
const scoreOf = (p, kind) =>
  kind === 'hr' ? hrScore(p) : kind === 'hit' ? hitScore(p) : contactScore(p)

// Band lookup: highest band whose floor the score clears.
function bandRate(score, bands) {
  const floors = Object.keys(bands).map(Number).sort((a, b) => a - b)
  let rate = bands[floors[0]]
  floors.forEach((f) => { if (score >= f) rate = bands[f] })
  return rate / 100
}

export default function ProjectedOutput({ games = [], players = [] }) {
  const [by, setBy] = useState('game')

  // Opposing-pen stats, live from the MLB StatsAPI team `rp` split. Loaded
  // once per slate's teams; null until it arrives (the Adj column shows
  // when it does).
  const [pens, setPens] = useState(null)
  useEffect(() => {
    const teams = players.map((p) => oppOf(p)).filter(Boolean)
    if (!teams.length) return
    let alive = true
    penStatsFor(teams).then((m) => { if (alive) setPens(m) })
    return () => { alive = false }
  }, [players])

  const rows = useMemo(() => {
    const groups = new Map()

    if (by === 'game') {
      games.forEach((g) => {
        const gp = g.players || []
        if (!gp.length) return
        groups.set(`${g.away || '—'} @ ${g.home || '—'}`, gp)
      })
    } else {
      players.forEach((p) => {
        const t = teamOf(p)
        if (!t) return
        if (!groups.has(t)) groups.set(t, [])
        groups.get(t).push(p)
      })
    }

    return [...groups.entries()].map(([label, pool]) => {
      const values = {}
      COLUMNS.forEach((col) => {
        const [kind, bands] = CALIB[col]
        values[col] = pool.reduce((sum, p) => sum + bandRate(scoreOf(p, kind), bands), 0)
      })

      // ADJ HR — the calibrated projection with the environment and the pen
      // layered on, per team. Each hitter's band rate is multiplied by:
      //
      //   park    park_hr_factor, as published
      //   air     ~1% per 10°F off 70, capped ±6% (physics, kept gentle)
      //   wind    ±5% when the park-relative label says out/in
      //   pen     the OPPOSING pen's HR/9 vs a 1.05 league norm, weighted at
      //           38% — the share of innings pens actually cover. This is the
      //           late-game term: a Coors pen at 1.4 HR/9 raises the whole
      //           lineup's number because the 7th-9th exist, which the
      //           starter-only scores never priced (the Márquez/McCann/
      //           Arenado kind of night).
      //
      // The base Proj HR column stays untouched — it's calibrated, this is
      // calibrated × modeled, and the caption keeps them distinct.
      values['Adj HR'] = pool.reduce((sum, p) => {
        const base = bandRate(scoreOf(p, 'hr'), CALIB['Proj HR'][1])
        const park = n(p?.park_hr_factor, n(p?.park_dist_factor, 1)) || 1
        const temp = n(p?.weather_temp_f, n(p?.temp_f, 70)) || 70
        const air = Math.max(0.94, Math.min(1.06, 1 + (temp - 70) / 1000))
        const wl = clean(p?.wind_direction_label ?? p?.weather_wind_direction_label, '')
        const wind = /out/i.test(wl) ? 1.05 : /^in\b|in from/i.test(wl) ? 0.95 : 1
        const pen = pens?.get(String(oppOf(p) || '').toUpperCase())
        const penMult = pen?.hr9 ? (0.62 + 0.38 * (pen.hr9 / 1.05)) : 1
        return sum + base * park * air * wind * penMult
      }, 0)

      return { label, values, _count: pool.length }
    }).sort((a, b) => b.values['Proj HR'] - a.values['Proj HR'])
  }, [games, players, by, pens])

  if (!rows.length) return null

  const total = rows.reduce((a, r) => a + r.values['Proj HR'], 0)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {['game', 'team'].map((k) => (
          <button
            key={k}
            onClick={() => setBy(k)}
            style={{
              padding: '3px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${by === k ? C.orange : C.border}`,
              background: by === k ? 'rgba(249,115,22,.12)' : 'transparent',
              color: by === k ? C.orange : C.text3,
            }}
          >By {k}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3 }}>
          slate projects {total.toFixed(1)} HR across {rows.length} {by === 'game' ? 'games' : 'teams'}
        </span>
      </div>

      <Heatmap
        rows={rows}
        columns={[...COLUMNS, ...(pens ? ['Adj HR'] : [])]}
        title="Projected output — expected count, not a score"
        labelWidth={150}
        fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')}
        caption="Each hitter's board score is converted to the rate that band actually produced over 34 graded days, then summed across the lineup. Adj HR layers the environment and the OPPOSING BULLPEN onto that base: park factor, air temperature, park-relative wind, and the pen's live HR/9 (from the MLB StatsAPI, weighted at the ~38% of innings pens cover) — because homers don't stop when the starter leaves, and the base projection never priced the 7th–9th. Proj HR is calibrated; Adj HR is calibrated × modeled — when they disagree, the gap is the environment and the pen. XBH and bases bands are non-monotone in the archive; treat those two as rough."
      />
    </div>
  )
}
