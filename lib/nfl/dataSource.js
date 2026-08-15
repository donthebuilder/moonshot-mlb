// Where the NFL payload comes from.
//
// Same rule as the MLB side, and it is not negotiable: moonshot-mlb is
// READ-ONLY. It never writes, never runs a bot, and must never gain a
// .github/workflows directory. The NFL bot lives with the MLB one in
// MLB-HR-DASHBOARD-STREAMLIT and publishes to that repo's `data` branch.
//
// Two candidates, tried in order:
//
//   1. the data branch — what the bot publishes on a schedule, the live path
//   2. /data/nfl in this repo's public/ — a committed snapshot
//
// (2) exists so the NFL side is never a blank page: the first preseason build
// is committed here, so the tab works the moment it deploys, before the bot
// has a scheduled run. Once the workflow is live, (1) wins every time and the
// snapshot just sits there as a floor. The MLB side has no equivalent because
// its payloads run to hundreds of megabytes; a week of NFL is 69 KB.

const REPO = 'donthebuilder/MLB-HR-DASHBOARD-STREAMLIT'
const BRANCH = 'data'

// Note the `current/` + `nfl_` shape. publish_data.sh copies files out of
// public/data/current/ BY NAME into a single orphan commit on the data branch;
// it handles concurrent publishers and force-push races correctly and isn't
// worth reimplementing for a second sport. So the NFL bot writes into that
// same directory with an nfl_ prefix and its three filenames were added to
// that script's PUBLISH_FILES list.
export const NFL_DATA_BASE =
  process.env.NEXT_PUBLIC_NFL_DATA_BASE ||
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/public/data/current`

export const nflSlatePaths = () => [
  `${NFL_DATA_BASE}/nfl_week.json`,
  '/data/nfl/week.json',
]

export const nflReportPaths = () => [
  `${NFL_DATA_BASE}/nfl_report_card.json`,
  '/data/nfl/report_card.json',
]

// Defence-vs-position, coverage shells, explosive allowed, team usage.
export const nflMatchupPaths = () => [
  `${NFL_DATA_BASE}/nfl_matchup.json`,
  '/data/nfl/matchup.json',
]

// Per-game logs for the hit-rate chart. Separate because only the player modal
// reads them and they're the biggest single payload.
export const nflLogPaths = () => [
  `${NFL_DATA_BASE}/nfl_logs.json`,
  '/data/nfl/logs.json',
]

// The pick card — seven market ladders, five deep. Small (~8 KB) and read by
// the Picks tab on load.
export const nflPicksPaths = () => [
  `${NFL_DATA_BASE}/nfl_picks.json`,
  '/data/nfl/picks.json',
]

// Graded lines for the slate, keyed by player id for EVERY man who recorded
// one — not just the card — so an override on any player can be graded.
export const nflResultsPaths = () => [
  `${NFL_DATA_BASE}/nfl_results.json`,
  '/data/nfl/results.json',
]

export const nflMetaPaths = () => [
  `${NFL_DATA_BASE}/nfl_meta.json`,
  '/data/nfl/meta.json',
]

// A payload is only real if it has games AND players. A 200 carrying an empty
// shell must not beat the committed snapshot sitting behind it in the list —
// same validity test the MLB slate does in lib/data.js, for the same reason.
export function nflSlateLooksReal(j) {
  if (!j || typeof j !== 'object') return false
  return Array.isArray(j.players) && j.players.length > 0
}

// A card is only a card if some market has rungs on it. An empty shell
// publishing over a good committed snapshot is the same failure the matchup
// validator below exists to stop.
export function nflPicksLooksReal(j) {
  if (!j || typeof j !== 'object' || !j.card || typeof j.card !== 'object') return false
  return Object.values(j.card).some((m) => Array.isArray(m?.rungs) && m.rungs.length > 0)
}

// The matchup payload grows a section at a time, and the bot and the site
// deploy independently — the bot lives in another repo on its own schedule.
// So the failure that matters here isn't a broken file, it's a VALID file
// from a bot that predates the section a tab now renders: a matchup.json
// with dvp but no field publishes fine, wins over the committed snapshot on
// freshness, and the Matchup Map renders empty on a green build.
//
// Requiring both means an older bot simply loses to the snapshot until it
// catches up, which is the right way round.
export function nflMatchupLooksReal(j) {
  if (!j || typeof j !== 'object') return false
  const has = (o) => o && typeof o === 'object' && Object.keys(o).length > 0
  return has(j.dvp) && has(j.field?.def_pass) && has(j.field?.league_pass)
}

/**
 * Walk the candidates with a per-candidate TIMEOUT, and take the first that
 * both responds and validates.
 *
 * Why not just reuse fetchJSON from lib/data.js: it has no timeout. A primary
 * that hangs rather than fails — a proxy swallowing the connection, a CDN
 * black-holing the request — leaves the promise pending forever, and because
 * the tab gates its whole render on Promise.allSettled, the page sits on
 * "Loading slate…" indefinitely with a perfectly good committed snapshot
 * sitting one candidate down the list. Observed exactly that against
 * raw.githubusercontent behind a proxy.
 *
 * Six seconds is generous for a 69 KB file and short enough that a wedged
 * primary costs a beat rather than the page.
 */
export async function fetchNfl(paths, validate = null, timeoutMs = 6000) {
  let fallback = null
  for (const p of paths) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const url = `${p}${p.includes('?') ? '&' : '?'}t=${Date.now()}`
      const r = await fetch(url, { cache: 'no-store', signal: ctl.signal })
      if (!r.ok) continue
      const j = await r.json()
      if (!validate) return j
      if (validate(j)) return j
      if (fallback === null) fallback = j
    } catch {
      /* timed out, offline, or bad JSON — try the next one */
    } finally {
      clearTimeout(timer)
    }
  }
  return fallback
}
