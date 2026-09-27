// What the front door knows, reduced to the few dozen bytes it renders.
//
// SERVER SIDE ON PURPOSE. Tonight's slate is 4.8MB and the graded results file
// is 2.6MB; a home page that pulled either into a browser to print "15 games"
// would be the slowest page on the network. This runs on Vercel, caches for
// PULSE_TTL, and hands the page a small object. It is the only server-side
// reader of the data branch in the repo — everything else still fetches
// client-side, because everything else actually needs the rows.
//
// STILL READ-ONLY. moonshot-mlb writes nothing and runs no bot; this reads the
// same published payloads lib/dataSource.js points every other surface at.
//
// A MISSING PAYLOAD IS A NORMAL STATE. Preseason, a bot that hasn't run, a
// branch mid-publish — every field here is optional and the page renders the
// product card without the number rather than erroring. Nothing on the front
// door is allowed to be the reason the front door is down.

import { unstable_cache } from 'next/cache'

import { resultsPaths, backtestPaths } from '../dataSource'
import { nflSlatePaths, nflReportPaths } from '../nfl/dataSource'
import { nhlPulse } from '../nhl/pulse'
import { mlbSlateState } from '../mlbSlateState'
import { easternDate, easternToday } from '../data'
import { createClient } from '@supabase/supabase-js'
import { readMlbEvents } from '../record/mlb'
import { readNflEvents } from '../record/nfl'
import { readNhlRecords, nhlCaptureFrom } from '../record/nhl'
import { eventCapture } from '../record/shape'
import { mlbNextGames } from '../mlbNext'

const PULSE_TTL = 120

// THE FETCH-LEVEL REVALIDATE DOES NOT COVER THE BIG FILE (2026-09-24, PERF-2).
// `next: { revalidate }` goes through the Data Cache, which refuses entries
// over 2 MB -- results_live.json was 2.38 MB on 09-24, so that one was being
// re-pulled from GitHub on every front-door view while the three small files
// cached fine. The fix is the same one /start got: cache the REDUCED pulse
// object (a few hundred bytes) with unstable_cache for the same TTL, and let
// the per-fetch revalidate stay as a second layer for the files it can hold.

async function firstJSON(urls) {
  for (const url of urls) {
    if (!url || url.startsWith('/')) continue // committed fallbacks are client-side paths
    try {
      const res = await fetch(url, { next: { revalidate: PULSE_TTL } })
      if (!res.ok) continue
      return await res.json()
    } catch { /* try the next candidate */ }
  }
  return null
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

// ── HOMERS ON THE BOARD, AT LOCK (2026-09-27, front door Part A1) ────────
// The door printed "100% were on the board before first pitch" from
// results.hr_capture_report, which is built off the REBUILT slate and counts
// unlocked games (audit MODEL-2 / B6: 11% of homers came from men missing
// from the pregame pool while it read 91-100%). This is the locked number
// instead: homer_feed rows for the slate day, each labelled at the moment it
// was seen (lib/callStatus.js via lib/record/mlb.js) -- the same reader and
// the same words /called uses. Null when it can't be read; the door then
// shows the count with no share.
async function mlbLocked(day) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !day) return null
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { events, error } = await readMlbEvents(db, { since: day, until: day })
  if (error) { console.error(`[pulse] homer_feed ${day}: ${error.message || error}`); return null }
  const c = eventCapture(events)
  return { total: c.total, onBoard: c.onBoard }
}

// ── THE RECORD FOR TUDDY AND LAMP (front door D, 2026-09-27) ──────────────
// The same readers and rules /start and /called use, each answering ITS
// question:
//   TUDDY  board coverage -- of the touchdown scorers, how many were on the
//          board (td_board) / CALLED (on_bot); only days whose pregame board
//          rank was recorded, and only once there are three of them
//          (app/start/page.js NFL_MIN_RECORD_DAYS)
//   LAMP   of the goal scorers, how many were CALLED / on the board; regular
//          season only (lib/record/nhl.js, includePre false)
// Null = nothing graded yet; the door says so instead of printing a number.
const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
async function productRecords(today) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { nfl: null, nhl: null }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const [nflR, nhlR] = await Promise.all([
    readNflEvents(db, { since: shiftDay(today, -27), until: today }).catch(() => ({ events: [] })),
    readNhlRecords(db, { since: shiftDay(today, -13), until: today, includePre: false, graded: true, hitOnly: true }).catch(() => ({ rows: [] })),
  ])
  let nfl = null
  const recorded = new Set((nflR.events || []).filter((e) => e.payload?.td_board).map((e) => e.game_date))
  if (recorded.size >= 3) {
    const c = eventCapture((nflR.events || []).filter((e) => recorded.has(e.game_date)))
    if (c.total) nfl = { onBoard: c.called + c.rated, called: c.called, total: c.total, days: recorded.size }
  }
  let nhl = null
  if ((nhlR.rows || []).length) {
    const c = nhlCaptureFrom(nhlR.rows)
    if (c.total) nhl = { called: c.called, onBoard: c.onBoard, total: c.total, days: new Set(nhlR.rows.map((r) => r.game_date)).size }
  }
  return { nfl, nhl }
}

