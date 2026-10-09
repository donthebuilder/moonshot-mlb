'use client'
import PageHeader from '../../PageHeader'
import PairHistV2Table from '../../PairHistV2Table'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

// 🏒 PAIRS (2026-10-07): two skaters who each scored on the same day, four seasons, active players only.
// MOONSHOT's Pair history, hockey edition: the same table component (components/PairHistV2Table.js), fed
// pairhist_v2_nhl.json. Measured from the league's per-game reports; nothing here is a LAMP score.
export default function Pairs({ onOpenPlayer }) {
  return (
    <div>
      <PageHeader eyebrow="LAMP · PAIRS" title="Pairs, four seasons"
        note="Two skaters who each scored on the same day. Active players only."
        theme={C} numFont={NUM_FONT} accent={C.ice} />
      <PairHistV2Table sport="nhl" onOpenPlayer={(p) => onOpenPlayer?.(p.player_id)} />
    </div>
  )
}
