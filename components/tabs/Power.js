'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import LongestBoard from './LongestBoard'
import DueBoard from './DueBoard'

// 🚀 POWER — Longest + Due, merged (2026-08-04).
//
// Two tabs were asking one question from opposite ends: who hits it FARTHEST
// (Longest — distance ceiling, park, air) and who's SITTING ON one (Due —
// drought against his own rate, with the recent-bombers strip). Same
// audience, same night, one tab with a toggle. Both boards arrive intact —
// nothing was cut, only the wall between them.

export default function PowerTab({ players, onWatch, watchIds, onPlayerClick, initial = 'longest' }) {
  const [view, setView] = useState(initial)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setView('longest')} style={btnStyle(C.orange, view === 'longest')}>
          🚀 Longest — who hits it farthest
        </button>
        <button onClick={() => setView('due')} style={btnStyle(C.purple, view === 'due')}>
          ⏳ Due — who&apos;s sitting on one
        </button>
      </div>
      {view === 'longest'
        ? <LongestBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : <DueBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />}
    </div>
  )
}
