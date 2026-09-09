'use client'

// 🎯 THE MULTIPLE-COMPARISONS PROBLEM, SAID OUT LOUD.
//
// 2026-08-30. True Price tests every player × market × line on the board
// against its own price and labels anything past two standard errors "holds
// up". On one line that is a 5% false-alarm rate. On 1,858 lines it is about
// NINETY-THREE FALSE ALARMS BY CONSTRUCTION — and they arrive sorted to the
// top of the page, because a false alarm is by definition a big gap.
//
// This is the same class of error the page already guards against in the other
// direction: lib/oddsHistory.js refuses to call a single thin sample real. It
// had no guard at all against the SEARCH itself being the source of the
// finding. A screen that looks at two thousand lines and reports the loudest
// hundred has found the tail of a null distribution, not an edge.
//
// BENJAMINI–HOCHBERG, NOT BONFERRONI. Bonferroni controls the chance of even
// one false positive and at n=1,858 it would demand about 4.2σ, which on ten
// nights of archive is nothing, ever — a filter that hides everything is a
// broken filter (this page's own 08-16 lesson). BH controls the expected
// PROPORTION of the calls that are wrong, which is the question a bettor
// actually has: of the rows I would act on, how many are noise?

/** Two-sided p-value for a z-score. Abramowitz & Stegun 7.1.26 on erf. */
export function pFromZ(z) {
  const a = Math.abs(Number(z))
  if (!Number.isFinite(a)) return null
  const t = 1 / (1 + 0.3275911 * (a / Math.SQRT2))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(a / Math.SQRT2) * (a / Math.SQRT2))
  return Math.max(0, Math.min(1, 1 - y))
}

/**
 * Benjamini–Hochberg over a set of z-scores.
 *
 * @param items  anything, as long as `zOf(item)` returns a z-score or null
 * @param q      the false-discovery rate to control at (0.10 = "at most one in
 *               ten of the rows this calls real is expected to be noise")
 * @returns { pass: Set(index), cut, tested, expectedFalse, q }
 *          `cut` is the p-value threshold BH landed on, or null if nothing
 *          survives — which is the honest and common answer on a young archive.
 */
export function benjaminiHochberg(items, zOf, q = 0.10) {
  const scored = []
  items.forEach((it, i) => {
    const z = zOf(it)
    if (z == null || !Number.isFinite(Number(z))) return
    const p = pFromZ(z)
    if (p == null) return
    scored.push({ i, p })
  })
  const m = scored.length
  const out = { pass: new Set(), cut: null, tested: m, expectedFalse: 0, q }
  if (!m) return out
  scored.sort((a, b) => a.p - b.p)
  let k = -1
  for (let j = 0; j < m; j++) if (scored[j].p <= ((j + 1) / m) * q) k = j
  if (k < 0) return out
  out.cut = scored[k].p
  for (let j = 0; j <= k; j++) out.pass.add(scored[j].i)
  // The whole point of the method, restated as a countable number for the
  // reader: of the k rows it just let through, this many are expected to be
  // nothing. Rounded up, because half a false positive is one row.
  out.expectedFalse = Math.ceil(q * (k + 1))
  return out
}

/**
 * How many "significant at 2σ" rows a pure-noise board of this size would
 * produce anyway. The number that turns "18 lines clear their error bar" from
 * a finding into a question.
 */
export function expectedFalseAlarms(tested, alpha = 0.0455) {
  const m = Number(tested)
  if (!Number.isFinite(m) || m <= 0) return 0
  return m * alpha
}
