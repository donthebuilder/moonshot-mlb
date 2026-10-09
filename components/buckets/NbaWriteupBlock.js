'use client'
// THE CALL, ON BUCKETS' GAME PAGE (2026-10-09). The double-double / triple-double write-up the post carries
// (lib/writeups/nba.js), built from the same two boards (/api/buckets/board dd, td), drawn by the shared
// components/GameWriteupBlock -- LAMP's NhlWriteupBlock is the template. No call in the game, nothing shown.
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nba/theme'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { buildNbaWriteup, nbaGameInput } from '../../lib/writeups/nba'
import GameWriteupBlock from '../GameWriteupBlock'

const THEME = { C, NUM_FONT, TYPE, accent: C.purple }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · the board is set' : ' · a preview until the lock'}`,
  meta: (p) => `${p.team}${p.position ? ` ${p.position}` : ''} · ${p.markets.map((m) => m.word).join(' + ')}${p.role === 'TOP' ? ' · TOP' : ''}`,
  numbers: (p) => p.markets.map((m) => `${m.word} · BUCKETS score ${m.score}${m.rank != null && m.of ? ` · #${m.rank} of ${m.of} tonight` : ''}`).join(' | '),
}

export default function NbaWriteupBlock({ gameId, date, onOpenPlayer }) {
  const dd = useBucketsBoard(date || null, 'dd'), td = useBucketsBoard(date || null, 'td')
  const w = useMemo(() => {
    const input = nbaGameInput({ dd: dd.data, td: td.data }, gameId)
    return input ? buildNbaWriteup(input) : null
  }, [dd.data, td.data, gameId])
  if (!w) return null
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} onOpen={onOpenPlayer ? (p) => onOpenPlayer(p.player_id) : null} />
}
