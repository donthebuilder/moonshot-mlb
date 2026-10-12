// THE ACCURACY LOOP'S MATHS (2026-10-12). Pure, deterministic, no fetch, no framework imports.
//
// Everything here is robust-first: medians and MADs (the "chips away from the middle" idea the HR chart uses),
// an AUC that ignores scale and outliers, and a SEEDED bootstrap so the same rows always give the same ranges.
// Nothing here knows a sport. Nothing here prints a probability: it measures how two groups of rows differ.

export const MAD_TO_SD = 1.4826

export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
export function mad(xs, med = median(xs)) {
  if (med == null) return null
  return median(xs.filter((x) => Number.isFinite(x)).map((x) => Math.abs(x - med)))
}
export const mean = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null }
export function sd(xs) {
  const a = xs.filter(Number.isFinite)
  if (a.length < 2) return null
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1))
}
export function quantile(sorted, q) {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

/** A small seeded PRNG (mulberry32): the same seed gives the same bootstrap, run after run. */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mann-Whitney AUC: the chance a random A value is above a random B value (ties count half). 0.5 = no separation. */
export function auc(a, b) {
  const A = a.filter(Number.isFinite), B = b.filter(Number.isFinite)
  if (!A.length || !B.length) return null
  const all = []
  for (const v of A) all.push([v, 0])
  for (const v of B) all.push([v, 1])
  all.sort((p, q) => p[0] - q[0])
  let rankSumA = 0
  for (let i = 0; i < all.length;) {
    let j = i
    while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) if (all[k][1] === 0) rankSumA += avg
    i = j + 1
  }
  return (rankSumA - (A.length * (A.length + 1)) / 2) / (A.length * B.length)
}

/**
 * Robust standardised difference of two groups ON ONE FEATURE: (median A - median B) over the pooled
 * spread (1.4826 x MAD of A and B together; the standard deviation when the MAD is 0, as on a flag).
 * Null when the feature has no spread at all.
 */
export function robustEffect(a, b) {
  const A = a.filter(Number.isFinite), B = b.filter(Number.isFinite)
  if (!A.length || !B.length) return null
  const pool = A.concat(B)
  let scale = MAD_TO_SD * mad(pool)
  if (!(scale > 0)) scale = sd(pool)
  if (!(scale > 0)) return null
  return (median(A) - median(B)) / scale
}

function resample(xs, rand) {
  const out = new Array(xs.length)
  for (let i = 0; i < xs.length; i += 1) out[i] = xs[(rand() * xs.length) | 0]
  return out
}

/** A normal-tail two-sided p from a z (Abramowitz-Stegun erf). */
export function normalP(z) {
  if (!Number.isFinite(z)) return 1
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return 1 - y
}

/**
 * AUC and robust effect of A over B, with a seeded bootstrap range for each and a p from the bootstrap
 * standard error. `reps` bootstrap resamples (default 300). Returns null if either side has no values.
 */
export function compareGroups(a, b, { reps = 300, seed = 7 } = {}) {
  const A = a.filter(Number.isFinite), B = b.filter(Number.isFinite)
  if (!A.length || !B.length) return null
  const point = auc(A, B)
  const eff = robustEffect(A, B)
  const rand = rng(seed + A.length * 31 + B.length)
  const aucs = [], effs = []
  for (let r = 0; r < reps; r += 1) {
    const ra = resample(A, rand), rb = resample(B, rand)
    aucs.push(auc(ra, rb))
    const e = robustEffect(ra, rb)
    if (e != null) effs.push(e)
  }
  aucs.sort((p, q) => p - q)
  effs.sort((p, q) => p - q)
  const seA = sd(aucs)
  const z = seA > 0 ? (point - 0.5) / seA : 0
  return {
    nA: A.length, nB: B.length, medA: median(A), medB: median(B),
    auc: point, aucRange: [quantile(aucs, 0.025), quantile(aucs, 0.975)],
    effect: eff, effectRange: effs.length ? [quantile(effs, 0.025), quantile(effs, 0.975)] : null,
    p: seA > 0 ? normalP(z) : (point !== 0.5 ? 0 : 1),
  }
}

