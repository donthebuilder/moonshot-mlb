'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'
import { fmtOdds } from '../lib/odds'
import { lineMove, lineMoveText } from '../lib/odds/lineMove'

// "LINE MOVED +900 -> +1200" (2026-10-07, Donovan: NFL has no odds history). One quiet chip,
// drawn only where the feed's opening price and our latest read really differ
// (lib/odds/lineMove.js): no opening price, no move, no chip. ▲ the price
// shortened (the book likes it more), ▼ it drifted, ≠ the line itself moved
// (a different bet). Not a verdict and not coloured red/green; the product's own
// theme passes in, so TUDDY's wears TUDDY's ink.
export default function LineMoveChip({ quote, theme = null, numFont = null, compact = false }) {
  const mv = lineMove(quote)
  if (!mv) return null
  const C = theme || MLB_C
  const NUM = numFont || MLB_NUM
  const glyph = mv.lineChanged ? '≠' : mv.dir === 'shorter' ? '▲' : '▼'
  return (
    <span
      title={lineMoveText(mv, fmtOdds)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        fontFamily: NUM, fontSize: 11, color: C.text2,
        border: `1px solid ${C.border}`, borderRadius: 6, padding: compact ? '1px 5px' : '2px 7px',
      }}
    >
      <span aria-hidden="true" style={{ color: C.text3, fontSize: 9 }}>{glyph}</span>
      {mv.lineChanged
        ? <span>line {mv.fromLine ?? '?'} {'→'} {mv.toLine ?? '?'}</span>
        : <span><span style={{ color: C.text3 }}>{fmtOdds(mv.from)}</span> {'→'} <b style={{ color: C.text }}>{fmtOdds(mv.to)}</b></span>}
    </span>
  )
}
