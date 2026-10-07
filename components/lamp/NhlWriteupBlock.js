'use client'
// THE CALL, ON LAMP'S GAME PAGE (2026-10-05). The write-up the NHL post carries
// (lib/writeups/nhl.js), from the same goal-board game, drawn by components/GameWriteupBlock.
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nhl/theme'
import { buildNhlWriteup } from '../../lib/writeups/nhl'
import GameWriteupBlock from '../GameWriteupBlock'
import { PlayerDepth, GameDepth } from './NhlDepth'

const THEME = { C, NUM_FONT, TYPE, accent: C.ice }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · the board is set' : ' · a preview until the lock'}`,
  meta: (p) => `${p.team} ${p.position} · ${p.role}`,
  numbers: (p) => [p.score != null ? `LAMP score ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of} tonight${p.band ? ` (${p.band.word})` : ''}` : null].filter(Boolean).join(' · '),
}

export default function NhlWriteupBlock({ game, onOpenPlayer }) {
  const w = useMemo(() => buildNhlWriteup(game), [game])
  // THE FULL WRITE-UP's depth (lib/writeups/nhl.js nhlDepth / nhlGameDepth): drawn, and its inputs fetched, only once it is opened
  const depth = useMemo(() => ({
    player: (p) => { const row = (game.rows || []).find((r) => String(r.playerId) === String(p.player_id)); return row ? <PlayerDepth key={p.player_id} row={row} game={game} scope="game" /> : null },
    game: <GameDepth game={game} />,
  }), [game])
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} depth={depth} onOpen={onOpenPlayer ? (p) => onOpenPlayer(p.player_id) : null} />
}
