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
  season: { key: 'season', label: 'Season line', order: 6 },   // 2026-10-06: MOONSHOT's Szn HR / PA group, for goals
  form: { key: 'form', label: 'Form', order: 7 },               // MOONSHOT's L5 HR / L10 HR / Drought
  matchup: { key: 'matchup', label: 'The matchup', order: 8 },
}
const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export function nhlBoardRow(r) {
  const out = {}
  const p = r?.pct || {}
  for (const [k, key] of [['shotsPg', 'p_spg'], ['goalsPg', 'p_gpg'], ['toi', 'p_toi']]) { const x = fin(p[k]); if (x != null) out[key] = Math.round(x) }
  const gp = fin(r?.legs?.gpCur); if (gp != null) out.gp = gp
  const gpPool = fin(r?.legs?.gpPooled); if (gpPool != null) out.gp_pool = gpPool
  // the season line (goals as MOONSHOT counts home runs) and the form, from lib/nhl/seasonLine.js.
  // NOT legs.goalsPg: that is the model's pooled rate, shown as G/GP and G %ile.
  const z = r?.szn
  if (z) for (const [k, key] of [['g', 'szn_g'], ['a', 'szn_a'], ['pts', 'szn_pts'], ['gp', 'szn_gp'], ['s', 'szn_s'], ['shPct', 'szn_shpct'], ['g60', 'szn_g60']]) { const x = fin(z[k]); if (x != null) out[key] = x }
  const f = r?.form
  if (f) {
    const d = fin(f.drought); if (d != null) { out.drought = d; if (f.droughtPlus) out.drought_plus = true }
    const l5 = fin(f.l5); if (l5 != null) out.l5g = l5
    const l10 = fin(f.l10); if (l10 != null) out.l10g = l10
  }
  const ga = fin(r?.context?.oppGaPg); if (ga != null) out.opp_ga = ga
  if (r?.context?.oppGoalie) out.opp_goalie = String(r.context.oppGoalie?.name || r.context.oppGoalie)
  return out
}

