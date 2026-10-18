// Which lanes run hot: per lane over graded nights, matched hit rate vs the
// eligible base rate, the difference and a two-proportion z (matched vs the
// rest of the eligible pool). `shown` from MIN_NIGHTS graded nights.
import { LANES } from './lanes'
import { wilson } from '../interval'

// THE SAMPLE FLOOR (2026-10-10). A lane is TRACKING until it has BOTH 30 graded nights AND 30 graded matched
// players (MIN_MATCHED): a lane that matches one man a night has not earned a rate at 30 nights, and a brand-new
// cipher lane starts at zero. Under the floor the counts are shown (real, small) with no z and no highlight.
export const MIN_NIGHTS = 30
export const MIN_MATCHED = 30

/** The one-line note on the Numerology tabs (and beside the lane scoreboard): many lanes, some look hot by chance. */
export const multiLaneNote = (n) => `${n} lanes tested: some look hot by chance. Each shows its own n and the base rate.`

/** All-lanes base rate over the same graded rows: every lane's eligible pool added up. { rate, hits, n, range } or null. */
export function allLanesBase(rows) {
  let n = 0; let hits = 0
  for (const r of rows || []) {
    if (!r.graded_at || r.eligible_hits == null) continue
    n += r.eligible || 0; hits += r.eligible_hits || 0
  }
  return n ? { rate: hits / n, hits, n, range: wilson(hits, n) } : null
}

export function laneTable(rows) {
  const by = new Map()
  for (const r of rows || []) {
    if (!r.graded_at || r.eligible_hits == null) continue
    const o = by.get(r.lane) || { lane: r.lane, nights: 0, matched: 0, matchedHits: 0, eligible: 0, eligibleHits: 0 }
    o.nights += 1; o.matched += r.matched; o.matchedHits += r.matched_hits || 0; o.eligible += r.eligible; o.eligibleHits += r.eligible_hits || 0
    by.set(r.lane, o)
  }
  const label = Object.fromEntries(LANES.map((l) => [l.key, { label: l.label, group: l.group }]))
  return [...by.values()].filter((o) => label[o.lane]).map((o) => {
    const p1 = o.matched ? o.matchedHits / o.matched : null
    const p0 = o.eligible ? o.eligibleHits / o.eligible : null
    // two-proportion z: matched vs the rest of the eligible pool
    const restN = o.eligible - o.matched; const restHits = o.eligibleHits - o.matchedHits
    let z = null
    if (o.matched > 0 && restN > 0) {
      const pr = restHits / restN; const pool = o.eligibleHits / o.eligible
      const se = Math.sqrt(pool * (1 - pool) * (1 / o.matched + 1 / restN))
      z = se > 0 ? (p1 - pr) / se : null
    }
    const shown = o.nights >= MIN_NIGHTS && o.matched >= MIN_MATCHED
    return {
      ...o, ...label[o.lane], matchedRate: p1, baseRate: p0, diff: p1 != null && p0 != null ? p1 - p0 : null, z, shown,
      needs: Math.max(0, MIN_NIGHTS - o.nights), needsMatched: Math.max(0, MIN_MATCHED - o.matched),
      range: o.matched ? wilson(o.matchedHits, o.matched) : null,           // 95% Wilson, percent
      baseRange: o.eligible ? wilson(o.eligibleHits, o.eligible) : null,
    }
  }).sort((a, b) => (b.shown - a.shown) || (Math.abs(b.z || 0) - Math.abs(a.z || 0)) || a.lane.localeCompare(b.lane))
}

