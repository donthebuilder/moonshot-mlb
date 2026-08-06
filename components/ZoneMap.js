'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hotColdZones } from '../lib/situational'

// STRIKE-ZONE MAP — the EV log projected onto the plate, via the live API.
//
// The log below this answers "what has he hit"; this answers "WHERE does he
// hit it". Data is the StatsAPI hotColdZones split (verified live before this
// was written): per-zone exit velocity, SLG, OPS, AVG for the nine in-zone
// cells plus the four out-of-zone quadrants, with MLB's own hot/cold grading.
//
// Colour is the site ramp: brighter orange = hotter FOR THE HITTER, using the
// API's temp label rather than re-deriving bands from tiny per-zone samples.
// Catcher's view, like every zone chart in baseball — zone 1 is up-and-in to
// a righty.

const TEMP_ALPHA = { hot: 0.8, warm: 0.5, lukewarm: 0.26, cool: 0.12, cold: 0.05 }

const STATS = [
  { key: 'ev', label: 'Exit velo', hint: 'Average EV on balls hit from this zone — the honest one, no batted-ball luck' },
  { key: 'slg', label: 'SLG', hint: 'Slugging on pitches in this zone' },
  { key: 'ops', label: 'OPS', hint: 'OPS on pitches in this zone' },
  { key: 'avg', label: 'AVG', hint: 'Average on pitches in this zone' },
]

// align: for the out-of-zone quadrants the middle of the cell is hidden under
// the inner 3×3 grid, so the value is pinned into the VISIBLE outer corner.
function Cell({ z, big, align }) {
  const alpha = z ? (TEMP_ALPHA[z.temp] ?? 0.15) : 0
  const [v, h] = align || ['center', 'center']
  return (
    <div style={{
      display: 'flex',
      alignItems: v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center',
      justifyContent: h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center',
      background: z ? `rgba(249,115,22,${alpha})` : 'rgba(255,255,255,.02)',
      border: `1px solid ${z && z.temp === 'hot' ? 'rgba(249,115,22,.7)' : C.border}`,
      borderRadius: 4, height: '100%', minHeight: 0, minWidth: 0,
      boxShadow: z && z.temp === 'hot' ? '0 0 10px rgba(249,115,22,.35)' : 'none',
      padding: align ? '5px 7px' : 0, overflow: 'hidden',
    }}>
      <span style={{
        fontFamily: NUM_FONT, fontSize: big ? 11 : 9, fontWeight: z && z.temp === 'hot' ? 900 : 600,
        color: z ? (z.temp === 'hot' ? '#fff' : C.text2) : C.text3,
      }}>{z ? z.value : '—'}</span>
    </div>
  )
}

export default function ZoneMap({ playerId, bats }) {
  const [zones, setZones] = useState(undefined) // undefined loading, null missing
  const [stat, setStat] = useState('ev')

  useEffect(() => {
    let alive = true
    setZones(undefined)
    hotColdZones(playerId).then((d) => { if (alive) setZones(d) })
    return () => { alive = false }
  }, [playerId])

  if (zones === undefined) {
    return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading zone map…</div>
  }
  if (!zones || !zones[stat]) {
    // Honest empty state: the API has no zone sample, say so, don't fake a grid.
    if (!zones) return null
    return null
  }

  const zs = zones[stat]
  const active = STATS.find((s) => s.key === stat)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⌖ Strike-zone map</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {STATS.map((s) => (
            <button key={s.key} onClick={() => setStat(s.key)} title={s.hint} style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
              fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${stat === s.key ? C.orange : C.border}`,
              background: stat === s.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: stat === s.key ? C.orange : C.text3,
            }}>{s.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>
          live API · season · MLB&apos;s own hot/cold grading
        </span>
      </div>

      {/* Out-of-zone quadrants framing the 3×3 zone — the Gameday layout.
          FIXED HEIGHT (2026-08-06): v1 sized the frame off its children while
          the inner grid was absolutely positioned — the parent collapsed flat
          and the zone spilled over the caption and controls below it. The
          frame now owns its box, and each quadrant's value is pinned into its
          visible outer corner instead of centered under the inner grid. */}
      <div style={{ maxWidth: 250, margin: '0 auto' }}>
        <div style={{
          position: 'relative', height: 290,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3,
        }}>
          <Cell z={zs['11']} align={['top', 'left']} />
          <Cell z={zs['12']} align={['top', 'right']} />
          <Cell z={zs['13']} align={['bottom', 'left']} />
          <Cell z={zs['14']} align={['bottom', 'right']} />
          <div style={{
            position: 'absolute', inset: 44,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
            gap: 3, background: '#0b0b0d', borderRadius: 6, padding: 3,
            border: `1px solid ${C.border2}`,
          }}>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((k) => (
              <Cell key={k} z={zs[k] || zs[String(Number(k))]} big />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        {active?.label} by pitch location, catcher&apos;s view — for a {bats === 'L' ? 'lefty, inside is the RIGHT column' : bats === 'R' ? 'righty, inside is the left column' : 'hitter, zone 1 is up-and-in to a righty'}.
        The corner panels are pitches OUT of the zone on that side. Brighter orange = hotter for the hitter,
        graded by MLB against league norms, not by this site. Small per-zone samples swing hard — read the
        temperature, not the third decimal.
      </div>
    </div>
  )
}
