'use client'

// ═══ THE TUDDY LEDGER — NFL'S SIDE OF THE SHARED Ledger COMPONENT ═══════════
//
// Path to Victory B10a (Track B10, "fully clone MLB to NFL"): every week's
// CALLED touchdowns, running totals, per-player history, browsable by week,
// through the exact same components/ledger/Ledger.js MOONSHOT's Called
// Ledger (lib/calledLedger.js) uses — same component, TD's noun and rate
// instead of HR's, week instead of night. See that file's own header for the
// shared contract; this one only says where NFL's numbers come from.
//
// THE DATA SOURCE (2026-10-02). Every touchdown comes from nfl_td_feed
// through /api/nfl/tds, labelled by lib/callStatus.js tdCallStatus -- the same
// three states /called and the record page show (CALLED: the bot's TD pick;
// ON THE BOARD: the top third of that week's TD board, rank stored at the
// touchdown; NOT ON THE BOARD: everyone else), QB touchdowns out as on
// /called. The week's graded file (nfl_results_<season>_wNN.json, via
// resultsArchive's fetchWeek) only adds the card's rank and grade. The old
// rule (ON BOARD = anyone the results tracked) is gone: it called 6 of week
// 4's 6 touchdowns ON THE BOARD when tdCallStatus said 1 CALLED, 5 off.

import { fetchWeek, weekKey } from './nfl/resultsArchive'

// weekKey -> payload | null (a confirmed miss). Session-only, same reasoning
// as lib/calledLedger.js's cache: always re-derived from the branch on a
// fresh load, never trusted from a browser weeks later.
const cache = new Map()
/** One graded week, straight off the branch (cached only for this page load). */
export async function getTuddyWeek(season, week) {
  const key = weekKey(season, 'week', week)
  if (cache.has(key)) return cache.get(key)
  const entry = await fetchWeek(season, key)
  cache.set(key, entry)
  return entry
}

export function clearTuddyLedgerCache() { cache.clear() }

/** Called / on board / not on board counts for one week. */
function totalsOf(rows) {
  return {
    total: rows.length,
    called: rows.filter((r) => r.status === 'called').length,
    board: rows.filter((r) => r.status === 'board').length,
    off: rows.filter((r) => r.status === 'off').length,
  }
}

/** One week, in the shape components/ledger/Ledger.js reads. Returns null on
 *  a confirmed miss (week not graded/published yet). */
export async function getTuddyWeekLedger(season, week) {
  // THE THREE STATES FROM ONE PLACE (2026-10-02). This used to compute its
  // own: CALLED = a TD rung that hit, ON BOARD = anyone the week's results
  // tracked -- so week 4 read 6 of 6 ON THE BOARD while /called and the
  // record page (tdCallStatus: the top third of the TD board, stored on the
  // row at the touchdown) said 1 CALLED, 5 NOT ON THE BOARD. Now every
  // scorer comes from nfl_td_feed through tdCallStatus (/api/nfl/tds), QB
  // touchdowns out, the same as /called. The graded week (if published)
  // only adds the card's rank and grade to the detail line.
  const [api, payload] = await Promise.all([
    fetch(`/api/nfl/tds?season=${encodeURIComponent(season)}&week=${encodeURIComponent(week)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getTuddyWeek(season, week).catch(() => null),
  ])
  const scorers = api?.available ? api.scorers || [] : []
  if (!scorers.length) return null
  const rungs = new Map((payload?.card?.TD?.rungs || []).map((r) => [String(r.player_id), r]))
  const rows = scorers.map((x) => {
    const pid = String(x.player_id || x.name)
    const rung = rungs.get(pid)
    return {
      id: `${season}w${week}-${pid}`,
      name: x.name,
      team: x.team || null,
      value: x.tds,
      status: x.status,
      statusLabel: x.status === 'called' ? (rung ? `#${rung.rank} on the card` : 'called') : x.status === 'board' ? 'on the board' : 'not on the board',
      score: rung?.score,
      detail: [x.opp ? `vs ${x.opp}` : null, x.position || null, rung?.grade || null].filter(Boolean).join(' · '),
      _raw: { player_id: x.player_id, player_name: x.name, name: x.name, team: x.team },
    }
  })
  rows.sort((a, b) => b.value - a.value || (b.score || 0) - (a.score || 0))
  return { season, week, rows, totals: totalsOf(rows), offAvailable: true, live: Boolean(api.live) }
}

