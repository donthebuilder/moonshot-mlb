// BUCKETS' BOARD ANGLES (2026-10-05, Donovan: "measure them against last year's data and
// preseason when starters are on the floor"). The rules were fixed BEFORE measuring and measured
// by scripts/buckets/angle-backtest.mjs on 2025-26 replayed as of each night (lib/nba/angleBacktest.json).
// Shipped only where the angle beat its own base; the words quote the file, never a typed number.
//   aligned  his opponent allows points in tonight's top third AND his shots (fgaPg) are in the
//            night's 75th percentile
//   hiconf   PTS score 85+
//   weak     NOT SHIPPED: opponent top 10 vs his position, on the board -- measured below the
//            board's own rate (see the file), so it isn't a reason to look.
// The PTS 25+ market only: that's the market that was measured.
import BT from './angleBacktest.json'

const pct = (x) => `${x.hits.toLocaleString()} of ${x.n.toLocaleString()} scored 25+ (${x.rate}%)`
export const ANGLE_BASIS = BT

/** rows: boardRows(...) of the PTS board. Returns AngleRow defs. */
export function bucketsAngles(rows = []) {
  const L = BT.lastSeason
  const opps = [...new Set(rows.map((r) => r.opp))].map((o) => [o, Number(rows.find((r) => r.opp === o)?.legs?.oppPts)]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])
  const soft = new Set(opps.slice(0, Math.ceil(opps.length / 3)).map(([o]) => o))
  return [
    { key: 'aligned', label: '◆ Aligned', test: (r) => soft.has(r.opp) && Number(r.pct?.fgaPg) >= 75,
      title: `His opponent allows points in tonight's top third and his shots are in the night's 75th percentile. ${L.season} replayed night by night: ${pct(L.aligned)}; the board's rows ${L.board.rate}%.` },
    { key: 'hiconf', label: '🔒 High confidence', test: (r) => Number(r.score) >= 85,
      title: `PTS score 85 or higher. ${L.season} replayed night by night: ${pct(L.hiconf)}; the board's rows ${L.board.rate}%.` },
  ]
}
