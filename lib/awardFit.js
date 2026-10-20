// 🏅 THE AWARD-RACE MATH EVERY LEAGUE SHARES (2026-10-20). Pure. A race = a pool of players in one season and a SHARE for each,
// a softmax of a weighted sum of his numbers z-scored within that pool; the weights are fitted on real vote shares
// (soft-target cross-entropy). BUCKETS' model (lib/nba/awardModel.js) and MOONSHOT's (lib/mlb/awardModel.js) both read it.

/** z-score each feature across the pool. rows: [{ f: {name: value} }] -> [{ z: number[] }] (a missing value is the pool mean, z 0). */
export function zScore(rows, feats) {
  const stats = feats.map((k) => {
    const xs = rows.map((r) => r.f[k]).filter((x) => x != null && Number.isFinite(x))
    const m = xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0
    const sd = xs.length > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1)) : 1
    return [m, sd || 1]
  })
  return rows.map((r) => ({ ...r, z: feats.map((k, i) => (r.f[k] == null || !Number.isFinite(r.f[k]) ? 0 : (r.f[k] - stats[i][0]) / stats[i][1])) }))
}

/** shares over the pool: softmax of (w . z) / T. */
export function softmax(rows, w, T = 1) {
  const s = rows.map((r) => r.z.reduce((t, x, i) => t + x * w[i], 0) / T)
  const mx = Math.max(...s)
  const e = s.map((x) => Math.exp(x - mx))
  const tot = e.reduce((t, x) => t + x, 0)
  return e.map((x) => x / tot)
}

/**
 * Fit w by soft-target cross-entropy (each season's targets = vote points / all points that season) + a small L2.
 * seasons: [{ rows: [{ z, t }] }]. Plain gradient descent on standardized inputs: convex, so it lands on the one answer.
 */
export function fitSoftmax(seasons, nFeat, { l2 = 0.01, iters = 3000, lr = 1 } = {}) {
  const w = new Array(nFeat).fill(0)
  for (let it = 0; it < iters; it++) {
    const g = w.map((x) => 2 * l2 * x)
    for (const s of seasons) {
      const p = softmax(s.rows, w)
      s.rows.forEach((r, i) => { const d = p[i] - r.t; if (d) r.z.forEach((x, k) => { g[k] += d * x }) })
    }
    for (let k = 0; k < nFeat; k++) w[k] -= (lr * g[k]) / seasons.length
  }
  return w
}

/** The temperature that best spreads a fixed score (a 1-D search): used for the opening-night read (last season's lines). */
export function fitTemperature(seasons, w) {
  let best = [1, Infinity]
  for (let T = 0.5; T <= 8.0001; T += 0.05) {
    let loss = 0
    for (const s of seasons) { const p = softmax(s.rows, w, T); s.rows.forEach((r, i) => { if (r.t > 0) loss -= r.t * Math.log(Math.max(p[i], 1e-12)) }) }
    if (loss < best[1]) best = [Math.round(T * 100) / 100, loss]
  }
  return best[0]
}

/** How far the season is along (0 = opening night, 1 = the full season) -> the softmax temperature: opening night's measured T0 down to 1. */
export function temperatureAt(frac, T0) {
  const f = Math.max(0, Math.min(1, frac))
  return T0 + (1 - T0) * f
}