/**
 * Every graded week 1..throughWeek for `season`, sequential (same courtesy
 * ledgerArchive.js's harvestRange pays raw.githubusercontent.com — a real
 * NFL season is at most ~18 requests, not 150).
 */
export async function loadTuddySeason(season, throughWeek, { onProgress } = {}) {
  const weeks = []
  let offWeeksCovered = 0
  for (let w = 1; w <= throughWeek; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    const wk = await getTuddyWeekLedger(season, w)
    if (wk) {
      weeks.push(wk)
      if (wk.offAvailable) offWeeksCovered += 1
    }
    onProgress?.({ i: w, of: throughWeek, week: w, ok: Boolean(wk) })
  }
  if (!weeks.length) return null

  const allRows = []
  let called = 0, board = 0, off = 0
  const byPlayer = new Map()
  for (const wk of weeks) {
    for (const r of wk.rows) {
      allRows.push({ ...r, week: wk.week })
      if (r.status === 'called') called += 1
      else if (r.status === 'board') board += 1
      else off += 1
      const key = r._raw.player_id
      const cur = byPlayer.get(key) || { id: key, name: r.name, team: r.team, td: 0, calledWeeks: 0, boardWeeks: 0, weeks: 0, lastWeek: 0, avgScoreSum: 0, avgScoreN: 0 }
      cur.td += r.value
      cur.weeks += 1
      if (r.status === 'called') cur.calledWeeks += 1
      else if (r.status === 'board') cur.boardWeeks += 1
      if (Number.isFinite(r.score)) { cur.avgScoreSum += r.score; cur.avgScoreN += 1 }
      cur.lastWeek = Math.max(cur.lastWeek, wk.week)
      cur.name = r.name; cur.team = r.team || cur.team
      byPlayer.set(key, cur)
    }
  }

  return {
    seasonYear: season,
    from: weekKey(season, 'week', weeks[0].week),
    to: weekKey(season, 'week', weeks[weeks.length - 1].week),
    weeksCount: weeks.length,
    totalEvents: allRows.length,
    called, board, off,
    offWeeksCovered,
    requestedWeeks: throughWeek,
    perWeek: weeks.length ? Math.round((10 * allRows.length) / weeks.length) / 10 : null,
    hitters: [...byPlayer.values()],
    weeks,
  }
}

// ── THE BASE RATE ───────────────────────────────────────────────────────
// The measured weekly TD-scorer rate among the model's own eligible pool —
// NOT a guess. 2024+2025, 9,746 player-weeks, 1,952 TD scorers, ~270
// eligible/week: base rate 20.6% (2024) / 19.5% (2025), both seasons
// agreeing within half a point (claude/tuddy-td-model-the-number-2026-09-13.md,
// script ~/td_measure.py). Reported as a range rather than one invented
// blended figure.
export function tdBaseRate() {
  return {
    value: '~20%',
    unit: 'of eligible RB/WR/TE score a TD in a given week',
    label: 'Measured base rate',
    note: '20.6% (2024) / 19.5% (2025), 9,746 player-weeks measured — see tuddy-td-model-the-number-2026-09-13.md',
  }
}

/** One week's rows, already in the shared Ledger row shape. */
export function weekRows(week) { return week?.rows || [] }
export function weekTotals(week) { return week?.totals || { total: 0, called: 0, board: 0, off: 0 } }

/** The season's per-player history, in the shared Ledger row shape. */
export function seasonHitterRows(season) {
  if (!season) return []
  return season.hitters
    .slice()
    .sort((a, b) => b.td - a.td)
    .map((h) => ({
      id: h.id,
      name: h.name,
      team: h.team,
      value: h.td,
      status: h.calledWeeks > 0 ? 'called' : h.boardWeeks > 0 ? 'board' : 'off',
      statusLabel: h.calledWeeks > 0
        ? `${h.calledWeeks} called week${h.calledWeeks === 1 ? '' : 's'}`
        : h.boardWeeks > 0 ? `${h.boardWeeks} on board` : 'off board',
      score: h.avgScoreN ? Math.round(h.avgScoreSum / h.avgScoreN) : undefined,
      detail: `${h.weeks} wk`,
      last: weekKey(season.seasonYear, 'week', h.lastWeek),
      _raw: { player_id: h.id, player_name: h.name, name: h.name, team: h.team },
    }))
}
