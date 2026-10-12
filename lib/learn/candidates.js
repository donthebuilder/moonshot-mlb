// THE MODEL-UPGRADE QUEUE (2026-10-12, accuracy loop). Pure. PRIVATE OUTPUT ONLY.
//
// A candidate is "weight feature X up (or down) a little in the model's ranking", tested on HISTORICAL rows
// by a WALK-FORWARD backtest: for each unit (night / week) from the minTrain-th on, choose the weight on the
// units BEFORE it only, then score that one unit with the chosen weight against the model's own stored score.
// The training units are always strictly earlier than the test unit (the check proves it). Nothing here writes
// to the database, changes a live model, or runs at the site: it returns proposals for the private notes.
//
// The lift is per-unit ranking quality (AUC of "produced the thing" over every graded row of that unit), the
// adjusted ranking against the stored one, plus top-K precision (K = how many the model called that unit).
// A proposal is:
//   ready      enough held-out units, the mean lift clears a margin, survives a Bonferroni across every feature
//              tried, is positive in BOTH halves of the held-out units, picks the same weight sign in >= 80%
//              of folds, and does not lose top-K precision
//   watch      positive but failing one of those
//   rejected   no lift (or negative)
//   tracking   too few held-out units to say
// Promotion of a 'ready' proposal is a NEW model_version, written as a SHADOW beside the live model with its own
// rows for N nights (the lamp-goalpos-v1 / lamp-goalw-v1 / goal2_site_v1 pattern); see shadowDesign().
import { auc, mean, sd, tTwoSidedP, percentRanks } from './stats'
import { unitsOf } from './groups'

export const LAMBDAS = [-1, -0.5, -0.25, 0.25, 0.5, 1]
export const MIN_TRAIN_UNITS = 3
export const MIN_TEST_UNITS = 14   // held-out nights (weeks) before a proposal can be ready: two and a half weeks of nights; for NFL, most of a season
export const LIFT_MARGIN = 0.005     // mean AUC lift (0.5 points) before a proposal can be ready
export const SIGN_CONSISTENCY = 0.8

const settled = (r) => r.produced === true || r.produced === false

function unitTable(rows, feature) {
  const byUnit = new Map()
  for (const r of rows) {
    if (!settled(r) || !Number.isFinite(r.score) || !Number.isFinite(r.features?.[feature])) continue
    if (!byUnit.has(r.unit)) byUnit.set(r.unit, [])
    byUnit.get(r.unit).push(r)
  }
  const table = []
  for (const unit of [...byUnit.keys()].sort()) {
    const list = byUnit.get(unit)
    const y = list.map((r) => (r.produced ? 1 : 0))
    if (!y.includes(1) || !y.includes(0) || list.length < 20) continue    // a unit that can't rank anything is skipped
    const ps = percentRanks(list.map((r) => r.score)), pf = percentRanks(list.map((r) => r.features[feature]))
    const K = list.filter((r) => r.status === 'called').length
    table.push({ unit, ps, pf, y, K })
  }
  return table
}

const aucOf = (t, lam) => {
  const s = t.ps.map((v, i) => v + lam * t.pf[i])
  return auc(s.filter((_, i) => t.y[i] === 1), s.filter((_, i) => t.y[i] === 0))
}
function topK(t, lam) {
  if (!t.K) return null
  const s = t.ps.map((v, i) => [v + lam * t.pf[i], i, t.pf[i]])
  // ties broken by the stored score's own rank so lam=0 reproduces the model's order
  s.sort((a, b) => b[0] - a[0] || t.ps[b[1]] - t.ps[a[1]])
  return s.slice(0, t.K).reduce((c, x) => c + t.y[x[1]], 0) / t.K
}

/**
 * Walk-forward test of one feature. Returns { feature, folds: [{ test, train: [units before], lambda, lift, topKLift }], ... }.
 * `k` is how many features are being tried (the Bonferroni divisor).
 */
