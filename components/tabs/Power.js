'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import LongestBoard from './LongestBoard'
import DueBoard from './DueBoard'
import LuckReport from '../LuckReport'
import ParkBoard from '../ParkBoard'
import FenceBoard from '../FenceBoard'

// 🚀 POWER — Longest + Due, merged (2026-08-04).
//
// Two tabs were asking one question from opposite ends: who hits it FARTHEST
// (Longest — distance ceiling, park, air) and who's SITTING ON one (Due —
// drought against his own rate, with the recent-bombers strip). Same
// audience, same night, one tab with a toggle. Both boards arrive intact —
// nothing was cut, only the wall between them.

export default function PowerTab({ players, slateDate = '', results = null, onWatch, watchIds, onPlayerClick, initial = 'longest' }) {
  const [view, setView] = useState(initial)
  // Park click → filter the Longest board to that game (2026-08-07). If the
  // Due view is open, clicking a park flips to Longest first — the filter
  // only means something there.
  const [venueFilter, setVenueFilter] = useState('')
  const pickVenue = (v) => { setVenueFilter(v); if (v) setView('longest') }

  return (
    <div>
      {/* Tonight's parks, ranked — the page's weather report, above both boards */}
      <ParkBoard players={players} slateDate={slateDate} activeVenue={venueFilter} onVenueClick={pickVenue} onPlayerClick={onPlayerClick} />

      {/* 🧱 fence riders — pulled wall-scrapers vs tonight's actual wall */}
      <FenceBoard players={players} onPlayerClick={onPlayerClick} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setView('longest')} style={btnStyle(C.orange, view === 'longest')}>
          🚀 Longest — who hits it farthest
        </button>
        <button onClick={() => setView('due')} style={btnStyle(C.purple, view === 'due')}>
          ⏳ Due — who&apos;s sitting on one
        </button>
      </div>
      {/* 2026-08-09 spoon-feed pass: the two buttons name the boards, this
          names the decision each one is for — and warns about the way Due is
          most often misread. */}
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, marginBottom: 12, maxWidth: 700 }}>
        <b style={{ color: C.text2 }}>What this answers:</b>{' '}
        {view === 'longest'
          ? 'who hits the ball the farthest tonight — a distance board, not a probability board. It disagrees with the HR board regularly, and that is the point: use it for longest-homer markets and for spotting warning-track power that a friendly park turns into a homer.'
          : 'who is overdue for one. Read the HR/PA column, not the drought — a long gap with no power behind it is just a hitter who does not homer, and that is the single most common way to misread this board.'}
      </div>
      {view === 'longest'
        ? <LongestBoard players={players} results={results} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} venueFilter={venueFilter} onClearVenue={() => setVenueFilter('')} />
        : <DueBoard players={players} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />}

      {/* Luck lives with power on purpose: Due is distance-based regression,
          this is contact-quality regression — two lenses on the same idea. */}
      <LuckReport players={players} onPlayerClick={onPlayerClick} />
    </div>
  )
}
