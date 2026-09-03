'use client'

// ── 🏆 OCTOBER, FROM TONIGHT'S STANDINGS ────────────────────────────────────
//
// Donovan asked for a playoff predictor and a World Series champion. They are
// one machine (bots/playoff_odds.py simulates the rest of the season ten
// thousand times and runs the bracket each run), so they are one panel.
//
// WHY IT IS FOLDED ON HOME AND NOT A TAB. "You can get lost on the site very
// easily, especially the MLB side, and I don't want that to happen when NFL
// starts." A new tab costs every visitor a decision forever; a fold costs the
// people who open it. This is a September-to-October curiosity next to a
// product about tonight's home runs, so it lives where the seasonal things
// live and stays shut until asked for. <Fold> does not render its children
// when closed, so a reader who never opens it never fetches this file either.
//
// WHAT IT REFUSES TO DO. It does not print a favourite as a headline, and it
// does not round 3% up to "a real chance". A 16% favourite is the normal shape
// of a baseball October -- the sport's whole character is that the best team
// usually loses -- and a panel that dressed that up would be making the same
// mistake the site spends the rest of its pages avoiding. So the method line
// is always visible, not behind a tooltip, and the numbers are printed at the
// precision they are actually known to.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { playoffOddsPaths } from '../lib/dataSource'
import { Empty } from './ui'

const pct = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n <= 0) return '—'
  // Below 1% the difference between 0.4% and 0.9% is noise at 10,000 sims, so
  // it says "<1%" rather than inventing a decimal it cannot support.
  if (n < 0.01) return '<1%'
  return `${Math.round(n * 100)}%`
}

const tone = (v) => {
  const n = Number(v) || 0
  if (n >= 0.15) return C.orange
  if (n >= 0.06) return C.yellow
  if (n >= 0.01) return C.text2
  return C.text3
}

function Bar({ v, color }) {
  const w = Math.max(2, Math.min(100, Math.round((Number(v) || 0) * 100 / 0.25 * 100) / 100))
  return (
    <i style={{
      display: 'block', height: 3, marginTop: 3, borderRadius: 2,
      width: `${w}%`, background: color, opacity: .55,
    }} />
  )
}

export default function PennantRace() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    fetchJSON(playoffOddsPaths())
      .then((j) => {
        if (!alive) return
        if (j && Array.isArray(j.teams) && j.teams.length) { setData(j); setState('ok') }
        else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Simulating…</div>
  if (state === 'empty' || !data) {
    return <Empty text="No playoff odds published yet — the bot writes this on its next run." />
  }

  const teams = [...data.teams].sort((a, b) =>
    (b.win_world_series - a.win_world_series) || (b.make_playoffs - a.make_playoffs))
  const shown = teams.filter((t) => t.make_playoffs > 0.005).slice(0, 16)
  const leftOut = teams.length - shown.length

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: NUM_FONT }}>
        <caption className="sr-only">
          Playoff, pennant and World Series odds by team, from {Number(data.sims).toLocaleString()} simulations
        </caption>
        <thead>
          <tr>
            {[['', 'left'], ['Team', 'left'], ['W-L', 'right'], ['Proj', 'right'],
              ['Playoffs', 'right'], ['Division', 'right'], ['Pennant', 'right'], ['Series', 'right']]
              .map(([label, align], i) => (
                <th key={label + i} scope="col" style={{
                  textAlign: align, padding: '4px 6px', fontSize: 8.5, fontWeight: 900,
                  letterSpacing: '.1em', textTransform: 'uppercase', color: C.text3,
                  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                }}>{label}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <tr key={t.team_id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '5px 6px', fontSize: 9.5, color: C.text3, width: 18 }}>{i + 1}</td>
              <td style={{ padding: '5px 6px', minWidth: 0 }}>
                <b style={{ fontSize: 11.5, color: C.text }}>{t.abbr}</b>
                <span style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{t.division}</span>
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2, whiteSpace: 'nowrap' }}>
                {t.wins}-{t.losses}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text3 }}
                  title="Average wins across every simulated season">
                {Number(t.proj_wins).toFixed(0)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, color: tone(t.make_playoffs) }}>
                {pct(t.make_playoffs)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>
                {pct(t.win_division)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>
                {pct(t.win_league)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: tone(t.win_world_series), minWidth: 54 }}>
                {pct(t.win_world_series)}
                <Bar v={t.win_world_series} color={tone(t.win_world_series)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {leftOut > 0 ? `${leftOut} teams with no realistic path are not listed. ` : ''}
        {data.method}
        {data.note ? ` ${data.note}` : ''}
      </p>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
        A 15–20% favourite is what a real baseball October looks like. The best team
        usually does not win it — that is the sport, not a weakness in the number.
      </p>
    </div>
  )
}