export function walkForward(rows, feature, { k = 1, lambdas = LAMBDAS, minTrain = MIN_TRAIN_UNITS } = {}) {
  const T = unitTable(rows, feature)
  const grid = [0, ...lambdas]
  const A = T.map((t) => grid.map((l) => aucOf(t, l)))
  const folds = []
  for (let i = minTrain; i < T.length; i += 1) {
    const trainIx = Array.from({ length: i }, (_, j) => j)
    let best = 0, bestMean = mean(trainIx.map((j) => A[j][0]))
    grid.forEach((l, gi) => { if (l === 0) return; const m = mean(trainIx.map((j) => A[j][gi])); if (m > bestMean) { bestMean = m; best = l } })
    const gi = grid.indexOf(best)
    const k0 = topK(T[i], 0), k1 = topK(T[i], best)
    folds.push({ test: T[i].unit, train: trainIx.map((j) => T[j].unit), lambda: best, lift: A[i][gi] - A[i][0], topKLift: k0 != null && k1 != null ? k1 - k0 : null })
  }
  const lifts = folds.map((f) => f.lift)
  const m = mean(lifts)
  const se = lifts.length > 1 ? sd(lifts) / Math.sqrt(lifts.length) : null
  const p = se > 0 ? tTwoSidedP(m / se, lifts.length - 1) : 1
  const pBonf = Math.min(1, p * Math.max(1, k))
  const half = Math.ceil(lifts.length / 2)
  const halves = lifts.length >= 2 ? [mean(lifts.slice(0, half)), mean(lifts.slice(half))] : [null, null]
  const nonzero = folds.filter((f) => f.lambda !== 0)
  const modalSign = nonzero.length ? (nonzero.filter((f) => f.lambda > 0).length >= nonzero.length / 2 ? 1 : -1) : 0
  const signShare = folds.length ? folds.filter((f) => Math.sign(f.lambda) === modalSign && modalSign !== 0).length / folds.length : 0
  const tk = folds.map((f) => f.topKLift).filter(Number.isFinite)
  const topKMean = tk.length ? mean(tk) : null
  const testUnits = folds.length
  let status
  if (testUnits < MIN_TEST_UNITS) status = 'tracking'
  else if (m >= LIFT_MARGIN && pBonf < 0.05 && halves[0] > 0 && halves[1] > 0 && signShare >= SIGN_CONSISTENCY && (topKMean == null || topKMean >= 0)) status = 'ready'
  else if (m > 0) status = 'watch'
  else status = 'rejected'
  return { feature, direction: modalSign > 0 ? 'up' : modalSign < 0 ? 'down' : 'none', testUnits, trainUnitsTotal: T.length, meanLift: m, liftRange: se != null ? [m - 1.96 * se, m + 1.96 * se] : null, p, pBonferroni: pBonf, halves, signShare, topKLift: topKMean, status, folds }
}

/** Try every feature present in most rows; return the proposals sorted ready > watch > tracking > rejected, then by lift. */
export function proposeCandidates(rows, { names = null, minShare = 0.7 } = {}) {
  const settledRows = rows.filter(settled)
  const feats = names || (() => {
    const c = new Map()
    for (const r of settledRows) for (const k of Object.keys(r.features || {})) c.set(k, (c.get(k) || 0) + 1)
    return [...c.entries()].filter(([, n]) => n >= minShare * settledRows.length).map(([k]) => k).sort()
  })()
  const res = feats.map((f) => walkForward(rows, f, { k: feats.length }))
  const rank = { ready: 0, watch: 1, tracking: 2, rejected: 3 }
  res.sort((a, b) => rank[a.status] - rank[b.status] || (b.meanLift ?? -1) - (a.meanLift ?? -1))
  return { tried: feats.length, units: unitsOf(settledRows).length, proposals: res }
}

/** The shadow-version design for a ready proposal. Words only: nothing here ships anything. */
export function shadowDesign({ sport, market, liveVersion, proposal }) {
  const next = `${liveVersion}-${String(proposal.feature).replace(/[^a-z0-9]+/gi, '').toLowerCase().slice(0, 12)}-shadow`
  return {
    newVersion: next,
    rule: `${proposal.direction} weight on ${proposal.feature}`,
    how: [
      `Write ${next} rows beside ${liveVersion} at the same lock, in the same table, with its own model_version and the same pregame inputs. The live model's rows are never read-modified or rewritten.`,
      'Nothing is written at or after first pitch / kickoff / puck drop. The shadow is never shown as a CALL, never posted, never counted in the public record.',
      'Run it for at least 30 graded nights (a weekly sport like NFL: through the season) with both versions locked on the same units.',
      'Judge it on the held-out nights only: per-night ranking quality and the called set, against the live version, with ranges. Promotion is a new version number with new rows, decided by Donovan.',
    ],
    sport, market, evidence: { testUnits: proposal.testUnits, meanLift: proposal.meanLift, liftRange: proposal.liftRange, pBonferroni: proposal.pBonferroni },
  }
}
