// WHAT EACH TUDDY ANGLE HAS DONE (2026-10-05, Donovan: "needs to be ran for all sports and all props").
// scripts/nfl/angle-backtest.mjs -> lib/nfl/angleBacktest.json: 2026 weeks 1-4 (the only weeks whose
// pregame board is archived; no 2025 board exists). The words quote the file, never a typed number.
import BT from './angleBacktest.json'

export const NFL_ANGLE_BASIS = BT
const span = () => `weeks ${BT.weeks.map((w) => w.week).join(', ')}`
/** A sentence for one angle on one market, or null when the file has nothing to say. */
export function angleRecord(market, key) {
  const a = BT.markets?.[market]
  if (BT.notMeasurable?.[key]) return `Not measured yet: the ${BT.notMeasurable[key]}.`
  const x = a?.[key]
  if (!x) return null
  const base = key === 'hiconf' ? a.hiconf_base : a.board
  if (x.verdict === 'too few') return `Measured on ${x.n} row${x.n === 1 ? '' : 's'} (${span()}): too few to say.`
  return `${span()}: ${x.hits} of ${x.n} (${x.rate}%) against the board's ${base?.rate}%${x.verdict === 'edge' ? '' : ' -- no edge'}.`
}
/** False only when the angle was measured on this market and lost to the board. */
export const angleEarns = (market, key) => BT.markets?.[market]?.[key]?.verdict !== 'no edge'
