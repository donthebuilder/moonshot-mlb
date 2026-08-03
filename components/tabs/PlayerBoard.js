'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, playerId, clean, n } from '../../lib/player'
import { scoreFor, gradeFor, tierRole, tierColor } from '../../lib/scoring'
import { Empty, inputStyle, PanelTitle } from '../ui'
import PlayerModal from '../PlayerModal'

// Player — the modal's contents as a real board.
//
// On the Streamlit side this exists because that framework had no modal at
// all. It's worth keeping here for the opposite reason: a modal is a bad place
// to sit and read for five minutes, and this is the tab you leave open while
// you work through one hitter.

export default function PlayerBoard({ players, onAdd, onWatch, watchIds }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, 'hr') - scoreFor(a, 'hr')),
    [players],
  )

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return ranked.slice(0, 40)
    return ranked
      .filter((p) => `${nameOf(p)} ${teamOf(p)} ${oppOf(p)}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [ranked, query])

  const selected = useMemo(
    () => ranked.find((p) => playerId(p) === selectedId) || matches[0] || null,
    [ranked, matches, selectedId],
  )

  if (!ranked.length) return <Empty text="No players on this slate yet." />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ position: 'sticky', top: 12 }}>
        <input
          style={{ ...inputStyle(), width: '100%', marginBottom: 8 }}
          placeholder="Search a hitter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
          maxHeight: '72vh', overflowY: 'auto', background: C.bg2,
        }}>
          {matches.map((p) => {
            const id = playerId(p)
            const on = selected && playerId(selected) === id
            const role = tierRole(p)
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: 'none', cursor: 'pointer',
                  textAlign: 'left', color: on ? C.text : C.text2,
                  background: on ? C.bg3 : 'transparent',
                  borderLeft: `2px solid ${on ? C.green : 'transparent'}`,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nameOf(p)}
                  </span>
                  <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {teamOf(p)} vs {oppOf(p)} · {clean(p?.pitcher_name, 'TBD')}
                  </span>
                </span>
                <span style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: tierColor(role, C) }}>
                  {scoreFor(p, 'hr').toFixed(0)}
                </span>
              </button>
            )
          })}
          {!matches.length && (
            <div style={{ padding: 14, fontSize: 12, color: C.text3 }}>No hitter matches that.</div>
          )}
        </div>
      </div>

      <div>
        {selected ? (
          <>
            <PanelTitle
              title={nameOf(selected)}
              sub={`${teamOf(selected)} vs ${oppOf(selected)} · ${clean(selected?.pitcher_name, 'TBD')} · grade ${gradeFor(selected, 'hr')}`}
              right={
                <span style={{ display: 'flex', gap: 6 }}>
                  {onWatch && (
                    <button
                      onClick={() => onWatch(selected)}
                      style={{
                        ...inputStyle(), cursor: 'pointer', fontSize: 11, padding: '5px 10px',
                        color: watchIds?.has(playerId(selected)) ? '#06281a' : C.text2,
                        background: watchIds?.has(playerId(selected)) ? C.green : C.bg2,
                      }}
                    >{watchIds?.has(playerId(selected)) ? 'Watching' : 'Watch'}</button>
                  )}
                </span>
              }
            />
            <div style={{ marginTop: 10 }}>
              <PlayerModal player={selected} inline />
            </div>
          </>
        ) : (
          <Empty text="Pick a hitter on the left." />
        )}
      </div>
    </div>
  )
}
