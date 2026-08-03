'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId } from '../../lib/player'
import { scoreFor } from '../../lib/scoring'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'

const TITLES = {
  hr:  ['HR Board',          'Top home run picks'],
  hrr: ['HRR Board',         'Top runs + RBI picks'],
  hit: ['Hits Board',        'Top base-hit picks'],
  tb:  ['Total Bases Board', 'Top contact / total-base picks'],
}

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, limit = 60 }) {
  const [title, sub] = TITLES[type] || TITLES.hr

  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)).slice(0, limit),
    [players, type, limit],
  )

  if (!ranked.length) return <Empty text={`No ${type.toUpperCase()} picks yet.`} />

  return (
    <div>
      {/* Section header — matches Games.js game header style */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {ranked.length} players
        </div>
      </div>

      <Grid>
        {ranked.map((p) => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type={type}
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </Grid>
    </div>
  )
}
