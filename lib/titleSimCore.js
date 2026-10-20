// THE TITLE SIMULATIONS' SHARED PARTS (2026-10-20). Pure: no fetch, no clock. BUCKETS (lib/nba/titleSim.js), LAMP
// (lib/nhl/titleSim.js) and TUDDY (lib/nfl/titleSim.js) each play the rest of a season ten thousand times; the seeded
// generator, the normal curve and the best-of-seven are the same in all three, so they live here once.

/** A small worker pool: fn over items, n at a time, results in order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

/** A fast seeded generator (mulberry32): the same seed gives the same table. */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)) }
/** The normal curve's cumulative share. */
export const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
/** Its inverse, by bisection (only ever called a handful of times per build). */
export function invPhi(p) {
  let lo = -8, hi = 8
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (phi(m) < p) lo = m; else hi = m }
  return (lo + hi) / 2
}

/** Mean and sample standard deviation of a list. */
export function meanSd(xs) {
  const mu = xs.reduce((t, x) => t + x, 0) / xs.length
  return { mu, sd: Math.sqrt(xs.reduce((t, x) => t + (x - mu) ** 2, 0) / (xs.length - 1)) }
}

/** Best of seven, hi with home ice / court (games 1, 2, 5, 7 at home). game(home, away) -> the winner. */
export function bestOfSeven(hi, lo, game) {
  let w = 0, l = 0, n = 0
  while (w < 4 && l < 4) { const home = n === 0 || n === 1 || n === 4 || n === 6 ? hi : lo; const away = home === hi ? lo : hi; if (game(home, away) === hi) w++; else l++; n++ }
  return w === 4 ? hi : lo
}

/** A share of the simulated seasons, 0-1, four places. */
export const shareOf = (n, sims) => Math.round((n / sims) * 10000) / 10000
