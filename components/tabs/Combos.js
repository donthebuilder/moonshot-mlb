'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import Pairs from './Pairs'
import Pools from './Pools'
import PairHistory from './PairHistory'

// 🎟 COMBOS — Pairs, Pools and their history under one roof (2026-08-16).
//
// Part of the approved tab consolidation ("show me a plan first" → plan →
// "yes do your thing get started"). The rule the plan runs on: a TAB is a
// question you arrive with, a VIEW is an answer you switch between once
// you're there. Pairs, Pools and PairHistory are one question — "what
// combination bet should I build tonight, and how have they done" — asked
// three ways, and PairHistory wasn't even in the tab bar: it was one of the
// eight orphan routes reachable only by URL. Same machinery, same bet type,
// three places. Now one.
//
// THIS FILE IS DELIBERATELY A THIN SHELL. The three components mount
// unmodified, with exactly the props Dashboard always gave them — no logic
// moved, no state shared, so nothing about how any of them behaves can have
// changed in the merge. Old deep links (#tab=pairs / #tab=pools /
// #tab=pairhist) land here via alias routes carrying `initial`.

const VIEWS = [
  ['pairs', '🤝 Pairs'],
  ['pools', '🎱 Pools'],
  ['history', '📜 History'],
]

export default function Combos({
  players = [],            // globally filtered list — what Pools always got
  allPlayers = [],          // unfiltered — what Pairs and History always got
  pairBuilder = null,
  pairSummary = null,
  results = null,
  focusPlayerId = null,
  onClearFocus = null,
  onPlayerClick = null,
  initial = 'pairs',
}) {
  const [view, setView] = useState(VIEWS.some(([k]) => k === initial) ? initial : 'pairs')

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={btnStyle(C.orange, view === k)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'pairs' && (
        <Pairs
          players={allPlayers}
          pairBuilder={pairBuilder}
          pairHistorySummary={pairSummary}
          results={results}
          focusPlayerId={focusPlayerId}
          onClearFocus={onClearFocus}
          onPlayerClick={onPlayerClick}
        />
      )}
      {view === 'pools' && (
        <Pools
          players={players}
          results={results}
          pairBuilder={pairBuilder}
          pairHistorySummary={pairSummary}
          onPlayerClick={onPlayerClick}
        />
      )}
      {view === 'history' && (
        <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={onPlayerClick} />
      )}
    </div>
  )
}
