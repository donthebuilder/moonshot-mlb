// 📏 THE WILSON INTERVAL, IN ONE PLACE
//
// 2026-08-16. This is a straight lift of the implementation that has been
// living privately inside components/ReportCard.js since the 08-08 audit, moved
// out the first time a second surface needed it. The repo's standing rule is
// that two copies of a calculation are two answers waiting to diverge — the
// same reason pickCleared() is the only grading bar and convictionOf() is the
// only conviction. ReportCard imports from here now; its numbers are unchanged.
//
// WHY WILSON AND NOT THE NORMAL APPROXIMATION. Every sample this site quotes is
// exactly where the textbook p ± z·√(p(1−p)/n) lies: small n, and rates far
// enough from 50% that the normal interval runs past 0 or 100 and reports
// impossible bounds. Wilson is bounded by construction and stays honest at
// n = 12 and at 12-for-12, both of which occur on real boards here.
//
// Everything is in PERCENT, because every caller displays percent and the
// conversions were the only place the old copy could be got wrong.

/**
 * 95% Wilson score interval.
 * @returns [lo, hi] in percent, or null when there is no sample.
 */
export function wilson(ok, n, z = 1.96) {
  const k = Number(ok)
  const den0 = Number(n)
  if (!Number.isFinite(k) || !Number.isFinite(den0) || den0 <= 0) return null
  const p = k / den0
  const z2 = z * z
  const den = 1 + z2 / den0
  const mid = (p + z2 / (2 * den0)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / den0 + z2 / (4 * den0 * den0))) / den
  return [Math.max(0, (mid - half) * 100), Math.min(100, (mid + half) * 100)]
}

/**
 * The conservative end of that interval, in percent — "at least this good,
 * with 95% confidence, given how few games we have."
 *
 * THIS IS THE NUMBER TO RANK ON. A board sorted by the raw rate puts 8-for-12
 * (66.7%) above 30-for-50 (60.0%) even though the first is a coin flip dressed
 * as a lead: its interval runs 39–86%, the second's runs 46–72%. Sorted by the
 * lower bound they swap — 39.0 against 46.0 — which is the order you would pick
 * in if you had to put money on one. The sample size stops being a caveat
 * printed beside the number and becomes part of the ordering itself.
 *
 * Returns null on no sample, so callers can keep their own "too thin to speak"
 * gate separate from this.
 */
export function wilsonLower(ok, n, z = 1.96) {
  const ci = wilson(ok, n, z)
  return ci ? ci[0] : null
}

/** "39–86%", or null. The one-line form every caller was writing by hand. */
export function ciText(ok, n, z = 1.96) {
  const ci = wilson(ok, n, z)
  return ci ? `${ci[0].toFixed(0)}–${ci[1].toFixed(0)}%` : null
}
