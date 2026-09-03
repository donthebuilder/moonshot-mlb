'use client'

// ── 🔄 WHO COMES BACK, AND WHO GIVES IT AWAY ────────────────────────────────
//
// The third bot Donovan asked for: "most comeback wins."
//
// BOTH HALVES, ON ONE BOARD. A comeback needs two teams. The same game is a
// triumph for one and a collapse for the other, so publishing only the
// flattering column would be choosing a story over the data — and the site's
// whole position is that it doesn't do that. Every comeback win in this table
// is somebody's blown lead, and the totals prove it: they are equal by
// construction, and there is a test in the bot repo asserting it.
//
// THE LIMIT IS PRINTED, NOT HIDDEN. A line score records runs per half-inning,
// so the bot can only see the score at half-inning boundaries. A lead that
// changed hands inside a single inning is invisible to it. That makes every
// number here a FLOOR — real, and short. That sentence is in the payload the
// bot writes, so this component renders the bot's own caveat rather than a
// nicer one written later by the UI.
//
// Folded on Home for the same reason as the October odds: a tab costs every
// visitor a decision forever, a fold costs the people who open it, and Fold
// does not fetch until it is opened.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { comebackPaths } from '../lib/dataSource'
import { Empty } from './ui'

const SORTS = [
  ['comeback_wins', 'Most comebacks', 'Games won after trailing'],
  ['comeback_rate', 'Best rate', 'Share of their wins that needed a comeback'],
  ['biggest_comeback', 'Biggest hole', 'Largest deficit they erased and won'],
  ['blown_leads', 'Most given away', 'Games they led and lost'],
]

export default function ComebackBoard() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [sort, setSort] = useState('comeback_wins')

  useEffect(() => {
    let alive = true
    fetchJSON(comebackPaths())
      .then((j) => {
        if (!alive) return
        if (j && Array.isArray(j.teams) && j.teams.length) { setData(j); setState('ok') }
        else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Reading line scores…</div>
  if (state === 'empty' || !data) {
    return <Empty text="No comeback board published yet — the bot writes this on its next run." />
  }

  const rows = [...data.teams]
    .sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0) || a.abbr.localeCompare(b.abbr))
    .slice(0, 12)
  const active = SORTS.find(([k]) => k === sort)

  const th = (label, align = 'right', cls = '') => (
    <th scope="col" className={cls || undefined} style={{
      textAlign: align, padding: '4px 6px', fontSize: 8.5, fontWeight: 900,
      letterSpacing: '.1em', textTransform: 'uppercase', color: C.text3,
      borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
    }}>{label}</th>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
        {SORTS.map(([key, label, help]) => (
          <button key={key} type="button" onClick={() => setSort(key)} title={help}
            aria-pressed={sort === key}
            style={{
              border: `1px solid ${sort === key ? C.orange : C.border}`,
              background: sort === key ? 'rgba(249,115,22,.12)' : 'transparent',
              color: sort === key ? C.orange : C.text2,
              borderRadius: 999, padding: '3px 11px', fontSize: 9.5, fontWeight: 800,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>{label}</button>
        ))}
      </div>

      {/* See PennantRace for why this wrapper exists: body { overflow-x: clip }
          turns a too-wide table into a silently truncated one. */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: NUM_FONT, minWidth: 320 }}>
        <caption className="sr-only">
          Comeback wins and blown leads by team, sorted by {active?.[1]}
        </caption>
        <thead>
          <tr>
            {th('', 'left')}{th('Team', 'left')}{th('W-L', 'right', 'sm-hide')}
            {th('Came back')}{th('Rate', 'right', 'sm-hide')}{th('Biggest')}{th('Gave away')}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.abbr} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '5px 6px', fontSize: 9.5, color: C.text3, width: 18 }}>{i + 1}</td>
              <td style={{ padding: '5px 6px' }}><b style={{ fontSize: 11.5, color: C.text }}>{t.abbr}</b></td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text3, whiteSpace: 'nowrap' }}>
                {t.wins}-{t.losses}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11.5, fontWeight: 800,
                           color: sort === 'comeback_wins' ? C.orange : C.text }}>
                {t.comeback_wins}
              </td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5,
                           color: sort === 'comeback_rate' ? C.orange : C.text2 }}>
                {Math.round((Number(t.comeback_rate) || 0) * 100)}%
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5,
                           color: t.biggest_comeback >= (data.notable_deficit || 4) ? C.yellow
                                 : sort === 'biggest_comeback' ? C.orange : C.text2 }}
                  title={t.top_comebacks?.[0]
                    ? `Biggest: down ${t.top_comebacks[0].deficit} to ${t.top_comebacks[0].opp} on ${t.top_comebacks[0].date}`
                    : undefined}>
                {t.biggest_comeback ? `−${t.biggest_comeback}` : '—'}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5,
                           color: sort === 'blown_leads' ? C.orange : C.text3 }}
                  title={t.top_collapses?.[0]
                    ? `Worst: led ${t.top_collapses[0].lead} and lost to ${t.top_collapses[0].opp} on ${t.top_collapses[0].date}`
                    : undefined}>
                {t.blown_leads}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {data.method} Read from {Number(data.games || 0).toLocaleString()} finished games.
      </p>
    </div>
  )
}
