'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, clean, hrScore } from '../../lib/player'
import { PanelTitle, Empty, inputStyle } from '../ui'
import SprayField from '../SprayField'
import HRPitchProfile from '../HRPitchProfile'
import { rampColor, inkFor } from '../Heatmap'

// Spray tab.
//
// The old version handed the whole viewport to one ballpark drawing. A spray
// chart is a small-multiple: it answers "where does this guy hit it" in about
// two seconds and then you want the numbers next to it. So the field is capped,
// and the pitch profile sits underneath rather than off screen.

export default function SprayBoard({ players = [], slateMode, onPlayerClick }) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(null)

  const ranked = useMemo(
    () => [...players].sort((a, b) => hrScore(b) - hrScore(a)),
    [players],
  )
  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    return (q
      ? ranked.filter((p) => `${nameOf(p)} ${teamOf(p)} ${oppOf(p)}`.toLowerCase().includes(q))
      : ranked
    ).slice(0, 30)
  }, [ranked, query])

  const selected = useMemo(
    () => ranked.find((p) => (p.player_id ?? nameOf(p)) === pick) || matches[0] || null,
    [ranked, matches, pick],
  )

  if (!players.length) return <Empty text="No players on this slate yet." />

  const lo = Math.min(...matches.map(hrScore), 0)
  const hi = Math.max(...matches.map(hrScore), 1)

  return (
    <div>
      <PanelTitle
        title="Spray"
        sub="Where each hitter puts the ball — and what he homers off"
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a hitter…"
        style={{ ...inputStyle(), width: '100%', maxWidth: 320, margin: '8px 0 8px' }}
      />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {matches.slice(0, 18).map((p) => {
          const id = p.player_id ?? nameOf(p)
          const on = selected && (selected.player_id ?? nameOf(selected)) === id
          const bg = rampColor(hrScore(p), lo, hi)
          return (
            <button
              key={id}
              onClick={() => setPick(id)}
              title={`HR ${hrScore(p).toFixed(1)}`}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 700,
                border: `1px solid ${on ? C.orange : 'transparent'}`,
                background: bg, color: inkFor(bg),
                boxShadow: on ? `0 0 0 1px ${C.orange}` : 'none',
              }}
            >{nameOf(p).split(' ').slice(-1)[0]}</button>
          )
        })}
      </div>

      {selected && (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{nameOf(selected)}</span>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(selected)} vs {oppOf(selected)} · {clean(selected?.pitcher_name, 'TBD')} ·
              {' '}HR {hrScore(selected).toFixed(1)}
            </span>
            <button
              onClick={() => onPlayerClick?.(selected)}
              style={{
                marginLeft: 'auto', padding: '3px 10px', fontSize: 10.5, fontWeight: 700,
                borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`,
                background: 'transparent', color: C.text3,
              }}
            >Open full card</button>
          </div>

          <SprayField player={selected} height={320} slateMode={slateMode} />
          <HRPitchProfile player={selected} slateMode={slateMode} />
        </>
      )}
    </div>
  )
}
