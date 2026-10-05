'use client'
// MOONSHOT's Ledger tab, as data for the shared page (BATCH-ONE-SITE step 1,
// 2026-10-05). The ledger itself is HomerLedger -- MOONSHOT's own frame (its header
// row, night picker, pregame box), whose sections go through components/ledger/
// LedgerBody like every other sport's -- so it sits in the page's `lead` slot.
import { C, NUM_FONT } from '../../theme'
import HomerLedger from '../../../components/HomerLedger'
import { leaveTarget } from '../../openTarget'
import MlbTonight from '../../../components/tonight/MlbTonight'

export function useMlbLedger({ players = [], slateDate = '', results, onPlayerClick, onNavigate }) {
  return {
    head: { eyebrow: 'MOONSHOT · LEDGER', title: 'The night in names and numbers', theme: C, numFont: NUM_FONT, accent: C.orange,
      note: 'Round numbers, the watchlist, what lines up with tonight, the look-out, name echoes -- and who hit the first homer of every game.' },
    // TONIGHT (step 5): Home's strip, without its 'full Ledger' link -- this is the Ledger
    tonight: <MlbTonight players={players} results={results} slateDate={slateDate} onPlayerClick={onPlayerClick} />,
    lead: <HomerLedger players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} onNavigate={onNavigate} standalone />,
    first: {
      sport: 'mlb', C, numFont: NUM_FONT, accent: C.orange,
      onOpenGame: onNavigate ? (pk) => { leaveTarget('game', pk); onNavigate('games') } : null,
      onOpenPlayer: (id) => { const p = players.find((x) => String(x?.player_id ?? x?.id) === String(id)); if (p) onPlayerClick?.(p) },
    },
    footer: onNavigate ? (
      <button type="button" onClick={() => onNavigate('combos')} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 4px', border: 'none', background: 'transparent', color: C.orange, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
        Past nights, the season record and search → Ledger lab (in Parlays)
      </button>
    ) : null,
  }
}
