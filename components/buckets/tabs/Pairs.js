'use client'
import PageHeader from '../../PageHeader'
import PairHistV2Table from '../../PairHistV2Table'
import { C, NUM_FONT } from '../../../lib/nba/theme'

// 🤝 PAIRS (2026-10-15): LAMP's Pairs (components/lamp/tabs/Pairs.js), basketball's. The same table component
// (components/PairHistV2Table.js); the file is built from OUR OWN graded games (lib/nba/pairHistory.js via the gated
// /api/buckets/pairs): two players who each scored 25+ on the same day. Measured counts, never a BUCKETS score. Before the
// first graded game the table says it builds as the season plays and shows nothing else.
export default function Pairs({ onOpenPlayer }) {
  return (
    <div>
      <PageHeader eyebrow="BUCKETS · PAIRS" title="Pairs, 25-point games"
        note="Two players who each scored 25+ on the same day. Counted from our graded games; active players only."
        theme={C} numFont={NUM_FONT} accent={C.purple} />
      <PairHistV2Table sport="nba" onOpenPlayer={(p) => onOpenPlayer?.(p.player_id)} />
    </div>
  )
}