const COLS = [
  { key: 'p_spg', label: 'S %ile', w: 70, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His shots on goal a game, as a percentile among every skater on tonight’s board.' },
  { key: 'p_gpg', label: 'G %ile', w: 70, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His goals a game, as a percentile among every skater on tonight’s board.' },
  { key: 'p_toi', label: 'TOI %ile', w: 82, scale: 'seq', domain: [0, 100], group: NHL_BOARD_GROUPS.legs, explain: 'His ice time a game, as a percentile among every skater on tonight’s board.' },
  { key: 'gp', label: 'GP', w: 40, heat: false, group: NHL_BOARD_GROUPS.sample, explain: 'Games played this season.' },
  { key: 'gp_pool', label: 'GP used', w: 76, heat: false, group: NHL_BOARD_GROUPS.sample, explain: 'Games pooled for his rates (this season, plus last season weighted down early on).' },
  { key: 'szn_g', label: 'Szn G', w: 52, dp: 0, group: NHL_BOARD_GROUPS.season, explain: 'Goals this regular season, counted before tonight’s puck drop. Not G/GP: that is his pooled rate.' },
  { key: 'szn_a', label: 'Szn A', w: 52, dp: 0, group: NHL_BOARD_GROUPS.season, explain: 'Assists this regular season, before tonight.' },
  { key: 'szn_pts', label: 'Szn PTS', w: 62, dp: 0, group: NHL_BOARD_GROUPS.season, explain: 'Points this regular season, before tonight.' },
  { key: 'szn_gp', label: 'Szn GP', w: 58, dp: 0, heat: false, group: NHL_BOARD_GROUPS.season, explain: 'Games he has played this regular season, before tonight (every club he played for).' },
  { key: 'szn_s', label: 'Szn S', w: 52, dp: 0, group: NHL_BOARD_GROUPS.season, explain: 'Shots on goal this regular season, before tonight.' },
  { key: 'szn_shpct', label: 'S%', w: 48, dp: 1, group: NHL_BOARD_GROUPS.season, explain: 'Shooting percentage this season: goals over shots on goal.' },
  { key: 'szn_g60', label: 'G/60', w: 52, dp: 2, group: NHL_BOARD_GROUPS.season, explain: 'Goals per 60 minutes on ice this season.' },
  { key: 'l5g', label: 'L5 G', w: 48, dp: 0, group: NHL_BOARD_GROUPS.form, explain: 'Goals in his last five games before tonight (fewer games early in the season).' },
  { key: 'l10g', label: 'L10 G', w: 52, dp: 0, group: NHL_BOARD_GROUPS.form, explain: 'Goals in his last ten games before tonight (fewer games early in the season).' },
  { key: 'drought', label: 'Drought', w: 58, dp: 0, group: NHL_BOARD_GROUPS.form, fmt: (v, r) => (v == null ? '—' : r?.drought_plus ? `${v}+` : String(v)), explain: 'Games he has played since his last goal, before tonight. “N+” means no goal in the last five weeks of games, so at least N. Read it next to Szn G: a long drought on a man who rarely scores is who he is.' },
  { key: 'opp_ga', label: 'OPP GA/G', w: 84, dp: 2, group: NHL_BOARD_GROUPS.matchup, explain: 'Tonight’s opponent’s goals against a game this season.' },
  { key: 'opp_goalie', label: 'OPP G', w: 110, heat: false, numeric: false, group: NHL_BOARD_GROUPS.matchup, explain: 'The goalie expected in the opposing net, when one was known.' },
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

// ── THE OPPOSING GOALIE'S WEAK ZONE (2026-10-10), an OPTIONAL column ─────────────────────────────────────────────
// Group "The matchup". Default off: the board's filters sheet switches it on (components/lamp/tabs/Board.js). One cell per skater:
// the top two zones where the goalie in the net he shoots at has allowed the most goals above the league (lib/nhl/goalieWeak.js, the
// rules and the floor), as "Slot 7/38": goals over shots there this season. Only the CONFIRMED starter is read; an unconfirmed one says
// so and nothing else. Information, not a forecast. Tapping the cell opens the game's matchup block.
export const WEAK_ZONE_KEY = 'weak_zone'
/**
 * The cell's words for one board row.
 * @param r     a board row ({ home })
 * @param bg    its game ({ starters: { away, home } })
 * @param weak  { [goalieId]: readWeak payload }, or null while it loads
 */
export function weakZoneCell(r, bg, weak) {
  const s = bg?.starters
  if (!s || typeof s !== 'object') return 'no starter source'
  const e = s[r?.home ? 'away' : 'home'] || null           // the net he shoots at (lib/nhl/oppGoalie.js oppGoalieOf)
  if (!e || e.confirmed !== true) return 'starter not confirmed'
  const id = String(e.playerId ?? e.id ?? '')
  if (!weak) return '…'
  const w = weak[id]
  if (!w || w.state === 'unavailable') return '—'
  if (w.state === 'thin') return 'too few shots'
  if (w.state === 'none' || !w.spots?.length) return 'none above league'
  return w.spots.slice(0, 2).map((x) => `${x.short} ${x.ga}/${x.sa}`).join(' · ')
}
/** The column; `open(gameId)` is called on a tap, `gameOf(row)` gives the row's game id. */
export function weakZoneColumn({ open = null, gameOf = () => null } = {}) {
  return {
    key: WEAK_ZONE_KEY, label: 'GOALIE WEAK ZONE', w: 170, heat: false, numeric: false, group: NHL_BOARD_GROUPS.matchup,
    link: (r) => (open && gameOf(r) ? () => open(gameOf(r)) : null),
    explain: 'The zones where the goalie in the opposing net has allowed the most goals above the league’s rate, as goals over shots there this season (for example Slot 7/38). Only a confirmed starter is read, and only from 8 starts or 150 shots against; under that it says too few shots. Tap to open the game’s matchup block. Information, not a forecast.',
  }
}
