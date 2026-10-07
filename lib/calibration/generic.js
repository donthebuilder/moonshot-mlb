// THE CALIBRATION SHAPE FOR ANY SPORT (2026-10-06). A sport hands in its tiers,
// each with its graded calls (and, where it has one, the board on the same bar);
// this returns the table block lib/calibration/mlbCalibration.js returns for
// MLB, so one component draws them all. Pure.
//   input tier: { key, label, kind, status?, bar, graded: [{date, hit}] | counts: {n, hits}, void?, pending?, board?: [{date, hit}] | null }
import { MIN_N, proofOf } from './proof'
import { chosenOf } from './chosen'

const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : null)

export function blockFrom(sport, tiers, { minN = MIN_N } = {}) {
  const rows = tiers.map((t) => {
    // a sport that only keeps counts (NFL's card) passes { counts: { n, hits } } and no rows
    const n = t.counts ? t.counts.n : t.graded.length
    const hits = t.counts ? t.counts.hits : t.graded.filter((g) => g.hit).length
    const board = t.board ? { n: t.board.length, hits: t.board.filter((g) => g.hit).length } : null
    const chosen = chosenOf(sport, t.key)
    const after = (xs) => (chosen && xs && !t.counts ? xs.filter((g) => g.date > chosen) : null)
    const cnt = (xs) => (xs ? { n: xs.length, hits: xs.filter((g) => g.hit).length } : null)
    const enough = n >= minN
    const dates = (t.graded || []).map((g) => g.date).sort()
    return {
      key: t.key, kind: t.kind, status: t.status || null, label: t.label, bar: t.bar,
      n, hits, misses: n - hits, rate: enough ? pct(hits, n) : null, enough,
      board: board ? { ...board, rate: pct(board.hits, board.n) } : { n: 0, hits: 0, rate: null },
      lift: enough && board?.n ? Math.round((pct(hits, n) - pct(board.hits, board.n)) * 10) / 10 : null,
      void: t.void || 0, pending: t.pending || 0, late: 0, lead: null,
      proof: proofOf({ all: { n, hits }, chosen, after: cnt(after(t.graded || [])), boardAfter: cnt(after(t.board)), minN }),
      nights: new Set(dates).size, from: dates[0] || null, to: dates[dates.length - 1] || null,
    }
  })
  const all = rows.flatMap((r) => [r.from, r.to]).filter(Boolean).sort()
  return { nights: Math.max(0, ...rows.map((r) => r.nights)), from: all[0] || null, to: all[all.length - 1] || null, board: Math.max(0, ...rows.map((r) => r.board.n)), late: 0, lateNights: [], void: rows.reduce((a, r) => a + r.void, 0), pending: rows.reduce((a, r) => a + r.pending, 0), tiers: rows }
}
