'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import Pairs from './Pairs'
import Pools from './Pools'
import PairHistory from './PairHistory'
import Builder from '../Builder'
import HomerLedger from '../HomerLedger'

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

// 🧱 BUILDER IS ITS OWN VIEW (2026-08-17). Donovan: "MAKE THE PAIR UILDER ITS
// OWN TAB ONCE THE MERGE HAPPENS IN SIDE OF COMBOS." It sits between the bot's
// opinion (Pairs, Pools) and the archive (History), which is the order the work
// happens in: see what the bot says, build your own, check the record.
const VIEWS = [
  ['pairs', '🤝 Pairs'],
  ['pools', '🎱 Pools'],
  ['builder', '🧱 Builder'],
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
  // 2026-08-16, the follow-up pass. Pairs and Pools gained optional `odds`
  // and `slateDate` on the day of the merge, and both fell back to fetching
  // odds_latest.json themselves because Dashboard.js was being held by other
  // workers at the time. Dashboard already had both values in hand for nine
  // other tabs. They are threaded through now, so the builder stops issuing a
  // second fetch for a payload the page has already loaded and dates its own
  // history off the slate rather than re-deriving it from the rows. The
  // fallbacks stay in place — nothing depends on these being supplied.
  odds = null,
  slateDate = '',
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

      {/* 🧾 THE HOMER LEDGER, on the pairs view — his own suggestion ("it
          can maybe go in the pairs part of the pools page as well"), and it
          earns the slot for a reason worth writing down: a two-man ticket is
          the one bet on this site where a homer landing changes your night
          mid-flight. Watching legs come in is the same act as watching the
          ledger fill. Live only, same as everywhere else — before first pitch
          it has nothing to say and Combos is a pregame page most of the time.
          See the long note at the Home mount for the whole placement story. */}
      {/* live_mode gate removed 2026-08-17 — the ledger owns its own empty
          state now, and gating the mount hid it during exactly the hours
          someone would be looking for it. See components/HomerLedger.js. */}
      {view === 'pairs' && (
        <HomerLedger players={allPlayers} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} />
      )}

      {view === 'pairs' && (
        <Pairs
          players={allPlayers}
          pairBuilder={pairBuilder}
          pairHistorySummary={pairSummary}
          results={results}
          focusPlayerId={focusPlayerId}
          onClearFocus={onClearFocus}
          onPlayerClick={onPlayerClick}
          odds={odds}
          slateDate={slateDate}
        />
      )}
      {view === 'pools' && (
        <Pools
          players={players}
          results={results}
          pairBuilder={pairBuilder}
          pairHistorySummary={pairSummary}
          onPlayerClick={onPlayerClick}
          odds={odds}
          slateDate={slateDate}
        />
      )}
      {view === 'builder' && (
        <Builder
          players={players}
          allPlayers={allPlayers}
          pairHistorySummary={pairSummary}
          odds={odds}
          slateDate={slateDate}
          onPlayerClick={onPlayerClick}
        />
      )}
      {view === 'history' && (
        <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={onPlayerClick} />
      )}
    </div>
  )
}
