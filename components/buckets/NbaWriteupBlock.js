'use client'
// THE CALL, ON BUCKETS' GAME PAGE (2026-10-09). The write-up the post carries (lib/writeups/nba.js):
// the points call, and the double-double / triple-double calls, built from the boards (/api/buckets/board pts, dd, td), drawn by the shared
// components/GameWriteupBlock -- LAMP's NhlWriteupBlock is the template. No call in the game, nothing shown.
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nba/theme'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { buildNbaWriteup, nbaGameInput } from '../../lib/writeups/nba'
import GameWriteupBlock from '../GameWriteupBlock'

const THEME = { C, NUM_FONT, TYPE, accent: C.purple }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · the board is set' : ' · locks at tip'}`,
  meta: (p) => `${p.team}${p.position ? ` ${p.position}` : ''} · ${p.markets.map((m) => m.word).join(' + ')}${p.role === 'TOP' ? ' · TOP' : ''}`,
  // the player's head row as chips on a phone (GameWriteupBlock chips): one score chip per market, the best glows
  chips: (p) => [
    ...p.markets.flatMap((m) => [
      { value: m.score, label: `${String(m.word).toUpperCase()} · BUCKETS`, hot: m.role === 'TOP' },
      m.rank != null && m.of && { value: `#${m.rank}`, label: `of ${m.of}` },
    ]),
    { label: `${p.team}${p.position ? ` ${p.position}` : ''}` },
    p.role === 'TOP' && { label: 'TOP' },
  ].filter(Boolean),
  numbers: (p) => p.markets.map((m) => `${m.word} · BUCKETS score ${m.score}${m.rank != null && m.of ? ` · #${m.rank} of ${m.of} tonight` : ''}`).join(' | '),
}

export default function NbaWriteupBlock({ gameId, date, onOpenPlayer }) {
  const pts = useBucketsBoard(date || null, 'pts'), dd = useBucketsBoard(date || null, 'dd'), td = useBucketsBoard(date || null, 'td')
  const w = useMemo(() => {
    const input = nbaGameInput({ pts: pts.data, dd: dd.data, td: td.data }, gameId)
    return input ? buildNbaWriteup(input) : null
  }, [pts.data, dd.data, td.data, gameId])
  if (!w) return null
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} chips onOpen={onOpenPlayer ? (p) => onOpenPlayer(p.player_id) : null} />
}