// Student-t two-sided p (regularised incomplete beta, Lentz continued fraction): the held-out lifts are few, so the normal tail is too kind
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x, t = x + 5.5
  t -= (x + 0.5) * Math.log(t)
  let ser = 1.000000000190015
  for (const cj of c) { y += 1; ser += cj / y }
  return -t + Math.log((2.5066282746310005 * ser) / x)
}
function betacf(a, b, x) {
  const TINY = 1e-30
  let c = 1, d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-12) break
  }
  return h
}
function ibeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return 1
  return ibeta(df / (df + t * t), df / 2, 0.5)
}

/** Benjamini-Hochberg: which of these p-values pass a false-discovery rate of q? Returns booleans in input order. */
export function benjaminiHochberg(ps, q = 0.1) {
  const ix = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0])
  let cut = -1
  ix.forEach(([p], k) => { if (p <= ((k + 1) / ix.length) * q) cut = k })
  const pass = new Array(ps.length).fill(false)
  for (let k = 0; k <= cut; k += 1) pass[ix[k][1]] = true
  return pass
}

/** Percent-rank (0..1) of each value among the array, ties averaged. Used to put a feature on a slate-relative scale. */
export function percentRanks(xs) {
  const idx = xs.map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v)).sort((p, q) => p[0] - q[0])
  const out = new Array(xs.length).fill(null)
  const n = idx.length
  for (let i = 0; i < n;) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1
    const r = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = r
    i = j + 1
  }
  return out
}

/**
 * The same comparison, WITHIN STRATA: rows are only compared with rows the model scored alike (a stratum is a score band
 * inside one night/week). The AUC is the pair-weighted mean of the strata's AUCs, so "he had higher X than the others" can
 * no longer be just "the model rated him higher". A, B: [{ v, s }]. The bootstrap resamples inside each stratum.
 */
export function compareStrat(A, B, { reps = 300, seed = 7 } = {}) {
  const ok = (x) => Number.isFinite(x.v)
  const a = A.filter(ok), b = B.filter(ok)
  if (!a.length || !b.length) return null
  const strata = [...new Set(a.concat(b).map((x) => x.s))]
  const part = (xs, s) => xs.filter((x) => x.s === s).map((x) => x.v)
  const pooled = (aa, bb) => {
    let num = 0, den = 0
    for (const s of strata) {
      const pa = part(aa, s), pb = part(bb, s)
      if (!pa.length || !pb.length) continue
      const w = pa.length * pb.length
      num += w * auc(pa, pb); den += w
    }
    return den ? num / den : null
  }
  const centered = (xs, med) => xs.map((x) => x.v - med.get(x.s))
  const med = new Map(strata.map((s) => [s, median(part(a, s).concat(part(b, s)))]))
  const point = pooled(a, b)
  if (point == null) return null
  const eff = robustEffect(centered(a, med), centered(b, med))
  const rand = rng(seed + a.length * 31 + b.length)
  const aucs = [], effs = []
  for (let r = 0; r < reps; r += 1) {
    const ra = [], rb = []
    for (const s of strata) {
      const sa = a.filter((x) => x.s === s), sb = b.filter((x) => x.s === s)
      for (let i = 0; i < sa.length; i += 1) ra.push(sa[(rand() * sa.length) | 0])
      for (let i = 0; i < sb.length; i += 1) rb.push(sb[(rand() * sb.length) | 0])
    }
    const v = pooled(ra, rb)
    if (v != null) aucs.push(v)
    const e = robustEffect(centered(ra, med), centered(rb, med))
    if (e != null) effs.push(e)
  }
  aucs.sort((p, q) => p - q); effs.sort((p, q) => p - q)
  const seA = sd(aucs)
  return {
    nA: a.length, nB: b.length, medA: median(a.map((x) => x.v)), medB: median(b.map((x) => x.v)),
    auc: point, aucRange: [quantile(aucs, 0.025), quantile(aucs, 0.975)],
    effect: eff, effectRange: effs.length ? [quantile(effs, 0.025), quantile(effs, 0.975)] : null,
    p: seA > 0 ? normalP((point - 0.5) / seA) : (point !== 0.5 ? 0 : 1), strata: strata.length,
  }
}