function mlbPulse(results, feed = null, locked = null) {
  if (!results) return null

  const graded = Array.isArray(results?.graded_slots) ? results.graded_slots : []
  const statuses = results?.game_status_by_pk && typeof results.game_status_by_pk === 'object'
    ? Object.values(results.game_status_by_pk)
    : []

  // COUNTED FROM pick_type — the same field the Results page grades on, so
  // this can't disagree with the receipts.
  //
  // NOT CALLED "THE FOUR" HERE, deliberately. The payload publishes FIFTEEN
  // rows per category (HR, HIT, HRR, CONTACT), all with rank: null — the
  // headline-pick-per-category that the 08-28 plan named The Four is a naming
  // decision (task A2) that has not reached the data yet. Until a row can say
  // "I am the HR call," this counts what actually exists: called slots. A
  // front door that printed "The Four: 60" would be the exact double-rating
  // confusion the naming decision exists to end.
  const calls = graded.filter((row) => ['HR', 'HIT', 'HRR', 'CONTACT'].includes(row?.pick_type))
  const started = calls.filter((row) => num(row?.actual_ab) > 0)
  const cleared = started.filter((row) => {
    switch (row.pick_type) {
      case 'HR': return Boolean(row.got_hr)
      case 'HIT': return Boolean(row.got_base_hit)
      case 'HRR': return num(row.hrr_total) >= 2
      case 'CONTACT': return num(row.actual_tb) >= 2
      default: return false
    }
  })

  // Live/final from the league's feed when it answers (lib/mlbSlateState.js):
  // the payload's states freeze at its last build, which is how the door
  // read "10 live" at 2:30 AM for a slate that had ended hours before.
  const live = feed ? feed.live : statuses.filter((s) => String(s?.abstract_state || '').toLowerCase() === 'live').length
  const final = feed ? feed.final : statuses.filter((s) => String(s?.abstract_state || '').toLowerCase() === 'final').length

  return {
    date: results?.date || null,
    label: results?.label || null,
    games: statuses.length || null,
    live,
    final,
    // Cleared out of STARTED, never out of called: a scratched name is a void,
    // which is the rule every other surface on this site already follows.
    calls: calls.length || null,
    started: started.length || null,
    cleared: cleared.length || null,
    homers: num(results?.hr_capture_report?.total_hrs_on_slate),
    // { total, onBoard } from homer_feed at lock, or null (see mlbLocked).
    locked,
  }
}

function nflPulse(week, report) {
  if (!week && !report) return null

  const games = Array.isArray(week?.games) ? week.games : []
  const players = Array.isArray(week?.players) ? week.players : []
  const markets = Array.isArray(week?.markets) ? week.markets : []

  // THE SIX, as the plan defines them: one headline call per market. Read off
  // the published scores rather than re-ranked here — the board's order is the
  // bot's, and a front door that computed its own would be a second opinion
  // nobody asked for.
  // THE SIX, BY NAME, not by taking the first six of seven. The decided set
  // (dash-network-master-plan-2026-08-28, §7) is ATD, Rec Yds, Rush Yds,
  // Receptions, Passing Yards, Kicker Points — RUSH_ATT is a scored market and
  // is deliberately not one of the six calls, so slicing would have quietly
  // promoted it and dropped kicker points off the end.
  const SIX = ['TD', 'REC_YDS', 'RUSH_YDS', 'REC', 'PASS_YDS', 'KICK_PTS']
  const six = SIX.map((wanted) => markets.find((m) => m?.key === wanted)).filter(Boolean).map((market) => {
    const key = market?.key
    let best = null
    for (const player of players) {
      const score = num(player?.scores?.[key])
      if (score === null) continue
      if (!best || score > best.score) best = { score, name: player.name, team: player.team, position: player.position }
    }
    return best ? { key, label: market.label || key, ...best } : null
  }).filter(Boolean)

  return {
    label: week?.label || null,
    mode: week?.mode || null,
    season: num(week?.season),
    week: num(week?.week),
    games: games.length || null,
    kickoff: games.map((g) => g?.kickoff).filter(Boolean).sort()[0] || null,
    // Every kickoff this week, so the front door can tell whether football is
    // on TODAY (liveProduct below) -- sixteen short strings.
    kickoffs: games.map((g) => g?.kickoff).filter(Boolean).sort(),
    players: players.length || null,
    six,
    tunedOn: report?.tuned_on ? String(report.tuned_on) : null,
  }
}

