'use client'
// BUCKETS' TONIGHT strip (2026-10-04): WENT = the ledger's PTS 25+ rows (the night's
// clearers), STILL TO GO = the PTS board's LOCKED rows (a preview isn't a call) in
// games not final, not yet at 25. LINING UP (2026-10-05) = the Numerology tab's carriers
// (lib/nba/alignRows over /api/buckets/numerology, cached 5 min). The ledger read here doesn't
// poll (it refreshes on ↻); the Ledger tab keeps its own 30 s poll.
import { useMemo } from 'react'
import TonightStrip from '../TonightStrip'
import { tonightNba } from '../../lib/tonight'
import { useBucketsLedger, useBucketsNumerology } from '../../lib/nba/useBuckets'
import { bucketsAlignModel, bucketsTonight } from '../../lib/nba/alignRows'

export default function NbaTonight({ board, date = null, onOpenPlayer, setTab }) {
  const ledger = useBucketsLedger(date, { poll: false })
  const num = useBucketsNumerology(date)
  const out = useMemo(() => {
    if (!board?.games?.length) return null
    const cleared = (ledger.data?.rows || []).filter((r) => r.market === 'pts')
    const t = bucketsTonight(num.data, bucketsAlignModel(num.data, board))
    return tonightNba({ rows: board.rows || [], games: board.games, cleared, aligned: t?.byBotScore || [], root: num.data?.dateRoot || null })
  }, [board, ledger.data, num.data])
  return <TonightStrip data={out} words={{ went: 'PTS 25+' }} onOpen={(id) => onOpenPlayer?.(id)} onLedger={setTab ? () => setTab('ledger') : null} />
}
