// THE BOARD COLUMNS, LAMP (R6, 2026-10-02). The twin of lib/nfl/boardColumns.js:
// every number a goal-board row carries (lib/nhl/goalBoard.js) that a table
// doesn't already show, in groups, shown only when some row in the table has
// it. Nothing invented -- the legs, their percentiles on tonight's board, the
// games behind them and the matchup context the model read.
//
//   nhlBoardRow(r)              -> the flattened fields (r = the board's row)
//   withNhlFullSet(rows, own)   -> for rows keeping the board row on `_row`:
//                                  the rows with those fields + own columns,
//                                  then the extra ones
export const NHL_BOARD_GROUPS = {
  legs: { key: 'legs', label: 'Percentiles', order: 4 },   // short: a long group name wraps and raises the first row
  sample: { key: 'sample', label: 'Sample', order: 5 },
  matchup: { key: 'matchup', label: 'The matchup', order: 6 },
}
const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export function nhlBoardRow(r) {
  const out = {}
  const p = r?.pct || {}
  for (const [k, key] of [['shotsPg', 'p_spg'], ['goalsPg', 'p_gpg'], ['toi', 'p_toi']]) { const x = fin(p[k]); if (x != null) out[key] = Math.round(x) }
  const gp = fin(r?.legs?.gpCur); if (gp != null) out.gp = gp
  const gpPool = fin(r?.legs?.gpPooled); if (gpPool != null) out.gp_pool = gpPool
  const ga = fin(r?.context?.oppGaPg); if (ga != null) out.opp_ga = ga
  if (r?.context?.oppGoalie) out.opp_goalie = String(r.context.oppGoalie?.name || r.context.oppGoalie)
  return out
}

const COLS = [
  { key: 'p_spg', label: 'S %ile', w: 70, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His shots on goal a game, as a percentile among every skater on tonight’s board.' },
  { key: 'p_gpg', label: 'G %ile', w: 70, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His goals a game, as a percentile among every skater on tonight’s board.' },
  { key: 'p_toi', label: 'TOI %ile', w: 82, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His ice time a game, as a percentile among every skater on tonight’s board.' },
  { key: 'gp', label: 'GP', w: 40, heat: false, group: NHL_BOARD_GROUPS.sample, explain: 'Games played this season.' },
  { key: 'gp_pool', label: 'GP used', w: 76, heat: false, group: NHL_BOARD_GROUPS.sample, explain: 'Games the model pooled for his rates (this season, plus last season weighted down early on).' },
  { key: 'opp_ga', label: 'OPP GA/G', w: 84, dp: 2, group: NHL_BOARD_GROUPS.matchup, explain: 'Tonight’s opponent’s goals against a game this season.' },
  { key: 'opp_goalie', label: 'OPP G', w: 110, heat: false, numeric: false, group: NHL_BOARD_GROUPS.matchup, explain: 'The goalie the model expected in the opposing net, when one was known.' },
]

/** Rows with the full set's fields (the board row on `_row`, or `_raw`). */
export const nhlFullRows = (rows = []) => rows.map((x) => { const b = x?._row || x?._raw; return b ? { ...nhlBoardRow(b), ...x } : x })
/** A table's own columns, then each extra one some row (from nhlFullRows) fills. */
export function nhlFullColumns(rows = [], own = []) {
  const has = new Set(); for (const r of rows) for (const k of Object.keys(r || {})) if (r[k] != null) has.add(k)
  const mine = new Set(own.map((c) => c.key))
  return [...own, ...COLS.filter((c) => has.has(c.key) && !mine.has(c.key))]
}
export function withNhlFullSet(rows = [], own = []) {
  const full = nhlFullRows(rows)
  return { rows: full, columns: nhlFullColumns(full, own) }
}
