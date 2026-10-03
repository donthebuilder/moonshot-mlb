// THE VALUE CALL (BATCH-MODEL-V2 M4, 2026-10-03). Pure; any sport.
//
// The chalk fix: per game, the player the model rates well above where his
// price puts him. No model here gives a calibrated chance (lib/nhl/goalModel.js
// PROBABILITY_SOURCE), so both sides are RANKS within the game, never a
// probability against a probability:
//   m  where the model's score ranks him among the game's priced players (0-1)
//   b  where the book's implied chance ranks him among the same players (0-1)
// Eligible: the sport's own status says CALLED or ON THE BOARD (taken as
// given, never re-derived) and m - b >= minGap. The call is the biggest gap;
// a tie goes to the higher score, then the lower player id. A game with fewer
// than minPriced priced players, or nobody eligible, has no value call.
//
// SHADOW ONLY: graded on /admin (lib/shadowRecord.js readValueNhl), nothing
// public. A change to the rule is a new VALUE_VERSION, so past calls never move.
export const VALUE_VERSION = 'value-v1'
export const VALUE_RULE = { minPriced: 6, minGap: 0.25 }

/** value -> its percentile among `values` (ties share their average rank; one value = 0.5). */
function percentiles(values) {
  const n = values.length
  const sorted = [...values].sort((x, y) => x - y)
  return values.map((v) => {
    if (n < 2) return 0.5
    const lo = sorted.indexOf(v)
    const hi = sorted.lastIndexOf(v)
    return (lo + hi) / 2 / (n - 1)
  })
}

/**
 * @param games  [{ game_id, players: [{ player_id, score, status, implied, ... }] }]
 *               players without a finite score or implied chance are left out.
 * @returns      [{ game_id, priced, pick: null | { ...player, m, b, gap } }]
 */
export function valueCalls(games, { minPriced = VALUE_RULE.minPriced, minGap = VALUE_RULE.minGap } = {}) {
  return games.map((g) => {
    const ps = (g.players || []).filter((p) => Number.isFinite(p.score) && Number.isFinite(p.implied))
    if (ps.length < minPriced) return { game_id: g.game_id, priced: ps.length, pick: null }
    const m = percentiles(ps.map((p) => p.score))
    const b = percentiles(ps.map((p) => p.implied))
    let pick = null
    ps.forEach((p, i) => {
      if (p.status !== 'called' && p.status !== 'board') return
      const gap = m[i] - b[i]
      if (gap < minGap - 1e-9) return
      const better = !pick || gap > pick.gap + 1e-9
        || (Math.abs(gap - pick.gap) <= 1e-9 && (p.score > pick.score || (p.score === pick.score && String(p.player_id) < String(pick.player_id))))
      if (better) pick = { ...p, m: m[i], b: b[i], gap }
    })
    return { game_id: g.game_id, priced: ps.length, pick }
  })
}
