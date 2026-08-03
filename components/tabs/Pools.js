'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, recent375, launchAngle } from '../../lib/player'
import { lanePass, LANES, scoreFor } from '../../lib/scoring'
import { PanelTitle, Grid, Empty, btnStyle } from '../ui'
import PlayerCard from '../PlayerCard'
import HitterHeat from '../HitterHeat'

// Reads the raw pull-rate field directly -- same approach as Leaders.js,
// since lib/player doesn't export a dedicated pullRate helper.
function pullRate(p) {
  const v = p?.recent_pull_rate ?? p?.pull_rate ?? null
  return v == null ? 0 : Number(v)
}

// Same simple "unique stat" quick filters as Leaders.js, kept consistent
// across both pages rather than inventing a different filter set per page.
const QUICK_FILTERS = [
  { key: 'pull', label: 'Min Pull%',   get: pullRate,    step: 5, isPct: true },
  { key: 'la',   label: 'Min Launch°', get: launchAngle, step: 1, isPct: false },
  { key: '375',  label: 'Min 375+',    get: recent375,   step: 1, isPct: false },
]

export default function Pools({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const [lane, setLane] = useState('strong')
  const [quickFilters, setQuickFilters] = useState({})

  const setFilter = (key, rawValue) => {
    const value = rawValue === '' ? null : Number(rawValue)
    setQuickFilters((prev) => ({ ...prev, [key]: value }))
  }

  const filtered = useMemo(() => {
    let pool = players.filter((p) => lanePass(p, lane))
    for (const qf of QUICK_FILTERS) {
      const rawMin = quickFilters[qf.key]
      if (rawMin != null && rawMin > 0) {
        const min = qf.isPct ? rawMin / 100 : rawMin
        pool = pool.filter((p) => qf.get(p) >= min)
      }
    }
    return pool.sort((a, b) => scoreFor(b, 'hr') - scoreFor(a, 'hr'))
  }, [players, lane, quickFilters])

  return (
    <div>
      <PanelTitle title="Pools" sub={`${filtered.length} players in ${LANES.find((l) => l[0] === lane)?.[1] || ''}`} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {LANES.map(([key, label]) => (
          <button key={key} onClick={() => setLane(key)} style={btnStyle(key === 'avoid' ? C.red : C.orange, lane === key)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '.05em' }}>Quick filters</span>
        {QUICK_FILTERS.map((qf) => (
          <label key={qf.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.text2 }}>
            {qf.label}
            <input
              type="number"
              step={qf.step}
              min={0}
              placeholder="—"
              value={quickFilters[qf.key] ?? ''}
              onChange={(e) => setFilter(qf.key, e.target.value)}
              style={{
                width: 56, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
                padding: '3px 6px', fontSize: 11, color: C.text, fontFamily: NUM_FONT, outline: 'none',
              }}
            />
            {qf.isPct ? '%' : ''}
          </label>
        ))}
      </div>
      {!filtered.length ? (
        <Empty text="No players match this lane right now." />
      ) : (
        <>
        {/* The lane already decided WHO qualifies. This says what the lane
            actually looks like -- whether it's one shape of hitter or a
            grab bag, which the card grid can't show. */}
        <HitterHeat
          players={filtered}
          type="hr"
          title={LANES.find((l) => l[0] === lane)?.[1] || 'Pool'}
          showTable={false}
          onPlayerClick={onPlayerClick}
        />
        <Grid>
          {filtered.slice(0, 60).map((p) => (
            <PlayerCard
              key={playerId(p)}
              p={p}
              type="hr"
              onAdd={onAdd}
              onWatch={onWatch}
              watched={watchIds.has(playerId(p))}
              onClick={() => onPlayerClick?.(p)}
            />
          ))}
        </Grid>
        </>
      )}
    </div>
  )
}
