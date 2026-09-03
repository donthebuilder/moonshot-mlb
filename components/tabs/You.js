'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import MyPicks from './MyPicks'
import Watchlist from './Watchlist'
import YourPlayers from '../YourPlayers'
import { playerId } from '../../lib/player'

// 🫵 YOU — My Picks and the Watchlist under one roof (2026-08-16).
//
// Part of the approved tab consolidation. The rule: a TAB is a question you
// arrive with, a VIEW is an answer. My Picks and the Watchlist are both YOUR
// material — the calls you made against the bot, and the names you saved —
// one question ("how am I doing, and who am I following") in two forms. A
// game tab and its roster.
//
// THIN SHELL, on purpose: both components mount unmodified with exactly the
// props Dashboard always gave them, so the merge cannot have changed how
// either behaves — including both device-local stores (my_picks_v1 and the
// watch ledger), which live inside the components and never touched routing.
// Old deep links (#tab=mypicks / #tab=watch) land here via alias routes
// carrying `initial`.

// ── THE WATCHLIST OPENS FIRST (2026-08-24) ──────────────────────────────────
// Donovan: "watch list needs to be the first tab to open on you."
//
// Right call, and the ordering says why: the Watchlist is a LIST OF NAMES you
// already decided you cared about — you arrive at YOU to see how your guys are
// doing. My Picks is a thing you go and DO, one slot at a time, and it is
// worth arriving at deliberately. So the roster leads and the game is one tap
// behind it. #tab=mypicks still lands on My Picks — a link someone clicked is
// a stronger signal than a default.
// 2026-08-24: text-only — secondary/sub-tab pills are emoji-free site-wide.
const VIEWS = [
  ['watch', 'Watchlist'],
  ['picks', 'My Picks'],
]

export default function You({
  players = [],             // allPlayers — both components always got the full list
  watchItems = [],
  pairSummary = null,
  results = null,
  odds = null,
  slateDate = '',
  mode = 'today',
  onWatch = null,
  onAdd = null,
  onPlayerClick = null,
  initial = 'watch',
}) {
  const [view, setView] = useState(VIEWS.some(([k]) => k === initial) ? initial : 'watch')

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={btnStyle(C.orange, view === k)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'picks' && (
        <MyPicks
          players={players}
          results={results}
          odds={odds}
          slateDate={slateDate}
          onPlayerClick={onPlayerClick}
        />
      )}
      {view === 'watch' && (
        <>
        {/* Same section as Home's (2026-09-03). The watchlist tab is where
            you go ON PURPOSE to look at your guys, so it must not be the
            weaker of the two views of them. */}
        <YourPlayers
          players={players}
          watchIds={new Set((watchItems || []).map(playerId))}
          onPlayerClick={onPlayerClick}
          collapsible={false}
        />
        <Watchlist
          items={watchItems}
          players={players}
          pairSummary={pairSummary}
          results={results}
          slateDate={slateDate}
          mode={mode}
          onWatch={onWatch}
          onAdd={onAdd}
          onPlayerClick={onPlayerClick}
        />
        </>
      )}
    </div>
  )
}
