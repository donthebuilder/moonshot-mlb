// WHICH STORED FEATURES SEPARATE TWO GROUPS (2026-10-12, accuracy loop). Pure.
//
// For each pick-time feature: A's values against B's. The numbers per feature:
//   nA / nB        rows with the feature in each group
//   medA / medB    the groups' medians
//   effect         (medA - medB) over the pooled spread (1.4826 x MAD), with a bootstrap range: "chips away from the middle"
//   auc            the chance a random A row sits above a random B row (0.5 = no separation), with a bootstrap range
//   stable         the same direction, and at least STABLE_MIN apart from 0.5, in BOTH halves of the units (nights / weeks)
//                  (null when a half has under HALF_MIN rows in a group: it can't be tested yet)
//   claim          what the site may say: needs n >= minN in both groups, a range that excludes 0.5, a pass of the
//                  Benjamini-Hochberg false-discovery check across ALL features compared, and stable === true.
//                  Anything else is 'tracking' (description for the private report only).
//   banded         true: each row is only compared with rows in the SAME score band of its night/week (the feature's information beyond the stored score)
// This describes two groups. It is not a forecast and not an instruction to the model.
import { compareGroups, compareStrat, auc, benjaminiHochberg } from './stats'
import { MIN_GROUP_N, unitsOf } from './groups'

export const HALF_MIN = 10        // rows per group in each half before the half-test means anything
export const STABLE_MIN = 0.03    // each half's AUC must be at least this far from 0.5, same side
export const FDR_Q = 0.1

const vals = (rows, f) => rows.map((r) => r.features?.[f]).filter(Number.isFinite)
const pairs = (rows, f) => rows.filter((r) => Number.isFinite(r.features?.[f]) && r.bin != null).map((r) => ({ v: r.features[f], s: r.bin }))

/** Split rows into the earlier and later half of their units. */
export function halvesOf(rows) {
  const u = unitsOf(rows)
  const cut = Math.ceil(u.length / 2)
  const first = new Set(u.slice(0, cut))
  return u.length < 2 ? [rows, []] : [rows.filter((r) => first.has(r.unit)), rows.filter((r) => !first.has(r.unit))]
}

/**
 * @param A,B   LearnRows
 * @param names feature names to test (default: every name both groups carry)
 * @returns { nA, nB, units, floor: boolean, features: [...sorted by |auc-0.5|] }
 */
export function separate(A, B, { names = null, minN = MIN_GROUP_N, reps = 300, seed = 7, banded = false } = {}) {
  const feats = names || [...new Set(A.concat(B).flatMap((r) => Object.keys(r.features || {})))].sort()
  const [a1, a2] = halvesOf(A)
  const [b1, b2] = halvesOf(B)
  const out = []
  for (const f of feats) {
    const va = vals(A, f), vb = vals(B, f)
    // banded: compared only against rows of the SAME score band (rows must carry `bin`, lib/learn/groups.js withBins)
    const c = banded ? compareStrat(pairs(A, f), pairs(B, f), { reps, seed }) : compareGroups(va, vb, { reps, seed })
    if (!c) continue
    const h = [[a1, b1], [a2, b2]].map(([x, y]) => {
      if (banded) { const p = pairs(x, f), q = pairs(y, f); return p.length >= HALF_MIN && q.length >= HALF_MIN ? compareStrat(p, q, { reps: 1 })?.auc ?? null : null }
      const p = vals(x, f), q = vals(y, f)
      return p.length >= HALF_MIN && q.length >= HALF_MIN ? auc(p, q) : null
    })
    const testable = h[0] != null && h[1] != null
    const sgn = (v) => Math.sign(v - 0.5)
    const stable = testable ? sgn(h[0]) === sgn(h[1]) && sgn(h[0]) === sgn(c.auc) && Math.abs(h[0] - 0.5) >= STABLE_MIN && Math.abs(h[1] - 0.5) >= STABLE_MIN : null
    const binary = va.length > 0 && va.concat(vb).every((v) => v === 0 || v === 1)
    out.push({ feature: f, ...c, halves: h, stable, binary, direction: c.auc > 0.5 ? 'higher' : c.auc < 0.5 ? 'lower' : 'same' })
  }
  const pass = benjaminiHochberg(out.map((x) => x.p), FDR_Q)
  out.forEach((x, i) => {
    const floor = x.nA >= minN && x.nB >= minN
    const clear = x.aucRange[0] > 0.5 || x.aucRange[1] < 0.5
    x.fdrPass = pass[i]
    x.claim = floor && clear && pass[i] && x.stable === true ? 'separates' : 'tracking'
    x.why = x.claim === 'separates' ? null : !floor ? `under ${minN} rows in a group` : !clear ? 'range includes no-difference' : !pass[i] ? 'does not survive the many-features check' : x.stable == null ? 'a half is too thin to test' : 'not the same in both halves'
  })
  out.sort((p, q) => Math.abs(q.auc - 0.5) - Math.abs(p.auc - 0.5))
  return { nA: A.length, nB: B.length, units: unitsOf(A.concat(B)).length, floor: A.length >= minN && B.length >= minN, banded, features: out }
}
