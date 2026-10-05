'use client'
// THE CALL, ON MOONSHOT'S GAME PAGE (2026-10-05). The same write-up the per-game CALL post
// carries (lib/writeups/mlb.js -> text.js), drawn from the same board rows, so the site can't
// say something the post didn't. Drawn by components/GameWriteupBlock (shared with LAMP).
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { buildMlbWriteup } from '../lib/writeups/mlb'
import GameWriteupBlock from './GameWriteupBlock'

const THEME = { C, NUM_FONT, TYPE, accent: SPORT_ACCENT.mlb }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · lineups confirmed' : ' · lineups not confirmed yet'}`,
  meta: (p) => `${p.team} · ${p.role}`,
  numbers: (p) => [p.bar, p.score != null ? `${p.scoreName} ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of}` : null, p.spot ? `bats ${p.spot}` : null].filter(Boolean).join(' · '),
}

export default function MlbWriteupBlock({ rows, onPlayerClick }) {
  const w = useMemo(() => buildMlbWriteup(rows || []), [rows])
  const byId = useMemo(() => new Map((rows || []).map((r) => [String(r.player_id), r])), [rows])
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} onOpen={onPlayerClick ? (p) => onPlayerClick(byId.get(p.player_id) || { player_id: p.player_id, name: p.name }) : null} />
}
