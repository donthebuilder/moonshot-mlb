// THE BEST PAIRS, FROM THE PAIRS THE BOT ALREADY PUBLISHED (2026-10-07). No new
// generator and no new score: each pair is ranked by its own existing score
// (MLB: recommended_pairs[].pair_score; the other sports pass their own key).
// Ties keep the bot's order. A pair without two players or without a finite
// score is left out rather than ranked on a guess.
import { arr } from './player'

export function bestPairs(rawPairs, { limit = 5, scoreKey = 'pair_score' } = {}) {
  return arr(rawPairs)
    .map((pr, i) => ({ pr, i, score: Number(pr?.[scoreKey]) }))
    .filter(({ pr, score }) => arr(pr?.players).length >= 2 && Number.isFinite(score))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(({ pr, i, score }) => ({
      key: String(pr?.pair_key ?? `pair-${i}`),
      players: arr(pr.players).slice(0, 2),
      score,
      risk: String(pr?.risk ?? ''),
      lane: String(pr?.lane_key ?? ''),
    }))
}
