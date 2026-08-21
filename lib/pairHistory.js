// 🔗 ONE SHARED LOOKUP INTO pair_history_summary.top_pairs (2026-08-21, Phase 5).
//
// Three components were each hand-rolling this exact same match-by-two-
// players scan against the same payload: PairTray.js:37-47, PairBuilder.js
// (folded into its own fit-score loop), and Pairs.js's private
// buildHistoryPairIndex. None of them shared a helper, so a future field
// rename or a matching-logic fix would need to land in three places and
// could easily land in two. This extracts the one PairTray.js already had
// right (player_id match first, normalized-name fallback for older rows
// that never got an id) so a fourth consumer (PlayerCompare) doesn't have
// to write a fourth copy.
//
// Read-only. Does not change what PairTray.js, PairBuilder.js, or Pairs.js
// compute — none of them were switched onto this in Phase 5, on purpose,
// to keep the diff to "one new shared helper plus one new consumer" rather
// than also touching three already-shipped, already-tested surfaces.
import { nameOf, arr } from './player'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

/**
 * findPairHistory(summary, a, b) -> the matching row from
 * pair_history_summary.json's top_pairs, or null if these two have no
 * recorded history together (which is the common case — most pairs don't).
 */
export function findPairHistory(summary, a, b) {
  if (!a || !b) return null
  const idA = Number(a?.player_id ?? a?.id)
  const idB = Number(b?.player_id ?? b?.id)
  const nmA = norm(nameOf(a))
  const nmB = norm(nameOf(b))
  return arr(summary?.top_pairs).find((pr) => {
    const ids = arr(pr?.players).map((x) => Number(x?.player_id)).filter(Boolean)
    if (ids.length === 2) return ids.includes(idA) && ids.includes(idB)
    const nm = [norm(pr?.player_1), norm(pr?.player_2)]
    return nm.includes(nmA) && nm.includes(nmB)
  }) || null
}
