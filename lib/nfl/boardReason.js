// A BOARD CARD THAT SAYS SOMETHING (2026-09-27, BATCH-TUDDY-DEPTH step 4).
//
// The Boards card's "why" line was reasonFor(): the component that lifted
// his score most, as a fixed clause. Most of a market's top ten share a top
// component, so 8 of 10 cards read the same sentence ("He gets handed the
// ball constantly...") and the line told you nothing about THIS man. Same
// pick of component (edge = (percentile - board median) x weight, the one
// reasonFor always used, with its 60th-percentile floor), but the sentence
// now carries the number behind it: his published per-game stat for that
// component and where it ranks among his position on this board --
//   "Red-zone touches: 5.5 red-zone opp / game · 2nd of 41 RBs here"
// A component with no player stat behind it (team total, defense softness,
// kicking environment) keeps its clause and says its percentile instead.
//
// FIELDS: the component -> stat map below; values from players[].stats
// (nfl_week.json), labels and formats from lib/nfl/statLabels.js.
import { WHY, LABELS } from './scoreLabels'
import { statLabel, statFmt } from './statLabels'
import { ordinal } from '../format'

const STAT_OF = {
  f_gl_opp: 'GL', f_rz_opp: 'RZ', f_xtd: 'xTD', f_wopr: 'WOPR',
  f_receiving_yards: 'RECYD', f_receiving_air_yards: 'AIRYD', f_target_share: 'TGT%',
  f_receptions: 'REC', f_targets: 'TGT', f_carries: 'CAR', f_rushing_yards: 'RUYD',
  f_ngs_rush_yards_over_expected_per_att: 'RYOE', f_passing_yards: 'PAYD',
  f_attempts: 'ATT', f_passing_cpoe: 'CPOE',
}
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))

/** The component that lifted his score most -- reasonFor()'s pick, returned with its numbers. */
export function topComponent(player, weights, base, market) {
  const comps = player?.components?.[market]
  if (!comps || !weights) return null
  let best = null
  for (const [k, pctRaw] of Object.entries(comps)) {
    const w = Number(weights[k])
    const pct = Number(pctRaw)
    if (!Number.isFinite(w) || !Number.isFinite(pct) || !WHY[k]) continue
    const edge = (pct - (base?.[k] ?? 50)) * w
    if (!best || edge > best.edge) best = { k, edge, pct }
  }
  if (!best || best.pct < 60 || best.edge <= 0) return null
  return best
}

/**
 * The card's line: { key, text } or null (nothing cleared the bar -- an
 * absent line is honest). `rows` = the board's players, for the rank.
 */
export function boardReason(player, weights, base, market, rows = []) {
  const top = topComponent(player, weights, base, market)
  if (!top) return null
  const label = LABELS[top.k] || top.k
  const stat = STAT_OF[top.k]
  const v = stat ? num(player?.stats?.[stat]) : NaN
  if (stat && Number.isFinite(v)) {
    const pos = player?.position
    const peers = (rows || []).filter((p) => p?.position === pos && Number.isFinite(num(p?.stats?.[stat])))
    const rank = 1 + peers.filter((p) => num(p.stats[stat]) > v).length
    const where = pos && peers.length > 1 ? ` · ${ordinal(rank)} of ${peers.length} ${pos}s here` : ''
    // The stat's unit, unless it only repeats the label ("Target share:
    // 44.1% target share"); a per-game stat keeps "a game" either way.
    const unit = statLabel(stat)
    const perGame = / \/ game$/i.test(unit)
    const bare = unit.replace(/ \/ game$/i, '')
    const repeats = label.toLowerCase().includes(bare.toLowerCase()) || bare.toLowerCase().includes(label.toLowerCase())
    const unitWord = repeats ? (perGame ? ' a game' : '') : ` ${/[a-z]/.test(bare) ? bare.charAt(0).toLowerCase() + bare.slice(1) : bare}${perGame ? ' a game' : ''}`
    return { key: top.k, text: `${label}: ${statFmt(stat, v)}${unitWord}${where}` }
  }
  return { key: top.k, text: `He ${WHY[top.k]} (${ordinal(Math.round(top.pct))} percentile).` }
}
