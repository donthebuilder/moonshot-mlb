'use client'
// LAMP's Binder: the shared binder (components/binder/Binder.js) with tonight's LAMP board as the source of the empty state's three real suggestions.
import { useMemo } from 'react'
import Binder from '../../binder/Binder'
import { boardPicks } from '../../binder/boardPicks'
import { useLampBoardOnce } from '../../../lib/nhl/useLamp'

export default function LampBinder() {
  const { data: board } = useLampBoardOnce()
  const picks = useMemo(() => boardPicks('nhl', (board?.games || []).flatMap((g) => g.rows || [])), [board])
  return <Binder sport="nhl" board={picks} />
}
