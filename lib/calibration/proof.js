// THE PROOF RULE, ONCE (Donovan 2026-10-06). Every sport's tiers pass through here.
//   PROVEN   at least MIN_N graded calls AND, on games played AFTER the tier's
//            chosen date, at least MIN_N graded calls that beat the board on
//            the same bar (hold-out). Both counts are printed.
//   TESTING  anything else with a count -- including every tier that has no
//            chosen date yet (then it is TESTING by definition).
//   FEW      under MIN_N graded calls: "not enough calls yet", no rate.
// `chosen` is the date the tier's rule was fixed (data/chosen.js); a game played
// on or before it is in-sample and never counts toward the hold-out.
export const MIN_N = 30
const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : null)

/**
 * @param {{n:number,hits:number}} all      the tier's graded calls
 * @param {{n:number,hits:number}} board    the board on the same bar (all games)
 * @param {{n:number,hits:number}|null} after  the tier's graded calls after the chosen date
 * @param {{n:number,hits:number}|null} boardAfter  the board after the chosen date
 * @param {string|null} chosen
 */
export function proofOf({ all, chosen, after, boardAfter, minN = MIN_N }) {
  if (all.n < minN) return { state: 'few', chosen: chosen || null, holdout: null }
  if (!chosen) return { state: 'testing', chosen: null, holdout: null, why: 'no chosen date recorded yet' }
  const h = after ? { n: after.n, hits: after.hits, rate: pct(after.hits, after.n), boardRate: boardAfter?.n ? pct(boardAfter.hits, boardAfter.n) : null } : { n: 0, hits: 0, rate: null, boardRate: null }
  const proven = h.n >= minN && h.rate != null && h.boardRate != null && h.rate > h.boardRate
  return { state: proven ? 'proven' : 'testing', chosen, holdout: h, why: proven ? null : h.n < minN ? `${h.n} graded calls since ${chosen} (need ${minN})` : 'does not beat the board since it was chosen' }
}
