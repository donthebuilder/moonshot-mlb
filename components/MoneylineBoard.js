'use client'

// ── 💰 WHERE THE MODEL DISAGREES WITH THE MARKET ────────────────────────────
//
// The fourth bot, and the only one on the site that is NOT presented as a
// thing to bet.
//
// WHY THE FRAMING IS "DISAGREEMENT LOG" AND NOT "PICKS". Before this shipped
// the bot was simulated against the null hypothesis — a world where the market
// is right and the model is blind — and the first version lost 4-8% flat at
// every edge floor tried. Raising the floor did not help; it took fewer bets
// and lost at the same rate, because selectivity concentrates the vig instead
// of finding an edge. Giving the model the starting pitchers cut its opinions
// to roughly a fifth and improved the simulated loss, which means most of what
// version one called an edge was simply not knowing who was pitching.
//
// It is still, in that simulated world, a loser — because in that world the
// market is right by construction and nothing can beat it. Whether there is
// real edge here cannot be settled by simulation. It can only be settled by
// grading real bets in public, which is what this board is for and what the
// rest of the site already does.
//
// So the record leads, the simulated expectation sits beside it, and the word
// "pick" is deliberately absent from the copy.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { moneylinePaths } from '../lib/dataSource'
import { Empty } from './ui'

const price = (v) => (Number(v) > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)
const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`
const signed = (v) => `${Number(v) >= 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}`

export default function MoneylineBoard() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    fetchJSON(moneylinePaths())
      .then((j) => {
        if (!alive) return
        if (j && j.record) { setData(j); setState('ok') } else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Reading the board…</div>
  if (state === 'empty' || !data) {
    return <Empty text="No moneyline board published yet — the bot writes this on its next run." />
  }

  const r = data.record || {}
  const today = data.today || []
  const roiTone = (Number(r.roi) || 0) > 0 ? C.green : (r.graded ? C.red : C.text3)

  return (
    <div>
      {/* THE RECORD FIRST. A board of opinions with the grade underneath is a
          tip sheet; the grade on top is an experiment. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline',
        border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px',
        marginBottom: 10, fontFamily: NUM_FONT,
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em', color: C.text3 }}>THE RECORD</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
          {r.wins || 0}-{r.losses || 0}
        </span>
        <span style={{ fontSize: 11, color: C.text2 }}>
          {pct(r.win_rate)} <span style={{ color: C.text3 }}>· needed {pct(r.breakeven_rate)}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: roiTone }}>
          {signed(r.units_profit)} units · {r.graded ? pct(r.roi) : '—'}
        </span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          {r.graded || 0} graded, flat one unit at the price offered
        </span>
      </div>

      {today.length === 0 ? (
        <Empty text="No disagreements on tonight's board that clear the floor. That is the normal outcome." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: NUM_FONT }}>
          <caption className="sr-only">Tonight&apos;s disagreements between the model and the market</caption>
          <thead>
            <tr>
              {[['Game', 'left'], ['Leans', 'left'], ['Price', 'right'],
                ['Model', 'right'], ['Market', 'right'], ['Gap', 'right'], ['From the arms', 'right']]
                .map(([l, a]) => (
                  <th key={l} scope="col" style={{
                    textAlign: a, padding: '4px 6px', fontSize: 8.5, fontWeight: 900,
                    letterSpacing: '.1em', textTransform: 'uppercase', color: C.text3,
                    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                  }}>{l}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {today.map((p) => (
              <tr key={p.game_pk} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '5px 6px', fontSize: 10.5, color: C.text2, whiteSpace: 'nowrap' }}>
                  {p.away} @ {p.home}
                </td>
                <td style={{ padding: '5px 6px', fontSize: 11.5, fontWeight: 800, color: C.text }}>{p.side}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, color: C.text }}>{price(p.price)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>{pct(p.model_p)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text3 }}
                    title={`Book's raw hold on this game: ${pct(p.hold)}`}>{pct(p.market_p)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: C.orange }}>
                  {pct(p.edge)}
                </td>
                {/* How much of the opinion is the pitching rather than the
                    records — the thing version one could not see at all. */}
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10, color: C.text3, whiteSpace: 'nowrap' }}
                    title={p.home_sp || p.away_sp ? `${p.away_sp || '?'} vs ${p.home_sp || '?'}` : undefined}>
                  {p.starter_shift ? `${Number(p.starter_shift) > 0 ? '+' : ''}${Math.round(p.starter_shift * 100)}pt` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '10px 2px 0', maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>This is a log, not a tip sheet.</b> Simulated against a
        world where the market is right, the first version of this model lost 4–8% flat at every
        edge floor — and raising the floor made it worse, not better, because being choosier
        concentrates the vig instead of finding an edge. Adding the starting pitchers cut its
        opinions to about a fifth, which means most of what it used to call an edge was not
        knowing who was pitching. Whether anything real is left cannot be settled by
        simulation, only by the record above.
      </p>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
        {data.method}
      </p>
    </div>
  )
}
