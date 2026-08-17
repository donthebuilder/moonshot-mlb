'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { GroupTicketBuilder } from './tabs/Pairs'
import PairBuilder from './PairBuilder'

// ═══════════════════════════════════════════════════════════════════════════
// 🧱 ONE BUILDER
// ═══════════════════════════════════════════════════════════════════════════
//
// Donovan, in capitals, after asking several times: "BUILD FROM GROUPS AND PAIR
// BUILDER SUPPOSED TO BE MERGED INTO ONE THING WTF. THEY DONT NEED TO BE ON
// BOTH POOLS AND PAIRS. MAKE THE PAIR BUILDER ITS OWN TAB ONCE THE MERGE
// HAPPENS INSIDE OF COMBOS."
//
// WHAT WAS ACTUALLY WRONG. Three build surfaces, two of them mounted twice:
//
//   · GroupTicketBuilder — on the Pairs view AND the Pools view. Same
//     component, same props, two copies. Set your legs in one and the other
//     knows nothing about it.
//   · PairBuilder (anchor -> partners) — buried at the very bottom of Pools,
//     under the pools list AND under the group builder.
//   · PairMe — a third entry point, on Pairs.
//
// A comment on the Pools mount defended the split: "it sits ABOVE the
// anchor-based PairBuilder rather than replacing it, because the two answer
// different questions and neither is redundant." The questions ARE different,
// and that was never the complaint. The complaint is that ONE JOB — build me a
// ticket — was spread across three widgets on two pages with nowhere to go and
// just do it. Different questions belong on one surface as modes, not scattered
// as separate widgets a user has to hunt for.
//
// SO: two modes, one component, one place, one tab.
//
//   FROM A MAN     -> PairBuilder. You know who you want; find him partners,
//                     with same-game history on each one.
//   FROM THE BOARD -> GroupTicketBuilder. No name yet; cross the bot's own
//                     designations and let the signals pick the legs.
//
// Both mount UNMODIFIED with exactly the props they already received. No logic
// moved, no state shared, so nothing about how either behaves can have changed
// in the merge — the same discipline Combos.js was built on. What changed is
// where they live and how many copies exist.
//
// Leg count lives with the group mode because that is the only mode it applies
// to. The anchor builder is a pair by definition.

const MODES = [
  {
    key: 'anchor',
    label: '👤 From a man',
    tag: 'pick your hitter, get partners with the reasons written out',
  },
  {
    key: 'groups',
    label: '🎯 From the board',
    tag: "cross the bot's own designations and let the signals pick the legs",
  },
]

export default function Builder({
  players = [],
  allPlayers = [],
  pairHistorySummary = null,
  odds = null,
  slateDate = '',
  onPlayerClick = null,
  initialMode = 'anchor',
}) {
  const [mode, setMode] = useState(
    MODES.some((m) => m.key === initialMode) ? initialMode : 'anchor',
  )
  // Defaulted to 3 because that is what the Pools mount defaulted to.
  const [size, setSize] = useState(3)

  const active = MODES.find((m) => m.key === mode) || MODES[0]
  const pool = players.length ? players : allPlayers

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.tag}
            style={{
              padding: '5px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
              fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
              border: `1px solid ${mode === m.key ? C.orange : C.border}`,
              background: mode === m.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: mode === m.key ? C.orange : C.text3,
            }}
          >{m.label}</button>
        ))}

        {mode === 'groups' && (
          <>
            <span style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 3px' }} />
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>LEGS</span>
            {[2, 3, 4].map((k) => (
              <button
                key={k}
                onClick={() => setSize(k)}
                style={{
                  padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
                  fontWeight: 800, fontFamily: NUM_FONT,
                  border: `1px solid ${size === k ? C.orange : C.border}`,
                  background: size === k ? 'rgba(249,115,22,.14)' : 'transparent',
                  color: size === k ? C.orange : C.text3,
                }}
              >{k}</button>
            ))}
          </>
        )}
      </div>

      {/* One line, and it is the mode's own tag — not a paragraph about
          building tickets. */}
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 12 }}>{active.tag}</div>

      {mode === 'anchor' && (
        <PairBuilder
          summary={pairHistorySummary}
          players={pool}
          onPlayerClick={onPlayerClick}
        />
      )}

      {mode === 'groups' && (
        // key on the size so changing the leg count remounts rather than
        // leaving a 3-leg ticket sitting under a "2 LEGS" control —
        // defaultSize is, as the name says, only read on mount.
        <GroupTicketBuilder
          key={`legs-${size}`}
          players={pool}
          odds={odds}
          slateDate={slateDate}
          defaultSize={size}
          onPlayerClick={onPlayerClick}
        />
      )}
    </div>
  )
}
