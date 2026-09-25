// ── THE BOARD ORDER (2026-09-25) ─────────────────────────────────────────────
//
// One definition of "where he sits on tonight's board", read by the board
// tab's rank column, the lanes, and the homer alert's "#N on the board".
// Three places sorted on hr_score independently before this file; rule 28.
//
// The bot publishes `board_rank` (1 = top) and `board_score` (0-100) on every
// slate row: an equal average of three within-slate percentile ranks --
// hr_score, season HR count, season avg exit velocity. Measured on 21
// truly-pregame nights (the last run before EACH game's first pitch, 09-04 ->
// 09-24, 4,814 hitter-games, 532 HR): hr_score alone put 17.1% of its top 10
// over the fence and 15.4% of its top 25; this order 22.4% / 19.2%, winning
// 13 of the 21 nights at top-25 and losing 5. The full note is
// claude/board-order-2026-09-25.md in the project.
//
// A row published before the bot carried board_rank (or one that lost it)
// falls back to the old hr_score order, so a stale payload still sorts and
// still sorts the same way it used to.
import { hrScore, mlbId, nn } from './player'

const rankOf = (p) => {
  const r = Number(p?.board_rank)
  return Number.isFinite(r) && r > 0 ? r : null
}

/** Comparator: board_rank ascending; rows without one sort after those with one, by hr_score. */
export function boardCompare(a, b) {
  const ra = rankOf(a), rb = rankOf(b)
  if (ra != null && rb != null) return ra - rb
  if (ra != null) return -1
  if (rb != null) return 1
  return (hrScore(b) - hrScore(a)) || ((mlbId(a) || 0) - (mlbId(b) || 0))
}

/** The slate in board order, one row per row (callers dedupe by person). */
export function boardOrder(players) {
  return [...(players || [])].filter(Boolean).sort(boardCompare)
}

/** The published board score, or null when the payload predates it. */
export const boardScore = (p) => {
  const v = nn(p?.board_score)
  return Number.isFinite(v) && v > 0 ? v : null
}
