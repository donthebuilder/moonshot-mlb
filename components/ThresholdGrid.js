'use client'
import React, { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, MARKETS } from '../lib/gamelogs'

// THE PROP GRID — the one thing PropFinder had that this site didn't.
// Per market: cleared/games over L5 / L10 / L20 / season as "4/10 40%",
// colored by rate, plus the current streak. Fair-odds and the paste-a-line
// verdict were removed on request — with no odds API, implied-price talk
// suggested a comparison the site can't actually make.
// Live from MLB game logs; context lane, nothing here feeds a score.

const rateCol = (pct) => pct >= 60 ? '#4ade80' : pct >= 40 ? '#FCD34D' : pct >= 25 ? C.orange : '#f87171'

export default function ThresholdGrid({ playerId }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState('hr')

  useEffect(() => {
    let alive = true
    setData(null)
    thresholdRates(playerId).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [playerId])

  if (data === null) return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading game log…</div>
  if (!data) return null


  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>🎯 Prop grid</span>
        <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          how often he clears each bar · click a row for the game-by-game · live · {data.games} games
        </span>
      </div>
      <div className="dense-scroll" style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5, fontFamily: NUM_FONT }}>
          <thead>
            <tr style={{ background: C.bg3 }}>
              {['Market', 'L5', 'L10', 'L20', 'Season', 'Streak'].map((h) => (
                <th key={h} style={{ padding: '5px 9px', textAlign: h === 'Market' ? 'left' : 'right', fontSize: 8.5, color: C.text3, letterSpacing: '.05em' }}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MARKETS.map((m) => {
              const r = data.markets[m.key]
              if (!r) return null
              const cell = (w) => {
                const { ok, n } = r[w]
                if (!n) return <td key={w} style={{ padding: '5px 9px', textAlign: 'right', color: C.text3 }}>—</td>
                const pct = (100 * ok) / n
                return (
                  <td key={w} style={{ padding: '5px 9px', textAlign: 'right', color: rateCol(pct), fontWeight: 700 }}>
                    {ok}/{n} <span style={{ fontSize: 9 }}>{pct.toFixed(0)}%</span>
                  </td>
                )
              }
              const stk = r.streak
              const isOpen = open === m.key
              return (
                <React.Fragment key={m.key}>
                <tr onClick={() => setOpen(isOpen ? null : m.key)}
                  style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer', background: isOpen ? 'rgba(249,115,22,.05)' : 'transparent' }}>
                  <td style={{ padding: '5px 9px', fontWeight: 800, color: C.text }}>{m.label}</td>
                  {['L5', 'L10', 'L20', 'Szn'].map(cell)}
                  <td title="Consecutive most-recent games clearing (or missing) this bar"
                    style={{ padding: '5px 9px', textAlign: 'right', fontWeight: 800, color: stk > 0 ? '#4ade80' : stk < 0 ? '#f87171' : C.text3 }}>
                    {stk > 0 ? `W${stk}` : stk < 0 ? `L${-stk}` : '—'}
                  </td>
                </tr>
                {/* THE TIMELINE — PF shows this as its centerpiece and it's
                    the shape the numbers can't carry: WHEN the clears came,
                    clustered or scattered, against whom. One cell per game,
                    newest on the RIGHT like a chart, brightness = margin
                    (2 HR burns brighter than 1 — PF's bars can't say that). */}
                {isOpen && data.log && (
                  <tr>
                    <td colSpan={7} style={{ padding: '7px 9px 9px', background: 'rgba(249,115,22,.03)' }}>
                      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                        {[...data.log].reverse().map((g, gi) => {
                          const val = m.key === 'hit' ? g.h : m.key === 'tb2' ? g.tb : m.key === 'hr' ? g.hr : m.key === 'run' ? g.r : g.rbi
                          const ok = m.test(g)
                          const extra = m.key === 'tb2' ? val >= 4 : val >= 2
                          return (
                            <div key={gi} title={`${g.date} ${g.home ? 'vs' : '@'} ${g.opp} — ${val} (${g.h}H ${g.tb}TB ${g.hr}HR)`}
                              style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                              <div style={{
                                height: ok ? (extra ? 26 : 18) : 8, borderRadius: 3,
                                background: ok ? (extra ? '#4ade80' : 'rgba(74,222,128,.55)') : 'rgba(248,113,113,.35)',
                                boxShadow: extra ? '0 0 7px rgba(74,222,128,.5)' : 'none',
                              }} />
                              <div style={{ fontSize: 6.5, color: C.text3, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap' }}>{g.opp}</div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        Rates are raw outcomes, no opponent context — pair with the pitch tab before trusting a hot
        L5. Twenty games is a real sample but not a season.
      </div>
    </div>
  )
}
