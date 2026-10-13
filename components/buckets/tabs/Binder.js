'use client'
// BUCKETS' Binder: the shared binder (components/binder/Binder.js) with tonight's BUCKETS board as the source of the empty state's three real suggestions (LAMP's shape).
// HIDDEN with the rest of BUCKETS (a PREVIEW sport: the card routes it reads answer only a visitor lib/nba/gate.js lets in). Its five cards (lib/cards/moments.js NBA_MOMENTS)
// are counted from GRADED regular-season rows, so until the regular season has graded games the binder is empty and says how to collect.
import { useMemo } from 'react'
import Binder from '../../binder/Binder'
import { boardPicks } from '../../binder/boardPicks'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'

export default function BucketsBinder() {
  const { data: board } = useBucketsBoard(null, 'pts')
  const picks = useMemo(() => boardPicks('nba', (board?.rows || []).filter((r) => r.score != null)), [board])
  return <Binder sport="nba" board={picks} />
}
