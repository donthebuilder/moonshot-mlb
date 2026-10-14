// MY BOOK vs THE FIELD (2026-10-14, Donovan: "i only bet one book, we just need to be able
// to spot where they're at"). Pure; any sport. Reads quote.by_book, the same field
// lib/odds/shop.js reads, so the two can never disagree about a price.
//
// The question for a one-book bettor is not "which book is best" but "is MY book out of line
// tonight". gap = the field's break-even minus my book's break-even, in points, at the SAME line:
//   gap > 0   my book pays MORE than the field (a price worth taking)
//   gap < 0   my book pays LESS (a bet to take elsewhere, or skip)
// The field is the MEDIAN of the other books at my line, and needs MIN_FIELD of them: one other
// book is one opinion, not a field. A book on a different bar is a different bet, never a gap
// (it is reported as `lineOff`, same rule as bookSpread's `split`).
//
// This is a price comparison between books. It says nothing about whether the bet wins.
import { impliedPct, profitOn } from '../odds'

export const MY_BOOK = 'fanatics'   // the one place the book is named
export const MIN_FIELD = 2          // other books needed before a gap is claimed
export const GAP_PP = 2             // points that count as a real gap (Odds board's OVER_FAIR_PP)

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? NaN : Number(v))

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * MARKET EV of a price: what $1 earns on average if the market's own no-vig chance is right.
 * ev = p*profit - (1-p), as a percent of the stake. p comes from the market's fair price
 * (quote.fair_over), never from a model score, so this claims "the price is better than the
 * market's own fair price", not "the bet wins". Null unless both prices are real.
 */
export function evPct(american, fairAmerican) {
  const win = profitOn(american, 1)
  const fairNeed = impliedPct(fairAmerican)
  if (win == null || fairNeed == null) return null
  const p = fairNeed / 100
  return Math.round(1000 * (p * win - (1 - p))) / 10
}

/**
 * @param q    a quote with by_book { book: { line, over } } and a consensus line
 * @param book the book key, case-insensitive (default MY_BOOK)
 * @returns null when the book is not on this quote; otherwise
 *   { mine, mineLine, lineOff, field, fieldN, gap, verdict: 'better'|'worse'|'even'|null }
 *   `field` is the median other-book break-even % expressed back as an American price, null when
 *   fewer than MIN_FIELD books share my line (then gap and verdict are null: no claim).
 */
export function myBookGap(q, book = MY_BOOK) {
  const entries = q?.by_book && typeof q.by_book === 'object' ? Object.entries(q.by_book) : []
  const key = String(book).toLowerCase()
  const mineE = entries.find(([bk]) => String(bk).toLowerCase() === key)
  if (!mineE) return null
  const mine = num(mineE[1]?.over)
  const mineLine = num(mineE[1]?.line)
  if (!Number.isFinite(mine)) return null
  const consensus = num(q?.line)
  const lineOff = Number.isFinite(mineLine) && Number.isFinite(consensus) && Math.abs(mineLine - consensus) > 1e-9
  const ref = Number.isFinite(mineLine) ? mineLine : consensus
  const others = entries
    .filter(([bk, b]) => String(bk).toLowerCase() !== key && Number.isFinite(num(b?.over)) && Math.abs(num(b?.line) - ref) < 1e-9)
    .map(([, b]) => impliedPct(num(b.over)))
    .filter((x) => x != null)
  const out = { mine, mineLine: Number.isFinite(mineLine) ? mineLine : null, lineOff, field: null, fieldN: others.length, gap: null, verdict: null, ev: null }
  if (!lineOff) out.ev = evPct(mine, num(q?.fair_over))
  if (others.length < MIN_FIELD) return out
  const need = median(others)
  const mineNeed = impliedPct(mine)
  if (mineNeed == null) return out
  out.field = need >= 50 ? -Math.round((100 * need) / (100 - need)) : Math.round((100 * (100 - need)) / need)
  out.gap = Math.round(10 * (need - mineNeed)) / 10
  out.verdict = out.gap >= GAP_PP ? 'better' : out.gap <= -GAP_PP ? 'worse' : 'even'
  return out
}
