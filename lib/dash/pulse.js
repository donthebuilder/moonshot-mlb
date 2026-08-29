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

import { resultsPaths } from '../dataSource'
import { nflSlatePaths, nflReportPaths } from '../nfl/dataSource'

const PULSE_TTL = 120

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

function mlbPulse(results) {
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

  const live = statuses.filter((s) => String(s?.abstract_state || '').toLowerCase() === 'live').length
  const final = statuses.filter((s) => String(s?.abstract_state || '').toLowerCase() === 'final').length

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
    capturePct: num(results?.hr_capture_report?.hr_capture_pct),
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
    players: players.length || null,
    six,
    tunedOn: report?.tuned_on ? String(report.tuned_on) : null,
  }
}

/** Everything the front door renders about the two bot products. */
export async function getNetworkPulse() {
  // today_slim.json is deliberately NOT fetched here. It is 4.8MB and the only
  // thing the front door would take from it is a date that results_live.json
  // already carries — pulling it would be the most expensive byte on the site
  // bought for nothing.
  const [results, week, report] = await Promise.all([
    firstJSON(resultsPaths()),
    firstJSON(nflSlatePaths()),
    firstJSON(nflReportPaths()),
  ])

  return {
    builtAt: new Date().toISOString(),
    mlb: mlbPulse(results),
    nfl: nflPulse(week, report),
  }
}
