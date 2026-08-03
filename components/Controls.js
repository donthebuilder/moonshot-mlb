'use client'
import { useMemo } from 'react'
import { C } from '../lib/theme'
import { teamOf } from '../lib/player'
import { inputStyle, selectStyle } from './ui'

export default function Controls({ query, setQuery, team, setTeam, players }) {
  const teams = useMemo(() => {
    const s = new Set()
    players.forEach((p) => {
      const t = teamOf(p)
      if (t) s.add(t)
    })
    return Array.from(s).sort()
  }, [players])

  return (
    <div
      className="dash-controls"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 160px',
        gap: 8,
        margin: '14px 0 14px',
      }}
    >
      <input
        type="search"
        placeholder="Search player, team, or pitcher…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={inputStyle()}
      />
      <select value={team} onChange={(e) => setTeam(e.target.value)} style={selectStyle()}>
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}
