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

// Cache-buster.
//
// raw.githubusercontent.com serves with a five-minute max-age, and the browser
// caches on top of that. fetchJSON() in lib/data.js has always appended a
// timestamp for the slate payloads, so the Games board picks up a bot run as
// soon as it lands. The per-player detail files did NOT: SprayField,
// HRPitchProfile, HotZoneMap, PlayerModal, MatchupPitcher and PlayerSplits all
// called plain fetch() on a stable URL. The Today bot republishes detail/ every
// hour, so anyone who had already opened a hitter kept getting the copy from
// whenever they first opened him — spray chart, EV log and splits quietly
// frozen while the board around them updated. Appending it here fixes all six
// at once, since every one of them goes through these builders.
//
// Safe against re-render loops: the effects that fetch these key off the player
// id, not the URL string.
const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`

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
export const evalReportPaths = () => [dataUrl('current/eval_report.json')]
// The book's line, published by bots/odds_fetch.py. Absent whenever no
// ODDS_API_KEY is configured — every surface that reads it degrades to the
// score alone, so a missing file is a normal state, not an error.
export const oddsPaths = () => [dataUrl('current/odds_latest.json')]

// Every pre-game price ever fetched, settled against the box score that night
// — bots/odds_history.py. Season-scale and unchanged intraday, so the True
// Price tab fetches it itself on open rather than riding the slate poll.
export const oddsHistoryPaths = () => [dataUrl('current/odds_history.json')]

// Why there are (or aren't) odds — bots/odds_fetch.py writes this on EVERY
// path, including the ones that fetch nothing. odds_latest.json simply being
// absent is indistinguishable from a key that isn't set, a spent quota and a
// lock skip; this file is the difference, and it exists so the answer to "are
// the odds even on there" doesn't require opening an Actions log.
export const oddsStatusPaths = () => [dataUrl('current/odds_status.json')]

// A single graded day. live_results_tracker writes one of these per night and
// publish_data.sh keeps the last 150, so there is a real archive sitting on the
// branch that nothing on this site read until the Results date picker existed.
// Shape is identical to results_live.json — same graded_slots, same
// hr_capture_report — so it drops straight into the Results tab.
export const gradedResultsUrl = (date) =>
  bust(dataUrl(`current/graded_results_${date}.json`))

// Per-player spray + pitch-type detail. Split out of the main payload so the
// slate stays small; fetched one player at a time, on demand.
// SprayChart and HotZoneMap are deep in the tree and never receive the
// today/tomorrow toggle, so the slate is held here and set once by Dashboard.
// Without it, opening a tomorrow hitter silently fetched his today file.
let _slateMode = 'today'
export const setSlateMode = (m) => { _slateMode = m === 'tomorrow' ? 'tomorrow' : 'today' }

export const detailUrl = (pid, mode = _slateMode) =>
  bust(dataUrl(`current/detail/${mode}/batter_${pid}.json`))

// Off-slate detail archive (2026-08-28, Donovan: "i need to be able to see
// the spray chart even if they player isnt on. the bot."). QuickSearch.js
// already resolves ANY active player by name off MLB's live people-search
// endpoint, but until now there was nowhere for PlayerModal/SprayField to
// look for a batted-ball history on someone not on tonight's slate — a
// slate detail file only ever exists for the ~270 hitters make_slim.py
// wrote one for. bots/spray_archive.py runs the same statcast_batter()
// pull mlb_dashboard.py already does for slate hitters, against every
// active-roster hitter league-wide instead, and publishes here — no
// today/tomorrow mode, because an off-slate player isn't playing either
// night. Coverage fills in gradually (budget-capped per run, see that
// script's own docstring) rather than covering the whole league on day
// one — a player not archived yet 404s here exactly like a slate player
// with no detail file does, which the modal already renders honestly.
export const archiveDetailUrl = (pid) =>
  bust(dataUrl(`current/detail/archive/batter_${pid}.json`))

// Starters get their own detail file under a different prefix: pitch mix by
// hand, plus lineup damage broken out by spot and by zone (top/middle/bottom
// of the order). Verified: 30 files, one per starter on the slate.
export const pitcherDetailUrl = (pid, mode = _slateMode) =>
  bust(dataUrl(`current/detail/${mode}/pitcher_${pid}.json`))

// Situational splits: day/night, home/away, day-of-week, win/loss. One small
// file per hitter, 297 on the live slate. player_splits.py has been publishing
// these since the migration and nothing on this site read them until the
// Splits tab was added.
export const splitsUrl = (pid, mode = _slateMode) =>
  bust(dataUrl(`current/splits/${mode}/${pid}.json`))

// Zone profiles, published separately from the batter detail file ON PURPOSE.
//
// The obvious fix for empty Hot Zones was to have spray_cache.py merge
// zone_profile into current/detail/<slate>/batter_<id>.json. That would have
// destroyed the spray charts. The Spray Cache workflow runs on a fresh CI
// checkout where public/data is gitignored and therefore empty, so the batter
// files it wrote would contain a zone_profile and nothing else — and
// publish_data.sh copies whole directories, so publishing them would replace
// the real detail files with those stubs. Every spray chart, pitch profile and
// EV log on the site would have gone blank the first time the zone bot ran.
//
// A separate current/zones/<slate>/batter_<id>.json has no such failure mode:
// only spray_cache writes it, nothing else reads from that path, and the two
// workflows can never overwrite each other's output.
export const zonesUrl = (pid, mode = _slateMode) =>
  bust(dataUrl(`current/zones/${mode}/batter_${pid}.json`))

export const logUrl = (mode) => dataUrl(`current/${mode}.txt`)
