// Single source of truth for where slate data comes from.
//
// moonshot-mlb is READ-ONLY: it never writes, never runs a bot, and must
// never gain a .github/workflows directory. Every byte it renders is
// published by MLB-HR-DASHBOARD-STREAMLIT to its `data` branch.
//
// Paths changed when the bot moved to that branch: everything now sits under
// current/, and the slate payloads are the _slim variants (the full ones are
// several hundred MB and were never meant to be fetched by a browser).

const REPO = 'donthebuilder/MLB-HR-DASHBOARD-STREAMLIT'
const BRANCH = 'data'

export const DATA_BASE =
  process.env.NEXT_PUBLIC_DATA_BASE ||
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/public/data`

export const dataUrl = (p) => `${DATA_BASE}/${String(p).replace(/^\/+/, '')}`

// Ordered candidates: fetchJSON walks them and takes the first that responds.
// The bare name is kept as a fallback so a future rename doesn't blank the site.
export const slatePaths = (mode) => [
  dataUrl(`current/${mode}_slim.json`),
  dataUrl(`current/${mode}.json`),
]

export const resultsPaths = () => [
  dataUrl('current/results_live.json'),
  dataUrl('current/results_final.json'),
]

export const pairBuilderPaths = () => [dataUrl('current/pair_builder_latest.json')]
export const pairSummaryPaths = () => [dataUrl('current/pair_history_summary.json')]
export const backtestPaths = () => [dataUrl('current/backtest_summary.json')]

// Per-player spray + pitch-type detail. Split out of the main payload so the
// slate stays small; fetched one player at a time, on demand.
// SprayChart and HotZoneMap are deep in the tree and never receive the
// today/tomorrow toggle, so the slate is held here and set once by Dashboard.
// Without it, opening a tomorrow hitter silently fetched his today file.
let _slateMode = 'today'
export const setSlateMode = (m) => { _slateMode = m === 'tomorrow' ? 'tomorrow' : 'today' }

export const detailUrl = (pid, mode = _slateMode) =>
  dataUrl(`current/detail/${mode}/batter_${pid}.json`)

// Starters get their own detail file under a different prefix: pitch mix by
// hand, plus lineup damage broken out by spot and by zone (top/middle/bottom
// of the order). Verified: 30 files, one per starter on the slate.
export const pitcherDetailUrl = (pid, mode = _slateMode) =>
  dataUrl(`current/detail/${mode}/pitcher_${pid}.json`)

// Situational splits: day/night, home/away, day-of-week, win/loss. One small
// file per hitter, 297 on the live slate. player_splits.py has been publishing
// these since the migration and nothing on this site read them until the
// Splits tab was added.
export const splitsUrl = (pid, mode = _slateMode) =>
  dataUrl(`current/splits/${mode}/${pid}.json`)

export const logUrl = (mode) => dataUrl(`current/${mode}.txt`)
