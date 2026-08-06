'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, MARKETS, impliedPct, fairOdds } from '../lib/gamelogs'

// THE PROP GRID — the one thing PropFinder had that this site didn't.
// Per market: cleared/games over L5 / L10 / L20 / season as "4/10 40%",
// colored by rate, plus the current streak and OUR fair odds from the L20
// rate. Under it, the paste-a-line verdict: type the odds your book is
// hanging and get needed% vs his real rate — the judgement PF never makes.
// Live from MLB game logs; context lane, nothing here feeds a score.

const rateCol = (pct) => pct >= 60 ? '#4ade80' : pct >= 40 ? '#FCD34D' : pct >= 25 ? C.orange : '#f87171'

export default function ThresholdGrid({ playerId }) {
  const [data, setData] = useState(null)
  const [odds, setOdds] = useState('')
  const [mkt, setMkt] = useState('hr')

  useEffect(() => {
    let alive = true
    setData(null)
    thresholdRates(playerId).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [playerId])

  if (data === null) return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading game log…</div>
  if (!data) return null

  const sel = data.markets[mkt]
  const l20 = sel ? sel.L20 : null
  const myRate = l20 && l20.n ? l20.ok / l20.n : null
  const need = impliedPct(odds)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>🎯 Prop grid</span>
        <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          how often he clears each bar · live game log · {data.games} games
        </span>
      </div>
      <div className="dense-scroll" style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5, fontFamily: NUM_FONT }}>
          <thead>
            <tr style={{ background: C.bg3 }}>
              {['Market', 'L5', 'L10', 'L20', 'Season', 'Streak', 'Fair odds'].map((h) => (
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
              const l20r = r.L20.n ? r.L20.ok / r.L20.n : null
              return (
                <tr key={m.key} style={{ borderTop: `1px solid ${C.border}`, background: mkt === m.key ? 'rgba(249,115,22,.06)' : 'transparent', cursor: 'pointer' }}
                  onClick={() => setMkt(m.key)}>
                  <td style={{ padding: '5px 9px', fontWeight: 800, color: C.text }}>{m.label}</td>
                  {['L5', 'L10', 'L20', 'Szn'].map(cell)}
                  <td title="Consecutive most-recent games clearing (or missing) this bar"
                    style={{ padding: '5px 9px', textAlign: 'right', fontWeight: 800, color: stk > 0 ? '#4ade80' : stk < 0 ? '#f87171' : C.text3 }}>
                    {stk > 0 ? `W${stk}` : stk < 0 ? `L${-stk}` : '—'}
                  </td>
                  <td title="The odds his L20 rate is actually worth — compare to your book"
                    style={{ padding: '5px 9px', textAlign: 'right', color: C.text2 }}>
                    {l20r != null ? fairOdds(l20r) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* paste-a-line verdict — the judgement PF doesn't make */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginTop: 7 }}>
        <span style={{ fontSize: 9.5, color: C.text3 }}>Your book&apos;s line for <b style={{ color: C.text2 }}>{MARKETS.find((m) => m.key === mkt)?.label}</b> (click a row to switch):</span>
        <input
          value={odds}
          onChange={(e) => setOdds(e.target.value)}
          placeholder="+300"
          style={{ width: 64, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 8px', fontSize: 11.5, color: C.text, fontFamily: NUM_FONT, outline: 'none' }}
        />
        {need != null && myRate != null && (
          <span style={{
            fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT, padding: '3px 10px', borderRadius: 7,
            background: myRate * 100 > need ? 'rgba(74,222,128,.14)' : 'rgba(248,113,113,.12)',
            color: myRate * 100 > need ? '#4ade80' : '#f87171',
            border: `1px solid ${myRate * 100 > need ? '#4ade80' : '#f87171'}55`,
          }}>
            needs {need.toFixed(0)}% · his L20 is {(100 * myRate).toFixed(0)}% → {myRate * 100 > need ? 'VALUE' : 'NO VALUE'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        Rates are raw outcomes, no opponent context — pair with the pitch tab before trusting a hot
        L5. The verdict compares your line&apos;s break-even to his last-20 rate only; 20 games is a
        real sample but not a season.
      </div>
    </div>
  )
}
