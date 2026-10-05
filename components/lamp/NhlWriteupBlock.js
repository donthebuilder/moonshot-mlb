'use client'
// THE CALL, ON LAMP'S GAME PAGE (2026-10-05). The write-up the NHL post carries
// (lib/writeups/nhl.js), from the same goal-board game, drawn by components/GameWriteupBlock.
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nhl/theme'
import { buildNhlWriteup } from '../../lib/writeups/nhl'
import GameWriteupBlock from '../GameWriteupBlock'

const THEME = { C, NUM_FONT, TYPE, accent: C.ice }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · the board is set' : ' · a preview until the lock'}`,
  meta: (p) => `${p.team} ${p.position} · ${p.role}`,
  numbers: (p) => [p.score != null ? `LAMP score ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} tonight` : null, p.chance != null ? `goal chance ${p.chance}%` : null].filter(Boolean).join(' · '),
}

export default function NhlWriteupBlock({ game, onOpenPlayer }) {
  const w = useMemo(() => buildNhlWriteup(game), [game])
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} onOpen={onOpenPlayer ? (p) => onOpenPlayer(p.player_id) : null} />
}
