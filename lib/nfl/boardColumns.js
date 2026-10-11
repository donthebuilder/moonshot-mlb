// THE BOARD COLUMNS, TUDDY (R6, 2026-10-02). MOONSHOT's lib/boardColumns.js is
// "add all the columns ... to every table on the site" (Donovan, 09-25) for
// hitters; this is the same promise for football: every number a week-file
// player row carries, in groups, on every slate-player table. Nothing invented
// -- a column exists only for a field the payload publishes, and it is shown
// only when at least one row in the table has it (a kicker table grows no
// receiving columns).
//
//   nflBoardColumns(rows)          -> the extra columns, grouped, for these rows
//   nflBoardRow(p)                 -> the flattened fields those columns read
//   withNflBoardColumns(own, rows) -> a table's own columns, then every extra
//                                     one it doesn't already have
//
// Names: the short payload key in the header, STAT_LABELS' words in the
// explainer (the v2 sheet's i), one vocabulary for the card and the sheet.
import { STAT_LABELS, statLabel, statFmt } from './statLabels'
import { MARKETS } from './theme'
import { fmtShare, fmtPoints, trendGlyph } from '../shares'

export const NFL_BOARD_GROUPS = {
  // SHARE OF TEAM (2026-10-11): who gets the snaps, targets and carries. Right after the player and the call; lib/shares.js is the math.
  usage: { key: 'usage', label: 'Role & usage', order: 2 },
  scores: { key: 'scores', label: 'Model scores', order: 3 },
  scoring: { key: 'scoring', label: 'Scoring chances', order: 4 },
  receiving: { key: 'receiving', label: 'Receiving', order: 5 },
  rushing: { key: 'rushing', label: 'Rushing', order: 6 },
  passing: { key: 'passing', label: 'Passing', order: 7 },
  kicking: { key: 'kicking', label: 'Kicking', order: 8 },
  season: { key: 'season', label: 'Season', order: 9 },
}
// The same sections STAT_LABELS is written in.
const STAT_GROUP = {
  'TGT': 'receiving', 'TGT%': 'usage', 'REC': 'receiving', 'RECYD': 'receiving', 'AIRYD': 'receiving', 'WOPR': 'receiving', 'SEP': 'receiving', 'YACOE': 'receiving',
  'CAR': 'rushing', 'RUYD': 'rushing', 'RYOE': 'rushing',
  'RZ': 'scoring', 'GL': 'scoring', 'xTD': 'scoring', 'TD': 'scoring', 'TDoE': 'scoring', '20+': 'scoring',
  'PAYD': 'passing', 'PATD': 'passing', 'ATT': 'passing', 'CPOE': 'passing',
  'FGM': 'kicking', 'PAT': 'kicking',
}
const STAT_ORDER = Object.keys(STAT_LABELS)
const MARKET_NAME = Object.fromEntries(MARKETS.map(([k, name]) => [k, name]))

const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** The flattened fields for one week-file player: sc_<MARKET>, st_<STAT>, season_td, since_td. */
export function nflBoardRow(p) {
  const out = {}
  for (const [k, v] of Object.entries(p?.scores || {})) { const x = fin(v); if (x != null) out[`sc_${k}`] = Math.round(x) }
  for (const [k, v] of Object.entries(p?.stats || {})) { const x = fin(v); if (x != null) out[`st_${k}`] = x }
  const td = fin(p?.season_td); if (td != null) out.season_td = td
  const since = fin(p?.games_since_last_td); if (since != null) out.since_td = since
  // SHARE OF TEAM (lib/nfl/usageShares.js puts p.usage on the player from nfl_matchup.json)
  const u = p?.usage
  if (u) {
    if (fin(u.snap) != null) out.sh_snap = u.snap
    if (fin(u.snapRecent) != null) out.sh_snap3 = u.snapRecent
    if (fin(u.snapTrend) != null) out.sh_snap_d = u.snapTrend
    if (fin(u.snapGames) != null) out.sh_snap_n = u.snapGames
    if (fin(u.carShare) != null) out.sh_car = u.carShare
    if (fin(u.rzTgtShare) != null) out.sh_rztgt = u.rzTgtShare
    if (fin(u.rzCarShare) != null) out.sh_rzcar = u.rzCarShare
  }
  return out
}

