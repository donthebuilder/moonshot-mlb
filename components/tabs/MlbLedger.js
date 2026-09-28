'use client'
import { C, NUM_FONT } from '../../lib/theme'
import PageHeader from '../PageHeader'
import HomerLedger from '../HomerLedger'
import FirstScorers from '../ledger/FirstScorers'
import { leaveTarget } from '../../lib/openTarget'

// 🧾 THE LEDGER, ITS OWN TAB (2026-09-27, ledger plan step 3). Donovan: "i
// like this page a lot" -- and it was hidden inside Parlays, where nobody
// looks for it. The Homer Ledger itself is unchanged (same component, same
// numbers); First scorers joins it. Parlays keeps pairs, pools and the builder,
// and the Ledger lab (past nights, the season record, search) stays one tap
// away.
export default function MlbLedger({ players = [], slateDate = '', results, onPlayerClick, onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="MOONSHOT · LEDGER" title="The night in names and numbers" theme={C} numFont={NUM_FONT} accent={C.orange}
        note="Round numbers, the watchlist, what lines up with tonight, the look-out, name echoes -- and who hit the first homer of every game." />
      <HomerLedger players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} onNavigate={onNavigate} standalone />
      <FirstScorers sport="mlb" C={C} numFont={NUM_FONT} accent={C.orange}
        onOpenGame={onNavigate ? (pk) => { leaveTarget('game', pk); onNavigate('games') } : null}
        onOpenPlayer={(id) => { const p = players.find((x) => String(x?.player_id ?? x?.id) === String(id)); if (p) onPlayerClick?.(p) }} />
      {onNavigate && (
        <button type="button" onClick={() => onNavigate('combos')} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 4px', border: 'none', background: 'transparent', color: C.orange, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          Past nights, the season record and search → Ledger lab (in Parlays)
        </button>
      )}
    </div>
  )
}