// ── THE RECORD, WHICH THE FRONT DOOR NEVER SHOWED (2026-08-31) ─────────────
//
// The page's headline is "Every call, graded in public." Underneath it, a
// stranger got tonight's COUNTS — 14 games, 56 called slots, 31 homers — and
// not one number about whether any of it has ever been right. The single most
// persuasive thing this site can show is the one thing it was withholding, and
// it has been sitting in backtest_summary.json the whole time.
//
// EACH PICK TYPE ON ITS OWN BAR, which is the only honest way to read it. An
// HR pick is graded on homers, a HIT pick on getting a hit, an HRR pick on
// 2+ H+R+RBI, a CONTACT pick on 2+ total bases. Comparing 69% to 16% across
// those rows is meaningless — they are four different questions — so the UI
// prints the bar next to every rate and never ranks them against each other.
//
// POOLED, not averaged. `avg_metrics` is the mean of nightly percentages,
// which weights a 6-pick night the same as a 30-pick one; `pooled_metrics`
// divides the real totals. `metric_counts` carries [ok, n] so the front door
// can print the denominator and put an interval on it rather than asking
// anyone to trust a bare percentage.
const BAR_FOR = {
  HR_PICKS: { metric: 'HR', label: 'HR calls', bar: '1+ HR' },
  HIT_PICKS: { metric: '1+ Hit', label: 'Hit calls', bar: '1+ hit' },
  HRR_PICKS: { metric: '2+ HRR', label: 'H+R+RBI calls', bar: '2+ H+R+RBI' },
  CONTACT_PICKS: { metric: '2+ TB', label: 'Contact calls', bar: '2+ bases' },
}

function recordFrom(backtest) {
  const summary = backtest?.summary
  if (!summary || typeof summary !== 'object') return null
  const rows = []
  let nights = 0
  Object.entries(BAR_FOR).forEach(([key, meta]) => {
    const block = summary[key]
    const pair = block?.metric_counts?.[meta.metric]
    if (!Array.isArray(pair) || pair.length < 2) return
    const ok = num(pair[0]); const n = num(pair[1])
    if (ok == null || !n) return
    nights = Math.max(nights, num(block.days_seen) || 0)
    rows.push({ key, label: meta.label, bar: meta.bar, ok, n, pct: (100 * ok) / n })
  })
  return rows.length ? { rows, nights } : null
}

/** Everything the front door renders about the three bot products. */
async function buildNetworkPulse() {
  // today_slim.json is deliberately NOT fetched here. It is 4.8MB and the only
  // thing the front door would take from it is a date that results_live.json
  // already carries — pulling it would be the most expensive byte on the site
  // bought for nothing.
  const [results, week, report, backtest, nhl] = await Promise.all([
    firstJSON(resultsPaths()),
    firstJSON(nflSlatePaths()),
    firstJSON(nflReportPaths()),
    firstJSON(backtestPaths()),
    // Hockey reads the league feed live (server routes, no data branch) — one
    // call for the counts, one select for the locked calls. Null when the feed
    // is down, and the door renders LAMP's card without the number.
    nhlPulse().catch((e) => { console.error(`[pulse] nhl: ${e?.message}`); return null }),
  ])

  // The next MLB game day (lib/mlbNext.js): on a day with none (Mon 09-28,
  // before the Wild Card) the door says when baseball is back instead of
  // presenting yesterday's slate as tonight's. Null when it can't be read.
  const today = easternToday()
  const mlbBase = mlbPulse(results, results?.date ? await mlbSlateState(results.date) : null,
    results?.date ? await mlbLocked(results.date).catch((e) => { console.error(`[pulse] locked: ${e?.message}`); return null }) : null)
  const next = mlbBase ? await mlbNextGames(today).catch(() => null) : null
  const records = await productRecords(today).catch(() => ({ nfl: null, nhl: null }))
  return {
    builtAt: new Date().toISOString(),
    mlb: mlbBase ? { ...mlbBase, today, next } : null,
    nfl: nflPulse(week, report),
    nhl,
    // Null when the file is missing — the front door renders without the block
    // rather than with a placeholder, same rule as every other figure here.
    record: recordFrom(backtest),
    // TUDDY / LAMP records (front door D): null until something is graded.
    nflRecord: records.nfl, nhlRecord: records.nhl,
  }
}

export const getNetworkPulse = unstable_cache(buildNetworkPulse, ['network-pulse-v5'], { revalidate: PULSE_TTL })

// Which product is on today: lib/dash/liveProduct.js (pure, testable).
export { liveProduct } from './liveProduct'
