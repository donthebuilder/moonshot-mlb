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
import DenseTable from './DenseTable'
import TeamMark from './TeamMark'

const SORTS = [
  ['comeback_wins', 'Most comebacks', 'Games won after trailing'],
  ['comeback_rate', 'Best rate', 'Share of their wins that needed a comeback'],
  ['biggest_comeback', 'Biggest hole', 'Largest deficit they erased and won'],
  ['blown_leads', 'Most given away', 'Games they led and lost'],
]

export default function ComebackBoard() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  // The pills pick the question (the twelve shown) and open the sheet sorted
  // by it; the sheet's own headers then sort those twelve any way you like.
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
    return <Empty text="No comeback board yet. It fills in with the next update." />
  }

  const rows = [...(data?.teams || [])].sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0)).slice(0, 12)
  const active = SORTS.find(([k]) => k === sort)

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
        {SORTS.map(([key, label, help]) => (
          <button key={key} type="button" onClick={() => setSort(key)} title={help}
            aria-pressed={sort === key}
            style={{
              border: `1px solid ${sort === key ? C.orange : C.border}`,
              background: sort === key ? `${C.orange}1f` : 'transparent',
              color: sort === key ? C.orange : C.text2,
              borderRadius: 999, padding: '3px 11px', fontSize: 9.5, fontWeight: 800,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>{label}</button>
        ))}
      </div>

      {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). Was a
          hand-rolled <table> on SortTh. */}
      <DenseTable key={sort} bare noGroups rows={rows.map((t, i) => ({ ...t, _key: t.abbr || t.name || i, rank: i + 1, wlN: Number(t.wins) - Number(t.losses) }))}
        columns={[
          { key: 'rank', label: '#', heat: false, w: 26 },
          { key: 'abbr', label: 'Team', heat: false, sticky: true, w: 90, fmt: (v, t) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {v && v !== '?' ? <TeamMark sport="mlb" abbr={v} variant="logo" px={16} /> : null}<b>{v && v !== '?' ? v : (t.name || '?')}</b>
            </span>) },
          { key: 'wlN', label: 'W-L', w: 54, fmt: (_, t) => `${t.wins}-${t.losses}`, tone: () => ({ color: C.text3 }) },
          { key: 'comeback_wins', label: 'Came back', w: 70, dp: 0, primary: true, tone: () => ({ color: C.text, weight: 800 }) },
          { key: 'comeback_rate', label: 'Rate', w: 50, fmt: (v) => `${Math.round((Number(v) || 0) * 100)}%` },
          { key: 'biggest_comeback', label: 'Biggest', w: 58, fmt: (v, t) => <span title={t.top_comebacks?.[0] ? `Biggest: down ${t.top_comebacks[0].deficit} to ${t.top_comebacks[0].opp} on ${t.top_comebacks[0].date}` : undefined}>{v ? `−${v}` : '—'}</span>,
            tone: (n) => (n >= (data.notable_deficit || 4) ? { color: C.yellow } : null) },
          { key: 'blown_leads', label: 'Gave away', w: 70, tone: () => ({ color: C.text3 }), fmt: (v, t) => <span title={t.top_collapses?.[0] ? `Worst: led ${t.top_collapses[0].lead} and lost to ${t.top_collapses[0].opp} on ${t.top_collapses[0].date}` : undefined}>{v}</span> },
        ]}
        initialSort={{ key: sort, dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={12}
        caption={`Comeback wins and blown leads by team, sorted by ${active?.[1] || sort}`} />

      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {data.method} Read from {Number(data.games || 0).toLocaleString()} finished games.
      </p>
    </div>
  )
}
