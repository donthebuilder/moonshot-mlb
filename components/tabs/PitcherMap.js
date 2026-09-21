'use client'
import { useMemo, useState } from 'react'
import { C, TYPE } from '../../lib/theme'
import { groupPitchers } from '../../lib/data'
import { PanelTitle, Empty, inputStyle } from '../ui'
import PitcherHeatMap from '../PitcherHeatMap'

// PITCHER MAP (2026-09-21) — the picker around components/PitcherHeatMap.js.
// Same starter list every Pitchers.js chip already reads (lib/data.js's
// groupPitchers, off tonight's players array — no separate roster fetch),
// same pick-a-chip-then-search shape SprayBoard.js uses one tab over, so
// the two "field diagram" pages feel like siblings rather than one being
// dressed up and the other not.
export default function PitcherMap({ players = [] }) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(null)

  const starters = useMemo(() => groupPitchers(players), [players])
  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    return (q
      ? starters.filter((p) => `${p.pitcher_name} ${p.team} ${p.opponent_team}`.toLowerCase().includes(q))
      : starters
    ).slice(0, 30)
  }, [starters, query])

  const selected = useMemo(
    () => starters.find((p) => p.pitcher_id === pick) || matches[0] || null,
    [starters, matches, pick],
  )

  if (!starters.length) return <Empty text="No confirmed starters on this slate yet." />

  return (
    <div>
      <PanelTitle
        title="Pitcher map"
        sub="Where the league does its damage against him — real balls in play, this season"
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a starter…"
        style={{ ...inputStyle(), width: '100%', maxWidth: 320, margin: '8px 0 8px' }}
      />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {matches.map((p) => {
          const on = selected && selected.pitcher_id === p.pitcher_id
          return (
            <button
              key={p.pitcher_id ?? p.pitcher_name}
              onClick={() => setPick(p.pitcher_id)}
              title={`${p.pitcher_name} · ${p.team} vs ${p.opponent_team}`}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                fontSize: TYPE.label, fontWeight: 700,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.14)' : 'transparent',
                color: on ? C.orange : C.text2,
              }}
            >{p.pitcher_name.split(' ').slice(-1)[0]}</button>
          )
        })}
      </div>

      {selected && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: TYPE.name, fontWeight: 800 }}>{selected.pitcher_name}</span>
            <span style={{ fontSize: TYPE.body, color: C.text3 }}>
              {selected.pitcher_throws !== '?' ? `Throws ${selected.pitcher_throws} · ` : ''}
              {selected.team} vs {selected.opponent_team}
            </span>
          </div>
          <PitcherHeatMap pitcherId={selected.pitcher_id} pitcherName={selected.pitcher_name} />
        </>
      )}
    </div>
  )
}
