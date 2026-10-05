// BUCKETS' BOARD ANGLES, EVERY MARKET (2026-10-05, Donovan: "measure them against last year's data
// ... needs to be ran for all sports and all props"). Rules fixed BEFORE measuring and measured by
// scripts/buckets/angle-backtest.mjs on 2025-26 replayed as of each night (lib/nba/angleBacktest.json).
// An angle shows on a market's board only where it beat that market's board rows ('edge'); the words
// quote the file, never a typed number.
//   aligned  his opponent allows the market's stat in tonight's top third AND his volume leg is in
//            the night's 75th percentile
//   hiconf   the market's score 85+
//   weak     on the board AND his opponent top 10 of 30 in that stat allowed to his position
import BT from './angleBacktest.json'

export const ANGLE_BASIS = BT
// the market's stat allowed (the board's opp legs) and its volume leg -- the backtest's own table
const OPP = { pts: 'oppPts', reb: 'oppReb', ast: 'oppAst', '3pm': 'oppTpm', pra: 'oppPts', first: 'oppPts' }
const VOLUME = { pts: 'fgaPg', reb: 'rebPg', ast: 'astPg', '3pm': 'tpaPg', pra: 'fgaPg', first: 'fgaShare' }
const WORD = { pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threes', pra: 'points', first: 'points' }
const said = (x, base, bar) => `${BT.lastSeason.season} replayed night by night: ${x.hits.toLocaleString()} of ${x.n.toLocaleString()} ${bar} (${x.rate}%); the board's rows ${base.rate}%.`
const BAR = { pts: 'scored 25+', reb: 'had 10+ rebounds', ast: 'had 8+ assists', '3pm': 'made 4+ threes', pra: 'had 35+ PRA', first: 'scored the first basket' }

/** rows: boardRows(...) of one market's board (with the dvp map when known). Returns AngleRow defs. */
export function bucketsAngles(rows = [], market = 'pts') {
  const M = BT.lastSeason.markets?.[market]
  if (!M) return []
  const ok = (k) => M[k]?.verdict === 'edge'
  const opps = [...new Set(rows.map((r) => r.opp))].map((o) => [o, Number(rows.find((r) => r.opp === o)?.legs?.[OPP[market]])]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])
  const soft = new Set(opps.slice(0, Math.ceil(opps.length / 3)).map(([o]) => o))
  const out = []
  if (ok('aligned')) out.push({ key: 'aligned', label: '◆ Aligned', test: (r) => soft.has(r.opp) && Number(r.pct?.[VOLUME[market]]) >= 75,
    title: `His opponent allows ${WORD[market]} in tonight's top third and his volume is in the night's 75th percentile. ${said(M.aligned, M.board, BAR[market])}` })
  if (ok('hiconf')) out.push({ key: 'hiconf', label: '🔒 High confidence', test: (r) => Number(r.score) >= 85,
    title: `Score 85 or higher. ${said(M.hiconf, M.board, BAR[market])}` })
  return out
}
