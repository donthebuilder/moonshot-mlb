'use client'
// LAMP's TONIGHT strip (2026-10-04): the goal board Home already holds (useLampBoard,
// shared per URL), tonight's goals from the scores feed Home already holds (`today`),
// and the Numerology tab's own carriers (lib/nhl/alignRows) -> lib/tonight tonightNhl.
// The numerology read is the one new request on Home (/api/lamp/numerology, cached 5 min).
import { useMemo } from 'react'
import TonightStrip from '../TonightStrip'
import { tonightNhl } from '../../lib/tonight'
import { useLampNumerology } from '../../lib/nhl/useLamp'
import { lampAlignModel, lampTonight } from '../../lib/nhl/alignRows'

export default function NhlTonight({ today, board, date = null, onOpenPlayer, setTab }) {
  const num = useLampNumerology(date)
  const out = useMemo(() => {
    const games = board?.games || []
    if (!games.length) return null
    const scorers = []
    for (const g of today?.games || []) for (const goal of g.goals || []) if (goal?.scorer?.id) scorers.push({ id: goal.scorer.id, name: goal.scorer.name, team: goal.team })
    // no scores feed (the Ledger, step 5): the goal board's own rows carry each man's goals
    if (!today) for (const g of games) for (const r of g.rows || []) if (Number(r.goals) > 0) scorers.push({ id: r.playerId, name: r.name, team: r.team })
    const t = lampTonight(num.data, lampAlignModel(num.data, board))
    return tonightNhl({ games, scorers, aligned: t?.byBotScore || [], root: num.data?.dateRoot || null })
  }, [board, today, num.data])
  return <TonightStrip sport="nhl" data={out} onOpen={(id) => onOpenPlayer?.(id)} onLedger={setTab ? () => setTab('ledger') : null} />
}
