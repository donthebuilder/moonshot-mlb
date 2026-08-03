'use client'
import { useMemo, useState } from 'react'
import { C } from '../lib/theme'
import { teamOf, oppOf, hrScore, hitScore, n } from '../lib/player'
import Heatmap from './Heatmap'

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
      return { label, values, _count: pool.length }
    }).sort((a, b) => b.values['Proj HR'] - a.values['Proj HR'])
  }, [games, players, by])

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
        columns={COLUMNS}
        title="Projected output — expected count, not a score"
        labelWidth={150}
        fmt={(v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')}
        caption="Each hitter's board score is converted to the rate that band actually produced over 34 graded days, then summed across the lineup. Proj HR and Proj hits rest on bands that climb cleanly with score; XBH and bases do not — their 70-band scored below their 55-band in the archive, so treat those two as rough."
      />
    </div>
  )
}
