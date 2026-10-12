// THE CARD: WHO SEES WHAT, AND WHEN (2026-10-12, Donovan: "members only, then after one leg cashes or is done then they can see the other").
// ONE rule, pure, no I/O. The reveal condition is computed from the STORED graded results, never from the clock:
//   BEFORE any row of the Card (one sport, one card_date) is graded, the public (the site, /api/card, X, the free channels, the public image routes)
//   sees ONLY the lead straight (the free pick: lib/card/core.js leadStraight, the man the X post leads with), the Long Shot of the day and
//   Donovan's own lane once its lock has passed, plus the record. The bot's Two-Man and the other straights are MEMBERS ONLY (the #members channel).
//   AFTER at least one row of the Card has a result (hit, miss, push or void: a void counts as done), everything is history/fact and everyone sees all of it.
// The database says the same thing in supabase/migrations/202610121000_card_calls_members.sql (the card_calls_read policy); scripts/check-card-members.mjs
// holds the two together. A caller that serves MEMBERS (the #members poster, the tick) asks the store for audience 'members'; the default is 'public'.
import { leadStraight } from './core.js'

/** The quiet line under the public Card while the rest is held (neutral words; no "lock"). */
export const HELD_LINE = 'The Two-Man and calls #2-#3 are for members until a leg is graded.'

/** A row that has a result (hit / miss / push / void). A void is done. */
export const isGraded = (r) => r?.result != null

/**
 * Has any row of this Card been graded? `rows` = the rows of ONE Card (one sport, one card_date; every lane and product, the Double excluded).
 * The Double (sport 'all') is its own cross-sport ticket with its own rule (public only once graded) and never reveals a sport's Card.
 */
export const cardRevealed = (rows) => (rows || []).some((r) => r && r.sport !== 'all' && r.product !== 'double' && isGraded(r))

/**
 * What the PUBLIC may see of a Card's rows. { rows, held: { straights, two_man }, revealed }.
 *   revealed       every row, unchanged (graded rows are record)
 *   not revealed   the lead straight, the Long Shot, Donovan's rows (the caller already dropped his pre-lock entry) and the Double (the caller
 *                  already dropped it until graded); the bot's Two-Man and the other straights are held, and only COUNTED.
 */
export function publicCardRows(rows) {
  const all = rows || []
  const revealed = cardRevealed(all)
  if (revealed) return { rows: all, held: { straights: 0, two_man: 0 }, revealed: true }
  const lead = leadStraight(all)
  const keep = all.filter((r) => !(r.lane === 'bot' && ((r.product === 'straight' && r !== lead) || r.product === 'two_man')))
  const held = {
    straights: all.filter((r) => r.lane === 'bot' && r.product === 'straight' && r !== lead).length,
    two_man: all.filter((r) => r.lane === 'bot' && r.product === 'two_man').length,
  }
  return { rows: keep, held, revealed: false }
}
