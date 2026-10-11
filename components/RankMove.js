'use client'
// THE RANK ARROW (2026-10-10): ▲3 / ▼2 / NEW beside a player's rank. One tiny component that every
// board's table (components/table/v2.js, the # cell) and card mounts, so they cannot disagree.
//
//   <RankMove move={{ kind: 'up', n: 3 }} prevAt={ms} source="device" up={accent} down={dim} />
//
// Neutral by design (CLAUDE.md: no red/green): UP wears the product's accent (pass the theme token),
// DOWN and NEW wear the quiet text colour. Information only; it is never a score, rank, call or status.
// Tap (or hover) says what it means through lib/explain.js, so it works on a phone.
import { explain } from '../lib/explain'
import { moveText, MOVE_CAPTION } from '../lib/rankMove'
import { NUM_FONT } from '../lib/design/tokens'

const clock = (ms) => { try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' } }

export function moveWords(move, prevAt, source) {
  return moveText(move, prevAt, clock, source)
}

/** `cell` is what useRankMove().cell(id) returns, or a row's `rankMove`. */
export function RankMoveCell({ cell, ...rest }) {
  return cell?.move ? <RankMove move={cell.move} prevAt={cell.prevAt} source={cell.source} {...rest} /> : null
}

export default function RankMove({ move, prevAt = null, source = 'device', up = 'currentColor', down = 'currentColor', size = 10, block = false, style }) {
  if (!move || (move.kind !== 'new' && !(move.n > 0))) return null
  const words = moveWords(move, prevAt, source)
  const isUp = move.kind === 'up'
  const glyph = move.kind === 'new' ? 'NEW' : `${isUp ? '▲' : '▼'}${move.n}`
  return (
    <span
      role="button" tabIndex={0}
      aria-label={words}
      title={words}
      data-rankmove={move.kind}
      onClick={(e) => { e.stopPropagation(); explain('Rank move', words) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); explain('Rank move', words) } }}
      style={{
        display: block ? 'block' : 'inline-block', fontFamily: NUM_FONT, fontSize: size, fontWeight: 800, lineHeight: 1,
        letterSpacing: move.kind === 'new' ? '.04em' : 0, whiteSpace: 'nowrap', cursor: 'pointer',
        color: isUp ? up : down, ...style,
      }}>{glyph}</span>
  )
}

/** The one-line caption under a board that is drawing arrows. */
export function RankMoveNote({ show, color = 'inherit', style }) {
  if (!show) return null
  return <div data-rankmove-note style={{ fontSize: 12, lineHeight: 1.4, color, margin: '6px 2px 0', ...style }}>{MOVE_CAPTION}</div>
}
