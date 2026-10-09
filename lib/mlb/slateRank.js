// A RANK ONLY WHEN IT SAYS SOMETHING (2026-10-08, the player model's one-row stat strip). Ranks a value against
// the bats we hold for the night (the slate rows the card was opened from; nothing is fetched or invented) and
// returns a rank only when he sits in the top or bottom `edge` (10%) of a pool of at least `min` bats.
// A thin pool (a playoff slate) returns null: no rank beats a rank of 6 in 18.
//   better: 'high' (bigger is better) or 'low'. rank 1 = best for him when side is 'top';
//   for 'bottom' rank counts from the best (so it is large), `of` is the pool size.
export function rankInPool(values, v, { better = 'high', edge = 0.1, min = 30 } = {}) {
  const x = Number(v)
  if (!Number.isFinite(x)) return null
  const pool = (values || []).map(Number).filter(Number.isFinite)
  if (pool.length < min) return null
  const ahead = pool.filter((y) => (better === 'low' ? y < x : y > x)).length
  const rank = ahead + 1
  const of = pool.length
  if (rank <= Math.ceil(of * edge)) return { rank, of, side: 'top' }
  if (rank > of - Math.ceil(of * edge)) return { rank, of, side: 'bottom' }
  return null
}
