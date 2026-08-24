'use client'
import { useState } from 'react'
import { C } from '../../lib/theme'
import { btnStyle } from '../ui'
import Pairs from './Pairs'
import Pools from './Pools'
import PairHistory from './PairHistory'
import Builder from '../Builder'
import HomerLedger from '../HomerLedger'
import LedgerLab from './LedgerLab'
import Alignments from '../Alignments'

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
// ── POOLS LOST ITS PILL (2026-08-17) ────────────────────────────────────────
// Donovan: "pools can sit on the top of pairs oor somewhere on the pairs page so
// pools tab van be removed."
// Both are the bot's published combination bets off the same builder payload —
// two pills for one idea. Pools now sits ABOVE Pairs on the same view, which is
// the order he asked for and the right one anyway: pools are the bigger tickets,
// pairs the two-man cut. Three pills instead of four.
// #tab=pools still routes here and still lands on this view.
// ── ALIGNMENTS GETS ITS OWN PILL (2026-08-18) ───────────────────────────────
// Donovan: "esply in combos i think thats whewer it should fully live and and
// breath." Not a strip bolted onto Pairs — its own view, same tier as the
// other three, because it's the whole slate's numerology in one place and
// deserves the room. Its "Build a ticket around these →" button hands
// checked names to the Builder view below (see seedPins/onSeedConsumed).
// ── AND THE LEDGER GETS ITS OWN (2026-08-24) ────────────────────────────────
// Donovan: "what if [we take the] homer ledger and make it its own page in
// Alignments — do that, and make it damn near its own research tool."
//
// It had been mounted ON TOP of the Alignments view since the morning, which
// is not a page, it is a stack — you scrolled past the ledger to reach the
// thing the pill is named after, and the ledger read as a header for it. Same
// call as Alignments got on 2026-08-18, for the same reason: it is a whole
// subject and it deserves the room. Sits next to Alignments because that is
// where he put it, and the two are halves of one question — this is the night
// that landed, Alignments is the slate that hasn't.
const VIEWS = [
  ['pairs', '🤝 Pairs & Pools'],
  ['align', '🔮 Alignments'],
  ['ledger', '🧾 Homer ledger'],
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
  // 2026-08-18: threaded through for Alignments' watchlist cross-check —
  // "help see if the players on watch list are aligning" — Combos never
  // needed it before now, so it wasn't wired.
  watchIds = null,
  initial = 'pairs',
}) {
  // 'pools' is no longer a view of its own — the alias maps onto the combined
  // one rather than 404ing into the default silently.
  const [view, setView] = useState(() => {
    const want = initial === 'pools' ? 'pairs' : initial
    return VIEWS.some(([k]) => k === want) ? want : 'pairs'
  })

  // Alignments hands checked names here, then this jumps to the Builder view
  // with them pre-pinned. Cleared once Builder has consumed it so the SAME
  // pick set can be sent again later without going stale.
  const [seedPins, setSeedPins] = useState(null)
  const handleBuildAround = (rows) => {
    if (!rows?.length) return
    setSeedPins(rows)
    setView('builder')
  }

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

      {/* Pools first — the bigger tickets — then the two-man cut under it. */}
      {view === 'pairs' && (
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
      {view === 'pairs' && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
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
        </div>
      )}
      {/* ── THE LEDGER'S OWN PAGE (2026-08-24) ────────────────────────────
          It spent one morning stacked above Alignments here. See the note on
          VIEWS above for why it moved out into a pill of its own, and
          components/tabs/LedgerLab.js for what "research tool" turned out to
          mean: the night, and then the corpus of nights behind it. */}
      {view === 'ledger' && (
        <LedgerLab
          players={players}
          allPlayers={allPlayers}
          slateDate={slateDate}
          results={results}
          onPlayerClick={onPlayerClick}
        />
      )}
      {view === 'align' && (
        <Alignments
          players={allPlayers}
          watchIds={watchIds}
          slateDate={slateDate}
          onPlayerClick={onPlayerClick}
          onBuildAround={handleBuildAround}
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
          seedPins={seedPins}
          onSeedConsumed={() => setSeedPins(null)}
        />
      )}
      {view === 'history' && (
        <PairHistory summary={pairSummary} players={allPlayers} onPlayerClick={onPlayerClick} />
      )}
    </div>
  )
}
