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
//
// ── WHY THIS IS A 30-SECOND BUCKET AND NOT Date.now() (2026-09-07) ────────
// Donovan: "a lot of hitters are showing like this [no data] ... im tired of
// seeing players whose stats don't load, maybe we need a better cache."
//
// Date.now() makes every request a URL nothing has ever seen. That is the
// point when you want the newest bytes — and it is also, exactly, a cache
// bypass. Four separate components fetch the SAME batter detail file when a
// card opens (PlayerModal, SprayField, HRPitchProfile, HotZoneMap), each with
// its own millisecond, so one tap on a hitter pulled four uncached copies of a
// ~155 KB file from raw.githubusercontent.com. Every re-open pulled four more.
// raw.githubusercontent rate-limits, and a throttled response is not `ok`, so
// the modal took it for a file that was never published and said so — the
// "No detail file published for this hitter" everyone kept seeing on hitters
// whose file is right there on the branch, complete, with 120 batted balls in
// it. Coverage was never the problem. Verified 2026-09-07: all 196 hitters on
// the slate have a detail file, none empty, none stale.
//
// Flooring to a 30-second bucket keeps the reason the buster exists (the bot
// republishes detail/ hourly; a stale card can be at most 30s behind) and lets
// the browser and the CDN do their job in between. It also gives the shared
// cache below a stable key, which is what actually collapses the four calls
// into one.
const BUST_BUCKET_MS = 30000
const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / BUST_BUCKET_MS) * BUST_BUCKET_MS}`

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
// 🏆 Playoff + World Series odds (2026-09-03). Rebuilt by bots/playoff_odds.py
// on every Today run; ~10 KB, so it is cheap enough to sit behind a fold on
// Home rather than earning a tab of its own.
export const playoffOddsPaths = () => [dataUrl('current/playoff_odds.json')]
// 🔄 Comeback wins and blown leads (2026-09-03). Rebuilt on every Today run
// from line scores; ~40 KB, folded on Home for the same reason as above.
export const comebackPaths = () => [dataUrl('current/comeback_board.json')]
// 💰 Moneyline disagreement log + its running grade (2026-09-03).
export const moneylinePaths = () => [dataUrl('current/moneyline_board.json')]
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

// ── ONE FETCH PER FILE, AND A 404 IS NOT A 429 ───────────────────────────
// (2026-09-07, same report as the bucket note above.)
//
// Two separate faults were being reported as one symptom — "his stats don't
// load" — and both are fixed here rather than in the six components that
// each hand-rolled the same three lines of fetch.
//
// 1. THE SAME FILE, FOUR TIMES. PlayerModal, SprayField, HRPitchProfile and
//    HotZoneMap all fetch current/detail/<slate>/batter_<id>.json on open,
//    independently, because each one grew its own loader. `fetchShared`
//    hands all four the SAME in-flight promise, so a card open is one
//    request instead of four. Pitcher files (three callers) get the same
//    treatment for free.
//
// 2. A FAILED REQUEST WAS RENDERED AS AN ABSENT FILE. Every caller did
//    `r.ok ? r.json() : null`, which flattens 404 (this hitter genuinely has
//    no file — an honest, expected state the modal has copy for) into the
//    same null as 429 and 503 (GitHub is throttling us; the file exists and
//    is fine). The result told the user something false about his own data.
//    `fetchShared` returns the status, so callers can tell the two apart,
//    and it retries a 429/5xx twice with backoff before giving up, which is
//    usually all a throttle needs.
//
// Deliberately NOT persisted to localStorage: these files are hundreds of KB
// and republished hourly, and a stale copy surviving a reload is the class of
// bug the game_pk guard in PlayerModal exists to catch. Memory-only, cleared
// by a refresh, is the right lifetime.
const _shared = new Map()
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch JSON once per URL per TTL, shared across every caller.
 *
 * Resolves to { status, data, ok } and never rejects:
 *   { ok: true,  status: 200, data }        got it
 *   { ok: false, status: 404, data: null }  really isn't published
 *   { ok: false, status: 429|0|…, data: null } couldn't ask right now
 *
 * status 0 means the request never got an answer (offline, DNS, aborted).
 */
export function fetchShared(url, { ttl = 30000, retries = 2 } = {}) {
  const now = Date.now()
  const hit = _shared.get(url)
  // A failure is cached only briefly, so a throttle that clears doesn't leave
  // the card wrong until reload; a success rides the full TTL.
  if (hit && now - hit.at < (hit.ok === false ? 4000 : ttl)) return hit.p

  const p = (async () => {
    let last = { ok: false, status: 0, data: null }
    for (let i = 0; i <= retries; i += 1) {
      try {
        const r = await fetch(url)
        if (r.ok) {
          const data = await r.json()
          return { ok: true, status: r.status, data }
        }
        last = { ok: false, status: r.status, data: null }
        if (!RETRY_STATUS.has(r.status)) return last
      } catch {
        last = { ok: false, status: 0, data: null }
      }
      if (i < retries) await sleep(400 * (i + 1) * (i + 1))
    }
    return last
  })()

  const entry = { at: now, p, ok: true }
  _shared.set(url, entry)
  // Downgrade the entry's own TTL as soon as we know it failed, so the short
  // failure window above applies to it.
  p.then((res) => { entry.ok = res.ok }).catch(() => { entry.ok = false })
  return p
}

/**
 * The four callers that all want the same batter file.
 *
 * ── AND A REAL 404 FALLS BACK TO THE ARCHIVE (2026-09-07) ────────────────
 * Donovan: "i think i want the bot to score everyone so we can have the data
 * ... i'm tired of seeing players whose stats don't load."
 *
 * The data is already there. Measured 2026-09-07: the off-slate archive
 * bots/spray_archive.py publishes covers 119 of a random 120 active hitters
 * league-wide, none of them empty. But until now only `api_only` players ever
 * looked at it — an ON-slate hitter whose slate detail file was genuinely
 * absent got the empty state, with his complete batted-ball history sitting
 * one directory across, unasked for.
 *
 * So: slate file first, always (it is this game's file, and it carries the
 * pitch-mix panels the archive does not). If it truly 404s, ask the archive
 * before giving up. A throttle does NOT trigger this — fetchShared has
 * already retried, and the answer to "GitHub is busy" is not a second request
 * to GitHub.
 *
 * The archive is a partial answer, on purpose: it carries spray_chart /
 * batted_ball_log / contact_log and no pitch_type_summary, so the spray chart
 * and EV Log fill in and the pitch tabs stay honestly empty. It also carries
 * no game_pk, which is what lets it through PlayerModal's stale-file guard —
 * it is slate-independent by design and has no game to disagree about.
 */
export async function fetchBatterDetail(pid, { archive = false, mode = _slateMode } = {}) {
  if (archive) return fetchShared(archiveDetailUrl(pid))
  const first = await fetchShared(detailUrl(pid, mode))
  if (first.ok || first.status !== 404) return first
  const fallback = await fetchShared(archiveDetailUrl(pid))
  // Marked so a panel can say which pipe it drew from, the way SprayField
  // already labels its live-Statcast fallback.
  if (fallback.ok && fallback.data) return { ...fallback, fromArchive: true }
  // Nothing anywhere: report the ORIGINAL 404, so the copy stays "nothing
  // published for this hitter" rather than whatever the archive answered.
  return first
}

/** Same, for the three that want a starter's file. */
export const fetchPitcherDetail = (pid, mode = _slateMode) =>
  fetchShared(pitcherDetailUrl(pid, mode))
