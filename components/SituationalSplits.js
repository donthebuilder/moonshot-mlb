'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { pitcherSituational, batterSituational } from '../lib/situational'

// Situational splits block for the player and pitcher modals. Fetches live
// from the MLB StatsAPI when the modal opens — the first non-bot data source
// on the site, see lib/situational.js for the reasoning and the shortlist.
//
// Context, not scoring: none of these are validated against the graded
// archive, so they inform the read without moving any number. The header
// pill says exactly that.

export default function SituationalSplits({ playerId, kind = 'batter' }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    const load = kind === 'pitcher' ? pitcherSituational : batterSituational
    load(playerId).then((r) => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [playerId, kind])

  if (rows === null) {
    return (
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, padding: '6px 0' }}>
        Loading situational splits…
      </div>
    )
  }
  if (!rows.length) return null

  const dpFmt = (v, dp = 2) => (v == null ? '—' : Number(v).toFixed(dp))

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>Situational</span>
        <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          live from MLB StatsAPI · context only — not in any score, not yet validated
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.key} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9,
            padding: '7px 11px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{r.label}</span>
              {r.single ? (
                <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text }}>{r.single}</span>
              ) : (
                <span style={{ fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800 }}>
                  <span style={{
                    color: (r.worse === 'a' || r.good === 'a')
                      ? (r.worse === 'a' ? '#f87171' : C.orange) : C.text,
                  }}>{dpFmt(r.a, r.dp)}</span>
                  <span style={{ color: C.text3, fontSize: 9, margin: '0 3px' }}>{r.aLabel}</span>
                  <span style={{ color: C.text3 }}> / </span>
                  <span style={{
                    color: (r.worse === 'b' || r.good === 'b')
                      ? (r.worse === 'b' ? '#f87171' : C.orange) : C.text,
                  }}>{dpFmt(r.b, r.dp)}</span>
                  <span style={{ color: C.text3, fontSize: 9, margin: '0 3px' }}>{r.bLabel}</span>
                </span>
              )}
            </div>
            {r.note && (
              <div style={{ fontSize: 9, color: C.text3, marginTop: 2, fontFamily: NUM_FONT }}>{r.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
