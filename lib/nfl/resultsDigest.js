// The results digest, pure parts: which weekly files exist to ask for, where they live, and what of one a Home page keeps.
// No 'use client' -- the route (app/api/nfl/results-digest) and the hook (lib/nfl/useResultsDigest.js) both import it.
// Same naming as lib/nfl/resultsArchive.js (weekKey / urlFor / hasGrade); a check keeps the two from drifting.
export const MAX_WEEK = 22   // 19-22 are the playoffs (bot week numbering)
export const PRE_WEEKS = 4

const tagOf = (mode, week) => `${mode === 'preseason' ? 'p' : 'w'}${String(week).padStart(2, '0')}`
export const digestKey = (season, mode, week) => `${season}_${tagOf(mode, week)}`
export const digestUrl = (base, season, key) => `${base}/nfl_results_${season}_${key.split('_')[1]}.json`

/** Keys to ask for: the preseason weeks, then regular-season weeks up to the current one (none in a preseason week). */
export function digestKeys(season, mode, week) {
  const keys = []
  for (let w = 1; w <= PRE_WEEKS; w++) keys.push(digestKey(season, 'preseason', w))
  const top = mode === 'week' ? Math.min(MAX_WEEK, Math.max(Number(week) || 0, 1)) : 0
  for (let w = 1; w <= top; w++) keys.push(digestKey(season, 'week', w))
  return keys
}

/** A graded week has at least one graded pick -- the archive's hasGrade rule. */
export const gradedTotals = (j) => Boolean(j && j.totals && Object.values(j.totals).some((t) => t && Number(t.n) > 0))

/** One week's file -> what Home keeps ({ totals, line_totals when the week has book lines }), or null when the week has no grade. */
export const digestOf = (j) => (gradedTotals(j) ? { totals: j.totals, ...(j.bars && typeof j.bars === 'object' ? { bars: j.bars } : {}), ...(j.line_totals && typeof j.line_totals === 'object' ? { line_totals: j.line_totals } : {}) } : null)
