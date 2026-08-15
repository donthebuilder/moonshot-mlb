'use client'
import { C, NUM_FONT } from '../lib/theme'
import { quoteFor, fmtOdds, impliedPct } from '../lib/odds'

// 💸 THE BUBBLE — the price, ON the pick, small enough to live there.
//
// 2026-08-15, Donovan: "i wanted to see them on the games picks like a little
// buble or soemthig or glow of the odd the pick."
//
// The Games tab's pick chips are five to a row on a card that already carries a
// matchup, a score and a park. There is no room for the full OddsLine — line,
// price, break-even and a verdict — so this is the price and nothing else, and
// it earns its space by GLOWING rather than by adding a column.
//
// THE GLOW IS THE INFORMATION, and it is deliberately coarse:
//
//   green   the number is long enough that the pick's own category hit rate
//           clears what it demands — the market hasn't caught up
//   red     it's short of that — right player, wrong number
//   plain   the two are within a few points, which is most picks most nights
//
// A price with no rate to compare it to renders plain and says so on hover.
// The comparison is a CATEGORY HIT RATE, never a score: a 0-100 score is not a
// probability, and putting one next to an implied percentage would be the most
// confident wrong thing on the page.
//
// ≠ MEANS THE BOOK IS ON ANOTHER NUMBER. An HR pick has to clear 1+, which is
// the over on 0.5; a book sitting on 1.5 is selling a multi-homer game and its
// price says nothing about this pick. quoteFor flags it, and the bubble shows
// the mark instead of colouring a comparison it can't make.

const GOOD = '#4ade80'
const BAD = '#f87171'

export default function PriceBubble({ odds, player, cat, rate = null, size = 'sm' }) {
  const q = quoteFor(odds, player, cat)
  if (!q || q.over == null) return null

  const need = q.implied ?? impliedPct(q.over)
  const have = Number.isFinite(Number(rate)) ? Number(rate) : null
  const diff = (q.matches !== false && need != null && have != null) ? have - need : null
  const tone = diff == null ? null : diff >= 5 ? GOOD : diff <= -5 ? BAD : null
  const col = tone || C.text2

  const big = size === 'md'
  return (
    <span
      title={[
        `${q.name || player?.name || player?.player_name || ''} · ${cat}`,
        `${fmtOdds(q.over)} at the book${q.best_over && q.best_over !== q.over ? ` (best ${fmtOdds(q.best_over)}${q.best_book ? ` at ${q.best_book}` : ''})` : ''}`,
        need != null ? `needs ${Math.round(need)}% to break even` : '',
        q.matches === false
          ? `⚠ the book is on ${q.line} — this pick has to clear ${q.wantLine + 0.5}+, so that price is for a different bet`
          : have != null
            ? `he clears it ${have.toFixed(0)}% of the time → ${diff > 0 ? '+' : ''}${diff.toFixed(0)} points`
            : 'no track record for this category yet, so nothing is being compared',
        q.lines_seen > 1 ? `⚠ books disagree on the line (${q.lines_seen} seen)` : '',
      ].filter(Boolean).join('\n')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        fontFamily: NUM_FONT, fontSize: big ? 10 : 8.5, fontWeight: 900,
        lineHeight: 1, padding: big ? '2.5px 7px' : '1.5px 5px',
        borderRadius: 999, whiteSpace: 'nowrap',
        color: col,
        border: `1px solid ${col}${tone ? '77' : '33'}`,
        background: tone ? `${col}1c` : 'rgba(255,255,255,.04)',
        // The glow, and only when there is something to glow about. A chip
        // that lights up on every pick is a chip that means nothing.
        boxShadow: tone ? `0 0 8px ${tone}44` : 'none',
      }}
    >
      {q.matches === false && <span style={{ color: BAD }}>≠</span>}
      {fmtOdds(q.over)}
    </span>
  )
}
