'use client'
// THE CALL, ON MOONSHOT'S GAME PAGE (2026-10-05). The same write-up the per-game CALL post
// carries (lib/writeups/mlb.js -> text.js), drawn from the same board rows, so the site can't
// say something the post didn't. Drawn by components/GameWriteupBlock (shared with LAMP).
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { buildMlbWriteup } from '../lib/writeups/mlb'
import GameWriteupBlock from './GameWriteupBlock'
import { playerId } from '../lib/player'

const THEME = { C, NUM_FONT, TYPE, accent: SPORT_ACCENT.mlb }
const WORDS = {
  status: (w) => `${w.when}${w.locked ? ' · lineups confirmed' : ' · lineups not confirmed yet'}`,
  meta: (p) => `${p.team} · ${p.role}`,
  // the player's head row as chips on a phone (GameWriteupBlock chips): the score glows for a TOP / HR call
  chips: (p) => [
    p.score != null && { value: p.score, label: p.scoreName, hot: p.role === 'TOP' || p.role === 'HR' },
    p.rank != null && p.of && { value: `#${p.rank}`, label: `of ${p.of}` },
    { label: `${p.team} ${p.role}` },
    p.spot && { label: `bats ${p.spot}` },
    p.bar && { label: p.bar },
  ].filter(Boolean),
  numbers: (p) => [p.bar, p.score != null ? `${p.scoreName} ${p.score}` : null, p.rank != null && p.of ? `#${p.rank} of ${p.of}` : null, p.spot ? `bats ${p.spot}` : null].filter(Boolean).join(' · '),
}

export default function MlbWriteupBlock({ rows, onPlayerClick }) {
  const w = useMemo(() => buildMlbWriteup(rows || []), [rows])
  const byId = useMemo(() => new Map((rows || []).map((r) => [String(r.player_id), r])), [rows])
  // members gate: the board's own key for the row (components/MemberGate.js), his game's start
  const lockIn = (p) => { const r = byId.get(String(p.player_id)); return { key: `${playerId(r || {})}|${r?.game_pk ?? ''}`, time: r?.game_time, graded: r?.graded === true } }
  return <GameWriteupBlock w={w} theme={THEME} words={WORDS} lockIn={lockIn} chips onOpen={onPlayerClick ? (p) => onPlayerClick(byId.get(p.player_id) || { player_id: p.player_id, name: p.name }) : null} />
}