// THE SHARE COLUMNS (2026-10-11). `cset: 'lean'` marks the ones the Short list keeps, 'read' What I read, none All (lib/columnViews.js); the rest are All.
const U = NFL_BOARD_GROUPS.usage
const SHARE_COLS = [
  { key: 'sh_snap', label: 'Snap %', cset: 'lean', w: 58, group: U, fmt: (v) => fmtShare(v),
    explain: 'His share of his offense’s snaps this season, from nfl_matchup.json (snaps). Offense only: defensive snap counts are not published, so a defender has no snap share. The games behind it are in Snap GP. A blank is a player with no snap row yet.' },
  { key: 'sh_snap3', label: 'Snap L3', cset: 'read', w: 58, group: U, fmt: (v) => fmtShare(v),
    explain: 'His share of his offense’s snaps over his last three games (the file’s recent_pct), beside the season share.' },
  { key: 'sh_snap_d', label: 'Snap Δ', cset: 'read', w: 60, signed: true, group: U, fmt: (v) => (v == null ? '—' : `${trendGlyph(v)} ${fmtPoints(v)}`),
    explain: 'Last three games’ snap share minus his season share, in points (the file’s trend). ▲ is a rise of a point or more, ▼ a fall of a point or more, ▬ inside a point.' },
  { key: 'sh_snap_n', label: 'Snap GP', w: 58, heat: false, group: U, dp: 0, explain: 'Games behind the snap share (the n of Snap %, Snap L3 and Snap Δ).' },
  { key: 'sh_car', label: 'Carry %', cset: 'read', w: 58, group: U, fmt: (v) => fmtShare(v), explain: 'His share of his club’s rushing attempts this season (usage.car_share in nfl_matchup.json). Shown only when the bot publishes it.' },
  { key: 'sh_rztgt', label: 'RZ tgt %', w: 64, group: U, fmt: (v) => fmtShare(v), explain: 'His share of his club’s red-zone targets this season (usage.rz_tgt_share). Shown only when the bot publishes it.' },
  { key: 'sh_rzcar', label: 'RZ car %', w: 64, group: U, fmt: (v) => fmtShare(v), explain: 'His share of his club’s red-zone carries this season (usage.rz_car_share). Shown only when the bot publishes it.' },
]
// a table that already shows the same number under its own key (the team page’s `snap`) has shown it
const SHARE_TWIN = { sh_snap: 'snap' }

/** The extra columns for these rows (each row already carries nflBoardRow's fields). */
export function nflBoardColumns(rows = []) {
  const has = new Set()
  for (const r of rows) for (const k of Object.keys(r || {})) if (r[k] != null) has.add(k)
  const cols = []
  for (const [k, name] of MARKETS) {
    if (!has.has(`sc_${k}`)) continue
    // ATD for the touchdown score (The Six's word); the rest by market key
    cols.push({ key: `sc_${k}`, label: k === 'TD' ? 'ATD' : k.replace('_', ' '), cset: 'read', w: 58, scale: 'seq', domain: [0, 100], group: NFL_BOARD_GROUPS.scores,
      explain: `${name}: his TUDDY score on this market, 0-100, ranked on this week's pool. Not a probability.` })
  }
  for (const k of STAT_ORDER) {
    if (!has.has(`st_${k}`)) continue
    // a per-game rate says /G in its header, so REC/G never reads as the REC score
    // or a season total in the same table
    cols.push({ key: `st_${k}`, label: / \/ game$/.test(statLabel(k)) ? `${k}/G` : k, w: 62, group: NFL_BOARD_GROUPS[STAT_GROUP[k]] || NFL_BOARD_GROUPS.scoring,
      explain: k === 'TGT%' ? 'His share of his club’s targets, from his week-file stats (a fraction of the club’s targets over the games in those stats). The weekly target-share leaders are on the team page, with the games behind each.' : statLabel(k),
      fmt: k === 'TGT%' ? (v) => fmtShare(Math.abs(Number(v)) <= 1 ? Number(v) * 100 : Number(v)) : (v) => statFmt(k, v) })
  }
  for (const c of SHARE_COLS) if (has.has(c.key)) cols.push(c)
  if (has.has('season_td')) cols.push({ key: 'season_td', label: 'Season TD', cset: 'read', w: 66, group: NFL_BOARD_GROUPS.season, explain: 'Touchdowns this season, entering this week.' })
  if (has.has('since_td')) cols.push({ key: 'since_td', label: 'Since TD', cset: 'read', w: 62, invert: true, group: NFL_BOARD_GROUPS.season, explain: 'Games since his last touchdown (0 = he scored in his last game).' })
  return cols
}

/** A table's own columns first, then every board column it doesn't already show.
 *  A table that shows a stat under its raw payload key (Bot's 'xTD', 'RZ') has
 *  shown it: its st_ twin is left out. */
export function withNflBoardColumns(own = [], rows = []) {
  const mine = new Set(own.map((c) => c.key))
  const labels = new Set(own.map((c) => String(c.label || '').toUpperCase()))
  return [...own, ...nflBoardColumns(rows)
    .filter((c) => !mine.has(c.key) && !(c.key.startsWith('st_') && mine.has(c.key.slice(3))) && !(SHARE_TWIN[c.key] && mine.has(SHARE_TWIN[c.key])))
    // a header the table already uses for its own number (Explosive's season
    // REC count, Bot's TGT%) is renamed, never repeated: two "REC" columns
    // holding different numbers is a misread waiting to happen
    .map((c) => (labels.has(String(c.label).toUpperCase())
      ? { ...c, label: c.key.startsWith('sc_') ? `${c.label} score` : c.key.startsWith('st_') && !/\/G$/.test(c.label) ? `${c.label}/G` : `${c.label}*` }
      : c))]
}
export { MARKET_NAME }

/** For a table whose rows keep the week-file player on `_raw`: the rows with
 *  the full set's fields, and its columns followed by the full set. `skip` =
 *  keys the table already says another way (its own market's score). */
export function withNflFullSet(rows = [], own = [], { skip = [] } = {}) {
  const full = rows.map((r) => (r?._raw ? { ...nflBoardRow(r._raw), ...r } : r))
  const drop = new Set(skip)
  return { rows: full, columns: withNflBoardColumns(own, full).filter((c) => !drop.has(c.key)) }
}
