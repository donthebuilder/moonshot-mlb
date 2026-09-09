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
        `${q.name || player?.name || player?.player_name || ''} · ${cat} · the book's ${q.line} line`,
        `${fmtOdds(q.over)}${q.best_over && q.best_over !== q.over ? ` (best ${fmtOdds(q.best_over)}${q.best_book ? ` at ${q.best_book}` : ''})` : ''}`,
        need != null ? `needs ${Math.round(need)}% to break even` : '',
        q.matches === false
          ? `⚠ the book is on ${q.line} — this pick has to clear ${q.wantLine + 0.5}+, so that price is for a different bet`
          : have != null
            ? `he clears it ${have.toFixed(0)}% of the time → ${diff > 0 ? '+' : ''}${diff.toFixed(0)} points`
            : '',
        q.lines_seen > 1 ? `⚠ books disagree on the line (${q.lines_seen} seen)` : '',
      ].filter(Boolean).join('\n')}
      style={{
        // PLAIN TEXT, NOT A CHIP (2026-08-15, second pass). The first version
        // wrapped this in a bordered, tinted, glowing pill and it changed the
        // shape of every card it landed on — Donovan: "i liked how it was
        // before i just wanted you to add the odds simple."
        //
        // He's right, and the pill was solving a problem the price doesn't
        // have. A number in the row's own type, tinted only when there is a
        // verdict, reads as part of the pick instead of as a widget stuck to
        // it — and on a chip that already carries a category, a name, a stat
        // and a score, the quietest thing that can be added is the only thing
        // that should be.
        fontFamily: NUM_FONT, fontSize: big ? 10.5 : 9,
        fontWeight: tone ? 900 : 700,
        color: tone || C.text2,
        whiteSpace: 'nowrap', flexShrink: 0,
        letterSpacing: '.01em',
      }}
    >
      {/* THE BOOK'S OWN NUMBER, not just a warning glyph (2026-08-15,
          Donovan: "we need to see the line the book has them for, esp if
          it's at like 1.5"). A bare ≠ said "this price is for a different
          bet" without ever saying WHICH bet — so the one case that matters
          most, a hit line moved to 1.5, looked identical to a line moved to
          2.5. The number rides along now. */}
      {q.matches === false && Number.isFinite(Number(q.line))
        ? <span style={{ color: '#FCD34D' }}>{Number(q.line)}{'\u00A0'}</span>
        : null}
      {fmtOdds(q.over)}
    </span>
  )
}
