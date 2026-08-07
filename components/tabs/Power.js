'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import LongestBoard from './LongestBoard'
import DueBoard from './DueBoard'
import LuckReport from '../LuckReport'
import ParkBoard from '../ParkBoard'

// 🚀 POWER — Longest + Due, merged (2026-08-04).
//
// Two tabs were asking one question from opposite ends: who hits it FARTHEST
// (Longest — distance ceiling, park, air) and who's SITTING ON one (Due —
// drought against his own rate, with the recent-bombers strip). Same
// audience, same night, one tab with a toggle. Both boards arrive intact —
// nothing was cut, only the wall between them.

export default function PowerTab({ players, onWatch, watchIds, onPlayerClick, initial = 'longest' }) {
  const [view, setView] = useState(initial)
  // Park click → filter the Longest board to that game (2026-08-07). If the
  // Due view is open, clicking a park flips to Longest first — the filter
  // only means something there.
  const [venueFilter, setVenueFilter] = useState('')
  const pickVenue = (v) => { setVenueFilter(v); if (v) setView('longest') }

  return (
    <div>
      {/* Tonight's parks, ranked — the page's weather report, above both boards */}
      <ParkBoard players={players} activeVenue={venueFilter} onVenueClick={pickVenue} onPlayerClick={onPlayerClick} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setView('longest')} style={btnStyle(C.orange, view === 'longest')}>
          🚀 Longest — who hits it farthest
        </button>
        <button onClick={() => setView('due')} style={btnStyle(C.purple, view === 'due')}>
          ⏳ Due — who&apos;s sitting on one
        </button>
      </div>
      {view === 'longest'
        ? <LongestBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} venueFilter={venueFilter} onClearVenue={() => setVenueFilter('')} />
        : <DueBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />}

      {/* Luck lives with power on purpose: Due is distance-based regression,
          this is contact-quality regression — two lenses on the same idea. */}
      <LuckReport players={players} onPlayerClick={onPlayerClick} />
    </div>
  )
}
